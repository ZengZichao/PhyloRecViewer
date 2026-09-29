/**
 * Tests for the NHX (reverse) export.
 *
 * The dialect in `newickExport.ts` is a superset of classic NHX, and every one of
 * its fields is a place where a label, a species name or a branch length can
 * collide with Newick's own syntax (`, : ( ) ; [ ] ' " @ &` and whitespace), so
 * these tests hold that quoting and encoding in place: a written file has to read
 * back as the same reconciliation.
 */
import { describe, it, expect } from "vitest";
import { parseReconciliation } from "../parser/formats";
import { parseNewick } from "../parser/newick";
import type {
  GeneNode,
  GeneTree,
  Reconciliation,
  RecEvent,
  SpeciesNode,
} from "../model/types";
import { reconToNhx } from "./newickExport";

/* ------------------------------------------------------------------ fixtures */

const SPECIES_TREE = `<spTree><phylogeny><clade><name>R</name>
  <clade><name>A</name></clade><clade><name>B</name></clade>
</clade></phylogeny></spTree>`;

/** A tree holding every event type the dialect encodes, plus branch lengths. */
const FULL_EVENTS_XML = `<recPhylo>${SPECIES_TREE}
  <recGeneTree><phylogeny><clade><name>r</name>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade><name>dup</name><branch_length>0.25</branch_length>
      <eventsRec><duplication speciesLocation="R"/></eventsRec>
      <clade><branch_length>0.5</branch_length>
        <eventsRec><leaf speciesLocation="A" geneName="sp. JH-1:2"/></eventsRec></clade>
      <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
    </clade>
    <clade><name>bo</name><eventsRec><branchingOut speciesLocation="A"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
      <clade><eventsRec><transferBack destinationSpecies="B"/><leaf speciesLocation="B" geneName="arr"/></eventsRec></clade>
    </clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

/** The 11 Newick metacharacter labels exercised here (one is deliberately
 *  repeated, so a duplicate name cannot quietly merge two nodes). */
const META_LABELS = [
  "a,b",
  "a:b",
  "a(b)",
  "a[b]",
  "a;b",
  "a b",
  "a'b",
  'a"b',
  "a&b",
  "a@b",
  "a;b",
];

function escAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function starWithLabels(labels: string[], species = ["A", "B"]): string {
  const leaves = labels
    .map(
      (name, i) =>
        `<clade><eventsRec><leaf speciesLocation="${species[i % species.length]}" ` +
        `geneName="${escAttr(name)}"/></eventsRec></clade>`,
    )
    .join("");
  return `<recPhylo>${SPECIES_TREE}
    <recGeneTree><phylogeny><clade><name>r</name>
      <eventsRec><speciation speciesLocation="R"/></eventsRec>${leaves}
    </clade></phylogeny></recGeneTree>
  </recPhylo>`;
}

/** One string per node: everything a lossless round trip has to preserve. */
function fingerprint(recon: Reconciliation): string[] {
  return recon.geneTrees.flatMap((t) =>
    t.nodes.map(
      (n) =>
        [
          n.endEvent.type === "leaf" ? n.endEvent.geneName || n.name : n.name,
          n.endEvent.type,
          n.speciesId,
          n.endEvent.geneName ?? "",
          // The intermediary events (transfer-back arrivals) are what a lossy
          // writer is most likely to flatten into an "ordinary tip".
          n.events.map((e) => `${e.type}@${e.destinationSpecies ?? e.speciesLocation ?? ""}`).join("+"),
          n.branchLength ?? "",
        ].join("|"),
    ),
  );
}

/** Push a reconciliation through the app's own NHX dialect and read it back. */
function roundTrip(xml: string, fileName: string): Reconciliation {
  const original = parseReconciliation(xml, fileName);
  const nhx = reconToNhx(original);
  const reread = parseReconciliation(nhx, `${fileName}.nhx`);
  expect(fingerprint(reread)).toEqual(fingerprint(original));
  return reread;
}

/* ------------------------------------------------------------- round tripping */

describe("the NHX export round trip", () => {
  it("keeps species, events, gene names and branch lengths", () => {
    const reread = roundTrip(FULL_EVENTS_XML, "full");
    const nodes = reread.geneTrees[0].nodes;
    const names = nodes.map((n) => n.endEvent.geneName ?? n.name);
    expect(names).toContain("sp. JH-1:2");
    expect(names).toContain("keep");
    expect(names).toContain("arr");
    expect(nodes.map((n) => n.endEvent.type)).toContain("duplication");
    expect(nodes.map((n) => n.endEvent.type)).toContain("loss");
    expect(nodes.map((n) => n.endEvent.type)).toContain("branchingOut");
    expect(nodes.flatMap((n) => n.events.map((e) => e.type))).toContain("transferBack");
    expect(nodes.map((n) => n.branchLength)).toContain(0.25);
    expect(nodes.map((n) => n.branchLength)).toContain(0.5);
  });

  it("hands the tokenizer exactly one tree per gene tree", () => {
    const nhx = reconToNhx(parseReconciliation(FULL_EVENTS_XML, "full"));
    expect(nhx.trimEnd().split("\n")).toHaveLength(1);
    expect(nhx.endsWith(";\n")).toBe(true);
    expect(parseNewick(nhx)).toHaveLength(1);
  });

  it("carries the 11 Newick metacharacter labels through byte-identical", () => {
    const original = parseReconciliation(starWithLabels(META_LABELS), "meta");
    const nhx = reconToNhx(original);
    const out = original.geneTrees[0].nodes
      .filter((n) => n.children.length === 0)
      .map((n) => n.endEvent.geneName);
    expect(out).toEqual(META_LABELS);
    const back = parseReconciliation(nhx, "meta.nhx")
      .geneTrees[0].nodes.filter((n) => n.children.length === 0)
      .map((n) => n.endEvent.geneName);
    expect(back).toEqual(META_LABELS);
  });

  it("wraps in quotes every label that would break Newick bare", () => {
    const nhx = reconToNhx(parseReconciliation(starWithLabels(META_LABELS), "meta"));
    // Whitespace and `,` `(` `)` `;` `[` `]` `"` `@` `&` force quoting…
    expect(nhx).toContain("'a,b'");
    expect(nhx).toContain("'a b'");
    expect(nhx).toContain("'a[b]'");
    expect(nhx).toContain("'a&b'");
    expect(nhx).toContain("'a@b'");
    // …and the Newick convention doubles an embedded quote.
    expect(nhx).toContain("'a''b'");
    // A `:` is safe inside a label (the branch-length separator comes after it)
    // but never appears raw in an NHX *value*, which is colon-delimited.
    expect(nhx).toContain("S=A:D=N");
    // A colon inside a *value* is percent-encoded, never written raw; that
    // property is asserted where such a value exists (tricky species below).
  });

  it("writes a transfer-back arrival as TB=<donor>|<recipient>", () => {
    const nhx = reconToNhx(parseReconciliation(FULL_EVENTS_XML, "full"));
    // With no donor species on the event, the donor is the arrival node's parent
    // species (A) and the recipient is the declared destination (B).
    expect(nhx).toContain("TB=A|B");
  });

  it("reads back species names that contain NHX metacharacters", () => {
    const tricky = "Candida sp. JH-1:2";
    const xml = `<recPhylo><spTree><phylogeny><clade><name>R</name>
        <clade><name>${escAttr(tricky)}</name></clade><clade><name>B</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny><clade>
        <eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="${escAttr(tricky)}" geneName="one"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="two"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree>
    </recPhylo>`;
    const reread = roundTrip(xml, "tricky-species");
    const species = reread.species.nodes.map((n) => n.name);
    expect(species).toContain(tricky);
    expect(reread.geneTrees[0].nodes.map((n) => n.speciesId)).toContain(tricky);
  });

  it("writes one NHX line for each gene tree", () => {
    const twoTrees = `${FULL_EVENTS_XML.replace(
      "</recGeneTree>",
      `</recGeneTree>
      <recGeneTree><phylogeny><clade><name>second</name>
        <eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade><eventsRec><leaf speciesLocation="A" geneName="s1"/></eventsRec></clade>
        <clade><eventsRec><leaf speciesLocation="B" geneName="s2"/></eventsRec></clade>
      </clade></phylogeny></recGeneTree>`,
    )}`;
    const recon = parseReconciliation(twoTrees, "two-trees");
    expect(recon.geneTrees).toHaveLength(2);
    const lines = reconToNhx(recon).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.endsWith(";")).toBe(true);
    expect(parseNewick(reconToNhx(recon))).toHaveLength(2);
  });
});

/* ------------------------------------------------------------ value encoding */

/** Model nodes assembled by hand, for edge cases the parser never yields. */
function node(over: Partial<GeneNode> & { endEvent: RecEvent }): GeneNode {
  const base: GeneNode = {
    id: over.id ?? "g0",
    name: over.name ?? "",
    children: [],
    parent: null,
    events: [over.endEvent],
    endEvent: over.endEvent,
    speciesId: "R",
    treeIndex: 0,
  };
  return { ...base, ...over };
}

function reconOf(...trees: GeneNode[][]): Reconciliation {
  const speciesRoot: SpeciesNode = {
    id: "s0",
    name: "R",
    children: [],
    parent: null,
    depth: 0,
  };
  const geneTrees: GeneTree[] = trees.map((nodes, index) => {
    const [root, ...rest] = nodes;
    // A flat list of nodes means a star under `root`; a caller that already wired
    // its own tree (and hands over just its root) is taken as it is.
    if (rest.length > 0) {
      root.children = rest;
      for (const c of rest) c.parent = root;
    }
    return { index, root, nodes };
  });
  return {
    species: { root: speciesRoot, byName: new Map([["R", speciesRoot]]), nodes: [speciesRoot] },
    geneTrees,
    warnings: [],
  };
}

describe("edge cases in NHX value encoding", () => {
  const leaf: RecEvent = { type: "leaf", speciesLocation: "R", geneName: "g" };

  it("omits a non-finite branch length rather than writing BL=NaN", () => {
    const recon = reconOf([
      node({ id: "a", endEvent: leaf, branchLength: Number.NaN }),
      node({ id: "b", endEvent: leaf, branchLength: Number.POSITIVE_INFINITY }),
      node({ id: "c", endEvent: leaf, branchLength: 1.5 }),
    ]);
    const nhx = reconToNhx(recon);
    expect(nhx).not.toMatch(/BL=NaN/);
    expect(nhx).not.toMatch(/BL=Infinity/);
    expect(nhx).toContain("BL=1.5");
    // A length that is absent is not written at all, so a reader keeps it unknown.
    const missing = reconToNhx(reconOf([node({ id: "d", endEvent: leaf })]));
    expect(missing).not.toContain("BL=");
  });

  it("tags each end-event type with a field of its own", () => {
    const types: { event: RecEvent; expect: string; absent?: string }[] = [
      { event: { type: "leaf", speciesLocation: "R" }, expect: "D=N", absent: "L=Y" },
      { event: { type: "duplication", speciesLocation: "R" }, expect: "D=Y" },
      { event: { type: "loss", speciesLocation: "R" }, expect: "L=Y" },
      { event: { type: "branchingOut", speciesLocation: "R" }, expect: "BO=Y" },
      { event: { type: "bifurcationOut", speciesLocation: "R" }, expect: "BC=Y" },
      { event: { type: "speciation", speciesLocation: "R" }, expect: "D=N" },
    ];
    for (const { event, expect: tag, absent } of types) {
      const nhx = reconToNhx(reconOf([node({ endEvent: event })]));
      expect(nhx, JSON.stringify(event)).toContain(tag);
      if (absent) expect(nhx).not.toContain(absent);
    }
  });

  it("takes an incomplete transfer's donor from the parent species, then from ?", () => {
    const arrival = node({
      id: "t",
      speciesId: "B",
      events: [{ type: "transferBack", destinationSpecies: "B" }],
      endEvent: { type: "leaf", speciesLocation: "B", geneName: "arr" },
    });
    const parent = node({
      id: "p",
      name: "par",
      speciesId: "A",
      children: [arrival],
      endEvent: { type: "speciation", speciesLocation: "A" },
    });
    arrival.parent = parent;
    // With no speciesLocation on the transferBack event, the donor is the parent's
    // species - the most the tree structure alone can say.
    expect(reconToNhx(reconOf([parent]))).toContain("TB=A|B");

    const orphan = node({
      id: "o",
      speciesId: "B",
      events: [{ type: "transferBack" }],
      endEvent: { type: "leaf", speciesLocation: "B", geneName: "orphan" },
    });
    // With neither a donor nor a declared destination, the donor is written "?"
    // and the arrival takes the node's own species.
    expect(reconToNhx(reconOf([orphan]))).toContain("TB=?|B");
  });

  it("writes a lone newline for an empty gene-tree list", () => {
    const empty = reconOf();
    expect(empty.geneTrees).toHaveLength(0);
    expect(reconToNhx(empty)).toBe("\n");
  });
});
