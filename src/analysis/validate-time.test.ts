/**
 * Regression tests for the reviewer-flagged time-model and semantics checks:
 *  - a same-species transfer is reported under its own code, not "backwards in time";
 *  - with no timeSlice evidence the time direction is "not assessable" (info),
 *    never a silent pass;
 *  - reaching an ANCESTOR species is backwards in time from structure alone;
 *  - confidences on a 0-100 scale are flagged, negative branch lengths flagged;
 *  - a vertical gene edge that jumps between unrelated clades is an error.
 */
import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { checkConsistency } from "./validate";

const SP = (extra = "") =>
  `<spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name>${extra ? `<clade><name>${extra}</name></clade>` : ""}</clade>
    <clade><name>B</name></clade>
  </clade></phylogeny></spTree>`;

const doc = (body: string, spExtra = "") =>
  `<recPhylo>${SP(spExtra)}<recGeneTree><phylogeny rooted="true">${body}</phylogeny></recGeneTree></recPhylo>`;

const codes = (xml: string) => {
  const issues = checkConsistency(parseRecPhyloXML(xml));
  return new Map(issues.map((i) => [i.code, i]));
};

describe("time direction checks", () => {
  it("reports a same-species transfer as sameSpeciesTransfer only", () => {
    const xml = doc(`<clade>
      <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
      <clade>
        <eventsRec><transferBack destinationSpecies="A" speciesLocation="A"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
      </clade>
    </clade>`);
    const m = codes(xml);
    expect(m.has("sameSpeciesTransfer")).toBe(true);
    expect(m.has("transferBackwardsInTime")).toBe(false);
    expect(m.has("transferTimeUnknown")).toBe(false);
  });

  it("reports 'not assessable' (info) when no timeSlice exists and species are unrelated", () => {
    const xml = doc(`<clade>
      <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
      <clade>
        <eventsRec><transferBack destinationSpecies="B" speciesLocation="A"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="B" geneName="g"/></eventsRec></clade>
      </clade>
    </clade>`);
    const m = codes(xml);
    expect(m.get("transferTimeUnknown")?.level).toBe("info");
    expect(m.has("transferBackwardsInTime")).toBe(false);
  });

  it("flags a transfer into an ANCESTOR species from structure alone", () => {
    // A2 sits below A in the species tree; transferring from A2 into A
    // reaches an ancestor.
    const xml = doc(
      `<clade>
        <eventsRec><branchingOut speciesLocation="A2"/></eventsRec>
        <clade>
          <eventsRec><transferBack destinationSpecies="A" speciesLocation="A2"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
        </clade>
      </clade>`,
      "A2",
    );
    const m = codes(xml);
    expect(m.get("transferBackwardsInTime")?.level).toBe("error");
  });

  it("compares explicit timeSlices when both sides provide them", () => {
    const xml = doc(`<clade>
      <eventsRec><branchingOut speciesLocation="A" timeSlice="5"/></eventsRec>
      <clade>
        <eventsRec><transferBack destinationSpecies="B" speciesLocation="A" timeSlice="3"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="B" geneName="g"/></eventsRec></clade>
      </clade>
    </clade>`);
    const m = codes(xml);
    expect(m.get("transferBackwardsInTime")?.level).toBe("warning");
    expect(m.has("transferTimeUnknown")).toBe(false);
  });
});

describe("scale and branch length checks", () => {
  it("flags event confidence on a 0-100 scale", () => {
    const xml = doc(`<clade><eventsRec><leaf speciesLocation="A" geneName="g" confidence="95"/></eventsRec></clade>`);
    expect(codes(xml).get("confidenceScaleSuspect")?.level).toBe("info");
  });

  it("flags negative branch lengths", () => {
    const xml = doc(`<clade branch_length="-1"><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>`);
    expect(codes(xml).has("negativeBranchLength")).toBe(true);
  });
});

describe("vertical lineage integrity", () => {
  it("flags a non-transfer gene edge that jumps to an unrelated clade", () => {
    const xml = doc(`<clade>
      <eventsRec><speciation speciesLocation="A"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="g1"/></eventsRec></clade>
      <clade><eventsRec><leaf speciesLocation="B" geneName="g2"/></eventsRec></clade>
    </clade>`);
    expect(codes(xml).get("verticalEdgeAcrossClades")?.level).toBe("error");
  });

  it("accepts a vertical edge into a descendant species", () => {
    const xml = doc(
      `<clade>
        <eventsRec><speciation speciesLocation="A"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="g1"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="A2" geneName="g2"/></eventsRec></clade>
      </clade>`,
      "A2",
    );
    expect(codes(xml).has("verticalEdgeAcrossClades")).toBe(false);
  });
});
