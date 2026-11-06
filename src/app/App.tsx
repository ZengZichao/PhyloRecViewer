import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { layout } from "../layout";
import { countLabel, useT } from "../i18n";
import { agreementPct, speciesAgreementPct, computeDiff } from "../analysis/compare";
import { desktopTakePendingFiles, onDesktopOpenFile, onDesktopOpenFailed } from "../platform/desktop";
import { themes } from "../render/theme";
import { useStore, type ToastData } from "../state/store";
import { loadPrefs, savePrefs } from "../state/prefs";
import { restoreAutosave, clearAutosaveSnapshot } from "../state/autosave";
import { samples } from "../samples";
import { Canvas, type ViewSync } from "./Canvas";
import { AnnotationEditor } from "./AnnotationEditor";
import { Legend } from "./Legend";
import { NodeInspector } from "./NodeInspector";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { MenuBar, type ExportPane } from "./MenuBar";
import { modalOpen } from "./hooks";

/** A referentially-stable empty set: the nested view has no collapse state. */
const NO_COLLAPSE: Set<string> = new Set();

const SPLIT_ORIENT_KEY = "rpv.split.orientation";

/**
 * Put the caret in the analysis panel's search field. Opening the tab alone
 * leaves focus on <body>, so the user's next keystroke is swallowed by the
 * global shortcut layer instead of typing a query. The panel mounts on a
 * later commit, so retry for a few frames - with a timer rather than
 * requestAnimationFrame, which never fires on a non-painting page.
 */
function focusSearchField(attempts = 8): void {
  const el = document.querySelector<HTMLInputElement>('input[name="rp-search"]');
  if (el) {
    el.focus();
    el.select();
    return;
  }
  if (attempts > 0) setTimeout(() => focusSearchField(attempts - 1), 16);
}
import { EmptyState } from "./EmptyState";
import { HelpOverlay } from "./HelpOverlay";
import { Settings } from "./Settings";
import { Onboarding } from "./Onboarding";
import { TooltipProvider } from "./Tooltip";
import { useGlobalShortcuts, useFocusTrap, isTextInput, useFocusMatches, useFocusMatchesFor } from "./hooks";

export function App() {
  const t = useT();
  const recon = useStore((s) => s.recon);
  const error = useStore((s) => s.error);
  const nested = useStore((s) => s.nested);
  const nestedError = useStore((s) => s.nestedError);
  const compare = useStore((s) => s.compare);
  const compareName = useStore((s) => s.compareName);
  const compareError = useStore((s) => s.compareError);
  const fileName = useStore((s) => s.fileName);
  const layoutOptions = useStore((s) => s.layoutOptions);
  const renderOptions = useStore((s) => s.renderOptions);
  const resolvedThemeId = useStore((s) => s.resolvedThemeId);
  const locale = useStore((s) => s.locale);
  const syncSystemTheme = useStore((s) => s.syncSystemTheme);
  const openInNewTab = useStore((s) => s.openInNewTab);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const openPanel = useStore((s) => s.openPanel);
  const rightPanelTab = useStore((s) => s.rightPanelTab);
  const swapped = useStore((s) => s.swapped);
  const nestedSwapped = useStore((s) => s.nestedSwapped);
  const compareSwapped = useStore((s) => s.compareSwapped);
  const toggleSwap = useStore((s) => s.toggleSwap);
  const toggleNestedSwap = useStore((s) => s.toggleNestedSwap);
  const toggleCompareSwap = useStore((s) => s.toggleCompareSwap);
  const collapsed = useStore((s) => s.collapsed);
  const compareCollapsed = useStore((s) => s.compareCollapsed);
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const toggleCompareCollapse = useStore((s) => s.toggleCompareCollapse);
  const geneColors = useStore((s) => s.geneColors);
  const compareGeneColors = useStore((s) => s.compareGeneColors);
  const labelOverrides = useStore((s) => s.labelOverrides);
  const labelOverridesById = useStore((s) => s.labelOverridesById);
  const onlyMatches = useStore((s) => s.onlyMatches);
  const compareLinked = useStore((s) => s.compareLinked);
  const setCompareLinked = useStore((s) => s.setCompareLinked);
  const locate = useStore((s) => s.locate);
  const showLegend = useStore((s) => s.showLegend);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const openFiles = useStore((s) => s.openFiles);
  const loading = useStore((s) => s.loading);
  const rendering = useStore((s) => s.rendering);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const closePanel = useStore((s) => s.closePanel);
  const pendingMulti = useStore((s) => s.pendingMulti);
  const confirmMerge = useStore((s) => s.confirmMerge);
  const confirmTabs = useStore((s) => s.confirmTabs);
  const cancelPendingMulti = useStore((s) => s.cancelPendingMulti);
  const clearError = useStore((s) => s.clearError);
  const loadXml = useStore((s) => s.loadXml);
  const loadNestedXml = useStore((s) => s.loadNestedXml);
  const loadCompareXml = useStore((s) => s.loadCompareXml);
  const setSampleId = useStore((s) => s.setSampleId);
  const pendingRestore = useStore((s) => s.pendingRestore);
  const theme = themes[resolvedThemeId];
  const [dragOver, setDragOver] = useState(false);
  // Nested dragenter/dragleave events fire as the pointer crosses child
  // elements; a counter keeps the drop overlay stable (no flicker) until the
  // drag actually leaves the app surface or drops.
  const dragDepth = useRef(0);
  // Split orientation for nested/compare: vertical stacking wastes the wide
  // half of a landscape window, so a side-by-side arrangement is available.
  const [splitRow, setSplitRow] = useState(
    () => localStorage.getItem(SPLIT_ORIENT_KEY) !== "row",
  );
  // Presentation mode: hide both panels and give the drawing the window.
  const [presenting, setPresenting] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => loadPrefs().panelWidths?.sidebar ?? 360);
  const resizing = useRef(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => loadPrefs().panelWidths?.right ?? 400);
  const resizingRight = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardVisible, setOnboardVisible] = useState(false);
  const [diffHidden, setDiffHidden] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const multiDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!pendingMulti, multiDialogRef);

  // Linked-view sync between the two compare panes.
  const [viewA, setViewA] = useState<ViewSync | null>(null);
  const [viewB, setViewB] = useState<ViewSync | null>(null);
  const onPrimaryView = useCallback((v: ViewSync) => setViewA(v), []);
  const onCompareView = useCallback((v: ViewSync) => setViewB(v), []);

  const setSplitRowPersist = (row: boolean) => {
    setSplitRow(row);
    try {
      localStorage.setItem(SPLIT_ORIENT_KEY, row ? "column" : "row");
    } catch {
      // ignore
    }
  };

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("active");
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    setSidebarWidth(Math.max(360, Math.min(560, e.clientX)));
  };
  const onResizeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizing.current = false;
    e.currentTarget.classList.remove("active");
    // Persist the sidebar width so it survives restarts.
    const prefs = loadPrefs();
    savePrefs({ ...prefs, panelWidths: { sidebar: sidebarWidth, right: rightPanelWidth } });
  };

  const onRightResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizingRight.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("active");
  };
  const onRightResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizingRight.current) return;
    // The minimum width must keep every analysis tab visible (the tab bar
    // wraps to a second row below this, so 320px is the safe floor).
    setRightPanelWidth(Math.max(320, Math.min(680, window.innerWidth - e.clientX)));
  };
  const onRightResizeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizingRight.current = false;
    e.currentTarget.classList.remove("active");
    // Persist the right panel width so it survives restarts.
    const prefs = loadPrefs();
    savePrefs({ ...prefs, panelWidths: { sidebar: sidebarWidth, right: rightPanelWidth } });
  };

  const result = useMemo(
    () =>
      recon ? layout(recon, layoutOptions, swapped, collapsed, renderOptions.curved) : null,
    [recon, layoutOptions, swapped, collapsed, renderOptions.curved],
  );
  const nestedResult = useMemo(
    () =>
      // The nested (host) drawing has no independent collapse UI, so it must NOT
      // reuse the primary document's `collapsed` set: node ids are content-
      // derived, so an identical subtree would collapse in both views.
      nested ? layout(nested, layoutOptions, nestedSwapped, NO_COLLAPSE, renderOptions.curved) : null,
    [nested, layoutOptions, nestedSwapped, renderOptions.curved],
  );
  // The compare pane carries its OWN mirror/collapse state: A and B may not
  // even share a topology, and mirroring a branch in B used to rearrange A.
  const compareResult = useMemo(
    () =>
      compare ? layout(compare, layoutOptions, compareSwapped, compareCollapsed, renderOptions.curved) : null,
    [compare, layoutOptions, compareSwapped, compareCollapsed, renderOptions.curved],
  );
  const diff = useMemo(
    () => (recon && compare ? computeDiff(recon, compare) : null),
    [recon, compare],
  );

  // Shared memoised search/filter computation (deduplicated with RightPanel).
  const { idSet: focusPrimary, matches: focusPrimaryMatches } = useFocusMatches();
  const { idSet: focusNested } = useFocusMatchesFor(nested, recon);

  // Panes to export (WYSIWYG): both panes in nested/compare split, else one.
  const exportPanes = useMemo<ExportPane[]>(() => {
    if (!result) return [];
    // "Show only matches" must drop (not just dim) non-matching nodes in the
    // export too, and user label renames must survive into the exported figure.
    const ho = onlyMatches && focusPrimary ? focusPrimary : null;
    const hoNested = onlyMatches && focusNested ? focusNested : null;
    if (nestedResult && nested) {
      return [
        { result, highlight: focusPrimary, hideOutside: ho, labelOverrides, labelOverridesById, title: t.paneGeneSymbiont },
        { result: nestedResult, highlight: focusNested, hideOutside: hoNested, labelOverrides, labelOverridesById, title: t.paneSymbiontHost },
      ];
    }
    if (compareResult && compare && diff) {
      const hide = diffHidden ? null : diff.disagreeA;
      const hideB = diffHidden ? null : diff.disagreeB;
      return [
        { result, highlight: hide, hideOutside: ho, labelOverrides, labelOverridesById, title: fileName ?? "A" },
        { result: compareResult, highlight: hideB, hideOutside: ho, labelOverrides, labelOverridesById, title: compareName ?? "B" },
      ];
    }
    return [{ result, highlight: focusPrimary, hideOutside: ho, labelOverrides, labelOverridesById }];
  }, [
    result,
    nested,
    nestedResult,
    compare,
    compareResult,
    diff,
    diffHidden,
    focusPrimary,
    focusNested,
    onlyMatches,
    labelOverrides,
    labelOverridesById,
    t,
    fileName,
    compareName,
  ]);

  // Sync <html data-theme> and <html lang> with the current theme/locale.
  // lang is essential for screen readers to pronounce the document correctly.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeId;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.body.style.background = theme.background;
  }, [theme, resolvedThemeId, locale]);

  // The window (and OS task switcher) should name the open document.
  useEffect(() => {
    document.title = fileName ? `${fileName} — PhyloRecViewer` : "PhyloRecViewer";
  }, [fileName]);

  // Listen for OS dark/light changes so "system" theme follows in real time.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => syncSystemTheme();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [syncSystemTheme]);

  // Centralised keyboard shortcuts: undo/redo (⌘Z / ⌘⇧Z / ⌘Y), search (⌘F),
  // help (?) and presentation (P). Uses the shared useGlobalShortcuts hook
  // with a unified input-field guard.
  useGlobalShortcuts((e) => {
    if (isTextInput(e)) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "f") {
        // ⌘F: jump straight to the search field in the analysis panel.
        e.preventDefault();
        openPanel("search");
        focusSearchField();
      }
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === "?") {
      e.preventDefault();
      setHelpOpen(true);
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      setPresenting((v) => !v);
    }
  });

  // Escape collapses the analysis panel — but never while a presentation is
  // up (there it exits the presentation) and never "through" a modal. Each
  // dialog handles its own Escape. "Clear the selection" is deliberately not
  // claimed here because selection lives inside the canvas and is cleared by
  // clicking empty space.
  useGlobalShortcuts(
    (e) => {
      if (e.key !== "Escape" || isTextInput(e)) return;
      if (presenting) {
        e.preventDefault();
        setPresenting(false);
        return;
      }
      if (modalOpen()) return;
      // An open menu consumes its own Escape (closing the menu); the panel
      // must not also close on that same keypress.
      if (document.querySelector(".dropdown-menu")) return;
      e.preventDefault();
      closePanel();
    },
    { allowInModals: true },
  );

  // Panel widths saved on a wide screen must not crush the canvas on a small
  // one: clamp both to the current viewport. Narrow FIRST launches collapse
  // the panels outright (the old resize-crossing logic never fired on load,
  // so a 900px window opened with both panels open and a sliver of canvas).
  // Thresholds keep ≥ ~700px of canvas: at 1024 with both panels open the
  // legend, stats pill and hint chip collided three-way.
  useEffect(() => {
    setSidebarWidth((w) => Math.min(w, Math.max(360, window.innerWidth - 420)));
    setRightPanelWidth((w) => Math.min(w, Math.max(320, window.innerWidth - 720)));
    const w = window.innerWidth;
    if (w < 1180) useStore.getState().closePanel();
    if (w < 920) useStore.getState().setSidebarOpen(false);
  }, []);

  // Presentation mode always collapses the panels on entry and restores them
  // on exit, so Esc gives the user their workspace back. The restore branch is
  // gated on an actual presenting→false TRANSITION: run on mount it re-opened
  // both panels right after the narrow-viewport effect had collapsed them,
  // defeating the 1024px launch policy.
  const prevPanelState = useRef({ sidebar: true, panel: true });
  const wasPresenting = useRef(false);
  useEffect(() => {
    if (presenting) {
      prevPanelState.current = { sidebar: useStore.getState().sidebarOpen, panel: useStore.getState().rightPanelOpen };
      wasPresenting.current = true;
      setSidebarOpen(false);
      closePanel();
    } else if (wasPresenting.current) {
      wasPresenting.current = false;
      setSidebarOpen(prevPanelState.current.sidebar);
      if (prevPanelState.current.panel) openPanel(rightPanelTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);

  // Desktop: load files opened via OS association (double-click / "Open with"),
  // both those present at launch and those opened while already running.
  // Files that could not be read (oversized, non-UTF-8, deleted) surface as a
  // toast instead of the app silently doing nothing.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenFailed: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const pending = await desktopTakePendingFiles();
      if (!cancelled && pending.files.length > 0) {
        openInNewTab(pending.files.map((f) => ({ name: f.name, text: f.content })));
      }
      if (!cancelled && pending.failed.length > 0) {
        useStore.getState().showToast(
          t.openFailedToast.replace("{names}", pending.failed.join(", ")),
          "error",
        );
      }
      // Register the running-app listeners, but dispose of them immediately if
      // the effect was torn down (e.g. a locale change re-runs it) while the
      // async registration was still in flight. Without this, every locale
      // switch leaks a never-unsubscribed listener and one double-click opens
      // N duplicate tabs.
      unlisten = await onDesktopOpenFile((files) => {
        if (files.length > 0) openInNewTab(files.map((f) => ({ name: f.name, text: f.content })));
      });
      if (cancelled) {
        unlisten();
        unlisten = undefined;
        return;
      }
      unlistenFailed = await onDesktopOpenFailed((names) => {
        if (names.length > 0) {
          useStore.getState().showToast(
            t.openFailedToast.replace("{names}", names.join(", ")),
            "error",
          );
        }
      });
      if (cancelled) {
        unlistenFailed();
        unlistenFailed = undefined;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
      unlistenFailed?.();
    };
  }, [openInNewTab, t.openFailedToast]);

  // First-run tour: shown ONCE automatically (skippable) so a new user ever
  // sees it; afterwards it is opt-in from Help / Preferences.
  useEffect(() => {
    try {
      if (localStorage.getItem("rpv.onboarded") !== "1") {
        setOnboardVisible(true);
      }
    } catch {
      // ignore
    }
    const onReplay = () => setOnboardVisible(true);
    document.addEventListener("rpv:replay-tour", onReplay);
    return () => document.removeEventListener("rpv:replay-tour", onReplay);
  }, []);

  const onDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    await openFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const onErrorReopen = () => {
    if (fileInput.current) fileInput.current.click();
  };
  const onErrorSample = () => {
    // Load the first bundled sample through the heavy-task contract.
    const s = samples[0];
    const runHeavy = useStore.getState().runHeavy;
    void runHeavy(() => {
      loadXml(s.xml, t[s.labelKey]);
      if (s.nestedXml)
        loadNestedXml(s.nestedXml, s.nestedLabelKey ? t[s.nestedLabelKey] : "nested");
      if (s.compareXml)
        loadCompareXml(s.compareXml, s.compareLabelKey ? t[s.compareLabelKey] : "compare");
      setSampleId(s.id);
      useStore.getState().markDocClean();
    });
  };

  // Restore-prompt actions: restoring runs through the heavy-task contract so
  // the loading overlay covers the (synchronous) parse of a large workspace.
  const onRestoreAccept = () => {
    useStore.setState({ pendingRestore: null });
    void useStore.getState().runHeavy(() => {
      restoreAutosave();
    });
  };
  const onRestoreDecline = () => {
    clearAutosaveSnapshot();
    useStore.setState({ pendingRestore: null });
    useStore.getState().showToast(t.restoreCleared, "info");
  };

  const stats = useMemo(() => {
    if (!recon) return null;
    const genes = recon.geneTrees.reduce((n, t) => n + t.nodes.length, 0);
    return {
      species: recon.species.nodes.length,
      trees: recon.geneTrees.length,
      genes,
    };
  }, [recon]);

  const splitClass = `split${splitRow ? "" : " split-row"}`;

  return (
    <TooltipProvider>
      <div
        className={`app${presenting ? " presenting" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          setDragOver(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={(e) => {
          dragDepth.current = 0;
          setDragOver(false);
          void onDrop(e);
        }}
      >
      <div className="top-bar">
        <TabBar />
        <MenuBar panes={exportPanes} onOpenSettings={() => setSettingsOpen(true)} />
      </div>
      <div className="body">
        {sidebarOpen ? (
          <>
            <Sidebar width={sidebarWidth} />
            <div
              className="sidebar-resizer"
              role="separator"
              aria-label={`${t.resizeHint} · ${t.controlsPanel}`}
              aria-orientation="vertical"
              tabIndex={0}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 24 : 8;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSidebarWidth((w) => Math.max(360, w - step));
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setSidebarWidth((w) => Math.min(560, w + step));
                }
              }}
              onPointerDown={onResizeDown}
              onPointerCancel={onResizeUp}
              onLostPointerCapture={onResizeUp}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
            />
          </>
        ) : (
          <button
            className="rail rail-left"
            onClick={() => setSidebarOpen(true)}
            title={`${t.expand} · ${t.controlsPanel}`}
          >
            <span className="rail-chevron" aria-hidden="true">›</span>
            <span className="rail-text">{t.controlsPanel}</span>
          </button>
        )}
        <main className="main">
          {error ? (
            <div className="state-panel error" role="alert">
              <h2>{t.errorTitle}</h2>
              <p>{error}</p>
              <p className="muted">{t.errorHint}</p>
              <div className="error-actions">
                {recon && (
                  <button className="btn" onClick={clearError}>
                    {t.errorBack}
                  </button>
                )}
                <button className="btn" onClick={onErrorReopen}>
                  {t.errorRetry}
                </button>
                <button className="btn ghost" onClick={onErrorSample}>
                  {t.errorSample}
                </button>
                <input
                  ref={fileInput}
                  name="error-open-files"
                  aria-hidden="true"
                  type="file"
                  multiple
                  accept=".xml,.recphyloxml,.recphylo,.phyloxml,.nhx,.nwk,.newick"
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) void openFiles(files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          ) : result && recon ? (
            nestedResult && nested ? (
              <div className={splitClass}>
                <div className="split-pane">
                  <Canvas
                    result={result}
                    theme={theme}
                    options={renderOptions}
                    title={t.paneGeneSymbiont}
                    paneId="primary"
                    onSpeciesClick={toggleSwap}
                    onToggleCollapse={toggleCollapse}
                    geneColors={geneColors}
                    focus={focusPrimary}
                    hideOutside={onlyMatches && focusPrimary ? focusPrimary : null}
                    labelOverridesById={labelOverridesById}
                    locate={locate}
                  />
                </div>
                <div className="split-pane">
                  <Canvas
                    result={nestedResult}
                    theme={theme}
                    options={renderOptions}
                    title={t.paneSymbiontHost}
                    paneId="nested"
                    onSpeciesClick={toggleNestedSwap}
                    geneColors={geneColors}
                    focus={focusNested}
                    hideOutside={onlyMatches && focusNested ? focusNested : null}
                    labelOverridesById={labelOverridesById}
                    locate={locate}
                  />
                </div>
                {/* Orientation toggle for the nested split: the ⇔ button lives
                    in the compare status bar, so without this the nested view
                    had NO reachable way to switch stacked/side-by-side (the
                    preference is shared, but only discoverable in compare). */}
                <button
                  className="btn ghost split-orient-btn"
                  aria-label={splitRow ? t.splitSideBySide : t.splitStacked}
                  aria-pressed={!splitRow}
                  title={splitRow ? t.splitSideBySide : t.splitStacked}
                  onClick={() => setSplitRowPersist(!splitRow)}
                >
                  {splitRow ? "⇔" : "⇕"}
                </button>
                {showLegend && <Legend theme={theme} recon={recon} />}
              </div>
            ) : compareResult && compare && diff ? (
              <div className="split-outer">
              <div className={splitClass}>
                <div className="split-pane">
                  <Canvas
                    result={result}
                    theme={theme}
                    options={renderOptions}
                    title={fileName ?? "A"}
                    paneId="primary"
                    onSpeciesClick={toggleSwap}
                    onToggleCollapse={toggleCollapse}
                    geneColors={geneColors}
                    focus={diffHidden ? null : diff.disagreeA}
                    diffSet={diffHidden ? null : diff.disagreeA}
                    hideOutside={onlyMatches && focusPrimary ? focusPrimary : null}
                    labelOverridesById={labelOverridesById}
                    locate={locate}
                    syncView={compareLinked ? viewB : null}
                    onViewChange={compareLinked ? onPrimaryView : undefined}
                  />
                </div>
                <div className="split-pane">
                  <Canvas
                    result={compareResult}
                    theme={theme}
                    options={renderOptions}
                    title={compareName ?? "B"}
                    paneId="compare"
                    onSpeciesClick={toggleCompareSwap}
                    onToggleCollapse={toggleCompareCollapse}
                    geneColors={compareGeneColors}
                    focus={diffHidden ? null : diff.disagreeB}
                    diffSet={diffHidden ? null : diff.disagreeB}
                    hideOutside={onlyMatches && focusPrimary ? focusPrimary : null}
                    labelOverridesById={labelOverridesById}
                    locate={locate}
                    syncView={compareLinked ? viewA : null}
                    onViewChange={compareLinked ? onCompareView : undefined}
                  />
                </div>
              </div>
              {/* One bottom status bar below the pane row — a sibling of the
                  split, never an overlay: as an absolute strip it covered the
                  bottom pane's interaction-hint chip. */}
              <div className="compare-status" role="status">
                  {(() => {
                    const pct = agreementPct(diff);
                    const spct = speciesAgreementPct(diff);
                    return (
                      <>
                        <span className="compare-pct">
                          {pct === null ? t.notApplicable : `${pct}% ${t.agree}`}
                        </span>
                        {spct !== null && (
                          <span className="compare-sub">{t.speciesAgreeShort.replace("{p}", String(spct))}</span>
                        )}
                        <span className="compare-sub">{t.diffMatched.replace("{n}", String(diff.compared))}</span>
                        <span className="compare-sub">{t.diffOnlyA.replace("{n}", String(diff.onlyA))}</span>
                        <span className="compare-sub">{t.diffOnlyB.replace("{n}", String(diff.onlyB))}</span>
                      </>
                    );
                  })()}
                  <span className="compare-spacer" />
                  <label className="compare-link">
                    <input
                      type="checkbox"
                      checked={compareLinked}
                      onChange={(e) => setCompareLinked(e.target.checked)}
                    />
                    {t.linkViews}
                  </label>
                  <button
                    className={`btn ghost diff-hide-btn${diffHidden ? " active" : ""}`}
                    aria-pressed={diffHidden}
                    aria-label={diffHidden ? t.diffShow : t.diffHide}
                    data-tooltip={diffHidden ? t.diffShow : t.diffHide}
                    onClick={() => setDiffHidden((v) => !v)}
                  >
                    {diffHidden ? "◉" : "◎"}
                  </button>
                  <button
                    className="btn ghost"
                    aria-label={splitRow ? t.splitSideBySide : t.splitStacked}
                    aria-pressed={!splitRow}
                    onClick={() => setSplitRowPersist(!splitRow)}
                  >
                    {splitRow ? "⇔" : "⇕"}
                  </button>
                  {!diffHidden && (
                    <span className="diff-legend-inline">
                      <span className="diff-swatch" aria-hidden="true" />
                      {t.diffLegend}
                      <button className="btn ghost diff-jump" onClick={() => openPanel("diff")}>
                        {t.panelDiff} ▸
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Canvas
                  result={result}
                  theme={theme}
                  options={renderOptions}
                  paneId="primary"
                  onSpeciesClick={toggleSwap}
                  onToggleCollapse={toggleCollapse}
                  geneColors={geneColors}
                  focus={focusPrimary}
                  labelOverridesById={labelOverridesById}
                  locate={locate}
                />
                {showLegend && <Legend theme={theme} recon={recon} />}
                {stats && (
                  <div className="stats">
                    {countLabel(stats.species, t.species)} &middot; {countLabel(stats.trees, t.geneTreeUnit)} &middot; {countLabel(stats.genes, t.geneNodes)}
                  </div>
                )}
              </>
            )
          ) : (
            <EmptyState />
          )}
          {presenting && (
            <button className="exit-presentation" onClick={() => setPresenting(false)}>
              {t.exitPresentation}
            </button>
          )}
          {dragOver && <div className="drop-overlay">{t.dropToOpen}</div>}
          {loading && <LoadingOverlay />}
          {rendering && !loading && (
            <div className="rendering-badge" role="status">
              {t.rendering}
            </div>
          )}
          {focusPrimaryMatches && focusPrimaryMatches.length > 0 && (
            <div className="match-badge" role="status">
              {countLabel(focusPrimaryMatches.length, t.matchCount)}
            </div>
          )}
          {(nestedError || compareError) && (
            <div className="nested-error" role="alert" aria-live="polite">
              {nestedError && <div>{t.nestedErrorPrefix} {nestedError}</div>}
              {compareError && <div>{t.compareErrorPrefix} {compareError}</div>}
            </div>
          )}
          {pendingMulti && (
            <MultiFileDialog
              files={pendingMulti}
              onMerge={confirmMerge}
              onTabs={confirmTabs}
              onCancel={cancelPendingMulti}
              dialogRef={multiDialogRef}
            />
          )}
          {pendingRestore && (
            <div className="multi-open" role="dialog" aria-modal="true" aria-label={t.restoreTitle}>
              <div className="multi-open-card">
                <h3>{t.restoreTitle}</h3>
                <p className="muted">
                  {t.restoreBody.replace(
                    "{time}",
                    pendingRestore.savedAt
                      ? new Date(pendingRestore.savedAt).toLocaleString()
                      : "—",
                  )}
                </p>
                <div className="multi-open-actions">
                  <button className="btn primary" onClick={onRestoreAccept}>
                    {t.restoreAccept}
                  </button>
                  <button className="btn" onClick={onRestoreDecline}>
                    {t.restoreDecline}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* NodeInspector renders INSIDE .main on purpose: it is absolutely
              positioned bottom-left, and from the app root that anchor is the
              viewport — the card used to cover the sidebar's controls. */}
          <NodeInspector />
        </main>
        {rightPanelOpen && (
          <div
            className="sidebar-resizer right"
            role="separator"
            aria-label={t.analyze}
            aria-orientation="vertical"
            tabIndex={0}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 24 : 8;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setRightPanelWidth((w) => Math.min(680, w + step));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setRightPanelWidth((w) => Math.max(320, w - step));
              }
            }}
            onPointerDown={onRightResizeDown}
              onPointerCancel={onRightResizeUp}
              onLostPointerCapture={onRightResizeUp}
            onPointerMove={onRightResizeMove}
            onPointerUp={onRightResizeUp}
          />
        )}
        <RightPanel width={rightPanelWidth} />
        {!rightPanelOpen && (
          <button
            className="rail rail-right"
            onClick={() => openPanel(rightPanelTab)}
            title={`${t.expand} · ${t.analyze}`}
          >
            <span className="rail-chevron" aria-hidden="true">‹</span>
            <span className="rail-text">{t.analyze}</span>
          </button>
        )}
      </div>
      <AnnotationEditor />
      <HelpOverlay />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Onboarding visible={onboardVisible} onClose={() => setOnboardVisible(false)} />
      <ToastSingleton />
      </div>
    </TooltipProvider>
  );
}

/**
 * The multi-file open dialog used to be three opaque buttons: nothing said
 * that merging draws every family on the FIRST file's species tree, and
 * Escape did not close it. It now lists the files, states the base-species
 * decision up front, reports species-tree conflicts, and closes on Escape.
 */
function MultiFileDialog({
  files,
  onMerge,
  onTabs,
  onCancel,
  dialogRef,
}: {
  files: { name: string; text: string }[];
  onMerge: () => void;
  onTabs: () => void;
  onCancel: () => void;
  dialogRef: { current: HTMLDivElement | null };
}) {
  const t = useT();
  // Lightweight species-name scan per file (names inside spTree): enough to
  // warn when the files clearly disagree, without parsing them all.
  const scan = useMemo(() => {
    const speciesOf = (text: string): Set<string> => {
      const out = new Set<string>();
      const at = text.search(/<sptree/i);
      if (at < 0) return out;
      const spTree = text.slice(at);
      const re = /<name>([^<]*)<\/name>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(spTree)) !== null) {
        out.add(m[1].trim());
        if (out.size > 400) break;
      }
      return out;
    };
    if (files.length < 2) return { conflicts: 0 };
    const base = speciesOf(files[0].text);
    let conflicts = 0;
    for (const f of files.slice(1)) {
      const sp = speciesOf(f.text);
      if (sp.size > 0 && base.size > 0) {
        let differs = false;
        for (const n of sp) if (!base.has(n)) differs = true;
        for (const n of base) if (!sp.has(n)) differs = true;
        if (differs) conflicts++;
      }
    }
    return { conflicts };
  }, [files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="multi-open" role="dialog" aria-modal="true" aria-label={t.multiOpenTitle.replace("{n}", String(files.length))}>
      <div className="multi-open-card" ref={dialogRef}>
        <h3>{t.multiOpenTitle.replace("{n}", String(files.length))}</h3>
        <ul className="multi-open-files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="multi-open-name">{f.name}</span>
              {i === 0 && <span className="multi-open-badge">{t.mergeBase.replace("{name}", f.name)}</span>}
            </li>
          ))}
        </ul>
        <p className="muted">
          {scan.conflicts > 0
            ? t.mergeConflict.replace("{n}", String(scan.conflicts))
            : t.mergeNoConflict}
        </p>
        <div className="multi-open-actions">
          <button className="btn primary" onClick={onMerge}>
            {t.mergeMode}
          </button>
          <button className="btn" onClick={onTabs}>
            {t.tabMode}
          </button>
          <button className="btn ghost" onClick={onCancel}>
            {t.annoCancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** App-level singleton toast — rendered once so MenuBar and RightPanel never
 *  overlap each other's status messages. Errors use role="alert" (they must
 *  interrupt) and can be dismissed by hand. */
function ToastSingleton() {
  const toast = useStore((s) => s.toast);
  const clearToast = useStore((s) => s.clearToast);
  if (!toast) return null;
  return <ToastView data={toast} onClose={clearToast} />;
}

function ToastView({ data, onClose }: { data: ToastData; onClose: () => void }) {
  const t = useT();
  const isError = data.kind === "error";
  return (
    <div className={`toast ${data.kind}`} role={isError ? "alert" : "status"}>
      <span className="toast-msg">{data.msg}</span>
      <button className="toast-close" aria-label={t.close} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** Loading overlay with a fallback message for very large files (> 800 ms). */
function LoadingOverlay() {
  const t = useT();
  const [large, setLarge] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setLarge(true), 800);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="loading-overlay" role="status">
      <span className="spinner" aria-hidden="true" />
      {large ? t.parsingLarge : t.parsing}
    </div>
  );
}
