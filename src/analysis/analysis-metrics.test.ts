import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { computeStats } from "./stats";
import { checkConsistency } from "./validate";
import { confidenceActive, focusMatches, reconHasConfidence } from "./focus";
import type { Reconciliation } from "../model/types";

/**
 * Regression tests for the metric and consistency counters: the confidence
 * detector and the filter reading one accessor, losses kept out of the
 * extant-tip count, one issue per bad species reference rather than one per
 * mention, every transfer arrival of a node time-checked, and same-species
 * transfers reported.
 */

const SP = `<spTree><phylogeny><clade><name>R</name>
  <clade><name>A</name></clade><clade><name>B</name></clade>
</clade></phylogeny></spTree>`;
const doc = (gene: string): Reconciliation =>
  parseRecPhyloXML(`<recPhylo>${SP}<recGeneTree><phylogeny><clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>${gene}</clade></phylogeny></recGeneTree></recPhylo>`);

describe("confidence is detected and filtered by the same accessor", () => {
  const onlyOnTransferBack = doc(`<clade><name>bo</name><eventsRec><branchingOut speciesLocation="A"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
      <clade><eventsRec><transferBack destinationSpecies="B" confidence="0.83"/><leaf speciesLocation="B" geneName="arr"/></eventsRec></clade>
    </clade>`);

  it("offers the confidence control for a file annotated only on transferBack", () => {
    expect(reconHasConfidence(onlyOnTransferBack)).toBe(true);
  });

  it("and then keeps that same node inside a window containing its value", () => {
    expect(confidenceActive([0.5, 1])).toBe(true);
    const matches = focusMatches(onlyOnTransferBack, {
      query: "",
      regex: false,
      events: { speciation: true, duplication: true, loss: true, transfer: true, leaf: true, unknown: true },
      families: null,
      confidence: [0.5, 1],
    } as never);
    const named = (matches ?? []).map((g) => g.endEvent.geneName || g.name);
    // The confidence here sits on the transferBack event, so the detector and
    // the filter both read every event of the node; if the filter read only the
    // terminal event, nothing could match and the view would empty.
    expect(named).toContain("arr");
    // Nodes with no confidence at all are legitimately excluded by a narrowed
    // window.
    expect(named).not.toContain("keep");
  });
});

describe("losses are not counted as extant tips", () => {
  it("makes the tip count agree with the leaf-event count", () => {
    const recon = doc(`<clade><name>d</name><eventsRec><duplication speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
        <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
      </clade>`);
    const s = computeStats(recon) as unknown as {
      total: Record<string, number>;
      nodes: { kind: string; event: string }[];
      tips?: number;
      leafCount?: number;
    };
    expect(s.total.leaf).toBe(1);
    expect(s.total.loss).toBe(1);
    const tips = s.nodes.filter((n) => n.kind === "leaf");
    expect(tips).toHaveLength(1);
    expect(tips[0].event).toBe("leaf");
  });
});

describe("consistency issue counting", () => {
  const find = (recon: Reconciliation, code: string) =>
    checkConsistency(recon).find((i) => i.code === code);

  it("counts one issue per unknown reference, not one per mention", () => {
    const recon = doc(`<clade><name>t</name>
        <eventsRec><transferBack destinationSpecies="MARS" speciesLocation="MARS"/><leaf speciesLocation="MARS" geneName="t"/></eventsRec>
      </clade>`);
    const issue = find(recon, "unknownSpecies");
    // One node mentions the same unknown species three times (donor, destination
    // and terminal location); that is one bad reference, not three.
    expect(issue?.count).toBe(1);
    expect(issue?.examples).toEqual(["MARS"]);
  });

  it("reports a same-species transfer as one backwards-in-time issue", () => {
    const recon = doc(`<clade><name>bo</name><eventsRec><branchingOut speciesLocation="A"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
        <clade><eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="self"/></eventsRec></clade>
      </clade>`);
    const issue = find(recon, "transferBackwardsInTime");
    expect(issue).toBeDefined();
    expect(issue?.count).toBe(1);
  });

  it("checks every transfer arrival of a node, not only the first", () => {
    const twoArrivals = parseRecPhyloXML(`<recPhylo><spTree><phylogeny><clade><name>R</name>
        <clade><name>A</name></clade><clade><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade><name>bo</name><eventsRec><branchingOut speciesLocation="A" timeSlice="5"/></eventsRec>
        <clade>
          <eventsRec>
            <transferBack destinationSpecies="B" timeSlice="4"/>
            <transferBack destinationSpecies="B" timeSlice="9"/>
            <leaf speciesLocation="B" geneName="arr"/>
          </eventsRec>
        </clade>
        <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
    const issue = checkConsistency(twoArrivals).find((i) => i.code === "transferBackwardsInTime");
    // The first arrival (timeSlice 4 < donor 5) is backwards even though the
    // second one (9) is fine.
    expect(issue?.count).toBe(1);
  });
});
