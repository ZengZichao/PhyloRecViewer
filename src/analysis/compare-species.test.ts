/**
 * Regression tests for species-mapping and transfer comparison.
 *
 * The reviewer probe: two documents that place the SAME extant gene in
 * DIFFERENT species used to score 100% agreement, because only the terminal
 * event type was compared. These tests pin the fixed behaviour: a species
 * remapping is a disagreement, and transfer donor/recipient changes are
 * reported too.
 */
import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import {
  agreementPct,
  speciesAgreementPct,
  computeDiff,
} from "./compare";

const SP = `<spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name></clade>
    <clade><name>B</name></clade>
  </clade></phylogeny></spTree>`;

const doc = (geneTree: string) => `<recPhylo>${SP}${geneTree}</recPhylo>`;

const leafIn = (species: string) =>
  doc(`<recGeneTree><phylogeny rooted="true"><clade>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade><eventsRec><leaf speciesLocation="${species}" geneName="g"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree>`);

describe("compare: species mapping is compared (reviewer probe)", () => {
  it("no longer reports 100% when the same gene sits in a different species", () => {
    const d = computeDiff(parseRecPhyloXML(leafIn("A")), parseRecPhyloXML(leafIn("B")));
    // Event types agree for both pairs, but the leaf's species mapping differs;
    // the root still maps to R on both sides, so only it fully agrees.
    expect(d.agreeEvent).toBe(d.compared);
    expect(d.agree).toBe(1);
    expect(d.agreeSpecies).toBe(1);
    expect(agreementPct(d)).toBe(50);
    expect(speciesAgreementPct(d)).toBe(50);
    expect(d.disagreeA.size).toBeGreaterThan(0);
    expect(d.disagreeB.size).toBeGreaterThan(0);
  });

  it("reports identical species mappings at 100% on both metrics", () => {
    const d = computeDiff(parseRecPhyloXML(leafIn("A")), parseRecPhyloXML(leafIn("A")));
    expect(agreementPct(d)).toBe(100);
    expect(speciesAgreementPct(d)).toBe(100);
    expect(d.disagreeA.size).toBe(0);
  });

  it("exposes the mismatching pair details for the diff table", () => {
    const d = computeDiff(parseRecPhyloXML(leafIn("A")), parseRecPhyloXML(leafIn("B")));
    expect(d.pairs).toHaveLength(2); // root + leaf
    const leafPair = d.pairs.find((p) => p.name === "g");
    expect(leafPair).toBeDefined();
    expect(leafPair!.speciesA).toBe("A");
    expect(leafPair!.speciesB).toBe("B");
    expect(leafPair!.agreeSpecies).toBe(false);
    expect(leafPair!.agreeEvent).toBe(true);
  });
});

const withTransfer = (donor: string, recipient: string) =>
  doc(`<recGeneTree><phylogeny rooted="true"><clade>
    <eventsRec><branchingOut speciesLocation="${donor}"/></eventsRec>
    <clade>
      <eventsRec><transferBack destinationSpecies="${recipient}" speciesLocation="${donor}"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="${recipient}" geneName="g"/></eventsRec></clade>
    </clade>
  </clade></phylogeny></recGeneTree>`);

describe("compare: transfer donor/recipient is compared", () => {
  it("flags a transfer whose donor differs", () => {
    const d = computeDiff(
      parseRecPhyloXML(withTransfer("A", "B")),
      parseRecPhyloXML(withTransfer("B", "B")),
    );
    expect(d.transferCompared).toBeGreaterThan(0);
    expect(d.agreeTransfer).toBe(0);
    expect(d.disagreeA.size).toBeGreaterThan(0);
  });

  it("accepts identical transfers", () => {
    const d = computeDiff(
      parseRecPhyloXML(withTransfer("A", "B")),
      parseRecPhyloXML(withTransfer("A", "B")),
    );
    expect(d.agreeTransfer).toBe(d.transferCompared);
    expect(d.transferCompared).toBeGreaterThan(0);
  });

  it("records donor and recipient on the pair rows", () => {
    const d = computeDiff(
      parseRecPhyloXML(withTransfer("A", "B")),
      parseRecPhyloXML(withTransfer("A", "B")),
    );
    const arrival = d.pairs.find((p) => p.donorA !== null);
    expect(arrival).toBeDefined();
    expect(arrival!.donorA).toBe("A");
    expect(arrival!.recipientA).toBe("B");
  });
});
