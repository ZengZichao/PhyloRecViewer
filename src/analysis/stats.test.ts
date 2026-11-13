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

  it("serializes a locale-independent CSV with all sections and a BOM", () => {
    const csv = statsToCsv(stats, { sourceFile: "demo.xml", generatedBy: "PhyloRecViewer test" });
    expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM for Windows Excel
    expect(csv).toContain("# section: families");
    expect(csv).toContain("donor,recipient,count");
    expect(csv).toContain("A,B,1");
    expect(csv).toContain("source_file,demo.xml");
    // The nodes section carries the event-level evidence columns.
    expect(csv).toContain("num,name,kind,event,species,family,donors,recipients,time_slice,confidence,branch_length");
    // Stable English headers: the section names must not follow the UI locale.
    expect(csv).not.toContain("家族");
  });

  it("splits gene-loss nodes out of the internal count", () => {
    const lossXml = `<recPhylo>
      <spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade></clade></phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade><eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="A"/></eventsRec></clade>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const s = computeStats(parseRecPhyloXML(lossXml));
    expect(s.leafCount).toBe(1);
    expect(s.lossCount).toBe(1);
    expect(s.internalCount).toBe(1); // the root speciation only
    const lossNode = s.nodes.find((n) => n.kind === "loss");
    expect(lossNode?.event).toBe("loss");
  });

  it("accounts for nodes without a species in an unassigned bucket", () => {
    const orphanXml = `<recPhylo>
      <spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade></clade></phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true">
        <clade><eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="Ghost"/></eventsRec></clade>
        </clade>
      </phylogeny></recGeneTree>
    </recPhylo>`;
    const s = computeStats(parseRecPhyloXML(orphanXml));
    // "Ghost" is not in the species tree, so the loss node lands in unassigned.
    expect(s.unassigned.nodes).toBe(1);
    const totalNodes = s.perSpecies.reduce((n, p) => n + p.total, 0) + s.unassigned.nodes;
    expect(totalNodes).toBe(s.nodes.length);
  });

  /**
   * GLOSSARY-UI row 36 (空值) / STYLE-GUIDE-UI §3.7: the ONLY empty-value mark
   * is `—`, in both locales; `?`, `N/A`, `none`, `unnamed` and `no species` are
   * banned aliases. The node table and the transfer matrix below are the values
   * `statsToCsv` writes into the exported statistics CSV, so a re-introduced
   * `?` here would reach the user's spreadsheet.
   */
  describe("empty value is marked with the glossary em dash, never `?`", () => {
    // Every empty slot at once: `<bifurcationOut/>` legitimately has no
    // speciesLocation attribute (the XSD's BifurcationOutRec carries none), a
    // bare `<transferBack/>` names neither donor nor destination, and the
    // arrival's `<leaf/>` names neither gene nor species.
    const BLANK = `<recPhylo>
      <spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>
      <recGeneTree><phylogeny><name>blank</name><clade>
        <eventsRec><bifurcationOut/></eventsRec>
        <clade><eventsRec><transferBack/><leaf/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="kept"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree>
    </recPhylo>`;
    const blank = computeStats(parseRecPhyloXML(BLANK));
    const arrival = blank.nodes.find((n) => n.donors !== "" || n.recipients !== "");

    it("reaches the fixture it is meant to exercise", () => {
      // Guards the other cases here: without an arrival row and empty species
      // slots the assertions below would pass vacuously.
      expect(arrival).toBeDefined();
      expect(blank.transferMatrix.length).toBeGreaterThan(0);
      expect(blank.nodes.some((n) => n.name === "")).toBe(true);
      expect(blank.nodes.some((n) => n.species === "")).toBe(true);
    });

    it("marks a transfer with neither donor nor destination as `—`", () => {
      expect(arrival?.donors).toBe("\u2014");
      expect(arrival?.recipients).toBe("\u2014");
    });

    it("marks an unmapped transfer-matrix endpoint as `—`", () => {
      for (const pair of blank.transferMatrix) {
        expect(pair.from).not.toBe("?");
        expect(pair.to).not.toBe("?");
      }
      // The bifurcation-out donor has no species and the arrival no destination.
      expect(blank.transferMatrix).toContainEqual({
        from: "\u2014",
        to: "\u2014",
        count: 1,
      });
    });

    it("never writes `?` into the exported statistics CSV", () => {
      const csv = statsToCsv(blank, {
        sourceFile: "blank.xml",
        generatedBy: "PhyloRecViewer test",
      });
      expect(csv).not.toContain("?");
      expect(csv).not.toContain("N/A");
      expect(csv).not.toContain("unnamed");
      // The `—` mark actually reaches the file, so the empty cell is visible.
      expect(csv).toContain("\u2014");
    });

    it("carries the `—` mark through the CSV nodes section verbatim", () => {
      const csv = statsToCsv(blank, { sourceFile: "blank.xml", generatedBy: "x" });
      const nodeSection = csv.slice(csv.indexOf("# section: nodes"));
      // num,name,kind,event,species,family,donors,recipients,time_slice,...
      const dataRows = nodeSection.split("\n").filter((l) => /^\d+,/.test(l));
      expect(dataRows.length).toBe(blank.nodes.length);
      const marks = dataRows.map((row) => row.split(",")[6]);
      expect(marks).toContain("\u2014");
      for (const row of dataRows) {
        const cells = row.split(",");
        expect(cells[6]).not.toBe("?");
        expect(cells[7]).not.toBe("?");
      }
    });
  });
});
