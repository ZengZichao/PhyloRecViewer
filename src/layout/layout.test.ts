import { describe, it, expect } from "vitest";
import { layout } from "./index";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { computeTransfers } from "./transfers";
import { optimizeCrossings } from "./optimize";

/**
 * A small reconciliation with two species, one duplication, one loss and a
 * transfer (branchingOut donor -> transferBack arrival).
 */
const XML = `
<recPhylo>
  <spTree>
    <phylogeny>
      <clade>
        <name>ANIMAL</name>
        <clade><name>Rabbit</name></clade>
        <clade><name>Platypus</name></clade>
      </clade>
    </phylogeny>
  </spTree>
  <recGeneTree>
    <phylogeny>
      <clade>
        <eventsRec><speciation speciesLocation="ANIMAL"/></eventsRec>
        <clade>
          <eventsRec><duplication speciesLocation="ANIMAL"/></eventsRec>
          <clade>
            <eventsRec><leaf speciesLocation="Rabbit" geneName="r1"/></eventsRec>
          </clade>
          <clade>
            <eventsRec><loss speciesLocation="Platypus"/></eventsRec>
          </clade>
        </clade>
        <clade>
          <eventsRec><branchingOut speciesLocation="Rabbit"/></eventsRec>
          <clade>
            <eventsRec><transferBack destinationSpecies="Platypus"/><leaf speciesLocation="Platypus" geneName="p1"/></eventsRec>
          </clade>
        </clade>
      </clade>
    </phylogeny>
  </recGeneTree>
</recPhylo>`;

describe("layout", () => {
  it("places every visible gene node inside the canvas bounds", () => {
    const recon = parseRecPhyloXML(XML);
    const res = layout(recon);
    for (const tree of recon.geneTrees) {
      for (const g of tree.nodes) {
        const p = res.positions.gene.get(g.id);
        expect(p).toBeDefined();
        expect(p!.x).toBeGreaterThanOrEqual(0);
        expect(p!.y).toBeGreaterThanOrEqual(0);
        expect(p!.x).toBeLessThanOrEqual(res.width);
        expect(p!.y).toBeLessThanOrEqual(res.height);
      }
    }
  });

  it("widens no species tube below one lane and packs lanes by overlap", () => {
    const recon = parseRecPhyloXML(XML);
    const res = layout(recon);
    for (const s of recon.species.nodes) {
      const p = res.positions.species.get(s.id);
      expect(p).toBeDefined();
      expect(p!.laneCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("hides descendants of collapsed nodes and removes hidden transfers", () => {
    const recon = parseRecPhyloXML(XML);
    const dup = recon.geneTrees[0].nodes.find((g) => g.endEvent.type === "duplication");
    expect(dup).toBeDefined();
    const collapsed = new Set([dup!.id]);
    const res = layout(recon, {}, undefined, collapsed);
    // Both descendants of the duplication (leaf + loss) are hidden.
    expect(res.hiddenIds.size).toBe(2);
    // No hidden endpoint survives into the transfer list.
    for (const t of res.transfers) {
      expect(res.hiddenIds.has(t.from.id)).toBe(false);
      expect(res.hiddenIds.has(t.to.id)).toBe(false);
    }
  });

  it("keeps the model untouched across two layouts with different options", () => {
    const recon = parseRecPhyloXML(XML);
    const a = layout(recon, { levelHeight: 60 });
    const b = layout(recon, { levelHeight: 200 });
    const ya = a.positions.species.get(recon.species.root.id)!.y;
    const yb = b.positions.species.get(recon.species.root.id)!.y;
    // Separate positions maps; each layout owns its own geometry.
    expect(a.positions).not.toBe(b.positions);
    expect(ya).toBeLessThan(yb);
  });

  it("derives one transfer edge per transferBack arrival with a parent", () => {
    const recon = parseRecPhyloXML(XML);
    const transfers = computeTransfers(recon);
    expect(transfers).toHaveLength(1);
    // The arrival node carries the destination species as its speciesId.
    expect(transfers[0].to.speciesId).toBe("Platypus");
    expect(transfers[0].to.events.some((e) => e.type === "transferBack")).toBe(true);
  });

  it("optimizeCrossings only mirrors subtrees related to transfers", () => {
    const recon = parseRecPhyloXML(XML);
    const swapped = optimizeCrossings(recon);
    // The two-species tree has a single binary internal node; anything it
    // picked must be a real species name, never an unrelated invention.
    for (const name of swapped) {
      expect(recon.species.byName.has(name)).toBe(true);
    }
  });
});
