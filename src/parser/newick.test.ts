import { describe, expect, it } from "vitest";
import {
  decodeNhxValue,
  encodeNhxValue,
  NewickParseError,
  parseNewick,
  type NewickNode,
} from "./newick";

/** Flatten a subtree into "name/length/nhx" strings for compact assertions. */
function flat(n: NewickNode): string {
  const tags = Object.entries(n.nhx)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const kids = n.children.length > 0 ? `{${n.children.map(flat).join(",")}}` : "";
  return `${n.name || "?"}/${n.length ?? ""}/${tags}${kids}`;
}

describe("comment / branch-length order", () => {
  it("accepts the comment BEFORE the length (iTOL / Raven style)", () => {
    const [t] = parseNewick("(A[&&NHX:S=a]:0.1,B[&&NHX:S=b]:0.2)R;");
    expect(flat(t)).toBe("R//{A/0.1/S=a,B/0.2/S=b}");
  });

  it("accepts the length before the comment", () => {
    const [t] = parseNewick("(A:0.1[&&NHX:S=a],B:0.2[&&NHX:S=b])R;");
    expect(flat(t)).toBe("R//{A/0.1/S=a,B/0.2/S=b}");
  });

  it("accepts them interleaved with the internal-node label", () => {
    const [t] = parseNewick("((A)a[&&NHX:S=r]:1,(B)b[&&NHX:S=r]:1)root;");
    expect(flat(t)).toBe("root//{a/1/S=r{A//},b/1/S=r{B//}}");
  });

  it("merges multiple consecutive comments on one node", () => {
    const [t] = parseNewick("(A[&&NHX:S=a][&&NHX:D=Y]:0.3)R;");
    expect(flat(t)).toBe("R//{A/0.3/S=a,D=Y}");
    expect(t.children[0].nhx).toEqual({ S: "a", D: "Y" });
  });

  it("parses a plain (non-NHX) comment before the length", () => {
    const [t] = parseNewick("(A[NHX]:0.1)R;");
    expect(t.children[0].length).toBe(0.1);
    expect(t.children[0].name).toBe("A");
  });
});

describe("error messages name the offset", () => {
  it("reports an offset and snippet for unbalanced parentheses", () => {
    let err = "";
    try {
      parseNewick("(A:0.1,B:0.2");
    } catch (e) {
      err = (e as Error).message;
    }
    expect(err).toMatch(/Unbalanced parentheses/);
    expect(err).toMatch(/at offset \d+/);
    expect(err).toMatch(/near "/);
  });

  it("rejects an unterminated comment with its position", () => {
    let err = "";
    try {
      parseNewick("A[&&NHX:S=a");
    } catch (e) {
      err = (e as Error).message;
    }
    expect(err).toMatch(/Unterminated node comment/);
    expect(err).toMatch(/at offset/);
  });

  it("throws NewickParseError (not a generic Error) on garbage", () => {
    expect(() => parseNewick(",,;")).toThrow(NewickParseError);
  });
});

describe("decodeNhxValue only reverses the known escapes", () => {
  it("decodes the four characters encodeNhxValue escapes", () => {
    expect(decodeNhxValue("a%3Ab")).toBe("a:b");
    expect(decodeNhxValue("%5Bx%5D")).toBe("[x]");
    expect(decodeNhxValue("100%25")).toBe("100%");
    expect(decodeNhxValue("%5b%5d")).toBe("[]"); // case-insensitive
  });

  it("leaves third-party percent sequences alone (100%AE stays literal)", () => {
    expect(decodeNhxValue("100%AE")).toBe("100%AE");
    expect(decodeNhxValue("50%off")).toBe("50%off");
  });

  it("round-trips through encodeNhxValue", () => {
    for (const v of ["Candida sp. JH-1:2", "a[b]c", "100%AE", "%3A", "plain"]) {
      expect(decodeNhxValue(encodeNhxValue(v))).toBe(v);
    }
  });
});

describe("bracket-free Newick statements", () => {
  it("parses a single-leaf tree", () => {
    const trees = parseNewick("SpeciesA;");
    expect(trees).toHaveLength(1);
    expect(trees[0].name).toBe("SpeciesA");
  });

  it("parses several statements", () => {
    expect(parseNewick("(A,B)R;(C,D)S;")).toHaveLength(2);
  });
});
