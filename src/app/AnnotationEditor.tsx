import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { useFocusTrap, usePresence } from "./hooks";

/**
 * Modal editor for a per-node user annotation. Opened via Shift-click on a gene
 * node; the note (text + color) is stored globally and saved in the session.
 */
export function AnnotationEditor() {
  const t = useT();
  const annotating = useStore((s) => s.annotating);
  const setAnnotation = useStore((s) => s.setAnnotation);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const setAnnotating = useStore((s) => s.setAnnotating);
  const resolvedThemeId = useStore((s) => s.resolvedThemeId);
  const [text, setText] = useState("");
  const [color, setColor] = useState("#1c2024");
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the editor's last target while the card fades out: the store has
  // already cleared `annotating`, so a null check alone would blank it.
  const lastAnnotating = useRef(annotating);
  if (annotating) lastAnnotating.current = annotating;
  const presence = usePresence(!!annotating);
  useFocusTrap(!!annotating, dialogRef);
  // Draft per node id: closing without saving (backdrop click, Esc) used to
  // THROW AWAY the typed text; the draft survives until the node is re-opened
  // or a note is actually saved for it.
  const drafts = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!annotating) return;
    const cur = useStore.getState().annotations[annotating.id];
    setText(cur?.text ?? drafts.current.get(annotating.id) ?? "");
    const themeDefault = resolvedThemeId === "dark" ? "#edeef0" : "#1c2024";
    setColor(cur?.color ?? themeDefault);
  }, [annotating, resolvedThemeId]);

  if (!presence.mounted || !lastAnnotating.current) return null;
  const target = lastAnnotating.current;
  const existing = useStore.getState().annotations[target.id];
  const id = target.id;

  const closeWithoutSaving = () => {
    if (text.trim() && text.trim() !== (existing?.text ?? "")) {
      drafts.current.set(id, text);
    } else {
      drafts.current.delete(id);
    }
    setAnnotating(null);
  };

  const save = () => {
    drafts.current.delete(id);
    if (text.trim()) setAnnotation(id, text.trim(), color);
    else removeAnnotation(id);
  };

  return (
    <div
      className="anno-overlay"
      data-state={presence.phase}
      onClick={closeWithoutSaving}
      role="dialog"
      aria-modal="true"
      aria-label={t.annoTitle}
    >
      <div className="anno-editor" data-state={presence.phase} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="anno-head">
          {t.annoTitle}: <strong>{target.name}</strong>
        </div>
        <textarea
          className="anno-text"
          value={text}
          placeholder={t.annoPlaceholder}
          autoFocus
          aria-label={t.annoPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            if (e.key === "Escape") closeWithoutSaving();
          }}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <div className="anno-row">
          <label className="anno-color-label">
            {t.annoColor}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <span className="anno-spacer" />
          {existing && (
            <button className="btn ghost" onClick={() => { drafts.current.delete(id); removeAnnotation(id); }}>
              {t.annoRemove}
            </button>
          )}
          <button className="btn ghost" onClick={closeWithoutSaving}>
            {t.annoCancel}
          </button>
          <button className="btn primary" onClick={save}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
