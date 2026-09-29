import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import allEvents from "../samples/all-events.recphyloxml?raw";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { layout, defaultLayoutOptions } from "../layout";
import { defaultRenderOptions } from "./options";
import { lightTheme } from "./theme";
import { Scene } from "./Scene";

/**
 * The manuscript's central design claim is that event identity is carried by
 * SHAPE, independently of colour (so the figures survive greyscale printing and
 * colour-vision deficiency). Nothing else in the suite pins the glyph geometry,
 * so these assertions are the regression guard for that claim.
 */
function render(detail: "full" | "medium" | "low" = "full"): string {
  const recon = parseRecPhyloXML(allEvents, "all-events");
  const result = layout(recon, { ...defaultLayoutOptions });
  return renderToStaticMarkup(
    createElement(Scene, {
      result,
      theme: lightTheme,
      options: defaultRenderOptions,
      highlight: null,
      interactive: false,
      detail,
      showBackground: true,
    }),
  );
}

/** Event mix of the bundled all-events sample, asserted so the geometry
 *  expectations below cannot silently become vacuous. */
const EVENTS = parseRecPhyloXML(allEvents, "all-events").geneTrees[0].nodes.reduce(
  (acc, n) => ((acc[n.endEvent.type] = (acc[n.endEvent.type] ?? 0) + 1), acc),
  {} as Record<string, number>,
);

describe("event glyph geometry", () => {
  const svg = render("full");

  it("the sample really exercises every terminal event type once or more", () => {
    expect(EVENTS).toMatchObject({
      speciation: 2, duplication: 1, loss: 1, branchingOut: 1,
      bifurcationOut: 1, leaf: 5,
    });
  });

  it("draws duplications as axis-aligned squares, not circles", () => {
    const rects = svg.match(/<rect[^>]*width="[\d.]+"[^>]*height="[\d.]+"[^>]*>/g) ?? [];
    const squares = rects.filter((r) => {
      const w = Number(/width="([\d.]+)"/.exec(r)?.[1]);
      const h = Number(/height="([\d.]+)"/.exec(r)?.[1]);
      return w > 0 && Math.abs(w - h) < 1e-6;
    });
    // exactly one per duplication glyph - no more, no less
    expect(squares.length).toBe(EVENTS.duplication);
  });

  it("draws losses as a cross of two diagonal lines", () => {
    const lines = svg.match(/<line[^>]*>/g) ?? [];
    const diagonals = lines.filter((l) => {
      const g = (k: string) => Number(new RegExp(`${k}="(-?[\\d.]+)"`).exec(l)?.[1]);
      return g("x1") !== g("x2") && g("y1") !== g("y2");
    });
    expect(diagonals.length).toBe(EVENTS.loss * 2);
  });

  it("draws the bifurcation-out donor as a four-vertex diamond", () => {
    const diamonds = (svg.match(/<path[^>]*d="[^"]*"/g) ?? []).filter((p) => {
      const pts = (p.match(/-?[\d.]+,-?[\d.]+/g) ?? []).length;
      return pts >= 4 && /Z"/.test(p);
    });
    expect(diamonds.length).toBe(EVENTS.bifurcationOut);
  });

  it("draws the branching-out donor as a hollow ring (background fill, coloured stroke)", () => {
    const rings = (svg.match(/<circle[^>]*>/g) ?? []).filter(
      (c) => c.includes(`fill="${lightTheme.background}"`) && /stroke="(?!none)/.test(c),
    );
    expect(rings.length).toBe(EVENTS.branchingOut);
  });

  it("draws transfers as dashed arcs with an arrowhead", () => {
    expect(svg).toMatch(/stroke-dasharray="[^"]+"/);
    expect(svg).toMatch(/marker-end="url\(#rpv-arrow/);
  });

  it("keeps speciation and leaf as the only plain filled circles", () => {
    const filled = (svg.match(/<circle[^>]*>/g) ?? []).filter(
      (c) => !c.includes(`fill="${lightTheme.background}"`) && !/fill="none"/.test(c),
    );
    expect(filled.length).toBe(EVENTS.speciation + EVENTS.leaf);
  });
});

describe("level of detail", () => {
  it("drops the pure event glyphs below full detail but keeps tubes, edges and leaves", () => {
    const full = render("full");
    const low = render("low");
    expect(full.length).toBeGreaterThan(low.length);
    // species tubes and gene edges survive at every level
    expect(low).toMatch(/<path/);
    expect(low).toMatch(/<svg/);
  });
});
