/**
 * Coverage for `store.batchReplaceLabels`: the bulk rename of species /
 * gene labels, including that the non-regex path treats `find` as a literal
 * (no regex-injection / ReDoS surface) and the regex path works as intended.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore } from "./store";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  localStorage.clear();
  useStore.setState({ recon: null, labelOverrides: {}, past: [], future: [] });
});

const NHX =
  "((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];";

describe("batchReplaceLabels", () => {
  it("literal replace does not interpret regex metacharacters (no injection)", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    // A regex-unsafe literal find: if it were compiled as a regex this would
    // either throw or match nothing; the literal path must replace exactly.
    useStore.getState().batchReplaceLabels("_g", "->g", false, "gene");
    const lo = useStore.getState().labelOverrides;
    expect(lo["rabbit_g1"]).toBe("rabbit->g1");
    expect(lo["rabbit_g2"]).toBe("rabbit->g2");
    expect(lo["platypus_g"]).toBe("platypus->g");
  });
  it("regex replace applies globally", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().batchReplaceLabels("rabbit", "RBT", true, "gene");
    const lo = useStore.getState().labelOverrides;
    expect(lo["rabbit_g1"]).toBe("RBT_g1");
    expect(lo["rabbit_g2"]).toBe("RBT_g2");
  });
  it("an invalid regex is a no-op, not a crash", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().batchReplaceLabels("(", "x", true, "gene");
    expect(useStore.getState().labelOverrides).toEqual({});
  });
  it("empty find is a no-op", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().batchReplaceLabels("", "x", false, "all");
    expect(useStore.getState().labelOverrides).toEqual({});
  });
});
