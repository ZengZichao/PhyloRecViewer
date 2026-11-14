/**
 * Tests for the export layer.
 *
 * They pin down the guarantees this layer makes, so that a future change cannot
 * quietly break them: hostile names stay plain text, a merged multi-pane SVG
 * grows no duplicate ids and no dangling `url(#…)` refs, the rasterizer never
 * asks for a canvas the platform cannot give, degenerate documents still export,
 * and a PDF export still produces a file when the vector converter cannot be
 * fetched at all (issue #11).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
// Read as raw text through Vite (`?raw`): under the jsdom environment
// `import.meta.url` is an http: URL, so it cannot be handed to `fs`.
import exportersSource from "./exporters.ts?raw";
import { layout, type LayoutResult } from "../layout";
import { parseReconciliation } from "../parser/formats";
import { defaultRenderOptions } from "../render/options";
import { themes, type Theme } from "../render/theme";
import {
  LEGEND_ROWS,
  exportLegendRowDefs,
  exportLegendRows,
  screenLegendRows,
} from "../render/legendRows";
import { htmlLang, translations, type Dict } from "../i18n";
import { APP_NAME } from "../version";
// The headless CLI is the other writer of these artefacts, so its wording is
// checked here too - as source, because a Node script is not a component.
import cliSource from "../../scripts/cli.ts?raw";
import { useStore } from "../state/store";
import {
  DEFAULT_PNG_DPI,
  MIN_PNG_DPI,
  buildDocSvg,
  exportPdf,
  exportPng,
  exportSvg,
  renderPdfBlob,
  renderPngBlob,
  sceneToInteractiveHtml,
  sceneToSvgString,
  type ExportDoc,
  type ExportLegendConfig,
  type ExportPane,
} from "./exporters";

const EN_UI = { lang: "en", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to window" };

/* ------------------------------------------------------------------ fixtures */

/** Escape a raw string so it is safe inside an XML attribute value. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SPECIES_TREE = `<spTree><phylogeny><clade><name>R</name>
  <clade><name>A</name></clade><clade><name>B</name></clade>
</clade></phylogeny></spTree>`;

/** Two named leaves, one in species A and one in B, under a single speciation root. */
function twoLeafXml(geneA = "g1", geneB = "g2"): string {
  return `<recPhylo>${SPECIES_TREE}
    <recGeneTree><phylogeny><clade><name>r</name>
      <eventsRec><speciation speciesLocation="R"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="A" geneName="${attr(geneA)}"/></eventsRec></clade>
      <clade><eventsRec><leaf speciesLocation="B" geneName="${attr(geneB)}"/></eventsRec></clade>
    </clade></phylogeny></recGeneTree>
  </recPhylo>`;
}

/** A one-leaf document, where the whole drawing is a single tip. */
const SOLO_XML = `<recPhylo><spTree><phylogeny><clade><name>R</name></clade></phylogeny></spTree>
  <recGeneTree><phylogeny><clade><eventsRec><leaf speciesLocation="R" geneName="solo"/></clade></phylogeny></recGeneTree>
</recPhylo>`;

/**
 * A document carrying every glyph AND a transfer arc - the transfer arc being
 * the only thing in an export that references a `<defs>` id through `url(#…)`.
 */
const EVENT_XML = `<recPhylo>
  <spTree><phylogeny><clade><name>ANIMAL</name>
    <clade><name>Rabbit</name></clade><clade><name>Platypus</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny><clade>
    <eventsRec><speciation speciesLocation="ANIMAL"/></eventsRec>
    <clade>
      <eventsRec><duplication speciesLocation="ANIMAL"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="Rabbit" geneName="r1"/></eventsRec></clade>
      <clade><eventsRec><loss speciesLocation="Platypus"/></eventsRec></clade>
    </clade>
    <clade>
      <eventsRec><branchingOut speciesLocation="Rabbit"/></eventsRec>
      <clade><eventsRec><leaf speciesLocation="Rabbit" geneName="keep"/></eventsRec></clade>
      <clade>
        <eventsRec><transferBack destinationSpecies="Platypus"/><leaf speciesLocation="Platypus" geneName="arr"/></eventsRec>
      </clade>
    </clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

function lay(text: string, fileName: string): LayoutResult {
  return layout(parseReconciliation(text, fileName));
}

function legendWith(families: string[]): ExportLegendConfig {
  return {
    eventsTitle: "Events",
    familiesTitle: "Families",
    families: families.map((name, i) => ({ name, color: themes.light.genePalette[i] })),
  };
}

function pane(result: LayoutResult, over: Partial<ExportPane> = {}): ExportPane {
  return { result, options: defaultRenderOptions, ...over };
}

function exportDoc(panes: ExportPane[], extra: Partial<ExportDoc> = {}): ExportDoc {
  return { theme: themes.light, panes, ...extra };
}

/** Re-parse exported markup, failing loudly on any XML well-formedness error. */
function parseMarkup(svg: string): Document {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(parsed.querySelector("parsererror")).toBeNull();
  return parsed;
}

function idsIn(root: Element): string[] {
  return Array.from(root.querySelectorAll("[id]")).map((el) => el.getAttribute("id") ?? "");
}

function refsIn(svg: string): string[] {
  return Array.from(svg.matchAll(/url\(#([^)"']*)\)/g)).map((m) => m[1]);
}

function textOf(root: Element | Document): string {
  return Array.from(root.querySelectorAll("text"))
    .map((t) => t.textContent ?? "")
    .join("|");
}

/**
 * The text of every exported legend `<g>`, in drawing order: the events title,
 * the event rows, the families title, the family chips. `buildLegendGroup`
 * stamps its group with `.rpv-export-legend` exactly so that the key can be
 * compared with the on-screen legend row for row, in order (STYLE §6).
 */
function legendTextSequences(svg: string): string[][] {
  const groups = Array.from(parseMarkup(svg).querySelectorAll(".rpv-export-legend"));
  expect(groups.length, "an export with a legend carries a key").toBeGreaterThan(0);
  return groups.map((g) => Array.from(g.querySelectorAll("text")).map((el) => el.textContent ?? ""));
}

/** The sequence one figure's key must show for `t` and these family chips. */
function expectedLegendSequence(t: Dict, families: string[]): string[] {
  return [
    t.events,
    ...exportLegendRows({ t, events: t.event }),
    t.geneFamilies,
    ...families,
  ];
}

/* ------------------------------------------------------------------- escaping */

describe("SVG export escaping of untrusted text", () => {
  const HOSTILE_GENE = 'g1</text><script>alert(1)</script>';
  const QUOTED_GENE = 'g2 & "quoted" <tag>';
  const HOSTILE_OVERRIDE = 'X"/><img src=x onerror=alert(1)>';
  const HOSTILE_NOTE = "<b>note</b><img src=y onerror=alert(2)>";

  it("keeps hostile gene names, label overrides and annotations as plain text", () => {
    const result = lay(twoLeafXml(HOSTILE_GENE, QUOTED_GENE), "hostile.xml");
    const annotated = result.reconciliation.geneTrees[0].nodes[0];
    const svg = sceneToSvgString(
      exportDoc([
        pane(result, {
          labelOverrides: { A: HOSTILE_OVERRIDE },
          annotations: { [annotated.id]: { text: HOSTILE_NOTE, color: "#f00" } },
          legend: legendWith(['fam"><svg onload=alert(3)>']),
        }),
      ]),
    );

    expect(svg.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    // Nothing gets spliced in as markup...
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<img/i);
    expect(svg).not.toMatch(/<b>/i);
    // ...and the markup stays well-formed XML whose every element is an SVG
    // element: an escaped-quote breakout would have produced HTML-namespace
    // nodes (and an `onerror`/`onload` attribute) rather than text.
    const reparsed = parseMarkup(svg);
    expect(reparsed.querySelectorAll("script")).toHaveLength(0);
    expect(reparsed.querySelectorAll("img")).toHaveLength(0);
    expect(reparsed.querySelectorAll("b")).toHaveLength(0);
    const elements = Array.from(reparsed.querySelectorAll("*"));
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
      for (const a of Array.from(el.attributes)) {
        expect(/^(on[a-z]+|href|src|xlink:href)$/i.test(a.name), a.name).toBe(false);
      }
    }
    // Each hostile string survives verbatim as *text*, i.e. the escaping round-trips.
    const text = textOf(reparsed);
    expect(text).toContain(HOSTILE_GENE);
    expect(text).toContain(QUOTED_GENE);
    expect(text).toContain(HOSTILE_OVERRIDE);
    expect(text).toContain(HOSTILE_NOTE);
  });

  it("escapes pane titles, per-pane legends and localized event labels", () => {
    const a = lay(twoLeafXml("keep", "arr"), "a.xml");
    const b = lay(twoLeafXml("other1", "other2"), "b.xml");
    const hostileTitle = '</title><image href=x onerror=alert(4)>';
    const eventLabels = {
      speciation: '<svg onload="a">spec',
      duplication: "dup&<>",
      loss: "loss",
      branchingOut: "bo",
      bifurcationOut: 'bc"<img src=x>',
      transferBack: "tb",
      leaf: "leaf",
    };
    const { svg } = buildDocSvg(
      exportDoc(
        [
          pane(a, { title: hostileTitle, legend: legendWith(["famA"]) }),
          pane(b, { title: hostileTitle, legend: legendWith(["famB"]) }),
        ],
        { eventLabels },
      ),
    );

    expect(svg).not.toMatch(/<image/i);
    expect(svg).not.toMatch(/<script/i);
    const reparsed = parseMarkup(svg);
    expect(reparsed.querySelectorAll("image")).toHaveLength(0);
    expect(reparsed.querySelectorAll("svg")).toHaveLength(1); // only the document root
    const text = textOf(reparsed);
    // In a multi-pane export each pane draws its title once, and each stays text.
    expect(text.match(/onerror=alert\(4\)/g)).toHaveLength(2);
    expect(text).toContain(eventLabels.speciation);
    expect(text).toContain(eventLabels.duplication);
    expect(text).toContain(eventLabels.bifurcationOut);
    // The exported key has to decode the exported drawing, so the extant-gene row
    // belongs to it, exactly as it belongs to the on-screen legend, and it is
    // escaped like every other label.
    expect(text).toContain(eventLabels.leaf);
    expect(text).toContain(eventLabels.branchingOut);
    expect(reparsed.querySelectorAll("img")).toHaveLength(0);
  });

  /**
   * The rows the exported figure has to key, read from the shared legend table
   * (`src/render/legendRows.ts`) that `app/Legend.tsx` itself renders — NOT
   * re-typed here. A hand-written copy of the row list is exactly how the
   * transfer-arrival row stayed missing from every export while the on-screen
   * legend showed it, so both sides now point at one source of truth.
   */
  function legendRows(t: Dict): string[] {
    return exportLegendRows({ t, events: t.event });
  }

  /** A legend config fed straight from a dictionary. The caller supplies only
   *  the group titles and the family chips: the event rows, their order and
   *  their wording belong to the shared table, so no caller can shrink the key
   *  any more. */
  function dictLegend(t: Dict): ExportLegendConfig {
    return {
      eventsTitle: t.events,
      familiesTitle: t.geneFamilies,
      families: [{ name: "famA", color: themes.light.genePalette[0] }],
    };
  }

  describe("the exported key against the on-screen key", () => {
    it("keys exactly the on-screen legend's rows, in the same order, verbatim", () => {
      const t = translations.en;
      const result = lay(twoLeafXml(), "consistency.xml");
      const prev = useStore.getState().locale;
      useStore.setState({ locale: "en" });
      try {
        const { svg } = buildDocSvg(
          exportDoc([pane(result, { legend: dictLegend(t) })], { eventLabels: t.event }),
        );
        // Ordered, whole-sequence equality — not `toContain`, which passes for a
        // key that shows the rows in the wrong order or holds one extra.
        expect(legendTextSequences(svg)).toEqual([expectedLegendSequence(t, ["famA"])]);
        // STYLE §6 in one line: the figure's key IS the overlay's key.
        expect(legendRows(t)).toEqual(
          screenLegendRows({ t, events: t.event }).filter((r) => r !== t.legendLocate),
        );
      } finally {
        useStore.setState({ locale: prev });
      }
    });

    it("omits only the row keying a glyph no export draws, and it is documented", () => {
      // The locate ring comes from `Scene`'s `locateSet` prop, which
      // `renderPaneMarkup` never passes — so an exported figure cannot contain
      // it and its key must not claim it. This test fails the moment ANY other
      // row diverges, i.e. the exception cannot grow silently.
      const exportedKinds: string[] = exportLegendRowDefs({
        t: translations.en,
        events: translations.en.event,
      }).map((r) => r.kind);
      const screenKinds: string[] = LEGEND_ROWS.map((r) => r.kind);
      expect(screenKinds.filter((k) => !exportedKinds.includes(k))).toEqual(["locate"]);
      expect(exportedKinds).toEqual(screenKinds.filter((k) => k !== "locate"));
    });

    it("draws a real swatch for every row it keys, never a generic fallback", () => {
      // `iconEl` has no `default:` branch, so the compiler already refuses an
      // unhandled kind; this pins the other half — that the case label really is
      // the row's kind rather than a shape that happens to look right.
      const cases = new Set(
        [...exportersSource.matchAll(/^\s*case "(\w+)":/gm)].map((m) => m[1]),
      );
      for (const kind of exportLegendRowDefs({ t: translations.en, events: translations.en.event })) {
        expect(cases.has(kind.kind), `iconEl case for "${kind.kind}"`).toBe(true);
      }
      expect(cases.has("locate")).toBe(false);
    });
  });

  describe.each(["en", "zh"] as const)("in the %s language", (locale) => {
    const t = translations[locale];

    it("lists a key row for every glyph the exported drawing can contain", () => {
      const result = lay(twoLeafXml(), "one.xml");
      const prev = useStore.getState().locale;
      useStore.setState({ locale });
      try {
        const { svg } = buildDocSvg(
          exportDoc([pane(result, { legend: dictLegend(t) })], { eventLabels: t.event }),
        );
        expect(legendTextSequences(svg)).toEqual([expectedLegendSequence(t, ["famA"])]);
        for (const label of legendRows(t)) {
          expect(textOf(parseMarkup(svg))).toContain(label);
        }
      } finally {
        useStore.setState({ locale: prev });
      }
    });

    it("labels the legend from the current-language dictionary, never hard-coded English", () => {
      const prev = useStore.getState().locale;
      useStore.setState({ locale });
      try {
        const result = lay(twoLeafXml(), "fallback.xml");
        // No `eventLabels` on the document: every row — the transfer arc, the
        // arrival, the collapsed wedge included — has to come from the
        // dictionary of the language the app is in, since the caller can no
        // longer hand the exporter any row label at all (STYLE §5.3 forbids an
        // English fallback).
        const { svg } = buildDocSvg(exportDoc([pane(result, { legend: dictLegend(t) })]));
        const sequence = legendTextSequences(svg)[0];
        expect(sequence).toEqual(expectedLegendSequence(t, ["famA"]));
        if (locale === "zh") {
          // The English forms must be gone, not merely accompanied by Chinese.
          for (const en of legendRows(translations.en)) {
            expect(sequence).not.toContain(en);
          }
          for (const en of [translations.en.events, translations.en.geneFamilies]) {
            expect(sequence).not.toContain(en);
          }
        }
      } finally {
        useStore.setState({ locale: prev });
      }
    });
  });

  it("keys speciation and transfer in the colour the drawing actually uses", () => {
    const result = lay(twoLeafXml(), "one.xml");
    const { svg } = buildDocSvg(exportDoc([pane(result, { legend: legendWith(["famA"]) })]));
    // Scene.geneGlyph paints speciation with the family colour, and the transfer
    // arc with it too, so the key must not show theme.event.speciation (#2563eb),
    // a hue that appears nowhere in the drawing.
    const family = themes.light.genePalette[0].toLowerCase();
    const reparsed = parseMarkup(svg);
    const fills = [...reparsed.querySelectorAll("circle")].map(
      (c) => (c.getAttribute("fill") ?? "").toLowerCase(),
    );
    expect(fills).toContain(family);
    expect(svg.toLowerCase()).not.toContain("#2563eb");
  });

  it("keeps a broken quote in a label override out of the attribute stream", () => {
    const result = lay(twoLeafXml(), "plain.xml");
    const payload = '"><zzz y="';
    const svg = sceneToSvgString(
      exportDoc([pane(result, { labelOverrides: { A: payload } })]),
    );
    const reparsed = parseMarkup(svg);
    // A broken quote cannot open a new element or attribute here: the payload
    // only ever appears as text.
    expect(textOf(reparsed)).toContain(payload);
    expect(reparsed.querySelector("zzz")).toBeNull();
    for (const el of Array.from(reparsed.querySelectorAll("*"))) {
      expect(el.hasAttribute("zzz"), el.tagName).toBe(false);
    }
  });

  it("writes no NaN/undefined/Infinity into any exported attribute", () => {
    const themeList: Theme[] = [themes.light, themes.dark];
    for (const theme of themeList) {
      const svg = sceneToSvgString(
        exportDoc([pane(lay(EVENT_XML, "events.xml"))], { theme }),
      );
      const reparsed = parseMarkup(svg);
      for (const el of Array.from(reparsed.querySelectorAll("*"))) {
        for (const a of Array.from(el.attributes)) {
          expect(a.value, `${el.tagName}@${a.name}`).not.toMatch(/NaN|Infinity|undefined|null/);
        }
      }
    }
  });
});

/* ------------------------------------------------------ degenerate documents */

describe("exporting degenerate documents", () => {
  it("turns a zero-pane document into well-formed, positive-sized SVG", () => {
    const empty = buildDocSvg({ theme: themes.light, panes: [] });
    expect(Number.isFinite(empty.width)).toBe(true);
    expect(empty.width).toBeGreaterThan(0);
    expect(empty.height).toBeGreaterThan(0);
    const reparsed = parseMarkup(empty.svg);
    expect(reparsed.documentElement.tagName).toBe("svg");
    expect(reparsed.documentElement.getAttribute("viewBox")).toBe(
      `0 0 ${empty.width} ${empty.height}`,
    );
  });

  it("keeps the bounds positive for a legend beside zero panes", () => {
    const withLegend = buildDocSvg({
      theme: themes.dark,
      legend: legendWith(["fam"]),
      panes: [],
    });
    expect(withLegend.width).toBeGreaterThan(0);
    expect(withLegend.height).toBeGreaterThan(0);
    parseMarkup(withLegend.svg);
  });

  it("bounds a single-leaf reconciliation with finite numbers", () => {
    const { svg, width, height } = buildDocSvg(exportDoc([pane(lay(SOLO_XML, "solo.xml"))]));
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    const reparsed = parseMarkup(svg);
    expect(textOf(reparsed)).toContain("solo");
  });
});

/* ------------------------------------------------ multi-pane id / ref health */

describe("id and reference integrity across panes", () => {
  /**
   * Every pane carries a transfer arc, because the arc's `marker-end` (and the
   * optional tube gradient) is the only thing in an export that references a
   * `<defs>` id - precisely the references that have to resolve once the panes
   * are merged into one flat SVG.
   */
  function transferXml(tag: string): LayoutResult {
    return lay(
      EVENT_XML.replace(/geneName="r1"/, `geneName="r1-${tag}"`)
        .replace(/geneName="keep"/, `geneName="keep-${tag}"`)
        .replace(/geneName="arr"/, `geneName="arr-${tag}"`),
      `pane-${tag}.xml`,
    );
  }

  function render(panes: number, gradient = false): string {
    const tags = ["primary", "nested", "compare"].slice(0, panes);
    return buildDocSvg(
      exportDoc(
        tags.map((tag, i) =>
          pane(transferXml(tag), {
            title: `Pane ${i + 1}`,
            legend: legendWith([`family-${tag}`, "second"]),
            options: { ...defaultRenderOptions, speciesGradient: gradient },
          }),
        ),
      ),
    ).svg;
  }

  for (const [label, panes] of [
    ["nested split (2 panes)", 2],
    ["compare split (3 panes)", 3],
  ] as const) {
    it(`${label}: unique ids and url(#…) refs that all resolve`, () => {
      const svg = render(panes);
      const reparsed = parseMarkup(svg);
      const ids = idsIn(reparsed.documentElement);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      const refs = refsIn(svg);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(reparsed.getElementById(ref), `dangling url(#${ref})`).not.toBeNull();
      }
      // Every pane contributes its own genes, legend and title to the merged SVG.
      for (const tag of ["primary", "nested", "compare"].slice(0, panes)) {
        expect(svg).toContain(`r1-${tag}`);
        expect(svg).toContain(`family-${tag}`);
      }
      expect((svg.match(/>Pane /g) ?? []).length).toBe(panes);
    });
  }

  it("keeps tube-gradient references resolvable across panes", () => {
    const svg = render(3, true);
    const reparsed = parseMarkup(svg);
    const refs = refsIn(svg);
    expect(refs.some((r) => r.startsWith("rpv-tube-"))).toBe(true);
    for (const ref of refs) {
      expect(reparsed.getElementById(ref), `dangling url(#${ref})`).not.toBeNull();
    }
  });

  it("merges every pane's markers and gradients into one <defs> block", () => {
    const reparsed = parseMarkup(render(2));
    expect(reparsed.getElementsByTagName("defs")).toHaveLength(1);
    // A shared id is defined once, never duplicated per pane.
    const ids = idsIn(reparsed.documentElement);
    expect(ids.filter((id) => id.startsWith("rpv-arrow-"))).toHaveLength(1);
  });

  it("drops nodes outside the 'show only matches' set rather than dimming them", () => {
    const result = lay(twoLeafXml("matched", "unmatched"), "only.xml");
    const keep = result.reconciliation.geneTrees[0].nodes.find(
      (n) => n.endEvent.geneName === "matched",
    );
    expect(keep).toBeDefined();
    const svg = sceneToSvgString(
      exportDoc([pane(result, { hideOutside: new Set([keep!.id]) })]),
    );
    expect(svg).toContain("matched");
    expect(svg).not.toContain("unmatched");
  });
});

/* ------------------------------------------------------- interactive HTML */

describe("the interactive HTML export", () => {
  it("escapes the page title and embeds only the pan/zoom script", () => {
    const doc = exportDoc([pane(lay(twoLeafXml("x1", "x2"), "h.xml"))]);
    const html = sceneToInteractiveHtml(doc, '</title><script>alert(2)</script><b>', EN_UI);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // The single <script> element is the pan/zoom code; the injected one is text.
    expect(html.match(/<script/g)).toHaveLength(1);
    const head = html.slice(0, html.indexOf("<svg"));
    expect(head.match(/<title/g)).toHaveLength(1);
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    expect(title).not.toContain("<");
    expect(title).toContain("&lt;/title&gt;");
    expect(title).toContain("&lt;script&gt;");
    // The embedded figure is inline SVG, never a second document.
    expect(html).not.toContain("<?xml");
    expect(html).toContain("<svg");
  });

  it("passes the composed size into the stage and the fit maths", () => {
    const doc = exportDoc([pane(lay(SOLO_XML, "solo.xml"))]);
    const { width, height } = buildDocSvg(doc);
    const html = sceneToInteractiveHtml(doc, "solo", EN_UI);
    expect(html).toContain(`width:${width}px`);
    expect(html).toContain(`height:${height}px`);
    expect(html).toContain(`var W=${width},H=${height};`);
  });
});

/* ------------------------------------------------------------ PNG rasterizer */

describe("PNG rasterization and canvas limits", () => {
  const MAX_EDGE = 16384;
  const MAX_AREA = 16384 * 16384 * 0.25;
  const doc = exportDoc([pane(lay(twoLeafXml("p1", "p2"), "png.xml"))]);
  let canvases: HTMLCanvasElement[] = [];
  let ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    canvases = [];
    ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        canvases.push(this);
        return ctx as unknown as CanvasRenderingContext2D;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      ((cb: ((b: Blob | null) => void) | null | undefined) => {
        cb?.(new Blob(["png-bytes"], { type: "image/png" }));
      }) as typeof HTMLCanvasElement.prototype.toBlob,
    );
    // jsdom decodes and rasterizes nothing; the export path needs only a loaded
    // <img> to hand to drawImage.
    vi.stubGlobal(
      "Image",
      class {
        decoding = "";
        src = "";
        complete = true;
        naturalWidth = 10;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        async decode(): Promise<void> {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("turns a DPI request into a raster scale measured against 96 dpi CSS pixels", async () => {
    const { width, height } = buildDocSvg(doc);
    const out = await renderPngBlob(doc, 600);
    expect(out.scale).toBeCloseTo(600 / 96, 10);
    expect(canvases).toHaveLength(1);
    expect(canvases[0].width).toBe(Math.ceil(width * out.scale));
    expect(canvases[0].height).toBe(Math.ceil(height * out.scale));
    expect(out.blob.type).toBe("image/png");
  });

  it("holds the DPI defaults the user manual documents (300 dpi)", () => {
    expect(DEFAULT_PNG_DPI).toBe(300);
    // The floor allows screen-resolution exports (72) as well.
    expect(MIN_PNG_DPI).toBe(72);
  });

  it("keeps a 1x floor when the requested DPI is under the screen reference", async () => {
    const { width, height } = buildDocSvg(doc);
    const out = await renderPngBlob(doc, MIN_PNG_DPI / 10);
    expect(out.scale).toBe(1);
    expect(canvases[0].width).toBe(Math.ceil(width));
    expect(canvases[0].height).toBe(Math.ceil(height));
  });

  it("clamps an absurd DPI to the platform canvas limits and hands back the real scale", async () => {
    const { width, height } = buildDocSvg(doc);
    const requested = 100_000;
    const out = await renderPngBlob(doc, requested);
    // The caller gets the scale that ACTUALLY took effect, so the UI can say the
    // export came out below the resolution it asked for.
    expect(out.scale).toBeLessThan(requested / 96);
    expect(canvases[0].width).toBe(Math.ceil(width * out.scale));
    expect(canvases[0].height).toBe(Math.ceil(height * out.scale));
    expect(canvases[0].width).toBeLessThanOrEqual(MAX_EDGE);
    expect(canvases[0].height).toBeLessThanOrEqual(MAX_EDGE);
    // The two clamps run in sequence: the edge limit first, then the total-pixel
    // ceiling, which is the one that binds at this DPI.
    expect(out.scale).toBeLessThan(MAX_EDGE / Math.max(width, height));
    expect(width * height * out.scale * out.scale).toBeLessThanOrEqual(MAX_AREA + 1);
  });

  it("paints the theme background before the figure is drawn on top", async () => {
    await renderPngBlob(doc, 600);
    expect(ctx.fillStyle).toBe(themes.light.background);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    // background fill first, image draw second.
    expect(ctx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.drawImage.mock.invocationCallOrder[0],
    );
  });

  it("downloads PNG and SVG through a real object URL", async () => {
    const create = vi.fn(() => "blob:fake-url");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const names: (string | null)[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        // an anchor that never enters the DOM fires no download in
        // Firefox/Safari, so the append-then-click order is what is asserted.
        expect(this.parentNode).toBe(document.body);
        names.push(this.getAttribute("download"));
      });
    vi.useFakeTimers();

    const png = await exportPng(doc, "figure.png", 600);
    expect(png.scale).toBeCloseTo(6.25, 10);
    exportSvg(doc, "figure.svg");

    expect(click).toHaveBeenCalledTimes(2);
    expect(names).toEqual(["figure.png", "figure.svg"]);
    expect(create).toHaveBeenCalledTimes(2);
    const types = create.mock.calls.map((call) => ((call as unknown[])[0] as Blob).type);
    expect(types).toEqual(["image/png", "image/svg+xml"]);
    // Each anchor leaves the DOM once it has been clicked, and every object URL
    // is revoked in the end.
    expect(document.querySelectorAll("a")).toHaveLength(0);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------------- PDF export */

/** Read a Blob's bytes as latin1 text: enough to see the PDF header and the page
 *  dictionary, where the px->pt conversion is visible. jsdom's `Blob` may not
 *  expose `arrayBuffer()`, so fall back to `FileReader`. */
async function blobAsText(blob: Blob): Promise<string> {
  const buf =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as ArrayBuffer);
          reader.onerror = () => rej(new Error("could not read the PDF blob"));
          reader.readAsArrayBuffer(blob);
        });
  return Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join("");
}

describe("PDF export with a statically loaded writer", () => {
  /** `addImage` parses the image itself, so the raster fallback needs a REAL (if
   *  tiny) PNG: a placeholder string would make it throw for the wrong reason. */
  const PNG_1PX =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const doc = exportDoc([pane(lay(twoLeafXml("p1", "p2"), "pdf.xml"))]);
  const { width, height } = buildDocSvg(doc);

  let ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        return ctx as unknown as CanvasRenderingContext2D;
      },
    );
    // jsdom rasterizes nothing, so hand the export a real one-pixel PNG instead.
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(PNG_1PX);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      ((cb: ((b: Blob | null) => void) | null | undefined) => {
        cb?.(new Blob([PNG_1PX], { type: "image/png" }));
      }) as typeof HTMLCanvasElement.prototype.toBlob,
    );
    vi.stubGlobal(
      "Image",
      class {
        decoding = "";
        src = "";
        complete = true;
        naturalWidth = 10;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        async decode(): Promise<void> {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("produces a real PDF blob, with the writer already in memory", async () => {
    await expectPdf((await renderPdfBlob(doc)).blob);
  });

  it("sizes the PDF page in points, not CSS pixels (96 dpi -> 72 pt)", async () => {
    const text = await blobAsText((await renderPdfBlob(doc)).blob);
    const box = text.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box, `no /MediaBox found in the PDF header`).not.toBeNull();
    // jsPDF may swap the axes for a landscape page, so compare the pair sorted.
    const got = [Number(box![1]), Number(box![2])].sort((a, b) => a - b);
    const want = [(width * 72) / 96, (height * 72) / 96].sort((a, b) => a - b);
    expect(got[0]).toBeCloseTo(want[0], 1);
    expect(got[1]).toBeCloseTo(want[1], 1);
  });

  /** Assert the bytes are a real, finished PDF file. */
  async function expectPdf(blob: Blob): Promise<void> {
    expect(blob.type).toBe("application/pdf");
    const text = await blobAsText(blob);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("%%EOF");
  }

  /** The svg2pdf.js module namespace, i.e. what a stub has to stand in for. */
  type Svg2pdfModule = typeof import("svg2pdf.js");

  /** Re-import the exporters with `svg2pdf.js` replaced by `factory`, so the PDF
   *  paths can be driven against a converter that is missing or broken without
   *  depending on which SVG features jsdom happens to implement. A factory that
   *  throws stands for the chunk itself being unfetchable. */
  async function withConverter(
    factory: () => Partial<Svg2pdfModule>,
    run: (mod: typeof import("./exporters")) => Promise<void>,
  ): Promise<void> {
    vi.resetModules();
    vi.doMock("svg2pdf.js", factory);
    try {
      await run(await import("./exporters"));
    } finally {
      vi.doUnmock("svg2pdf.js");
      vi.resetModules();
    }
  }

  it("still delivers a PDF when the converter chunk cannot be fetched", async () => {
    // The verbatim shape of issue #11: the browser asks for a lazily-emitted chunk
    // whose hashed name a later deploy removed, so the import itself rejects. That
    // may cost vector quality, but never the export - and the fallback proves it
    // needs no fetch of its own, because jsPDF arrives through a static import.
    // (Before the fix both PDF paths awaited the same chunk, so the fallback failed
    // on the same missing file and the user got "导出失败: Failed to fetch...".)
    await withConverter(
      () => {
        throw new Error("Failed to fetch dynamically imported module: .../svg2pdf.es.min-<hash>.js");
      },
      async (mod) => {
        const res = await mod.renderPdfBlob(doc);
        expect(res.rasterized).toBe(true);
        await expectPdf(res.blob);
        // The caller is told the resolution that actually took effect, so the UI
        // can warn when the canvas limits clamped the nominal DPI.
        expect(res.scale).not.toBeNull();
      },
    );
  });

  it("still delivers a PDF when the vector converter itself throws", async () => {
    await withConverter(
      () => ({ svg2pdf: () => Promise.reject(new Error("forced conversion failure")) }),
      async (mod) => {
        const res = await mod.renderPdfBlob(doc);
        expect(res.rasterized).toBe(true);
        await expectPdf(res.blob);
      },
    );
  });

  it("downloads the PDF through a real object URL", async () => {
    const create = vi.fn(() => "blob:fake-pdf");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const names: (string | null)[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.getAttribute("download"));
      });
    vi.useFakeTimers();

    const res = await exportPdf(doc, "figure.pdf");

    expect(click).toHaveBeenCalledTimes(1);
    expect(names).toEqual(["figure.pdf"]);
    // The exact blob the export produced is the one handed to the download.
    expect((create.mock.calls[0] as unknown[])[0]).toBe(res.blob);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps jsPDF a static import so the fallback can never need a fetch", () => {
    // A regression pin for issue #11, not a style rule: a lazily-fetched chunk is
    // renamed by every build, so a browser holding an older entry chunk asks the
    // server for a hash that no longer exists, and the import rejects. The writer is
    // what BOTH PDF paths need, so if it were lazily fetched a missing chunk would
    // defeat the fallback too and the export would fail outright.
    // Comment prose is allowed to *describe* the forbidden form (the import block at
    // the top of exporters.ts explains why), so strip comments before asserting on
    // the code itself.
    const code = exportersSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).toMatch(/^import\s*\{\s*jsPDF\s*\}\s*from\s*["']jspdf["']/m);
    expect(code).not.toMatch(/\bimport\s*\(\s*["']jspdf["']\s*\)/);
    // svg2pdf.js is the only runtime lazy import left, and it goes through the
    // guarded loader that turns an unfetchable chunk into the raster fallback.
    // (It cannot be static: under Node it resolves to its UMD entry, which breaks the
    // headless `npm run cli` path - the reason is recorded in exporters.ts.) The
    // `typeof import(...)` type position is erased at runtime, hence matching `await`.
    expect(code).toMatch(/import\s*\(\s*["']svg2pdf\.js["']\s*\)/);
    expect(code.match(/\bawait\s+import\s*\(/g)).toHaveLength(1);
    expect(code).toMatch(/async function loadVectorConverter/);
    expect(code).toMatch(/const convert = await loadVectorConverter\(\)/);
  });
});

/* --------------------------------------------- one figure, one language, one */

describe("the locale of an exported figure", () => {
  /** The on-screen legend's own titles, taken from the dictionary under test. */
  function legendOf(t: Dict): ExportLegendConfig {
    return {
      eventsTitle: t.events,
      familiesTitle: t.geneFamilies,
      families: [{ name: "famA", color: themes.light.genePalette[0] }],
    };
  }

  /** Every native tooltip the figure carries (`<title>`, SVG or HTML). */
  function tooltips(svg: string): string[] {
    return Array.from(parseMarkup(svg).querySelectorAll("title")).map((el) => el.textContent ?? "");
  }

  /** Layout with every non-root internal clade collapsed, so the collapsed-clade
   *  wedge, its tooltip and its drawn label all exist. */
  function collapsedLay(xml: string): LayoutResult {
    const recon = parseReconciliation(xml, "collapsed.xml");
    const ids = recon.geneTrees[0].nodes
      .filter((g) => g.children.length > 0 && g !== recon.geneTrees[0].root)
      .map((g) => g.id);
    expect(ids.length).toBeGreaterThan(0);
    return layout(recon, undefined, undefined, new Set(ids));
  }

  /** The figure's own text: drawn labels plus tooltip wording. */
  function figureWords(svg: string): string {
    return [...tooltips(svg), textOf(parseMarkup(svg))].join("\n");
  }

  function withLocale<T>(locale: "en" | "zh", fn: () => T): T {
    const prev = useStore.getState().locale;
    useStore.setState({ locale });
    try {
      return fn();
    } finally {
      useStore.setState({ locale: prev });
    }
  }

  it("draws the tooltips in the language its key is written in", () => {
    // `Scene` is rendered here through `renderToStaticMarkup`, where the zustand
    // read behind `useT()` answers from `getInitialState()` - the language
    // `navigator.language` gave the store when it was created, NOT the one the
    // user picked. The legend already read `currentDict()`, so an export made
    // while the app was Chinese keyed the figure in Chinese and labelled every
    // tooltip in English: two locales in one artefact (STYLE §5.1, §6).
    const result = lay(EVENT_XML, "locale.xml");
    for (const locale of ["en", "zh"] as const) {
      const t = translations[locale];
      const words = withLocale(locale, () =>
        figureWords(buildDocSvg(exportDoc([pane(result, { legend: legendOf(t) })])).svg),
      );
      expect(words, `${locale}: the figure speaks its own language`).toContain(t.event.speciation);
      const other = translations[locale === "zh" ? "en" : "zh"];
      for (const word of Object.values(other.event)) {
        expect(words, `${locale}: no leftover "${word}"`).not.toContain(word);
      }
    }
  });

  it("promises no gesture the figure cannot perform", () => {
    // A PNG/SVG/PDF is a static picture: `expandHint` told its reader to
    // Alt/⌥- or ⌘-click a wedge no click can reach (STYLE §3.3), while the
    // on-screen canvas - which really does expand - keeps the promise.
    const svg = withLocale("en", () => buildDocSvg(exportDoc([pane(collapsedLay(EVENT_XML))])).svg);
    const words = figureWords(svg);
    expect(words).toContain(translations.en.collapsedClade);
    expect(words).not.toContain(translations.en.expandHint);
    expect(words).not.toContain("click");
  });

  it("names an unnamed collapsed clade instead of drawing a bare count", () => {
    // `renderGeneLabels` was called without its dictionary, so a collapsed
    // clade with no label drew ` (2)` - and the deleted `cladeFallback` key it
    // used to read spelled the same tooltip line out as `undefined`.
    const svg = withLocale("en", () => buildDocSvg(exportDoc([pane(collapsedLay(EVENT_XML))])).svg);
    const labels = textOf(parseMarkup(svg)).split("|");
    const counts = labels.filter((l) => /\b\d+\b/.test(l));
    expect(counts.length).toBeGreaterThan(0);
    for (const l of counts) {
      expect(l.trim(), `label "${l}" names what it counts`).not.toBe("");
      expect(l, `label "${l}" is not a bare count`).not.toMatch(/^\s*\(/);
      expect(l.startsWith(translations.en.collapsedClade), l).toBe(true);
    }
  });

  it("writes the page title from the single app-name source", () => {
    // §5.1: artefact wording has one source. `APP_NAME` (`src/version.ts`, which
    // the About dialog, the CSV provenance line and the SVG metadata already
    // read) is that source for the product name, so the brand in a page title
    // cannot fall out of step with the brand everywhere else.
    const doc = exportDoc([pane(lay(SOLO_XML, "solo.xml"))]);
    const html = sceneToInteractiveHtml(doc, "solo", EN_UI);
    expect(html).toContain(`<title>solo — ${APP_NAME}</title>`);
    const code = exportersSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    // The title is composed from the constant, not from a re-typed brand.
    // (`id="PhyloRecViewer-provenance"` is left alone on purpose: an XML id in
    // an exported file is a machine-readable field, which GLOSSARY-UI rule 1
    // exempts from the term table - unlike human-readable text.)
    const titleExpr = code.match(/"<title>"[\s\S]*?<\/title>/)?.[0] ?? "";
    expect(titleExpr).toContain("APP_NAME");
    expect(titleExpr).not.toContain("PhyloRecViewer");
  });

  it("puts the page's key hints in parentheses", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = translations[locale];
      const html = sceneToInteractiveHtml(exportDoc([pane(lay(SOLO_XML, "solo.xml"))]), "solo", {
        lang: htmlLang[locale],
        zoomIn: t.zoomIn,
        zoomOut: t.zoomOut,
        fit: t.fit,
      });
      const labels = Array.from(html.matchAll(/aria-label="([^"]*)"/g)).map((m) => m[1]);
      expect(labels).toHaveLength(3);
      expect(labels[0]).toBe(`${t.zoomIn} (+ / =)`);
      expect(labels[1]).toBe(`${t.zoomOut} (−)`);
      expect(labels[2]).toBe(`${t.fit} (0 / Enter)`);
    }
  });

  it("has the headless CLI read the dictionary instead of restating it", () => {
    // `npm run cli` writes the same artefact the app writes; its own copies of
    // "Zoom in" / "Fit to window" / "reconciliation" are the wording that drifts
    // when the UI moves (STYLE §5.1).
    const code = cliSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    for (const literal of ['"Zoom in"', '"Zoom out"', '"Fit to window"', '"reconciliation"']) {
      expect(code, `cli.ts must not write ${literal}`).not.toContain(literal);
    }
    expect(code).toContain("currentDict()");
    expect(code).toContain("dict.exportDefaultStem");
    expect(code).toMatch(/docTitle\(session, sessionPath, dict\)/);
  });
});
