import { useRef } from "react";
import { useT } from "../i18n";
import { samples } from "../samples";
import { useStore } from "../state/store";
import { AppLogo } from "./AppLogo";

/**
 * First-run / no-document onboarding hub. Gives the empty screen an actionable
 * starting point: open a file, choose one of the three bundled samples, drag &
 * drop, or view the shortcuts/interactions help.
 *
 * The app logo sits centered at the top; below it are action buttons and the
 * three sample choices arranged vertically (left-aligned within the group, but
 * the group itself is centered in the canvas).
 */
export function EmptyState() {
  const t = useT();
  const openFiles = useStore((s) => s.openFiles);
  const loadXml = useStore((s) => s.loadXml);
  const loadNestedXml = useStore((s) => s.loadNestedXml);
  const loadCompareXml = useStore((s) => s.loadCompareXml);
  const setSampleId = useStore((s) => s.setSampleId);
  const runHeavy = useStore((s) => s.runHeavy);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSample = (s: (typeof samples)[number]) => {
    void runHeavy(() => {
      loadXml(s.xml, t[s.labelKey]);
      if (s.nestedXml)
        loadNestedXml(s.nestedXml, s.nestedLabelKey ? t[s.nestedLabelKey] : "nested");
      if (s.compareXml)
        loadCompareXml(s.compareXml, s.compareLabelKey ? t[s.compareLabelKey] : "compare");
      setSampleId(s.id);
    });
  };

  return (
    <div className="state-panel empty-hub">
      <div className="empty-logo">
        <AppLogo size={88} />
      </div>
      <h2 className="empty-app-name">Phylo<span className="brand-mark">Rec</span>Viewer</h2>
      <p className="muted">{t.emptyBody}</p>

      <div className="empty-actions">
        <button className="btn primary" onClick={() => fileInput.current?.click()}>
          {t.openFile}
        </button>
        <button className="btn" onClick={() => setHelpOpen(true)}>
          {t.viewShortcuts}
        </button>
        <input
          ref={fileInput}
          name="empty-open-files"
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

      <div className="empty-samples">
        <span className="empty-samples-label">{t.emptyOrSample}</span>
        <div className="empty-sample-list">
          {samples.map((s) => (
            <button
              key={s.id}
              className="btn ghost empty-sample-btn"
              onClick={() => loadSample(s)}
            >
              <span className="empty-sample-arrow" aria-hidden="true">▸</span>
              {t[s.labelKey]}
            </button>
          ))}
        </div>
      </div>

      <p className="empty-drag muted">{t.emptyDragHint}</p>
    </div>
  );
}
