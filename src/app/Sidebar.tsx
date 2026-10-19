import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useT } from "../i18n";
import type { LabelStyle } from "../render/options";
import { defaultLayoutOptions } from "../layout";
import { defaultRenderOptions } from "../render/options";
import type { Orientation } from "../render/geometry";
import { useStore } from "../state/store";
import { useCollapsible, useFocusTrap, usePinned } from "./hooks";

/**
 * A labelled control row. The label text is programmatically associated with
 * the wrapped control (aria-label) so screen readers announce what each
 * slider / switch / select controls.
 */
function Row({ label, title, children }: { label: string; title?: string; children: ReactElement }) {
  const labelled = cloneElement(children, {
    ariaLabel: children.props["aria-label"] ?? label,
  });
  return (
    <label className="control-row" title={title}>
      <span className="control-label">{label}</span>
      {labelled}
    </label>
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
}) {
  const id = useId();
  // Drive the thumb from local state and commit to the store at most once per
  // animation frame, so dragging a slider does not fire a full O(N) relayout +
  // SVG rebuild on every pointer event. External changes (session load / reset)
  // are adopted, but the echo of our own commit is ignored to avoid a jump.
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const raf = useRef<number | null>(null);
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) setLocal(value);
  }, [value]);
  // Keep the latest onChange in a ref so the unmount flush below calls the
  // handler the component was last given rather than a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pendingRef.current === null) return;
      const pending = pendingRef.current;
      pendingRef.current = null;
      // A drag that ends because the component unmounted must not cancel its
      // queued frame and lose the value the user had just set: flush it.
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (pending !== committed.current) {
        committed.current = pending;
        onChangeRef.current(pending);
      }
    },
    [],
  );
  const commit = (v: number): void => {
    const clamped = Math.max(min, Math.min(max, v));
    setLocal(clamped);
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    pendingRef.current = clamped;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      pendingRef.current = null;
      committed.current = clamped;
      onChange(clamped);
    });
  };
  // Commit the typed draft when the user presses Enter or blurs the input.
  const commitDraft = () => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) commit(parsed);
    else setDraft(String(local));
    setEditing(false);
  };
  return (
    <span className="slider-wrap">
      <input
        id={id}
        name={id}
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => commit(Number(e.target.value))}
        style={{
          ["--slider-fill" as string]: `${
            ((local - min) / (max - min)) * 100
          }%`,
        }}
      />
      {editing ? (
        <input
          className="slider-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={`${ariaLabel} value`}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            else if (e.key === "Escape") { setDraft(String(local)); setEditing(false); }
          }}
        />
      ) : (
        <button
          className="slider-value"
          type="button"
          aria-label={`${ariaLabel}: ${local}`}
          onClick={() => { setDraft(String(local)); setEditing(true); }}
        >
          {local}
        </button>
      )}
    </span>
  );
}

/** Apple HIG style Switch for on/off state toggles (legend, minimap, etc.). */
function Switch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <input
      id={id}
      name={id}
      type="checkbox"
      role="switch"
      className="switch"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <select
      id={id}
      name={id}
      className="select"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Size / weight / slant / rotation controls for one class of text labels. */
function LabelStyleControls({
  style,
  onChange,
}: {
  style: LabelStyle;
  onChange: (patch: Partial<LabelStyle>) => void;
}) {
  const t = useT();
  const boldId = useId();
  const italicId = useId();
  return (
    <div className="label-style">
      <Row label={t.labelSize}>
        <Slider value={style.size} min={6} max={28} onChange={(v) => onChange({ size: v })} />
      </Row>
      <Row label={t.labelAngle}>
        <Slider value={style.angle} min={-90} max={90} step={5} onChange={(v) => onChange({ angle: v })} />
      </Row>
      <Row label={t.labelOffset}>
        <Slider value={style.offset} min={-40} max={140} step={2} onChange={(v) => onChange({ offset: v })} />
      </Row>
      <Row label={t.labelAlign}>
        <Select
          value={style.align ?? "auto"}
          onChange={(v) => onChange({ align: v })}
          options={[
            { value: "auto" as const, label: t.alignAuto },
            { value: "left" as const, label: t.alignLeft },
            { value: "center" as const, label: t.alignCenter },
            { value: "right" as const, label: t.alignRight },
          ]}
        />
      </Row>
      <div className="label-style-flags">
        <label className="flag">
          <input
            id={boldId}
            name={boldId}
            type="checkbox"
            className="toggle"
            aria-label={`${t.labelBold}: ${t.speciesNames}`}
            checked={style.bold}
            onChange={(e) => onChange({ bold: e.target.checked })}
          />
          <span>{t.labelBold}</span>
        </label>
        <label className="flag">
          <input
            id={italicId}
            name={italicId}
            type="checkbox"
            className="toggle"
            aria-label={`${t.labelItalic}: ${t.speciesNames}`}
            checked={style.italic}
            onChange={(e) => onChange({ italic: e.target.checked })}
          />
          <span>{t.labelItalic}</span>
        </label>
      </div>
    </div>
  );
}

/** A titled sidebar panel whose body collapses; open state is remembered.
 *  A pin button (shown on the right of the header) forces the section to stay
 *  open: while pinned, clicking the header does not collapse it. */
function Section({
  title,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useCollapsible(storageKey, defaultOpen);
  const [pinned, setPinned] = usePinned(storageKey);
  const isOpen = pinned || open;
  return (
    <section className={`panel${pinned ? " pinned" : ""}`}>
      <div className="panel-head-row">
        <button
          className="panel-head"
          aria-expanded={isOpen}
          onClick={() => {
            // A pinned section cannot be collapsed from the header; unpin first.
            if (pinned) return;
            setOpen((o) => !o);
          }}
        >
          <span className="chev" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
          <h3>{title}</h3>
        </button>
        <button
          className={`panel-pin${pinned ? " active" : ""}`}
          data-tooltip={pinned ? t.unpinOpen : t.pinOpen}
          aria-label={pinned ? t.unpinOpen : t.pinOpen}
          aria-pressed={pinned}
          onClick={() => setPinned((p) => !p)}
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14l-4.5-8V2H5v7z" />
          </svg>
        </button>
      </div>
      {isOpen && <div className="panel-body">{children}</div>}
    </section>
  );
}

/** Root-direction icons: four directions (top / bottom / left / right). */
const ORIENTATION_ICONS: Record<Orientation, ReactElement> = {
  top: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
      <path d="M12 6.2 V11 M12 11 L6 17 M12 11 L18 17" />
    </svg>
  ),
  bottom: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="19.5" r="1.7" fill="currentColor" stroke="none" />
      <path d="M12 17.8 V13 M12 13 L6 7 M12 13 L18 7" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M6.2 12 H11 M11 12 L17 6 M11 12 L17 18" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="19.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M17.8 12 H13 M13 12 L7 6 M13 12 L7 18" />
    </svg>
  ),
};

export function Sidebar({ width }: { width?: number }) {
  const t = useT();
  const layoutOptions = useStore((s) => s.layoutOptions);
  const renderOptions = useStore((s) => s.renderOptions);
  const setLayout = useStore((s) => s.setLayout);
  const setRender = useStore((s) => s.setRender);
  const optimizeSwaps = useStore((s) => s.optimizeSwaps);
  const clearSwaps = useStore((s) => s.clearSwaps);
  const minimap = useStore((s) => s.minimap);
  const setMinimap = useStore((s) => s.setMinimap);
  const showLegend = useStore((s) => s.showLegend);
  const setShowLegend = useStore((s) => s.setShowLegend);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const applyViewState = useStore((s) => s.applyViewState);
  const labelOverrides = useStore((s) => s.labelOverrides);
  const clearLabelOverrides = useStore((s) => s.clearLabelOverrides);
  const showToast = useStore((s) => s.showToast);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const resetAll = () => {
    applyViewState({
      layoutOptions: { ...defaultLayoutOptions },
      renderOptions: { ...defaultRenderOptions },
      // Resetting the sliders must not discard the tab's earlier swap /
      // collapse / annotation undo steps.
      resetHistory: false,
    });
  };

  return (
    <>
    <aside className="sidebar" style={width ? { width } : undefined}>
      <div className="sidebar-header">
        <div>
          <span className="sidebar-title">{t.controlsPanel}</span>
        </div>
        <button
          className="panel-collapse"
          onClick={() => setSidebarOpen(false)}
          data-tooltip={`${t.collapse} · ${t.controlsPanel}`}
          aria-label={t.collapse}
        >
          ‹
        </button>
      </div>
      {/* Actions: view toggles (legend / minimap) + arrange actions, grouped
          together so the sidebar keeps a single consistent accordion
          structure. */}
      <Section title={t.layoutActions} storageKey="rpv.sec.actions" defaultOpen={false}>
        <button className="btn primary" title={t.reduceCrossingsTitle} onClick={optimizeSwaps}>
          {t.reduceCrossings}
        </button>
        <button className="btn ghost" onClick={clearSwaps}>
          {t.resetSwaps}
        </button>
        <button className="btn ghost" title={t.resetAllTitle} onClick={resetAll}>
          {t.resetAll}
        </button>
      </Section>

      <Section title={t.layoutParams} storageKey="rpv.sec.layout" defaultOpen={false}>
        <Row label={t.includeLegend} title={t.includeLegendTitle}>
          <Switch checked={showLegend} onChange={setShowLegend} />
        </Row>
        <Row label={t.minimap}>
          <Switch checked={minimap} onChange={setMinimap} />
        </Row>
        <div className="side-divider" />
        <div className="control-row" title={t.orientation}>
          <span className="control-label">{t.orientation}</span>
          <span className="orient-grid" role="radiogroup" aria-label={t.orientation}>
            {(Object.keys(ORIENTATION_ICONS) as Orientation[]).map((o) => {
              const label =
                o === "top"
                  ? t.orientTop
                  : o === "bottom"
                    ? t.orientBottom
                    : o === "left"
                      ? t.orientLeft
                      : t.orientRight;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  className={`orient-btn${renderOptions.orientation === o ? " active" : ""}`}
                  aria-checked={renderOptions.orientation === o}
                  data-tooltip={label}
                  aria-label={label}
                  onClick={() => setRender({ orientation: o })}
                >
                  {ORIENTATION_ICONS[o]}
                </button>
              );
            })}
          </span>
        </div>
        <Row label={t.levelHeight}>
          <Slider value={layoutOptions.levelHeight} min={40} max={220} onChange={(v) => setLayout({ levelHeight: v })} />
        </Row>
        <Row label={t.geneSpacing}>
          <Slider value={layoutOptions.geneGap} min={8} max={42} onChange={(v) => setLayout({ geneGap: v })} />
        </Row>
        <Row label={t.speciesSpacing}>
          <Slider value={layoutOptions.speciesGap} min={8} max={70} onChange={(v) => setLayout({ speciesGap: v })} />
        </Row>
        <Row label={t.speciesWidth}>
          <Slider value={layoutOptions.speciesThickness} min={12} max={80} onChange={(v) => setLayout({ speciesThickness: v })} />
        </Row>
        <Row label={t.geneThickness}>
          <Slider value={renderOptions.geneThickness} min={1} max={5} step={0.2} onChange={(v) => setRender({ geneThickness: v })} />
        </Row>
        <Row label={t.alignTips}>
          <Switch checked={layoutOptions.alignTips} onChange={(v) => setLayout({ alignTips: v })} />
        </Row>
        <Row label={t.branchLengths}>
          <Switch checked={layoutOptions.useBranchLengths} onChange={(v) => setLayout({ useBranchLengths: v })} />
        </Row>
        <Row label={t.compactTidy} title={t.compactTidyTitle}>
          <Switch
            checked={layoutOptions.layoutMode === "tidy"}
            onChange={(v) => setLayout({ layoutMode: v ? "tidy" : "rectangular" })}
          />
        </Row>
        <Row label={t.midwayDup} title={t.midwayDupTitle}>
          <Switch checked={layoutOptions.midwayDuplication} onChange={(v) => setLayout({ midwayDuplication: v })} />
        </Row>
      </Section>

      <Section title={t.style} storageKey="rpv.sec.style" defaultOpen={false}>
        <Row label={t.curvedBranches}>
          <Switch checked={renderOptions.curved} onChange={(v) => setRender({ curved: v })} />
        </Row>
        <Row label={t.symbolSize}>
          <Slider value={renderOptions.symbolSize} min={4} max={16} onChange={(v) => setRender({ symbolSize: v })} />
        </Row>
        <Row label={t.transferCurve}>
          <Slider value={renderOptions.transferBow} min={0} max={0.5} step={0.02} onChange={(v) => setRender({ transferBow: v })} />
        </Row>
        <Row label={t.haloUnderGenes}>
          <Switch checked={renderOptions.haloUnderGenes} onChange={(v) => setRender({ haloUnderGenes: v })} />
        </Row>
        <Row label={t.eventGlyphs}>
          <Switch checked={renderOptions.showEvents} onChange={(v) => setRender({ showEvents: v })} />
        </Row>
        <Row label={t.supportValues}>
          <Switch checked={renderOptions.showSupport} onChange={(v) => setRender({ showSupport: v })} />
        </Row>
        <Row label={t.tubeGradient}>
          <Switch checked={renderOptions.speciesGradient} onChange={(v) => setRender({ speciesGradient: v })} />
        </Row>
        <Row label={t.copyHeatmap}>
          <Switch checked={renderOptions.copyHeatmap} onChange={(v) => setRender({ copyHeatmap: v })} />
        </Row>
      </Section>

      <Section title={t.labelsSection} storageKey="rpv.sec.labels" defaultOpen={false}>
        <Row label={t.speciesNames}>
          <Switch checked={renderOptions.showSpeciesLabels} onChange={(v) => setRender({ showSpeciesLabels: v })} />
        </Row>
        {renderOptions.showSpeciesLabels && (
          <LabelStyleControls
            style={renderOptions.speciesLabelStyle}
            onChange={(patch) =>
              setRender({ speciesLabelStyle: { ...renderOptions.speciesLabelStyle, ...patch } })
            }
          />
        )}
        <Row label={t.geneTipNames}>
          <Switch checked={renderOptions.showGeneLabels} onChange={(v) => setRender({ showGeneLabels: v })} />
        </Row>
        {renderOptions.showGeneLabels && (
          <LabelStyleControls
            style={renderOptions.geneTipLabelStyle}
            onChange={(patch) =>
              setRender({ geneTipLabelStyle: { ...renderOptions.geneTipLabelStyle, ...patch } })
            }
          />
        )}
        <Row label={t.internalGeneNames}>
          <Switch checked={renderOptions.showInternalGeneNames} onChange={(v) => setRender({ showInternalGeneNames: v })} />
        </Row>
        {renderOptions.showInternalGeneNames && (
          <LabelStyleControls
            style={renderOptions.geneInternalLabelStyle}
            onChange={(patch) =>
              setRender({ geneInternalLabelStyle: { ...renderOptions.geneInternalLabelStyle, ...patch } })
            }
          />
        )}
        <div className="side-divider" />
        <button className="btn ghost" onClick={() => setShowRenameDialog(true)}>
          {t.renameLabels}
        </button>
        {Object.keys(labelOverrides).length > 0 && (
          <button
            className="btn ghost"
            onClick={() => {
              clearLabelOverrides();
              showToast(t.labelResetToast, "info");
            }}
          >
            {t.renameReset}
          </button>
        )}
        <p className="hint">{t.renameHint}</p>
      </Section>

      <div className="tips">
        <div className="tips-title">{t.tipsTitle}</div>
        <ul className="tips-list">
          {t.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    </aside>
    {showRenameDialog && <LabelReplaceDialog onClose={() => setShowRenameDialog(false)} />}
    </>
  );
}

/**
 * Batch find-and-replace dialog for species / gene labels.
 * Supports plain-text and regex modes, with a scope selector.
 */
function LabelReplaceDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [scope, setScope] = useState<"species" | "gene" | "all">("all");
  const batchReplaceLabels = useStore((s) => s.batchReplaceLabels);
  const showToast = useStore((s) => s.showToast);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = () => {
    if (!find) return;
    try {
      // Validate regex before calling the store so we can show a friendly error.
      if (useRegex) new RegExp(find, "g");
      batchReplaceLabels(find, replace, useRegex, scope);
      showToast(t.labelEditedToast, "success");
      onClose();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const findId = useId();
  const replaceId = useId();

  return (
    <div className="anno-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={t.renameLabels}>
      <div className="anno-editor label-rename-dialog" ref={dialogRef}>
        <div className="anno-head">
          <strong>{t.renameLabels}</strong>
        </div>
        <div className="label-rename-field">
          <label htmlFor={findId}>{t.findLabel}</label>
          <input
            id={findId}
            type="text"
            value={find}
            autoFocus
            placeholder={useRegex ? "pattern…" : ""}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && find) apply(); }}
          />
        </div>
        <div className="label-rename-field">
          <label htmlFor={replaceId}>{t.replaceWith}</label>
          <input
            id={replaceId}
            type="text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && find) apply(); }}
          />
        </div>
        <label className="rp-check">
          <input
            type="checkbox"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
          />
          {t.useRegex}
        </label>
        <div className="label-rename-field">
          <label>{t.renameScope}</label>
          <div className="label-rename-scope">
            <button
              type="button"
              className={scope === "species" ? "active" : ""}
              onClick={() => setScope("species")}
            >
              {t.scopeSpecies}
            </button>
            <button
              type="button"
              className={scope === "gene" ? "active" : ""}
              onClick={() => setScope("gene")}
            >
              {t.scopeGenes}
            </button>
            <button
              type="button"
              className={scope === "all" ? "active" : ""}
              onClick={() => setScope("all")}
            >
              {t.scopeAll}
            </button>
          </div>
        </div>
        <div className="anno-row">
          <span className="anno-spacer" />
          <button className="btn ghost" onClick={onClose}>
            {t.annoCancel}
          </button>
          <button
            className="btn primary"
            disabled={!find}
            onClick={apply}
          >
            {t.renameApply}
          </button>
        </div>
      </div>
    </div>
  );
}
