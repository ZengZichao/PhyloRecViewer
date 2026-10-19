import { describe, expect, it } from "vitest";
import { defaultLayoutOptions } from "./layout";
import { defaultRenderOptions } from "./render/options";
import {
  CURRENT_SESSION_VERSION,
  parseSession,
  serializeSession,
  type SessionData,
} from "./session";

const base: SessionData = {
  version: CURRENT_SESSION_VERSION,
  fileName: "x.recphyloxml",
  xml: "<recPhylo/>",
  nestedName: null,
  nestedXml: null,
  compareName: "alt.recphyloxml",
  compareXml: "<recPhylo/>",
  layoutOptions: defaultLayoutOptions,
  renderOptions: defaultRenderOptions,
  themeId: "light",
  swapped: ["A"],
  nestedSwapped: ["B"],
  collapsed: [],
  geneColors: { 0: "#123456" },
};

describe("session serialize/parse", () => {
  it("round-trips a full session", () => {
    const parsed = parseSession(serializeSession(base));
    expect(parsed.xml).toBe(base.xml);
    expect(parsed.swapped).toEqual(["A"]);
    expect(parsed.nestedSwapped).toEqual(["B"]);
    expect(parsed.geneColors).toEqual({ 0: "#123456" });
    expect(parsed.themeId).toBe("light");
    expect(parsed.compareName).toBe("alt.recphyloxml");
    expect(parsed.compareXml).toBe("<recPhylo/>");
  });

  it("defaults compare fields to null for a document without them", () => {
    const doc = JSON.stringify({ version: 1, xml: "<recPhylo/>", swapped: ["A"] });
    const parsed = parseSession(doc);
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    expect(parsed.compareName).toBeNull();
    expect(parsed.compareXml).toBeNull();
  });

  it("fills in nestedSwapped for a document that has none", () => {
    const bare = JSON.stringify({ version: 1, xml: "<recPhylo/>", swapped: ["A"] });
    const parsed = parseSession(bare);
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    expect(parsed.swapped).toEqual(["A"]);
    expect(parsed.nestedSwapped).toEqual([]);
  });

  it("rejects a document from a newer app version", () => {
    const future = JSON.stringify({ version: 999, xml: "<recPhylo/>" });
    expect(() => parseSession(future)).toThrow(/newer version/);
  });

  it("rejects a document that is not a session", () => {
    expect(() => parseSession("{}")).toThrow(/PhyloRecViewer session/);
    expect(() => parseSession("{ not json")).toThrow(/valid JSON/);
  });

  it("defends against malformed array/color fields", () => {
    const bad = JSON.stringify({
      version: 1,
      xml: "<recPhylo/>",
      swapped: "not-an-array",
      collapsed: [1, "ok", null],
      geneColors: "nope",
    });
    const parsed = parseSession(bad);
    expect(parsed.swapped).toEqual([]);
    expect(parsed.collapsed).toEqual(["ok"]);
    expect(parsed.geneColors).toEqual({});
  });

  it("sanitizes out-of-range / wrong-typed option values instead of trusting them", () => {
    const hostile = JSON.stringify({
      version: 1,
      xml: "<recPhylo/>",
      layoutOptions: { levelHeight: -50, geneGap: "big", layoutMode: "hacked", extra: 1 },
      renderOptions: {
        orientation: "diagonal",
        geneThickness: 9999,
        speciesOpacity: 42,
        symbolSize: null,
        transferBow: -3,
        speciesLabelStyle: { size: "x", angle: 5000, align: "bogus" },
      },
    });
    const parsed = parseSession(hostile);
    expect(parsed.layoutOptions.levelHeight).toBeGreaterThanOrEqual(20);
    expect(parsed.layoutOptions.geneGap).toBe(defaultLayoutOptions.geneGap);
    expect(parsed.layoutOptions.layoutMode).toBe("rectangular");
    expect((parsed.layoutOptions as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(parsed.renderOptions.orientation).toBe("top");
    expect(parsed.renderOptions.geneThickness).toBeLessThanOrEqual(10);
    expect(parsed.renderOptions.speciesOpacity).toBeLessThanOrEqual(1);
    expect(parsed.renderOptions.symbolSize).toBe(defaultRenderOptions.symbolSize);
    expect(parsed.renderOptions.transferBow).toBeGreaterThanOrEqual(0);
    expect(parsed.renderOptions.speciesLabelStyle.size).toBe(defaultRenderOptions.speciesLabelStyle.size);
    expect(parsed.renderOptions.speciesLabelStyle.angle).toBeLessThanOrEqual(180);
    expect(parsed.renderOptions.speciesLabelStyle.align).toBe("auto");
  });

  it("round-trips v5 tab snapshots and drops malformed tab entries", () => {
    const withTabs: SessionData = {
      ...base,
      tabs: [
        {
          title: "other.nhx",
          xml: "(a[&&NHX:S=A:D=N],b[&&NHX:S=A:D=N])[&&NHX:S=A:D=N];",
          swapped: [],
          nestedSwapped: [],
          collapsed: [],
          geneColors: {},
        },
        { title: "broken" } as never,
      ],
      activeTabIndex: 0,
    };
    const parsed = parseSession(serializeSession(withTabs));
    expect(parsed.tabs).toHaveLength(1);
    expect(parsed.tabs![0].title).toBe("other.nhx");
    expect(parsed.activeTabIndex).toBe(0);
  });

  it("keeps v4 documents (no tabs) loadable", () => {
    const parsed = parseSession(JSON.stringify({ version: 1, xml: "<recPhylo/>" }));
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    expect(parsed.tabs).toBeUndefined();
  });
});
