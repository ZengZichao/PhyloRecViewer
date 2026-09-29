import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { useFocusTrap } from "./hooks";

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
  const [text, setText] = useState("");
  const [color, setColor] = useState("#18181b");
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!annotating, dialogRef);

  useEffect(() => {
    if (!annotating) return;
    const cur = useStore.getState().annotations[annotating.id];
    setText(cur?.text ?? "");
    setColor(cur?.color ?? "#18181b");
  }, [annotating]);

  if (!annotating) return null;
  const existing = useStore.getState().annotations[annotating.id];
  const id = annotating.id;

  const save = () => {
    if (text.trim()) setAnnotation(id, text.trim(), color);
    else removeAnnotation(id);
  };

  return (
    <div className="anno-overlay" onClick={() => setAnnotating(null)} role="dialog" aria-modal="true" aria-label={t.annoTitle}>
      <div className="anno-editor" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="anno-head">
          {t.annoTitle}: <strong>{annotating.name}</strong>
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
            if (e.key === "Escape") setAnnotating(null);
          }}
        />
        <div className="anno-row">
          <label className="anno-color-label">
            {t.annoColor}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <span className="anno-spacer" />
          {existing && (
            <button className="btn ghost" onClick={() => removeAnnotation(id)}>
              {t.annoRemove}
            </button>
          )}
          <button className="btn ghost" onClick={() => setAnnotating(null)}>
            {t.annoCancel}
          </button>
          <button className="btn" onClick={save}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
