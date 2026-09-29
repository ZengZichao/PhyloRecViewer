import { useEffect, useRef, useState, type ReactNode } from "react";
import { countLabel, useT } from "../i18n";
import type { LayoutResult } from "../layout";
import {
  DEFAULT_PNG_DPI,
  exportPdf,
  exportPng,
  exportSvg,
  renderPdfBlob,
  renderPngBlob,
  sceneToInteractiveHtml,
  sceneToSvgString,
  type ExportDoc,
  type ExportLegendConfig,
} from "../export/exporters";
import {
  desktopOpenText,
  desktopOpenTextMany,
  desktopSaveBinary,
  desktopSaveText,
  isTauri,
} from "../platform/desktop";
import { themes, geneColor } from "../render/theme";
import { reconToNhx } from "../export/newickExport";
import { parseSession, serializeSession } from "../session";
import { samples } from "../samples";
import { useStore } from "../state/store";
import { restoreTabs, sessionDataOfStore } from "../state/autosave";
import { useGlobalShortcuts, isTextInput } from "./hooks";
import { baseName } from "./export-names";

/** Platform-aware modifier key label: "⌘" on macOS, "Ctrl" elsewhere. */
const modKey = (() => {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad")) return "⌘";
  }
  return "Ctrl";
})();


/** One drawing pane the menu bar can export (supplied by App, per view mode). */
export interface ExportPane {
  result: LayoutResult;
  highlight: Set<string> | null;
  /** Nodes to keep when "show only matches" is active. */
  hideOutside?: Set<string> | null;
  /** User label renames to carry into the export. */
  labelOverrides?: Record<string, string>;
  title?: string;
}

/**
 * A button that opens a small popup menu. Closes on outside click, Escape, or
 * when an item calls the `close` callback passed to the render-prop children.
 */
function Dropdown({
  label,
  title,
  ariaLabel,
  disabled,
  id,
  children,
}: {
  label: ReactNode;
  title?: string;
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const menuRef = useRef<HTMLDivElement>(null);
  // A role="menu" full of bare buttons needs arrow navigation to be readable
  // for assistive tech and usable from the keyboard: label the items,
  // move between them with the arrow keys / Home / End, and start on the first
  // item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const root = menuRef.current;
    if (!root) return;
    for (const b of root.querySelectorAll("button")) b.setAttribute("role", "menuitem");
    const items = () =>
      Array.from(root.querySelectorAll<HTMLElement>("button, input, select"));
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      if (list.length === 0) return;
      const i = list.indexOf(e.target as HTMLElement);
      const at = i < 0 ? 0 : i;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        list[(at + step + list.length) % list.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list[list.length - 1]?.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="dropdown" id={id} ref={ref}>
      <button
        className={`menu-bar-item${open ? " active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        data-tauri-drag-region="false"
      >
        {label}
      </button>
      {open && (
        <div ref={menuRef} className="dropdown-menu" role="menu" data-tauri-drag-region="false">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A checkmark prefix for the currently-active menu item. */
function Check({ on }: { on: boolean }) {
  return <span className="menu-check" aria-hidden="true">{on ? "✓" : ""}</span>;
}

export function MenuBar({
  panes,
  onOpenSettings,
}: {
  panes: ExportPane[];
  onOpenSettings: () => void;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const nestedInput = useRef<HTMLInputElement>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  const fileName = useStore((s) => s.fileName);
  const recon = useStore((s) => s.recon);
  const themeId = useStore((s) => s.themeId);
  const resolvedThemeId = useStore((s) => s.resolvedThemeId);
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  const renderOptions = useStore((s) => s.renderOptions);
  const loadXml = useStore((s) => s.loadXml);
  const openInNewTab = useStore((s) => s.openInNewTab);
  const openFiles = useStore((s) => s.openFiles);
  const runHeavy = useStore((s) => s.runHeavy);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const loadNestedXml = useStore((s) => s.loadNestedXml);
  const clearNested = useStore((s) => s.clearNested);
  const nestedName = useStore((s) => s.nestedName);
  const compareName = useStore((s) => s.compareName);
  const loadCompareXml = useStore((s) => s.loadCompareXml);
  const clearCompare = useStore((s) => s.clearCompare);
  const setSampleId = useStore((s) => s.setSampleId);
  const setTheme = useStore((s) => s.setTheme);
  const warnings = useStore((s) => s.warnings);
  const geneColors = useStore((s) => s.geneColors);
  const annotations = useStore((s) => s.annotations);
  const showLegend = useStore((s) => s.showLegend);
  const pngDpi = useStore((s) => s.pngDpi);
  const setPngDpi = useStore((s) => s.setPngDpi);
  const applyViewState = useStore((s) => s.applyViewState);
  const showToast = useStore((s) => s.showToast);
  const sessionInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadSampleById = (id: string) => {
    const s = samples.find((x) => x.id === id);
    if (!s) return;
    void runHeavy(() => {
      loadXml(s.xml, t[s.labelKey]);
      if (s.nestedXml)
        loadNestedXml(s.nestedXml, s.nestedLabelKey ? t[s.nestedLabelKey] : "nested");
      if (s.compareXml)
        loadCompareXml(s.compareXml, s.compareLabelKey ? t[s.compareLabelKey] : "compare");
      setSampleId(s.id);
    });
  };

  const onOpenClick = async () => {
    if (isTauri()) {
      try {
        const many = await desktopOpenTextMany();
        if (many.length > 0) openInNewTab(many);
        // The batch does not reject when one file is unreadable, so the names
        // that did fail have to be said out loud or the loss is invisible.
        if (many.failed.length > 0) {
          showToast(
            t.openFailedToast.replace("{names}", many.failed.join(", ")),
            "error",
          );
        }
        return;
      } catch {
        // fall through to the browser file picker
      }
    }
    fileInput.current?.click();
  };

  const onNestedClick = async () => {
    if (isTauri()) {
      try {
        const r = await desktopOpenText();
        if (r) {
          await runHeavy(() => loadNestedXml(r.text, r.name));
        }
        return;
      } catch {
        // fall through to the browser file picker
      }
    }
    nestedInput.current?.click();
  };

  const onCompareClick = async () => {
    if (isTauri()) {
      try {
        const r = await desktopOpenText();
        if (r) {
          await runHeavy(() => loadCompareXml(r.text, r.name));
        }
        return;
      } catch {
        // fall through to the browser file picker
      }
    }
    compareInput.current?.click();
  };

  const saveSession = async () => {
    // One builder for every session writer, shared with crash recovery.
    const data = sessionDataOfStore();
    if (!data) return;
    const text = serializeSession(data);
    const name = `${baseName(data.fileName)}.rpvsession.json`;
    if (isTauri()) {
      try {
        const ok = await desktopSaveText(name, text, "json");
        if (ok) showToast(`${t.savedToast}: ${name}`, "success");
        return;
      } catch {
        // fall through to browser download
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a); // required: an unattached anchor does not
    a.click(); // download in Firefox / Safari
    a.remove();
    showToast(`${t.savedToast}: ${name}`, "success");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const applySessionText = (text: string) => {
    const data = parseSession(text);
    const st = useStore.getState();
    const disposable = (!st.recon && !st.error) || st.sampleId !== null;
    if (!disposable) st.newTab();
    void runHeavy(() => {
      st.loadXml(data.xml, data.fileName ?? "session");
      if (data.nestedXml) st.loadNestedXml(data.nestedXml, data.nestedName ?? "nested");
      if (data.compareXml) st.loadCompareXml(data.compareXml, data.compareName ?? "compare");
      applyViewState({
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
      restoreTabs(data.tabs);
    });
  };

  /** Legend config for ONE pane, derived from that pane's own reconciliation:
   *  in nested/compare splits the panes describe different reconciliations, so
   *  a single shared legend would mislabel the second pane's families. */
  const legendFor = (result: LayoutResult): ExportLegendConfig | null =>
    showLegend
      ? {
          eventsTitle: t.events,
          familiesTitle: t.geneFamilies,
          transferLabel: t.transferLegend,
          families: result.reconciliation.geneTrees.map((gt) => ({
            name: gt.name || `${t.geneTree} ${gt.index + 1}`,
            color: geneColors[gt.index] ?? geneColor(themes[resolvedThemeId], gt.index),
          })),
        }
      : null;

  const buildDoc = (): ExportDoc => {
    return {
      theme: themes[resolvedThemeId],
      eventLabels: t.event,
      legend: null,
      panes: panes.map((p) => ({
        result: p.result,
        options: renderOptions,
        geneColors,
        annotations,
        highlight: p.highlight,
        hideOutside: p.hideOutside ?? null,
        labelOverrides: p.labelOverrides,
        title: p.title,
        legend: legendFor(p.result),
      })),
    };
  };

  /** PNG rasterization clamps to the platform canvas limit; if the requested
   *  DPI could not be honored, say so instead of silently degrading quality. */
  const warnIfPngScaled = (scale: number, requestedDpi = pngDpi): void => {
    const effectiveDpi = Math.round(scale * 96);
    if (effectiveDpi < requestedDpi - 1) {
      showToast(t.pngScaledToast.replace("{dpi}", String(effectiveDpi)), "info");
    }
  };

  /** PDF export is vector unless the converter threw; when it did, the user has
   *  to know the file is a raster, and at what DPI it actually came out. */
  const warnIfPdfRasterized = (rasterized: boolean, scale: number | null): void => {
    if (!rasterized) return;
    showToast(t.pdfRasterToast, "info");
    if (scale !== null) warnIfPngScaled(scale, DEFAULT_PNG_DPI);
  };

  const doExport = async (kind: "svg" | "png" | "pdf") => {
    if (panes.length === 0) return;
    const doc = buildDoc();
    const base = baseName(fileName);
    try {
      setBusy(kind);
      let ok = true;
      if (isTauri()) {
        if (kind === "svg") {
          ok = await desktopSaveText(`${base}.svg`, sceneToSvgString(doc), "svg");
        } else if (kind === "png") {
          const { blob, scale } = await renderPngBlob(doc, pngDpi);
          ok = await desktopSaveBinary(
            `${base}.png`,
            new Uint8Array(await blob.arrayBuffer()),
            "png",
          );
          if (ok) warnIfPngScaled(scale);
        } else {
          const { blob, rasterized, scale } = await renderPdfBlob(doc);
          ok = await desktopSaveBinary(
            `${base}.pdf`,
            new Uint8Array(await blob.arrayBuffer()),
            "pdf",
          );
          if (ok) warnIfPdfRasterized(rasterized, scale);
        }
      } else if (kind === "svg") {
        exportSvg(doc, `${base}.svg`);
      } else if (kind === "png") {
        const { scale } = await exportPng(doc, `${base}.png`, pngDpi);
        warnIfPngScaled(scale);
      } else {
        const { rasterized, scale } = await exportPdf(doc, `${base}.pdf`);
        warnIfPdfRasterized(rasterized, scale);
      }
      if (ok) showToast(`${t.exportedToast}: ${base}.${kind}`, "success");
    } catch (e) {
      showToast(`${t.exportFailed}: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const exportHtml = async () => {
    if (panes.length === 0) return;
    const doc = buildDoc();
    const base = baseName(fileName);
    try {
      setBusy("html");
      const html = sceneToInteractiveHtml(doc, base);
      let ok = true;
      if (isTauri()) {
        ok = await desktopSaveText(`${base}.html`, html, "html");
      } else {
        const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (ok) showToast(`${t.exportedToast}: ${base}.html`, "success");
    } catch (e) {
      showToast(`${t.exportFailed}: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const exportNhx = async () => {
    if (!recon) return;
    const text = reconToNhx(recon);
    const name = `${baseName(fileName)}.nhx`;
    if (isTauri()) {
      try {
        const ok = await desktopSaveText(name, text, "nhx");
        if (ok) showToast(`${t.exportedToast}: ${name}`, "success");
        return;
      } catch {
        // fall through to browser download
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`${t.exportedToast}: ${name}`, "success");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Global shortcuts for file/export actions. A ref keeps the handler stable
  // while always seeing the latest callbacks; text inputs are left untouched.
  const actionsRef = useRef({
    onOpenClick,
    saveSession,
    doExport,
    canExport: panes.length > 0,
  });
  actionsRef.current = {
    onOpenClick,
    saveSession,
    doExport,
    canExport: panes.length > 0,
  };
  useGlobalShortcuts((e) => {
    if (isTextInput(e)) return;
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const a = actionsRef.current;
    const k = e.key.toLowerCase();
    if (k === "o") {
      e.preventDefault();
      void a.onOpenClick();
    } else if (k === "s") {
      e.preventDefault();
      void a.saveSession();
    } else if (k === "e" && a.canExport) {
      e.preventDefault();
      void a.doExport("png");
    }
  });

  const themeOptions: { id: "light" | "dark" | "system"; label: string }[] = [
    { id: "light", label: `${t.lightTheme} ☀` },
    { id: "dark", label: `${t.darkTheme} 🌙` },
    { id: "system", label: `${t.systemTheme} 🖥` },
  ];

  return (
    <>
      <header className="menu-bar" data-tauri-drag-region="deep">
        {/* ---- File menu ---- */}
        <Dropdown label={t.menuFile} ariaLabel={t.menuFile} id="menu-file">
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); void onOpenClick(); }}>
                {t.openFile}
                <span className="menu-shortcut">{modKey}O</span>
              </button>
              <div className="menu-divider" />
              <div className="menu-label">{t.loadSample}</div>
              {samples.map((s) => (
                <button
                  key={s.id}
                  className="menu-item"
                  onClick={() => { close(); loadSampleById(s.id); }}
                >
                  {t[s.labelKey]}
                </button>
              ))}
              <div className="menu-divider" />
              <button className="menu-item" disabled={!(panes.length > 0)} onClick={() => { close(); void saveSession(); }}>
                {t.save}
                <span className="menu-shortcut">{modKey}S</span>
              </button>
              <button className="menu-item" onClick={() => { close(); sessionInput.current?.click(); }}>
                {t.load}
              </button>
              <div className="menu-divider" />
              {nestedName ? (
                <button
                  className="menu-item"
                  title={`${t.nestedRemoveTitle}: ${nestedName}`}
                  onClick={() => { close(); clearNested(); }}
                >
                  {t.nestedPrefix} {nestedName.length > 20 ? nestedName.slice(0, 18) + "…" : nestedName} ✕
                </button>
              ) : (
                <button className="menu-item" title={t.nestedTitle} onClick={() => { close(); void onNestedClick(); }}>
                  {t.nestedLevel}
                </button>
              )}
              {compareName ? (
                <button
                  className="menu-item"
                  title={`${t.compareRemoveTitle}: ${compareName}`}
                  onClick={() => { close(); clearCompare(); }}
                >
                  {t.comparePrefix} {compareName.length > 20 ? compareName.slice(0, 18) + "…" : compareName} ✕
                </button>
              ) : (
                <button className="menu-item" title={t.compareTitle} onClick={() => { close(); void onCompareClick(); }}>
                  {t.compareLevel}
                </button>
              )}
            </>
          )}
        </Dropdown>

        {/* ---- Export menu ---- */}
        <Dropdown
          label={busy ? `${t.exportLabel} …` : t.exportLabel}
          ariaLabel={t.exportLabel}
          title={`${modKey}E`}
          disabled={!(panes.length > 0) || !!busy}
          id="menu-export"
        >
          {(close) => (
            <>
              <div className="menu-label">{t.exportImage}</div>
              <button className="menu-item" onClick={() => { close(); void doExport("png"); }}>
                PNG
              </button>
              <button className="menu-item" onClick={() => { close(); void doExport("svg"); }}>
                SVG
              </button>
              <button className="menu-item" onClick={() => { close(); void doExport("pdf"); }}>
                PDF
              </button>
              <button className="menu-item" onClick={() => { close(); void exportHtml(); }}>
                HTML
              </button>
              <div className="menu-divider" />
              <div className="menu-label">{t.pngResolution}</div>
              <div className="menu-scale">
                {[600, 1200, 2400, 4800].map((sc) => (
                  <button
                    key={sc}
                    className={`menu-scale-btn${pngDpi === sc ? " active" : ""}`}
                    onClick={() => setPngDpi(sc)}
                  >
                    {sc}
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <div className="menu-label">{t.exportData}</div>
              <button
                className="menu-item"
                disabled={!recon}
                onClick={() => { close(); void exportNhx(); }}
              >
                NHX · Newick
              </button>
            </>
          )}
        </Dropdown>

        {/* ---- View menu ---- */}
        <Dropdown label={t.menuView} ariaLabel={t.menuView}>
          {(close) => (
            <>
              <div className="menu-label">{t.menuLanguage}</div>
              <button className="menu-item" onClick={() => { close(); setLocale("zh"); }}>
                <Check on={locale === "zh"} /> 中文
              </button>
              <button className="menu-item" onClick={() => { close(); setLocale("en"); }}>
                <Check on={locale === "en"} /> English
              </button>
              <div className="menu-divider" />
              <div className="menu-label">{t.theme}</div>
              {themeOptions.map((o) => (
                <button
                  key={o.id}
                  className="menu-item"
                  onClick={() => { close(); setTheme(o.id); }}
                >
                  <Check on={themeId === o.id} /> {o.label}
                </button>
              ))}
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => { close(); onOpenSettings(); }}>
                {t.prefsTitle} ⚙
              </button>
            </>
          )}
        </Dropdown>

        {/* ---- Help menu ---- */}
        <Dropdown label={t.helpButton} ariaLabel={t.helpButton}>
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); setHelpOpen(true); }}>
                {t.viewShortcuts}
                <span className="menu-shortcut">?</span>
              </button>
              <button className="menu-item" onClick={() => {
                close();
                setTimeout(() => document.dispatchEvent(new CustomEvent("rpv:replay-tour")), 0);
              }}>
                {t.viewTour}
              </button>
            </>
          )}
        </Dropdown>

        {warnings.length > 0 && (
          <span className="warn-badge" title={warnings.join("\n")}>
            {countLabel(warnings.length, t.warnings)}
          </span>
        )}

        <div className="menu-bar-spacer" data-tauri-drag-region="deep" />

        {/* Hidden file inputs */}
        <input
          ref={fileInput}
          name="open-files"
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
        <input
          ref={nestedInput}
          name="nested-file"
          aria-hidden="true"
          type="file"
          accept=".xml,.recphyloxml,.recphylo,.phyloxml,.nhx,.nwk,.newick"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then((tx) => void runHeavy(() => loadNestedXml(tx, f.name)));
            e.target.value = "";
          }}
        />
        <input
          ref={compareInput}
          name="compare-file"
          aria-hidden="true"
          type="file"
          accept=".xml,.recphyloxml,.recphylo,.phyloxml,.nhx,.nwk,.newick"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then((tx) => void runHeavy(() => loadCompareXml(tx, f.name)));
            e.target.value = "";
          }}
        />
        <input
          ref={sessionInput}
          name="session-file"
          aria-hidden="true"
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void f.text().then((t2) => {
                try {
                  applySessionText(t2);
                } catch (err) {
                  showToast(`${t.loadFailed}: ${(err as Error).message}`, "error");
                }
              });
            e.target.value = "";
          }}
        />
      </header>
    </>
  );
}
