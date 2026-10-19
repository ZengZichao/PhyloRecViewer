import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { layout } from "../layout";
import { countLabel, useT } from "../i18n";
import { agreementPct, computeDiff } from "../analysis/compare";
import { desktopTakePendingFiles, onDesktopOpenFile, onDesktopOpenFailed } from "../platform/desktop";
import { themes } from "../render/theme";
import { useStore, type ToastData } from "../state/store";
import { loadPrefs, savePrefs } from "../state/prefs";
import { samples } from "../samples";
import { Canvas } from "./Canvas";
import { AnnotationEditor } from "./AnnotationEditor";
import { Legend } from "./Legend";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { MenuBar, type ExportPane } from "./MenuBar";
import { modalOpen } from "./hooks";

/** A referentially-stable empty set: the nested view has no collapse state. */
const NO_COLLAPSE: Set<string> = new Set();

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
  const toggleSwap = useStore((s) => s.toggleSwap);
  const toggleNestedSwap = useStore((s) => s.toggleNestedSwap);
  const collapsed = useStore((s) => s.collapsed);
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const geneColors = useStore((s) => s.geneColors);
  const labelOverrides = useStore((s) => s.labelOverrides);
  const onlyMatches = useStore((s) => s.onlyMatches);
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
  const theme = themes[resolvedThemeId];
  const [dragOver, setDragOver] = useState(false);
  // Nested dragenter/dragleave events fire as the pointer crosses child
  // elements; a counter keeps the drop overlay stable (no flicker) until the
  // drag actually leaves the app surface or drops.
  const dragDepth = useRef(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => loadPrefs().panelWidths?.sidebar ?? 360);
  const resizing = useRef(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => loadPrefs().panelWidths?.right ?? 340);
  const resizingRight = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardVisible, setOnboardVisible] = useState(false);
  const [diffHidden, setDiffHidden] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const multiDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!pendingMulti, multiDialogRef);

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
  const compareResult = useMemo(
    () =>
      compare ? layout(compare, layoutOptions, swapped, collapsed, renderOptions.curved) : null,
    [compare, layoutOptions, swapped, collapsed, renderOptions.curved],
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
        { result, highlight: focusPrimary, hideOutside: ho, labelOverrides, title: t.paneGeneSymbiont },
        { result: nestedResult, highlight: focusNested, hideOutside: hoNested, labelOverrides, title: t.paneSymbiontHost },
      ];
    }
    if (compareResult && compare && diff) {
      const hide = diffHidden ? null : diff.disagreeA;
      const hideB = diffHidden ? null : diff.disagreeB;
      return [
        { result, highlight: hide, labelOverrides, title: fileName ?? "A" },
        { result: compareResult, highlight: hideB, labelOverrides, title: compareName ?? "B" },
      ];
    }
    return [{ result, highlight: focusPrimary, hideOutside: ho, labelOverrides }];
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

  // Listen for OS dark/light changes so "system" theme follows in real time.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => syncSystemTheme();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [syncSystemTheme]);

  // Centralised keyboard shortcuts: undo/redo (⌘Z / ⌘⇧Z / ⌘Y) and help (?).
  // Uses the shared useGlobalShortcuts hook with a unified input-field guard.
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
    }
  });

  // Escape collapses the analysis panel, as the help overlay advertises. Each
  // dialog handles its own Escape, so this one stands aside while a modal is
  // up; "clear the selection" is deliberately not claimed here because
  // selection lives inside the canvas and is cleared by clicking empty space.
  useGlobalShortcuts(
    (e) => {
      if (e.key !== "Escape" || modalOpen() || isTextInput(e)) return;
      e.preventDefault();
      closePanel();
    },
    { allowInModals: true },
  );

  // Responsive: on narrow windows the two side panels crowd the canvas, so
  // auto-collapse the analysis panel (then the sidebar) when crossing down
  // through a width threshold. Users can always reopen them.
  useEffect(() => {
    let prev = window.innerWidth;
    const apply = (w: number) => {
      if (w < 1000 && prev >= 1000) closePanel();
      if (w < 820 && prev >= 820) setSidebarOpen(false);
      prev = w;
    };
    apply(window.innerWidth);
    const onResize = () => apply(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [closePanel, setSidebarOpen]);

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

  // First-run tour is NOT shown automatically: it is opt-in from the Help
  // overlay and Preferences ("View tutorial"). The event below is the single
  // entry point used by both surfaces, dispatched by Settings / HelpOverlay.
  useEffect(() => {
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
    });
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

  return (
    <TooltipProvider>
      <div
        className="app"
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
              <div className="split">
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
                    locate={locate}
                  />
                </div>
                {showLegend && <Legend theme={theme} recon={recon} />}
              </div>
            ) : compareResult && compare && diff ? (
              <div className="split">
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
                    locate={locate}
                  />
                </div>
                <div className="split-pane">
                  <Canvas
                    result={compareResult}
                    theme={theme}
                    options={renderOptions}
                    title={compareName ?? "B"}
                    paneId="compare"
                    onSpeciesClick={toggleSwap}
                    onToggleCollapse={toggleCollapse}
                    geneColors={geneColors}
                    focus={diffHidden ? null : diff.disagreeB}
                    locate={locate}
                  />
                </div>
                <div className="compare-badge">
                  {(() => {
                    // Computed once; pure but called twice would be wasteful.
                    const pct = agreementPct(diff);
                    return pct === null ? "N/A" : `${pct}% ${t.agree}`;
                  })()} &middot; {diff.compared} {t.geneNodes}
                  <button
                    className="diff-hide"
                    data-tooltip={t.diffHide}
                    aria-label={t.diffHide}
                    aria-pressed={diffHidden}
                    onClick={() => setDiffHidden((v) => !v)}
                  >
                    {diffHidden ? "◉" : "◎"}
                  </button>
                </div>
                {!diffHidden && (
                  <div className="diff-legend">
                    <span className="diff-swatch" aria-hidden="true" />
                    {t.diffLegend}
                    <button className="btn ghost diff-jump" onClick={() => openPanel("diff")}>
                      {t.panelDiff} ▸
                    </button>
                  </div>
                )}
                {/* The event legend and the reading of the stats belong to every
                    drawing, not only the single-pane one: the compare and nested
                    splits render the same legend and stats line the exported
                    figure carries for each pane. */}
                {showLegend && <Legend theme={theme} recon={recon} />}
                {stats && (
                  <div className="stats">
                    {countLabel(stats.species, t.species)} &middot; {countLabel(stats.trees, t.geneTreeUnit)} &middot; {countLabel(stats.genes, t.geneNodes)}
                  </div>
                )}
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
            <div className="multi-open" role="dialog" aria-modal="true" aria-label={t.multiOpenTitle}>
              <div className="multi-open-card" ref={multiDialogRef}>
                <h3>{t.multiOpenTitle.replace("{n}", String(pendingMulti.length))}</h3>
                <div className="multi-open-actions">
                  <button className="btn primary" onClick={confirmMerge}>
                    {t.mergeMode}
                  </button>
                  <button className="btn" onClick={confirmTabs}>
                    {t.tabMode}
                  </button>
                  <button className="btn ghost" onClick={cancelPendingMulti}>
                    {t.annoCancel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        {rightPanelOpen && (
          <div
            className="sidebar-resizer right"
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

/** App-level singleton toast — rendered once so MenuBar and RightPanel never
 *  overlap each other's status messages. The colour follows the message kind
 *  (success green, error red, info accent). */
function ToastSingleton() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <ToastView data={toast} />;
}

function ToastView({ data }: { data: ToastData }) {
  return (
    <div className={`toast ${data.kind}`} role="status">
      {data.msg}
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
