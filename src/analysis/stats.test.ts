import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { computeStats, statsToCsv } from "./stats";

const XML = `<recPhylo>
  <spTree><phylogeny><clade><name>root</name>
    <clade><name>A</name></clade>
    <clade><name>B</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true">
    <clade><name>g0</name>
      <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
      <clade><name>g1</name>
        <eventsRec><leaf speciesLocation="A" geneName="gA"/></eventsRec>
      </clade>
      <clade><name>g2</name>
        <eventsRec>
          <transferBack destinationSpecies="B"/>
          <leaf speciesLocation="B" geneName="gB"/>
        </eventsRec>
      </clade>
    </clade>
  </phylogeny></recGeneTree>
</recPhylo>`;

describe("computeStats", () => {
  const recon = parseRecPhyloXML(XML);
  const stats = computeStats(recon);

  it("counts terminal events and transfers", () => {
    expect(stats.total.leaf).toBe(2);
    expect(stats.total.transfer).toBe(1);
    expect(stats.total.duplication).toBe(0);
    expect(stats.total.branchingOut).toBe(1);
    // The six terminal categories partition every node (transfer is an overlay).
    const t = stats.total;
    const partition =
      t.speciation + t.duplication + t.loss + t.branchingOut + t.bifurcationOut + t.leaf;
    expect(partition).toBe(stats.nodes.length);
  });

  it("builds a donor -> recipient transfer matrix", () => {
    expect(stats.transferMatrix.length).toBe(1);
    expect(stats.transferMatrix[0]).toMatchObject({ from: "A", to: "B", count: 1 });
  });

  it("reports one gene family with all nodes", () => {
    expect(stats.families.length).toBe(1);
    expect(stats.families[0].nodes).toBe(3);
  });

  it("tracks per-species copy number", () => {
    const a = stats.perSpecies.find((s) => s.species === "A");
    expect(a?.copies).toBe(2);
  });

  it("serializes to CSV with all three sections", () => {
    const csv = statsToCsv(stats, {
      family: "Family",
      species: "Species",
      speciation: "Spec",
      duplication: "Dup",
      loss: "Loss",
      branchingOut: "BO",
      bifurcationOut: "Bio",
      leafEvent: "Leaf",
      transfer: "Transfer",
      donor: "Donor",
      recipient: "Recipient",
      count: "Count",
      copies: "Copies",
      nodes: "Nodes",
      nodesSection: "Nodes section",
      num: "Num",
      name: "Name",
      type: "Type",
      event: "Event",
      nodeLeaf: "leaf",
      nodeInternal: "internal",
    });
    expect(csv).toContain("Donor,Recipient,Count");
    expect(csv).toContain("A,B,1");
  });
});
