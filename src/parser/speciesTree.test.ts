import { describe, expect, it } from "vitest";
import { parseSpeciesTree } from "./speciesTree";
import { parseNhxReconciliation } from "./nhx";
import { NhxParseError } from "./nhx";

const SP_NWK = "((A,B)Clade1,C)Root;";
const GENE_LEAF_ONLY = `(('g1'[&&NHX:S=A:D=N],'g2'[&&NHX:S=A:D=N])95[&&NHX:S=A],'g3'[&&NHX:S=B:D=N]);`;

describe("standalone species tree", () => {
  it("parses internal clade names and branch lengths", () => {
    const st = parseSpeciesTree(SP_NWK);
    expect(st.byName.get("Clade1")).toBeDefined();
    expect(st.byName.get("Root")?.depth).toBe(0);
    expect(st.byName.get("Clade1")?.children.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("rejects empty input", () => {
    expect(() => parseSpeciesTree("")).toThrow(/no tree/);
  });
});

describe("NHX with a separate species tree", () => {
  it("accepts leaf-only S= annotations when an external species tree is provided", () => {
    const recon = parseNhxReconciliation(GENE_LEAF_ONLY, "", parseSpeciesTree(SP_NWK));
    expect(recon.species.byName.get("Clade1")).toBeDefined();
    expect(recon.geneTrees[0].nodes.map((n) => n.speciesId)).toContain("A");
    expect(recon.geneTrees[0].nodes.map((n) => n.speciesId)).toContain("B");
  });

  it("still rejects leaf-only S= without an external tree", () => {
    expect(() => parseNhxReconciliation(GENE_LEAF_ONLY)).toThrow(NhxParseError);
  });

  it("reads the numeric internal label as support, not a gene name", () => {
    const recon = parseNhxReconciliation(GENE_LEAF_ONLY, "", parseSpeciesTree(SP_NWK));
    const withSupport = recon.geneTrees[0].nodes.filter((n) => n.support);
    expect(withSupport).toHaveLength(1);
    expect(withSupport[0].support?.value).toBe(95);
    expect(withSupport[0].name).toBe("");
  });

  it("warns when the external species tree lacks a referenced species", () => {
    const recon = parseNhxReconciliation(GENE_LEAF_ONLY, "", parseSpeciesTree("(X,Y)R;"));
    expect(recon.warnings.some((w) => /unknown species/.test(w))).toBe(true);
  });
});
