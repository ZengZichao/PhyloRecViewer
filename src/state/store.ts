import { create } from "zustand";
import {
  defaultLayoutOptions,
  type LayoutOptions,
} from "../layout";
import { optimizeCrossings } from "../layout/optimize";
import type { Reconciliation } from "../model/types";
import { ALL_EVENTS, type EventFilter } from "../analysis/focus";
import { parseMerged, parseReconciliation } from "../parser/formats";
import {
  defaultRenderOptions,
  defaultLabelAngle,
  type RenderOptions,
} from "../render/options";
import type { ThemePref } from "../render/theme";
import type { SavedTab } from "../session";
import { loadPrefs, savePrefs } from "./prefs";

/** Which docked analysis panel is showing. */
export type RightPanelTab =
  | "search"
  | "stats"
  | "network"
  | "check"
  | "annotations"
  | "diff";

/** The editable slice captured for undo/redo. It covers the layout & render
 *  options too, so adjusting sliders and toggles is undoable like every other
 *  edit rather than sitting outside the ⌘Z history. */
export interface HistorySnapshot {
  swapped: Set<string>;
  nestedSwapped: Set<string>;
  collapsed: Set<string>;
  geneColors: Record<number, string>;
  annotations: Record<string, GeneAnnotation>;
  layoutOptions: LayoutOptions;
  renderOptions: RenderOptions;
  /** User renames of species/gene labels, keyed by original label text. */
  labelOverrides: Record<string, string>;
  /** Full document state; present only on undo-able open/load operations so a
   *  wrongly opened file can be undone back to the previous document. */
  doc?: HistoryDoc | null;
}

/** Document slice captured for "undo open". References are shared (never
 *  deep-copied), so a history entry is cheap even for large reconciliations. */
export interface HistoryDoc {
  xml: string | null;
  fileName: string | null;
  sourceFiles: { name: string; text: string }[] | null;
  recon: Reconciliation | null;
  error: string | null;
  warnings: string[];
  nested: Reconciliation | null;
  nestedName: string | null;
  nestedXml: string | null;
  nestedError: string | null;
  compare: Reconciliation | null;
  compareName: string | null;
  compareXml: string | null;
  compareError: string | null;
  sampleId: string | null;
}

/** A user note attached to a gene node (persisted in the session file). */
export interface GeneAnnotation {
  text: string;
  color: string;
}

/** Toast severity drives its colour: each kind renders in its own colour, so a
 *  success or info message never takes the error red. */
export type ToastKind = "success" | "error" | "info";

export interface ToastData {
  /** Monotonic id of THIS toast. Auto-dismiss timers compare ids, never the
   *  message text: two identical messages shown in a row are two different
   *  toasts, and the older timer must not clear the newer one. */
  id: number;
  msg: string;
  kind: ToastKind;
}

/** Which pane a locate request targets (primary / nested / compare). */
export type PaneId = "primary" | "nested" | "compare";

const HISTORY_LIMIT = 100;

/** How long a toast stays up, and how long a heavy task is willing to wait for
 *  an animation frame it may never get. */
const TOAST_MS = 4000;
const FRAME_WAIT_MS = 32;

/**
 * Resolve after the next animation frame - or after `FRAME_WAIT_MS`, whichever
 * comes first.
 *
 * The frame wait exists only so the loading overlay can paint before a long
 * synchronous parse. A page that is not painting (background browser tab,
 * minimized or fully occluded Tauri window, `document.visibilityState ===
 * "hidden"`) never fires rAF callbacks, so an unbounded frame await would hang
 * every document entry point behind a full-screen, uncancellable overlay.
 * Both settles paths are idempotent and cancel the loser, so the promise can
 * only resolve once.
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let frame = 0;
    let timer: number | ReturnType<typeof setTimeout> | 0 = 0;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      resolve();
    };
    try {
      frame = requestAnimationFrame(finish);
    } catch {
      // No rAF at all (non-browser / stripped environment): the timer decides.
    }
    timer = setTimeout(finish, FRAME_WAIT_MS);
  });
}

interface AppState {
  xml: string | null;
  fileName: string | null;
  /** When the document was created by merging multiple files, this holds the
   *  original file list so the merged document can be persisted and restored
   *  (single-file documents leave this as null). */
  sourceFiles: { name: string; text: string }[] | null;
  recon: Reconciliation | null;
  error: string | null;
  warnings: string[];

  /** Optional second reconciliation for a 3-level (nested) view. */
  nested: Reconciliation | null;
  nestedName: string | null;
  nestedXml: string | null;
  nestedError: string | null;

  /** Optional alternative reconciliation of the SAME family, for comparison. */
  compare: Reconciliation | null;
  compareName: string | null;
  compareXml: string | null;
  compareError: string | null;

  layoutOptions: LayoutOptions;
  renderOptions: RenderOptions;
  /** User theme preference: "light", "dark", or "system" (follows OS). */
  themeId: ThemePref;
  /** Always "light" or "dark" — the resolved rendering theme. */
  resolvedThemeId: "light" | "dark";
  /** UI language. */
  locale: "zh" | "en";
  /** Species clades whose children order is mirrored in the primary drawing.
   *  Keys are species-node identities - see `toggleSwap`. */
  swapped: Set<string>;
  /** Same, but for the nested (host) drawing - kept separate so identically
   *  named species in the two files never mirror each other by accident. */
  nestedSwapped: Set<string>;
  /** Gene nodes (by id) whose subtree is collapsed. */
  collapsed: Set<string>;
  /** Per gene-tree color overrides, keyed by tree index. */
  geneColors: Record<number, string>;
  /** User notes attached to gene nodes, keyed by node id. */
  annotations: Record<string, GeneAnnotation>;
  /** User renames of species/gene labels, keyed by original label text. */
  labelOverrides: Record<string, string>;
  /** The gene node currently being annotated (drives the editor popover). */
  annotating: { id: string; name: string } | null;
  /** Show the legend, both on the canvas and in exported images. */
  showLegend: boolean;
  /** Show the minimap navigator overlay on the canvas. */
  minimap: boolean;
/** Export PNG DPI (minimum 600). Higher = more pixels per inch. */
pngDpi: number;
  /** Id of the bundled sample currently loaded (null when a real file is open). */
  sampleId: string | null;

  /** Open document tabs; the active tab's document lives in the flat fields
   *  above, while inactive tabs are stashed in `docs`. */
  tabs: TabMeta[];
  activeTabId: string;
  docs: Record<string, DocState>;
  /** Raw session-tab snapshot of the active document while it still has to be
   *  parsed. Restored (inactive) tabs are kept unparsed on purpose so first
   *  paint does not parse the whole workspace; `switchTab` materializes
   *  them on first activation. Only ever non-null for a stashed document. */
  lazyDoc: SavedTab | null;
  /** Left controls sidebar open/collapsed. */
  sidebarOpen: boolean;
  /** Async heavy task in progress (drives the loading overlay). Ref-counted
   *  under the hood so a finished task cannot hide an unfinished one. */
  loading: boolean;
  /** Short-lived "layout is being recomputed" indicator (rearrange feedback). */
  rendering: boolean;
  /** Shortcuts & interactions help overlay open state. */
  helpOpen: boolean;

  /** Docked analysis panel: open state and active tab. */
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  /** Search & filter criteria (drive node dimming across the drawing). */
  searchQuery: string;
  searchRegex: boolean;
  /** Hide every non-matching node (opacity 0) instead of just dimming it. */
  onlyMatches: boolean;
  eventFilter: EventFilter;
  /** Gene-tree indices to keep; null = all families shown. */
  familyFilter: Set<number> | null;
  /** Only nodes whose event confidence is within [min, max] (0..1) match. */
  confidenceMin: number;
  confidenceMax: number;
  /** A request to center a canvas on a node (nonce triggers it; pane routes it
   *  to the primary / nested / compare canvas). */
  locate: { geneId: string; nonce: number; pane?: PaneId } | null;

  /** Short-lived status message shown as a toast (singleton, App-level). */
  toast: ToastData | null;
  showToast: (msg: string, kind?: ToastKind) => void;
  clearToast: () => void;

  /** Multi-file open awaiting an explicit merge-vs-tabs decision. */
  pendingMulti: { name: string; text: string }[] | null;
  /** Tab `pendingMulti` was dropped into, so answering the dialog cannot write
   *  into a tab the user opened meanwhile. Null = the active tab. */
  pendingMultiTabId: string | null;

  /** Undo/redo history of the editable slice. */
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  /** Run a heavy (synchronous) task with the loading overlay visible on every
   *  entry point - the single "heavy task" contract. */
  runHeavy: (fn: () => void) => Promise<void>;
  loadXml: (xml: string, fileName: string) => void;
  loadMany: (files: { name: string; text: string }[]) => void;
  loadNestedXml: (xml: string, fileName: string) => void;
  clearNested: () => void;
  loadCompareXml: (xml: string, fileName: string) => void;
  clearCompare: () => void;
  newTab: () => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  openInNewTab: (files: { name: string; text: string }[]) => void;
  confirmMerge: () => void;
  confirmTabs: () => void;
  cancelPendingMulti: () => void;
  /** Clear the error panel, returning to the last good document (if any). */
  clearError: () => void;
  /** Read File objects (async, with a loading indicator) then open them. */
  openFiles: (files: File[]) => Promise<void>;
  setHelpOpen: (on: boolean) => void;
  setSidebarOpen: (on: boolean) => void;
  toggleSidebar: () => void;
  /** Mirror (reverse the child order of) one species clade.
   *
   *  `species` is the species-node *identity*: a node id is preferred, because
   *  two species that share a name (or a rename) must not mirror each other
   *  with one click. A plain name is accepted too - it is what clicking a drawn
   *  clade sends - and then every clade carrying that name mirrors. */
  toggleSwap: (species: string) => void;
  toggleNestedSwap: (species: string) => void;
  optimizeSwaps: () => void;
  clearSwaps: () => void;
  toggleCollapse: (geneId: string) => void;
  setGeneColor: (treeIndex: number, color: string) => void;
  setAnnotating: (sel: { id: string; name: string } | null) => void;
  setAnnotation: (id: string, text: string, color: string) => void;
  removeAnnotation: (id: string) => void;
  /** Rename a single species or gene label (key = original label text). */
  setLabelOverride: (key: string, value: string) => void;
  /** Batch find-and-replace across species and/or gene labels (regex supported). */
  batchReplaceLabels: (
    find: string,
    replace: string,
    useRegex: boolean,
    scope: "species" | "gene" | "all",
  ) => void;
  /** Clear all label overrides. */
  clearLabelOverrides: () => void;
  setShowLegend: (on: boolean) => void;
  setMinimap: (on: boolean) => void;
  setPngDpi: (n: number) => void;
  setSampleId: (id: string | null) => void;
  openPanel: (tab: RightPanelTab) => void;
  closePanel: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setSearchQuery: (q: string) => void;
  setSearchRegex: (on: boolean) => void;
  setOnlyMatches: (on: boolean) => void;
  setConfidenceRange: (min: number, max: number) => void;
  toggleEventFilter: (k: keyof EventFilter) => void;
  resetEventFilter: () => void;
  toggleFamilyFilter: (index: number) => void;
  clearFamilyFilter: () => void;
  clearSearchFilter: () => void;
  locateGene: (geneId: string, pane?: PaneId) => void;
  undo: () => void;
  redo: () => void;
  setLayout: (patch: Partial<LayoutOptions>) => void;
  setRender: (patch: Partial<RenderOptions>) => void;
  setTheme: (id: ThemePref) => void;
  /** Re-resolve the theme when the OS dark/light preference changes. */
  syncSystemTheme: () => void;
  setLocale: (locale: "zh" | "en") => void;
  applyViewState: (v: {
    layoutOptions?: Partial<LayoutOptions>;
    renderOptions?: Partial<RenderOptions>;
    themeId?: ThemePref;
    swapped?: string[];
    nestedSwapped?: string[];
    collapsed?: string[];
    geneColors?: Record<number, string>;
    annotations?: Record<string, GeneAnnotation>;
    labelOverrides?: Record<string, string>;
    /** When false, the tab's undo/redo history is preserved. Defaults to true so
     *  session/autosave restore starts from a clean history. A user who merely
     *  resets view options should pass false. */
    resetHistory?: boolean;
  }) => void;
}

function snapshot(s: AppState): HistorySnapshot {
  return {
    swapped: s.swapped,
    nestedSwapped: s.nestedSwapped,
    collapsed: s.collapsed,
    geneColors: s.geneColors,
    annotations: s.annotations,
    layoutOptions: s.layoutOptions,
    renderOptions: s.renderOptions,
    labelOverrides: s.labelOverrides,
  };
}

/** Document slice of the current state (used by undo-able open operations). */
function docSnapshot(s: AppState): HistoryDoc {
  return {
    xml: s.xml,
    fileName: s.fileName,
    sourceFiles: s.sourceFiles,
    recon: s.recon,
    error: s.error,
    warnings: s.warnings,
    nested: s.nested,
    nestedName: s.nestedName,
    nestedXml: s.nestedXml,
    nestedError: s.nestedError,
    compare: s.compare,
    compareName: s.compareName,
    compareXml: s.compareXml,
    compareError: s.compareError,
    sampleId: s.sampleId,
  };
}

/** Document slice of a stashed (inactive) tab. Same fields as `docSnapshot`,
 *  read from a `DocState` instead of the flat state, so a background tab can
 *  keep its own undo history when a document is written into it. */
function docFromSlice(d: DocState): HistoryDoc {
  return {
    xml: d.xml,
    fileName: d.fileName,
    sourceFiles: d.sourceFiles,
    recon: d.recon,
    error: d.error,
    warnings: d.warnings,
    nested: d.nested,
    nestedName: d.nestedName,
    nestedXml: d.nestedXml,
    nestedError: d.nestedError,
    compare: d.compare,
    compareName: d.compareName,
    compareXml: d.compareXml,
    compareError: d.compareError,
    sampleId: d.sampleId,
  };
}

/** Editable+document snapshot of a stashed tab, for that tab's own undo stack. */
function entryFromSlice(s: AppState, d: DocState): HistorySnapshot {
  return {
    swapped: d.swapped,
    nestedSwapped: d.nestedSwapped,
    collapsed: d.collapsed,
    geneColors: d.geneColors,
    annotations: d.annotations,
    // Layout/style options are shared across tabs, so the tab inherits the
    // options it would be drawn with right now.
    layoutOptions: s.layoutOptions,
    renderOptions: s.renderOptions,
    labelOverrides: d.labelOverrides,
    doc: docFromSlice(d),
  };
}

/** Outcome of turning source files into a document. */
type DocLoad =
  | { ok: true; title: string | null; patch: Partial<DocState> & Partial<AppState> }
  | { ok: false; error: string };

/** Parse source files into the document patch that `loadXml` / `loadMany` (and
 *  the background-tab write of `openFiles`) apply, so all three reset
 *  exactly the same per-document slice. On failure only `error`/`warnings` are
 *  reported, because a failed open must never clobber the previous document. */
function loadDoc(files: { name: string; text: string }[]): DocLoad {
  try {
    const merged = files.length > 1;
    const first = files[0];
    const recon = merged
      ? parseMerged(files)
      : parseReconciliation(first?.text ?? "", first?.name ?? "document");
    const title = merged ? `${files.length} files` : first?.name ?? null;
    // Apply the user's saved "default view" to every newly opened document so
    // layout/style preferences take effect immediately. Session/autosave
    // restore calls `applyViewState` afterwards to override with its own.
    const dv = defaultViewOptions();
    return {
      ok: true,
      title,
      patch: {
        xml: first?.text ?? null,
        fileName: title,
        sourceFiles: merged ? files : null,
        recon,
        error: null,
        warnings: recon.warnings,
        // A nested level belongs to the document it was loaded with, so a new
        // primary file clears it.
        nested: null,
        nestedName: null,
        nestedXml: null,
        nestedError: null,
        compare: null,
        compareName: null,
        compareXml: null,
        compareError: null,
        layoutOptions: dv.layoutOptions,
        renderOptions: dv.renderOptions,
        swapped: new Set<string>(),
        nestedSwapped: new Set<string>(),
        collapsed: new Set<string>(),
        geneColors: {},
        annotations: {},
        annotating: null,
        // Label renames belong to the old document: keeping them would let the
        // old file's overrides rename same-text labels in the new file.
        labelOverrides: {},
        // The document is parsed, so there is no stashed snapshot left to build.
        lazyDoc: null,
        searchQuery: "",
        searchRegex: false,
        eventFilter: { ...ALL_EVENTS },
        familyFilter: null,
        confidenceMin: 0,
        confidenceMax: 1,
        locate: null,
        sampleId: null,
      },
    };
  } catch (e) {
    return { ok: false, error: friendlyParseError(e) };
  }
}

/** Patch that records the current editable slice and drops the redo stack.
 *  Consecutive layout/render commits within 600ms are merged into a single
 *  history step so dragging a slider does not flood the 100-entry history. */
let lastCommit: { kind: "layout" | "render" | "edit" | "open"; at: number } | null = null;

/** The merge window is only valid inside one document: switching tabs or
 *  loading a file must start a fresh history step, or the first edit on the
 *  new tab would overwrite the trailing entry of the previous tab's history. */
function resetCommitMerge(): void {
  lastCommit = null;
}

function commit(
  s: AppState,
  kind: "layout" | "render" | "edit" | "open" = "edit",
  doc?: HistoryDoc | null,
): Pick<AppState, "past" | "future"> {
  const now = Date.now();
  const snap = snapshot(s);
  if (doc) snap.doc = doc;
  if (kind !== "edit" && lastCommit && lastCommit.kind === kind && now - lastCommit.at < 600) {
    // Rapid consecutive commits of the same kind merge into ONE history step.
    // Keep the FIRST snapshot of the run (already on top of `past`) so undo
    // returns to the value before the drag started, not to the second-to-last
    // intermediate value.
    lastCommit = { kind, at: now };
    return { past: s.past, future: [] };
  }
  lastCommit = { kind, at: now };
  return { past: [...s.past, snap].slice(-HISTORY_LIMIT), future: [] };
}

/** Restore the editable slice fields of a snapshot. */
function editFieldsFrom(snap: HistorySnapshot): Pick<
  AppState,
  | "swapped"
  | "nestedSwapped"
  | "collapsed"
  | "geneColors"
  | "annotations"
  | "layoutOptions"
  | "renderOptions"
  | "labelOverrides"
> {
  return {
    swapped: snap.swapped,
    nestedSwapped: snap.nestedSwapped,
    collapsed: snap.collapsed,
    geneColors: snap.geneColors,
    annotations: snap.annotations,
    layoutOptions: snap.layoutOptions,
    renderOptions: snap.renderOptions,
    labelOverrides: snap.labelOverrides,
  };
}

/** Restore the document slice fields of a snapshot (undo-open support). */
function docFieldsFrom(snap: HistorySnapshot): Pick<
  AppState,
  | "xml"
  | "fileName"
  | "sourceFiles"
  | "recon"
  | "error"
  | "warnings"
  | "nested"
  | "nestedName"
  | "nestedXml"
  | "nestedError"
  | "compare"
  | "compareName"
  | "compareXml"
  | "compareError"
  | "sampleId"
  | "lazyDoc"
> {
  const d = snap.doc;
  return {
    xml: d?.xml ?? null,
    fileName: d?.fileName ?? null,
    sourceFiles: d?.sourceFiles ?? null,
    recon: d?.recon ?? null,
    error: d?.error ?? null,
    warnings: d?.warnings ?? [],
    nested: d?.nested ?? null,
    nestedName: d?.nestedName ?? null,
    nestedXml: d?.nestedXml ?? null,
    nestedError: d?.nestedError ?? null,
    compare: d?.compare ?? null,
    compareName: d?.compareName ?? null,
    compareXml: d?.compareXml ?? null,
    compareError: d?.compareError ?? null,
    sampleId: d?.sampleId ?? null,
    // Undoing an open never restores an unparsed snapshot.
    lazyDoc: null,
  };
}

/** Tab metadata shown in the tab bar. */
export interface TabMeta {
  id: string;
  title: string;
}

/** The per-document ("tab") slice. Global prefs - theme, locale, layout/render
 *  options, panel open state - live outside this and are shared across tabs. */
export interface DocState {
  xml: string | null;
  fileName: string | null;
  sourceFiles: { name: string; text: string }[] | null;
  recon: Reconciliation | null;
  error: string | null;
  warnings: string[];
  nested: Reconciliation | null;
  nestedName: string | null;
  nestedXml: string | null;
  nestedError: string | null;
  compare: Reconciliation | null;
  compareName: string | null;
  compareXml: string | null;
  compareError: string | null;
  swapped: Set<string>;
  nestedSwapped: Set<string>;
  collapsed: Set<string>;
  geneColors: Record<number, string>;
  annotations: Record<string, GeneAnnotation>;
  labelOverrides: Record<string, string>;
  annotating: { id: string; name: string } | null;
  /** Raw snapshot of a document that has not been parsed yet: set for
   *  tabs restored from a session / crash snapshot, cleared when the tab is
   *  first opened. Null for every normally opened document. */
  lazyDoc: SavedTab | null;
  sampleId: string | null;
  searchQuery: string;
  searchRegex: boolean;
  eventFilter: EventFilter;
  familyFilter: Set<number> | null;
  confidenceMin: number;
  confidenceMax: number;
  locate: { geneId: string; nonce: number; pane?: PaneId } | null;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

let tabSeq = 1;
const genTabId = (): string => `tab-${++tabSeq}`;

/** Read the persisted "default view" (layout/render options) from prefs so
 *  it can be applied to every newly opened document. Returns merged options
 *  that are complete, not partial — callers can spread them directly. */
function defaultViewOptions(): { layoutOptions: LayoutOptions; renderOptions: RenderOptions } {
  const dv = loadPrefs().defaultView;
  return {
    layoutOptions: { ...defaultLayoutOptions, ...dv?.layoutOptions },
    renderOptions: { ...defaultRenderOptions, ...dv?.renderOptions },
  };
}

/** A fresh, empty document. */
function blankDoc(): DocState {
  return {
    xml: null, fileName: null, sourceFiles: null, recon: null, error: null, warnings: [],
    nested: null, nestedName: null, nestedXml: null, nestedError: null,
    compare: null, compareName: null, compareXml: null, compareError: null,
    swapped: new Set<string>(), nestedSwapped: new Set<string>(),
    collapsed: new Set<string>(), geneColors: {}, annotations: {},
    labelOverrides: {}, annotating: null, lazyDoc: null, sampleId: null, searchQuery: "", searchRegex: false,
    eventFilter: { ...ALL_EVENTS }, familyFilter: null, confidenceMin: 0, confidenceMax: 1, locate: null,
    past: [], future: [],
  };
}

/** Read the active document's per-doc slice out of the flat state. */
function extractDoc(s: AppState): DocState {
  return {
    xml: s.xml, fileName: s.fileName, sourceFiles: s.sourceFiles, recon: s.recon, error: s.error, warnings: s.warnings,
    nested: s.nested, nestedName: s.nestedName, nestedXml: s.nestedXml, nestedError: s.nestedError,
    compare: s.compare, compareName: s.compareName, compareXml: s.compareXml, compareError: s.compareError,
    swapped: s.swapped, nestedSwapped: s.nestedSwapped, collapsed: s.collapsed,
    geneColors: s.geneColors, annotations: s.annotations, labelOverrides: s.labelOverrides, annotating: s.annotating,
    lazyDoc: s.lazyDoc,
    sampleId: s.sampleId, searchQuery: s.searchQuery, searchRegex: s.searchRegex,
    eventFilter: s.eventFilter, familyFilter: s.familyFilter,
    confidenceMin: s.confidenceMin, confidenceMax: s.confidenceMax, locate: s.locate,
    past: s.past, future: s.future,
  };
}

/** True when a document holds user work that has not been exported/saved to a
 *  session file: annotations, swaps, collapses, color edits, or overlay levels. */
export function isDocDirty(d: Pick<DocState, "annotations" | "swapped" | "collapsed" | "geneColors" | "nested" | "compare" | "labelOverrides">): boolean {
  return (
    Object.keys(d.annotations).length > 0 ||
    d.swapped.size > 0 ||
    d.collapsed.size > 0 ||
    Object.keys(d.geneColors).length > 0 ||
    Object.keys(d.labelOverrides ?? {}).length > 0 ||
    d.nested !== null ||
    d.compare !== null
  );
}

export const useStore = create<AppState>((set, get) => ({
  xml: null,
  fileName: null,
  sourceFiles: null,
  recon: null,
  error: null,
  warnings: [],
  nested: null,
  nestedName: null,
  nestedXml: null,
  nestedError: null,
  compare: null,
  compareName: null,
  compareXml: null,
  compareError: null,
  layoutOptions: { ...defaultLayoutOptions },
  renderOptions: { ...defaultRenderOptions },
  themeId: "system",
  resolvedThemeId:
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light",
  locale:
    typeof navigator !== "undefined" &&
    (navigator.language?.startsWith("en") ?? false)
      ? "en"
      : "zh",
  swapped: new Set<string>(),
  nestedSwapped: new Set<string>(),
  collapsed: new Set<string>(),
  geneColors: {},
  annotations: {},
  labelOverrides: {},
  annotating: null,
  showLegend: true,
  minimap: true,
  pngDpi: 600,
  sampleId: null,
  tabs: [{ id: "tab-1", title: "" }],
  activeTabId: "tab-1",
  docs: {},
  lazyDoc: null,
  sidebarOpen: true,
  loading: false,
  rendering: false,
  helpOpen: false,
  toast: null,
  rightPanelOpen: true,
  rightPanelTab: "search",
  searchQuery: "",
  searchRegex: false,
  onlyMatches: false,
  eventFilter: { ...ALL_EVENTS },
  familyFilter: null,
  confidenceMin: 0,
  confidenceMax: 1,
  locate: null,
  pendingMulti: null,
  pendingMultiTabId: null,
  past: [],
  future: [],

  runHeavy: async (fn) => {
    beginLoading();
    // Yield one frame so the loading overlay paints before the (synchronous)
    // parse + layout of a potentially large file blocks the main thread. The
    // frame wait is raced against a timer because a hidden / occluded window
    // stops painting, and rAF callbacks then never fire.
    await nextFrame();
    try {
      fn();
    } catch (e) {
      // Parse errors are already handled inside loadXml/loadMany; reaching this
      // catch means an unexpected crash inside a heavy task. Route it to the
      // same recoverable error panel instead of an unhandled rejection.
      console.error("PhyloRecViewer heavy task failed:", e);
      set({ error: friendlyParseError(e), warnings: [] });
    } finally {
      endLoading();
    }
  },

  loadXml: (xml, fileName) => {
    resetCommitMerge();
    const s = get();
    const load = loadDoc([{ name: fileName, text: xml }]);
    if (!load.ok) {
      // Failure must NOT clobber the file name / previous good document: the
      // breadcrumb keeps showing the last good file, and the previous document
      // stays available via "back to previous" on the error panel.
      set({ error: load.error, warnings: [] });
      return;
    }
    // Push the current document + editable slice so a wrongly opened file
    // (or any file) can be undone back to the previous document.
    const hist = s.recon || s.error ? commit(s, "open", docSnapshot(s)) : { past: [], future: [] };
    set((st) => ({
      ...load.patch,
      past: hist.past,
      future: [],
      tabs: st.tabs.map((tb) => (tb.id === st.activeTabId ? { ...tb, title: load.title ?? "" } : tb)),
    }));
  },

  loadMany: (files) => {
    resetCommitMerge();
    const s = get();
    const load = loadDoc(files);
    if (!load.ok) {
      set({ error: load.error, warnings: [] });
      return;
    }
    const hist = s.recon || s.error ? commit(s, "open", docSnapshot(s)) : { past: [], future: [] };
    set((st) => ({
      ...load.patch,
      past: hist.past,
      future: [],
      tabs: st.tabs.map((tb) => (tb.id === st.activeTabId ? { ...tb, title: load.title ?? "" } : tb)),
    }));
  },

  loadNestedXml: (xml, fileName) => {
    // A nested/compare load is its own history step: it must not be merged into
    // an open slider-drag window (the ≤600ms merge would otherwise swallow the
    // pre-drag snapshot) and it must be undoable like every other edit.
    resetCommitMerge();
    try {
      const nested = parseReconciliation(xml, fileName);
      // Nested and compare are mutually exclusive: loading one clears the
      // other so stale data doesn't linger. Inform the user via a toast.
      const hadCompare = get().compare !== null;
      set((st) => ({
        nested,
        nestedName: fileName,
        nestedXml: xml,
        nestedError: null,
        compare: null,
        compareName: null,
        compareXml: null,
        compareError: null,
        ...commit(st, "edit", docSnapshot(st)),
      }));
      if (hadCompare) {
        const locale = get().locale;
        get().showToast(locale === "zh" ? "已切换到嵌套视图，对比层已移除" : "Switched to nested view; compare layer removed", "info");
      }
    } catch (e) {
      set((st) => ({
        nested: null,
        nestedName: fileName,
        nestedXml: null,
        nestedError: friendlyParseError(e),
        ...commit(st, "edit", docSnapshot(st)),
      }));
    }
  },

  clearNested: () => {
    // Removing a whole layer is destructive and must be undoable: loading one
    // is, so clearing it follows the same contract. Without a commit here, ⌘Z
    // after File → Remove nested layer would undo an unrelated edit while the
    // layer's document and its raw text were already gone.
    resetCommitMerge();
    set((st) => ({
      nested: null,
      nestedName: null,
      nestedXml: null,
      nestedError: null,
      ...commit(st, "edit", docSnapshot(st)),
    }));
  },

  loadCompareXml: (xml, fileName) => {
    // Same contract as loadNestedXml: fresh history step, undoable.
    resetCommitMerge();
    try {
      const compare = parseReconciliation(xml, fileName);
      // Nested and compare are mutually exclusive: loading one clears the
      // other so stale data doesn't linger. Inform the user via a toast.
      const hadNested = get().nested !== null;
      set((st) => ({
        compare,
        compareName: fileName,
        compareXml: xml,
        compareError: null,
        nested: null,
        nestedName: null,
        nestedXml: null,
        nestedError: null,
        ...commit(st, "edit", docSnapshot(st)),
      }));
      if (hadNested) {
        const locale = get().locale;
        get().showToast(locale === "zh" ? "已切换到对比视图，嵌套层已移除" : "Switched to compare view; nested layer removed", "info");
      }
    } catch (e) {
      set((st) => ({
        compare: null,
        compareName: fileName,
        compareXml: null,
        compareError: friendlyParseError(e),
        ...commit(st, "edit", docSnapshot(st)),
      }));
    }
  },

  clearCompare: () => {
    // Undoable for the same reason as clearNested.
    resetCommitMerge();
    set((s) => ({
      compare: null,
      compareName: null,
      compareXml: null,
      compareError: null,
      // If the right panel was showing the diff tab, fall back to search so
      // the user doesn't see a blank panel with no compare document loaded.
      rightPanelTab: s.rightPanelTab === "diff" ? "search" : s.rightPanelTab,
      ...commit(s, "edit", docSnapshot(s)),
    }));
  },

  newTab: () =>
    set((s) => {
      const id = genTabId();
      resetCommitMerge();
      return {
        ...blankDoc(),
        docs: { ...s.docs, [s.activeTabId]: extractDoc(s) },
        tabs: [...s.tabs, { id, title: "" }],
        activeTabId: id,
      };
    }),

  switchTab: (id) => {
    const s = get();
    if (id === s.activeTabId) return;
    resetCommitMerge();
    const docs = { ...s.docs, [s.activeTabId]: extractDoc(s) };
    const raw = docs[id] ?? blankDoc();
    // Parse on first activation: a restored workspace keeps its
    // inactive tabs as raw XML so the startup path never parses them all.
    const target = materializeDoc(raw);
    delete docs[id];
    set({ ...target, docs, activeTabId: id });
    reportLazyFailure(raw, target);
  },

  closeTab: (id) => {
    const s = get();
    resetCommitMerge();
    // Closing the only tab resets it to blank rather than removing it.
    if (s.tabs.length <= 1) {
      set({ ...blankDoc(), tabs: [{ id: s.activeTabId, title: "" }], docs: {} });
      return;
    }
    const idx = s.tabs.findIndex((tb) => tb.id === id);
    const tabs = s.tabs.filter((tb) => tb.id !== id);
    const docs = { ...s.docs };
    delete docs[id];
    if (id !== s.activeTabId) {
      set({ tabs, docs });
      return;
    }
    // Closing the active tab: activate its neighbour and restore its doc.
    const nextTab = tabs[Math.min(idx, tabs.length - 1)];
    const raw = docs[nextTab.id] ?? blankDoc();
    const target = materializeDoc(raw);
    delete docs[nextTab.id];
    set({ ...target, tabs, activeTabId: nextTab.id, docs });
    reportLazyFailure(raw, target);
  },

  openInNewTab: (files) => {
    if (files.length === 0) return;
    // Reuse the current tab when it is blank or only showing a bundled sample;
    // otherwise open a fresh tab so existing work is kept.
    const tabId = claimTabForLoad(get());
    // Multiple files: ask the user whether to merge into one reconciliation or
    // open one tab per file; merging without asking would take that choice away.
    if (files.length > 1) {
      set({ pendingMulti: files, pendingMultiTabId: tabId });
      return;
    }
    writeFilesToTab(tabId, files);
  },

  confirmMerge: () => {
    const files = get().pendingMulti;
    const tabId = get().pendingMultiTabId;
    if (!files || files.length === 0) {
      set({ pendingMulti: null, pendingMultiTabId: null });
      return;
    }
    set({ pendingMulti: null, pendingMultiTabId: null });
    focusTab(tabId);
    get().loadMany(files);
    // Say out loud what happened to the files: a merge is never silent. The two
    // locale templates live here because the store layer does not import the
    // i18n dictionaries; the {n} placeholder is replaced with the file count,
    // matching the `mergedToast` entry in i18n.ts.
    const locale = get().locale;
    const tmpl = locale === "zh" ? "已将 {n} 个文件合并为 1 个调和文档" : "Merged {n} files into one reconciliation";
    const msg = tmpl.replace("{n}", String(files.length));
    get().showToast(msg, "info");
  },

  confirmTabs: () => {
    const files = get().pendingMulti;
    const tabId = get().pendingMultiTabId;
    if (!files || files.length === 0) {
      set({ pendingMulti: null, pendingMultiTabId: null });
      return;
    }
    set({ pendingMulti: null, pendingMultiTabId: null });
    // Creating one tab per file is relative to the front tab, so bring the tab
    // the drop was aimed at back to the front first.
    focusTab(tabId);
    // Open each file in its own tab (first one reuses a disposable tab).
    files.forEach((f, i) => {
      if (i > 0) get().newTab();
      get().loadXml(f.text, f.name);
    });
  },

  cancelPendingMulti: () => set({ pendingMulti: null, pendingMultiTabId: null }),

  clearError: () => set({ error: null }),

  openFiles: async (files) => {
    if (files.length === 0) return;
    // Decide WHERE the document goes before reading anything: `f.text()` is
    // async, and the tab that is frontmost when the read finishes may be one
    // the user created meanwhile.
    const multi = files.length > 1;
    const tabId = claimTabForLoad(get());
    inflightTabs.add(tabId);
    beginLoading();
    // Yield one frame so the overlay paints before the (synchronous) parse +
    // layout blocks the main thread; the frame is raced against a timer because
    // a hidden / occluded window stops painting.
    await nextFrame();
    try {
      const parsed = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      if (multi) {
        // Merge-vs-tabs needs an answer, so show the dialog on the tab the drop
        // was aimed at rather than on whatever is frontmost by then.
        focusTab(tabId);
        set({ pendingMulti: parsed, pendingMultiTabId: tabId });
      } else {
        writeFilesToTab(tabId, parsed);
      }
    } catch (e) {
      // Reading a dropped directory / unreadable file rejects here; surface it
      // without clobbering the current document (consistent with loadXml's
      // failure path: only set error, don't touch recon / fileName / xml).
      reportLoadFailure(tabId, friendlyParseError(e));
    } finally {
      inflightTabs.delete(tabId);
      endLoading();
    }
  },

  setHelpOpen: (on) => set({ helpOpen: on }),

  setSidebarOpen: (on) => set({ sidebarOpen: on }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleSwap: (species) =>
    set((s) => ({
      swapped: toggleSwapKeys(s.swapped, s.recon, species),
      ...commit(s),
    })),

  toggleNestedSwap: (species) =>
    set((s) => ({
      nestedSwapped: toggleSwapKeys(s.nestedSwapped, s.nested, species),
      ...commit(s),
    })),

  optimizeSwaps: () =>
    set((s) => ({
      swapped: s.recon ? optimizeCrossings(s.recon) : s.swapped,
      nestedSwapped: s.nested ? optimizeCrossings(s.nested) : s.nestedSwapped,
      ...commit(s),
    })),

  clearSwaps: () =>
    set((s) => ({
      swapped: new Set<string>(),
      nestedSwapped: new Set<string>(),
      ...commit(s),
    })),

  toggleCollapse: (geneId) =>
    set((s) => {
      const next = new Set(s.collapsed);
      if (next.has(geneId)) next.delete(geneId);
      else next.add(geneId);
      return { collapsed: next, ...commit(s) };
    }),

  setGeneColor: (treeIndex, color) =>
    set((s) => ({ geneColors: { ...s.geneColors, [treeIndex]: color }, ...commit(s) })),

  setAnnotating: (sel) => set({ annotating: sel }),
  setAnnotation: (id, text, color) =>
    set((s) => ({
      annotations: { ...s.annotations, [id]: { text, color } },
      annotating: null,
      ...commit(s),
    })),
  removeAnnotation: (id) =>
    set((s) => {
      const next = { ...s.annotations };
      delete next[id];
      return { annotations: next, annotating: null, ...commit(s) };
    }),

  setLabelOverride: (key, value) =>
    set((s) => {
      const had = Object.prototype.hasOwnProperty.call(s.labelOverrides, key);
      const wanted = !!value && value !== key;
      // Merely clicking a label and tabbing away submits the same text; that
      // would push an undo entry every time, so ⌘Z would appear to do nothing.
      // Only commit when the override set actually changes.
      if (wanted === had && (!had || s.labelOverrides[key] === value)) return {};
      const next = { ...s.labelOverrides };
      if (wanted) next[key] = value;
      else delete next[key];
      return { labelOverrides: next, ...commit(s) };
    }),
  batchReplaceLabels: (find, replace, useRegex, scope) =>
    set((s) => {
      const recon = s.recon;
      if (!recon || !find) return {};
      let regex: RegExp | null = null;
      if (useRegex) {
        try { regex = new RegExp(find, "g"); }
        catch { return {}; }
      }
      const next = { ...s.labelOverrides };
      const labels = new Set<string>();
      if (scope === "species" || scope === "all") {
        for (const n of recon.species.nodes) {
          if (n.children.length === 0) labels.add(n.name);
        }
      }
      if (scope === "gene" || scope === "all") {
        for (const tree of recon.geneTrees) {
          for (const g of tree.nodes) {
            const isLeaf = g.endEvent.type === "leaf";
            const label = isLeaf ? (g.endEvent.geneName || g.name) : g.name;
            if (label) labels.add(label);
          }
        }
      }
      for (const original of labels) {
        const current = next[original] ?? original;
        const updated = regex
          ? current.replace(regex, replace)
          : current.split(find).join(replace);
        if (updated !== original) next[original] = updated;
        else delete next[original];
      }
      return { labelOverrides: next, ...commit(s) };
    }),
  clearLabelOverrides: () =>
    set((s) => ({ labelOverrides: {}, ...commit(s) })),

  setShowLegend: (on) => {
    set({ showLegend: on });
    const prefs = loadPrefs();
    savePrefs({ ...prefs, showLegend: on });
  },
  setMinimap: (on) => {
    set({ minimap: on });
    const prefs = loadPrefs();
    savePrefs({ ...prefs, minimap: on });
  },
  setPngDpi: (n) => {
    const dpi = Math.max(600, n);
    set({ pngDpi: dpi });
    const prefs = loadPrefs();
    savePrefs({ ...prefs, pngDpi: dpi });
  },
  setSampleId: (id) => set({ sampleId: id }),

  showToast: (msg, kind = "success") => {
    const id = ++toastSeq;
    set({ toast: { id, msg, kind } });
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    // Auto-dismiss after 4 seconds. The timer compares the toast ID, not its
    // text: an identical message shown twice is two different toasts, and the
    // older timer would otherwise clear the newer one early.
    toastTimer = window.setTimeout(() => {
      toastTimer = null;
      const cur = useStore.getState().toast;
      if (cur && cur.id === id) useStore.setState({ toast: null });
    }, TOAST_MS);
  },
  clearToast: () => {
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },

  openPanel: (tab) => set({ rightPanelOpen: true, rightPanelTab: tab }),
  closePanel: () => set({ rightPanelOpen: false }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchRegex: (on) => set({ searchRegex: on }),
  setOnlyMatches: (on) => set({ onlyMatches: on }),
  setConfidenceRange: (min, max) => set({ confidenceMin: min, confidenceMax: max }),
  toggleEventFilter: (k) =>
    set((s) => ({ eventFilter: { ...s.eventFilter, [k]: !s.eventFilter[k] } })),
  resetEventFilter: () => set({ eventFilter: { ...ALL_EVENTS } }),
  toggleFamilyFilter: (index) =>
    set((s) => {
      // null (all) -> start an explicit set that excludes the toggled family.
      const all = s.recon ? s.recon.geneTrees.map((t) => t.index) : [];
      const next = new Set(s.familyFilter ?? all);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Back to "all selected" collapses to null (no filter).
      return { familyFilter: next.size === all.length ? null : next };
    }),
  clearFamilyFilter: () => set({ familyFilter: null }),
  clearSearchFilter: () =>
    set({
      searchQuery: "",
      searchRegex: false,
      eventFilter: { ...ALL_EVENTS },
      familyFilter: null,
      confidenceMin: 0,
      confidenceMax: 1,
    }),
  locateGene: (geneId, pane) =>
    set((s) => ({ locate: { geneId, nonce: (s.locate?.nonce ?? 0) + 1, pane } })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      resetCommitMerge();
      const prev = s.past[s.past.length - 1];
      const next: Pick<AppState, "past" | "future"> = {
        past: s.past.slice(0, -1),
        // Carry the current document so a subsequent redo can restore it:
        // `snapshot` alone omits `doc`, which would lose the opened file on
        // open → undo → redo.
        future: [...s.future, { ...snapshot(s), doc: docSnapshot(s) }].slice(-HISTORY_LIMIT),
      };
      if (prev.doc) {
        // Full document restore (undo an open/load), updating the tab title.
        return {
          ...next,
          ...docFieldsFrom(prev),
          ...editFieldsFrom(prev),
          annotating: null,
          tabs: s.tabs.map((tb) =>
            tb.id === s.activeTabId ? { ...tb, title: prev.doc?.fileName ?? tb.title } : tb,
          ),
        };
      }
      return { ...next, ...editFieldsFrom(prev) };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      resetCommitMerge();
      const nextSnap = s.future[s.future.length - 1];
      const next: Pick<AppState, "past" | "future"> = {
        future: s.future.slice(0, -1),
        past: [...s.past, { ...snapshot(s), doc: docSnapshot(s) }].slice(-HISTORY_LIMIT),
      };
      if (nextSnap.doc) {
        return {
          ...next,
          ...docFieldsFrom(nextSnap),
          ...editFieldsFrom(nextSnap),
          annotating: null,
          tabs: s.tabs.map((tb) =>
            tb.id === s.activeTabId ? { ...tb, title: nextSnap.doc?.fileName ?? tb.title } : tb,
          ),
        };
      }
      return { ...next, ...editFieldsFrom(nextSnap) };
    }),

  applyViewState: (v) =>
    set((s) => {
      resetCommitMerge();
      const resetHistory = v.resetHistory ?? true;
      return {
      ...(resetHistory ? { past: [], future: [] } : {}),
      layoutOptions: v.layoutOptions
        ? { ...s.layoutOptions, ...v.layoutOptions }
        : s.layoutOptions,
      renderOptions: v.renderOptions
        ? { ...s.renderOptions, ...v.renderOptions }
        : s.renderOptions,
      themeId: v.themeId ?? s.themeId,
      resolvedThemeId:
        v.themeId === "system"
          ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
            ? "dark"
            : "light"
          : (v.themeId as "light" | "dark") ?? s.resolvedThemeId,
      swapped: v.swapped ? new Set(v.swapped) : s.swapped,
      nestedSwapped: v.nestedSwapped ? new Set(v.nestedSwapped) : s.nestedSwapped,
      collapsed: v.collapsed ? new Set(v.collapsed) : s.collapsed,
      geneColors: v.geneColors ?? s.geneColors,
      annotations: v.annotations ?? s.annotations,
      labelOverrides: v.labelOverrides ?? s.labelOverrides,
      };
    }),

  setLayout: (patch) => {
    set((s) => {
      const next: Partial<Pick<AppState, "layoutOptions" | "past" | "future">> = {
        layoutOptions: { ...s.layoutOptions, ...patch },
      };
      // Merge with undo history (same-kind consecutive slider drags).
      Object.assign(next, commit(s, "layout"));
      return next as Partial<AppState>;
    });
    flashRendering();
  },

  setRender: (patch) => {
    set((s) => {
      const nextRender = { ...s.renderOptions, ...patch };
      // Switching orientation resets the (per-role) tip-label angle to the
      // sensible default for the new orientation (top/bottom = -90, else 0).
      if (patch.orientation && patch.orientation !== s.renderOptions.orientation) {
        const angle = defaultLabelAngle(patch.orientation);
        nextRender.speciesLabelStyle = { ...nextRender.speciesLabelStyle, angle };
        nextRender.geneTipLabelStyle = { ...nextRender.geneTipLabelStyle, angle };
        nextRender.geneInternalLabelStyle = { ...nextRender.geneInternalLabelStyle, angle };
      }
      const next: Partial<Pick<AppState, "renderOptions" | "past" | "future">> = {
        renderOptions: nextRender,
      };
      Object.assign(next, commit(s, "render"));
      return next as Partial<AppState>;
    });
    flashRendering();
  },

  setTheme: (id) => {
    const resolved: "light" | "dark" =
      id === "system"
        ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
          ? "dark"
          : "light"
        : id;
    set({ themeId: id, resolvedThemeId: resolved });
    // Persist the preference so it survives restarts.
    const prefs = loadPrefs();
    savePrefs({ ...prefs, themeId: id });
  },
  syncSystemTheme: () =>
    set((s) => {
      if (s.themeId !== "system") return {};
      const dark =
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      return { resolvedThemeId: dark ? "dark" : "light" };
    }),
  setLocale: (locale) => {
    set({ locale });
    const prefs = loadPrefs();
    savePrefs({ ...prefs, locale });
  },
}));

/* ------------------------------------------------------------------ *
 * Loading overlay: ref-counted                                       *
 * ------------------------------------------------------------------ */

/** Number of in-flight async tasks. A plain boolean that every task cleared in
 *  its `finally` would let the first finished drop hide a second one that is
 *  still reading, so the overlay counts instead of flagging. */
let loadingTasks = 0;

function beginLoading(): void {
  loadingTasks += 1;
  useStore.setState({ loading: true });
}

function endLoading(): void {
  loadingTasks = Math.max(0, loadingTasks - 1);
  if (loadingTasks === 0) useStore.setState({ loading: false });
}

/* ------------------------------------------------------------------ *
 * Async opens: destination tab captured up front             *
 * ------------------------------------------------------------------ */

/** Tabs claimed by an in-flight async open. */
const inflightTabs = new Set<string>();

/** Choose the tab an open is going to write into. Called synchronously, BEFORE
 *  the (async) file read, so the document can never end up in a tab the user
 *  created meanwhile - nor in none at all. */
function claimTabForLoad(s: AppState): string {
  // Reuse the current tab when it is blank or only showing a bundled sample;
  // otherwise open a fresh tab so existing work is kept. A tab another read is
  // already heading for is not up for reuse.
  const disposable = (!s.recon && !s.error) || s.sampleId !== null;
  if (disposable && !inflightTabs.has(s.activeTabId)) return s.activeTabId;
  s.newTab();
  return useStore.getState().activeTabId;
}

/** Bring `tabId` back to the front; no-op when it already is frontmost or gone. */
function focusTab(tabId: string | null): void {
  const s = useStore.getState();
  if (!tabId || tabId === s.activeTabId) return;
  if (s.tabs.some((t) => t.id === tabId)) s.switchTab(tabId);
}

/** Write already-read files into one specific tab, which may well be in the
 *  background: then the tab's stashed document is patched (and gets its own
 *  undo entry) instead of disturbing whatever is frontmost. */
function writeFilesToTab(tabId: string, files: { name: string; text: string }[]): void {
  const s = useStore.getState();
  if (!s.tabs.some((t) => t.id === tabId)) {
    // The tab was closed while the file was being read: reopen the document in
    // a fresh tab rather than dropping it on the floor.
    s.openInNewTab(files);
    return;
  }
  if (tabId === s.activeTabId) {
    const first = files[0];
    if (first) s.loadXml(first.text, first.name);
    return;
  }
  const doc = s.docs[tabId] ?? blankDoc();
  const load = loadDoc(files);
  const entry = entryFromSlice(s, doc);
  useStore.setState((st) => ({
    docs: {
      ...st.docs,
      [tabId]: {
        ...doc,
        ...(load.ok ? load.patch : { error: load.error, warnings: [] }),
        past: [...doc.past, entry].slice(-HISTORY_LIMIT),
        future: [],
      },
    },
    tabs: load.ok
      ? st.tabs.map((tb) => (tb.id === tabId ? { ...tb, title: load.title ?? "" } : tb))
      : st.tabs,
  }));
  if (!load.ok) reportLoadFailure(tabId, load.error);
}

/** Surface a failed read for one tab: the recoverable error panel when that tab
 *  is the one being looked at; otherwise the error is recorded on the tab's own
 *  document (so the panel appears when the user opens it) and a toast names the
 *  tab, because a background failure must not hijack the front document. */
function reportLoadFailure(tabId: string, message: string): void {
  const s = useStore.getState();
  if (tabId === s.activeTabId) {
    useStore.setState({ error: message, warnings: [] });
    return;
  }
  const meta = s.tabs.find((t) => t.id === tabId);
  const doc = s.docs[tabId];
  if (doc) {
    useStore.setState((st) => ({
      docs: { ...st.docs, [tabId]: { ...doc, error: message, warnings: [] } },
    }));
  }
  s.showToast(
    s.locale === "zh"
      ? `标签「${meta?.title || tabId}」中的文件打开失败`
      : `Failed to open a file in tab "${meta?.title || tabId}"`,
    "error",
  );
}

/* ------------------------------------------------------------------ *
 * Lazily restored tabs                                       *
 * ------------------------------------------------------------------ */

/** Parse a stashed tab that a session / crash restore deliberately left
 *  unparsed, so the whole workspace is not parsed before first paint. Runs once
 *  per restored tab, on first activation; ordinary documents pass through. */
function materializeDoc(doc: DocState): DocState {
  const saved = doc.lazyDoc;
  if (!saved) return doc;
  const next: DocState = { ...doc, lazyDoc: null };
  try {
    const files = saved.sourceFiles ?? [];
    next.recon = files.length > 1
      ? parseMerged(files)
      : parseReconciliation(saved.xml, saved.title ?? "tab");
    next.warnings = next.recon.warnings;
    next.error = null;
  } catch (e) {
    // Keep the document (its XML stays in the workspace and keeps being
    // autosaved) and report why it cannot be drawn.
    next.recon = null;
    next.warnings = [];
    next.error = friendlyParseError(e);
  }
  if (saved.nestedXml) {
    try {
      next.nested = parseReconciliation(saved.nestedXml, saved.nestedName ?? "nested");
    } catch (e) {
      next.nestedError = friendlyParseError(e);
    }
  }
  if (saved.compareXml) {
    try {
      next.compare = parseReconciliation(saved.compareXml, saved.compareName ?? "compare");
    } catch (e) {
      next.compareError = friendlyParseError(e);
    }
  }
  return next;
}

/** Tell the user - by name - when a lazily restored tab turns out not to parse.
 *  The tab and its raw document stay in the workspace; only its drawing is
 *  missing. */
function reportLazyFailure(raw: DocState, doc: DocState): void {
  if (!raw.lazyDoc || !doc.error) return;
  const s = useStore.getState();
  const tabTitle = s.tabs.find((t) => t.id === s.activeTabId)?.title;
  const title = tabTitle || raw.lazyDoc.title || raw.fileName || "untitled";
  const zh = s.locale === "zh";
  s.showToast(
    zh
      ? `无法打开标签「${title}」：文档已损坏或来自其它版本`
      : `Could not open tab "${title}": the document is corrupt or from another version`,
    "error",
  );
}

/* ------------------------------------------------------------------ *
 * Mirrored clades keyed by species identity                  *
 * ------------------------------------------------------------------ */

/**
 * Keys that identify one species clade in the mirror set.
 *
 * A species *name* is not unique: recPhyloXML / NHX documents routinely carry
 * the same - or an empty - name on several clades, so a set keyed by name alone
 * mirrors every clade that shares it on a single click. The per-node identity
 * (the content-derived species node id) is therefore stored whenever it can be
 * resolved.
 *
 * The matching name is kept alongside it on purpose: the layout engine looks
 * mirrored clades up by name (layout/species.ts, layout/optimize.ts), so a set
 * holding only the id would leave that clade unmirrored in the drawing.
 */
function swapKeysFor(recon: Reconciliation | null, species: string): string[] {
  if (!recon) return [species];
  const nodes = recon.species.nodes;
  const byId = nodes.filter((n) => n.id === species);
  if (byId.length > 0) return [species, ...byId.map((n) => n.name)];
  const byName = nodes.filter((n) => n.name === species);
  if (byName.length === 0) return [species];
  return [species, ...byName.map((n) => n.id)];
}

function toggleSwapKeys(
  current: Set<string>,
  recon: Reconciliation | null,
  species: string,
): Set<string> {
  const next = new Set(current);
  const keys = swapKeysFor(recon, species);
  if (!next.has(species)) {
    for (const key of keys) next.add(key);
    return next;
  }
  for (const key of keys) next.delete(key);
  // A name another mirrored clade depends on must survive this un-mirror.
  const nameById = new Map(
    (recon?.species.nodes ?? []).map((n): [string, string] => [n.id, n.name]),
  );
  for (const key of [...next]) {
    const name = nameById.get(key);
    if (name) next.add(name);
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Toast                                                              *
 * ------------------------------------------------------------------ */

let toastSeq = 0;
let toastTimer: number | null = null;

/** Briefly flash the "Rendering…" indicator after a layout/style change so a
 *  slow rearrange is visibly "busy" rather than looking frozen. */
let renderingTimer: number | null = null;
function flashRendering(): void {
  if (useStore.getState().rendering) return;
  useStore.setState({ rendering: true });
  if (renderingTimer !== null) window.clearTimeout(renderingTimer);
  renderingTimer = window.setTimeout(() => {
    useStore.setState({ rendering: false });
    renderingTimer = null;
  }, 350);
}

/**
 * Turn a parser throw into a human-readable message, matching the app's actual
 * capability (recPhyloXML / NHX / Newick). The raw technical error is kept as
 * context but the headline is actionable.
 */
export function friendlyParseError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/empty|no files/i.test(raw)) {
    return "The file is empty. Choose a recPhyloXML, NHX or Newick file with tree data.";
  }
  if (/newer version/i.test(raw)) {
    return raw;
  }
  if (/not valid json/i.test(raw)) {
    return raw;
  }
  // Keep the technical detail (line numbers etc. when the parser provides
  // them) but preface it with the supported formats, so a hint from one parser
  // never contradicts what the app can actually open.
  return `${raw}\n\nSupported: recPhyloXML (.recphyloxml / .xml), NHX (.nhx), Newick (.nwk / .newick).`;
}

// Compile-time guard: every per-document (DocState) field must also exist on
// AppState with a compatible type, so the tab stash/restore (extractDoc /
// blankDoc / switchTab) can never reference a field the flat state lacks.
// Adding a field to DocState without adding it to AppState fails to compile.
type _AppCoversDocState = Pick<AppState, keyof DocState> extends DocState ? true : never;
const _appCoversDocState: _AppCoversDocState = true;
void _appCoversDocState;
