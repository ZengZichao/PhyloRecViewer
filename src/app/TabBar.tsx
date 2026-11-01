import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { samples } from "../samples";
import { isDocDirty, useStore } from "../state/store";

/** Horizontal bar of open document tabs, with per-tab close and a "+" button.
 *  Tabs holding unsaved user work (annotations / swaps / colors / overlays)
 *  show a dirty dot and ask before closing. */
export function TabBar() {
  /** How many source files a tab's document was merged from (1 = single file). */
  const sourceFilesCount = (id: string): number => {
    if (id === activeId) return useStore.getState().sourceFiles?.length ?? 1;
    return docs[id]?.sourceFiles?.length ?? 1;
  };

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
  // The dirty signal is the edit counter vs its clean baseline.
  const activeEditSeq = useStore((s) => s.editSeq);
  const activeSavedSeq = useStore((s) => s.savedSeq);
  const activeSampleId = useStore((s) => s.sampleId);
  const activeDoc = { editSeq: activeEditSeq, savedSeq: activeSavedSeq };
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
        : isDocDirty(docs[id] ?? { editSeq: 0, savedSeq: 0 });
    if (dirty && !window.confirm(t.closeConfirmBody)) return;
    closeTab(id);
  };

  // Context-menu state: close others / close all / rename.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const closeNow = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNow();
    };
    document.addEventListener("mousedown", closeNow);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", closeNow);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Drag-to-reorder: HTML5 dnd between tabs. The store mutates `tabs` in place,
  // so a simple splice in component state would desync — reorder via a store
  // action instead (addTab-less: tabs array patch directly).
  const dragId = useRef<string | null>(null);

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
            : isDocDirty(docs[tab.id] ?? { editSeq: 0, savedSeq: 0 });
        return (
          <div
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            draggable
            onDragStart={() => {
              dragId.current = tab.id;
            }}
            onDragOver={(e) => {
              if (dragId.current && dragId.current !== tab.id) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId.current && dragId.current !== tab.id) {
                useStore.setState((st) => {
                  const from = st.tabs.findIndex((tb) => tb.id === dragId.current);
                  const to = st.tabs.findIndex((tb) => tb.id === tab.id);
                  if (from < 0 || to < 0 || from === to) return {};
                  const next = [...st.tabs];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  return { tabs: next };
                });
              }
              dragId.current = null;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: tab.id, x: e.clientX, y: e.clientY });
            }}
            title={
              sourceFilesCount(tab.id) > 1
                ? t.tabTooltipMerged.replace("{n}", String(sourceFilesCount(tab.id)))
                : label
            }
            className={`tab${selected ? " active" : ""}${dirty ? " dirty" : ""}`}
            data-tooltip={label}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(e) => {
              // Delete/Backspace on the FOCUSED TAB closes it: the handler used
              // to sit on the tabIndex=-1 close button, so the documented
              // keyboard close never actually fired.
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                requestClose(tab.id);
                return;
              }
              onKeyDown(e, i);
            }}
          >
            <span className="tab-title">{label}</span>
            {/* A bare <span aria-label> is dropped by assistive tech: without a
                role the dirty marker was invisible. */}
            {dirty && (
              <span className="tab-dirty" role="img" aria-label={t.unsavedChanges} />
            )}
            <button
              className="tab-close"
              data-tooltip={`${t.closeTabTitle}: ${label}`}
              aria-label={`${t.closeTabTitle}: ${label}`}
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
      {menu && (
        <div className="tab-context" role="menu" style={{ left: menu.x, top: menu.y }}>
          <button role="menuitem" onClick={() => { requestClose(menu.id); setMenu(null); }}>
            {t.closeTabMenu}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              for (const tb of tabs) if (tb.id !== menu.id) requestClose(tb.id);
              setMenu(null);
            }}
          >
            {t.closeOthers}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              for (const tb of tabs) requestClose(tb.id);
              setMenu(null);
            }}
          >
            {t.closeAll}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const current = tabs.find((tb) => tb.id === menu.id)?.title ?? "";
              const name = window.prompt(t.renameTab, current);
              if (name && name.trim()) useStore.getState().renameTab(menu.id, name.trim());
              setMenu(null);
            }}
          >
            {t.renameTab}
          </button>
        </div>
      )}
    </div>
  );
}
