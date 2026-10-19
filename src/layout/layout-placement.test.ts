import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { transferArc } from "../render/geometry";
import { layout, defaultLayoutOptions } from "./index";
import type { LayoutOptions } from "./options";

/**
 * Placement tests for unlocatable and overcrowded gene nodes, and for
 * branch-length mode applied to a document with no branch lengths.
 */

const run = (recon: ReturnType<typeof parseRecPhyloXML>, opts?: Partial<LayoutOptions>) =>
  layout(recon, { ...defaultLayoutOptions, ...opts }, new Set<string>(), new Set<string>(), true);

const SP2 = `<spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>`;
const wrap = (gene: string, sp = SP2) => parseRecPhyloXML(`<recPhylo>${sp}<recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>${gene}</clade></phylogeny></recGeneTree></recPhylo>`);

const leaf = (sp: string, name: string) =>
  `<clade><eventsRec><leaf speciesLocation="${sp}" geneName="${name}"/></eventsRec></clade>`;

const minPairwiseDistance = (pts: { x: number; y: number }[]): number => {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      best = Math.min(best, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
  }
  return best;
};

describe("gene nodes whose species cannot be resolved", () => {
  it("does not stack all unresolvable siblings on one coordinate", () => {
    const recon = wrap(leaf("MARS", "m1") + leaf("VENUS", "m2") + leaf("PLUTO", "m3"));
    const res = run(recon);
    const pts = recon.geneTrees[0].nodes
      .filter((n) => res.unplacedGeneIds.has(n.id))
      .map((n) => res.positions.gene.get(n.id)!);
    expect(pts).toHaveLength(3);
    // They share one fallback y, so the per-parent x spread is what keeps them
    // on three distinct points rather than stacked on top of each other.
    expect(new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(3);
    expect(minPairwiseDistance(pts)).toBeGreaterThanOrEqual(3);
  });

  it("collects exactly the unresolvable nodes and none of the resolved ones", () => {
    const recon = wrap(leaf("A", "ok") + leaf("MARS", "bad"));
    const res = run(recon);
    const bad = recon.geneTrees[0].nodes.filter((n) => n.speciesId === "MARS");
    const ok = recon.geneTrees[0].nodes.filter((n) => n.speciesId === "A" || n.speciesId === "R");
    expect([...res.unplacedGeneIds].sort()).toEqual(bad.map((n) => n.id).sort());
    for (const n of ok) expect(res.unplacedGeneIds.has(n.id)).toBe(false);
  });
});

describe("branch-length mode without branch lengths", () => {
  const THREE_LEVEL = `<recPhylo><spTree><phylogeny><clade><name>R</name>
      <clade><name>A</name><clade><name>A1</name></clade><clade><name>A2</name></clade></clade>
      <clade><name>B</name></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
      ${leaf("A1", "x")}${leaf("A2", "y")}${leaf("B", "z")}
    </clade></phylogeny></recGeneTree></recPhylo>`;

  it("keeps the depth-mode row count when the document has no lengths at all", () => {
    const recon = parseRecPhyloXML(THREE_LEVEL);
    expect(recon.species.nodes.some((n) => (n.branchLength ?? 0) > 0)).toBe(false);
    const depthRows = new Set([...run(recon).positions.species.values()].map((p) => p.y));
    const branchRows = new Set([...run(recon, { useBranchLengths: true }).positions.species.values()].map((p) => p.y));
    // R / A / A1-A2 is three levels; alignTips puts leaves on one baseline.
    expect(depthRows.size).toBeGreaterThan(1);
    expect(branchRows.size).toBe(depthRows.size);
  });

  it("exposes the depth-mode fallback through LayoutResult.branchLengthMode", () => {
    const recon = parseRecPhyloXML(THREE_LEVEL);
    expect(run(recon, { useBranchLengths: true }).branchLengthMode).toBe(false);
    expect(run(recon).branchLengthMode).toBe(false);
  });

  it("honours real branch lengths when they exist", () => {
    const withLengths = `<recPhylo><spTree><phylogeny><clade branch_length="1"><name>R</name>
        <clade branch_length="5"><name>A</name></clade>
        <clade branch_length="0.5"><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
        ${leaf("A", "x")}${leaf("B", "y")}
      </clade></phylogeny></recGeneTree></recPhylo>`;
    // alignTips is off so the two leaves keep their own cumulative depths: with
    // the baseline alignment on they would legitimately share a row.
    const res = run(parseRecPhyloXML(withLengths), { useBranchLengths: true, alignTips: false });
    expect(res.branchLengthMode).toBe(true);
    const probe = parseRecPhyloXML(withLengths);
    const ya = res.positions.species.get(probe.species.byName.get("A")!.id)!.y;
    const yb = res.positions.species.get(probe.species.byName.get("B")!.id)!.y;
    expect(Math.abs(ya - yb)).toBeGreaterThan(1);
  });
});

describe("extreme copy number keeps lanes distinguishable", () => {
  it("never collapses same-species siblings below a legible spacing", () => {
    const N = 120;
    const recon = wrap(Array.from({ length: N }, (_, i) => leaf("A", `l${i}`)).join(""));
    const res = run(recon);
    const pts = recon.geneTrees[0].nodes
      .filter((n) => n.speciesId === "A")
      .map((n) => res.positions.gene.get(n.id)!);
    expect(pts.length).toBe(N);
    expect(minPairwiseDistance(pts)).toBeGreaterThanOrEqual(3);
  });
});

describe("canvas bounds cover the bowed transfer arcs", () => {
  it("keeps every arc control point inside the drawing", () => {
    const recon = parseRecPhyloXML(`<recPhylo><spTree><phylogeny><clade><name>R</name>
        <clade><name>A</name></clade><clade><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade><name>bo</name><eventsRec><branchingOut speciesLocation="A"/></eventsRec>
        ${leaf("A", "keep")}
        <clade><eventsRec><transferBack destinationSpecies="B"/><leaf speciesLocation="B" geneName="arr"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
    for (const curved of [true, false]) {
      const res = layout(recon, { ...defaultLayoutOptions, margin: 0 }, new Set(), new Set(), curved);
      expect(res.transfers.length).toBeGreaterThan(0);
      for (const t of res.transfers) {
        const a = res.positions.gene.get(t.from.id)!;
        const b = res.positions.gene.get(t.to.id)!;
        // Read the control point back out of the renderer's own path so this
        // test fails if the bow formula and the bounds estimate ever diverge.
        const d = transferArc(a, b);
        const m = /Q([-\d.]+),([-\d.]+)/.exec(d);
        expect(m, `no quadratic control point in ${d}`).not.toBeNull();
        const cx = Number(m![1]);
        const cy = Number(m![2]);
        expect(cx).toBeGreaterThanOrEqual(0);
        expect(cx).toBeLessThanOrEqual(res.width);
        expect(cy).toBeGreaterThanOrEqual(0);
        expect(cy).toBeLessThanOrEqual(res.height);
      }
      expect(res.width).toBeGreaterThan(0);
    }
  });
});

describe("tidy mode keeps tubes apart on the rendered row", () => {
  // Uneven depths: one lineage is 3 levels deep, the other 1, so `alignTips`
  // pulls a deep leaf up onto the same baseline row as the shallow one.
  const UNEVEN = `<recPhylo><spTree><phylogeny><clade><name>R</name>
      <clade><name>L1</name><clade><name>L2</name>
        <clade><name>L3a</name></clade><clade><name>L3b</name></clade>
      </clade></clade>
      <clade><name>S1</name><clade><name>S2a</name></clade><clade><name>S2b</name></clade></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
      ${leaf("L3a", "a")}${leaf("L3b", "b")}${leaf("S2a", "c")}${leaf("S2b", "d")}
    </clade></phylogeny></recGeneTree></recPhylo>`;

  const overlaps = (recon: ReturnType<typeof parseRecPhyloXML>, opts: Partial<LayoutOptions>) => {
    const res = run(recon, opts);
    const byRow = new Map<number, { id: string; x: number; hw: number }[]>();
    for (const s of recon.species.nodes) {
      const p = res.positions.species.get(s.id)!;
      const key = Math.round(p.y * 1000);
      const list = byRow.get(key) ?? [];
      list.push({ id: s.id, x: p.x, hw: p.width / 2 });
      byRow.set(key, list);
    }
    const bad: string[] = [];
    for (const [, list] of byRow) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - sorted[i - 1].x - sorted[i].hw - sorted[i - 1].hw;
        if (gap < -0.001) bad.push(`${sorted[i - 1].id}/${sorted[i].id}=${gap.toFixed(2)}px`);
      }
    }
    return bad;
  };

  it("rectangular mode has no tube overlap", () => {
    expect(overlaps(parseRecPhyloXML(UNEVEN), {})).toEqual([]);
  });

  it("tidy mode has no tube overlap with alignTips on", () => {
    expect(overlaps(parseRecPhyloXML(UNEVEN), { layoutMode: "tidy", alignTips: true })).toEqual([]);
  });

  it("tidy mode has no tube overlap with alignTips off", () => {
    expect(overlaps(parseRecPhyloXML(UNEVEN), { layoutMode: "tidy", alignTips: false })).toEqual([]);
  });

  it("tidy mode stays tighter than rectangular leaf slots", () => {
    const tidy = run(parseRecPhyloXML(UNEVEN), { layoutMode: "tidy" });
    const rect = run(parseRecPhyloXML(UNEVEN), { layoutMode: "rectangular" });
    expect(tidy.width).toBeLessThanOrEqual(rect.width);
  });
});

describe("elbow mode keeps in-branch nodes on the tube", () => {
  // Species tree whose node A is horizontally offset from its parent R, so a
  // mismatch between the drawn tube and the placement rule is measurable.
  const OFFSET = `<recPhylo><spTree><phylogeny><clade><name>R</name>
      <clade><name>A</name><clade><name>A1</name></clade><clade><name>A2</name></clade></clade>
      <clade><name>B</name></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
      <clade><name>dup</name><eventsRec><duplication speciesLocation="A"/></eventsRec>
        ${leaf("A1", "x")}${leaf("A2", "y")}
      </clade>
      ${leaf("B", "z")}
    </clade></phylogeny></recGeneTree></recPhylo>`;

  it("places a duplication in the upper half of a branch at the tube's x", () => {
    const recon = parseRecPhyloXML(OFFSET);
    const res = layout(recon, defaultLayoutOptions, new Set(), new Set(), false);
    const a = recon.species.byName.get("A")!;
    const r = recon.species.byName.get("R")!;
    const sp = res.positions.species.get(a.id)!;
    const rp = res.positions.species.get(r.id)!;
    expect(Math.abs(sp.x - rp.x)).toBeGreaterThan(4); // the offset we need
    const dup = recon.geneTrees[0].nodes.find((n) => n.name === "dup")!;
    const gp = res.positions.gene.get(dup.id)!;
    // elbowV drops vertically at the CHILD's x for every y below the parent, so
    // the node must sit on sp.x (within half a tube), not on the parent's x.
    expect(Math.abs(gp.x - sp.x)).toBeLessThanOrEqual(sp.width / 2);
    expect(gp.y).toBeGreaterThan(rp.y);
  });
});
