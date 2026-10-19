import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { samples } from "../samples";
import { isDocDirty, useStore } from "../state/store";

/** Horizontal bar of open document tabs, with per-tab close and a "+" button.
 *  Tabs holding unsaved user work (annotations / swaps / colors / overlays)
 *  show a dirty dot and ask before closing. */
export function TabBar() {
  const t = useT();
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeTabId);
  const switchTab = useStore((s) => s.switchTab);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);
  const docs = useStore((s) => s.docs);
  // Atomic selectors: zustand compares snapshots with Object.is, so selecting
  // a freshly-built object here would re-render the tab bar on EVERY store
  // change (toasts, zoom, search typing...). Each field is subscribed alone.
  const activeAnnotations = useStore((s) => s.annotations);
  const activeSwapped = useStore((s) => s.swapped);
  const activeCollapsed = useStore((s) => s.collapsed);
  const activeGeneColors = useStore((s) => s.geneColors);
  const activeLabelOverrides = useStore((s) => s.labelOverrides);
  const activeNested = useStore((s) => s.nested);
  const activeCompare = useStore((s) => s.compare);
  const activeSampleId = useStore((s) => s.sampleId);
  const activeDoc = {
    annotations: activeAnnotations,
    swapped: activeSwapped,
    collapsed: activeCollapsed,
    geneColors: activeGeneColors,
    labelOverrides: activeLabelOverrides,
    nested: activeNested,
    compare: activeCompare,
  };
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Roving-tabindex keyboard navigation for the tablist (Arrow/Home/End move
  // and activate; Enter/Space activate the focused tab).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      switchTab(tabs[i].id);
      return;
    } else return;
    e.preventDefault();
    const tab = tabs[next];
    if (tab) {
      switchTab(tab.id);
      tabRefs.current[next]?.focus();
    }
  };

  const requestClose = (id: string) => {
    // Confirm only for the active document (its live state is dirty); stashed
    // tabs are read from `docs`.
    const dirty =
      id === activeId
        ? isDocDirty(activeDoc)
        : isDocDirty(docs[id] ?? { annotations: {}, swapped: new Set(), collapsed: new Set(), geneColors: {}, labelOverrides: {}, nested: null, compare: null });
    if (dirty && !window.confirm(t.closeConfirmBody)) return;
    closeTab(id);
  };

  return (
    <div className="tab-bar" role="tablist" data-tauri-drag-region="deep">
      {tabs.map((tab, i) => {
        // A bundled sample's tab title follows the UI language: the stored name
        // is a snapshot, so re-resolve it from the i18n key while the document
        // is still an untouched sample.
        const sampleId =
          tab.id === activeId ? activeSampleId : docs[tab.id]?.sampleId ?? null;
        const sample = sampleId ? samples.find((x) => x.id === sampleId) : undefined;
        const label = sample ? t[sample.labelKey] : tab.title || t.untitledTab;
        const selected = tab.id === activeId;
        const dirty =
          tab.id === activeId
            ? isDocDirty(activeDoc)
            : isDocDirty(docs[tab.id] ?? { annotations: {}, swapped: new Set(), collapsed: new Set(), geneColors: {}, labelOverrides: {}, nested: null, compare: null });
        return (
          <div
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`tab${selected ? " active" : ""}${dirty ? " dirty" : ""}`}
            data-tooltip={label}
            title={label}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="tab-title">{label}</span>
            {/* A bare <span aria-label> is dropped by assistive tech: without a
                role the dirty marker was invisible. */}
            {dirty && (
              <span className="tab-dirty" role="img" aria-label={t.warnings} />
            )}
            <button
              className="tab-close"
              data-tooltip={`${t.closeTabTitle}: ${label}`}
              aria-label={`${t.closeTabTitle}: ${label}`}
              // The close button stays out of the tab order (the tab itself is
              // the stop), but Delete/Backspace on the focused tab now closes it,
              // which is the conventional tablist gesture and the only keyboard
              // route to closing a tab.
              onKeyDownCapture={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  e.stopPropagation();
                  requestClose(tab.id);
                }
              }}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                requestClose(tab.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button className="tab-new" data-tooltip={t.newTabTitle} aria-label={t.newTabTitle} onClick={newTab}>
        +
      </button>
      {/* Fills every pixel of the bar that no tab occupies so the whole empty
          area acts as a window drag region (see styles.css .tab-drag-fill). */}
      <div className="tab-drag-fill" data-tauri-drag-region="deep" aria-hidden="true" />
    </div>
  );
}
