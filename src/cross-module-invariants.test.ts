/**
 * Cross-module invariants.
 *
 * Each case pins a behaviour that several modules have to agree on — the NHX
 * dialect the parser accepts, the ids a document mints, how a lane is packed,
 * how a session round-trips, how a family filter is scoped. They are grouped
 * here because no single unit test can see the seam between two of those layers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseNewick } from "./parser/newick";
import { parseNhxReconciliation } from "./parser/nhx";
import { parseRecPhyloXML } from "./parser/recphyloxml";
import { assignStableGeneIds, hashStr } from "./model/stableId";
import { useStore } from "./state/store";
import { sessionDataOfStore } from "./state/autosave";
import { parseSession, serializeSession } from "./session";
import { packLanes } from "./layout/geneEmbed";
import { networkEdgeWidth } from "./render/geometry";
import { scopeFamilyFilter } from "./app/hooks";
import type { GeneNode, Reconciliation } from "./model/types";

// ---------------------------------------------------------------------------
// NHX comment parsing must not truncate values at a colon
// ---------------------------------------------------------------------------
describe("NHX comment values", () => {
  it("keeps a colon that belongs to the value", () => {
    const [tree] = parseNewick("(a[&&NHX:S=Candida sp. JH-1:2],b[&&NHX:S=SpA])R[&&NHX:S=Root];");
    const a = tree.children[0];
    expect(a.nhx.S).toBe("Candida sp. JH-1:2");
    expect(tree.children[1].nhx.S).toBe("SpA");
  });

  it("still splits real pairs, including percent-encoded colons", () => {
    const [tree] = parseNewick("a[&&NHX:S=Sp%3Aone:D=Y:L=Y];");
    expect(tree.nhx.S).toBe("Sp:one");
    expect(tree.nhx.D).toBe("Y");
    expect(tree.nhx.L).toBe("Y");
  });

  it("reports a comment fragment that carries no key instead of dropping it", () => {
    // `oops` names no key, so whatever it meant is not in the model: say so.
    const recon = parseNhxReconciliation("(a[&&NHX:oops:S=SpA],b[&&NHX:S=SpB])R[&&NHX:S=Root];");
    expect(recon.warnings.some((w) => w.includes("no key") && w.includes("oops"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// the structural fallback must be visible, not silent
// ---------------------------------------------------------------------------
describe("NHX dialect reporting", () => {
  it("says so when a file cannot express losses or transfers at all", () => {
    const recon = parseNhxReconciliation("(a[&&NHX:S=SpA],b[&&NHX:S=SpB])R[&&NHX:S=Root];");
    expect(
      recon.warnings.some((w) => w.includes("no event markers at all")),
    ).toBe(true);
  });

  it("names the missing markers when only D= is present", () => {
    const recon = parseNhxReconciliation(
      "(a[&&NHX:S=SpA],b[&&NHX:S=SpB])R[&&NHX:S=Root:D=Y];",
    );
    const w = recon.warnings.filter((x) => x.includes("no L=, BO=, BC= or TB= markers"));
    expect(w).toHaveLength(1);
  });

  it("stays quiet for a fully annotated dialect", () => {
    const recon = parseNhxReconciliation(
      "(a[&&NHX:S=SpA:L=Y],b[&&NHX:S=SpB])R[&&NHX:S=Root:D=Y];",
    );
    expect(recon.warnings.some((w) => w.includes("markers"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recPhyloXML event recognition and self-conflict
// ---------------------------------------------------------------------------
const speciesAndGenes = (
  geneBody: string,
) => `<recPhylo xmlns="http://www.recsyswiki.gac.edu.au/recPhyloXML/schema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<spTree><phylogeny rooted="true"><clade><name>Root</name><clade><name>SpA</name></clade><clade><name>SpB</name></clade></clade></phylogeny></spTree>
<recGeneTree><phylogeny rooted="true"><clade><name>g0</name><eventsRec><speciation speciesLocation="Root"/></eventsRec>
${geneBody}</clade></phylogeny></recGeneTree></recPhylo>`;

describe("recPhyloXML events", () => {
  it("warns about an unrecognised event element", () => {
    const recon = parseRecPhyloXML(
      speciesAndGenes(
        '<clade><name>g1</name><eventsRec><loss speciesLocation="SpA"/></eventsRec></clade>' +
          '<clade><name>g2</name><eventsRec><infection speciesLocation="SpB"/></eventsRec></clade>',
      ),
    );
    expect(
      recon.warnings.some((w) => w.includes('unrecognised <eventsRec> child "infection"')),
    ).toBe(true);
  });

  it("suggests the right name for a case mistake rather than losing the event", () => {
    const recon = parseRecPhyloXML(
      speciesAndGenes(
        '<clade><name>g1</name><eventsRec><Loss speciesLocation="SpA"/></eventsRec></clade>' +
          '<clade><name>g2</name><eventsRec><leaf speciesLocation="SpB"/></eventsRec></clade>',
      ),
    );
    expect(recon.warnings.some((w) => w.includes('case-sensitive; did you mean "loss"'))).toBe(true);
  });

  it("reports when transferBack and the terminal event disagree on the arrival species", () => {
    const recon = parseRecPhyloXML(
      speciesAndGenes(
        '<clade><name>g1</name><eventsRec><transferBack destinationSpecies="SpA"/><leaf speciesLocation="SpB"/></eventsRec></clade>' +
          '<clade><name>g2</name><eventsRec><leaf speciesLocation="SpB"/></eventsRec></clade>',
      ),
    );
    expect(
      recon.warnings.some((w) => w.includes("conflicting arrival species")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// zero-height intervals must not each consume a lane
// ---------------------------------------------------------------------------
describe("lane packing", () => {
  /**
   * Ground truth for "minimum number of lanes": the two segments cannot share a
   * lane when they overlap, or when a zero-height segment sits exactly on the
   * coordinate where the other is drawn. Greedy first-fit must use as many lanes
   * as the largest mutually-conflicting group (interval graphs are perfect), so
   * the count below is the optimum, computed by brute force over the cases.
   */
  function minLanes(ivs: Array<{ start: number; end: number }>): number {
    const EPS = 1e-6;
    const point = (iv: { start: number; end: number }) => iv.end - iv.start <= EPS;
    const clash = (a: { start: number; end: number }, b: { start: number; end: number }) => {
      const lo = Math.max(a.start, b.start);
      const hi = Math.min(a.end, b.end);
      if (lo < hi - EPS) return true; // shared interior
      if (Math.abs(lo - hi) <= EPS) {
        // they meet at a single coordinate: only a zero-height segment is drawn there
        return point(a) || point(b);
      }
      return false;
    };
    let best = 1;
    for (let mask = 1; mask < 1 << ivs.length; mask++) {
      const pick: number[] = [];
      for (let i = 0; i < ivs.length; i++) if (mask & (1 << i)) pick.push(i);
      let clique = true;
      for (let x = 0; x < pick.length && clique; x++) {
        for (let y = x + 1; y < pick.length; y++) {
          if (!clash(ivs[pick[x] as number], ivs[pick[y] as number])) {
            clique = false;
            break;
          }
        }
      }
      if (clique) best = Math.max(best, pick.length);
    }
    return best;
  }

  const cases: Array<[string, Array<{ start: number; end: number }>] > = [
    ["disjoint intervals share one lane", [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]],
    ["nested intervals need their own lanes", [{ start: 0, end: 9 }, { start: 1, end: 8 }, { start: 2, end: 7 }]],
    ["a point away from any occupied coordinate reuses the lane", [{ start: 0, end: 1 }, { start: 3, end: 3 }]],
    ["a point on a drawn coordinate takes a second lane", [{ start: 0, end: 1 }, { start: 1, end: 1 }]],
    ["a speciation-to-leaf chain in one species", [{ start: 0, end: 2 }, { start: 2, end: 2 }, { start: 2, end: 5 }]],
    ["the whole tube from a cross-species arrival", [{ start: 0, end: 6 }, { start: 0, end: 0 }, { start: 6, end: 6 }]],
  ];

  for (const [name, ivs] of cases) {
    it(name, () => {
      const { count } = packLanes(ivs);
      expect(count).toBe(minLanes(ivs));
    });
  }

  it("never spends more lanes than there are edges", () => {
    const ivs = [{ start: 0, end: 4 }, { start: 1, end: 1 }, { start: 2, end: 2 }];
    const { count, lanes } = packLanes(ivs);
    expect(count).toBeLessThanOrEqual(ivs.length);
    expect(new Set(lanes).size).toBeLessThanOrEqual(count);
  });
});

// ---------------------------------------------------------------------------
// a 32-bit id collision must not overwrite another node's geometry
// ---------------------------------------------------------------------------
describe("stable node ids", () => {
  it("disambiguates two DIFFERENT signatures that hash to the same value", () => {
    // Verified collision of the shipped FNV-1a 32-bit hash:
    const a = "|ns|g:0:speciation:sp436q:g27766::()";
    const b = "|ns|g:0:speciation:sp706qqqq:g41701rr::()";
    expect(hashStr(a)).toBe(hashStr(b));

    const ns = "|ns";
    const nodes = [
      { id: "", name: "g27766", speciesId: "sp436q", treeIndex: 0, endEvent: { type: "speciation" as const }, children: [] },
      { id: "", name: "g41701rr", speciesId: "sp706qqqq", treeIndex: 0, endEvent: { type: "speciation" as const }, children: [] },
    ];
    assignStableGeneIds(nodes as unknown as GeneNode[], ns);
    expect(nodes[0].id).not.toBe(nodes[1].id);
    // Deterministic: the same content always yields the same pair of ids.
    const again = [
      { id: "", name: "g27766", speciesId: "sp436q", treeIndex: 0, endEvent: { type: "speciation" as const }, children: [] },
      { id: "", name: "g41701rr", speciesId: "sp706qqqq", treeIndex: 0, endEvent: { type: "speciation" as const }, children: [] },
    ];
    assignStableGeneIds(again as unknown as GeneNode[], ns);
    expect(again.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
  });
});

// ---------------------------------------------------------------------------
// the network encodes the integer transfer count
// ---------------------------------------------------------------------------
describe("transfer-network edge width", () => {
  it("is a step function of the count, not of the busiest pair", () => {
    expect(networkEdgeWidth(1)).toBe(1);
    expect(networkEdgeWidth(2)).toBe(2);
    expect(networkEdgeWidth(5)).toBe(5);
    expect(networkEdgeWidth(6)).toBe(6);
    expect(networkEdgeWidth(500)).toBe(6);
    // The same pair must keep its width whatever else is on the graph.
    expect(networkEdgeWidth(3)).toBe(networkEdgeWidth(3));
  });
});

// ---------------------------------------------------------------------------
// a family selection is scoped to the document it came from
// ---------------------------------------------------------------------------
describe("family filter scoping", () => {
  const doc = (names: (string | undefined)[]): Reconciliation =>
    ({
      geneTrees: names.map((name, index) => ({ index, name })),
    }) as unknown as Reconciliation;

  it("carries a selection over by family name", () => {
    const from = doc(["symbiont", "host"]);
    const to = doc(["host", "symbiont"]);
    expect(scopeFamilyFilter(new Set([0]), from, to)).toEqual(new Set([1]));
  });

  it("constrains nothing when no family name carries over", () => {
    const from = doc(["only-in-primary"]);
    const to = doc(["nested-level"]);
    expect(scopeFamilyFilter(new Set([0]), from, to)).toBeNull();
  });

  it("leaves an unset filter unset", () => {
    expect(scopeFamilyFilter(null, doc(["a"]), doc(["a"]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// removing a layer is undoable, and the rescue session
// carries the whole workspace
// ---------------------------------------------------------------------------
const NHX = "(Human[&&NHX:S=Human],Mouse[&&NHX:S=Mouse])Root[&&NHX:S=Root];";
const XML = `<recPhylo><spTree><phylogeny rooted="true"><clade><name>Root</name>
<clade><name>Human</name></clade><clade><name>Mouse</name></clade></clade></phylogeny></spTree>
<recGeneTree><phylogeny rooted="true"><clade><name>g0</name>
<eventsRec><speciation speciesLocation="Root"/></eventsRec>
<clade><name>g1</name><eventsRec><leaf speciesLocation="Human" geneName="g1"/></eventsRec></clade>
<clade><name>g2</name><eventsRec><leaf speciesLocation="Mouse" geneName="g2"/></eventsRec></clade>
</clade></phylogeny></recGeneTree></recPhylo>`;

describe("workspace history and recovery", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    localStorage.clear();
    useStore.setState({
      xml: null, fileName: null, recon: null, error: null, warnings: [],
      nested: null, nestedName: null, nestedXml: null, nestedError: null,
      compare: null, compareName: null, compareXml: null, compareError: null,
      swapped: new Set(), nestedSwapped: new Set(), collapsed: new Set(),
      geneColors: {}, annotations: {}, annotating: null,
      sampleId: null, searchQuery: "", searchRegex: false, onlyMatches: false,
      eventFilter: { speciation: true, duplication: true, loss: true, transfer: true, leaf: true },
      familyFilter: null, confidenceMin: 0, confidenceMax: 1, locate: null,
      past: [], future: [], pendingMulti: null,
      tabs: [{ id: "tab-1", title: "a" }], activeTabId: "tab-1", docs: {}, lazyDoc: null,
    });
  });

  it("undoing a removed nested layer brings the layer and its text back", () => {
    const st = useStore.getState();
    st.loadXml(XML, "a.xml");
    st.loadNestedXml(NHX, "host.nhx");
    const before = useStore.getState().past.length;
    useStore.getState().clearNested();
    expect(useStore.getState().nested).toBeNull();
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect(useStore.getState().nested).not.toBeNull();
    expect(useStore.getState().nestedXml).toBe(NHX);
  });

  it("undoing a removed compare layer brings it back", () => {
    useStore.getState().loadXml(XML, "a.xml");
    useStore.getState().loadCompareXml(XML, "b.xml");
    const before = useStore.getState().past.length;
    useStore.getState().clearCompare();
    expect(useStore.getState().compare).toBeNull();
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect(useStore.getState().compare).not.toBeNull();
  });

  it("the rescue session serializes every tab and the merged source files", () => {
    const st = useStore.getState();
    st.loadXml(XML, "a.xml");
    st.loadNestedXml(NHX, "host.nhx");
    // nested and compare are mutually exclusive, so the compare layer is the
    // one that survives here; both are separate fields of the session.
    st.loadCompareXml(XML, "b.xml");
    expect(useStore.getState().nested).toBeNull();
    useStore.setState({ sourceFiles: [{ name: "a.xml", text: XML }, { name: "c.xml", text: XML }] });
    const data = sessionDataOfStore();
    expect(data).not.toBeNull();
    expect(data?.sourceFiles).toHaveLength(2);
    expect(data?.compareXml).toBe(XML);
    expect(data?.compareName).toBe("b.xml");
    // Search & filter criteria are part of the drawing, so they survive too.
    expect(data).toHaveProperty("searchQuery");
    expect(data).toHaveProperty("activeTabIndex");
    // Round-trip: what recovery writes, the loader must accept unchanged.
    const back = parseSession(serializeSession(data!));
    expect(back.sourceFiles).toHaveLength(2);
    expect(back.compareName).toBe("b.xml");
  });
});
