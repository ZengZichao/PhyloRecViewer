/**
 * Minimal Newick / NHX parser.
 *
 * Parses one or more `;`-terminated trees. Node comments in the New Hampshire
 * eXtended form `[&&NHX:key=value:...]` are decoded into the `nhx` map, which is
 * how reconciled gene trees carry their species (`S`) and duplication (`D`)
 * annotations.
 */
export interface NewickNode {
  name: string;
  length?: number;
  nhx: Record<string, string>;
  children: NewickNode[];
  /** Comment fragments that carried no `key=` and were therefore not decoded. */
  nhxUnparsed?: string[];
}

export class NewickParseError extends Error {}

const STOP = new Set(["(", ")", ",", ":", ";", "["]);

/**
 * Percent-encode the characters that would otherwise break NHX comment
 * parsing (the `:` key/value separator and the `[` `]` comment delimiters).
 * Species / strain names such as `Candida sp. JH-1:2` therefore survive an
 * NHX export → import round-trip without truncation.
 */
export function encodeNhxValue(v: string): string {
  return v
    .replace(/%/g, "%25")
    .replace(/:/g, "%3A")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D");
}

/** Inverse of {@link encodeNhxValue}.
 *
 * Only the four escapes encodeNhxValue ever produces are decoded: decoding any
 * `%XX` blindly would rewrite third-party values holding a literal percent
 * followed by hex digits (a label like `100%AE` would become `100®`).
 */
export function decodeNhxValue(v: string): string {
  return v.replace(/%(25|3A|5B|5D)/gi, (m) => String.fromCharCode(parseInt(m.slice(1), 16)));
}

/** Parse a Newick/NHX string into a forest (one entry per `;`-terminated tree). */
export function parseNewick(text: string): NewickNode[] {
  const s = text;
  const n = s.length;
  let pos = 0;
  const trees: NewickNode[] = [];

  // Bounds against malformed / adversarial input: a deeply nested tree would
  // overflow the recursion stack, and a comma-heavy string would allocate an
  // unbounded number of empty nodes. Both convert into a friendly error.
  //
  // The recursion ceiling must sit BELOW the real JS call-stack capacity,
  // otherwise a deep-but-legal tree throws an uncatchable RangeError before
  // this guard ever fires (measured overflow was ~3990 frames). We use 1000,
  // which is comfortably above any realistic reconciled tree yet safely caught.
  const MAX_DEPTH = 1000;
  const MAX_NODES = 2_000_000;
  const MAX_TREES = 100_000;
  let nodeCount = 0;

  const skipWs = (): void => {
    while (pos < n && /\s/.test(s[pos])) pos++;
  };

  // Echo where a syntax error happened: a bare "Unbalanced parentheses" tells
  // the user nothing about their 20 KB one-line string.
  const at = (what: string): string => {
    const start = Math.max(0, pos - 12);
    const raw = s.slice(start, Math.min(n, pos + 12)).replace(/\s+/g, " ");
    const snippet = raw
      ? `, near "${start > 0 ? "\u2026" : ""}${raw}${pos + 12 < n ? "\u2026" : ""}"`
      : " (end of input)";
    return `${what} (at offset ${pos}${snippet}).`;
  };

  const parseComment = (): { nhx: Record<string, string>; unparsed: string[] } => {
    // s[pos] === "["
    const end = s.indexOf("]", pos);
    if (end < 0) throw new NewickParseError(at("Unterminated node comment (missing \"]\")"));
    const raw = s.slice(pos + 1, end);
    pos = end + 1;
    const nhx: Record<string, string> = {};
    const unparsed: string[] = [];
    let c = raw;
    if (c.startsWith("&&NHX")) c = c.slice(5);
    else if (c.startsWith("&NHX")) c = c.slice(4);
    if (c.startsWith(":")) c = c.slice(1);

    // A `:` separates pairs, but only where what follows it is another `key=`:
    // splitting on every `:` truncates a value like `S=Candida sp. JH-1:2` at
    // its colon and silently drops the remainder. Only our own exports
    // percent-encode those colons, so third-party NHX needs this key-aware
    // split. Fragments that carry no `key=` surface through `nhxUnparsed`.
    const keyAt = (k: number): RegExpMatchArray | null =>
      /^[A-Za-z][A-Za-z0-9_.-]*=/.exec(c.slice(k));
    let i = 0;
    while (i < c.length) {
      const eq = c.indexOf("=", i);
      if (eq < 0) {
        const tail = c.slice(i).trim();
        if (tail) unparsed.push(tail);
        break;
      }
      let stop = c.length;
      for (let k = eq + 1; ; ) {
        const colon = c.indexOf(":", k);
        if (colon < 0) break;
        if (keyAt(colon + 1)) {
          stop = colon;
          break;
        }
        k = colon + 1;
      }
      const key = c.slice(i, eq).trim();
      if (/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) {
        nhx[key] = decodeNhxValue(c.slice(eq + 1, stop).trim());
      } else {
        unparsed.push(c.slice(i, stop).trim());
      }
      if (stop === c.length) break;
      i = stop + 1;
    }
    return { nhx, unparsed };
  };

  const parseLabel = (): string => {
    skipWs();
    if (s[pos] === "'") {
      pos++;
      let out = "";
      while (pos < n) {
        if (s[pos] === "'") {
          if (s[pos + 1] === "'") {
            out += "'";
            pos += 2;
            continue;
          }
          pos++;
          break;
        }
        out += s[pos++];
      }
      return out;
    }
    let out = "";
    while (pos < n && !STOP.has(s[pos])) out += s[pos++];
    return out.trim();
  };

  const parseNode = (depth: number): NewickNode => {
    if (depth > MAX_DEPTH) {
      throw new NewickParseError("Newick nesting is too deep (possible malformed input).");
    }
    if (++nodeCount > MAX_NODES) {
      throw new NewickParseError("Newick has too many nodes (possible malformed input).");
    }
    skipWs();
    const node: NewickNode = { name: "", nhx: {}, children: [] };
    if (s[pos] === "(") {
      pos++; // (
      for (;;) {
        node.children.push(parseNode(depth + 1));
        skipWs();
        if (s[pos] === ",") {
          pos++;
          continue;
        }
        break;
      }
      skipWs();
      if (s[pos] === ")") pos++;
      else throw new NewickParseError(at("Unbalanced parentheses in Newick"));
    }
    node.name = parseLabel();
    // Trailing annotations: node comments and the branch length may appear in
    // ANY order and comments may repeat. Reading a single form would strand
    // ":0.1" after `A[&&NHX:S=a]:0.1` on the stream and surface it as
    // "Unbalanced parentheses", and would stop at the first `[...]` of a node.
    for (;;) {
      skipWs();
      if (s[pos] === "[") {
        const { nhx, unparsed } = parseComment();
        Object.assign(node.nhx, nhx);
        if (unparsed.length) (node.nhxUnparsed ??= []).push(...unparsed);
        continue;
      }
      if (s[pos] === ":") {
        pos++;
        let num = "";
        skipWs();
        while (pos < n && !STOP.has(s[pos]) && s[pos] !== ",") num += s[pos++];
        const v = parseFloat(num);
        if (!Number.isNaN(v) && node.length === undefined) node.length = v;
        continue;
      }
      break;
    }
    return node;
  };

  let guard = 0;
  while (pos < n) {
    skipWs();
    if (pos >= n) break;
    if (s[pos] === ";") {
      pos++;
      continue;
    }
    const before = pos;
    trees.push(parseNode(0));
    skipWs();
    if (s[pos] === ";") pos++;
    // A well-formed statement always consumes input; if the cursor did not
    // advance the remainder is malformed (e.g. a leading ',' or ')').
    if (pos === before) {
      throw new NewickParseError(at("Malformed Newick (parser made no progress)"));
    }
    if (++guard > MAX_TREES) {
      throw new NewickParseError(
        `Too many trees in one file (> ${MAX_TREES}); aborting rather than silently dropping the rest.`,
      );
    }
  }
  return trees;
}

/**
 * Give post-order integer names to unnamed internal nodes.
 *
 * Used by the compare/analysis tests to give every internal node a key; the
 * production parse path does not call it (reconciled trees arrive pre-named or
 * are keyed by leaf-set signature in analysis/compare). The numbering is our
 * own post-order scheme, not a claim to match any particular tool.
 */
export function completeInternalNames(root: NewickNode): void {
  let i = 0;
  const post = (node: NewickNode): void => {
    for (const c of node.children) post(c);
    if (!node.name) node.name = String(i);
    i++;
  };
  post(root);
}
