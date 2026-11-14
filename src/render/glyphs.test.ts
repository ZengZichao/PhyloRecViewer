import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { layout, defaultLayoutOptions } from "../layout";
import { defaultRenderOptions } from "./options";
import { lightTheme } from "./theme";
import { Scene, type SceneProps } from "./Scene";
import { translations } from "../i18n";
import { useStore } from "../state/store";

/**
 * Fixture exercising EVERY event type (formerly the bundled `all-events`
 * sample, removed from the sample catalog but kept here as test data).
 */
const allEvents = `<?xml version="1.0" encoding="UTF-8"?>
<recPhylo>
  <spTree>
    <phylogeny rooted="true">
      <clade>
        <name>R</name>
        <clade><name>A</name></clade>
        <clade><name>B</name></clade>
      </clade>
    </phylogeny>
  </spTree>
  <recGeneTree>
    <phylogeny rooted="true">
      <clade>
        <name>r</name>
        <eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade>
          <name>dup</name>
          <eventsRec><duplication speciesLocation="R"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="x1"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
        </clade>
        <clade>
          <name>sp2</name>
          <eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade>
            <name>bo</name>
            <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
            <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
            <clade>
              <eventsRec><transferBack destinationSpecies="B"/><leaf speciesLocation="B" geneName="arr1"/></eventsRec>
            </clade>
          </clade>
          <clade>
            <name>bco</name>
            <eventsRec><bifurcationOut speciesLocation="B"/></eventsRec>
            <clade>
              <eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr2"/></eventsRec>
            </clade>
            <clade>
              <eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr3"/></eventsRec>
            </clade>
          </clade>
        </clade>
      </clade>
    </phylogeny>
  </recGeneTree>
</recPhylo>
`;

/**
 * The app's central design claim is that event identity is carried by
 * SHAPE, independently of colour (so exported figures survive greyscale
 * printing and colour-vision deficiency). Nothing else in the suite pins the
 * glyph geometry,
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

/** Event mix of the all-events fixture, asserted so the geometry
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
      const w = Number(r.match(/width="([\d.]+)"/)?.[1]);
      const h = Number(r.match(/height="([\d.]+)"/)?.[1]);
      return w > 0 && Math.abs(w - h) < 1e-6;
    });
    // exactly one per duplication glyph - no more, no less
    expect(squares.length).toBe(EVENTS.duplication);
  });

  it("draws losses as a cross of two diagonal lines", () => {
    const lines = svg.match(/<line[^>]*>/g) ?? [];
    const diagonals = lines.filter((l) => {
      const g = (k: string) => Number(l.match(new RegExp(`${k}="(-?[\\d.]+)"`))?.[1]);
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

/* -------------------------------------------------------- the drawn wording */

/**
 * The text `Scene` draws - the native `<title>` tooltips and the gene labels -
 * is part of the exported figure, so it answers to the same two authorities as
 * the on-screen copy: the term table (docs/GLOSSARY-UI.md) and the punctuation
 * and dictionary rules of docs/STYLE-GUIDE-UI.md §2 and §5.
 *
 * `LOCALE_XML` is built for that: one NAMED clade and one UNNAMED clade (both
 * collapsible, so their labels and wedge tooltips are drawn), a species
 * location to be joined onto the event name, and a transfer arrival carrying a
 * time slice and a confidence, i.e. the two fields that used to be appended in
 * `()` and `[]`.
 */
const LOCALE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<recPhylo>
  <spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name></clade><clade><name>B</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true"><clade>
    <name>root</name>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade>
      <name>inner</name>
      <eventsRec><speciation speciesLocation="R"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="g1"/></eventsRec></clade>
      <clade><eventsRec><leaf speciesLocation="B" geneName="g2"/></eventsRec></clade>
    </clade>
    <clade>
      <eventsRec><duplication speciesLocation="R"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="g3"/></eventsRec></clade>
      <clade>
        <eventsRec><transferBack destinationSpecies="B" speciesLocation="A" timeSlice="3" confidence="0.87"/><leaf speciesLocation="B" geneName="g4"/></eventsRec>
      </clade>
    </clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

/** Draw `LOCALE_XML` with every non-root internal clade collapsed. */
function drawLocaleScene(props: Partial<SceneProps> = {}, collapse = true): string {
  const recon = parseRecPhyloXML(LOCALE_XML, "locale.xml");
  const collapsed = new Set(
    collapse
      ? recon.geneTrees[0].nodes.filter((g) => g.children.length > 0 && g.name !== "root").map((g) => g.id)
      : [],
  );
  const result = layout(recon, { ...defaultLayoutOptions }, undefined, collapsed);
  return renderToStaticMarkup(
    createElement(Scene, {
      result,
      theme: lightTheme,
      options: defaultRenderOptions,
      highlight: null,
      interactive: false,
      detail: "full",
      showBackground: true,
      ...props,
    }),
  );
}

/** The text of every drawn `<title>` and `<text>` node, unescaped. */
function drawn(svg: string): string[] {
  return [...svg.matchAll(/<(?:title|text)[^>]*>([\s\S]*?)<\/(?:title|text)>/g)].map((m) => m[1]);
}

describe("the dictionary a figure is drawn in", () => {
  it("draws the dictionary it is handed, not the one the store started in", () => {
    // A figure is rendered through `renderToStaticMarkup`, where the zustand
    // read behind `useT()` answers from `getInitialState()` - the language
    // `navigator.language` gave the store when it was created - so the locale
    // the user picked was invisible to the drawing while the legend, built from
    // `currentDict()`, followed it. One artefact, two locales.
    const zh = drawLocaleScene({ dict: translations.zh });
    expect(drawn(zh).join("\n")).toContain("物种形成\nR");
    expect(drawn(zh).join("\n")).toContain("现存基因");
    expect(drawn(zh).join("\n")).not.toContain("Speciation");
    expect(drawn(zh).join("\n")).not.toContain("Extant gene");
  });

  it("still follows the live language when the canvas draws it", async () => {
    // `app/Canvas.tsx` mounts `Scene` for real (no `dict` prop) and must keep
    // speaking the language the app is in - the injected dictionary is an
    // override for markup renders, never a replacement for the live one.
    const prev = useStore.getState().locale;
    useStore.setState({ locale: "zh" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const recon = parseRecPhyloXML(LOCALE_XML, "canvas.xml");
    const result = layout(recon, { ...defaultLayoutOptions });
    try {
      const root = createRoot(host);
      await act(async () => {
        root.render(createElement(Scene, { result, theme: lightTheme, options: defaultRenderOptions }));
      });
      expect(host.innerHTML).toContain(translations.zh.event.speciation);
      expect(host.innerHTML).not.toContain(translations.en.event.speciation);
      await act(async () => root.unmount());
      // And an injected dictionary wins over the store, which is what makes the
      // export path deterministic.
      const injected = createRoot(host);
      await act(async () => {
        injected.render(
          createElement(Scene, { result, theme: lightTheme, options: defaultRenderOptions, dict: translations.en }),
        );
      });
      expect(host.innerHTML).toContain(translations.en.event.speciation);
      expect(host.innerHTML).not.toContain(translations.zh.event.speciation);
      await act(async () => injected.unmount());
    } finally {
      host.remove();
      useStore.setState({ locale: prev });
    }
  });
});

describe("collapsed-clade wording", () => {
  it("names an unnamed collapsed clade instead of exporting a bare count", () => {
    // The label call used to omit its dictionary, so a clade with no name drew
    // ` (2)` - and the wedge tooltip spelled its first line out as `undefined`.
    for (const [locale, dict] of [["en", translations.en], ["zh", translations.zh]] as const) {
      const texts = drawn(drawLocaleScene({ dict }));
      const unnamed = texts.filter((t) => /\b2\b/.test(t) && !t.startsWith("inner"));
      expect(unnamed.length, locale).toBeGreaterThan(0);
      for (const t of unnamed) {
        expect(t.trim(), locale).not.toBe("");
        expect(t, locale).not.toMatch(/^undefined/);
        expect(t.startsWith(dict.collapsedClade), `${locale}: ${t}`).toBe(true);
      }
    }
  });

  it("keeps the name of a collapsed clade in front of its count", () => {
    expect(drawn(drawLocaleScene({ dict: translations.en }))).toContain("inner 2");
  });
});

describe("what a figure may promise", () => {
  it("offers the expand gesture only where a click can perform it", () => {
    const live = drawLocaleScene({ dict: translations.en, interactive: true });
    expect(live).toContain(translations.en.expandHint);
    // A PNG/SVG/PDF has no click to answer with, so the same string written into
    // it would be wording the artefact cannot carry out (STYLE §3.3).
    const figure = drawLocaleScene({ dict: translations.en, interactive: false });
    expect(figure).not.toContain(translations.en.expandHint);
    // The rest of the tooltip survives: the gesture went, not the information.
    expect(figure).toContain(`${translations.en.collapsedClade}\n2 ${translations.en.leavesUnit}`);
  });
});

describe("line discipline in drawn text", () => {
  it("puts an event and its species on separate tooltip lines", () => {
    const all = drawn(drawLocaleScene({ dict: translations.en })).join("\n");
    expect(all).toContain("Speciation\nR");
    expect(all).not.toContain(" @ ");
  });

  it("puts an arrival's evidence on its own lines", () => {
    // Nothing collapsed here: the arrival's own glyph has to be on the page for
    // its tooltip to be the thing under test.
    const zh = drawn(drawLocaleScene({ dict: translations.zh }, false));
    const arrival = zh.find((t) => t.includes(translations.zh.event.transferBack));
    expect(arrival, "the transfer arrival is drawn").toBeDefined();
    expect(arrival).toContain(`${translations.zh.inspTimeSlice}: 3`);
    expect(arrival).toContain(`${translations.zh.inspConfidence}: 0.87`);
    for (const t of zh) expect(t, t).not.toMatch(/[()[\]]/);
    for (const t of drawn(drawLocaleScene({ dict: translations.en }, false))) {
      expect(t, t).not.toMatch(/\[[^\]]*\]/);
    }
  });
});

