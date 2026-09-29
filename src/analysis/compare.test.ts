import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { agreementPct, computeDiff } from "./compare";

const SP = `<spTree><phylogeny><clade><name>root</name>
    <clade><name>A</name></clade>
    <clade><name>B</name></clade>
  </clade></phylogeny></spTree>`;

// Same family, but node g0 is a speciation in one result and a duplication in
// the other -> exactly one disagreement.
const A = `<recPhylo>${SP}
  <recGeneTree><phylogeny><clade><name>g0</name>
    <eventsRec><speciation speciesLocation="root"/></eventsRec>
    <clade><name>gA</name><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
    <clade><name>gB</name><eventsRec><leaf speciesLocation="B" geneName="y"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

const B = `<recPhylo>${SP}
  <recGeneTree><phylogeny><clade><name>g0</name>
    <eventsRec><duplication speciesLocation="root"/></eventsRec>
    <clade><name>gA</name><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
    <clade><name>gB</name><eventsRec><leaf speciesLocation="B" geneName="y"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

describe("computeDiff", () => {
  it("flags nodes whose event type differs between two reconciliations", () => {
    const d = computeDiff(parseRecPhyloXML(A), parseRecPhyloXML(B));
    expect(d.compared).toBe(3); // g0, gA, gB matched by key
    expect(d.agree).toBe(2); // the two leaves agree
    expect(d.disagreeA.size).toBe(1);
    expect(d.disagreeB.size).toBe(1);
    expect(agreementPct(d)).toBe(67);
  });

  it("reports full agreement when identical", () => {
    const d = computeDiff(parseRecPhyloXML(A), parseRecPhyloXML(A));
    expect(agreementPct(d)).toBe(100);
    expect(d.disagreeA.size).toBe(0);
  });
});
