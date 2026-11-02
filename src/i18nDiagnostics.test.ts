import { describe, it, expect } from "vitest";
import { localizeDiagnostic, localizeExample } from "./i18nDiagnostics";

describe("diagnostic localisation", () => {
  it("translates parser messages and keeps their parameters", () => {
    expect(localizeDiagnostic('Gene node "x" references unknown species "y".', "zh")).toContain("未知物种");
    expect(
      localizeDiagnostic(
        "This session was created by a newer version of PhyloRecViewer (v9); please update to open it.",
        "zh",
      ),
    ).toContain("v9");
    expect(localizeDiagnostic("Newick nesting is too deep (possible malformed input).", "zh")).toContain("嵌套过深");
  });

  it("keeps the technical context of Newick syntax errors", () => {
    const zh = localizeDiagnostic('Unbalanced parentheses in Newick (at offset 12, near "abc").', "zh");
    expect(zh).toContain("括号不配对");
    expect(zh).toContain("12");
    expect(zh).toContain("附近");
  });

  it("passes unknown text through unchanged and never touches English", () => {
    const raw = "Some brand-new parser message.";
    expect(localizeDiagnostic(raw, "zh")).toBe(raw);
    expect(localizeDiagnostic("Gene node references unknown species", "en")).toBe(
      "Gene node references unknown species",
    );
  });

  it("translates the validator's example cells", () => {
    expect(localizeExample("Rabbit @depth 3", "zh")).toBe("Rabbit，深度 3");
    expect(localizeExample("x: timeSlice 2", "zh")).toBe("x：时间片 2");
  });

  it("covers a representative message from every producer", () => {
    const cases: [string, string][] = [
      ["No reconciled gene trees (<recGeneTree>) were found.", "未找到"],
      ['Species "Homo" declares a negative branch length (-1); it is clamped to 0 for drawing.', "负枝长"],
      [
        'The document declares the XML namespace "urn:x" instead of the recPhyloXML namespace "http://www.recg.org"; parsing proceeded, but this may not be a recPhyloXML file.',
        "命名空间",
      ],
      ["No species (S=) annotations found in the NHX file.", "未找到物种"],
      [
        'Species "A" is annotated under conflicting parents ("B" and "C"); kept "B". The NHX format cannot tell.',
        "冲突的父节点",
      ],
      ["Too many trees in one file (> 100); aborting rather than silently dropping the rest.", "单文件树过多"],
      [
        "This file does not appear to be UTF-8 text (it contains NUL bytes, as UTF-16 files do when decoded as UTF-8). Re-export it as UTF-8 and try again.",
        "UTF-8",
      ],
      ["Session file is not valid JSON", "有效的 JSON"],
      ["Failed to rasterize SVG", "栅格化"],
      ["3 node(s) carry multiple transfer arrivals; only the first can be written to NHX", "多个转移到达"],
      ["Gene tree is nested too deep (possible malformed input).", "嵌套过深"],
    ];
    const untranslated = cases.filter(([en, zh]) => !localizeDiagnostic(en, "zh").includes(zh)).map(([en]) => en);
    expect(untranslated).toEqual([]);
  });
});
