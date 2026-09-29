/**
 * Tests for the stable-id invariants.
 *
 * They pin down exactly what the module documents: determinism, sibling-order
 * invariance, renumbering confined to the changed node's ancestor chain, and
 * cross-document uniqueness coming from the per-file namespace.
 */
import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { assignStableGeneIds, documentNamespace, hashStr } from "./stableId";

const SP = `<spTree><phylogeny rooted="true"><clade><name>R</name>
  <clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>`;

/** root(R) -> [x@A, y@B]; the leaves are keyed by geneName so a lookup is name-based. */
const simple = (leafName: string, order: "AB" | "BA") => {
  const kids = (n: string, sp: string) =>
    `<clade><eventsRec><leaf speciesLocation="${sp}" geneName="${n}"/></eventsRec></clade>`;
  const body = order === "AB" ? kids("x", "A") + kids(leafName, "B") : kids(leafName, "B") + kids("x", "A");
  return parseRecPhyloXML(
    `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true"><clade><name>r</name>
      <eventsRec><speciation speciesLocation="R"/></eventsRec>${body}
    </clade></phylogeny></recGeneTree></recPhylo>`,
  );
};

/** Map a named node to its id: by endEvent.geneName, else by clade name. */
const idsByGeneName = (r: ReturnType<typeof parseRecPhyloXML>) => {
  const out = new Map<string, string>();
  for (const t of r.geneTrees)
    for (const n of t.nodes) out.set(n.endEvent.geneName ?? n.name, n.id);
  return out;
};

describe("ids are deterministic", () => {
  it("re-parsing the same document yields the same ids", () => {
    const ns = documentNamespace("fam.xml", "<x/>");
    const a = [...idsByGeneName(simple("y1", "AB")).entries()];
    const b = [...idsByGeneName(simple("y1", "AB")).entries()];
    expect(a).toEqual(b);
    const c = parseRecPhyloXML(
      `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true"><clade><name>r</name>
        <eventsRec><speciation speciesLocation="R"/></eventsRec></clade></phylogeny></recGeneTree></recPhylo>`,
      ns,
    );
    const d = parseRecPhyloXML(
      `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true"><clade><name>r</name>
        <eventsRec><speciation speciesLocation="R"/></eventsRec></clade></phylogeny></recGeneTree></recPhylo>`,
      ns,
    );
    expect(c.geneTrees[0].root.id).toBe(d.geneTrees[0].root.id);
  });

  it("hashStr is repeatable and case-sensitive", () => {
    expect(hashStr("abc")).toBe(hashStr("abc"));
    expect(hashStr("abc")).not.toBe(hashStr("ABC"));
  });
});

describe("sibling-order invariance of ids", () => {
  it("swapping two children keeps the id of every node", () => {
    const ab = idsByGeneName(simple("y1", "AB"));
    const ba = idsByGeneName(simple("y1", "BA"));
    expect(ab.get("x")).toBe(ba.get("x"));
    expect(ab.get("y1")).toBe(ba.get("y1"));
    expect(ab.get("r")).toBe(ba.get("r")); // the root holds its id as well
  });

  it("species ids are sibling-order invariant too", () => {
    const sp = (body: string) =>
      parseRecPhyloXML(
        `<recPhylo><spTree><phylogeny rooted="true"><clade><name>R</name>${body}</clade></phylogeny></spTree></recPhylo>`,
        "ns",
      );
    const a = sp('<clade><name>A</name></clade><clade><name>B</name></clade>');
    const b = sp('<clade><name>B</name></clade><clade><name>A</name></clade>');
    expect(a.species.byName.get("A")!.id).toBe(b.species.byName.get("A")!.id);
    expect(a.species.root.id).toBe(b.species.root.id);
  });
});

describe("a local edit leaves unrelated ids alone", () => {
  //  r -> [ dup(x@A, lost@B), leaf c@B ]
  const tree = (xName: string) =>
    parseRecPhyloXML(
      `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true">
        <clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade><name>dup</name><eventsRec><duplication speciesLocation="R"/></eventsRec>
            <clade><eventsRec><leaf speciesLocation="A" geneName="${xName}"/></eventsRec></clade>
            <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
          </clade>
          <clade><eventsRec><leaf speciesLocation="B" geneName="c"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree></recPhylo>`,
    );

  it("renaming one leaf renumbers that leaf and its ancestors only", () => {
    const a = idsByGeneName(tree("x"));
    const b = idsByGeneName(tree("x-renamed"));
    // A subtree nobody edited keeps its id.
    expect(a.get("c")).toBe(b.get("c"));
    // The edited node and its ancestor chain change, by construction.
    expect(a.get("x")).not.toBe(b.get("x-renamed"));
    expect(a.get("dup")).not.toBe(b.get("dup"));
    expect(a.get("r")).not.toBe(b.get("r"));
  });

  it("two exactly duplicated subtrees get distinct, repeatable ids", () => {
    const dupTree = () =>
      parseRecPhyloXML(
        `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true">
          <clade><name>r</name><eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade><eventsRec><loss speciesLocation="A"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="A"/></eventsRec></clade>
        </clade></phylogeny></recGeneTree></recPhylo>`,
      );
    const ids = dupTree().geneTrees[0].nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe(ids[1] + "_d1");
    expect(dupTree().geneTrees[0].nodes.map((n) => n.id)).toEqual(ids);
  });
});

describe("the per-document namespace", () => {
  it("gives two documents that hold identical trees disjoint ids", () => {
    const xml = `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true"><clade><name>r</name>
      <eventsRec><speciation speciesLocation="R"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade>
      <clade><eventsRec><leaf speciesLocation="B" geneName="y"/></eventsRec></clade>
    </clade></phylogeny></recGeneTree></recPhylo>`;
    const a = parseRecPhyloXML(xml, "nsA").geneTrees[0].nodes.map((n) => n.id);
    const b = parseRecPhyloXML(xml, "nsB").geneTrees[0].nodes.map((n) => n.id);
    expect(a).not.toEqual(b);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it("documentNamespace is content-addressed and depends on nothing else", () => {
    const f = documentNamespace("a.xml", "<recPhylo/>");
    expect(f).toBe(documentNamespace("a.xml", "<recPhylo/>"));
    expect(f).not.toBe(documentNamespace("b.xml", "<recPhylo/>"));
    expect(f).not.toBe(documentNamespace("a.xml", "<recPhylo> </recPhylo>"));
  });

  it("assignStableGeneIds keeps the same ids when called without a namespace", () => {
    const xml = `<recPhylo>${SP}<recGeneTree><phylogeny rooted="true"><clade><name>r</name>
      <eventsRec><leaf speciesLocation="A" geneName="x"/></eventsRec></clade></phylogeny></recGeneTree></recPhylo>`;
    const recon = parseRecPhyloXML(xml);
    const before = recon.geneTrees[0].root.id;
    // Re-running the assignment with the same (default) namespace changes nothing.
    assignStableGeneIds(recon.geneTrees.map((t) => t.root));
    expect(recon.geneTrees[0].root.id).toBe(before);
  });
});
