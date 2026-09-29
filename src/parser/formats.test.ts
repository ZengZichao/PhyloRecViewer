/**
 * Format routing and merged-document ids: which parser a document reaches, and
 * whether a merged document keeps every node id distinct.
 */
import { describe, expect, it } from "vitest";
import { layout } from "../layout";
import { detectFormat, parseMerged, parseReconciliation } from "./formats";

const DOC = `<recPhylo>
  <spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name></clade><clade><name>B</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true"><name>fam</name><clade><name>g1</name>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade><name>gA</name><eventsRec><leaf speciesLocation="A" geneName="gA"/></eventsRec></clade>
    <clade><name>gB</name><eventsRec><leaf speciesLocation="B" geneName="gB"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

const allGeneIds = (r: ReturnType<typeof parseMerged>) =>
  r.geneTrees.flatMap((t) => t.nodes.map((n) => n.id));

describe("merged documents must not share node ids", () => {
  it("two DIFFERENT files with identical gene-tree content get disjoint ids", () => {
    const merged = parseMerged([
      { name: "fam1.xml", text: DOC },
      { name: "fam2.xml", text: DOC },
    ]);
    const ids = allGeneIds(merged);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    // Positions is keyed by id, so two identical ids would overwrite each other.
    const res = layout(merged);
    expect(res.positions.gene.size).toBe(ids.length);
    expect(res.positions.species.size).toBe(merged.species.nodes.length);
  });

  it("the SAME file listed twice (identical name AND content) gets disjoint ids", () => {
    const merged = parseMerged([
      { name: "same.xml", text: DOC },
      { name: "same.xml", text: DOC },
    ]);
    const ids = allGeneIds(merged);
    expect(new Set(ids).size).toBe(6);
    expect(layout(merged).positions.gene.size).toBe(6);
  });

  it("merging is deterministic: the same file list re-parses to the same ids", () => {
    const files = [
      { name: "a.xml", text: DOC },
      { name: "b.xml", text: DOC.replace(/gA/g, "hA").replace(/fam/, "fam2") },
    ];
    expect(allGeneIds(parseMerged(files))).toEqual(allGeneIds(parseMerged(files)));
  });

  it("the first merged file keeps the ids it gets when opened alone", () => {
    const alone = parseReconciliation(DOC, "fam1.xml");
    const merged = parseMerged([
      { name: "fam1.xml", text: DOC },
      { name: "fam2.xml", text: DOC },
    ]);
    expect(merged.geneTrees[0].root.id).toBe(alone.geneTrees[0].root.id);
  });

  it("treeIndex mutations after id assignment do not leave stale indices in ids", () => {
    // Two files, each parsed against its own local treeIndex 0: the document
    // namespace plus the re-derived global treeIndex are what keep their ids
    // apart. A node's treeIndex must match its tree's position in the merge.
    const merged = parseMerged([
      { name: "x1.xml", text: DOC },
      { name: "x2.xml", text: DOC },
    ]);
    for (const t of merged.geneTrees) {
      for (const n of t.nodes) expect(n.treeIndex).toBe(t.index);
    }
    // And ids of the two clones differ even though content is byte-identical.
    expect(merged.geneTrees[0].root.id).not.toBe(merged.geneTrees[1].root.id);
  });
});

describe("detectFormat routing", () => {
  it("routes bracket-free Newick to the Newick/NHX parser", () => {
    expect(detectFormat("SpeciesA;")).toBe("nhx");
    expect(detectFormat("(A)B;", "tree.nwk")).toBe("nhx");
  });

  it("routes a single-leaf Newick away from the XML 'missing root' error", () => {
    let msg = "";
    try {
      // No S= annotations -> the NHX reader explains what to ADD, and the
      // message is NOT the XML root-element one.
      parseReconciliation("SpeciesA;", "SpeciesA.nwk");
      throw new Error("should have thrown");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/species/i);
    expect(msg).not.toMatch(/recPhylo> root/);
  });

  it("keeps recPhyloXML detection for XML content", () => {
    expect(detectFormat(DOC)).toBe("recphyloxml");
    expect(detectFormat("<recPhyloXML><recPhylo></recPhylo></recPhyloXML>", "x.recphyloxml")).toBe(
      "recphyloxml",
    );
  });

  it("non-tree XML reports that it is not recPhyloXML", () => {
    let msg = "";
    try {
      parseReconciliation("<html><body>hi</body></html>", "page.html");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/does not look like recPhyloXML/);
  });
});

describe("parseReconciliation namespace", () => {
  it("same file name + content always reproduces ids (session-restore path)", () => {
    const a = parseReconciliation(DOC, "showcase.recphyloxml");
    const b = parseReconciliation(DOC, "showcase.recphyloxml");
    expect(allGeneIds(a)).toEqual(allGeneIds(b));
    expect(a.species.root.id).toBe(b.species.root.id);
  });

  it("different file names isolate ids", () => {
    const a = parseReconciliation(DOC, "one.xml");
    const b = parseReconciliation(DOC, "two.xml");
    expect(new Set([...allGeneIds(a), ...allGeneIds(b)]).size).toBe(6);
  });
});
