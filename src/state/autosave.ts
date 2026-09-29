/**
 * Crash / accidental-close resilience: periodically persist the whole workspace
 * (every open tab's document + view state) to localStorage and restore it on
 * the next launch. Without this, an unexpected quit loses every unsaved swap /
 * collapse / annotation / color because the store itself is not persisted.
 *
 * Bounded on purpose: writes are debounced, skipped entirely when the document
 * signature is unchanged (transient state like toasts/zoom does not postpone
 * the persist), and wrapped in try/catch.
 *
 * Two rules exist because losing a snapshot is unrecoverable while keeping one
 * too long is merely wasteful:
 *  - a snapshot the app could NOT load is copied to `UNRECOVERED_KEY` and pinned,
 *    so no later trivial edit can delete or shorten it;
 *  - the signature cache only advances after a write actually landed, so a quota
 *    error is retried instead of silently disabling autosave.
 *
 * Inactive tabs are restored as raw XML and parsed on first activation,
 * so restoring a 10-tab workspace costs one parse, not ten (or thirty, with the
 * nested/compare layers).
 */
import { useStore, friendlyParseError, type DocState } from "./store";
import { ALL_EVENTS } from "../analysis/focus";
import {
  serializeSession,
  parseSession,
  tabsActiveTabIndex,
  CURRENT_SESSION_VERSION,
  type SavedTabsSnapshot,
  type SessionData,
  type SavedTab,
} from "../session";

const KEY = "rpv.autosave.v1";
/** Copy of a snapshot the app failed to restore. */
const UNRECOVERED_KEY = "rpv.autosave.v1.unrecovered";
const DEBOUNCE_MS = 1000;

/** Counter for synthetic ids assigned to restored (inactive) tabs. Declared
 *  before restoreTabs so the reference is not a TDZ hazard. */
let docsSeq = 1;

/** Per-tab view state shared by the active-tab fields and SavedTab snapshots. */
interface TabViewSlice {
  swapped: string[];
  nestedSwapped: string[];
  collapsed: string[];
  geneColors: Record<number, string>;
  annotations: Record<string, { text: string; color: string }>;
  labelOverrides: Record<string, string>;
}

function viewSliceOf(d: {
  swapped: Set<string>;
  nestedSwapped: Set<string>;
  collapsed: Set<string>;
  geneColors: Record<number, string>;
  annotations: Record<string, { text: string; color: string }>;
  labelOverrides: Record<string, string>;
}): TabViewSlice {
  return {
    swapped: [...d.swapped],
    nestedSwapped: [...d.nestedSwapped],
    collapsed: [...d.collapsed],
    geneColors: d.geneColors,
    annotations: d.annotations,
    labelOverrides: d.labelOverrides,
  };
}

function tabViewOfDoc(d: DocState): TabViewSlice {
  return viewSliceOf(d);
}

/** Snapshot one (inactive) tab document from the store's `docs` stash. */
function savedTabOfDoc(title: string | null, d: DocState): SavedTab | null {
  if (!d.xml) return null;
  return {
    title,
    xml: d.xml,
    sourceFiles: d.sourceFiles ?? undefined,
    nestedName: d.nestedName,
    nestedXml: d.nestedXml,
    compareName: d.compareName,
    compareXml: d.compareXml,
    ...tabViewOfDoc(d),
    searchQuery: d.searchQuery,
    searchRegex: d.searchRegex,
    eventFilter: d.eventFilter,
    familyFilter: d.familyFilter ? [...d.familyFilter] : null,
    confidenceMin: d.confidenceMin,
    confidenceMax: d.confidenceMax,
  };
}

/** Snapshot every INACTIVE tab of the current workspace (active tab excluded:
 *  its fields live at the top level of the session document). The returned array
 *  also carries where the front tab sat, so a caller that builds a `SessionData`
 *  by hand round-trips the tab order too. */
export function savedTabsOfStore(): SavedTabsSnapshot {
  const st = useStore.getState();
  const out: SavedTab[] = [];
  for (const t of st.tabs) {
    if (t.id === st.activeTabId) continue;
    const d = st.docs[t.id];
    if (!d) continue;
    const saved = savedTabOfDoc(t.title, d);
    if (saved) out.push(saved);
  }
  const snapshot = out as SavedTabsSnapshot;
  // Non-enumerable: array props are invisible to JSON, and `toEqual` on the
  // result stays a plain comparison of the tab data.
  Object.defineProperty(snapshot, "activeTabIndex", {
    value: activeIndexOf(st),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return snapshot;
}

/**
 * The canonical session document for the live workspace: the active tab in
 * the top-level fields, every background tab in `tabs`, plus the merged source
 * files, the search/filter criteria and where the active tab sat.
 *
 * "Save session" and crash recovery MUST serialize through this one builder. A
 * second field list elsewhere would drift from the session schema and drop every
 * background tab and every family of a merged document, while that panel's own
 * button promises the user that nothing is lost.
 */
export function sessionDataOfStore(): SessionData | null {
  const st = useStore.getState();
  if (!st.xml) return null;
  const savedTabs = savedTabsOfStore();
  return {
    version: CURRENT_SESSION_VERSION,
    fileName: st.fileName,
    xml: st.xml,
    // A merged document stores only the FIRST file's text in `xml`; without
    // sourceFiles the other families would be lost on re-open.
    sourceFiles: st.sourceFiles ?? undefined,
    nestedName: st.nestedName,
    nestedXml: st.nestedXml,
    compareName: st.compareName,
    compareXml: st.compareXml,
    layoutOptions: st.layoutOptions,
    renderOptions: st.renderOptions,
    themeId: st.themeId,
    swapped: [...st.swapped],
    nestedSwapped: [...st.nestedSwapped],
    collapsed: [...st.collapsed],
    geneColors: st.geneColors,
    annotations: st.annotations,
    labelOverrides: st.labelOverrides,
    tabs: savedTabs.length > 0 ? savedTabs : undefined,
    activeTabIndex: tabsActiveTabIndex(savedTabs),
    searchQuery: st.searchQuery,
    searchRegex: st.searchRegex,
    eventFilter: st.eventFilter,
    familyFilter: st.familyFilter ? [...st.familyFilter] : null,
    confidenceMin: st.confidenceMin,
    confidenceMax: st.confidenceMax,
  };
}

/** Index of the active tab within the workspace's tab bar, i.e. how many tabs
 *  sat in front of it when the snapshot was taken. */
function activeIndexOf(st: ReturnType<typeof useStore.getState>): number {
  const idx = st.tabs.findIndex((t) => t.id === st.activeTabId);
  return idx < 0 ? 0 : idx;
}

/** Options for `restoreTabs`. */
export interface RestoreTabsOptions {
  /** Where the saved workspace's front tab sat in its tab bar: the document
   *  already loaded into the active tab is re-inserted at this slot so the same
   *  tabs end up in front after a restore. Defaults to the hint carried
   *  by the tab array itself, which `parseSession` / `savedTabsOfStore` attach. */
  activeTabIndex?: number;
  /** Drop the tabs an EARLIER restore put in place instead of piling on top of
   *  them. Defaults to true, so loading a second session file replaces the
   *  session workspace rather than interleaving unrelated tabs into it.
   *  Documents the user opened by hand are never dropped by this. */
  replace?: boolean;
}

/** Tabs that an earlier `restoreTabs` call put into the workspace. Only these
 *  are replaced by a later restore: the safety rule is that a restore may swap
 *  out what an earlier restore did, but never work the user opened themselves. */
let restoredTabIds = new Set<string>();

/** A restored tab that carries its XML but no parsed document yet.
 *  Everything the tab bar, the dirty marker and the next autosave need is here;
 *  `store.materializeDoc` builds `recon` when the user first opens the tab. */
function lazyDocFrom(tab: SavedTab): DocState {
  return {
    xml: tab.xml,
    fileName: tab.title ?? "tab",
    sourceFiles: tab.sourceFiles ?? null,
    recon: null,
    error: null,
    warnings: [],
    nested: null,
    nestedName: tab.nestedName ?? null,
    nestedXml: tab.nestedXml ?? null,
    nestedError: null,
    compare: null,
    compareName: tab.compareName ?? null,
    compareXml: tab.compareXml ?? null,
    compareError: null,
    swapped: new Set(tab.swapped ?? []),
    nestedSwapped: new Set(tab.nestedSwapped ?? []),
    collapsed: new Set(tab.collapsed ?? []),
    geneColors: tab.geneColors ?? {},
    annotations: tab.annotations ?? {},
    labelOverrides: tab.labelOverrides ?? {},
    annotating: null,
    lazyDoc: tab,
    sampleId: null,
    searchQuery: tab.searchQuery ?? "",
    searchRegex: tab.searchRegex ?? false,
    eventFilter: tab.eventFilter ?? { ...ALL_EVENTS },
    familyFilter: tab.familyFilter ? new Set(tab.familyFilter) : null,
    confidenceMin: tab.confidenceMin ?? 0,
    confidenceMax: tab.confidenceMax ?? 1,
    locate: null,
    past: [],
    future: [],
  };
}

/**
 * Stash `SavedTab` snapshots back into the store as inactive documents.
 *
 * No tab is ever dropped for failing to parse, because nothing is parsed here:
 * the documents go in as raw XML and are built on first activation, which both
 * keeps first paint cheap and means a snapshot can never be silently
 * shortened by one bad file. Returns the ids of the restored tabs.
 */
export function restoreTabs(
  tabs: SavedTab[] | undefined,
  opts: RestoreTabsOptions = {},
): string[] {
  if (!tabs || tabs.length === 0) return [];
  const replace = opts.replace !== false;
  const entries = tabs
    .filter((t): t is SavedTab => !!t && !!t.xml)
    .map((tab) => {
      const id = `autosave-${docsSeq++}`;
      return { id, title: tab.title ?? "tab", doc: lazyDocFrom(tab) };
    });
  if (entries.length === 0) return [];
  const wanted = opts.activeTabIndex ?? tabsActiveTabIndex(tabs);

  useStore.setState((s) => {
    const activeMeta =
      s.tabs.find((t) => t.id === s.activeTabId) ?? { id: s.activeTabId, title: "" };
    // Where the saved front tab sat: never outside the restored run.
    const slot = Math.min(Math.max(wanted ?? 0, 0), entries.length);
    // Tabs that survive this restore: everything in append mode, otherwise the
    // documents the user opened by hand - an earlier restore's tabs are swapped
    // out so two session files cannot interleave.
    const carried = s.tabs.filter(
      (t) => t.id !== activeMeta.id && (!replace || !restoredTabIds.has(t.id)),
    );
    const docs: Record<string, DocState> = {};
    for (const t of carried) {
      const d = s.docs[t.id];
      if (d) docs[t.id] = d;
    }
    const metas = entries.map(({ id, title }) => ({ id, title }));
    return {
      docs: { ...docs, ...Object.fromEntries(entries.map((e) => [e.id, e.doc])) },
      tabs: [
        ...carried,
        ...metas.slice(0, slot),
        activeMeta,
        ...metas.slice(slot),
      ],
    };
  });
  // Re-book which tabs came from a restore: ids that have left the tab bar were
  // replaced and are forgotten, so the registry cannot grow unbounded.
  const live = new Set(useStore.getState().tabs.map((t) => t.id));
  restoredTabIds = new Set(
    [...restoredTabIds, ...entries.map((e) => e.id)].filter((id) => live.has(id)),
  );
  return entries.map((e) => e.id);
}

/** FNV-1a content hash, used to fingerprint large strings cheaply. */
function h32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const setSig = (set: { size: number } & Iterable<string>): string =>
  h32([...(set as Set<string>)].slice().sort().join(","));
const mapSig = (m: Record<string, unknown>): string =>
  h32(Object.keys(m).sort().map((k) => k + JSON.stringify(m[k])).join(","));

/** Lightweight but content-sensitive signature of the persisted slice.
 *  Field counts and object identity are NOT enough: editing an existing
 *  annotation's text, or moving a slider, must change the signature so the
 *  snapshot is actually rewritten. */
function workspaceSignature(st: ReturnType<typeof useStore.getState>): string {
  const inactiveTabs = st.tabs
    .filter((t) => t.id !== st.activeTabId)
    .map((t) => {
      const d = st.docs[t.id];
      if (!d?.xml) return `${t.id}:empty`;
      return `${t.id}:${t.title}:${h32(d.xml)}:${setSig(d.collapsed)}:${mapSig(d.annotations)}:${mapSig(d.labelOverrides)}`;
    })
    .join("|");
  return [
    h32(st.xml ?? ""),
    st.fileName,
    st.sourceFiles ? h32(st.sourceFiles.map((f) => f.name + f.text).join("|")) : 0,
    h32(st.nestedXml ?? ""),
    h32(st.compareXml ?? ""),
    JSON.stringify(st.layoutOptions),
    JSON.stringify(st.renderOptions),
    st.themeId,
    setSig(st.swapped),
    setSig(st.nestedSwapped),
    setSig(st.collapsed),
    mapSig(st.geneColors),
    mapSig(st.annotations),
    mapSig(st.labelOverrides),
    st.searchQuery,
    st.searchRegex,
    st.confidenceMin,
    st.confidenceMax,
    st.familyFilter ? [...st.familyFilter].sort().join(",") : -1,
    inactiveTabs,
  ].join("\0");
}

/** True while this launch failed to load the stored snapshot: further writes
 *  may go ahead, but deleting the snapshot is off the table. */
let snapshotPinned = false;
/** The "autosave is unavailable" toast is shown once, not once per keystroke. */
let unavailableNoted = false;

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keep an untouched copy of a snapshot the app cannot load, and pin the slot. */
function quarantine(text: string): void {
  snapshotPinned = true;
  try {
    localStorage.setItem(UNRECOVERED_KEY, text);
  } catch {
    // Out of space for the copy: the pin alone protects the live snapshot.
  }
}

function clearQuarantine(): void {
  snapshotPinned = false;
  try {
    localStorage.removeItem(UNRECOVERED_KEY);
  } catch {
    // ignore
  }
}

/** Is there a stored snapshot this app could not load? (Used by tests and by
 *  the recovery diagnostics; a leftover copy is never deleted behind the pin.) */
export function hasUnrecoveredSnapshot(): boolean {
  return snapshotPinned || readItem(UNRECOVERED_KEY) !== null;
}

/** The snapshot that could not be restored, or null. Handy for a manual export
 *  after an app update changed the format. */
export function unrecoveredSnapshotText(): string | null {
  return readItem(UNRECOVERED_KEY);
}

/** Forget the module-level bookkeeping (signature cache, pin, notices). Used by
 *  tests and after a deliberate "start over"; it does not touch stored data. */
export function resetAutosaveBookkeeping(): void {
  lastSignature = "";
  snapshotPinned = false;
  unavailableNoted = false;
}

/** Tell the user, by name, that part (or all) of the crash snapshot is gone. */
function reportRestoreFailure(names: string[], total: boolean): void {
  const zh = useStore.getState().locale === "zh";
  const listed = names.filter(Boolean).join("、") || (zh ? "未知文件" : "unknown file");
  const msg = total
    ? zh
      ? `上次的会话无法恢复：${listed}。原始数据已保留，可在文件修复后重新打开本应用`
      : `Last session could not be restored: ${listed}. The raw snapshot is kept.`
    : zh
      ? `部分文档无法恢复：${listed}`
      : `Some documents could not be restored: ${listed}`;
  useStore.getState().showToast(msg, "error");
}

/** Serialize the active document to localStorage (best effort). */
export function writeAutosave(): void {
  const st = useStore.getState();
  const tabs = savedTabsOfStore();
  // Decide "is there anything to save" from the WHOLE workspace, not just the
  // active tab: clicking "+ new tab" blanks the active document but moves the
  // previous one into `docs`, so it must not wipe the other tabs' snapshots.
  if (!st.xml && tabs.length === 0) {
    // ...and never delete a snapshot the app failed to load: on a failed
    // restore the workspace legitimately looks empty.
    if (hasUnrecoveredSnapshot()) return;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    lastSignature = "";
    return;
  }
  const sig = workspaceSignature(st);
  if (sig === lastSignature) return;

  const data: SessionData = {
    version: CURRENT_SESSION_VERSION,
    fileName: st.fileName,
    xml: st.xml ?? "",
    sourceFiles: st.sourceFiles ?? undefined,
    nestedName: st.nestedName,
    nestedXml: st.nestedXml,
    compareName: st.compareName,
    compareXml: st.compareXml,
    layoutOptions: st.layoutOptions,
    renderOptions: st.renderOptions,
    themeId: st.themeId,
    ...viewSliceOf(st),
    tabs: tabs.length > 0 ? tabs : undefined,
    // Which tab was front, so restoring brings the same one back.
    activeTabIndex: activeIndexOf(st),
    searchQuery: st.searchQuery,
    searchRegex: st.searchRegex,
    eventFilter: st.eventFilter,
    familyFilter: st.familyFilter ? [...st.familyFilter] : null,
    confidenceMin: st.confidenceMin,
    confidenceMax: st.confidenceMax,
  };

  let text: string;
  try {
    text = serializeSession(data);
    localStorage.setItem(KEY, text);
  } catch (e) {
    // Private mode / quota exceeded: the stored snapshot stays exactly as it is
    // and, because the signature was NOT advanced, the next change retries the
    // write. Say so once - silent autosave death is how work gets lost.
    console.warn("PhyloRecViewer: autosave write failed", e);
    if (!unavailableNoted) {
      unavailableNoted = true;
      const zh = st.locale === "zh";
      st.showToast(
        zh
          ? "自动保存不可用：本地存储已满或被禁用，请及时导出会话文件"
          : "Autosave unavailable: local storage is full or blocked. Export your session file.",
        "error",
      );
    }
    return;
  }
  lastSignature = sig;
  unavailableNoted = false;
  if (snapshotPinned) {
    // The live slot now holds fresh work; the un-loadable original survives in
    // UNRECOVERED_KEY, where a manual export can reach it.
    snapshotPinned = false;
  }
}

/** Restore the last autosaved workspace into the active tab.
 *
 *  Returns true only when the snapshot really produced a usable workspace: the
 *  document it names as front was parsed. Anything less keeps the snapshot
 *  pinned and tells the user which file failed. */
export function restoreAutosave(): boolean {
  const text = readItem(KEY);
  if (!text) return false;
  let data: SessionData;
  try {
    data = parseSession(text);
  } catch (e) {
    quarantine(text);
    reportRestoreFailure([friendlyParseError(e).split("\n")[0]], true);
    return false;
  }

  const st = useStore.getState();
  try {
    // Restore a merged document from sourceFiles, or a single-file document.
    // An empty top-level xml means the workspace was saved with a blank active
    // tab but other tabs present - restore only those tabs.
    if (data.xml) {
      if (data.sourceFiles && data.sourceFiles.length > 1) {
        st.loadMany(data.sourceFiles);
      } else {
        st.loadXml(data.xml, data.fileName ?? "session");
      }
    }
    if (data.nestedXml) st.loadNestedXml(data.nestedXml, data.nestedName ?? "nested");
    if (data.compareXml) st.loadCompareXml(data.compareXml, data.compareName ?? "compare");
    st.applyViewState({
      layoutOptions: data.layoutOptions,
      renderOptions: data.renderOptions,
      themeId: data.themeId,
      swapped: data.swapped,
      nestedSwapped: data.nestedSwapped,
      collapsed: data.collapsed,
      geneColors: data.geneColors,
      annotations: data.annotations,
      labelOverrides: data.labelOverrides,
    });

    // Restore the search/filter state carried by the session document.
    if (data.searchQuery !== undefined || data.searchRegex !== undefined) {
      useStore.setState({
        searchQuery: data.searchQuery ?? "",
        searchRegex: data.searchRegex ?? false,
        eventFilter: data.eventFilter ?? { ...ALL_EVENTS },
        familyFilter: data.familyFilter ? new Set(data.familyFilter) : null,
        confidenceMin: data.confidenceMin ?? 0,
        confidenceMax: data.confidenceMax ?? 1,
      });
    }

    // Restore the other tabs (unparsed; they build themselves on first open).
    restoreTabs(data.tabs, { activeTabIndex: data.activeTabIndex });
  } catch (e) {
    console.warn("PhyloRecViewer: autosave restore crashed", e);
    quarantine(text);
    reportRestoreFailure([friendlyParseError(e).split("\n")[0]], true);
    return false;
  }

  const after = useStore.getState();
  const failed: string[] = [];
  if (data.xml && !after.recon) failed.push(after.fileName ?? data.fileName ?? "session");
  if (data.nestedXml && !after.nested) failed.push(data.nestedName ?? "nested");
  if (data.compareXml && !after.compare) failed.push(data.compareName ?? "compare");
  const usable = !(data.xml && !after.recon);

  if (!usable) {
    quarantine(text);
    reportRestoreFailure(failed, true);
    return false;
  }
  if (failed.length > 0) {
    // Partial restore: keep the original too, since the shortened workspace is
    // about to be re-persisted.
    quarantine(text);
    reportRestoreFailure(failed, false);
    return true;
  }
  clearQuarantine();
  return true;
}

let timer: number | null = null;
let lastSignature = "";

/** Fields whose change should trigger an autosave.  Everything else (toast,
 *  loading, rendering, locate, etc.) is transient and should not. */
const PERSIST_KEYS = [
  "xml", "fileName", "sourceFiles", "nestedXml", "compareXml",
  "nestedName", "compareName",
  "layoutOptions", "renderOptions", "themeId",
  "swapped", "nestedSwapped", "collapsed", "geneColors",
  "annotations", "labelOverrides",
  "searchQuery", "searchRegex", "eventFilter", "familyFilter",
  "confidenceMin", "confidenceMax",
  "tabs", "activeTabId", "docs",
] as const;

/** Begin autosaving on store changes (debounced, with a narrow selector so
 *  only document/view state changes trigger a write). Call once at startup. */
export function startAutosave(): void {
  let prev = PERSIST_KEYS.map((k) => useStore.getState()[k]);
  useStore.subscribe((s) => {
    const next = PERSIST_KEYS.map((k) => s[k]);
    // Shallow compare: if none of the tracked fields changed, skip.
    let changed = false;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) { changed = true; break; }
    }
    prev = next;
    if (!changed) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(writeAutosave, DEBOUNCE_MS);
  });
}
