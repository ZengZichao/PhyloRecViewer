import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { checkConsistency } from "./validate";

describe("checkConsistency", () => {
  it("passes a clean reconciliation", () => {
    const xml = `<recPhylo>
      <spTree><phylogeny><clade><name>root</name>
        <clade><name>A</name></clade>
        <clade><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade><name>g0</name>
        <eventsRec><speciation speciesLocation="root"/></eventsRec>
        <clade><name>g1</name><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
        <clade><name>g2</name><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree>
    </recPhylo>`;
    expect(checkConsistency(parseRecPhyloXML(xml))).toEqual([]);
  });

  it("flags an extant gene placed on an internal species", () => {
    const xml = `<recPhylo>
      <spTree><phylogeny><clade><name>root</name>
        <clade><name>A</name></clade>
        <clade><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade><name>g0</name>
        <eventsRec><leaf speciesLocation="root" geneName="x"/></eventsRec>
      </clade></phylogeny></recGeneTree>
    </recPhylo>`;
    const issues = checkConsistency(parseRecPhyloXML(xml));
    expect(issues.some((i) => i.code === "leafInternalSpecies")).toBe(true);
  });

  // Several issue codes need a specific topology to trigger at all, so each one
  // gets its own case rather than relying on the common paths to reach it.
  const has = (code: string, xml: string) =>
    expect(checkConsistency(parseRecPhyloXML(xml)).some((i) => i.code === code)).toBe(true);
  const SP = `<spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>`;

  it("flags a transferBack arrival whose parent is not a donor", () => {
    has("transferBackNoDonor", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade><eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="t"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="l"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a bifurcation-out donor with no transferred child", () => {
    has("bifurcationNoTransferBack", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><bifurcationOut speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a terminal (loss) event that has children", () => {
    has("terminalEventWithChildren", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><loss speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="z"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a non-binary speciation node", () => {
    has("nonBinaryNode", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="only"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a transfer moving into an ancestor species", () => {
    has("transferBackwardsInTime", `<recPhylo>
      <spTree><phylogeny><clade><name>R</name><clade><name>A</name><clade><name>A1</name></clade></clade></clade></phylogeny></spTree>
      <recGeneTree><phylogeny>
      <clade><eventsRec><branchingOut speciesLocation="A1"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A1" geneName="keep"/></eventsRec></clade>
        <clade><eventsRec><transferBack destinationSpecies="R"/><leaf speciesLocation="R" geneName="arr"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a species reference that is absent from the species tree", () => {
    has("unknownSpecies", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><leaf speciesLocation="Ghost" geneName="g"/></eventsRec></clade>
    </phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a branching-out donor whose children carry no arrival", () => {
    has("donorNoTransferBack", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><branchingOut speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a transferBack arrival sitting at the gene-tree root", () => {
    has("transferBackNoParent", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="r"/></eventsRec></clade>
    </phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags a gene node that carries no species at all", () => {
    has("noSpecies", `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><name>g0</name><eventsRec><speciation/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  it("flags two species clades that share a name", () => {
    has("duplicateSpecies", `<recPhylo>
      <spTree><phylogeny><clade><name>R</name>
        <clade><name>A</name></clade>
        <clade><name>A</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny>
        <clade><eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
          <clade><eventsRec><leaf speciesLocation="A" geneName="b"/></eventsRec></clade>
        </clade></phylogeny></recGeneTree></recPhylo>`);
  });

  /**
   * GLOSSARY-UI row 36 (空值) / STYLE-GUIDE-UI §3.7: the mark for "this node has
   * no name" is `—`, never `?`. Gene-node examples are not inert diagnostics —
   * app/RightPanel.tsx renders `iss.examples` in the 数据检查 panel and writes
   * them into the exported QC report CSV, so the label here is user-facing.
   */
  describe("a gene node with no name is labelled with the glossary em dash", () => {
    // One clade with neither <name> nor geneName: it is simultaneously unnamed
    // (negative branch length), species-less (noSpecies) and low-confidence, so
    // it exercises all three call sites that build a label from `g.name`.
    const unnamed = `<recPhylo>${SP}<recGeneTree><phylogeny>
      <clade><branch_length>-2</branch_length><eventsRec><speciation confidence="42"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="a"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="b"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`;
    const issues = checkConsistency(parseRecPhyloXML(unnamed));
    const of = (code: string) => issues.find((i) => i.code === code);

    it("reaches the three unnamed-node diagnostics it means to", () => {
      expect(of("noSpecies")).toBeDefined();
      expect(of("negativeBranchLength")).toBeDefined();
      expect(of("confidenceScaleSuspect")).toBeDefined();
    });

    it("uses `—` and not `?` in every one of them", () => {
      for (const code of ["noSpecies", "negativeBranchLength", "confidenceScaleSuspect"]) {
        const iss = of(code);
        expect(iss, code).toBeDefined();
        // Exact: a re-introduced "?" fallback in validate.ts fails here.
        expect(iss?.examples.some((e) => e.startsWith("\u2014")), code).toBe(true);
        for (const ex of iss?.examples ?? []) {
          expect(ex, code).not.toContain("?");
        }
      }
    });
  });
});
