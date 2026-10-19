import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { agreementPct, computeDiff } from "./compare";

/**
 * Regression tests for the comparison matching keys.
 *
 * Nodes are matched across two reconciliations by a derived key. Two properties
 * are load-bearing:
 *   1. every node takes part in the comparison - a recPhyloXML <loss/> has no
 *      name and no children, and leaving it out of both the pairing and the
 *      `union` denominator would score a pure "which species was the loss in"
 *      disagreement at 100%;
 *   2. pairing never crosses gene families, because DTL outputs reuse clade and
 *      gene names between families.
 */

const SP = `<spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>`;

/** One family whose only difference between the two documents is the loss species. */
const lossIn = (species: string) =>
  parseRecPhyloXML(`<recPhylo>${SP}<recGeneTree><phylogeny><clade><name>r</name>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
    <clade><eventsRec><loss speciesLocation="${species}"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree></recPhylo>`);

/** One named family whose root is either a speciation or a duplication. */
const family = (name: string, rootEvent: "speciation" | "duplication") =>
  `<recGeneTree><phylogeny><name>${name}</name><clade><name>${name}_r</name>
     <eventsRec><${rootEvent} speciesLocation="R"/></eventsRec>
     <clade><eventsRec><leaf speciesLocation="A" geneName="${name}_a"/></eventsRec></clade>
     <clade><eventsRec><leaf speciesLocation="B" geneName="${name}_b"/></eventsRec></clade>
   </clade></phylogeny></recGeneTree>`;

describe("compare keys: unnamed loss clades take part in the diff", () => {
  it("does not report 100% agreement for two results that disagree on the loss species", () => {
    const d = computeDiff(lossIn("A"), lossIn("B"));
    expect(agreementPct(d)).toBeLessThan(100);
  });

  it("counts the diverging loss nodes as disagreements on BOTH sides", () => {
    const d = computeDiff(lossIn("A"), lossIn("B"));
    expect(d.disagreeA.size).toBe(1);
    expect(d.disagreeB.size).toBe(1);
  });

  it("keeps the union denominator honest: 2 comparable nodes per side, not 2 total", () => {
    const d = computeDiff(lossIn("A"), lossIn("B"));
    expect(d.union).toBe(4); // speciation + leaf + loss (A side) + loss (B side)
  });

  it("scores identical documents at 100%", () => {
    const d = computeDiff(lossIn("A"), lossIn("A"));
    expect(agreementPct(d)).toBe(100);
    expect(d.disagreeA.size).toBe(0);
    expect(d.disagreeB.size).toBe(0);
  });
});

describe("compare keys: matching is family-scoped", () => {
  it("does not pair the nodes of two differently-named families", () => {
    const a = parseRecPhyloXML(`<recPhylo>${SP}${family("F1", "duplication")}</recPhylo>`);
    const b = parseRecPhyloXML(`<recPhylo>${SP}${family("F2", "duplication")}</recPhylo>`);
    const d = computeDiff(a, b);
    // Structurally identical, but they are different families: nothing may pair.
    expect(d.compared).toBe(0);
    expect(d.agree).toBe(0);
    expect(agreementPct(d)).toBe(0);
  });

  it("pairs the same-named family across two documents", () => {
    const a = parseRecPhyloXML(`<recPhylo>${SP}${family("F1", "duplication")}</recPhylo>`);
    const b = parseRecPhyloXML(`<recPhylo>${SP}${family("F1", "duplication")}</recPhylo>`);
    const d = computeDiff(a, b);
    expect(d.compared).toBe(3);
    expect(agreementPct(d)).toBe(100);
  });

  it("compares each family of a multi-family document against its counterpart only", () => {
    const a = parseRecPhyloXML(
      `<recPhylo>${SP}${family("F1", "duplication")}${family("F2", "speciation")}</recPhylo>`,
    );
    const b = parseRecPhyloXML(`<recPhylo>${SP}${family("F2", "speciation")}</recPhylo>`);
    const d = computeDiff(a, b);
    expect(d.compared).toBe(3); // only F2's three nodes are comparable
    expect(d.agree).toBe(3);
    expect(d.disagreeA.size).toBe(3); // F1 has no counterpart
    expect(d.disagreeB.size).toBe(0);
  });

  it("distinguishes two unnamed families that share every node name", () => {
    const twin = (event: "speciation" | "duplication") =>
      `<recGeneTree><phylogeny><clade><eventsRec><${event} speciesLocation="R"/></eventsRec>
         <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
         <clade><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
       </clade></phylogeny></recGeneTree>`;
    const a = parseRecPhyloXML(`<recPhylo>${SP}${twin("duplication")}${twin("speciation")}</recPhylo>`);
    const b = parseRecPhyloXML(`<recPhylo>${SP}${twin("duplication")}</recPhylo>`);
    const d = computeDiff(a, b);
    expect(d.compared).toBe(3);
    expect(d.agree).toBe(3);
    expect(d.disagreeA.size).toBe(3);
    expect(d.disagreeB.size).toBe(0);
  });
});
