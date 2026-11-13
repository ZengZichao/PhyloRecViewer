import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// jsPDF is a STATIC import, deliberately, and that is the fix for issue #11.
//
// A lazy `await import()` makes Vite emit the dependency as its own lazily-fetched
// chunk (it was `assets/jspdf.es.min-<hash>.js`) whose name hashes the build's
// content, so every rebuild renames it. On a sub-path GitHub Pages deployment a
// browser can then be running an older build's entry chunk that records a hash the
// server no longer serves, and the fetch rejects with "Failed to fetch dynamically
// imported module". Both PDF paths used to await that same chunk, so the
// vector->raster fallback failed on the very same missing file and the export died
// outright instead of degrading. With jsPDF in the entry chunk the fallback is
// completely fetch-free, so a PDF export now always produces a PDF.
//
// svg2pdf.js deliberately stays lazy (see loadVectorConverter). Importing it
// eagerly is not an option at either entry point of this module: the package has no
// `exports` map, so outside a browser it resolves to its UMD `main`, and Node/tsx -
// which is how `npm run cli` and `npm run measure` load these exporters through
// scripts/cli.ts - evaluates that UMD as ESM with no `exports`/`module`, sending it
// down its global fallback branch, which reads `globalThis.jspdf.jsPDF` and throws
// "Cannot read properties of undefined (reading 'jsPDF')". A named static import
// fails to link there for the same reason. The browser build and the jsdom test run
// are both unaffected, so this is purely the headless-CLI contract.
// If the lazily-fetched converter chunk is ever missing, loadVectorConverter
// returns null and the raster fallback writes a genuine PDF with the statically
// available jsPDF - at a documented, visible quality loss rather than a failed
// export. A stale-cache miss of exactly this kind is what
// src/platform/preloadRecovery.ts reloads the page to avoid, so the vector path
// is normally restored rather than silently downgraded for the session.
import { jsPDF } from "jspdf";
import type { LayoutResult } from "../layout";
import { Scene } from "../render/Scene";
import type { RenderOptions } from "../render/options";
import type { EventType } from "../model/types";
import { makeProjector } from "../render/geometry";
import type { Theme } from "../render/theme";
import {
  FAMILY_COLOURED_KINDS,
  exportLegendRowDefs,
  type ExportLegendKind,
  type LegendStrings,
  type LegendSwatch,
} from "../render/legendRows";
import { currentDict } from "../i18n";
import { APP_NAME } from "../version";

/** One entry of an exported legend: a colored swatch and the label it keys.
 *  The event rows themselves are NOT configurable: their set, order and wording
 *  come from `LEGEND_ROWS` (src/render/legendRows.ts), the same table the
 *  on-screen overlay draws, so an export can no longer key fewer rows than the
 *  figure's reader sees in the app (docs/STYLE-GUIDE-UI.md §6). Only the two
 *  group titles and the data-driven family chips are passed in. */
export interface ExportLegendConfig {
  eventsTitle: string;
  familiesTitle: string;
  families: { name: string; color: string }[];
}

/** One drawing pane (a single reconciliation) to include in an export. */
export interface ExportPane {
  result: LayoutResult;
  options: RenderOptions;
  geneColors?: Record<number, string>;
  annotations?: Record<string, { text: string; color: string }>;
  /** Dim state copied from the screen (search/filter/compare focus), or null. */
  highlight?: Set<string> | null;
  /** The "Show only matches" set from the screen: nodes outside it are dropped
   *  outright by the export, not merely dimmed. */
  hideOutside?: Set<string> | null;
  /** User label renames, so an exported figure carries the on-screen names. */
  labelOverrides?: Record<string, string>;
  /** Per-NODE renames (renaming one of several same-named labels). */
  labelOverridesById?: Record<string, string>;
  /** Optional pane label, drawn above the pane when there is more than one. */
  title?: string;
  /** Per-pane legend. Panes in a nested/compare split describe DIFFERENT
   *  reconciliations, so each pane carries its own legend; without this the
   *  first pane's families would mislabel the others. */
  legend?: ExportLegendConfig | null;
}

/** A complete export: theme + legend + one or more stacked panes. */
export interface ExportDoc {
  theme: Theme;
  eventLabels?: Record<EventType, string>;
  legend?: ExportLegendConfig | null;
  panes: ExportPane[];
  /** Background fill; null = transparent. Defaults to the theme background. */
  background?: string | null;
  /** Provenance block (app version, source, options) written into the SVG
   *  <metadata> and the HTML hidden section, so a figure can be traced back
   *  to the data and parameters that produced it. */
  provenance?: Record<string, string>;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = 18;
const PANE_GAP = 28;
const TITLE_H = 24;
const LEGEND_GAP = 24;

/** Floor and default of the PNG DPI (dots per inch) a user can ask for. */
export const MIN_PNG_DPI = 72;
export const PNG_DPI_CHOICES = [192, 300, 600, 1200, 2400, 4800] as const;
export const DEFAULT_PNG_DPI = 300;

/** Screen reference DPI: one CSS pixel is one ninety-sixth of an inch. */
const SCREEN_DPI = 96;

/** Turn a DPI request into the rasterization scale factor to apply. */
function dpiToScale(dpi: number): number {
  return Math.max(1, dpi / SCREEN_DPI);
}

/** Approximate text width in px, telling wide CJK glyphs from latin ones. */
function estimateTextWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const wide = code >= 0x2e80 && code <= 0xff60; // the CJK / full-width ranges
    w += fontSize * (wide ? 1 : 0.6);
  }
  return w;
}

function mk(
  doc: Document,
  tag: string,
  attrs: Record<string, string | number>,
): SVGElement {
  const el = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

interface LegendInput {
  theme: Theme;
  legend: ExportLegendConfig;
  eventLabels?: Record<EventType, string>;
}

/**
 * Build a self-contained legend `<g>` - positioned later through a transform -
 * that mirrors the on-screen Legend: the event glyphs plus one color chip per
 * gene family. The rows are read from `LEGEND_ROWS` (src/render/legendRows.ts),
 * the very table `app/Legend.tsx` renders, so the two cannot drift apart.
 */
function buildLegendGroup(
  doc: Document,
  input: LegendInput,
): { group: SVGGElement; width: number; height: number } {
  const { theme, legend } = input;
  // The caller passes the live dictionary (MenuBar passes `t.event`). When a
  // caller omits it - a headless export through `npm run cli`, say - the rows
  // still come from the dictionary of the CURRENT language rather than from
  // hard-coded English strings: that is what keeps the exported key verbatim
  // identical to the on-screen legend, whose rows are `t.event.*` /
  // `t.collapsedClade` (STYLE §5.3, §6 checklist).
  const dict = currentDict();
  const ev = input.eventLabels ?? dict.event;
  const strings: LegendStrings = { t: dict, events: ev };

  const LP = 12;
  const ROW = 20;
  const ICON_W = 16;
  const TGAP = 8;
  // The exported legend has to decode the exported drawing, so it lists the
  // SAME rows as the on-screen Legend, in the same order: speciation,
  // duplication, loss, the transfer arc, its arrival on a gene lineage, the
  // bifurcation donor, the transfer-donor ring, the collapsed-clade wedge and
  // the extant gene. A key that left a glyph out - the donor ring, the wedge, or
  // the arrival arrowhead - would give a reader of the exported figure no way to
  // decode it. The one row the on-screen overlay holds and the figure does not
  // is the locate ring, a transient outline `Scene` draws only from its
  // `locateSet` prop, which no export path passes (see ScreenOnlyLegendKind).
  const firstFamilyColor = legend.families[0]?.color;
  const items: { label: string; kind: ExportLegendKind; color?: string }[] =
    exportLegendRowDefs(strings).map((row) => ({
      label: row.label,
      kind: row.kind,
      color: FAMILY_COLOURED_KINDS.has(row.kind) ? firstFamilyColor : undefined,
    }));
  const fams = legend.families.map((f) => ({
    label: f.name,
    kind: "family" as const,
    color: f.color,
  }));

  const itemTextW = [...items, ...fams].reduce(
    (m, it) => Math.max(m, estimateTextWidth(it.label, 12)),
    0,
  );
  const titleW = Math.max(
    estimateTextWidth(legend.eventsTitle, 11),
    estimateTextWidth(legend.familiesTitle, 11),
  );
  const contentW = Math.max(ICON_W + TGAP + itemTextW, titleW);
  const width = Math.ceil(contentW + LP * 2);

  const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
  // A class of its own, so the exported key is addressable: the figure can be
  // checked - by the tests, and by a reader opening the SVG - to carry exactly
  // the rows the on-screen legend shows, in the same order (STYLE §6).
  g.setAttribute("class", "rpv-export-legend");
  const body = doc.createElementNS(SVG_NS, "g");

  let cy = LP;
  const addTitle = (text: string): void => {
    const t = mk(doc, "text", {
      x: LP,
      y: cy + 11,
      fill: theme.muted,
      "font-size": 10.5,
      "font-weight": 700,
      "letter-spacing": "0.06em",
    });
    t.textContent = text;
    body.appendChild(t);
    cy += 18;
  };
  const addRow = (it: { label: string; kind: LegendSwatch; color?: string }): void => {
    const icx = LP + ICON_W / 2;
    const icy = cy + ROW / 2;
    body.appendChild(iconEl(doc, it.kind, icx, icy, theme, it.color));
    const t = mk(doc, "text", {
      x: LP + ICON_W + TGAP,
      y: icy,
      fill: theme.text,
      "font-size": 12,
      "dominant-baseline": "central",
    });
    t.textContent = it.label;
    body.appendChild(t);
    cy += ROW;
  };

  addTitle(legend.eventsTitle);
  for (const it of items) addRow(it);
  cy += 8;
  addTitle(legend.familiesTitle);
  for (const it of fams) addRow(it);
  const height = Math.ceil(cy + LP - 8);

  const panel = mk(doc, "rect", {
    x: 0,
    y: 0,
    width,
    height,
    rx: 0,
    fill: theme.panel,
    stroke: theme.speciesStroke,
    "stroke-width": 1,
  });
  g.appendChild(panel);
  g.appendChild(body);
  return { group: g, width, height };
}

/** A single legend glyph, centered at (cx, cy).
 *
 *  The parameter is `LegendSwatch` and there is deliberately NO `default:`
 *  branch: TypeScript then refuses to compile until every row the shared legend
 *  table can hand over has a real glyph here. A row that fell through to a
 *  generic dot would key the exported figure with something that matches
 *  nothing in it. */
function iconEl(
  doc: Document,
  kind: LegendSwatch,
  cx: number,
  cy: number,
  theme: Theme,
  color?: string,
): SVGElement {
  switch (kind) {
    case "duplication":
      return mk(doc, "rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, rx: 0, fill: theme.event.duplication });
    case "loss": {
      const gg = doc.createElementNS(SVG_NS, "g") as SVGGElement;
      gg.appendChild(mk(doc, "line", { x1: cx - 3.5, y1: cy - 3.5, x2: cx + 3.5, y2: cy + 3.5, stroke: theme.event.loss, "stroke-width": 1.8, "stroke-linecap": "round" }));
      gg.appendChild(mk(doc, "line", { x1: cx - 3.5, y1: cy + 3.5, x2: cx + 3.5, y2: cy - 3.5, stroke: theme.event.loss, "stroke-width": 1.8, "stroke-linecap": "round" }));
      return gg;
    }
    case "transfer": {
      // A transfer arc is drawn in its gene-family colour, so the swatch has to
      // carry that colour too, or the key fails to decode the figure.
      const arc = color ?? theme.event.transferBack;
      const gg = doc.createElementNS(SVG_NS, "g") as SVGGElement;
      gg.appendChild(mk(doc, "line", { x1: cx - 6, y1: cy, x2: cx + 3, y2: cy, stroke: arc, "stroke-width": 1.8, "stroke-dasharray": "1 3" }));
      gg.appendChild(mk(doc, "path", { d: `M${cx + 2},${cy - 2.6} L${cx + 6},${cy} L${cx + 2},${cy + 2.6} Z`, fill: arc }));
      return gg;
    }
    case "transferArrival": {
      // The recipient end of a transfer: the arrowhead landing ON a gene
      // lineage, drawn by Scene in the family colour. Matched shape for shape
      // with the on-screen key, or the figure cannot be decoded.
      const arc = color ?? theme.event.transferBack;
      const gg = doc.createElementNS(SVG_NS, "g") as SVGGElement;
      gg.appendChild(mk(doc, "line", { x1: cx - 7, y1: cy, x2: cx + 1, y2: cy, stroke: arc, "stroke-width": 1.8, "stroke-dasharray": "1 3" }));
      gg.appendChild(mk(doc, "path", { d: `M${cx - 2},${cy - 3} L${cx + 4},${cy} L${cx - 2},${cy + 3} Z`, fill: arc }));
      gg.appendChild(mk(doc, "circle", { cx: cx + 6, cy, r: 1.6, fill: arc }));
      return gg;
    }
    case "bifurcationOut":
      return mk(doc, "path", { d: `M${cx},${cy - 3.5} L${cx + 3.5},${cy} L${cx},${cy + 3.5} L${cx - 3.5},${cy} Z`, fill: theme.event.bifurcationOut });
    case "family":
      return mk(doc, "rect", { x: cx - 6, y: cy - 6, width: 12, height: 12, rx: 0, fill: color ?? theme.text, stroke: theme.speciesStroke, "stroke-width": 1 });
    case "leaf":
      return mk(doc, "circle", { cx, cy, r: 3.5, fill: color ?? theme.text });
    case "branchingOut":
      // A hollow ring, matching how Scene.geneGlyph draws a transfer donor.
      return mk(doc, "circle", { cx, cy, r: 4, fill: theme.background, stroke: theme.event.branchingOut, "stroke-width": 2 });
    case "collapsed":
      return mk(doc, "path", { d: `M${cx - 4},${cy + 3} L${cx},${cy - 4} L${cx + 4},${cy + 3} Z`, fill: theme.muted });
    case "speciation":
      // Scene.geneGlyph paints speciation in the GENE FAMILY colour rather than a
      // fixed event colour, so the exported key uses that colour here as well;
      // any other hue would be one the drawing never contains.
      return mk(doc, "circle", { cx, cy, r: 3, fill: color ?? theme.event.speciation, opacity: 0.85 });
  }
}

/** Render one pane's Scene into a standalone `<svg>` string, in its own coordinates. */
function renderPaneMarkup(doc: ExportDoc, pane: ExportPane): string {
  return renderToStaticMarkup(
    createElement(Scene, {
      result: pane.result,
      theme: doc.theme,
      options: pane.options,
      geneColors: pane.geneColors,
      annotations: pane.annotations,
      eventLabels: doc.eventLabels,
      highlight: pane.highlight ?? null,
      hideOutside: pane.hideOutside ?? null,
      labelOverrides: pane.labelOverrides,
      labelOverridesById: pane.labelOverridesById,
      // The locale the FIGURE is drawn in. `Scene` reads `useT()` when this is
      // omitted, and a `renderToStaticMarkup` render answers from zustand's
      // INITIAL state - the language `navigator.language` gave the store when it
      // was created, not the one the user picked (that is applied later, in
      // `main.tsx`). The legend below already uses `currentDict()`, so without
      // this an export would pair a Chinese key with English tooltips
      // (docs/STYLE-GUIDE-UI.md §5.1, §6).
      dict: currentDict(),
      interactive: false,
      detail: "full",
      showBackground: true,
    }),
  );
}

/**
 * Compose every pane (stacked vertically, as the on-screen split stacks them)
 * plus the optional legend into one *flat* standalone SVG: a single shared
 * `<defs>` and a translated `<g>` per pane, with no nested `<svg>`. That shape
 * rasterizes reliably and svg2pdf reads it as true vector PDF output. Bounds come
 * from the layout (through the projector), never from getBBox.
 */
export function buildDocSvg(doc: ExportDoc): { svg: string; width: number; height: number } {
  const multi = doc.panes.length > 1;
  const xdoc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}"></svg>`,
    "image/svg+xml",
  );
  const root = xdoc.documentElement as unknown as SVGSVGElement;
  root.setAttribute("style", "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif;");
  const defs = xdoc.createElementNS(SVG_NS, "defs");
  const seenDefIds = new Set<string>();

  // Legend modes: when the panes carry their own legends (nested/compare splits)
  // each row is [pane legend | pane]; otherwise a single shared doc.legend
  // (a single-pane export) sits once to the left of all panes.
  const perPaneLegend = doc.panes.some((p) => p.legend);
  let sharedLegendGroup: SVGGElement | null = null;
  let sharedLegendW = 0;
  let sharedLegendH = 0;
  if (doc.legend && !perPaneLegend) {
    const built = buildLegendGroup(xdoc, {
      theme: doc.theme,
      legend: doc.legend,
      eventLabels: doc.eventLabels,
    });
    sharedLegendGroup = built.group;
    sharedLegendW = built.width;
    sharedLegendH = built.height;
  }
  const sharedLegendPad = sharedLegendW ? sharedLegendW + LEGEND_GAP : 0;

  // Lay the panes out top-to-bottom, flattening each one into a translated group.
  const paneEls: Element[] = [];
  let cy = PAD;
  let maxRowEnd = 0;
  for (const pane of doc.panes) {
    const proj = makeProjector(pane.options.orientation, pane.result.width, pane.result.height);
    const pw = proj.width;
    const ph = proj.height;
    const titleH = multi ? TITLE_H : 0;
    let rowX = PAD + sharedLegendPad;
    if (multi && pane.title) {
      const t = mk(xdoc, "text", {
        x: rowX,
        y: cy + 15,
        fill: doc.theme.text,
        "font-size": 14,
        "font-weight": 700,
      });
      t.textContent = pane.title;
      paneEls.push(t);
    }
    if (perPaneLegend && pane.legend) {
      const built = buildLegendGroup(xdoc, {
        theme: doc.theme,
        legend: pane.legend,
        eventLabels: doc.eventLabels,
      });
      built.group.setAttribute("transform", `translate(${rowX}, ${cy + titleH})`);
      paneEls.push(built.group);
      rowX += built.width + LEGEND_GAP;
    }
    const parsed = new DOMParser().parseFromString(renderPaneMarkup(doc, pane), "image/svg+xml");
    const paneSvg = parsed.documentElement;
    // Merge this pane's <defs> (markers, gradients) into the shared defs, once.
    // All panes of an export share one theme, so the first definition of an id is
    // the right one for every pane; should per-pane themes/colors ever exist,
    // these ids must be namespaced per pane to stop cross-pane bleed.
    const pd = paneSvg.querySelector("defs");
    if (pd) {
      for (const c of Array.from(pd.children)) {
        const id = c.getAttribute("id");
        if (id && seenDefIds.has(id)) continue;
        if (id) seenDefIds.add(id);
        defs.appendChild(xdoc.importNode(c, true));
      }
    }
    const g = xdoc.createElementNS(SVG_NS, "g");
    g.setAttribute("transform", `translate(${rowX}, ${cy + titleH})`);
    for (const c of Array.from(paneSvg.children)) {
      if (c.tagName.toLowerCase() === "defs") continue;
      g.appendChild(xdoc.importNode(c, true)); // the pane's background rect and content group
    }
    paneEls.push(g);
    cy += titleH + ph + PANE_GAP;
    maxRowEnd = Math.max(maxRowEnd, rowX + pw);
  }
  const panesBottom = cy - PANE_GAP;
  const sharedLegendBottom = PAD + sharedLegendH;
  const contentBottom = Math.max(panesBottom, sharedLegendBottom);
  const width = Math.max(1, Math.ceil(maxRowEnd + PAD));
  const height = Math.max(1, Math.ceil(contentBottom + PAD));

  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.appendChild(defs);
  // Background: theme fill by default, overridable (white) or removable
  // (transparent) for journals that want to place the figure on their own page.
  if (doc.background !== null) {
    root.appendChild(mk(xdoc, "rect", { x: 0, y: 0, width, height, fill: doc.background ?? doc.theme.background }));
  }
  if (doc.provenance && Object.keys(doc.provenance).length > 0) {
    const meta = xdoc.createElementNS(SVG_NS, "metadata");
    meta.setAttribute("id", "PhyloRecViewer-provenance");
    meta.textContent = JSON.stringify(doc.provenance, null, 2);
    root.appendChild(meta);
  }
  if (sharedLegendGroup) {
    sharedLegendGroup.setAttribute("transform", `translate(${PAD}, ${PAD})`);
    root.appendChild(sharedLegendGroup);
  }
  for (const el of paneEls) root.appendChild(el);

  const out = new XMLSerializer().serializeToString(root);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${out}`, width, height };
}

/** Render the document to a standalone, WYSIWYG SVG string. */
export function sceneToSvgString(doc: ExportDoc): string {
  return buildDocSvg(doc).svg;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(doc: ExportDoc, filename: string): void {
  triggerDownload(new Blob([buildDocSvg(doc).svg], { type: "image/svg+xml" }), filename);
}

/**
 * A base64 data URI for an SVG string. WKWebView rasterizes base64 data URIs of
 * SVG far more reliably than blob: URLs, which come back as blank canvases there.
 * Encoding is chunked: byte-by-byte string concatenation is O(n²) and freezes the
 * UI on a multi-megabyte export.
 */
function svgToDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return "data:image/svg+xml;base64," + btoa(bin);
}

async function loadImage(uri: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "sync";
  img.src = uri;
  try {
    await img.decode();
    return img;
  } catch {
    // Fall back to the load event: decode() can reject in some engines.
  }
  return await new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) return resolve(img);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize SVG"));
  });
}

/** Rasterize an SVG onto a canvas, clamping the pixel size so it never exceeds
 * what the platform can hand out - an over-sized canvas comes back as a blank
 * bitmap. Returns the canvas plus the scale ACTUALLY applied (≤ the requested
 * scale), so callers can warn the user when a DPI request cannot be honored. */
async function rasterize(
  svg: string,
  width: number,
  height: number,
  bg: string,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const img = await loadImage(svgToDataUri(svg));
  const MAX = 16384; // the longest edge, in px
  const MAX_AREA = 16384 * 16384 * 0.25; // a ~67M ceiling on the total pixel count
  let s = scale;
  // Clamp on the longest edge AND on total pixel area: a very wide, very short
  // canvas can stay under the edge limit while asking for hundreds of millions of
  // pixels, and that blanks out or crashes the rasterizer.
  const largest = Math.max(width, height) * s;
  if (largest > MAX) s = MAX / Math.max(width, height);
  if (width * height * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (width * height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * s));
  canvas.height = Math.max(1, Math.ceil(height * s));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, scale: s };
}

/**
 * Insert a pHYs chunk (physical pixel density) into a PNG byte stream, so the
 * exported file carries its real DPI instead of a bare 72-px-per-inch guess.
 * The "DPI" canvas setting is a scale factor; without pHYs, layout software
 * imported the PNG at the wrong physical size.
 */
export async function pngWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  // jsdom (unit tests) and some older engines expose a Blob without
  // arrayBuffer(); pHYs is an enhancement, so degrade to the untouched blob.
  if (typeof blob.arrayBuffer !== "function") return blob;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  // pHYs payload: 9 bytes (ppm x, ppm y, unit=1 metre).
  const payload = [...be32(ppm), ...be32(ppm), 1];
  const chunk: number[] = [...be32(payload.length), 0x70, 0x48, 0x59, 0x73, ...payload];
  // CRC32 over type+payload.
  let table: number[] | null = null;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of chunk.slice(4)) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  chunk.push(...be32(crc));
  // Insert right after IHDR (the first chunk, bytes 8..8+25).
  const ihdrEnd = 8 + 8 + 13 + 4; // signature + len/type + data + crc
  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(new Uint8Array(chunk), ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return new Blob([out], { type: "image/png" });
}

/** The PNG blob together with the raster scale that actually took effect
 *  (≤ dpiToScale(dpi)) after canvas-limit clamping, so the UI can flag a
 *  resolution the file quietly did not reach. */
export async function renderPngBlob(
  doc: ExportDoc,
  dpi = DEFAULT_PNG_DPI,
): Promise<{ blob: Blob; scale: number }> {
  const { svg, width, height } = buildDocSvg(doc);
  const { canvas, scale } = await rasterize(svg, width, height, doc.background ?? doc.theme.background, dpiToScale(dpi));
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Failed to encode PNG");
  // Stamp the real density into the file (canvas-limit clamping may have
  // reduced the requested DPI; the effective value is what lands in pHYs).
  const effectiveDpi = Math.round(scale * 96);
  return { blob: await pngWithDpi(blob, effectiveDpi), scale };
}

/** Download a PNG and hand the effective raster scale (≤ dpiToScale(dpi)),
 *  measured after canvas-limit clamping, back to the caller as a warning hook. */
export async function exportPng(doc: ExportDoc, filename: string, dpi = DEFAULT_PNG_DPI): Promise<{ scale: number }> {
  const { blob, scale } = await renderPngBlob(doc, dpi);
  triggerDownload(blob, filename);
  return { scale };
}

/** The svg2pdf.js converter function. */
type VectorConverter = (typeof import("svg2pdf.js"))["svg2pdf"];

/**
 * Load the vector converter, or null when it cannot be had.
 *
 * Kept lazy on purpose (see the import note at the top of this file), and NOT
 * memoized on failure: a browser that cannot fetch the chunk right now - issue #11's
 * superseded hash, or a network that is down - may be able to later, and pinning the
 * failure would silently condemn every remaining export in the session to a raster
 * PDF. A successful import costs nothing to repeat, because the ES module map caches
 * it, so only the failure path pays for the retry.
 */
async function loadVectorConverter(): Promise<VectorConverter | null> {
  try {
    return (await import("svg2pdf.js")).svg2pdf;
  } catch {
    return null;
  }
}

/** A true-vector PDF through svg2pdf.js. Throws when the engine cannot convert. */
async function vectorPdfBlob(
  svg: string,
  width: number,
  height: number,
  convert: VectorConverter,
): Promise<Blob> {
  const el = new DOMParser().parseFromString(svg, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
  el.style.position = "absolute";
  el.style.left = "-99999px";
  el.style.top = "0";
  document.body.appendChild(el);
  try {
    // Layout sizes are CSS px while the PDF unit is the point (1 px = 0.75 pt at
    // 96 dpi). Skip this conversion and the exported PDF sits on the page
    // 96/72 = 1.33x larger than the same-named SVG/PNG.
    const ptW = (width * 72) / 96;
    const ptH = (height * 72) / 96;
    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "pt",
      format: [ptW, ptH],
    });
    await convert(el, pdf, { x: 0, y: 0, width: ptW, height: ptH });
    return pdf.output("blob");
  } finally {
    el.remove();
  }
}

/** A raster PDF: a high-resolution bitmap embedded in a correctly-sized page,
 *  written only as a last resort when vector conversion fails. It hands back the
 *  raster scale ACTUALLY applied, because `rasterize` clamps that scale for large
 *  drawings - the nominal 600 DPI is then not what the file carries. */
async function rasterPdfBlob(
  svg: string,
  width: number,
  height: number,
  bg: string,
): Promise<{ blob: Blob; scale: number }> {
  const scale = dpiToScale(DEFAULT_PNG_DPI);
  const { canvas, scale: applied } = await rasterize(svg, width, height, bg, scale);
  const dataUrl = canvas.toDataURL("image/png");
  // The same px -> pt conversion as the vector path, so a fallback PDF matches the
  // on-screen / SVG / PNG size.
  const ptW = (width * 72) / 96;
  const ptH = (height * 72) / 96;
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "pt",
    format: [ptW, ptH],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, ptW, ptH);
  return { blob: pdf.output("blob"), scale: applied };
}

/** What a PDF export ends up being: the file plus how it was made, so the UI can
 *  say out loud when the vector path failed and/or the raster DPI was clamped. */
export interface PdfResult {
  blob: Blob;
  /** Set when the file is a raster PDF, either because the lazily-loaded vector
   *  converter could not be fetched at all or because the conversion threw. */
  rasterized: boolean;
  /** The raster scale that took effect (≤ dpiToScale(DEFAULT_PNG_DPI)); null for a vector file. */
  scale: number | null;
}

/**
 * PDF export. Writes a true *vector* PDF through svg2pdf.js, and falls back to a
 * high-resolution raster PDF - which the browser renders with full CJK support -
 * whenever the vector route is unavailable, so an export never fails outright. A
 * missing converter chunk and a converter that throws are the same event to this
 * function: it is NOT a CJK- or gradient-specific detector, and a very large drawing
 * can still have its raster DPI clamped.
 * SVG export is vector by construction, with no rasterization step at all.
 *
 * The fallback itself needs no network request: jsPDF is a static import (see the
 * note at the top of this file), which is precisely what stops a missing svg2pdf.js
 * chunk from turning into the failed export of issue #11.
 */
export async function renderPdfBlob(doc: ExportDoc): Promise<PdfResult> {
  const { svg, width, height } = buildDocSvg(doc);
  const convert = await loadVectorConverter();
  if (convert) {
    try {
      return { blob: await vectorPdfBlob(svg, width, height, convert), rasterized: false, scale: null };
    } catch {
      // Vector conversion failed; fall through to the raster PDF below.
    }
  }
  // A robust high-DPI raster PDF is the answer when the vector path is not available.
  const { blob, scale } = await rasterPdfBlob(svg, width, height, doc.theme.background);
  return { blob, rasterized: true, scale };
}

export async function exportPdf(doc: ExportDoc, filename: string): Promise<PdfResult> {
  const result = await renderPdfBlob(doc);
  triggerDownload(result.blob, filename);
  return result;
}

/**
 * Build a self-contained, offline interactive HTML page: the SVG plus a small
 * dependency-free vanilla pan/zoom/fit script, shareable as a single file.
 */
export interface ExportUiLabels {
  lang: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
}

export function sceneToInteractiveHtml(
  doc: ExportDoc,
  title: string,
  ui: ExportUiLabels,
): string {
  const { svg, width, height } = buildDocSvg(doc);
  const inlineSvg = svg.replace(/^<\?xml[^>]*\?>\s*/, "");
  const bg = doc.theme.background;
  const safeTitle = title.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
  const prov = doc.provenance ?? null;
  const safeProv = prov
    ? JSON.stringify(prov).replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"))
    : "";
  const script =
    "(function(){var wrap=document.getElementById('wrap'),stage=document.getElementById('stage');" +
    "var W=" + width + ",H=" + height + ";var s=1,x=0,y=0;" +
    "function apply(){stage.style.transform='translate('+x+'px,'+y+'px) scale('+s+')';}" +
    "function fit(){var r=wrap.getBoundingClientRect();s=(Math.min(r.width/W,r.height/H)*0.95)||1;if(!isFinite(s)||s<=0)s=1;x=(r.width-W*s)/2;y=(r.height-H*s)/2;apply();}" +
    // Pointer Events: one handler path for mouse, touch and stylus, so the
    // exported page is usable on tablets (mouse-only events used to ignore it).
    "var d=false,px=0,py=0;" +
    "wrap.addEventListener('pointerdown',function(e){d=true;px=e.clientX;py=e.clientY;try{wrap.setPointerCapture(e.pointerId);}catch(_){}});" +
    "window.addEventListener('pointermove',function(e){if(!d)return;x+=e.clientX-px;y+=e.clientY-py;px=e.clientX;py=e.clientY;apply();});" +
    "window.addEventListener('pointerup',function(){d=false;});" +
    "wrap.addEventListener('wheel',function(e){e.preventDefault();var r=wrap.getBoundingClientRect();var mx=e.clientX-r.left,my=e.clientY-r.top;var f=e.deltaY<0?1.1:1/1.1;var ns=Math.max(0.02,Math.min(20,s*f));x=mx-(mx-x)*(ns/s);y=my-(my-y)*(ns/s);s=ns;apply();},{passive:false});" +
    // Keyboard: +/- zoom around the centre, arrows pan, 0/Enter refits.
    "window.addEventListener('keydown',function(e){" +
    "if(e.key==='+'||e.key==='='){s*=1.2;apply();}" +
    "else if(e.key==='-'||e.key==='_'){s/=1.2;apply();}" +
    "else if(e.key==='ArrowLeft'){x+=40;apply();}" +
    "else if(e.key==='ArrowRight'){x-=40;apply();}" +
    "else if(e.key==='ArrowUp'){y+=40;apply();}" +
    "else if(e.key==='ArrowDown'){y-=40;apply();}" +
    "else if(e.key==='0'||e.key==='Enter'){fit();}" +
    "});" +
    "document.getElementById('zin').onclick=function(){s*=1.2;apply();};" +
    "document.getElementById('zout').onclick=function(){s/=1.2;apply();};" +
    "document.getElementById('fit').onclick=fit;fit();window.addEventListener('resize',fit);})();";
  return (
    "<!doctype html><html lang=\"" + ui.lang + "\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + safeTitle + " — " + APP_NAME + "</title><style>" +
    "html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans',sans-serif;background:" + bg + "}" +
    "#wrap{position:absolute;inset:0;overflow:hidden;cursor:grab}#wrap:active{cursor:grabbing}" +
    "#stage{position:absolute;top:0;left:0;transform-origin:0 0;width:" + width + "px;height:" + height + "px}" +
    "#ctrl{position:fixed;right:14px;bottom:14px;display:flex;gap:6px;background:rgba(127,127,127,.12);" +
    "padding:6px;border-radius:0}" +
    "#ctrl button{width:30px;height:30px;border:none;border-radius:0;font-size:15px;font-weight:700;cursor:pointer}" +
    "</style></head><body>" +
    "<div id=\"wrap\" tabindex=\"0\"><div id=\"stage\">" + inlineSvg + "</div></div>" +
    // Buttons carry real names now: a bare +/−/⤢ glyph is unreadable to a
    // screen reader, and the page documents its keyboard controls.
    "<div id=\"ctrl\">" +
    // The keys each control answers to are spliced on with ` · `, never in
    // brackets: this one line is read out under BOTH locales, and §2.4 gives
    // English `()` and Chinese `（）` - half-width pairs would put English
    // punctuation into a Chinese page (` · ` is the separator §2.6 allows).
    "<button id=\"zin\" aria-label=\"" + ui.zoomIn + " · + / =\">+</button>" +
    "<button id=\"zout\" aria-label=\"" + ui.zoomOut + " · −\">−</button>" +
    "<button id=\"fit\" aria-label=\"" + ui.fit + " · 0 / Enter\">\u2922</button>" +
    "</div>" +
    (prov ? "<div id=\"provenance\" hidden>" + safeProv + "</div>" : "") +
    "<script>" + script + "</script></body></html>"
  );
}
