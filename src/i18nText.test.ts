import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { translations, type Dict } from "./i18n";

/**
 * Mechanical guards for the UI copy rules in docs/STYLE-GUIDE-UI.md. These look
 * at the source tree, so they fail on regressions that unit tests of behaviour
 * would not notice: a stray Chinese literal, a resurrected Title Case label, a
 * dead dictionary key, or a re-added CSS text-transform.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const FILES = walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p));
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");
const CJK = /[\u3400-\u9fff]/;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function entries(dict: Dict): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (k === "event") {
      for (const [ek, ev] of Object.entries(v as Record<string, string>)) out.push([`event.${ek}`, ev]);
    } else if (typeof v === "string") out.push([k, v]);
    else if (Array.isArray(v)) (v as string[]).forEach((s, i) => out.push([`${k}[${i}]`, s]));
  }
  return out;
}

const EN = entries(translations.en);
const ZH = entries(translations.zh);

describe("UI copy style guide", () => {
  it("keeps {placeholders} identical across languages", () => {
    const placeholders = (s: string) => new Set(s.match(/\{[a-zA-Z]+\}/g) ?? []);
    const en = new Map(EN);
    const bad = ZH.filter(([k, zh]) => {
      const a = placeholders(en.get(k) ?? "");
      const b = placeholders(zh);
      return a.size !== b.size || [...a].some((x) => !b.has(x));
    }).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("uses one ellipsis form (U+2026) and no ASCII three dots", () => {
    const bad = [...EN, ...ZH].filter(([, v]) => v.includes("...")).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("never stores escaped \\uXXXX sequences in the catalogue", () => {
    expect(read(join(SRC, "i18n.ts"))).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  it("has no forced uppercase or letter-spaced micro-labels", () => {
    expect(read(join(SRC, "styles.css"))).not.toMatch(/text-transform\s*:\s*uppercase/);
  });

  it("keeps the no-plural-(s) rule", () => {
    const bad = [...EN, ...ZH].filter(([, v]) => /\(\w*\(s\)|\(s\)/.test(v) && /\(s\)/.test(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("allows only documented all-caps tokens inside copy", () => {
    const allowed = new Set([
      "NHX", "PDF", "SVG", "PNG", "HTML", "CSV", "JSON", "DPI", "MIT", "aLRT", "QC", "ID", "URL", "HGT",
    ]);
    const bad: string[] = [];
    for (const [k, v] of [...EN, ...ZH]) {
      for (const word of v.match(/\b[A-Z]{2,}\b/g) ?? []) {
        if (!allowed.has(word) && !v.includes(`recPhyloXML`) && word !== "XML") bad.push(`${k}: ${word}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("keeps Chinese values punctuated with full-width brackets", () => {
    const bad = ZH.filter(([, v]) => /[\u4e00-\u9fff]/.test(v) && /[()]/.test(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("has no Chinese copy outside the catalogue (language endonyms excepted)", () => {
    const allowed = new Set(["src/i18n.ts", "src/i18nDiagnostics.ts"]);
    const offenders = FILES.filter(
      (p) =>
        !allowed.has(rel(p)) &&
        !/\.test\.(ts|tsx)$/.test(p) &&
        CJK.test(stripComments(read(p)).replace(/中文/g, "")),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("leaves no dictionary key unreferenced", () => {
    const sources = FILES.filter((p) => rel(p) !== "src/i18n.ts").map(read).join("\n");
    const dynamic = new Set(
      [...read(join(SRC, "samples", "index.ts")).matchAll(/(?:labelKey|nestedLabelKey|compareLabelKey):\s*"(\w+)"/g)].map(
        (m) => m[1],
      ),
    );
    const dead = [...EN]
      .map(([k]) => k.split(/[.[]/)[0])
      .filter((k) => !dynamic.has(k) && !new RegExp(`\\b${k}\\b`).test(sources));
    expect([...new Set(dead)]).toEqual([]);
  });

  it("never gives one element both a native title and a data-tooltip", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      for (const tag of text.matchAll(/<[A-Za-z][^>]*>/g)) {
        if (/\btitle=/.test(tag[0]) && /data-tooltip=/.test(tag[0])) offenders.push(rel(file));
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("keeps source files free of raw NUL bytes", () => {
    const bad = FILES.filter((p) => readFileSync(p).includes(0)).map(rel);
    expect(bad).toEqual([]);
  });
});
