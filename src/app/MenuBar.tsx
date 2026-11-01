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
  buildDocSvg,
  type ExportDoc,
  type ExportLegendConfig,
} from "../export/exporters";
import { reconToRecPhyloXml, nhxExportLosses } from "../export/recPhyloXmlExport";
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
import { restoreSessionData, sessionDataOfStore } from "../state/autosave";
import { useGlobalShortcuts, isTextInput, useFocusTrap } from "./hooks";
import { baseName } from "./export-names";
import { APP_NAME, APP_VERSION } from "../version";

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
  /** Per-node renames (one of several same-named labels). */
  labelOverridesById?: Record<string, string>;
  title?: string;
}

/**
 * A button that opens a small popup menu. Closes on outside click, Escape, or
 * when an item calls the `close` callback passed to the render-prop children.
 * Escape returns focus to the trigger button instead of dropping it on body.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        // Focus must go back to the trigger: it used to fall to <body>, so a
        // keyboard user lost their place in the menu bar.
        triggerRef.current?.focus();
      }
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
        ref={triggerRef}
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

/** A checked menu entry with radio semantics for screen readers. */
function RadioItem({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="menu-item" role="menuitemradio" aria-checked={on} onClick={onClick}>
      <Check on={on} /> {label}
    </button>
  );
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
  const speciesInput = useRef<HTMLInputElement>(null);
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
  const nestedWarnings = useStore((s) => s.nestedWarnings);
  const compareWarnings = useStore((s) => s.compareWarnings);
  const openPanel = useStore((s) => s.openPanel);
  const geneColors = useStore((s) => s.geneColors);
  const annotations = useStore((s) => s.annotations);
  const showLegend = useStore((s) => s.showLegend);
  const pngDpi = useStore((s) => s.pngDpi);
  const setPngDpi = useStore((s) => s.setPngDpi);
  const showToast = useStore((s) => s.showToast);
  const newTab = useStore((s) => s.newTab);
  const closeTab = useStore((s) => s.closeTab);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const externalSpeciesTree = useStore((s) => s.externalSpeciesTree);
  const setExternalSpeciesTree = useStore((s) => s.setExternalSpeciesTree);
  const sessionInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogKind, setDialogKind] = useState<"nhx" | "about" | null>(null);
  const [nhxLosses, setNhxLosses] = useState<string[]>([]);
  const [customDpi, setCustomDpi] = useState<number | null>(null);
  const [background, setBackground] = useState<"theme" | "white" | "transparent">("theme");
  const dlgRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogKind !== null, dlgRef);

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
      useStore.getState().markDocClean();
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
        if (ok) {
          showToast(`${t.savedToast}: ${name}`, "success");
          // Saving IS the clean baseline: the dirty dot and the close
          // confirmation must not keep firing after a successful save.
          useStore.getState().markDocClean();
        }
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
    useStore.getState().markDocClean();
    showToast(`${t.savedToast}: ${name}`, "success");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const applySessionText = (text: string) => {
    const data = parseSession(text);
    const st = useStore.getState();
    const disposable = (!st.recon && !st.error) || st.sampleId !== null;
    if (!disposable) st.newTab();
    void runHeavy(() => {
      // ONE restore path, shared with the startup crash recovery: a menu load
      // that only read `xml` used to silently drop every merged family, the
      // search/filter criteria and the saved tab order.
      restoreSessionData(data);
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
      background:
        background === "transparent" ? null : background === "white" ? "#ffffff" : undefined,
      provenance: {
        application: `${APP_NAME} ${APP_VERSION}`,
        generatedAt: new Date().toISOString(),
        sourceFile: fileName ?? "(unsaved)",
        families: String(recon?.geneTrees.length ?? 0),
        warnings: String(warnings.length),
      },
      panes: panes.map((p) => ({
        result: p.result,
        options: renderOptions,
        geneColors,
        annotations,
        highlight: p.highlight,
        hideOutside: p.hideOutside ?? null,
        labelOverrides: p.labelOverrides,
        labelOverridesById: p.labelOverridesById,
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

  const downloadText = async (name: string, text: string, ext: string, mime: string) => {
    if (isTauri()) {
      try {
        const ok = await desktopSaveText(name, text, ext);
        if (ok) showToast(`${t.exportedToast}: ${name}`, "success");
        return;
      } catch {
        // fall through to browser download
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`${t.exportedToast}: ${name}`, "success");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Copy the current figure (SVG source or a rasterized PNG) to the clipboard
   *  - the "paste into the deck/paper draft" path that used to require a
   *  full export round-trip. Browsers only; the Tauri shell has no clipboard
   *  plugin, so it falls back to the regular export menu. */
  const copyToClipboard = async (kind: "svg" | "png") => {
    if (panes.length === 0) return;
    if (typeof ClipboardItem === "undefined") {
      showToast(t.copyFailed, "error");
      return;
    }
    const doc = buildDoc();
    try {
      if (kind === "svg") {
        const { svg } = buildDocSvg(doc);
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": new Blob([svg], { type: "text/plain" }) }),
        ]);
      } else {
        const { blob } = await renderPngBlob(doc, Math.min(pngDpi, 300));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
      showToast(t.copyOk, "success");
    } catch {
      showToast(t.copyFailed, "error");
    }
  };

  const exportNhxConfirmed = async () => {
    if (!recon) return;
    const text = reconToNhx(recon);
    const name = `${baseName(fileName)}.nhx`;
    await downloadText(name, text, "nhx", "text/plain");
  };

  const exportRecPhylo = async () => {
    if (!recon) return;
    const text = reconToRecPhyloXml(recon);
    const name = `${baseName(fileName)}.recphyloxml`;
    await downloadText(name, text, "recphyloxml", "application/xml");
  };

  // Global shortcuts for file/export actions. A ref keeps the handler stable
  // while always seeing the latest callbacks; text inputs are left untouched.
  const actionsRef = useRef({
    onOpenClick,
    saveSession,
    doExport,
    canExport: panes.length > 0,
    closeActive: () => closeTab(activeTabId),
  });
  actionsRef.current = {
    onOpenClick,
    saveSession,
    doExport,
    canExport: panes.length > 0,
    closeActive: () => closeTab(activeTabId),
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
    } else if (k === "w") {
      e.preventDefault();
      a.closeActive();
    }
  });

  const themeOptions: { id: "light" | "dark" | "system"; label: string }[] = [
    { id: "light", label: `${t.lightTheme} ☀` },
    { id: "dark", label: `${t.darkTheme} 🌙` },
    { id: "system", label: `${t.systemTheme} 🖥` },
  ];

  // Pixel-size estimate for the current PNG DPI, so "600" stops being an
  // abstract multiplier: the user sees the output dimensions before exporting.
  const pixelEstimate = (() => {
    if (panes.length === 0) return null;
    const p = panes[0].result;
    const scale = pngDpi / 96;
    const w = Math.ceil((p.width + 36) * scale);
    const h = Math.ceil((p.height + 36) * scale);
    return `${w}×${h}`;
  })();

  const pasteTree = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast(t.pasteTreeEmpty, "error");
        return;
      }
      openInNewTab([{ name: "pasted-tree.nhx", text }]);
      showToast(t.pasteTreeOk, "success");
    } catch {
      showToast(t.pasteTreeEmpty, "error");
    }
  };

  const totalWarnings = warnings.length + nestedWarnings.length + compareWarnings.length;

  return (
    <>
      <header className="menu-bar" data-tauri-drag-region="deep">
        {/* ---- File menu ---- */}
        <Dropdown label={t.menuFile} ariaLabel={t.menuFile} id="menu-file">
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); newTab(); }}>
                {t.menuNew}
              </button>
              <button className="menu-item" onClick={() => { close(); void onOpenClick(); }}>
                {t.openFile}
                <span className="menu-shortcut">{modKey}O</span>
              </button>
              <button className="menu-item" onClick={() => { close(); void pasteTree(); }}>
                {t.pasteTree}
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
                {t.saveSessionAs}
                <span className="menu-shortcut">{modKey}S</span>
              </button>
              <button className="menu-item" onClick={() => { close(); sessionInput.current?.click(); }}>
                {t.openSession}
              </button>
              <button
                className="menu-item"
                disabled={tabs.length <= 1}
                onClick={() => { close(); closeTab(activeTabId); }}
              >
                {t.closeTabMenu}
                <span className="menu-shortcut">{modKey}W</span>
              </button>
              <div className="menu-divider" />
              {externalSpeciesTree ? (
                <>
                  <div className="menu-label">
                    {t.loadSpeciesTree.replace(/…$/, "")}: {externalSpeciesTree.name}
                  </div>
                  <button
                    className="menu-item"
                    onClick={() => { close(); setExternalSpeciesTree(null); showToast(t.speciesTreeCleared, "info"); }}
                  >
                    {t.speciesTreeCleared} ✕
                  </button>
                </>
              ) : (
                <button
                  className="menu-item"
                  title={t.loadSpeciesTree}
                  onClick={() => { close(); speciesInput.current?.click(); }}
                >
                  {t.loadSpeciesTree}
                </button>
              )}
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
              <button className="menu-item" onClick={() => { close(); void copyToClipboard("svg"); }}>
                {t.copySvg}
              </button>
              <button className="menu-item" onClick={() => { close(); void copyToClipboard("png"); }}>
                {t.copyPng}
              </button>
              <div className="menu-divider" />
              <div className="menu-label">{t.pngResolution}</div>
              <div className="menu-scale">
                <RadioItem on={pngDpi === 192} label={t.pngScreen} onClick={() => setPngDpi(192)} />
                <RadioItem on={pngDpi === 300} label="300 DPI" onClick={() => setPngDpi(300)} />
                <RadioItem on={pngDpi === 600} label="600 DPI" onClick={() => setPngDpi(600)} />
                <RadioItem on={pngDpi === 1200} label="1200 DPI" onClick={() => setPngDpi(1200)} />
                {customDpi != null && (
                  <RadioItem
                    on={pngDpi === customDpi}
                    label={`${customDpi} DPI`}
                    onClick={() => setPngDpi(customDpi)}
                  />
                )}
              </div>
              <div className="menu-scale">
                <input
                  type="number"
                  min={72}
                  max={4800}
                  step={50}
                  aria-label={t.dpiCustomLabel}
                  value={pngDpi}
                  style={{ width: 90 }}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 72) {
                      const dpi = Math.min(4800, Math.round(v));
                      setCustomDpi(dpi);
                      setPngDpi(dpi);
                    }
                  }}
                />
                {pixelEstimate && (
                  <span className="menu-estimate">
                    {t.pixelEstimate
                      .replace("{w}", pixelEstimate.split("×")[0])
                      .replace("{h}", pixelEstimate.split("×")[1])}
                  </span>
                )}
              </div>
              <div className="menu-divider" />
              <div className="menu-label">{t.themeBg}</div>
              <div className="menu-scale">
                <RadioItem on={background === "theme"} label={t.themeBg} onClick={() => setBackground("theme")} />
                <RadioItem on={background === "white"} label={t.whiteBg} onClick={() => setBackground("white")} />
                <RadioItem on={background === "transparent"} label={t.transparentBg} onClick={() => setBackground("transparent")} />
              </div>
              <div className="menu-divider" />
              <div className="menu-label">{t.exportData}</div>
              <button
                className="menu-item"
                disabled={!recon}
                onClick={() => { close(); void runHeavy(() => void exportRecPhylo()); }}
              >
                {t.exportRecPhylo}
              </button>
              <button
                className="menu-item"
                disabled={!recon}
                onClick={() => {
                  close();
                  if (!recon) return;
                  const losses = nhxExportLosses(recon);
                  if (losses.length > 0) {
                    setNhxLosses(losses);
                    setDialogKind("nhx");
                  } else {
                    void exportNhxConfirmed();
                  }
                }}
                title={t.exportNhxExt}
              >
                {t.exportNhxExt}
              </button>
            </>
          )}
        </Dropdown>

        {/* ---- View menu ---- */}
        <Dropdown label={t.menuView} ariaLabel={t.menuView}>
          {(close) => (
            <>
              <div className="menu-label">{t.menuLanguage}</div>
              <RadioItem on={locale === "zh"} label="中文" onClick={() => { close(); setLocale("zh"); }} />
              <RadioItem on={locale === "en"} label="English" onClick={() => { close(); setLocale("en"); }} />
              <div className="menu-divider" />
              <div className="menu-label">{t.theme}</div>
              {themeOptions.map((o) => (
                <RadioItem
                  key={o.id}
                  on={themeId === o.id}
                  label={o.label}
                  onClick={() => { close(); setTheme(o.id); }}
                />
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
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => { close(); setDialogKind("about"); }}>
                {t.aboutTitle}
              </button>
            </>
          )}
        </Dropdown>

        {totalWarnings > 0 && (
          // A real button, not a hover-only span: the warnings used to be
          // reachable ONLY through a title tooltip, which excluded touch,
          // keyboard and screenshots entirely.
          <button
            className="warn-badge"
            onClick={() => openPanel("check")}
            title={t.dataHealth}
            aria-label={`${t.dataHealth}: ${countLabel(totalWarnings, t.warnings)}`}
          >
            {countLabel(totalWarnings, t.warnings)}
          </button>
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
          ref={speciesInput}
          name="species-tree-file"
          aria-hidden="true"
          type="file"
          accept=".nwk,.newick,.nhx,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              void f.text().then((tx) => {
                setExternalSpeciesTree({ name: f.name, text: tx });
                showToast(t.speciesTreeLoaded.replace("{name}", f.name), "success");
              });
            }
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

      {/* NHX export disclosure: the dialect drops real data; the user gets the
          list and a one-click recPhyloXML alternative instead of a silent loss. */}
      {dialogKind === "nhx" && (
        <div className="multi-open" role="dialog" aria-modal="true" aria-label={t.nhxDialectTitle}>
          <div className="multi-open-card" ref={dlgRef}>
            <h3>{t.nhxDialectTitle}</h3>
            <p>{t.nhxLossList}</p>
            <ul className="multi-open-files">
              {nhxLosses.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="multi-open-actions">
              <button
                className="btn ghost"
                onClick={() => { setDialogKind(null); void runHeavy(() => void exportRecPhylo()); }}
              >
                {t.nhxUseRecPhylo}
              </button>
              <button
                className="btn"
                onClick={() => { setDialogKind(null); void exportNhxConfirmed(); }}
              >
                {t.nhxExportAnyway}
              </button>
              <button className="btn ghost" onClick={() => setDialogKind(null)}>
                {t.annoCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About: version + citation + diagnostics, reachable without the repo. */}
      {dialogKind === "about" && (
        <div className="multi-open" role="dialog" aria-modal="true" aria-label={t.aboutTitle}>
          <div className="multi-open-card" ref={dlgRef}>
            <h3>{t.aboutTitle}</h3>
            <p>
              <strong>{APP_NAME}</strong> {t.aboutVersion} {APP_VERSION}
            </p>
            <p className="muted">{t.aboutLicense}</p>
            <p>
              <strong>{t.aboutCitation}:</strong>
              <br />
              Zeng, Z. {APP_NAME} v{APP_VERSION}. https://github.com/ZengZichao/PhyloRecViewer
            </p>
            <div className="multi-open-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  const diag = [
                    `${APP_NAME} ${APP_VERSION}`,
                    `locale: ${locale}`,
                    `document: ${fileName ?? "(none)"}`,
                    `warnings: ${warnings.length}`,
                    `ua: ${navigator.userAgent}`,
                  ].join("\n");
                  void navigator.clipboard?.writeText(diag).then(
                    () => showToast(t.copyOk, "success"),
                    () => showToast(t.copyFailed, "error"),
                  );
                }}
              >
                {t.copyDiagnostics}
              </button>
              <button className="btn" onClick={() => setDialogKind(null)}>
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
