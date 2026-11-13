import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { NEWICK_HEADS, RULES } from "./i18nDiagnostics";
import { SINGULAR_UNITS, translations, type Dict } from "./i18n";

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
/** Han, CJK punctuation (、。) and full-width forms - all of them copy. */
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A markdown heading with the inline code and bold markers dropped: the words
 *  a reader would use to name that section, and so the words a document
 *  pointing at it has to use too. */
const stripInline = (s: string): string => s.replace(/`[^`]*`/g, "").replace(/\*\*/g, "");
function headingsOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => (/^#{1,6}\s+/.test(l) ? stripInline(l.replace(/^#+\s+/, "")).trim() : null))
    .filter((h): h is string => h !== null);
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

/**
 * The one copy source that is not the catalogue: STYLE §4.4 keeps every
 * diagnostic in canonical English inside the producers and translates it in
 * `src/i18nDiagnostics.ts`, and §5.1 exempts exactly that table from the
 * "all copy lives in `i18n.ts`" rule. Those Chinese renderings show up in the
 * same data-checks panel as a dictionary value, so the punctuation, quotation,
 * dash and escape guards below read them too — mined from the source text, the
 * way the other guards read the source tree, because a hand-kept list of the
 * strings that exist today is one a new rule could silently dodge.
 */
const DIAGNOSTICS = diagnosticsLiterals();
/** The same literals as the reader sees them. */
const DIAG_ZH: [string, string][] = DIAGNOSTICS.map((pair): [string, string] => [pair[0], ruleText(pair[1])]);

/**
 * Every copy string the localiser holds, as `[address, literal]` pairs where
 * the literal is still the source text, escapes visible: the `zh:` value of
 * each `RULES` entry — a double- or single-quoted string, or the template an
 * arrow `zh` returns — plus the Chinese half of each `NEWICK_HEADS` pair.
 * `re:` patterns hold canonical English and are not copy, so they stay out.
 */
function diagnosticsLiterals(): [string, string][] {
  const p = join(SRC, "i18nDiagnostics.ts");
  const source = read(p);
  const body = stripComments(source);
  // The Newick heads are a `[regex, chinese]` table rather than `zh:` pairs, so
  // they are read from their own slice of the file.
  const heads = body.slice(body.indexOf("NEWICK_HEADS: ["), body.indexOf("function localizeNewick"));
  const found: [string, string][] = [];
  const push = (m: RegExpMatchArray): void => {
    const lit = m[1];
    if (!lit) return;
    // Addressed by the line the literal sits on, so a failure is greppable.
    found.push([`${rel(p)}:${source.slice(0, source.indexOf(lit)).split("\n").length}`, lit]);
  };
  for (const m of body.matchAll(/zh:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) push(m);
  for (const m of body.matchAll(/zh:\s*\([^()]*\)\s*=>\s*(`(?:[^`\\]|\\.)*`)/g)) push(m);
  for (const m of heads.matchAll(/,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\]/g)) push(m);
  return found;
}

/** A mined literal as the user reads it: `${…}` holes — which splice in a
 *  captured value, not copy — dropped, and the escapes the source needed for
 *  its own quotes resolved. */
function ruleText(lit: string): string {
  return lit.slice(1, -1).replace(/\$\{[^{}]*\}/g, "").replace(/\\([^0-9A-Za-z])/g, "$1");
}

/**
 * Dictionary reads, resolved from the syntax tree rather than from bare words.
 *
 * A key is rendered only if something READS it off the dictionary itself, and
 * only the parser can tell `t.actions` (a read) from `"rpv.sec.actions"` (a
 * localStorage section id), `...load.patch` (a local from `loadDoc()`) or a
 * `// t.load …` comment. Comments and string/template literals are not nodes in
 * the tree at all, so neither can vouch for a key; and the receiver of an access
 * is checked, so a same-named property on some other object cannot either. That
 * is what STYLE §5.5 needs: the old bare-word match `\.${id}\b` let `load`,
 * `layout` and `actions` look alive while nothing rendered them.
 */

/** `useT()` / `currentDict()`: the functions that hand out the dictionary. */
const DICT_ACCESSORS = new Set(["useT", "currentDict"]);
/** `translations`: the catalogue itself, indexed by locale (`translations.en.k`). */
const DICT_CATALOGUE = new Set(["translations"]);

/** Walks an expression to its leftmost root, through casts, parens, `??` and `?:`. */
function isDictReceiver(node: ts.Node, bindings: Set<string>): boolean {
  let current: ts.Node = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (ts.isIdentifier(current)) return bindings.has(current.text) || DICT_CATALOGUE.has(current.text);
    if (ts.isCallExpression(current)) {
      return ts.isIdentifier(current.expression) && DICT_ACCESSORS.has(current.expression.text);
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isConditionalExpression(current)) {
      return isDictReceiver(current.whenTrue, bindings) || isDictReceiver(current.whenFalse, bindings);
    }
    if (ts.isBinaryExpression(current)) {
      return isDictReceiver(current.left, bindings) || isDictReceiver(current.right, bindings);
    }
    return false;
  }
}

/** Names bound to a dictionary inside one file: by `Dict` annotation or by the
 *  accessor they are initialised from. Visited twice so an alias declared after
 *  the dictionary it copies still resolves. */
function dictBindings(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const declare = (node: ts.Node): void => {
    if (ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) {
      if (node.type && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(sf) === "Dict" && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name) && isDictReceiver(node.initializer, names)) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, declare);
  };
  declare(sf);
  declare(sf);
  return names;
}

/** Every property name read off the dictionary in `text` (also nested leaves:
 *  `t.event.speciation` reports both `event` and `speciation`). */
function dictionaryReads(text: string): Set<string> {
  const sf = ts.createSourceFile("dictionary-reads.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = dictBindings(sf);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isDictReceiver(node.expression, bindings)) {
      found.add(node.name.text);
    }
    if (ts.isElementAccessExpression(node) && isDictReceiver(node.expression, bindings)) {
      const arg = node.argumentExpression;
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) found.add(arg.text);
    }
    if (ts.isObjectBindingPattern(node)) {
      const holder = node.parent;
      const init = holder && ts.isVariableDeclaration(holder) ? holder.initializer : undefined;
      if (init && isDictReceiver(init, bindings)) {
        for (const el of node.elements) {
          const prop = el.propertyName ?? el.name;
          if (ts.isIdentifier(prop)) found.add(prop.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Source that may render UI copy: first-party code, not the catalogue itself
 *  and not the tests (an assertion is not a render). */
const RENDERING = FILES.filter((p) => rel(p) !== "src/i18n.ts" && !/\.test\.(tsx?)$/.test(p));

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

  it("states the same numbers in both languages", () => {
    // The Chinese side once spelled out 「（仅显示前 500 个节点）」 where the English
    // interpolated `{n}` from `NODE_ROW_CAP`: bumping the constant would have
    // made one locale lie. So a written digit has to have a counterpart on the
    // other side — itself, or the same value spelled ("one" / 「三」, since the
    // catalogue counts in all three shapes). Chinese numerals are deliberately
    // not counted, only excused: 「一致」 and 「一次」 would otherwise read as a 1
    // in every second string. Above ten there is no agreed spelling, so a digit
    // must match a digit.
    const cjk: Record<string, string> = { "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九", "10": "十" };
    const words: Record<string, string> = { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };
    const digits = (t: string): string[] => (t.replace(/\{[a-zA-Z]+\}/g, "").match(/\d+(?:\.\d+)?/g) ?? []).slice();
    const spelledIn = (other: string, d: string): boolean => {
      const han = cjk[d];
      const english = words[d];
      if (han === undefined || english === undefined) return false;
      return other.includes(han) || new RegExp(`\\b${english}\\b`, "i").test(other);
    };
    const unmatched = (own: string[], otherText: string, other: string[]): string[] => {
      const pool = [...other];
      const left: string[] = [];
      for (const d of own) {
        const at = pool.indexOf(d);
        if (at >= 0) pool.splice(at, 1);
        else if (!spelledIn(otherText, d)) left.push(d);
      }
      return left;
    };
    const en = new Map(EN);
    const bad = ZH.map(([k, zh]) => {
      const enText = en.get(k) ?? "";
      const left = [...unmatched(digits(enText), zh, digits(zh)), ...unmatched(digits(zh), enText, digits(enText))];
      return left.length === 0 ? null : `${k}: en[${digits(enText)}] zh[${digits(zh)}]`;
    }).filter((x): x is string => x !== null);
    expect(bad).toEqual([]);
  });

  it("uses one ellipsis form (U+2026) and no ASCII three dots", () => {
    const bad = [...EN, ...ZH, ...DIAG_ZH].filter(([, v]) => v.includes("...")).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("never stores escaped \\uXXXX sequences in the copy sources", () => {
    // STYLE §2.10: the character is written as itself. An escape is invisible
    // to every punctuation guard below, because the guard would read `\u2014`
    // where the user reads `—`, so both catalogue and localiser are checked as
    // written — here the literal keeps its quotes for exactly that reason.
    expect(read(join(SRC, "i18n.ts"))).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    const escaped = DIAGNOSTICS.filter(([, lit]) => /\\u[0-9a-fA-F]{4}/.test(lit)).map(([at]) => at);
    expect(escaped).toEqual([]);
  });

  it("has no forced uppercase or letter-spaced micro-labels", () => {
    expect(read(join(SRC, "styles.css"))).not.toMatch(/text-transform\s*:\s*uppercase/);
  });

  it("keeps the no-plural-(s) rule", () => {
    const bad = [...EN, ...ZH].filter(([, v]) => /\(\w*\(s\)|\(s\)/.test(v) && /\(s\)/.test(v)).map(([k]) => k);
    expect(bad).toEqual([]);
    // The ban is not dictionary-only: the canonical English the parser, exporter
    // and analysis layers emit reaches the user through `i18nDiagnostics`, and it
    // hedged its counts until STYLE §3.6 was applied there too. Requiring a
    // lowercase word after the hedge keeps code forms (`isFinite(s) ||`,
    // `map((s) =>`, `commit(s, "open"`) out of the result.
    const hedged = FILES.map(rel)
      .filter((p) => /^src\/(parser|export|analysis|state)\//.test(p) && !/\.test\./.test(p))
      .flatMap((p) =>
        (
          stripComments(read(join(ROOT, p))).match(/[A-Za-z]{3,}\((?:s|es)\)\s+[a-z]/g) ?? []
        ).map((h) => `${p}: ${h}`),
      );
    expect(hedged).toEqual([]);
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
    // STYLE §2.4 holds for the translated diagnostics too. The bracket that is
    // itself quoted — `括号不配对（多出的 ")" 没有对应的 "("）` — names a character
    // of the pattern the message explains instead of grouping prose, so quoted
    // spans are read out first; a span never crosses a Han character, so no
    // piece of copy can hide inside one.
    const diagBad = DIAG_ZH.filter(
      ([, v]) => /[\u4e00-\u9fff]/.test(v) && /[()]/.test(v.replace(/"[^"\u4e00-\u9fff]*"/g, "")),
    ).map(([k]) => k);
    expect(diagBad).toEqual([]);
  });

  it("keeps the dash the style guide names, single and by its own width", () => {
    // STYLE §2.5. The doubled em dash was the old house style; the dictionary
    // is a spaced single em dash everywhere now, and the doubled form
    // reappearing in ANY file under src/ — a comment in the localiser counts,
    // since that prose is read while the rules are edited — would quietly undo
    // the unification, so this sweep covers the whole tree rather than the copy
    // values alone. Written as an escape, like `inspNone` above, because the
    // guard would otherwise report its own source.
    const doubledEmDash = "\u2014\u2014";
    const doubled = walk(SRC).filter((p) => read(p).includes(doubledEmDash)).map(rel);
    expect(doubled).toEqual([]);
    // ` - ` may never act as a dash, a numeric range takes the en dash (`0–1`),
    // and the one em dash that carries no space is the empty mark of §3.7.
    const all = [...EN, ...ZH, ...DIAG_ZH];
    expect(all.filter(([, v]) => / - /.test(v)).map(([k]) => k)).toEqual([]);
    expect(all.filter(([, v]) => /\d-\d/.test(v)).map(([k]) => k)).toEqual([]);
    expect(all.filter(([, v]) => /(\S—|—\S)/.test(v) && v.trim() !== "—").map(([k]) => k)).toEqual([]);
  });

  it("quotation marks follow the language of the string", () => {
    // STYLE §2.8: English “ ”, Chinese 「 」, and never both in one sentence.
    // The localiser wraps the captured tokens it passes through in plain
    // quotes as code spans (`"$1"`) — neither system, and GLOSSARY 使用规则 1
    // keeps those machine-readable names out of the term table — so only the
    // two real quotation systems are compared, in both directions.
    const zhSide = [...ZH, ...DIAG_ZH];
    expect(zhSide.filter(([, v]) => /[“”]/.test(v)).map(([k]) => k)).toEqual([]);
    expect(EN.filter(([, v]) => /[「」]/.test(v)).map(([k]) => k)).toEqual([]);
    expect([...EN, ...zhSide].filter(([, v]) => /[“”]/.test(v) && /[「」]/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it("keeps control characters and doubled punctuation out of the copy", () => {
    // STYLE §2.10, and the reason §4.4 needs it: a diagnostic is composed from
    // a rule string nobody saw at dictionary-review time.
    const all = [...EN, ...ZH, ...DIAG_ZH];
    expect(all.filter(([, v]) => /[\t\r\0]/.test(v)).map(([k]) => k)).toEqual([]);
    expect(all.filter(([, v]) => /[。，、；：！？]{2}|\.{2}|[,;:!?]{2}/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it("mines every rule string the localiser actually holds", () => {
    // The guards above read `DIAGNOSTICS`, so they are only as good as the
    // mining: a rule written in a shape the three patterns do not cover — a
    // `zh` returned through a helper, a string split over lines — would simply
    // be missing rather than failing. Checked against the live table the app
    // renders from, so nothing here is a snapshot of today's wording.
    expect(DIAGNOSTICS.length).toBe(RULES.length + NEWICK_HEADS.length);
    const seen = new Set(DIAG_ZH.map(([, v]) => v));
    const missed = RULES.filter((r) => typeof r.zh === "string" && !seen.has(r.zh)).map((r) => r.re.source);
    expect(missed).toEqual([]);
    expect(NEWICK_HEADS.map(([, zh]) => zh).filter((zh) => !seen.has(zh))).toEqual([]);
  });

  it("never restates an internal identifier in user-visible copy", () => {
    // docs/GLOSSARY-UI.md 使用规则 1: the machine-readable names (XML tags, CSV
    // columns, session keys) are exempt from the term table but must not be
    // echoed in human-readable text. This is what let `No timeSlice on the
    // donor` and `Check the speciesLocation annotations` into the checks panel.
    const allowed = new Set(["recPhyloXML", "aLRT"]);
    const bad = [...EN, ...ZH]
      .flatMap(([k, v]) => (v.match(/\b[a-z]+[A-Z]\w*/g) ?? []).filter((w) => !allowed.has(w)).map((w) => `${k}: ${w}`));
    expect([...new Set(bad)]).toEqual([]);
  });

  it("marks an empty value with — and with none of its banned aliases", () => {
    // docs/GLOSSARY-UI.md 空值 / STYLE-GUIDE-UI.md §3.7: the empty mark is `—` in
    // both languages. Only a whole value is a mark, so prose that happens to
    // contain the word "none" stays legal. A genuine OPTION called "None" would
    // be a different concept and needs a glossary row first (GLOSSARY 前言),
    // which is the right moment to widen this set - not before.
    const banned = new Set(["?", "?.", "n/a", "none", "(none)", "unnamed", "(unnamed)", "no species"]);
    const bad = [...EN, ...ZH].filter(([, v]) => banned.has(v.trim().toLowerCase())).map(([k]) => k);
    expect(bad).toEqual([]);
    expect(translations.en.inspNone).toBe("\u2014");
    expect(translations.zh.inspNone).toBe("\u2014");
    expect(translations.en.notApplicable).toBe("\u2014");
    expect(translations.zh.notApplicable).toBe("\u2014");
  });

  it("keeps the display and statistics layers from falling back to a bare ? for an empty value", () => {
    // Same rule as above, at the sites that render or tabulate: `x || "?"` put a
    // banned mark on screen (and into the statistics CSV) beside cells that
    // already used `—`. The parser and the exporters are exempt — GLOSSARY
    // 使用规则 1 lets machine-readable output keep its own placeholders.
    const layers = (re: RegExp) =>
      FILES.filter((p) => re.test(rel(p)) && !/\.test\.(tsx?)$/.test(rel(p))).map(rel);
    const offenders = layers(/^src\/(app|render|analysis)\//).filter((p) =>
      /(?:\|\||\?\?)[ \t]*"\?"/.test(stripComments(read(join(ROOT, p)))),
    );
    expect(offenders).toEqual([]);
    const unnamed = layers(/^src\/(app|render|analysis|parser)\//).filter((p) =>
      stripComments(read(join(ROOT, p))).includes('"(unnamed)"'),
    );
    expect(unnamed).toEqual([]);
  });

  it("declines every unit the interface counts", () => {
    // STYLE §3.6: the number comes from code and the English singular comes from
    // `countLabel()`. Handing it a label instead of a unit - the table header
    // "Non-loss lineages" was - renders "1 Non-loss lineages", so every unit
    // named at a call site has to be declared in the declension table, and its
    // Chinese form has to carry a counter word. The last assertion is the same
    // rule backwards: a unit nobody counts is dead data.
    const en = new Map(EN);
    const zh = new Map(ZH);
    const units = new Set<string>();
    for (const p of FILES) {
      if (/\.test\.(tsx?)$/.test(rel(p))) continue;
      for (const m of stripComments(read(p)).matchAll(/countLabel\([^;]*?,\s*(?:t|dict)\.(\w+)\s*\)/g)) {
        units.add(m[1]);
      }
    }
    expect([...units].sort()).toEqual(
      ["copiesUnit", "geneNodes", "geneTreeUnit", "leavesUnit", "matchCount", "species", "warnings"],
    );
    const undeclined = [...units].filter((k) => {
      const v = en.get(k);
      return v === undefined || !Object.prototype.hasOwnProperty.call(SINGULAR_UNITS, v);
    });
    expect(undeclined).toEqual([]);
    expect([...units].filter((k) => !/^[个棵条项次]/.test(zh.get(k) ?? ""))).toEqual([]);
    const counted = new Set([...units].map((k) => en.get(k) ?? ""));
    expect(Object.keys(SINGULAR_UNITS).filter((u) => !counted.has(u))).toEqual([]);
  });

  it("keeps the locale branch out of components", () => {
    // STYLE §5.2 bans `locale === "zh" ? … : …` in the component and logic
    // layers: it is the one shape that can print English into the Chinese UI.
    // `translations[locale]` covers copy, and the BCP-47 tags now come from the
    // shared `htmlLang` / `intlTag` maps, so what may remain is purely visual
    // state — an active class name and a radio button's checked flag.
    const allowed = [/locale === "zh" \? " active" : ""/, /on=\{locale === "zh"\}/];
    const offenders = RENDERING.filter((p) => {
      if (rel(p) === "src/i18nDiagnostics.ts") return false; // §4.4: the sanctioned localiser
      const text = allowed.reduce((t, re) => t.replace(re, ""), stripComments(read(p)));
      return /locale [!=]== ["']zh["']/.test(text);
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("names every modifier a tooltip actually binds", () => {
    // STYLE §3.3/§3.4: a tooltip that shows only the macOS glyph tells a Windows
    // or Linux user that Ctrl+Z does not exist, while the handler binds the same
    // chord to `metaKey || ctrlKey` (app/App.tsx, app/Canvas.tsx). Static copy
    // therefore names both spellings; the only place allowed to name one is the
    // menu accelerator, which is generated from the platform.
    const offenders = FILES.filter(
      (p) => /^src\/app\//.test(rel(p)) && !/\.test\.(tsx?)$/.test(rel(p)),
    ).flatMap((p) =>
      stripComments(read(p))
        .split("\n")
        .filter((line) => /data-tooltip=/.test(line) && line.includes("⌘") && !line.includes("Ctrl"))
        .map((line) => `${rel(p)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("has no Chinese copy outside the catalogue", () => {
    // STYLE §5.2. The exception this used to make for the language endonyms is
    // gone: `langNameZh` and `langNameEn` carry 「中文」 and "English" in both
    // dictionaries, so an untranslatable name is still catalogue copy and a
    // stray Han literal anywhere else fails here with no whitelist to hide in.
    const allowed = new Set(["src/i18n.ts", "src/i18nDiagnostics.ts"]);
    const offenders = FILES.filter(
      (p) =>
        !allowed.has(rel(p)) &&
        !/\.test\.(ts|tsx)$/.test(p) &&
        CJK.test(stripComments(read(p))),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("reaches the Chinese catalogue only through the locale index", () => {
    // STYLE §5.2 forbids `locale === "zh" ? translations.zh : translations.en`.
    // A bilingual ternary is the one shape that prints English into the Chinese
    // UI, so outside the catalogue only `translations[locale]` may pick a
    // dictionary (`en` stays legal as the missing-locale fallback).
    const offenders = RENDERING.filter((p) =>
      /translations\.zh\b|translations\[\s*["']zh["']\s*\]/.test(stripComments(read(p))),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("leaves no dictionary key unreferenced", () => {
    // Everything a key could be read by, resolved from the syntax trees.
    const readNames = new Set<string>();
    for (const p of RENDERING) for (const name of dictionaryReads(read(p))) readNames.add(name);
    // Sample names are read through a computed lookup (`t[s.labelKey]`), so the
    // key lives in data, not in a property access.
    const dynamic = new Set(
      [...read(join(SRC, "samples", "index.ts")).matchAll(/(?:labelKey|nestedLabelKey|compareLabelKey):\s*"(\w+)"/g)].map(
        (m) => m[1],
      ),
    );
    const roots = [...new Set([...EN].map(([k]) => k.split(/[.[]/)[0]))];
    // A nested value (`event.speciation`) must ALSO be read by its own name, or
    // one dead entry could hide inside a live map.
    const leaves = [...new Set([...EN].map(([k]) => k.replace(/^(.*)\.(.*)$/, "$2")).filter((k) => !k.endsWith("]")))];
    const dead = [
      ...roots.filter((k) => !dynamic.has(k) && !readNames.has(k)),
      ...leaves.filter((k) => !dynamic.has(k) && !roots.includes(k) && !readNames.has(k)),
    ];
    expect([...new Set(dead)]).toEqual([]);
  });

  it("does not let comments, string literals or same-named locals vouch for a key", () => {
    // Shapes that satisfied the old bare-word guard while rendering nothing.
    const reads = (text: string) => [...dictionaryReads(text)].sort();
    expect(reads("const load = loadDoc(); set({ ...load.patch, ok: load.ok });")).toEqual([]);
    expect(reads('localStorage.getItem("rpv.sec.actions"); const k = "rpv.sec.layout"; void k;')).toEqual([]);
    expect(reads("// t.proseOne and /* t.proseTwo */ t.proseThree\nconst t = useT(); void t;")).toEqual([]);
    expect(reads('const path = `a.${oneKey}.b`; void path;')).toEqual([]);
    expect(reads("useStore.getState().closePanel(); const s = useStore((x) => x.closePanel); void s;")).toEqual([]);
    expect(reads("theme.event.speciation")).toEqual([]);
    expect(reads("options.fullLabels")).toEqual([]);
    // Real dictionary reads still count, including through the forms the app uses.
    expect(reads("const t = useT(); return t.loadMore;")).toEqual(["loadMore"]);
    expect(reads("const dict = currentDict(); return dict.loadMore;")).toEqual(["loadMore"]);
    expect(reads("return translations[locale].loadMore;")).toEqual(["loadMore"]);
    // `translations.en` is itself a read off the catalogue, hence the `en`.
    expect(reads("return (fallback ?? translations.en).loadMore;")).toEqual(["en", "loadMore"]);
    expect(reads("return useT().loadMore;")).toEqual(["loadMore"]);
    expect(reads('const t = useT(); return t["loadMore"];')).toEqual(["loadMore"]);
    expect(reads("const t = useT(); const { loadMore } = t; return loadMore;")).toEqual(["loadMore"]);
    expect(reads("const t = useT(); return <span>{t.loadMore}</span>;")).toEqual(["loadMore"]);
    expect(reads("const t = useT(); return `x ${t.loadMore} y`;")).toEqual(["loadMore"]);
    expect(reads("function f(t: Dict) { return t.loadMore; }")).toEqual(["loadMore"]);
    // A nested leaf is only live on a chain rooted at the dictionary.
    expect(reads("const t = useT(); return t.event.speciation;")).toEqual(["event", "speciation"]);
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

/**
 * The manuals QUOTE interface copy, and a quote is the one place where a
 * document can contradict the app while every code path stays green: the
 * Chinese manual announced 「已将 N 个文件合并为 1 个文档」 long after the toast
 * had become 「已将 N 个文件合并为一个文档」. Only sentences the doc introduces
 * as verbatim UI text are read — a section title, a licence clause or a product
 * name in quotes is not a claim about copy, and guessing at those drowns the
 * signal in exceptions.
 */
describe("manuals quoting shipped copy", () => {
  /** Every literal a source file holds, escapes resolved and template holes
   *  read as one wildcard: canonical English is produced at the call site. */
  function stringLiteralsIn(path: string): string[] {
    const sf = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) out.push(node.text);
      else if (ts.isTemplateExpression(node)) {
        let text = node.head.text;
        for (const span of node.templateSpans) text += "＊" + span.literal.text;
        out.push(text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  /** `scripts/` is copy too: the headless CLI's usage text is what the README
   *  and the manual's command lines describe, so a quoted help line has to be
   *  findable in the same corpus as a quoted button. */
  const SCRIPTS = readdirSync(join(ROOT, "scripts"))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => join(ROOT, "scripts", f));

  const COPY = [
    ...EN.map(([, v]) => v),
    ...ZH.map(([, v]) => v),
    ...DIAG_ZH.map(([, v]) => v),
    ...[...RENDERING, ...SCRIPTS].flatMap(stringLiteralsIn),
  ].map(shapeOf);
  const SHAPES = [...new Set(COPY)].filter((s) => s.length > 1);

  /** A string as the guard compares it: every interpolated value is the same
   *  wildcard, so `Top {n} of {total}` and "Top X of Y" are one shape. */
  function shapeOf(s: string): string {
    return s
      .replace(/\{[a-zA-Z]+\}/g, "＊")
      .replace(/\$\d/g, "＊")
      .replace(/<[a-zA-Z]+>/g, "＊")
      .replace(/\bv(?:\d|[NXMY])\b/g, "v＊")
      .replace(/(?:^|(?<=[\s(（【「]))[NXMY#](?=[\s).）;；,，、」]|$)/g, "＊")
      .replace(/\d+/g, "＊")
      .replace(/…+$/u, "")
      .replace(/\s+/g, "");
  }

  const CLAIMS: [string, RegExp][] = [
    ["docs/USER_MANUAL.zh-CN.md", /(?:显示|提示|弹出|标题为|标记为|写作|称为)[^「]{0,6}「([^」]+)」/g],
    ["docs/USER_MANUAL.md", /(?:shows|reads|says|note|titled|labelled|confirms?|reports?|displays?|prints?|writes)\s+"([^"]{3,200})"/g],
    // English also names the widget AFTER the quotation: `a "Exported" toast`.
    ["docs/USER_MANUAL.md", /"([^"]{3,200})"\s+(?:toast|note|label|message|dialog|heading|caption|button|entry|error)s?\b/g],
  ];

  /** A claim is rendered when some copy has that shape — or holds it, because
   *  a manual quotes one clause of a longer message — and the row of a panel
   *  note counts when every `·`-separated half of it does. The test only ever
   *  runs one way: a claim that merely CONTAINS a short string is not a quote
   *  of it, which is what let 「…合并为一个文档」 pass while the shipped toast
   *  still said 「…合并为 1 个文档」. */
  function isCopy(claim: string): boolean {
    return shapeOf(claim)
      .split("·")
      .filter((p) => p.length > 1)
      .every((p) => SHAPES.some((c) => c.includes(p)));
  }

  /** Sections are the other thing a document names inside quotation marks: the
   *  changelog advertises a new `"Known limitations" section`, CONTRIBUTING tells
   *  the reader to keep the `"Session file fields" list` in step with the code.
   *  CONTRIBUTING used to say `"what a session contains"`, a heading no manual
   *  ever had. A quoted name counts when it matches a heading of any document or
   *  copy the app can render, because the manuals quote both kinds. */
  const MD_DOCS = [ROOT, join(ROOT, "docs")]
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".md") && statSync(join(dir, f)).isFile())
        .map((f) => join(dir, f)),
    )
    .sort();
  const SECTIONS = [...new Set(MD_DOCS.flatMap((p) => headingsOf(read(p)).map(shapeOf)))];

  function sectionClaims(): [string, number, string][] {
    const out: [string, number, string][] = [];
    for (const p of MD_DOCS) {
      const text = read(p);
      for (const re of [/"([^"\n]{3,80})"\s+(?:list|section|table|note|paragraph|column)\b/gi, /「([^」\n]{2,40})」\s*(?:清单|列表|一节|小节|表格|段落)/g])
        for (const m of text.matchAll(re))
          out.push([rel(p), text.slice(0, m.index).split("\n").length, m[1]]);
    }
    return out;
  }

  it("names only sections that exist and copy the app renders", () => {
    const claims = sectionClaims();
    const bad = claims
      .filter(([, , c]) => !isCopy(c) && !SECTIONS.some((s) => s.includes(shapeOf(c))))
      .map(([file, line, c]) => `${file}:${line} ${c}`);
    expect(bad).toEqual([]);
    // Seven claims today, so the floor leaves room for a document to drop one.
    expect(claims.length).toBeGreaterThanOrEqual(5);
  });

  it("quotes only copy the app can render", () => {
    const bad = CLAIMS.flatMap(([file, re]) => {
      const text = read(join(ROOT, file));
      return [...text.matchAll(re)]
        .filter((m) => !isCopy(m[1]))
        .map((m) => `${file}:${text.slice(0, m.index).split("\n").length} ${m[1]}`);
    });
    expect(bad).toEqual([]);
  });

  it("reads enough claims for that result to mean something", () => {
    // A regex that stopped matching anything would pass the guard above. The
    // manuals hold ~31 claims today, so the floor is a third below that: enough
    // slack for a reworded sentence, low enough for a dropped pattern to trip.
    const read_ = CLAIMS.map(([file, re]) => [...read(join(ROOT, file)).matchAll(re)].length);
    expect(read_.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(24);
  });
});

/**
 * The Chinese documents are TRANSLATIONS of the English ones, not abridgements
 * of them, and the audit's largest single class was a pair drifting apart: a
 * section, a table row, a link target or a URL that exists on one side only.
 * None of it could be caught by reading either language alone, so the pair is
 * compared structurally — the same shapes, in the same number, in both.
 */
describe("documentation pairs", () => {
  const dirs = [ROOT, join(ROOT, "docs")];
  const zhDocs = dirs
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".zh-CN.md") && statSync(join(dir, f)).isFile())
        .map((f) => join(dir, f)),
    )
    .sort();
  const PAIRS: [string, string][] = zhDocs.map((zh) => [zh.replace(/\.zh-CN\.md$/, ".md"), zh]);

  /** A page anchor as GitHub resolves it, so a TOC link can be checked. */
  const slugOf = (h: string): string =>
    h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
  const anchorsIn = (text: string): string[] => [...text.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  const tableRowsIn = (text: string): number => text.split("\n").filter((l) => /^\s*\|/.test(l)).length;
  const fencesIn = (text: string): number => (text.match(/^```/gm) ?? []).length;
  const urlsIn = (text: string): Set<string> =>
    new Set([...text.matchAll(/https?:\/\/[^)\s>]+/g)].map((m) => m[0].replace(/[.,;:!?、。）)】]+$/, "")));

  it("translates a document that exists on both sides", () => {
    const orphan = zhDocs.filter((z) => !existsSync(z.replace(/\.zh-CN\.md$/, ".md"))).map(rel);
    expect(orphan).toEqual([]);
    // Six pairs today: the five root documents and the user manual.
    expect(PAIRS.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the sections, tables and code blocks of every pair even", () => {
    const bad: string[] = [];
    for (const [enP, zhP] of PAIRS) {
      const en = read(enP);
      const zh = read(zhP);
      const [eh, zhH] = [headingsOf(en).length, headingsOf(zh).length];
      const [et, zt] = [tableRowsIn(en), tableRowsIn(zh)];
      const [ef, zf] = [fencesIn(en), fencesIn(zh)];
      if (eh !== zhH) bad.push(`${rel(enP)}: ${eh} headings vs ${zhH} in ${rel(zhP)}`);
      if (et !== zt) bad.push(`${rel(enP)}: ${et} table rows vs ${zt} in ${rel(zhP)}`);
      if (ef !== zf) bad.push(`${rel(enP)}: ${ef} code fences vs ${zf} in ${rel(zhP)}`);
    }
    expect(bad).toEqual([]);
  });

  it("resolves every in-page anchor and shares every URL", () => {
    const bad: string[] = [];
    for (const [enP, zhP] of PAIRS) {
      const en = read(enP);
      const zh = read(zhP);
      const enSlugs = new Set(headingsOf(en).map(slugOf));
      const zhSlugs = new Set(headingsOf(zh).map(slugOf));
      for (const a of anchorsIn(en)) if (!enSlugs.has(a)) bad.push(`${rel(enP)}: #${a} in neither heading list`);
      // A Chinese TOC may link to the English slug it was translated from; it
      // may not link to a heading that exists in neither language.
      for (const a of anchorsIn(zh))
        if (!enSlugs.has(a) && !zhSlugs.has(a)) bad.push(`${rel(zhP)}: #${a} in neither heading list`);
      const [enUrls, zhUrls] = [urlsIn(en), urlsIn(zh)];
      for (const u of enUrls) if (!zhUrls.has(u)) bad.push(`${rel(enP)}: ${u} missing from ${rel(zhP)}`);
      for (const u of zhUrls) if (!enUrls.has(u)) bad.push(`${rel(zhP)}: ${u} missing from ${rel(enP)}`);
    }
    expect(bad).toEqual([]);
  });

  /** The figures a document states are part of what it states, so a pair that
   *  disagrees about one describes different software: the English manual once
   *  wrote "no longer scores as full agreement" where the Chinese one said
   * 「不会再得到 100% 一致」. A number may be spelled out on the other side —
   * `three` ↔ 「三」, "3-level" ↔ 「三层」 — so one spelled occurrence excuses
   * one digit, and no number outside the 1–10 table can be spelled away. */
  const CN_NUM: Record<string, string> = {
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
    "8": "八",
    "9": "九",
    "10": "十",
  };
  const EN_NUM: Record<string, string> = {
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
    "10": "ten",
  };
  /** Every number written with digits, with the punctuation a sentence hangs
   *  off its tail removed. */
  function numbersIn(text: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of text.matchAll(/\d[\d,.]*/g)) {
      const v = m[0].replace(/[.,]+$/, "");
      out.set(v, (out.get(v) ?? 0) + 1);
    }
    return out;
  }
  const hitsOf = (text: string, source: string, flags: string): number =>
    (text.match(new RegExp(source, flags)) ?? []).length;

  it("puts the same digits, or their spellings, in both languages of a pair", () => {
    const bad: string[] = [];
    for (const [enP, zhP] of PAIRS) {
      const [en, zh] = [read(enP), read(zhP)];
      const [e, z] = [numbersIn(en), numbersIn(zh)];
      for (const [v, c] of e) {
        const short = c - (z.get(v) ?? 0);
        if (short <= 0) continue;
        const spelled = CN_NUM[v];
        if (spelled !== undefined && hitsOf(zh, spelled, "g") >= short) continue;
        bad.push(`${rel(enP)}: ${v} ×${c}, ${rel(zhP)} ×${z.get(v) ?? 0}`);
      }
      for (const [v, c] of z) {
        const short = c - (e.get(v) ?? 0);
        if (short <= 0) continue;
        const spelled = EN_NUM[v];
        if (spelled !== undefined && hitsOf(en, `\\b${spelled}\\b`, "gi") >= short) continue;
        bad.push(`${rel(zhP)}: ${v} ×${c}, ${rel(enP)} ×${e.get(v) ?? 0}`);
      }
    }
    expect(bad).toEqual([]);
    // A guard over six pairs is worth something only while all six are read.
    expect(PAIRS.length).toBeGreaterThanOrEqual(5);
  });
});
