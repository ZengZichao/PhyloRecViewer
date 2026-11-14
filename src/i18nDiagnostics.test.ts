import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  localizeDiagnostic,
  localizeExample,
  NEWICK_HEADS,
  RULES,
} from "./i18nDiagnostics";

/** The only flag sets this app ever passes to `new RegExp`. */
const APP_FLAGS = ["i", "g"];

/** V8's canonical message for `pattern`, exactly as `focus.ts` receives it. */
function rawOf(pattern: string, flags: string): string {
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`${JSON.stringify(pattern)} compiles with flags ${JSON.stringify(flags)}`);
}

/** The English reason clause V8 appended to `raw`. */
function reasonOf(raw: string): string {
  return raw.slice(raw.lastIndexOf(": ") + 2);
}

/** The translated tail of a rendered message, i.e. the clause the rule produced. */
function clauseOf(rendered: string): string {
  return rendered.slice(rendered.lastIndexOf("：") + 1);
}

const SOURCE = readFileSync(join(process.cwd(), "src/i18nDiagnostics.ts"), "utf8");

/** Which table entry renders a canonical message, in `translate`'s own order:
 *  a Newick head first, then the first rule whose pattern matches, else none. */
function routeOf(text: string): string {
  const head = NEWICK_HEADS.findIndex(([re]) => re.test(text));
  if (head >= 0) return `Newick head ${head}`;
  const rule = RULES.findIndex(({ re }) => re.test(text));
  return rule >= 0 ? `rule ${rule}` : "nothing";
}

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
    // GLOSSARY row 26: the term is "time slice" / 「时间片」, never `timeSlice`;
    // row 36 + STYLE §3.7: the empty mark is `—` in both locales, so no
    // `(unnamed)` / 「未命名」 cell can reach the checks panel or the QC report.
    expect(localizeExample("Rabbit @depth 3", "zh")).toBe("Rabbit，深度 3");
    expect(localizeExample("\u2014 @depth 3", "zh")).toBe("\u2014，深度 3");
    expect(localizeExample("x: time slice 2", "zh")).toBe("x：时间片 2");
    expect(localizeExample("x: time slice 2 < 3", "zh")).toBe("x：时间片 2 < 3");
    expect(localizeExample("g1 (into ancestor R)", "zh")).toBe("g1（进入祖先 R）");
    expect(localizeExample("x: time slice 2", "en")).toBe("x: time slice 2");
    for (const cell of [
      "\u2014 @depth 3",
      "Rabbit @depth 3",
      "x: time slice 2",
      "x: time slice 2 < 3",
      "g1 (into ancestor R)",
    ]) {
      const zh = localizeExample(cell, "zh");
      expect(zh, cell).not.toMatch(/timeSlice|unnamed|未命名|\$\d/);
      // Every cell pattern the localiser still carries must actually localise:
      // no English wording of the validator may survive into the panel.
      expect(zh, cell).not.toMatch(/@depth|time slice|into ancestor/);
    }
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
      ["3 nodes carry multiple transfer arrivals; only the first can be written to NHX", "多个转移到达"],
      ["Gene tree is nested too deep (possible malformed input).", "嵌套过深"],
      [rawOf("(", "i"), "分组括号未闭合"],
      // The messages whose rule this round had to retarget, rebuild or repair.
      ["The species tree is nested too deep.", "该物种树嵌套过深"],
      [
        'Gene node "g" has an unrecognized <eventsRec> child "Loss" (recPhyloXML event names are case-sensitive; did you mean "loss"?); it was not read as an event, so this node\'s event list may be incomplete.',
        "是否想用",
      ],
      [
        'Gene node "g" has an unrecognized <eventsRec> child "Bogus"; it was not read as an event, so this node\'s event list may be incomplete.',
        "无法识别",
      ],
      [
        'Gene node "g" carries 2 <transferBack> arrivals; the node\'s species and the NHX export use the first (B).',
        "转移到达",
      ],
      [
        'Gene node "g" declares conflicting arrival species: <transferBack destinationSpecies="A"/> vs the terminal event\'s speciesLocation="B"; the node and its transfer edge are placed in "B".',
        "转移到达物种",
      ],
      [
        'Clade "c" carries a <moleculeType> element this reader does not interpret; its content was not imported.',
        "PhyloRecViewer 不解析",
      ],
      [
        'Gene node "g" carries multiple terminal events (duplication + loss); keeping "duplication".',
        "基因重复",
      ],
      [
        'Gene node "g" is a terminal Newick leaf but carries an internal-event tag; it is kept as a duplication (an upstream tool may have pruned it).',
        "仍按基因重复处理",
      ],
      [
        'Gene node "g" carries conflicting event tags (duplication + loss); keeping "duplication" (the precedence shared with recPhyloXML).',
        "基因重复",
      ],
      [
        "This NHX file uses 2 tag keys this reader does not interpret and has dropped: XX, YY. Species, duplication, loss, donor and arrival state comes only from S=/SP=, D=, L=, BO=, BC= and TB=.",
        "XX, YY",
      ],
      [
        "fam2.xml: its species tree is missing 2 branches present in the first file's species tree (e.g. A, B); the merged view is drawn on the first file's species tree only.",
        "（如 A, B）",
      ],
      ["3 time slice values are not representable in NHX", "时间片"],
      // A Newick head that only `localizeNewick` owns: its rule used to demand
      // a space before the ")" the parser never writes, so it matched nothing.
      ['Unterminated node comment (missing "]") (at offset 4, near "[&NHX:S=").', "节点注释未闭合"],
    ];
    const untranslated = cases.filter(([en, zh]) => !localizeDiagnostic(en, "zh").includes(zh)).map(([en]) => en);
    expect(untranslated).toEqual([]);
    for (const [en] of cases) {
      expect(localizeDiagnostic(en, "en")).toBe(en);
      // A `$n` with no capture group behind it prints into the panel verbatim.
      expect(localizeDiagnostic(en, "zh"), en).not.toMatch(/\$\d/);
      expect(routeOf(en), en).not.toBe("nothing");
    }
    // No banned alias, and no English event identifier, survives a translation.
    for (const [en] of cases) {
      expect(localizeDiagnostic(en, "zh"), en).not.toMatch(/标注|未命名|\(unnamed\)|timeSlice|到达事件|本读取器|基因叶|叶节点/);
    }
    // Two rules for one message make the later one dead code.
    const winners = cases.map(([en]) => routeOf(en));
    expect(new Set(winners).size, "each battery message routes to one rule").toBe(winners.length);
    // A rule must not stop at the first period of a two-sentence message and
    // leave the app's own second sentence in English.
    const dropped = cases.find(([en]) => en.startsWith("This NHX file uses"));
    expect(dropped, "the battery needs the dropped-tag-keys message").toBeDefined();
    const droppedZh = localizeDiagnostic(dropped?.[0] ?? "", "zh");
    expect(droppedZh).toContain("状态只取自 S=/SP=、D=、L=、BO=、BC= 与 TB=。");
    expect(droppedZh).not.toContain("Species, duplication, loss, donor");
  });

  /**
   * STYLE §3.6 bans the `(s)` hedge and §6 requires a count of 1 to read as a
   * singular, so every count-bearing canonical message exists in two declined
   * forms. Both must reach the table - a rule that only recognises one number
   * would print English into the Chinese panel for the other.
   */
  it("declines every count-bearing message for one and for many", () => {
    const NHX_TAIL =
      "this reader does not interpret and has dropped: {LIST}. Species, duplication, loss, donor and arrival state comes only from S=/SP=, D=, L=, BO=, BC= and TB=.";
    const MERGED_TAIL = " the merged view is drawn on the first file's species tree only.";
    const pairs: [string, string][] = [
      [
        "1 node carries multiple transfer arrivals; only the first can be written to NHX",
        "2 nodes carry multiple transfer arrivals; only the first can be written to NHX",
      ],
      [
        "1 time slice value is not representable in NHX",
        "2 time slice values are not representable in NHX",
      ],
      [
        "1 event confidence value is not representable in NHX",
        "2 event confidence values are not representable in NHX",
      ],
      [
        "1 species tree taxon is not sampled by any gene tree and would disappear from the NHX species reconstruction",
        "2 species tree taxa are not sampled by any gene tree and would disappear from the NHX species reconstruction",
      ],
      [
        "1 species branch length is not carried by the NHX species tree",
        "2 species branch lengths are not carried by the NHX species tree",
      ],
      [
        "1 gene tree name is not written to NHX",
        "2 gene tree names are not written to NHX",
      ],
      [
        '1 gene tree <phylogeny> element omits the schema-required rooted="true" attribute; assuming rooted trees.',
        '2 gene tree <phylogeny> elements omit the schema-required rooted="true" attribute; assuming rooted trees.',
      ],
      [
        `This NHX file uses 1 tag key ${NHX_TAIL.replace("{LIST}", "XX")}`,
        `This NHX file uses 2 tag keys ${NHX_TAIL.replace("{LIST}", "XX, YY")}`,
      ],
      [
        `fam2.xml: its species tree has 1 branch that differs from the first file's species tree;${MERGED_TAIL}`,
        `fam2.xml: its species tree has 2 branches that differ from the first file's species tree;${MERGED_TAIL}`,
      ],
      [
        `fam2.xml: its species tree is missing 1 branch present in the first file's species tree (e.g. A);${MERGED_TAIL}`,
        `fam2.xml: its species tree is missing 2 branches present in the first file's species tree (e.g. A, B);${MERGED_TAIL}`,
      ],
      [
        "1 species referenced by merged families is absent from the first file's species tree.",
        "2 species referenced by merged families are absent from the first file's species tree.",
      ],
    ];
    for (const [one, many] of pairs) {
      expect(`${one} / ${many}`).not.toMatch(/\((s|es)\)/);
      const route = routeOf(one);
      expect(route, one).not.toBe("nothing");
      expect(routeOf(many), many).toBe(route);
      for (const text of [one, many]) {
        expect(localizeDiagnostic(text, "en"), text).toBe(text);
        const zh = localizeDiagnostic(text, "zh");
        expect(zh, text).not.toBe(text);
        expect(zh, text).not.toMatch(/\$\d|timeSlice/);
      }
    }
  });

  /**
   * `parser/formats.ts` prefixes every merged-document warning with the file it
   * came from and `state/store.ts` does the same for the encoding check, so the
   * `^` anchors of the table never saw the message: the Chinese panel printed
   * English. The prefix must not defeat the rule, and must not be translated.
   */
  it("localizes a canonical message that a producer prefixed with a file name", () => {
    const cases: [string, string][] = [
      ['fam2.xml: Gene node "g" references unknown species "Ghost".', "未知物种"],
      [
        "fam2.xml: Species tree contains duplicate species names; references resolve to the first occurrence.",
        "重复的物种名",
      ],
      [
        "utf16.nhx: This file does not appear to be UTF-8 text (it contains NUL bytes, as UTF-16 files do when decoded as UTF-8). Re-export it as UTF-8 and try again.",
        "不像 UTF-8 文本",
      ],
      [
        'latin.xml: The XML declaration says encoding="ISO-8859-1" but the file was decoded as UTF-8. Non-UTF-8 files (e.g. ISO-8859-1) are not supported; re-save the file as UTF-8.',
        "声明为",
      ],
      [
        'bad.nwk: Unterminated node comment (missing "]") (at offset 4, near "abc").',
        "节点注释未闭合",
      ],
    ];
    for (const [raw, zh] of cases) {
      const got = localizeDiagnostic(raw, "zh");
      const name = raw.slice(0, raw.indexOf(": "));
      expect(got, raw).toContain(zh);
      expect(got, raw).toContain(name); // the file the warning came from survives
      expect(got, raw).not.toContain(raw.slice(raw.indexOf(": ") + 2)); // English gone
      expect(localizeDiagnostic(raw, "en")).toBe(raw);
    }
  });

  it("does not let a prefix turn other prose into a translation target", () => {
    // Splitting off a "<name>: " prefix may only ever help a rule that already
    // needs it; nothing looser is allowed to fire.
    const passthrough = [
      "fam.xml: Something the parsers never say.",
      "a: b: Gene node references unknown species",
      "fam.xml: Unterminated group",
      "notes: see the README",
    ];
    for (const raw of passthrough) expect(localizeDiagnostic(raw, "zh"), raw).toBe(raw);
  });

  it("translates the Newick error a species-tree file wraps, not just its shell", () => {
    const raw =
      'The species tree is not valid Newick: Unbalanced parentheses in Newick (at offset 7, near "AB").';
    const zh = localizeDiagnostic(raw, "zh");
    expect(zh).toContain("物种树不是有效的 Newick：");
    expect(zh).toContain("括号不配对");
    expect(zh).toContain("偏移 7");
    expect(zh).not.toContain("Unbalanced parentheses");
  });
});

/**
 * A rule that no message can hit is dead code that still costs a reader's
 * attention, and a `$3` with no third capture group prints `$3` into the panel.
 * Both are checked here against the shipped table and against the producers in
 * `src/` that build the canonical English (STYLE §4.4, GLOSSARY 使用规则 1).
 */
describe("rule table hygiene", () => {
  /** The files that emit canonical diagnostics. */
  const PRODUCERS = [
    "src/parser/recphyloxml.ts",
    "src/parser/nhx.ts",
    "src/parser/newick.ts",
    "src/parser/speciesTree.ts",
    "src/parser/formats.ts",
    "src/state/store.ts",
    "src/session.ts",
    "src/export/recPhyloXmlExport.ts",
    "src/export/exporters.ts",
    "src/analysis/validate.ts",
  ];

  /** Where a message is emitted, and which argument of the call holds it. */
  const SINKS: { re: RegExp; arg: number }[] = [
    { re: /\b(?:warnings|losses)\.push\(/g, arg: 0 },
    { re: /\bnew [A-Za-z]*Error\(/g, arg: 0 },
    { re: /\bpush\((?=issues,)/g, arg: 3 },
    // `detectEncodingProblem` hands its message back to `store.ts` as a return.
    { re: /\breturn\s+(?=["`])/g, arg: -1 },
  ];

  const OPENERS = "([{";
  const CLOSERS = ")]}";
  const HOLE = "\u0000";

  /** The index of the quote closing the string that starts at `i`. */
  function closeQuote(src: string, i: number): number {
    const q = src[i];
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === "\\") j++;
      else if (src[j] === q) return j;
    }
    return src.length - 1;
  }

  /** The index of the delimiter closing the one opened at `i`. */
  function closeOf(src: string, i: number): number {
    const closer = CLOSERS[OPENERS.indexOf(src[i])];
    let depth = 0;
    for (let j = i; j < src.length; ) {
      const c = src[j];
      if (c === '"' || c === "'") {
        j = closeQuote(src, j) + 1;
        continue;
      }
      if (c === "`") {
        j = closeTemplate(src, j) + 1;
        continue;
      }
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) {
        depth--;
        if (depth === 0 && c === closer) return j;
      }
      j++;
    }
    return src.length - 1;
  }

  /** Where an expression that starts at `i` ends: its first top-level `;`. */
  function exprEnd(src: string, i: number): number {
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'") {
        i = closeQuote(src, i);
        continue;
      }
      if (c === "`") {
        i = closeTemplate(src, i);
        continue;
      }
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) {
        if (depth === 0) return i;
        depth--;
      } else if (c === ";" && depth === 0) return i;
    }
    return src.length;
  }

  /** The index of the backtick closing the template literal that starts at `i`. */
  function closeTemplate(src: string, i: number): number {
    for (let j = i + 1; j < src.length; j++) {
      const c = src[j];
      if (c === "\\") j++;
      else if (c === "`") return j;
      else if (c === "$" && src[j + 1] === "{") j = closeOf(src, j + 1);
    }
    return src.length - 1;
  }

  /** The text between a pair of quotes, with the escapes JS would decode. */
  function decode(body: string): string {
    return body.replace(/\\u\{?([\da-f]{1,6})\}?/gi, (_m, cp: string) =>
      String.fromCodePoint(Number.parseInt(cp, 16)),
    )
      .replace(/\\(.)/g, "$1");
  }

  /** The `?`/`:` branches of a conditional expression, or the expression itself. */
  function branches(expr: string): string[] {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' || c === "'") {
        i = closeQuote(expr, i);
        continue;
      }
      if (c === "`") {
        i = closeTemplate(expr, i);
        continue;
      }
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) depth--;
      else if (depth === 0 && c === "?" && expr[i + 1] !== "?" && expr[i + 1] !== ".") {
        let d2 = 0;
        for (let j = i + 1; j < expr.length; j++) {
          const e = expr[j];
          if (e === '"' || e === "'") {
            j = closeQuote(expr, j);
            continue;
          }
          if (e === "`") {
            j = closeTemplate(expr, j);
            continue;
          }
          if (OPENERS.includes(e)) d2++;
          else if (CLOSERS.includes(e)) d2--;
          else if (d2 === 0 && e === ":") return [expr.slice(i + 1, j), expr.slice(j + 1)];
        }
      }
    }
    return [expr];
  }

  /** A template literal's skeletons: literal text is copied, every `${…}` hole
   *  becomes `HOLE` - unless the hole is a conditional, which contributes both
   *  of its branches, because that is how a producer declines a count. */
  function templateText(body: string): string[] {
    let results = [""];
    let text = "";
    const flush = (): void => {
      if (!text) return;
      results = results.map((r) => r + text);
      text = "";
    };
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (c === "\\") {
        text += c + (body[j + 1] ?? "");
        j++;
        continue;
      }
      if (c === "$" && body[j + 1] === "{") {
        const end = closeOf(body, j + 1);
        const alts = branches(body.slice(j + 2, end));
        if (alts.length > 1) {
          const parts = alts.flatMap((a) => skeletons(a));
          flush();
          results = results.flatMap((r) => parts.map((p) => r + p));
        } else {
          text += HOLE;
        }
        j = end;
        continue;
      }
      text += c;
    }
    flush();
    return results.map((r) => decode(r));
  }

  /** Every literal skeleton an expression can build: quotes and template text
   *  are copied, `${…}` holes become `HOLE`, and a conditional contributes both
   *  of its branches, because the producer picks one at runtime. */
  function skeletons(expr: string): string[] {
    let results = [""];
    let text = "";
    const flush = (): void => {
      if (!text) return;
      results = results.map((r) => r + text);
      text = "";
    };
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' || c === "'") {
        const end = closeQuote(expr, i);
        text += decode(expr.slice(i + 1, end));
        i = end;
        continue;
      }
      if (c === "`") {
        const end = closeTemplate(expr, i);
        flush();
        const parts = templateText(expr.slice(i + 1, end));
        results = results.flatMap((r) => parts.map((p) => r + p));
        i = end;
        continue;
      }
      if (c === "(") {
        const end = closeOf(expr, i);
        flush();
        const inner = branches(expr.slice(i + 1, end)).flatMap(skeletons);
        results = results.flatMap((r) => inner.map((v) => r + v));
        i = end;
      }
    }
    flush();
    return results;
  }

  /** The concrete messages a hole-filled skeleton stands for. */
  function instances(skeleton: string): string[] {
    const parts = skeleton.split(HOLE);
    const holes = parts.length - 1;
    if (holes === 0) return [skeleton];
    const out: string[] = [];
    for (let combo = 0; combo < 1 << Math.min(holes, 5); combo++) {
      let text = parts[0];
      for (let k = 0; k < holes; k++) text += ((combo >> k) & 1 ? "x" : "3") + parts[k + 1];
      out.push(text);
    }
    return out;
  }

  /** Every canonical message the producers can build, holes filled. */
  function builtMessages(): { file: string; text: string; skeleton: string }[] {
    const out: { file: string; text: string; skeleton: string }[] = [];
    for (const file of PRODUCERS) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      for (const sink of SINKS) {
        for (const m of src.matchAll(sink.re)) {
          const at = (m.index ?? 0) + m[0].length;
          const body = src.slice(at, sink.arg < 0 ? exprEnd(src, at) : closeOf(src, at - 1));
          const message = sink.arg < 0 ? body : splitArgs(body)[sink.arg];
          if (!message) continue;
          // `nhx.ts` picks between two whole messages with an unparenthesised
          // conditional, so the choice has to be split before the scan.
          for (const alternative of branches(message)) {
            for (const skeleton of skeletons(alternative)) {
              if (!skeleton.includes(" ")) continue;
              for (const text of instances(skeleton)) out.push({ file, text, skeleton });
            }
          }
        }
      }
    }
    return out;
  }

  /** The arguments inside a call's parentheses, split at its top-level commas. */
  function splitArgs(call: string): string[] {
    const out: string[] = [];
    let from = 0;
    let depth = 0;
    for (let i = 0; i < call.length; i++) {
      const c = call[i];
      if (c === '"' || c === "'") {
        i = closeQuote(call, i);
        continue;
      }
      if (c === "`") {
        i = closeTemplate(call, i);
        continue;
      }
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) depth--;
      else if (c === "," && depth === 0) {
        out.push(call.slice(from, i));
        from = i + 1;
      }
    }
    out.push(call.slice(from));
    return out;
  }

  /** How many capture groups a pattern has, ignoring classes and `(?:…`-forms. */
  function groupsIn(pattern: string): number {
    let groups = 0;
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (inClass) {
        if (c === "]") inClass = false;
        continue;
      }
      if (c === "[") {
        inClass = true;
        if (pattern[i + 1] === "^") i++;
        continue;
      }
      if (c !== "(") continue;
      const n = pattern[i + 1];
      if (n === "?") {
        const after = pattern[i + 2];
        // `(?<name>` captures; `(?:`, `(?=`, `(?!`, `(?<=` and `(?<!` do not.
        if (after !== "<" || pattern[i + 3] === "=" || pattern[i + 3] === "!") continue;
      }
      groups++;
    }
    return groups;
  }

  /** The `$n` references a replacement target expands. */
  function refsIn(target: string): number[] {
    return [...target.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  }

  /** Every `.replace(/literal/flags, "target")` call in the localiser's source. */
  function replaceCalls(): { at: number; pattern: string; flags: string; target: string }[] {
    const out: { at: number; pattern: string; flags: string; target: string }[] = [];
    for (const m of SOURCE.matchAll(
      /\.replace\(\/((?:\\.|[^/\\])*)\/([a-z]*),\s*(["'])((?:\\.|(?!\3).)*)\3\s*\)/g,
    )) {
      out.push({ at: m.index ?? 0, pattern: m[1], flags: m[2], target: m[4] });
    }
    return out;
  }

  /** The `.replace()` calls of `localizeExample`, i.e. the validator's cells. */
  function exampleCalls(): { pattern: string; flags: string }[] {
    const start = SOURCE.indexOf("export function localizeExample");
    expect(start, "localizeExample is where the example cells are translated").toBeGreaterThan(-1);
    return replaceCalls()
      .filter((call) => call.at > start)
      .map(({ pattern, flags }) => ({ pattern, flags }));
  }

  const built = builtMessages();
  const cells = built.filter((b) => b.file === "src/analysis/validate.ts").map((b) => b.text);

  it("rebuilds a message for every table entry the producers can say", () => {
    expect(built.length, "the producers yielded no message at all").toBeGreaterThan(60);
    // Two `.replace()` calls take their pattern from a variable - the Newick
    // head loop and the rule loop, both audited above through `NEWICK_HEADS`
    // and `RULES` - so the literal-pattern scan below misses exactly those.
    expect([...SOURCE.matchAll(/\.replace\(/g)].length, "every .replace call is audited").toBe(
      replaceCalls().length + 2,
    );
  });

  /**
   * STYLE §4.4 makes the canonical English a producer builds the English the
   * diagnostics panel shows, so §2.5 governs it as copy - and no dictionary
   * guard ever sees it, which is how `a 0-100 percentage rather than a 0-1
   * probability` reached the panel with hyphens for ranges. Duplicated
   * punctuation is NOT checked here: a message quotes the NHX marker
   * `[&&NHX:S=...]`, whose ellipsis is syntax the user must be able to match.
   */
  it("keeps the dash the style guide names in the canonical English too", () => {
    const doubled = "\u2014\u2014";
    const offenders = [
      ...new Set(
        built
          .map((b) => b.text)
          .filter(
            (text) =>
              text.includes(doubled) ||
              / - /.test(text) ||
              /\d-\d/.test(text) ||
              /(\S—|—\S)/.test(text) ||
              /[\t\r\0]/.test(text),
          ),
      ),
    ];
    expect(offenders).toEqual([]);
  });

  /**
   * GLOSSARY row 20 fixes the empty mark as `—` in BOTH locales, and the names
   * a producer interpolates can BE empty (a gene node with no species, a tree
   * with no label), so the mark travels into the canonical message. A rule
   * whose capture cannot hold it would silently print English into the Chinese
   * panel for exactly those files. Two shapes are checked: one hole at a time
   * for the route, so a count in another hole never fakes a miss, and every
   * hole at once for the rendering, because a producer may interpolate one and
   * the same value twice (`keeping BL=${x}` after `BL=${x}`) and half-marking
   * it describes a message no parser can emit.
   */
  it("routes and renders a name hole filled with the empty mark", () => {
    const fill = (skeleton: string, token: string, at = -1): string => {
      const parts = skeleton.split(HOLE);
      let text = parts[0];
      for (let k = 0; k < parts.length - 1; k++) text += (at < 0 || k === at ? token : "3") + parts[k + 1];
      return text;
    };
    const skeletons = [...new Set(built.map((b) => b.skeleton))];
    let routed = 0;
    let rendered = 0;
    for (const skeleton of skeletons) {
      const holes = skeleton.split(HOLE).length - 1;
      for (let k = 0; k < holes; k++) {
        const route = routeOf(fill(skeleton, "x", k));
        if (route === "nothing") continue;
        routed++;
        expect(routeOf(fill(skeleton, "—", k)), `hole ${k} of ${skeleton.replace(/\0/g, "⟨⟩")}`).toBe(route);
      }
      if (holes === 0) continue;
      const dash = fill(skeleton, "—");
      if (routeOf(dash) === "nothing") continue;
      rendered++;
      const zh = localizeDiagnostic(dash, "zh");
      expect(zh, dash).not.toBe(dash);
      expect(zh, dash).toContain("—");
      expect(zh, dash).not.toMatch(/\$\d/);
    }
    expect(routed, "the producers interpolate names").toBeGreaterThan(10);
    expect(rendered, "a marked-up message reaches the Chinese panel").toBeGreaterThan(10);
  });

  it("reaches every rule in the table from a message a producer can build", () => {
    const hit = new Set<number>();
    const headHit = new Set<number>();
    for (const { text } of built) {
      const index = RULES.findIndex(({ re }) => re.test(text));
      const head = NEWICK_HEADS.findIndex(([re]) => re.test(text));
      if (head >= 0) headHit.add(head);
      // A message a Newick head owns has no rule, and one no rule owns is a
      // message the panel would show in English whatever the locale is.
      if (index < 0 || head >= 0) continue;
      expect(localizeDiagnostic(text, "zh"), text).not.toBe(text);
      expect(localizeDiagnostic(text, "zh"), text).not.toMatch(/\$\d/);
      hit.add(index);
    }
    const engineRule = (source: string): boolean =>
      source.startsWith("^Invalid regular expression: ");
    const dead = RULES.map((r, i) => [r.re.source, i] as const)
      .filter(([source, i]) => !engineRule(source) && !hit.has(i))
      .map(([source]) => source);
    expect(dead, "rules no producer can reach").toEqual([]);
    const deadHeads = NEWICK_HEADS.map((h, i) => [h[0].source, i] as const)
      .filter(([, i]) => !headHit.has(i))
      .map(([source]) => source);
    expect(deadHeads, "Newick heads no producer can reach").toEqual([]);
  });

  /**
   * A hard-coded count is not a dictionary-only hazard: `（仅显示前 500 个节点）`
   * sat in the catalogue beside an interpolated English `{n}` for a whole
   * release, and the same drift is possible in a rule. So every number a built
   * message spells belongs in its Chinese rendering too, the same number of
   * times. Each skeleton is rebuilt with ONE value in every hole: the producers
   * interpolate the same expression twice (`keeping BL=${nd.nhx.BL}` after
   * `BL=${nd.nhx.BL}`), and a scan that fills those holes independently makes
   * the English and its rendering disagree about a value no file can produce.
   */
  it("carries every number of a built message into its Chinese rendering", () => {
    const digits = (s: string): string[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).sort();
    const token = "73";
    const bad = new Set<string>();
    let checked = 0;
    for (const skeleton of [...new Set(built.map((b) => b.skeleton))]) {
      const text = skeleton.split(HOLE).join(token);
      if (digits(text).length === 0 || routeOf(text) === "nothing") continue;
      checked++;
      const zh = localizeDiagnostic(text, "zh");
      expect(zh, text).not.toBe(text);
      const en = digits(text);
      const zhDigits = digits(zh);
      if (en.join(",") !== zhDigits.join(",")) bad.add(`en[${en}] zh[${zhDigits}] ${text}`);
    }
    expect([...bad]).toEqual([]);
    expect(checked, "the producers build digit-bearing messages").toBeGreaterThan(10);
  });

  /**
   * `localizeExample` translates the compact cells `validate.ts` pushes as an
   * issue's example; a pattern for a cell the validator never builds is dead
   * code that will silently swallow a future cell instead of translating it.
   */
  it("translates every example cell the validator builds, and no others", () => {
    expect(cells.length, "the validator builds example cells").toBeGreaterThan(10);
    for (const { pattern, flags } of exampleCalls()) {
      const probe = new RegExp(pattern, flags);
      const cell = cells.find((c) => probe.test(c));
      expect(cell, `no validator example cell matches ${pattern}`).toBeTruthy();
      expect(localizeExample(cell ?? "", "zh")).not.toBe(cell);
    }
    // The other direction: no cell may keep an English marker untranslated.
    for (const cell of cells) {
      expect(localizeExample(cell, "zh"), cell).not.toMatch(/ @depth |: time slice | \(into ancestor /);
    }
  });

  it("gives every replacement target only the groups its pattern captures", () => {
    for (const { re, zh } of RULES) {
      const groups = groupsIn(re.source);
      if (typeof zh === "function") {
        // `translate` spreads the match, so the function sees $& plus the groups.
        expect(zh.length, re.source).toBeLessThanOrEqual(groups + 1);
        continue;
      }
      for (const n of refsIn(zh)) {
        expect(n, re.source).toBeLessThanOrEqual(groups);
        expect(n, re.source).toBeGreaterThan(0);
      }
    }
    for (const [re, zh] of NEWICK_HEADS) expect(refsIn(zh), re.source).toEqual([]);
    for (const { pattern, target } of replaceCalls()) {
      for (const n of refsIn(target)) {
        expect(n, pattern).toBeLessThanOrEqual(groupsIn(pattern));
        expect(n, pattern).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * One producer is not part of this app at all: `src/analysis/focus.ts` hands
 * the search panel the raw `SyntaxError.message` that `new RegExp` throws, and
 * `RightPanel` prints it under the translated `正则表达式无效` headline. V8
 * words those reasons in English whatever the interface language is, so each
 * one needs a rule here (STYLE §4.4).
 *
 * Nothing below is hand-written engine output: each expected string is what a
 * real `new RegExp(pattern, flags)` throw produced with the flag sets the app
 * itself passes - that is the defence against a rule that reads plausibly but
 * matches no message the engine can emit, since V8 reserves much of its regexp
 * wording for the `u`/`v` flags nothing here compiles with. The battery holds
 * one entry per reachable reason, found by fuzzing every reason template V8
 * ships against those flag sets.
 */
describe("JS engine regular-expression diagnostics", () => {
  /** One entry per reason `APP_FLAGS` can produce; every pattern must yield it. */
  const ENGINE_CASES: { zh: string; patterns: string[] }[] = [
    { zh: "分组括号未闭合", patterns: ["(", "(?=a", "(?<=a"] },
    { zh: "括号不配对", patterns: [")", "a)b"] },
    { zh: "分组写法无效", patterns: ["(?x", "(?i:a)", "(?"] },
    { zh: "捕获组名称无效", patterns: ["(?<1a>b", "(?<"] },
    { zh: "引用了不存在的命名捕获组", patterns: ["(?<name>a)\\k<other>"] },
    { zh: "命名引用无效", patterns: ["\\k(?<", "(?<a>b)\\k"] },
    { zh: "捕获组名称重复", patterns: ["(?<a>x)(?<a>y)"] },
    { zh: "量词之前没有可重复的内容", patterns: ["*", "x**", "{2}"] },
    { zh: "量词使用无效", patterns: ["(?<=a)+", "(?<!a)*"] },
    { zh: "字符类未闭合", patterns: ["[a-", "[a-b"] },
    { zh: "字符类内的范围顺序颠倒", patterns: ["[z-a]"] },
    { zh: "量词内的数字顺序颠倒", patterns: ["a{2,1}"] },
    { zh: "转义序列无效", patterns: ["(?<a>[\\k", "(?<a>[\\k<n>"] },
    { zh: "Unicode 转义无效", patterns: ["(?<\\u"] },
    { zh: "模式以反斜杠结尾", patterns: ["\\", "a\\"] },
  ];

  /** Reasons this app cannot reach; a rule for one would never fire. */
  const DEAD_REASONS = [
    "Missing ) after argument group", // V8 words `(?x` as "Invalid group" instead
    "Invalid character class",
    "Invalid character in character class",
    "Invalid set operation in character class",
    "Lone quantifier brackets",
    "Invalid property name",
    "Invalid regular expression flags",
    "Invalid flags supplied to RegExp constructor",
  ];

  /** Escape-free copy of the source, so `Missing \)` in a rule still matches. */
  const FLAT = SOURCE.replace(/\\/g, "");

  it("translates every reason the app's own flags can produce", () => {
    for (const flags of APP_FLAGS) {
      for (const { zh, patterns } of ENGINE_CASES) {
        const expected = clauseOf(localizeDiagnostic(rawOf(patterns[0], flags), "zh"));
        for (const pattern of patterns) {
          const raw = rawOf(pattern, flags);
          const got = localizeDiagnostic(raw, "zh");
          expect(got, raw).toContain(zh);
          expect(got, raw).not.toContain(reasonOf(raw)); // no English reason survives
          expect(clauseOf(got), raw).toBe(expected); // one reason, one rule
        }
      }
    }
  });

  it("has exactly one rule per reachable reason, and none for an unreachable one", () => {
    const reasons = ENGINE_CASES.map(({ patterns }) => reasonOf(rawOf(patterns[0], "i")));
    expect(new Set(reasons).size, "the battery covers one distinct reason per rule").toBe(
      ENGINE_CASES.length,
    );
    const rules = SOURCE.split("\n").filter((line) =>
      line.includes("re: /^Invalid regular expression: "),
    ).length;
    expect(rules, "an engine rule with no reachable message, or a reason with no rule").toBe(
      ENGINE_CASES.length,
    );
    for (const dead of DEAD_REASONS) expect(FLAT, dead).not.toContain(dead);
    expect(FLAT).not.toContain("re: /^Invalid regular expression$/");
  });

  it("keeps the offending pattern visible while translating the reason", () => {
    expect(localizeDiagnostic(rawOf("(", "i"), "zh")).toBe(
      '无效的正则表达式：/(/i：分组括号未闭合（缺少匹配的 ")"）。',
    );
    expect(localizeDiagnostic(rawOf("[a-", "i"), "zh")).toBe(
      '无效的正则表达式：/[a-/i：字符类未闭合（缺少 "]"）。',
    );
    expect(localizeDiagnostic(rawOf(")", "g"), "zh")).toBe(
      '无效的正则表达式：/)/g：括号不配对（多出的 ")" 没有对应的 "("）。',
    );
  });

  it("lets no rule borrow another rule's rendering", () => {
    const shown = ENGINE_CASES.map(({ patterns }) =>
      localizeDiagnostic(rawOf(patterns[0], "i"), "zh"),
    );
    ENGINE_CASES.forEach(({ zh }, i) => {
      ENGINE_CASES.forEach((other, j) => {
        if (i === j) return;
        expect(shown[i], `case ${i} must not fire ${other.zh}`).not.toContain(other.zh);
      });
      expect(shown[i]).toContain(zh);
    });
  });

  it("matches only V8's whole clause, anchored on its own prefix", () => {
    const raw = rawOf("(", "i");
    expect(localizeDiagnostic("Unterminated group", "zh")).toBe("Unterminated group");
    expect(localizeDiagnostic(`${raw} and a tail`, "zh")).toBe(`${raw} and a tail`);
    expect(localizeDiagnostic(`noise ${raw}`, "zh")).toBe(`noise ${raw}`);
  });

  it("leaves the canonical English untouched for every other locale", () => {
    for (const flags of APP_FLAGS) {
      for (const { patterns } of ENGINE_CASES) {
        for (const pattern of patterns) {
          const raw = rawOf(pattern, flags);
          expect(localizeDiagnostic(raw, "en")).toBe(raw);
        }
      }
    }
  });

  it("passes a reason it has no rule for through in the canonical English", () => {
    const real = rawOf("(?<novel", "i");
    const invented = `${real.slice(0, real.lastIndexOf(": "))}: Some reason V8 invented last week`;
    expect(localizeDiagnostic(invented, "zh")).toBe(invented);
    expect(localizeDiagnostic(invented, "en")).toBe(invented);
  });
});
