import { describe, it, expect } from "vitest";
import { translations, type Dict } from "./i18n";

/**
 * The zh/en dictionaries are plain objects without compile-time cross checks
 * (the Dict type only constrains one side). This test fails the build whenever
 * a key exists in one locale but not the other, or when the nested event map
 * diverges - the class of drift that surfaces as raw `key` text in the UI.
 */

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...flatten(v, key));
    else out.push(key);
  }
  return out;
}

describe("i18n dictionaries", () => {
  it("have identical key sets in zh and en (nested keys included)", () => {
    const en = new Set(flatten(translations.en as unknown as Dict));
    const zh = new Set(flatten(translations.zh as unknown as Dict));
    const missingInZh = [...en].filter((k) => !zh.has(k));
    const missingInEn = [...zh].filter((k) => !en.has(k));
    expect(missingInZh).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it("cover all seven event types in both locales", () => {
    for (const dict of [translations.en, translations.zh]) {
      for (const ev of [
        "speciation",
        "duplication",
        "loss",
        "branchingOut",
        "bifurcationOut",
        "transferBack",
        "leaf",
      ]) {
        expect(typeof (dict.event as Record<string, string>)[ev]).toBe("string");
        expect((dict.event as Record<string, string>)[ev].length).toBeGreaterThan(0);
      }
    }
  });

  it("use the {n}/{names}/{dpi} placeholder style for parameterized strings", () => {
    expect(translations.en.multiOpenTitle).toContain("{n}");
    expect(translations.zh.multiOpenTitle).toContain("{n}");
    expect(translations.en.openFailedToast).toContain("{names}");
    expect(translations.zh.openFailedToast).toContain("{names}");
    expect(translations.en.pngScaledToast).toContain("{dpi}");
    expect(translations.zh.pngScaledToast).toContain("{dpi}");
  });
});
