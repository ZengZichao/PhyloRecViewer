import { defaultLayoutOptions, type LayoutOptions } from "./layout";
import { defaultRenderOptions, type LabelStyle, type RenderOptions } from "./render/options";
import type { ThemePref } from "./render/theme";

/** Session schema version this build writes; bump when the stored shape changes. */
export const CURRENT_SESSION_VERSION = 1;

/**
 * A saved session holds everything needed to reproduce a drawing offline: the
 * source file(s) plus all view state (options, theme, swaps, collapses,
 * per-tree colors). It is a plain JSON document.
 */
export interface SessionData {
  version: number;
  fileName: string | null;
  xml: string;
  /** For a document built by merging several files, the full source list, so the
   *  merged result can be rebuilt on restore.
   *  Single-file documents omit this field. */
  sourceFiles?: { name: string; text: string }[] | null;
  nestedName?: string | null;
  nestedXml?: string | null;
  /** Alternative reconciliation of the same family, for compare mode. */
  compareName?: string | null;
  compareXml?: string | null;
  layoutOptions: LayoutOptions;
  renderOptions: RenderOptions;
  themeId: ThemePref;
  swapped: string[];
  /** The same mirror set for the nested (host) drawing, kept separate from `swapped` above. */
  nestedSwapped: string[];
  collapsed: string[];
  geneColors: Record<number, string>;
  /** User notes on gene nodes, keyed by node id. */
  annotations?: Record<string, { text: string; color: string }>;
  /** User renames of species/gene labels, keyed by original label text. */
  labelOverrides?: Record<string, string>;
  /** Snapshot of the other, inactive tabs; the fields above are the
   *  active tab. */
  tabs?: SavedTab[];
  /** Index of the tab snapshot that is active when the session is saved, counted
   *  over the WHOLE tab bar (`0` = first, `tabs.length` = last). The autosave
   *  writer and the session writer both emit it, and both restore paths re-insert
   *  the front document there. Files without it simply come back with the active
   *  tab first. */
  activeTabIndex?: number;
  /** Search & filter criteria; absent means the defaults. */
  searchQuery?: string;
  searchRegex?: boolean;
  eventFilter?: { speciation: boolean; duplication: boolean; loss: boolean; transfer: boolean; leaf: boolean };
  familyFilter?: number[] | null;
  confidenceMin?: number;
  confidenceMax?: number;
}

/** One inactive document tab inside a saved session. */
export interface SavedTab {
  title: string | null;
  xml: string;
  /** Source files of a merged-document tab. */
  sourceFiles?: { name: string; text: string }[] | null;
  nestedName?: string | null;
  nestedXml?: string | null;
  compareName?: string | null;
  compareXml?: string | null;
  swapped: string[];
  nestedSwapped: string[];
  collapsed: string[];
  geneColors: Record<number, string>;
  annotations?: Record<string, { text: string; color: string }>;
  labelOverrides?: Record<string, string>;
  /** Search & filter criteria. */
  searchQuery?: string;
  searchRegex?: boolean;
  eventFilter?: { speciation: boolean; duplication: boolean; loss: boolean; transfer: boolean; leaf: boolean };
  familyFilter?: number[] | null;
  confidenceMin?: number;
  confidenceMax?: number;
}

/**
 * The tab snapshot of a workspace, optionally carrying - as a plain array
 * property, never as serialized data - where the FRONT tab sits among them
 * (`SessionData.activeTabIndex`).
 *
 * Callers that assemble a `SessionData` by hand (the menu's "Save session", the
 * crash-recovery writer) receive the field from `savedTabsOfStore()`, and
 * `restoreTabs()` reads it off the array `parseSession()` hands back, so no call
 * site has to remember to pass an index. `JSON.stringify` serializes arrays by
 * index only, so the property cannot leak into the file.
 */
export type SavedTabsSnapshot = SavedTab[] & { activeTabIndex?: number };

/** Read the tab-order hint off an array of saved tabs. */
export function tabsActiveTabIndex(tabs: SavedTab[] | undefined): number | undefined {
  const v = (tabs as SavedTabsSnapshot | undefined)?.activeTabIndex;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

export function serializeSession(data: SessionData): string {
  const activeTabIndex =
    data.activeTabIndex ?? tabsActiveTabIndex(data.tabs);
  return JSON.stringify({ ...data, activeTabIndex }, null, 2);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Numeric fields of LayoutOptions, with the ranges the UI itself offers. */
const LAYOUT_NUMBER_RANGES: Record<string, [min: number, max: number]> = {
  levelHeight: [20, 400],
  geneGap: [2, 100],
  speciesThickness: [4, 200],
  speciesGap: [0, 200],
  margin: [0, 500],
  labelFontPx: [4, 200],
};

function sanitizeLabelStyle(v: unknown, fallback: LabelStyle): LabelStyle {
  const r = asRecord(v) ?? {};
  const align = r.align;
  return {
    size: asNumber(r.size, fallback.size, 4, 72),
    bold: asBool(r.bold, fallback.bold),
    italic: asBool(r.italic, fallback.italic),
    angle: asNumber(r.angle, fallback.angle, -180, 180),
    offset: asNumber(r.offset, fallback.offset, -100, 300),
    align:
      align === "left" || align === "center" || align === "right" || align === "auto"
        ? align
        : fallback.align,
  };
}

/** Merge an (untrusted) raw object onto the defaults, keeping only known keys
 *  whose values are sane. A session file is a JSON document that travels between
 *  machines, so a corrupted or deliberately crafted options block must never
 *  reach the layout engine. */
export function sanitizeLayoutOptions(v: unknown): LayoutOptions {
  const r = asRecord(v) ?? {};
  const out: LayoutOptions = { ...defaultLayoutOptions };
  for (const [key, [min, max]] of Object.entries(LAYOUT_NUMBER_RANGES)) {
    (out as unknown as Record<string, number>)[key] = asNumber(r[key], defaultLayoutOptions[key as keyof LayoutOptions] as number, min, max);
  }
  out.alignTips = asBool(r.alignTips, defaultLayoutOptions.alignTips);
  out.midwayDuplication = asBool(r.midwayDuplication, defaultLayoutOptions.midwayDuplication);
  out.useBranchLengths = asBool(r.useBranchLengths, defaultLayoutOptions.useBranchLengths);
  out.layoutMode = r.layoutMode === "tidy" ? "tidy" : "rectangular";
  return out;
}

export function sanitizeRenderOptions(v: unknown): RenderOptions {
  const r = asRecord(v) ?? {};
  const out: RenderOptions = { ...defaultRenderOptions };
  out.curved = asBool(r.curved, defaultRenderOptions.curved);
  out.geneThickness = asNumber(r.geneThickness, defaultRenderOptions.geneThickness, 0.5, 10);
  out.speciesOpacity = asNumber(r.speciesOpacity, defaultRenderOptions.speciesOpacity, 0, 1);
  out.symbolSize = asNumber(r.symbolSize, defaultRenderOptions.symbolSize, 2, 30);
  out.showGeneLabels = asBool(r.showGeneLabels, defaultRenderOptions.showGeneLabels);
  out.showInternalGeneNames = asBool(r.showInternalGeneNames, defaultRenderOptions.showInternalGeneNames);
  out.showSpeciesLabels = asBool(r.showSpeciesLabels, defaultRenderOptions.showSpeciesLabels);
  out.showEvents = asBool(r.showEvents, defaultRenderOptions.showEvents);
  out.showSupport = asBool(r.showSupport, defaultRenderOptions.showSupport);
  out.speciesGradient = asBool(r.speciesGradient, defaultRenderOptions.speciesGradient);
  // Clamp transfer-bow to the on-screen slider domain [0, 0.5] (Sidebar), so a
  // hand-edited session cannot carry a value the UI can neither show nor adjust:
  // the slider caps at 0.5, so a ceiling of 1 would let the arc bow past it.
  out.transferBow = asNumber(r.transferBow, defaultRenderOptions.transferBow, 0, 0.5);
  out.haloUnderGenes = asBool(r.haloUnderGenes, defaultRenderOptions.haloUnderGenes);
  out.copyHeatmap = asBool(r.copyHeatmap, defaultRenderOptions.copyHeatmap);
  out.orientation =
    r.orientation === "bottom" || r.orientation === "left" || r.orientation === "right"
      ? r.orientation
      : "top";
  out.speciesLabelStyle = sanitizeLabelStyle(r.speciesLabelStyle, defaultRenderOptions.speciesLabelStyle);
  out.geneTipLabelStyle = sanitizeLabelStyle(r.geneTipLabelStyle, defaultRenderOptions.geneTipLabelStyle);
  out.geneInternalLabelStyle = sanitizeLabelStyle(r.geneInternalLabelStyle, defaultRenderOptions.geneInternalLabelStyle);
  return out;
}

function sanitizeAnnotations(v: unknown): Record<string, { text: string; color: string }> {
  const r = asRecord(v);
  if (!r) return {};
  const out: Record<string, { text: string; color: string }> = {};
  for (const [k, val] of Object.entries(r)) {
    const a = asRecord(val);
    if (a && typeof a.text === "string" && typeof a.color === "string") {
      out[k] = { text: a.text, color: a.color };
    }
  }
  return out;
}

function sanitizeStringRecord(v: unknown): Record<string, string> {
  const r = asRecord(v);
  if (!r) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(r)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function sanitizeGeneColors(v: unknown): Record<number, string> {
  const r = asRecord(v);
  if (!r) return {};
  const out: Record<number, string> = {};
  for (const [k, val] of Object.entries(r)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && typeof val === "string") out[idx] = val;
  }
  return out;
}

function sanitizeSourceFiles(v: unknown): { name: string; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { name: string; text: string }[] = [];
  for (const item of v) {
    const r = asRecord(item);
    if (r && typeof r.name === "string" && typeof r.text === "string") {
      out.push({ name: r.name, text: r.text });
    }
  }
  return out.length > 0 ? out : null;
}

function sanitizeEventFilter(v: unknown): { speciation: boolean; duplication: boolean; loss: boolean; transfer: boolean; leaf: boolean } | undefined {
  const r = asRecord(v);
  if (!r) return undefined;
  return {
    speciation: asBool(r.speciation, true),
    duplication: asBool(r.duplication, true),
    loss: asBool(r.loss, true),
    transfer: asBool(r.transfer, true),
    leaf: asBool(r.leaf, true),
  };
}

function sanitizeFamilyFilter(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is number => typeof x === "number" && Number.isInteger(x));
}

/** Index of the saved front tab, validated against the tabs that came with it.
 *  A hand-edited or out-of-range index would reposition the restored workspace
 *  somewhere the file cannot describe, so it counts as "not recorded". Legal
 *  values are 0..tabCount, where `tabCount` means "after the last saved tab". */
function sanitizeActiveTabIndex(v: unknown, tabCount: number): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  if (v < 0 || v > tabCount) return undefined;
  return v;
}

function sanitizeSavedTab(v: unknown): SavedTab | null {
  const r = asRecord(v);
  if (!r || typeof r.xml !== "string") return null;
  return {
    title: typeof r.title === "string" ? r.title : null,
    xml: r.xml,
    sourceFiles: sanitizeSourceFiles(r.sourceFiles),
    nestedName: typeof r.nestedName === "string" ? r.nestedName : null,
    nestedXml: typeof r.nestedXml === "string" ? r.nestedXml : null,
    compareName: typeof r.compareName === "string" ? r.compareName : null,
    compareXml: typeof r.compareXml === "string" ? r.compareXml : null,
    swapped: asStringArray(r.swapped),
    nestedSwapped: asStringArray(r.nestedSwapped),
    collapsed: asStringArray(r.collapsed),
    geneColors: sanitizeGeneColors(r.geneColors),
    annotations: sanitizeAnnotations(r.annotations),
    labelOverrides: sanitizeStringRecord(r.labelOverrides),
    searchQuery: typeof r.searchQuery === "string" ? r.searchQuery : undefined,
    searchRegex: asBool(r.searchRegex, false),
    eventFilter: sanitizeEventFilter(r.eventFilter),
    familyFilter: sanitizeFamilyFilter(r.familyFilter),
    confidenceMin: asNumber(r.confidenceMin, 0, 0, 1),
    confidenceMax: asNumber(r.confidenceMax, 1, 0, 1),
  };
}

/**
 * Parse and normalize a session document. Validates the required shape, refuses
 * files written against a newer schema than this build understands, fills every
 * missing field with a sane default (a document that carries no `nestedSwapped`,
 * for example), and clamps each option value into the range the UI exposes.
 */
export function parseSession(text: string): SessionData {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error("Session file is not valid JSON");
  }
  if (!d || typeof d !== "object") {
    throw new Error("Not a PhyloRecViewer session file");
  }
  const obj = d as Record<string, unknown>;
  if (typeof obj.xml !== "string") {
    throw new Error("Not a PhyloRecViewer session file");
  }

  const version = typeof obj.version === "number" ? obj.version : 1;
  if (version > CURRENT_SESSION_VERSION) {
    throw new Error(
      `This session was created by a newer version of PhyloRecViewer (v${version}); please update to open it.`,
    );
  }

  // Reading is additive by design: unknown and missing fields fall back to
  // defaults, so a document that omits any of them still loads cleanly.
  const tabsRaw = Array.isArray(obj.tabs) ? obj.tabs : [];
  const tabs = tabsRaw
    .map(sanitizeSavedTab)
    .filter((t): t is SavedTab => t !== null);
  const activeTabIndex = sanitizeActiveTabIndex(obj.activeTabIndex, tabs.length);
  if (activeTabIndex !== undefined && tabs.length > 0) {
    // Non-enumerable so `toEqual` and JSON never see it: the index is a
    // restore-time hint for callers that only handle the tab array.
    Object.defineProperty(tabs, "activeTabIndex", {
      value: activeTabIndex,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return {
    version: CURRENT_SESSION_VERSION,
    fileName: typeof obj.fileName === "string" ? obj.fileName : null,
    xml: obj.xml,
    sourceFiles: sanitizeSourceFiles(obj.sourceFiles),
    nestedName: typeof obj.nestedName === "string" ? obj.nestedName : null,
    nestedXml: typeof obj.nestedXml === "string" ? obj.nestedXml : null,
    compareName: typeof obj.compareName === "string" ? obj.compareName : null,
    compareXml: typeof obj.compareXml === "string" ? obj.compareXml : null,
    layoutOptions: sanitizeLayoutOptions(obj.layoutOptions),
    renderOptions: sanitizeRenderOptions(obj.renderOptions),
    themeId: obj.themeId === "dark" ? "dark" : obj.themeId === "system" ? "system" : "light",
    swapped: asStringArray(obj.swapped),
    nestedSwapped: asStringArray(obj.nestedSwapped),
    collapsed: asStringArray(obj.collapsed),
    geneColors: sanitizeGeneColors(obj.geneColors),
    annotations: sanitizeAnnotations(obj.annotations),
    labelOverrides: sanitizeStringRecord(obj.labelOverrides),
    tabs: tabs.length > 0 ? tabs : undefined,
    activeTabIndex,
    searchQuery: typeof obj.searchQuery === "string" ? obj.searchQuery : undefined,
    searchRegex: asBool(obj.searchRegex, false),
    eventFilter: sanitizeEventFilter(obj.eventFilter),
    familyFilter: sanitizeFamilyFilter(obj.familyFilter),
    confidenceMin: asNumber(obj.confidenceMin, 0, 0, 1),
    confidenceMax: asNumber(obj.confidenceMax, 1, 0, 1),
  };
}
