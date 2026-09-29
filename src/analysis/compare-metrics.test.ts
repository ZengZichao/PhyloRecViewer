/**
 * Pins how agreement is measured: the denominator is the union of both node
 * sets, so a node present in only one result lowers the percentage, and
 * duplicate-named nodes are compared pairwise rather than collapsed. The
 * general compare.test.ts pairs identical node sets, which exercises neither
 * behaviour.
 */
import { describe, it, expect } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { computeDiff, agreementPct } from "./compare";

const SP = `<spTree><phylogeny rooted="true"><clade><name>R</name></clade></phylogeny></spTree>`;
const leaf = (n: string) => `<clade><eventsRec><leaf speciesLocation="R" geneName="${n}"/></eventsRec></clade>`;
const geneTree = (kids: string) =>
  `<recGeneTree><phylogeny rooted="true"><clade><eventsRec><speciation speciesLocation="R"/></eventsRec>${kids}</clade></phylogeny></recGeneTree>`;
const doc = (kids: string) => `<recPhylo>${SP}${geneTree(kids)}</recPhylo>`;

describe("compare metrics", () => {
  it("a self-comparison agrees 100%", () => {
    const a = parseRecPhyloXML(doc(leaf("g1") + leaf("g2")));
    const d = computeDiff(a, parseRecPhyloXML(doc(leaf("g1") + leaf("g2"))));
    expect(d.compared).toBeGreaterThan(0);
    expect(d.union).toBe(d.compared);
    expect(agreementPct(d)).toBe(100);
  });

  it("nodes present in only one result pull the percentage down", () => {
    const a = parseRecPhyloXML(doc(leaf("g1") + leaf("g2")));
    const b = parseRecPhyloXML(doc(leaf("g1") + leaf("g2") + leaf("g3")));
    const d = computeDiff(a, b);
    expect(d.union).toBeGreaterThan(d.compared); // the extra g3 + differing root are in only one side
    expect(agreementPct(d)).not.toBe(100); // NOT the inflated compared-only 100%
    expect(agreementPct(d)).toBe(Math.round((d.agree / d.union) * 100));
  });

  it("two same-named leaf nodes are both compared, not collapsed", () => {
    const dup = parseRecPhyloXML(doc(leaf("dup") + leaf("dup")));
    const d = computeDiff(dup, parseRecPhyloXML(doc(leaf("dup") + leaf("dup"))));
    // root + two same-named leaves all participate: compared === total keyed nodes
    expect(d.compared).toBe(3);
    expect(agreementPct(d)).toBe(100);
  });
});
