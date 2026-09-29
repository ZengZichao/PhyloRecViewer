import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { useFocusTrap } from "./hooks";

/**
 * Modal listing keyboard shortcuts and mouse/touch interactions. Opened from
 * the toolbar "?" button, the empty-state, or by pressing "?"; closed with Esc,
 * the backdrop, or the close button.
 */
export function HelpOverlay() {
  const t = useT();
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  if (!open) return null;

  const rows: { keys: string[]; label: string }[] = [
    { keys: ["⌘/Ctrl", "O"], label: t.openFile },
    { keys: ["⌘/Ctrl", "S"], label: t.save },
    { keys: ["⌘/Ctrl", "E"], label: t.exportLabel },
    { keys: ["⌘/Ctrl", "Z"], label: t.undo },
    { keys: ["⌘/Ctrl", "⇧", "Z"], label: t.redo },
    { keys: ["F"], label: t.helpFit },
    { keys: ["⌘/Ctrl", "+ / −"], label: t.helpZoomInOut },
    { keys: ["Esc"], label: t.helpClosePanel },
  ];

  // The interaction catalogue: the three modifier-click gestures plus pan/zoom
  // and clearing, so hidden-gesture capabilities are documented in one place.
  const gestures: { keys: string[]; label: string }[] = [
    { keys: [t.hintClickHighlight], label: `${t.hintHighlightAction} ${t.geneNodes} · ${t.hintMirror}` },
    { keys: [t.hintShiftAnnotate], label: t.annoTitle },
    { keys: [t.hintAltCollapse], label: `${t.collapsedClade} ${t.collapse}/${t.expand}` },
    { keys: ["⟳", "⇠"], label: t.helpZoomInOut },
    { keys: [t.hintClear], label: t.helpClosePanel },
  ];

  return (
    <div
      className="help-overlay"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={t.helpTitle}
    >
      <div className="help-card" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span className="sidebar-title">{t.helpTitle}</span>
          <button className="panel-collapse" onClick={() => setOpen(false)} data-tooltip={t.collapse} aria-label={t.collapse}>
            ✕
          </button>
        </div>
        <h4>{t.helpKeyboard}</h4>
        <div className="help-list">
          {rows.map((r, i) => (
            <div className="help-row" key={i}>
              <span className="help-keys">
                {r.keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </span>
              <span className="help-label">{r.label}</span>
            </div>
          ))}
        </div>
        <h4>{t.interactionsTitle}</h4>
        <div className="help-list">
          {gestures.map((r, i) => (
            <div className="help-row" key={`g${i}`}>
              <span className="help-keys">
                {r.keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </span>
              <span className="help-label">{r.label}</span>
            </div>
          ))}
        </div>
        <h4>{t.helpMouse}</h4>
        <p className="hint">{t.hint}</p>
        <div className="help-tour-row">
          <button
            className="btn ghost"
            onClick={() => {
              setOpen(false);
              // Re-open the onboarding via a microtask after the overlay closes.
              setTimeout(() => {
                document.dispatchEvent(new CustomEvent("rpv:replay-tour"));
              }, 0);
            }}
          >
            {t.viewTour}
          </button>
        </div>
      </div>
    </div>
  );
}
