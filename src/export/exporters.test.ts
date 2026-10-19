/**
 * Tests for the export layer.
 *
 * They pin down the guarantees this layer makes, so that a future change cannot
 * quietly break them: hostile names stay plain text, a merged multi-pane SVG
 * grows no duplicate ids and no dangling `url(#…)` refs, the rasterizer never
 * asks for a canvas the platform cannot give, and degenerate documents still
 * export.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { layout, type LayoutResult } from "../layout";
import { parseReconciliation } from "../parser/formats";
import { defaultRenderOptions } from "../render/options";
import { themes, type Theme } from "../render/theme";
import {
  DEFAULT_PNG_DPI,
  MIN_PNG_DPI,
  buildDocSvg,
  exportPng,
  exportSvg,
  renderPngBlob,
  sceneToInteractiveHtml,
  sceneToSvgString,
  type ExportDoc,
  type ExportLegendConfig,
  type ExportPane,
} from "./exporters";

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
    transferLabel: "Transfer",
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

  it("lists a key row for every glyph the exported drawing can contain", () => {
    const result = lay(twoLeafXml(), "one.xml");
    const { svg } = buildDocSvg(exportDoc([pane(result, { legend: legendWith(["famA"]) })]));
    const text = textOf(parseMarkup(svg));
    // These are the rows the on-screen Legend carries. An exported figure whose
    // key omits the donor ring or the collapsed wedge cannot be decoded.
    for (const label of [
      "Speciation",
      "Duplication",
      "Loss",
      "Transfer",
      "Bifurcation out",
      "Transfer (donor)",
      "Collapsed",
      "Extant gene",
    ]) {
      expect(text).toContain(label);
    }
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
    const html = sceneToInteractiveHtml(doc, '</title><script>alert(2)</script><b>');
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // The single <script> element is the pan/zoom code; the injected one is text.
    expect(html.match(/<script/g)).toHaveLength(1);
    const head = html.slice(0, html.indexOf("<svg"));
    expect(head.match(/<title/g)).toHaveLength(1);
    const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? "";
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
    const html = sceneToInteractiveHtml(doc, "solo");
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

  it("holds the DPI defaults the user manual documents (600 dpi)", () => {
    expect(DEFAULT_PNG_DPI).toBe(600);
    expect(MIN_PNG_DPI).toBe(DEFAULT_PNG_DPI);
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
