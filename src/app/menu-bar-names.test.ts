import { describe, expect, it } from "vitest";
import { baseName } from "./export-names";
import { countLabel } from "../i18n";

/**
 * the export file-name stem must survive non-ASCII names. A sanitizer built on
 * `replace(/[^\w.-]+/g, "_")` cannot: `\w` is ASCII-only, so every CJK document
 * would collapse onto the same "_" stem and the atomic save would replace the
 * earlier export with no prompt.
 */
describe("baseName keeps non-ASCII file stems", () => {
  const cases: [string, string][] = [
    ["完整示例：物种形成.recphyloxml", "完整示例：物种形成"],
    ["示例A.nwk", "示例A"],
    ["示例B.nwk", "示例B"],
    ["日本語.nhx", "日本語"],
    ["GeneRax_out_1.nwk", "GeneRax_out_1"],
    ["two  spaces.nwk", "two  spaces"],
    ["a/b:c*d?.nwk", "a_b_c_d_"],
    [".recphyloxml", "reconciliation"],
    ["   ", "reconciliation"],
    ["no-extension", "no-extension"],
  ];
  it.each(cases)("(%s) -> %s", (input, want) => {
    expect(baseName(input)).toBe(want);
  });

  it("gives two Chinese-named documents two different stems", () => {
    expect(baseName("家系一.recphyloxml")).not.toBe(baseName("家系二.recphyloxml"));
  });

  it("never returns an empty or dot-only stem", () => {
    for (const name of ["??? ", "...", "***.nhx", "\u0001\u0002.nwk"]) {
      const stem = baseName(name);
      expect(stem.length).toBeGreaterThan(0);
      expect(stem).not.toMatch(/^\.+$/);
    }
  });
});

/**
 * the English dictionaries store plural nouns, so a count of one would otherwise
 * read "1 gene trees" / "1 matches" / "1 warnings". Chinese units take no suffix
 * and must be returned untouched.
 */
describe("countLabel singularises English units for a count of one", () => {
  it("English", () => {
    expect(countLabel(1, "gene trees")).toBe("1 gene tree");
    expect(countLabel(3, "gene trees")).toBe("3 gene trees");
    expect(countLabel(1, "matches")).toBe("1 match");
    expect(countLabel(1, "warnings")).toBe("1 warning");
  });

  it("Chinese is unchanged", () => {
    expect(countLabel(1, "基因树")).toBe("1 基因树");
    expect(countLabel(12, "个警告")).toBe("12 个警告");
  });

  it("leaves a unit with no plural form alone", () => {
    expect(countLabel(1, "data")).toBe("1 data");
    expect(countLabel(1, "species")).toBe("1 species");
  });
});
