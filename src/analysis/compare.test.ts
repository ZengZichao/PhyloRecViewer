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

  /**
   * GLOSSARY-UI row 36 (空值) / STYLE-GUIDE-UI §3.7: `MatchedPair.name` is
   * rendered straight into the comparison table (app/RightPanel.tsx) and written
   * into the exported diff CSV, so its label for an unnamed node is user-facing
   * and must be `—` — not the banned `(unnamed)` / `?` aliases.
   */
  it("labels a matched node that carries no name with the glossary em dash", () => {
    // A loss clade has no <name> and no geneName, which is exactly the case the
    // `||` chain in pairOf() falls through.
    const withLoss = (lossSpecies: string) =>
      parseRecPhyloXML(`<recPhylo>${SP}
        <recGeneTree><phylogeny><clade><name>g0</name>
          <eventsRec><speciation speciesLocation="root"/></eventsRec>
          <clade><name>gA</name><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="${lossSpecies}"/></eventsRec></clade>
        </clade></phylogeny></recGeneTree>
      </recPhylo>`);
    const d = computeDiff(withLoss("A"), withLoss("A"));
    const names = d.pairs.map((p) => p.name);
    expect(names).toContain("\u2014");
    expect(names).not.toContain("(unnamed)");
    expect(names).not.toContain("?");
    // The named nodes are untouched by the fallback.
    expect(names).toContain("x");
  });
});
