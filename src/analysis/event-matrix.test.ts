/**
 * A full-event-type matrix sample plus an end-to-end regression over it.
 *
 * One document carries every terminal event type - `bifurcationOut` included,
 * with the two transfer arrivals it donates - and runs them through
 * parse -> layout -> stats -> transfers -> consistency. Exercising the whole
 * matrix along one path covers each event category, not only the common ones.
 */
import { describe, it, expect } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { layout } from "../layout";
import { computeStats } from "./stats";
import { computeTransfers } from "../layout/transfers";
import { checkConsistency } from "./validate";
import { focusMatches, ALL_EVENTS } from "./focus";

// R -> {A, B}. Gene tree covers every terminal event + three transfer arrivals.
const XML = `<recPhylo>
  <spTree><phylogeny>
    <clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade>
  </phylogeny></spTree>
  <recGeneTree><phylogeny>
    <clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
      <clade><name>dup</name><eventsRec><duplication speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="x1"/></eventsRec></clade>
        <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
      </clade>
      <clade><name>sp2</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade><name>bo</name><eventsRec><branchingOut speciesLocation="A"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
          <clade><eventsRec><transferBack destinationSpecies="B"/><leaf speciesLocation="B" geneName="arr1"/></eventsRec></clade>
        </clade>
        <clade><name>bco</name><eventsRec><bifurcationOut speciesLocation="B"/></eventsRec>
          <clade><eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr2"/></eventsRec></clade>
          <clade><eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr3"/></eventsRec></clade>
        </clade>
      </clade>
    </clade>
  </phylogeny></recGeneTree>
</recPhylo>`;

describe("full-event-type matrix", () => {
  const recon = parseRecPhyloXML(XML);
  const stats = computeStats(recon);

  it("parses every terminal event type including bifurcationOut", () => {
    const t = stats.total;
    expect(t.speciation).toBe(2);
    expect(t.duplication).toBe(1);
    expect(t.loss).toBe(1);
    expect(t.branchingOut).toBe(1);
    expect(t.bifurcationOut).toBe(1);
    expect(t.leaf).toBe(5);
    expect(t.transfer).toBe(3); // three transferBack arrivals
  });

  it("draws one arc per transfer arrival (branchingOut 1, bifurcationOut 2)", () => {
    const arcs = computeTransfers(recon);
    expect(arcs.length).toBe(3);
    // every arc's donor is a genuine donor
    for (const a of arcs) {
      expect(["branchingOut", "bifurcationOut"]).toContain(a.from.endEvent.type);
    }
  });

  it("a well-formed full-event file reports no consistency issues", () => {
    expect(checkConsistency(recon)).toEqual([]);
  });

  it("produces a finite layout with coordinates for every gene node", () => {
    const res = layout(recon);
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
    for (const tree of recon.geneTrees)
      for (const g of tree.nodes) expect(res.positions.gene.has(g.id)).toBe(true);
  });

  it("filtering out loss keeps leaf AND bifurcationOut", () => {
    const kept = new Set(
      (focusMatches(recon, {
        query: "", regex: false, families: null, events: { ...ALL_EVENTS, loss: false },
      }) ?? []).map((g) => g.endEvent.type),
    );
    expect(kept.has("leaf")).toBe(true);
    expect(kept.has("bifurcationOut")).toBe(true);
    expect(kept.has("loss")).toBe(false);
  });
});
