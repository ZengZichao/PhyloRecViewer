import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layout, spPos } from "../layout";
import { optimizeCrossings } from "../layout/optimize";
import { parseRecPhyloXML } from "./recphyloxml";

// The fixture is vendored into the project (see __fixtures__), so the suite runs
// from a checkout of this repository alone, with no sibling project present.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "__fixtures__/9999.nhx.xml");

describe("parseRecPhyloXML on the 9999.nhx.xml fixture", () => {
  const xml = readFileSync(FIXTURE, "utf8");
  const recon = parseRecPhyloXML(xml);

  it("parses the species tree", () => {
    expect(recon.species.root.name).toBe("124");
    expect(recon.species.byName.has("Homo.sapiens")).toBe(true);
    // 63 extant species (opisthokont sampling: yeast -> vertebrates); internal
    // nodes carry numeric labels, so total node count exceeds the leaf count.
    const leaves = recon.species.nodes.filter((n) => n.children.length === 0);
    expect(leaves.length).toBe(63);
  });

  it("parses a reconciled gene tree with events", () => {
    expect(recon.geneTrees.length).toBe(1);
    const gt = recon.geneTrees[0];
    expect(gt.root.name).toBe("22");
    expect(gt.root.endEvent.type).toBe("speciation");
    expect(gt.root.endEvent.speciesLocation).toBe("101");
    // 23 gene nodes in total, and no transfers in this fixture.
    expect(gt.nodes.length).toBe(23);
    expect(gt.nodes.some((n) => n.events.some((e) => e.type === "transferBack"))).toBe(false);

    const types = new Set(gt.nodes.map((n) => n.endEvent.type));
    expect(types.has("duplication")).toBe(true);
    expect(types.has("loss")).toBe(true);
    expect(types.has("leaf")).toBe(true);
    expect(types.has("speciation")).toBe(true);
  });

  it("produces a finite layout with coordinates for every node", () => {
    const res = layout(recon);
    expect(Number.isFinite(res.width)).toBe(true);
    expect(Number.isFinite(res.height)).toBe(true);
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
    for (const s of recon.species.nodes) {
      const p = spPos(res.positions, s.id);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.width).toBeGreaterThan(0);
    }
    for (const g of recon.geneTrees[0].nodes) {
      // gnPos lazily creates {x:0,y:0} for a missing id, so Number.isFinite
      // alone is always true even if the layout produced no gene coordinates.
      // Assert the entry actually exists first.
      expect(res.positions.gene.has(g.id)).toBe(true);
      const p = res.positions.gene.get(g.id)!;
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("never writes geometry back onto the model nodes", () => {
    const res = layout(recon);
    const s = recon.species.nodes[0] as unknown as Record<string, unknown>;
    expect("x" in s).toBe(false);
    expect("width" in s).toBe(false);
    const g = recon.geneTrees[0].nodes[0] as unknown as Record<string, unknown>;
    expect("y" in g).toBe(false);
    expect("lane" in g).toBe(false);
    // Every node has exactly one geometry record in the result.
    expect(res.positions.species.size).toBe(recon.species.nodes.length);
  });

  it("lays a single reconciliation out two independent ways", () => {
    const a = layout(recon, { levelHeight: 90 });
    const b = layout(recon, { levelHeight: 180 });
    const leaf = recon.species.nodes.find((n) => n.children.length === 0)!;
    // Independent snapshots: taller levels push tips further down. If layout
    // wrote back into the model, both results would share the last value.
    expect(spPos(b.positions, leaf.id).y).toBeGreaterThan(
      spPos(a.positions, leaf.id).y,
    );
  });
});

describe("transfer handling", () => {
  const xml = `<recPhylo>
    <spTree><phylogeny><clade><name>root</name>
      <clade><name>A</name></clade>
      <clade><name>B</name></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true">
      <clade><name>g0</name>
        <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
        <clade><name>g1</name>
          <eventsRec><leaf speciesLocation="A" geneName="gA"/></eventsRec>
        </clade>
        <clade><name>g2</name>
          <eventsRec>
            <transferBack destinationSpecies="B"/>
            <leaf speciesLocation="B" geneName="gB"/>
          </eventsRec>
        </clade>
      </clade>
    </phylogeny></recGeneTree>
  </recPhylo>`;

  it("detects one transfer edge from donor to arrival", () => {
    const recon = parseRecPhyloXML(xml);
    const res = layout(recon);
    expect(res.transfers.length).toBe(1);
    const t = res.transfers[0];
    expect(t.from.name).toBe("g0");
    expect(t.to.name).toBe("g2");
    expect(t.to.speciesId).toBe("B");
  });
});

describe("error handling", () => {
  it("throws on non-recPhylo XML", () => {
    expect(() => parseRecPhyloXML("<foo/>")).toThrow(/recPhylo/);
  });
});

describe("malformed-input tolerance", () => {
  const spTree = `<spTree><phylogeny><clade><name>root</name>
      <clade><name>A</name></clade>
      <clade><name>B</name></clade>
    </clade></phylogeny></spTree>`;

  it("warns and keeps one end event when a node carries several", () => {
    const xml = `<recPhylo>${spTree}
      <recGeneTree><phylogeny rooted="true">
        <clade><name>bad</name>
          <eventsRec>
            <speciation speciesLocation="A"/>
            <duplication speciesLocation="A"/>
          </eventsRec>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    const node = recon.geneTrees[0].nodes[0];
    // Exactly one end event survives, and the ambiguity is surfaced.
    expect(node.events.filter((e) => e.type !== "transferBack").length).toBe(1);
    expect(node.endEvent.type).toBe("speciation");
    expect(recon.warnings.some((w) => w.includes("multiple terminal events"))).toBe(true);
  });

  it("warns when a clade carries several eventsRec blocks", () => {
    const xml = `<recPhylo>${spTree}
      <recGeneTree><phylogeny rooted="true">
        <clade><name>doubled</name>
          <eventsRec><leaf speciesLocation="A" geneName="x1"/></eventsRec>
          <eventsRec><loss speciesLocation="B"/></eventsRec>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    expect(recon.warnings.some((w) => w.includes("<eventsRec> blocks"))).toBe(true);
    expect(recon.geneTrees[0].nodes[0].endEvent.type).toBe("leaf");
  });

  it("keeps the synthesized leaf of an eventsRec-less node inside events", () => {
    const xml = `<recPhylo>${spTree}
      <recGeneTree><phylogeny rooted="true">
        <clade><name>empty</name><eventsRec></eventsRec></clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    const node = recon.geneTrees[0].nodes[0];
    expect(node.endEvent.type).toBe("leaf");
    expect(node.events).toHaveLength(1);
    expect(node.events[node.events.length - 1]).toBe(node.endEvent);
  });
});

describe("parseMerged", () => {
  it("keeps warnings from every merged file", async () => {
    const { parseMerged } = await import("./formats");
    const mk = (leaf: string) => `<recPhylo>
      <spTree><phylogeny><clade><name>root</name>
        <clade><name>A</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade><name>g</name><eventsRec><leaf speciesLocation="${leaf}" geneName="x"/></eventsRec></clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    // File 2 references species Z, absent from file 1's species tree -> warning.
    const merged = parseMerged([
      { name: "one.recphyloxml", text: mk("A") },
      { name: "two.recphyloxml", text: mk("Z") },
    ]);
    expect(merged.warnings.some((w) => w.startsWith("two.recphyloxml:"))).toBe(true);
    expect(merged.geneTrees.length).toBe(2);
  });
});

describe("attribute-less terminal events", () => {
  // fast-xml-parser yields the empty string "" for <tag/> / <tag></tag>; a
  // truthiness test on the parsed value would DROP the event, and a
  // schema-conformant document would lose every attribute-less annotation.
  const spTree = `<spTree><phylogeny rooted="true"><clade><name>root</name>
      <clade><name>A</name></clade>
      <clade><name>B</name></clade>
    </clade></phylogeny></spTree>`;
  const geneWith = (eventsRec: string) => `<recPhylo>${spTree}
      <recGeneTree><phylogeny rooted="true">
        <clade><name>n1</name><eventsRec>${eventsRec}</eventsRec></clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;

  const cases: [string, string][] = [
    ["<bifurcationOut/>", "bifurcationOut"],
    ["<bifurcationOut></bifurcationOut>", "bifurcationOut"],
    ["<speciation/>", "speciation"],
    ["<loss/>", "loss"],
    ["<duplication/>", "duplication"],
    ["<branchingOut/>", "branchingOut"],
    ['<duplication timeSlice="2"/>', "duplication"],
    ['<leaf geneName="x"/>', "leaf"],
  ];
  for (const [xml, expected] of cases) {
    it(`keeps ${xml}`, () => {
      const recon = parseRecPhyloXML(geneWith(xml));
      const node = recon.geneTrees[0].nodes[0];
      expect(node.endEvent.type).toBe(expected);
      expect(node.events.filter((e) => e.type !== "transferBack")).toHaveLength(1);
      // A dropped event would surface as a synthesized leaf + this warning.
      expect(
        recon.warnings.some((w) => w.includes("no terminal event")),
      ).toBe(false);
    });
  }

  it("survives the XSD-mandated form of bifurcationOut (no speciesLocation at all)", () => {
    // BifurcationOutRec declares no speciesLocation attribute in
    // recGeneTreeXML.xsd - the self-closing, attribute-less form is the ONLY
    // conformant form, and it must yield a bifurcationOut, not a leaf.
    const recon = parseRecPhyloXML(geneWith("<bifurcationOut/>"));
    const node = recon.geneTrees[0].nodes[0];
    expect(node.endEvent.type).toBe("bifurcationOut");
    expect(node.speciesId).toBe("");
  });
});

describe("branch_length as child element", () => {
  const xml = `<recPhylo>
    <spTree><phylogeny rooted="true"><clade><name>root</name>
      <clade><name>A</name><branch_length>1.25</branch_length></clade>
      <clade><name>B</name><branch_length>2</branch_length></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true">
      <clade><name>g</name>
        <branch_length>0.42</branch_length>
        <eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec>
        <clade><name>kid</name><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
      </clade>
    </phylogeny></recGeneTree>
  </recPhylo>`;

  it("reads element-form branch lengths on species and gene nodes", () => {
    const recon = parseRecPhyloXML(xml);
    const spA = recon.species.byName.get("A")!;
    const spB = recon.species.byName.get("B")!;
    expect(spA.branchLength).toBe(1.25);
    expect(spB.branchLength).toBe(2);
    expect(recon.geneTrees[0].root.branchLength).toBe(0.42);
  });

  it("keeps the attribute form working and lets it win when both are given", () => {
    const both = `<recPhylo>
      <spTree><phylogeny rooted="true"><clade><name>root</name>
        <clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade branch_length="0.7"><name>g</name>
          <eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec>
          <clade branch_length="0.9"><branch_length>9.9</branch_length><name>h</name>
            <eventsRec><loss speciesLocation="B"/></eventsRec>
          </clade>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(both);
    expect(recon.geneTrees[0].root.branchLength).toBe(0.7);
    // The XSD discourages using both forms together; the attribute is kept.
    expect(recon.geneTrees[0].nodes[1].branchLength).toBe(0.9);
  });
});

describe("rooted attribute", () => {
  const wrap = (spPhy: string, genePhy: string) => `<recPhylo>
    <spTree>${spPhy}</spTree>
    <recGeneTree>${genePhy}</recGeneTree>
  </recPhylo>`;
  const spBody = `<clade><name>root</name><clade><name>A</name></clade></clade>`;
  const geneBody = `<clade><name>g</name><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>`;

  it("refuses rooted=\"false\" on the species tree with an actionable error", () => {
    expect(() =>
      parseRecPhyloXML(wrap(`<phylogeny rooted="false">${spBody}</phylogeny>`, `<phylogeny rooted="true">${geneBody}</phylogeny>`)),
    ).toThrow(/rooted="false"/);
  });

  it("refuses rooted=\"false\" on a gene tree", () => {
    expect(() =>
      parseRecPhyloXML(wrap(`<phylogeny rooted="true">${spBody}</phylogeny>`, `<phylogeny rooted="false">${geneBody}</phylogeny>`)),
    ).toThrow(/rooted="false"/);
  });

  it("warns (but does not crash) when rooted is absent", () => {
    const recon = parseRecPhyloXML(wrap(`<phylogeny>${spBody}</phylogeny>`, `<phylogeny>${geneBody}</phylogeny>`));
    expect(recon.warnings.some((w) => w.includes('omits the schema-required rooted="true"'))).toBe(true);
    expect(recon.geneTrees).toHaveLength(1);
  });

  it("stays silent when every phylogeny declares rooted=\"true\"", () => {
    const recon = parseRecPhyloXML(
      wrap(`<phylogeny rooted="true">${spBody}</phylogeny>`, `<phylogeny rooted="true">${geneBody}</phylogeny>`),
    );
    expect(recon.warnings.some((w) => w.includes("rooted"))).toBe(false);
  });
});

describe("root element case variants", () => {
  const body = `<spTree><phylogeny rooted="true"><clade><name>root</name>
      <clade><name>A</name></clade></clade></phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true">
      <clade><name>g</name><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
    </phylogeny></recGeneTree>`;

  for (const root of ["recPhylo", "recphylo", "RecPhylo", "recPHylo"]) {
    it(`accepts <${root}>`, () => {
      const recon = parseRecPhyloXML(`<${root}>${body}</${root}>`);
      expect(recon.geneTrees).toHaveLength(1);
    });
  }

  it("accepts the <recPhyloXML> / <recphyloxml> wrapper around <recPhylo>", () => {
    for (const w of ["recPhyloXML", "recphyloxml", "RECphyloxml"]) {
      const recon = parseRecPhyloXML(`<${w}><recPhylo>${body}</recPhylo></${w}>`);
      expect(recon.geneTrees).toHaveLength(1);
    }
  });

  it("accepts a <recphyloxml> wrapper that carries the body directly", () => {
    const recon = parseRecPhyloXML(`<recphyloxml>${body}</recphyloxml>`);
    expect(recon.geneTrees).toHaveLength(1);
  });

  it("points users at the supported formats when no root element exists", () => {
    let msg = "";
    try {
      parseRecPhyloXML("<html><body>hi</body></html>");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/does not look like recPhyloXML/);
    expect(msg).toMatch(/Newick|NHX/);
  });

  it("finds the root behind an XML declaration and comment prologue", () => {
    const recon = parseRecPhyloXML(`<?xml version="1.0"?><!--c--><recPhylo>${body}</recPhylo>`);
    expect(recon.geneTrees).toHaveLength(1);
  });
});

describe("intermediary events and unread elements are reported", () => {
  const spTree = `<spTree><phylogeny rooted="true"><clade><name>root</name>
      <clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>`;

  it("warns when one node carries several transferBack arrivals", () => {
    const xml = `<recPhylo>${spTree}
      <recGeneTree><phylogeny rooted="true">
        <clade><name>g</name>
          <eventsRec>
            <transferBack destinationSpecies="B"/>
            <transferBack destinationSpecies="A"/>
            <leaf speciesLocation="B" geneName="x"/>
          </eventsRec>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    expect(
      recon.warnings.some((w) => w.includes("2 <transferBack> arrivals")),
    ).toBe(true);
    // The first arrival remains the fallback host for species resolution.
    const node = recon.geneTrees[0].nodes[0];
    expect(node.speciesId).toBe("B");
    expect(node.events.filter((e) => e.type === "transferBack")).toHaveLength(2);
  });

  it("warns when the species tree carries several phylogeny elements", () => {
    const xml = `<recPhylo>
      <spTree>
        <phylogeny rooted="true"><clade><name>root</name></clade></phylogeny>
        <phylogeny rooted="true"><clade><name>second</name></clade></phylogeny>
      </spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade><name>g</name><eventsRec><leaf speciesLocation="root" geneName="x"/></eventsRec></clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    expect(recon.warnings.some((w) => w.includes("<phylogeny> elements"))).toBe(true);
    expect(recon.species.byName.has("second")).toBe(false);
  });

  it("warns when the species tree has several root clades", () => {
    const xml = `<recPhylo>
      <spTree><phylogeny rooted="true">
        <clade><name>root</name></clade>
        <clade><name>Orphan</name></clade>
      </phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade><name>g</name><eventsRec><leaf speciesLocation="Orphan"/></eventsRec></clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    expect(recon.warnings.some((w) => w.includes("root <clade> elements"))).toBe(true);
    // The dropped clade also surfaces through the unknown-species reference.
    expect(recon.warnings.some((w) => w.includes('unknown species "Orphan"'))).toBe(true);
  });
});

describe("schema-conformant minimal fixture", () => {
  const xml = readFileSync(resolve(HERE, "__fixtures__/conformant-minimal.recphyloxml"), "utf8");
  const recon = parseRecPhyloXML(xml);

  it("parses every attribute-less event with the right type", () => {
    const gt = recon.geneTrees[0];
    const byName = (n: string) => gt.nodes.find((x) => x.name === n)!;
    expect(byName("root").endEvent.type).toBe("speciation");
    expect(byName("dup").endEvent.type).toBe("duplication");
    expect(byName("bco").endEvent.type).toBe("bifurcationOut");
    expect(byName("bo").endEvent.type).toBe("branchingOut");
    const types = gt.nodes.map((n) => n.endEvent.type);
    expect(types).toContain("loss");
    expect(types.filter((t) => t === "leaf")).toHaveLength(4);
    // A loss node has no name and no children but must NOT be a leaf.
    expect(gt.nodes.filter((n) => n.endEvent.type === "loss")).toHaveLength(1);
    expect(recon.warnings.some((w) => w.includes("no terminal event"))).toBe(false);
  });

  it("reads element-form branch lengths", () => {
    expect(recon.geneTrees[0].root.branchLength).toBe(0.42);
    expect(recon.species.byName.get("A")!.branchLength).toBe(1.2);
    expect(recon.species.byName.get("B")!.branchLength).toBe(0.8);
  });

  it("raises no rooted warnings", () => {
    expect(recon.warnings.filter((w) => w.includes("rooted"))).toEqual([]);
  });

  it("lays out with a coordinate for every node", () => {
    const res = layout(recon);
    let gene = 0;
    for (const t of recon.geneTrees) gene += t.nodes.length;
    expect(res.positions.gene.size).toBe(gene);
    expect(res.positions.species.size).toBe(recon.species.nodes.length);
  });
});

describe("crossing optimizer", () => {
  // Transfer A -> C where C is the far child of M; mirroring a subtree brings
  // donor and recipient closer, so the optimizer must pick a non-empty swap.
  const xml = `<recPhylo>
    <spTree><phylogeny><clade><name>root</name>
      <clade><name>A</name></clade>
      <clade><name>M</name>
        <clade><name>B</name></clade>
        <clade><name>C</name></clade>
      </clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true">
      <clade><name>g0</name>
        <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
        <clade><name>gk</name>
          <eventsRec><leaf speciesLocation="A" geneName="gk"/></eventsRec>
        </clade>
        <clade><name>gt</name>
          <eventsRec><transferBack destinationSpecies="C"/><leaf speciesLocation="C" geneName="gt"/></eventsRec>
        </clade>
      </clade>
    </phylogeny></recGeneTree>
  </recPhylo>`;

  it("chooses a swap that shortens the transfer and lays out cleanly", () => {
    const recon = parseRecPhyloXML(xml);
    const swapped = optimizeCrossings(recon);
    expect(swapped.size).toBeGreaterThan(0);
    // The chosen swaps must produce a finite layout.
    const res = layout(recon, undefined, swapped);
    expect(Number.isFinite(res.width)).toBe(true);
    expect(res.transfers.length).toBe(1);
  });
});
