import { describe, expect, it } from "vitest";
import { parseNewick, completeInternalNames } from "./newick";
import { parseNhxReconciliation } from "./nhx";
import { detectFormat, parseReconciliation } from "./formats";
import { layout } from "../layout";
import { reconToNhx } from "../export/newickExport";

// A compact NHX reconciliation: Mammalia speciates into two species; the rabbit
// lineage then undergoes a duplication. Species tags on every node.
const NHX = `((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];`;

describe("parseNewick", () => {
  it("reads names, NHX tags and nesting", () => {
    const [root] = parseNewick(NHX);
    expect(root.nhx.S).toBe("Mammalia");
    expect(root.children.length).toBe(2);
    const dup = root.children[0];
    expect(dup.nhx.D).toBe("Y");
    expect(dup.children.map((c) => c.name)).toEqual(["rabbit_g1", "rabbit_g2"]);
  });

  it("completes unnamed internal nodes by post-order index", () => {
    const [root] = parseNewick("(a,(b,c));");
    completeInternalNames(root);
    expect(root.name).not.toBe("");
  });
});

describe("parseNhxReconciliation", () => {
  const recon = parseNhxReconciliation(NHX);

  it("reconstructs the species tree from S= tags", () => {
    expect(recon.species.root.name).toBe("Mammalia");
    expect(recon.species.byName.has("Rabbit")).toBe(true);
    expect(recon.species.byName.has("Platypus")).toBe(true);
    expect(recon.species.root.children.length).toBe(2);
  });

  it("maps D=Y to duplication and childless nodes to leaves", () => {
    const gt = recon.geneTrees[0];
    const types = new Set(gt.nodes.map((n) => n.endEvent.type));
    expect(types.has("duplication")).toBe(true);
    expect(types.has("leaf")).toBe(true);
    expect(gt.root.endEvent.type).toBe("speciation");
  });

  it("produces a finite layout", () => {
    const res = layout(recon);
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
  });

  it("warns when a species is annotated under conflicting parents", () => {
    // "Kid" appears under two different parents across the forest.
    const conflicted = `(kid_g[&&NHX:S=Kid:D=N])[&&NHX:S=Mum:D=N];(kid_h[&&NHX:S=Kid:D=N])[&&NHX:S=Dad:D=N];`;
    const recon = parseNhxReconciliation(conflicted);
    expect(
      recon.warnings.some((w) => w.includes("conflicting parents")),
    ).toBe(true);
    // The first parent wins, and parsing completes.
    expect(recon.species.byName.has("Kid")).toBe(true);
  });

  it("warns about species that cannot be attached to the reconstructed tree", () => {
    // Tree 2's root species "Other" has no annotated ancestors, so it is
    // disconnected from tree 1's reconstructed species tree.
    const disconnected = `(a_g[&&NHX:S=Alpha:D=N])[&&NHX:S=Alpha:D=N];(o_g[&&NHX:S=Other:D=N])[&&NHX:S=Other:D=N];`;
    const recon = parseNhxReconciliation(disconnected);
    expect(
      recon.warnings.some((w) => w.includes("cannot be attached")),
    ).toBe(true);
    expect(recon.species.byName.has("Alpha")).toBe(true);
  });
});

  it("accepts the documented SP= species alias", () => {
    const recon = parseNhxReconciliation(
      "(g1[&&NHX:SP=Rabbit:D=N],g2[&&NHX:SP=Platypus:D=N])[&&NHX:SP=Mammalia:D=N];",
    );
    expect([...recon.species.byName.keys()].sort()).toEqual(["Mammalia", "Platypus", "Rabbit"]);
    expect(recon.geneTrees[0].nodes.filter((n) => n.speciesId === "Rabbit").length).toBe(1);
  });

  it("reports NHX tag keys it does not interpret instead of dropping them silently", () => {
    const recon = parseNhxReconciliation(
      "(g1[&&NHX:S=Rabbit:D=N:N=abc:R=7],g2[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];",
    );
    const note = recon.warnings.find((w) => w.includes("does not interpret"));
    expect(note).toBeTruthy();
    expect(note).toContain("N");
    expect(note).toContain("R");
  });

describe("format detection", () => {
  it("detects NHX from content", () => {
    expect(detectFormat(NHX, "x.nhx")).toBe("nhx");
    expect(detectFormat("(a,b);", "x.nwk")).toBe("nhx");
  });

  it("detects recPhyloXML from content", () => {
    expect(detectFormat("<recPhylo></recPhylo>", "x.xml")).toBe("recphyloxml");
  });

  it("dispatches to the right parser", () => {
    const recon = parseReconciliation(NHX, "x.nhx");
    expect(recon.geneTrees.length).toBe(1);
  });
});

describe("comments before branch lengths", () => {
  it("reads NHX annotations written before the branch length", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A]:0.1,B[&&NHX:S=B]:0.2)R[&&NHX:S=R]:0.3)root[&&NHX:S=root];",
    );
    const gt = recon.geneTrees[0];
    const byName = (n: string) => gt.nodes.find((x) => x.name === n)!;
    expect(byName("A").branchLength).toBe(0.1);
    expect(byName("B").branchLength).toBe(0.2);
    expect(byName("R").branchLength).toBe(0.3);
    expect(byName("A").speciesId).toBe("A");
  });
});

describe("diagnostics name only what the NHX reader can actually do", () => {
  it("internal nodes without S= get told what to DO", () => {
    let msg = "";
    try {
      parseNhxReconciliation("((A,B)R,C)root;");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/S=<species>/);
    expect(msg).toMatch(/recPhyloXML/);
    expect(msg).not.toMatch(/separate species tree/);
  });

  it("no warning promises an external species-tree pairing", () => {
    const recon = parseNhxReconciliation(NHX);
    expect(recon.warnings.some((w) => /separate species tree/i.test(w))).toBe(false);
  });
});

describe("conflicting NHX event tags", () => {
  it("resolves D=Y + L=Y like the recPhyloXML reader (duplication wins) and warns", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A:D=Y:L=Y],B[&&NHX:S=B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    const a = recon.geneTrees[0].nodes.find((n) => n.name === "A")!;
    expect(a.endEvent.type).toBe("duplication");
    expect(
      recon.warnings.some((w) => w.includes("conflicting event tags") && w.includes("duplication + loss")),
    ).toBe(true);
  });

  it("resolves BO + L with the shared precedence (loss wins) and warns", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A:BO=Y:L=Y],B[&&NHX:S=B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    const a = recon.geneTrees[0].nodes.find((n) => n.name === "A")!;
    expect(a.endEvent.type).toBe("loss");
    expect(recon.warnings.some((w) => w.includes("conflicting event tags"))).toBe(true);
  });

  it("does not warn when only one event tag is present", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A:D=Y],B[&&NHX:S=B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    expect(recon.warnings.some((w) => w.includes("conflicting event tags"))).toBe(false);
  });
});

describe("the transfer-excluded note only fires when transfers exist", () => {
  it("stays silent for TB-free files", () => {
    const recon = parseNhxReconciliation(NHX);
    expect(
      recon.warnings.some((w) => w.includes("excluded from ancestry")),
    ).toBe(false);
  });

  it("warns when the file does carry TB= transfers", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A],B[&&NHX:S=B][&&NHX:TB=A|B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    expect(
      recon.warnings.some((w) => w.includes("excluded from ancestry")),
    ).toBe(true);
  });
});

describe("BL= vs Newick length conflicts", () => {
  it("warns when the two spellings of the branch length disagree", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A:BL=0.5]:0.9,B[&&NHX:S=B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    expect(
      recon.warnings.some((w) => w.includes("BL=0.5") && w.includes("keeping")),
    ).toBe(true);
    const a = recon.geneTrees[0].nodes.find((n) => n.name === "A")!;
    expect(a.branchLength).toBe(0.5);
  });

  it("stays silent when they agree", () => {
    const recon = parseNhxReconciliation(
      "((A[&&NHX:S=A:BL=0.5]:0.5,B[&&NHX:S=B])R[&&NHX:S=R])root[&&NHX:S=root];",
    );
    expect(recon.warnings.some((w) => w.includes("they disagree"))).toBe(false);
  });
});

describe("reconToNhx round-trip", () => {
  it("re-exports NHX that parses back to the same species set", () => {
    const recon = parseNhxReconciliation(NHX);
    const nhx = reconToNhx(recon);
    const again = parseNhxReconciliation(nhx);
    expect(again.species.byName.has("Rabbit")).toBe(true);
    expect(again.species.byName.has("Platypus")).toBe(true);
    const dup = again.geneTrees[0].nodes.some((n) => n.endEvent.type === "duplication");
    expect(dup).toBe(true);
  });
});
