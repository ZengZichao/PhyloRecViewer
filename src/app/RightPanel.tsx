import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { countLabel, formatCount, useT } from "../i18n";
import { localizeDiagnostic, localizeExample } from "../i18nDiagnostics";
import { useStore } from "../state/store";
import { statsToCsv, type TransferPair } from "../analysis/stats";
import { reconHasConfidence, regexError } from "../analysis/focus";
import { checkConsistency, type ConsistencyIssue, type IssueCode } from "../analysis/validate";
import { computeDiff, agreementPct, speciesAgreementPct, type MatchedPair } from "../analysis/compare";
import { desktopSaveText, isTauri } from "../platform/desktop";
import { baseName } from "./export-names";
import { APP_VERSION } from "../version";
import { networkEdgeWidth, transferArc } from "../render/geometry";
import { geneColor, themes, type Theme } from "../render/theme";
import { useCollapsible, useFocusMatches, useStats } from "./hooks";

/**
 * Browser download fallback for CSV export. The desktop build saves via the
 * native dialog in the caller so it can await the result and surface failures
 * instead of swallowing them. The <a> must be attached to the DOM before
 * click() for Firefox to honor the download.
 */
function triggerCsvDownload(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RightPanel({ width }: { width?: number }) {
  const t = useT();
  const open = useStore((s) => s.rightPanelOpen);
  const tab = useStore((s) => s.rightPanelTab);
  const setTab = useStore((s) => s.setRightPanelTab);
  const close = useStore((s) => s.closePanel);
  const recon = useStore((s) => s.recon);
  const compare = useStore((s) => s.compare);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const showToast = useStore((s) => s.showToast);
  // The active tab can become unavailable (the diff tab after the compare
  // layer is cleared): fall back to the first tab instead of a blank panel.
  // Declared BEFORE the early return so hook order stays stable.
  const tabs = [
    { id: "search" as const, label: t.panelSearch },
    { id: "stats" as const, label: t.panelStats },
    { id: "network" as const, label: t.panelNetwork },
    { id: "check" as const, label: t.panelChecks },
    { id: "annotations" as const, label: t.panelAnnotate },
    ...(compare && recon ? [{ id: "diff" as const, label: t.panelDiff }] : []),
  ];
  const activeTab = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;
  useEffect(() => {
    if (open && activeTab !== tab) setTab(activeTab);
  }, [open, activeTab, tab, setTab]);
  if (!open) return null;

  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside className="right-panel" style={width ? { width } : undefined}>
      <div className="right-panel-header">
        <div>
          <span className="sidebar-title">{t.analyze}</span>
        </div>
        <button
          className="panel-collapse"
          onClick={close}
          data-tooltip={`${t.collapse} · ${t.analyze}`}
          aria-label={t.collapse}
        >
          ›
        </button>
      </div>
      <div className="right-panel-tabs" role="tablist">
        {tabs.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            id={`rp-tab-${x.id}`}
            aria-selected={activeTab === x.id}
            aria-controls={`rp-tabpanel-${x.id}`}
            tabIndex={activeTab === x.id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            className={activeTab === x.id ? "active" : ""}
            onClick={() => setTab(x.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div
        className="right-panel-body"
        role="tabpanel"
        id={`rp-tabpanel-${activeTab}`}
        aria-labelledby={`rp-tab-${activeTab}`}
      >
        {!recon ? (
          <div className="rp-empty">{t.analysisEmpty}</div>
        ) : (
          <>
            {activeTab === "search" && <SearchFilterTab />}
            {activeTab === "stats" && <StatsTab onToast={showToast} />}
            {activeTab === "network" && <NetworkTab />}
            {activeTab === "check" && <ChecksTab />}
            {activeTab === "annotations" && <AnnotationsTab />}
            {activeTab === "diff" && compare && <DiffTab />}
          </>
        )}
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------
// Search & filter
// --------------------------------------------------------------------------

function SearchFilterTab() {
  const t = useT();
  const recon = useStore((s) => s.recon);
  const query = useStore((s) => s.searchQuery);
  const regex = useStore((s) => s.searchRegex);
  const eventFilter = useStore((s) => s.eventFilter);
  const familyFilter = useStore((s) => s.familyFilter);
  const onlyMatches = useStore((s) => s.onlyMatches);
  const setOnlyMatches = useStore((s) => s.setOnlyMatches);
  const resolvedThemeId = useStore((s) => s.resolvedThemeId);
  const geneColors = useStore((s) => s.geneColors);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const setSearchRegex = useStore((s) => s.setSearchRegex);
  const toggleEventFilter = useStore((s) => s.toggleEventFilter);
  const toggleFamilyFilter = useStore((s) => s.toggleFamilyFilter);
  const clearSearchFilter = useStore((s) => s.clearSearchFilter);
  const locateGene = useStore((s) => s.locateGene);
  const confidenceMin = useStore((s) => s.confidenceMin);
  const confidenceMax = useStore((s) => s.confidenceMax);
  const setConfidenceRange = useStore((s) => s.setConfidenceRange);
  const [idx, setIdx] = useState(0);
  // Debounce the typed query into the store so each keystroke does not run a
  // full O(N) focusMatches and trigger a whole-scene SVG rebuild.
  const [input, setInput] = useState(query);
  useEffect(() => {
    const id = window.setTimeout(() => setSearchQuery(input), 200);
    return () => window.clearTimeout(id);
  }, [input, setSearchQuery]);
  useEffect(() => setInput(query), [query]);

  // Shared memoised match computation (deduplicated with App.tsx).
  const { matches } = useFocusMatches();
  const list = matches ?? [];
  const hasConfidence = useMemo(() => (recon ? reconHasConfidence(recon) : false), [recon]);
  // Reset the active match index whenever the match set changes (query, regex,
  // event/family/confidence filters), so navigation always restarts from the
  // first match instead of an out-of-range position.
  useEffect(() => setIdx(0), [matches]);

  const go = (delta: number) => {
    if (list.length === 0) return;
    const next = (idx + delta + list.length) % list.length;
    setIdx(next);
    locateGene(list[next].id);
  };

  const events: { key: "speciation" | "duplication" | "loss" | "transfer" | "leaf"; label: string }[] = [
    { key: "speciation", label: t.event.speciation },
    { key: "duplication", label: t.event.duplication },
    { key: "loss", label: t.event.loss },
    { key: "transfer", label: t.transferLegend },
    { key: "leaf", label: t.event.leaf },
  ];

  return (
    <div className="rp-section">
      <div className="rp-search-row">
        <span className="rp-search-icon" aria-hidden="true">🔍</span>
        <input
          className="rp-input"
          type="text"
          name="rp-search"
          aria-label={t.searchPlaceholder}
          value={input}
          placeholder={t.searchPlaceholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // The typed query is debounced into the store; if Enter arrives
            // before that settles, `matches` still reflects the previous text
            // and we would jump to the wrong node. Flush the current input and
            // let the recomputed list drive the next Enter.
            if (input !== query) {
              setSearchQuery(input);
              return;
            }
            go(e.shiftKey ? -1 : 1);
          }}
        />
      </div>
      <label className="rp-check">
        <input type="checkbox" className="toggle" name="rp-regex" aria-label={t.useRegex} checked={regex} onChange={(e) => setSearchRegex(e.target.checked)} />
        <span>{t.useRegex}</span>
      </label>
      <label className="rp-check">
        <input
          type="checkbox"
          className="toggle"
          name="rp-only-match"
          aria-label={t.searchOnlyMatch}
          checked={onlyMatches}
          disabled={matches === null}
          onChange={(e) => setOnlyMatches(e.target.checked)}
        />
        <span>{t.searchOnlyMatch}</span>
      </label>

      {regex && regexError(query) && (
        <p className="rp-issue ex regex-error" role="alert" style={{ color: "var(--danger, #c0392b)", fontSize: 11 }}>
          {t.regexInvalid}
          <br />
          <code>{regexError(query)}</code>
        </p>
      )}

      {matches !== null && (
        <div className="rp-matchbar">
          <span>
            {list.length > 0 ? countLabel(list.length, t.matchCount) : t.noMatches}
          </span>
          <span className="rp-spacer" />
          <button className="btn ghost" disabled={list.length === 0} onClick={() => go(-1)}>
            {t.prevMatch}
          </button>
          <button className="btn ghost" disabled={list.length === 0} onClick={() => go(1)}>
            {t.nextMatch}
          </button>
        </div>
      )}

      {list.length > 0 && (
        <>
          <h4 className="rp-h4">{t.resultsList}</h4>
          <div className="rp-results-list" role="listbox" aria-label={t.resultsList} style={{ maxHeight: 200, overflowY: "auto" }}>
            {list.slice(0, 200).map((g, i) => (
              <button
                key={g.id}
                role="option"
                aria-selected={i === idx}
                className={`rp-result-row${i === idx ? " active" : ""}`}
                onClick={() => {
                  setIdx(i);
                  locateGene(g.id);
                  useStore.getState().setInspector({ kind: "gene", id: g.id });
                }}
                style={{
                  display: "flex", gap: 6, width: "100%", textAlign: "left",
                  padding: "3px 6px", fontSize: 11, cursor: "pointer",
                  border: "none", background: i === idx ? "var(--hover, rgba(127,127,127,0.15))" : "transparent",
                }}
              >
                <span style={{ fontWeight: 600, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.endEvent.geneName || g.name || g.id}
                </span>
                <span style={{ opacity: 0.7 }}>{t.event[g.endEvent.type]}</span>
                <span style={{ opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "40%" }}>
                  {g.speciesId}
                </span>
              </button>
            ))}
            {list.length > 200 && (
              <p className="rp-empty">{t.topOf.replace("{n}", "200").replace("{total}", String(list.length))}</p>
            )}
          </div>
        </>
      )}

      <h4 className="rp-h4">{t.filterEvents}</h4>
      <div className="rp-chips">
        {events.map((ev) => (
          <label key={ev.key} className="rp-chip">
            <input
              type="checkbox"
              className="toggle"
              name={`rp-event-${ev.key}`}
              checked={eventFilter[ev.key]}
              onChange={() => toggleEventFilter(ev.key)}
            />
            <span>{ev.label}</span>
          </label>
        ))}
      </div>

      {recon && recon.geneTrees.length > 1 && (
        <>
          <h4 className="rp-h4">{t.filterFamilies}</h4>
          <div className="rp-fam-list">
            {recon.geneTrees.map((gt) => {
              const checked = familyFilter === null || familyFilter.has(gt.index);
              return (
                <label key={gt.index} className="rp-fam">
                  <input
                    type="checkbox"
                    className="toggle"
                    name={`rp-family-${gt.index}`}
                    checked={checked}
                    onChange={() => toggleFamilyFilter(gt.index)}
                  />
                  <span
                    className="rp-swatch"
                    style={{ background: geneColors[gt.index] ?? geneColor(themes[resolvedThemeId], gt.index) }}
                  />
                  <span className="rp-fam-name">{gt.name || `${t.geneTree} ${gt.index + 1}`}</span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {hasConfidence && (
        <>
          <h4 className="rp-h4">{t.filterConfidence}</h4>
          <div className="rp-conf">
            <label className="rp-conf-row">
              <span>&ge; {confidenceMin.toFixed(2)}</span>
              <input
                type="range"
                name="rp-conf-min"
                min={0}
                max={1}
                step={0.05}
                value={confidenceMin}
                style={{ ["--slider-fill" as string]: `${confidenceMin * 100}%` }}
                onChange={(e) => setConfidenceRange(Math.min(Number(e.target.value), confidenceMax), confidenceMax)}
              />
            </label>
            <label className="rp-conf-row">
              <span>&le; {confidenceMax.toFixed(2)}</span>
              <input
                type="range"
                name="rp-conf-max"
                min={0}
                max={1}
                step={0.05}
                value={confidenceMax}
                style={{ ["--slider-fill" as string]: `${confidenceMax * 100}%` }}
                onChange={(e) => setConfidenceRange(confidenceMin, Math.max(Number(e.target.value), confidenceMin))}
              />
            </label>
          </div>
        </>
      )}

      <button className="btn ghost rp-clear" onClick={clearSearchFilter}>
        {t.clearFilters}
      </button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Collapsible section (right panel)
// --------------------------------------------------------------------------

/** A collapsible section for the right panel, using the same pattern as the
 *  Sidebar's Section: a clickable header with a chevron, remembered in
 *  localStorage. Supports a one-line preview when collapsed (so the section's
 *  value is visible without expanding) and an external `force` override for
 *  "Expand all / Collapse all". */
function RpCollapsible({
  title,
  storageKey,
  defaultOpen = false,
  summary,
  force,
  children,
}: {
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  /** One-line preview shown while collapsed. */
  summary?: string;
  /** External one-shot expand/collapse command (null = no command pending). */
  force?: { mode: "all" | "none"; n: number } | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useCollapsible(storageKey, defaultOpen);
  useEffect(() => {
    // `force` is a command token, not a pinned state: the parent mints a fresh
    // object per button press so this effect re-fires even when the user hits
    // "expand all" a second time after collapsing a section by hand. Keying the
    // effect on a plain "all"/"none" string would make the button one-shot.
    if (!force) return;
    setOpen(force.mode === "all");
  }, [force, setOpen]);
  const isOpen = open;
  return (
    <>
      <button
        className="rp-h4 rp-collapse-head"
        aria-expanded={isOpen}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className="chev" aria-hidden="true">{isOpen ? "\u25BE" : "\u25B8"}</span>
        {title}
      </button>
      {!isOpen && summary ? <div className="rp-collapse-preview">{summary}</div> : null}
      {isOpen && children}
    </>
  );
}

// --------------------------------------------------------------------------
// Statistics
// --------------------------------------------------------------------------

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  const locale = useStore((s) => s.locale);
  return (
    <div className={`rp-stat${accent ? " rp-stat-accent" : ""}`}>
      <div className="rp-stat-value">{formatCount(value, locale)}</div>
      <div className="rp-stat-label">{label}</div>
    </div>
  );
}

/**
 * Integer percentages that always sum to 100 (largest-remainder method), so a
 * composition bar chart never shows 99% or 101% from independent rounding.
 */
function pctPartition(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map((v) => Math.floor(v));
  const rem = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem && k < order.length; k++) out[order[k].i]++;
  return out;
}

/** Compact donut chart for event distribution (saves vertical space vs bars). */
function DonutChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const t = useT();
  const total = items.reduce((s, i) => s + i.value, 0);
  const pct = pctPartition(items.map((i) => i.value));
  const R = 52;
  const r = 30;
  const cx = 60;
  const cy = 60;
  const [hover, setHover] = useState<number | null>(null);
  if (total === 0) return <p className="rp-empty">{t.noEvents}</p>;
  let angle = -Math.PI / 2;
  const arcs = items.map((it, i) => {
    const frac = it.value / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a0);
    const yi0 = cy + r * Math.sin(a0);
    const xi1 = cx + r * Math.cos(a1);
    const yi1 = cy + r * Math.sin(a1);
    let d: string;
    if (frac >= 1 - 1e-6) {
      // A single 100% category: start and end angles coincide, so a normal arc
      // path collapses to nothing (per the SVG spec). Draw a full annulus from
      // two 180-degree halves instead.
      const am = a0 + Math.PI;
      d =
        `M${x0},${y0} A${R},${R} 0 1 1 ${cx + R * Math.cos(am)},${cy + R * Math.sin(am)} ` +
        `A${R},${R} 0 1 1 ${x0},${y0} L${xi0},${yi0} ` +
        `A${r},${r} 0 1 0 ${cx + r * Math.cos(am)},${cy + r * Math.sin(am)} ` +
        `A${r},${r} 0 1 0 ${xi0},${yi0} Z`;
    } else {
      d = `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${r},${r} 0 ${large} 0 ${xi0},${yi0} Z`;
    }
    return { d, it, i, pct: pct[i], frac };
  });
  return (
    <div className="rp-donut-wrap">
      <svg viewBox="0 0 120 120" className="rp-donut" style={{ width: 120, height: 120 }}>
        {arcs.map(({ d, it, i, pct: p }) => (
          <path
            key={it.label}
            d={d}
            fill={it.color}
            opacity={hover === null || hover === i ? 1 : 0.3}
            style={{ cursor: "pointer", transition: "opacity 0.15s", stroke: "var(--panel)", strokeWidth: 1 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{it.label}: {it.value} ({p}%)</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={700} fill="currentColor">
          {hover !== null ? items[hover].value : total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.5}>
          {hover !== null ? items[hover].label : t.donutTotal}
        </text>
      </svg>
      <div className="rp-donut-legend">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`rp-donut-item${hover === i ? " active" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="rp-donut-swatch" style={{ background: it.color }} />
            <span className="rp-donut-label">{it.label}</span>
            <span className="rp-donut-val">{it.value} · {pct[i]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ onToast }: { onToast: (msg: string, kind?: "success" | "error" | "info") => void }) {
  const t = useT();
  const recon = useStore((s) => s.recon);
  const fileName = useStore((s) => s.fileName);
  const theme = themes[useStore((s) => s.resolvedThemeId)];
  const stats = useStats();
  const locateGene = useStore((s) => s.locateGene);
  const [force, setForce] = useState<{ mode: "all" | "none"; n: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear any pending hover-locate timer when the panel unmounts (switching to
  // the compare tab or collapsing the panel), not just on mouse-leave, so the
  // canvas does not jump after this view is gone.
  useEffect(
    () => () => {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
    },
    [],
  );
  if (!recon || !stats) return null;

  const onExport = async () => {
    // Locale-independent columns + BOM: the CSV feeds pipelines, not humans.
    const csv = statsToCsv(stats, {
      sourceFile: fileName,
      generatedBy: `PhyloRecViewer ${APP_VERSION}`,
      generatedAt: new Date().toISOString(),
    });
    const base = baseName(fileName, t.exportDefaultStem);
    const fname = `${base}-stats.csv`;
    if (isTauri()) {
      try {
        const ok = await desktopSaveText(fname, csv, "csv");
        if (ok) onToast(`${t.exportedToast}: ${fname}`, "success");
      } catch (e) {
        onToast(
          `${t.exportFailed}: ${e instanceof Error ? e.message : String(e)}`,
          "error",
        );
      }
      return;
    }
    triggerCsvDownload(fname, csv);
    onToast(`${t.exportedToast}: ${fname}`, "success");
  };

  const topSpecies = stats.perSpecies.slice(0, 25);
  const topTransfers = stats.transferMatrix.slice(0, 25);
  const multiFam = stats.families.length > 1;
  // Cap the node table so a huge reconciliation cannot freeze the panel with a
  // giant DOM table (the species / transfer tables are already capped at 25).
  const NODE_ROW_CAP = 500;
  const nodeRows = stats.nodes.slice(0, NODE_ROW_CAP);

  return (
    <div className="rp-section">
      <div className="rp-toolbar">
        <button className="btn" onClick={() => void onExport()}>
          {t.exportCsv}
        </button>
        <span className="rp-spacer" />
        <button
          className="btn ghost"
          onClick={() => setForce((f) => ({ mode: "all", n: (f?.n ?? 0) + 1 }))}
        >
          {t.expandAll}
        </button>
        <button
          className="btn ghost"
          onClick={() => setForce((f) => ({ mode: "none", n: (f?.n ?? 0) + 1 }))}
        >
          {t.collapseAll}
        </button>
      </div>

      <h4 className="rp-h4">{t.statsTotals}</h4>
      <div className="rp-totals">
        <Stat label={t.nodesCol} value={stats.nodes.length} accent />
        <Stat label={t.nodeLeaf} value={stats.leafCount} accent />
        <Stat label={t.event.speciation} value={stats.total.speciation} />
        <Stat label={t.event.duplication} value={stats.total.duplication} />
        <Stat label={t.event.loss} value={stats.total.loss} />
        <Stat label={t.nodeInternal} value={stats.internalCount} />
        <Stat label={t.transferLegend} value={stats.total.transfer} />
      </div>

      <h4 className="rp-h4">{t.eventDistribution}</h4>
      <DonutChart
        items={[
          { label: t.event.speciation, value: stats.total.speciation, color: theme.event.speciation },
          { label: t.event.duplication, value: stats.total.duplication, color: theme.event.duplication },
          { label: t.event.loss, value: stats.total.loss, color: theme.event.loss },
          { label: t.event.branchingOut, value: stats.total.branchingOut, color: theme.event.branchingOut },
          { label: t.event.bifurcationOut, value: stats.total.bifurcationOut, color: theme.event.bifurcationOut },
          { label: t.event.leaf, value: stats.total.leaf, color: theme.event.leaf },
        ]}
      />
      <p className="rp-note">{t.transferOverlayNote}</p>

      {stats.families.length > 1 && (
        <RpCollapsible
          title={t.statsByFamily}
          storageKey="rpv.rp.fam"
          defaultOpen={false}
          force={force}
          summary={countLabel(stats.families.length, t.geneTreeUnit)}
        >
          <div className="rp-table-wrap"><table className="rp-table">
            <thead>
              <tr>
                <th>{t.inspFamily}</th>
                <th>{t.event.speciation}</th>
                <th>{t.event.duplication}</th>
                <th>{t.event.loss}</th>
                <th>{t.event.branchingOut}</th>
                <th>{t.event.bifurcationOut}</th>
                <th>{t.event.leaf}</th>
              </tr>
            </thead>
            <tbody>
              {stats.families.map((f) => (
                <tr key={f.index}>
                  <td className="rp-td-name">{f.name}</td>
                  <td>{f.counts.speciation}</td>
                  <td>{f.counts.duplication}</td>
                  <td>{f.counts.loss}</td>
                  <td>{f.counts.branchingOut}</td>
                  <td>{f.counts.bifurcationOut}</td>
                  <td>{f.counts.leaf}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </RpCollapsible>
      )}

      <RpCollapsible
        title={t.statsTransferMatrix}
        storageKey="rpv.rp.trans"
        defaultOpen={false}
        force={force}
        summary={
          topTransfers.length === 0
            ? t.noTransfers
            : `${t.topOf.replace("{n}", String(topTransfers.length)).replace("{total}", String(stats.transferMatrix.length))}`
        }
      >
        {topTransfers.length === 0 ? (
          <p className="rp-empty">{t.noTransfers}</p>
        ) : (
          <div className="rp-table-wrap"><table className="rp-table">
          <thead>
            <tr>
              <th>{t.donor}</th>
              <th>{t.recipient}</th>
              <th>{t.countCol}</th>
            </tr>
          </thead>
          <tbody>
            {topTransfers.map((p, i) => (
              <tr key={i}>
                <td className="rp-td-name">{p.from}</td>
                <td className="rp-td-name">{p.to}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        )}
      </RpCollapsible>

      <RpCollapsible
        title={t.statsBySpecies}
        storageKey="rpv.rp.species"
        defaultOpen
        force={force}
        summary={
          topSpecies.length > 0
            ? `${t.topOfSpecies.replace("{n}", String(topSpecies.length)).replace("{total}", String(stats.perSpecies.length))} · ${topSpecies[0].species}: ${countLabel(topSpecies[0].copies, t.copiesCol)}`
            : t.noMatches
        }
      >
        <div className="rp-table-wrap"><table className="rp-table">
        <thead>
          <tr>
            <th scope="col">{t.species}</th>
            <th scope="col">{t.copiesCol}</th>
            <th scope="col">{t.event.speciation}</th>
            <th scope="col">{t.event.duplication}</th>
            <th scope="col">{t.event.loss}</th>
            <th scope="col">{t.event.branchingOut}</th>
            <th scope="col">{t.event.bifurcationOut}</th>
            <th scope="col">{t.event.leaf}</th>
            <th scope="col" title={t.transferLegend}>{t.arrivalsCol}</th>
          </tr>
        </thead>
        <tbody>
          {topSpecies.map((s) => (
            <tr key={s.species}>
              <td className="rp-td-name">{s.species}</td>
              <td>{s.copies}</td>
              <td>{s.counts.speciation}</td>
              <td>{s.counts.duplication}</td>
              <td>{s.counts.loss}</td>
              <td>{s.counts.branchingOut}</td>
              <td>{s.counts.bifurcationOut}</td>
              <td>{s.counts.leaf}</td>
              <td>{s.counts.transfer}</td>
            </tr>
          ))}
          {stats.unassigned.nodes > 0 && (
            <tr>
              <td className="rp-td-name">{t.unknownSpeciesRow}</td>
              <td>0</td>
              <td>{stats.unassigned.counts.speciation}</td>
              <td>{stats.unassigned.counts.duplication}</td>
              <td>{stats.unassigned.counts.loss}</td>
              <td>{stats.unassigned.counts.branchingOut}</td>
              <td>{stats.unassigned.counts.bifurcationOut}</td>
              <td>{stats.unassigned.counts.leaf}</td>
              <td>{stats.unassigned.counts.transfer}</td>
            </tr>
          )}
        </tbody>
      </table></div>
      </RpCollapsible>

      <RpCollapsible
        title={t.statsNodes}
        storageKey="rpv.rp.nodes"
        defaultOpen={false}
        force={force}
        summary={countLabel(stats.nodes.length, t.geneNodes)}
      >
        <div className="rp-table-wrap rp-node-table-wrap"><table className="rp-table rp-node-table">
        <thead>
          <tr>
            <th>{t.colNum}</th>
            <th>{t.colName}</th>
            <th>{t.colType}</th>
            <th>{t.colEvent}</th>
            <th>{t.species}</th>
            {multiFam && <th>{t.geneTree}</th>}
          </tr>
        </thead>
        <tbody>
          {nodeRows.map((n) => (
            <tr
              key={n.num}
              className={hoverId === n.id ? "rp-row-hover" : ""}
              // Click-to-locate: the 300 ms hover auto-locate used to yank the
              // canvas around while the user was just READING the table.
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => {
                locateGene(n.id);
                useStore.getState().setInspector({ kind: "gene", id: n.id });
              }}
              style={{ cursor: "pointer" }}
            >
              <td>{n.num}</td>
              <td className="rp-td-name">{n.name || "\u2014"}</td>
              <td>{n.kind === "leaf" ? t.nodeLeaf : n.kind === "loss" ? t.nodeLoss : t.nodeInternal}</td>
              <td>{t.event[n.event]}</td>
              <td className="rp-td-name">{n.species || "\u2014"}</td>
              {multiFam && <td className="rp-td-name">{n.familyName}</td>}
            </tr>
          ))}
        </tbody>
      </table></div>
      {stats.nodes.length > nodeRows.length && (
        <p className="rp-empty">
          {t.topOf.replace("{n}", String(nodeRows.length)).replace("{total}", String(stats.nodes.length))}
          {" · "}
          {t.statsNodesLimited}
        </p>
      )}
      </RpCollapsible>
    </div>
  );
}

// --------------------------------------------------------------------------
// Transfer network (implemented in NetworkView)
// --------------------------------------------------------------------------

function NetworkTab() {
  const resolvedThemeId = useStore((s) => s.resolvedThemeId);
  const recon = useStore((s) => s.recon);
  const stats = useStats();
  const t = useT();
  if (!stats) return null;
  if (stats.transferMatrix.length === 0) {
    return (
      <div className="rp-section">
        <p className="rp-empty">{t.noTransfers}</p>
      </div>
    );
  }
  return (
    <div className="rp-section">
      <p className="rp-empty">{t.networkHint}</p>
      <p className="rp-note">{t.scopeNote}</p>
      <NetworkView
        matrix={stats.transferMatrix}
        theme={themes[resolvedThemeId]}
        // Ring order follows the SPECIES TREE traversal, not the transfer
        // counts: a count-sorted ring rearranged whenever the data changed and
        // invited reading phylogenetic proximity into pure frequency ranking.
        order={
          recon
            ? recon.species.nodes.map((n) => n.name)
            : undefined
        }
      />
    </div>
  );
}

/**
 * Circular donor -> recipient transfer graph: species on a ring, directed arcs
 * weighted by transfer count. Reveals "hotspot" species at a glance.
 */
function NetworkView({
  matrix,
  theme,
  order,
}: {
  matrix: TransferPair[];
  theme: Theme;
  /** Species-tree DFS order for the ring; species absent from it fall back to
   *  count order after the known ones. */
  order?: string[];
}) {
  const SIZE = 340;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 112;
  const [hover, setHover] = useState<string | null>(null);

  const weight = new Map<string, number>();
  for (const e of matrix) {
    weight.set(e.from, (weight.get(e.from) ?? 0) + e.count);
    weight.set(e.to, (weight.get(e.to) ?? 0) + e.count);
  }
  let nodes = [...weight.keys()];
  if (order && order.length > 0) {
    const known = order.filter((sp) => weight.has(sp));
    const rest = nodes.filter((sp) => !known.includes(sp));
    nodes = [...known, ...rest];
  }
  const n = nodes.length;
  const pos = new Map<string, { x: number; y: number; a: number }>();
  nodes.forEach((sp, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
    pos.set(sp, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a });
  });
  // Edge width and opacity encode the INTEGER number of transfers on that pair
  // as steps (1 transfer -> 1 px, 6 or more -> 6 px) rather than a value
  // normalised by the busiest pair: a normalised width changes meaning whenever
  // another pair appears, so the count would not be readable off the drawing.
  const edgeWidth = networkEdgeWidth;
  const maxW = Math.max(1, ...weight.values());
  const nodeR = (sp: string) => 4 + 8 * ((weight.get(sp) ?? 0) / maxW);
  const dim = (sp: string) => hover !== null && hover !== sp;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", height: "auto" }}>
      <defs>
        <marker id="rpv-net-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.event.transferBack} />
        </marker>
      </defs>
      {matrix.map((e, i) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        const w = edgeWidth(e.count);
        const active = hover === null || hover === e.from || hover === e.to;
        if (e.from === e.to) {
          return (
            <circle
              key={i}
              cx={a.x + 10 * Math.cos(a.a)}
              cy={a.y + 10 * Math.sin(a.a)}
              r={7}
              fill="none"
              stroke={theme.event.transferBack}
              strokeWidth={w}
              opacity={active ? 0.8 : 0.12}
            >
              <title>{`${e.from} \u21ba ${e.count}`}</title>
            </circle>
          );
        }
        // Shorten the chord so the arrowhead lands on the node ring, not center.
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const from = { x: a.x + Math.cos(ang) * nodeR(e.from), y: a.y + Math.sin(ang) * nodeR(e.from) };
        const to = { x: b.x - Math.cos(ang) * (nodeR(e.to) + 5), y: b.y - Math.sin(ang) * (nodeR(e.to) + 5) };
        return (
          <path
            key={i}
            d={transferArc(from, to, 0.18)}
            fill="none"
            stroke={theme.event.transferBack}
            strokeWidth={w}
            strokeLinecap="round"
            markerEnd="url(#rpv-net-arrow)"
            opacity={active ? 0.55 + 0.075 * (w - 1) : 0.1}
          >
            <title>{`${e.from} \u2192 ${e.to}: ${e.count}`}</title>
          </path>
        );
      })}
      {nodes.map((sp) => {
        const p = pos.get(sp)!;
        const anchor = Math.cos(p.a) < -0.3 ? "end" : Math.cos(p.a) > 0.3 ? "start" : "middle";
        const lx = cx + (R + nodeR(sp) + 5) * Math.cos(p.a);
        const ly = cy + (R + nodeR(sp) + 5) * Math.sin(p.a);
        const short = sp.length > 12 ? sp.slice(0, 11) + "\u2026" : sp;
        return (
          <g
            key={sp}
            opacity={dim(sp) ? 0.25 : 1}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(sp)}
            onMouseLeave={() => setHover(null)}
          >
            <circle cx={p.x} cy={p.y} r={nodeR(sp)} fill={theme.event.speciation} stroke={theme.background} strokeWidth={1.2} />
            <text x={lx} y={ly} fontSize={10} fill={theme.text} textAnchor={anchor} dominantBaseline="central">
              {short}
              <title>{sp}</title>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --------------------------------------------------------------------------
// Annotations management
// --------------------------------------------------------------------------

/** Central "notes inbox": every annotation listed with jump/edit/delete, so
 *  managing a note never requires rediscovering its node on the canvas first. */
function AnnotationsTab() {
  const t = useT();
  const annotations = useStore((s) => s.annotations);
  const recon = useStore((s) => s.recon);
  const nested = useStore((s) => s.nested);
  const compare = useStore((s) => s.compare);
  const setAnnotating = useStore((s) => s.setAnnotating);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const locateGene = useStore((s) => s.locateGene);

  // Names resolve across ALL panes: an annotation on a nested/compare node used
  // to display its raw node id because only the primary doc was searched.
  const { nameOf, paneOf } = useMemo(() => {
    const m = new Map<string, string>();
    type PaneName = "primary" | "nested" | "compare";
    const pane = new Map<string, PaneName>();
    const scan = (
      r: NonNullable<typeof recon> | null,
      p: "primary" | "nested" | "compare",
    ): void => {
      if (!r) return;
      for (const tree of r.geneTrees) {
        for (const g of tree.nodes) {
          if (!m.has(g.id)) {
            m.set(g.id, g.name || g.endEvent.geneName || g.id);
            pane.set(g.id, p);
          }
        }
      }
    };
    scan(recon, "primary");
    scan(nested, "nested");
    scan(compare, "compare");
    return { nameOf: m, paneOf: pane };
  }, [recon, nested, compare]);
  if (!recon) return null;

  const paneLabel = (id: string): string =>
    paneOf.get(id) === "nested" ? t.paneSymbiontHost : paneOf.get(id) === "compare" ? t.paneComparison : t.scopePrimary;

  const entries = Object.entries(annotations);
  if (entries.length === 0) {
    return (
      <div className="rp-section">
        <p className="rp-empty">{t.noAnnotations}</p>
      </div>
    );
  }

  return (
    <div className="rp-section">
      {entries.map(([id, ann]) => (
        <div key={id} className="anno-item">
          <span className="anno-swatch" style={{ background: ann.color }} aria-hidden="true" />
          <button
            className="anno-body"
            onClick={() => locateGene(id, paneOf.get(id) ?? "primary")}
            title={t.locateFirst}
          >
            <div className="anno-name">
              {nameOf.get(id) ?? id}
              <span className="ni-pane"> · {paneLabel(id)}</span>
            </div>
            <div className="anno-text">{ann.text}</div>
          </button>
          <button
            className="btn ghost anno-btn"
            data-tooltip={`${t.annoTitle}: ${nameOf.get(id) ?? id}`}
            aria-label={`${t.annoTitle}: ${nameOf.get(id) ?? id}`}
            onClick={() => setAnnotating({ id, name: nameOf.get(id) ?? id })}
          >
            ✎
          </button>
          <button
            className="btn ghost anno-btn"
            data-tooltip={t.annoRemove}
            aria-label={t.annoRemove}
            onClick={() => removeAnnotation(id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Differences (compare mode)
// --------------------------------------------------------------------------

/** Paired comparison table: one row per matched node with BOTH sides' event,
 *  species and transfer details, filterable to the differing rows, exportable
 *  as CSV. The old view listed A and B disagreeing nodes in two separate
 *  columns of "names only", which made "what actually differs" unreadable. */
function DiffTab() {
  const t = useT();
  const recon = useStore((s) => s.recon);
  const compare = useStore((s) => s.compare);
  const fileName = useStore((s) => s.fileName);
  const locateGene = useStore((s) => s.locateGene);
  const showToast = useStore((s) => s.showToast);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const diff = useMemo(
    () => (recon && compare ? computeDiff(recon, compare) : null),
    [recon, compare],
  );
  if (!recon || !compare || !diff) return null;

  const pct = agreementPct(diff);
  const spct = speciesAgreementPct(diff);
  const rows = diff.pairs.filter((p) => !onlyDiff || !p.agreeEvent || !p.agreeSpecies || !p.agreeTransfer);
  const CAP = 300;
  const shown = rows.slice(0, CAP);

  const statusOf = (p: MatchedPair): string => {
    const parts: string[] = [];
    if (!p.agreeEvent) parts.push(t.colEvent);
    if (!p.agreeSpecies) parts.push(t.inspSpecies);
    if (!p.agreeTransfer) parts.push(t.transferLegend);
    return parts.length > 0 ? parts.join("+") : "\u2713";
  };

  const exportCsv = () => {
    const lines = ["name,family,event_a,event_b,species_a,species_b,donor_a,donor_b,recipient_a,recipient_b,time_slice_a,time_slice_b,agree_event,agree_species,agree_transfer"];
    for (const p of diff.pairs) {
      const cell = (v: string | number | boolean | null) => {
        const strV = String(v ?? "");
        return /[",\n]/.test(strV) ? `"${strV.replace(/"/g, '""')}"` : strV;
      };
      lines.push([
        cell(p.name), cell(p.family), cell(p.eventA), cell(p.eventB),
        cell(p.speciesA), cell(p.speciesB), cell(p.donorA ?? ""), cell(p.donorB ?? ""),
        cell(p.recipientA ?? ""), cell(p.recipientB ?? ""),
        cell(p.timeSliceA ?? ""), cell(p.timeSliceB ?? ""),
        cell(p.agreeEvent), cell(p.agreeSpecies), cell(p.agreeTransfer),
      ].join(","));
    }
    const csv = "\uFEFF" + lines.join("\n");
    const fname = `${baseName(fileName, t.exportDefaultStem)}-diff.csv`;
    if (isTauri()) {
      void desktopSaveText(fname, csv, "csv").then(() => showToast(`${t.exportedToast}: ${fname}`, "success"));
    } else {
      triggerCsvDownload(fname, csv);
      showToast(`${t.exportedToast}: ${fname}`, "success");
    }
  };

  return (
    <div className="rp-section">
      <p className="rp-empty">
        {pct === null ? t.notApplicable : `${pct}% ${t.agree}`}
        {spct !== null && ` · ${t.speciesAgreeShort.replace("{p}", String(spct))}`}
        {" · "}
        {t.diffMatched.replace("{n}", String(diff.compared))}
        {" · "}
        {t.diffOnlyA.replace("{n}", String(diff.onlyA))}
        {" · "}
        {t.diffOnlyB.replace("{n}", String(diff.onlyB))}
      </p>
      <div className="rp-toolbar">
        <button className="btn ghost" aria-pressed={onlyDiff} onClick={() => setOnlyDiff((v) => !v)}>
          {t.diffOnlyDiff}
        </button>
        <span className="rp-spacer" />
        <button className="btn" onClick={exportCsv}>
          {t.exportDiffCsv}
        </button>
      </div>
      <div className="rp-table-wrap"><table className="rp-table">
        <thead>
          <tr>
            <th scope="col">{t.colName}</th>
            <th scope="col">{t.colEvent} ({t.paneTagA})</th>
            <th scope="col">{t.colEvent} ({t.paneTagB})</th>
            <th scope="col">{t.inspSpecies} ({t.paneTagA})</th>
            <th scope="col">{t.inspSpecies} ({t.paneTagB})</th>
            <th scope="col">{t.diffColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr
              key={`${p.aId}-${p.bId}`}
              style={{ cursor: "pointer" }}
              onClick={() => {
                locateGene(p.aId, "primary");
                useStore.getState().setInspector({ kind: "gene", id: p.aId });
              }}
            >
              <td className="rp-td-name">{p.name}</td>
              <td style={{ fontWeight: p.agreeEvent ? 400 : 700 }}>{t.event[p.eventA as keyof typeof t.event] ?? p.eventA}</td>
              <td style={{ fontWeight: p.agreeEvent ? 400 : 700 }}>{t.event[p.eventB as keyof typeof t.event] ?? p.eventB}</td>
              <td>{p.speciesA || "\u2014"}</td>
              <td>{p.speciesB || "\u2014"}</td>
              <td>{statusOf(p)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {rows.length > shown.length && (
        <p className="rp-empty">{t.topOf.replace("{n}", String(shown.length)).replace("{total}", String(rows.length))}</p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Consistency checks
// --------------------------------------------------------------------------

function ChecksTab() {
  const t = useT();
  const recon = useStore((s) => s.recon);
  const nested = useStore((s) => s.nested);
  const compare = useStore((s) => s.compare);
  const docWarnings = useStore((s) => s.warnings);
  const locale = useStore((s) => s.locale);
  const nestedWarnings = useStore((s) => s.nestedWarnings);
  const compareWarnings = useStore((s) => s.compareWarnings);
  const nestedName = useStore((s) => s.nestedName);
  const compareName = useStore((s) => s.compareName);
  const fileName = useStore((s) => s.fileName);
  const showToast = useStore((s) => s.showToast);
  const issues = useMemo(() => (recon ? checkConsistency(recon) : []), [recon]);
  const nestedIssues = useMemo(() => (nested ? checkConsistency(nested) : null), [nested]);
  const compareIssues = useMemo(() => (compare ? checkConsistency(compare) : null), [compare]);
  if (!recon) return null;

  const byCode = new Map(issues.map((iss) => [iss.code, iss]));
  const checks: { code: IssueCode; name: string; problem: string }[] = [
    { code: "unknownSpecies", name: t.checkNameUnknownSpecies, problem: t.checkUnknownSpecies },
    { code: "duplicateSpecies", name: t.checkNameDuplicateSpecies, problem: t.checkDuplicateSpecies },
    { code: "noSpecies", name: t.checkNameNoSpecies, problem: t.checkNoSpecies },
    { code: "leafInternalSpecies", name: t.checkNameLeafInternalSpecies, problem: t.checkLeafInternalSpecies },
    { code: "donorNoTransferBack", name: t.checkNameDonorNoTransferBack, problem: t.checkDonorNoTransferBack },
    { code: "transferBackNoParent", name: t.checkNameTransferBackNoParent, problem: t.checkTransferBackNoParent },
    { code: "transferBackNoDonor", name: t.checkNameTransferBackNoDonor, problem: t.checkTransferBackNoDonor },
    { code: "bifurcationNoTransferBack", name: t.checkNameBifurcationNoTransferBack, problem: t.checkBifurcationNoTransferBack },
    { code: "terminalEventWithChildren", name: t.checkNameTerminalEventWithChildren, problem: t.checkTerminalEventWithChildren },
    { code: "nonBinaryNode", name: t.checkNameNonBinaryNode, problem: t.checkNonBinaryNode },
    { code: "transferBackwardsInTime", name: t.checkNameTransferBackwardsInTime, problem: t.checkTransferBackwardsInTime },
    { code: "sameSpeciesTransfer", name: t.checkNameSameSpeciesTransfer, problem: t.checkSameSpeciesTransfer },
    { code: "transferTimeUnknown", name: t.checkNameTransferTimeUnknown, problem: t.checkTransferTimeUnknown },
    { code: "confidenceScaleSuspect", name: t.checkNameConfidenceScaleSuspect, problem: t.checkConfidenceScaleSuspect },
    { code: "negativeBranchLength", name: t.checkNameNegativeBranchLength, problem: t.checkNegativeBranchLength },
    { code: "verticalEdgeAcrossClades", name: t.checkNameVerticalEdgeAcrossClades, problem: t.checkVerticalEdgeAcrossClades },
  ];

  const levelLabel = (lv: string): string =>
    lv === "error" ? t.levelError : lv === "warning" ? t.levelWarning : t.levelInfo;

  // "All checks passed" next to unresolved parser warnings used to promise a
  // clean bill of health the data did not have: the parse warnings now live
  // in the same panel, above the structural checks.
  const warningGroups: { code: string; title: string; items: string[] }[] = [
    { code: "parse_warnings", title: t.parseWarnings, items: docWarnings.map((w) => localizeDiagnostic(w, locale)) },
    {
      code: "nested_warnings",
      title: `${t.nestedWarningsLabel}${nestedName ? ` (${nestedName})` : ""}`,
      items: nestedWarnings.map((w) => localizeDiagnostic(w, locale)),
    },
    {
      code: "compare_warnings",
      title: `${t.compareWarningsLabel}${compareName ? ` (${compareName})` : ""}`,
      items: compareWarnings.map((w) => localizeDiagnostic(w, locale)),
    },
  ].filter((g) => g.items.length > 0);

  // Every reconciliation level that is loaded, so the exported report covers
  // them all: `issues` above is only the primary document, which left the
  // nested (symbiont -> host) layer unchecked.
  const trees: { code: string; name: string; issues: ConsistencyIssue[] }[] = [
    { code: "gene", name: t.paneGeneSymbiont, issues },
    ...(nestedIssues
      ? [{ code: "symbiont", name: `${t.paneSymbiontHost}${nestedName ? ` (${nestedName})` : ""}`, issues: nestedIssues }]
      : []),
    ...(compareIssues
      ? [{ code: "compare", name: compareName ? `${t.comparePrefix} ${compareName}` : t.comparePrefix, issues: compareIssues }]
      : []),
  ];

  const exportQc = () => {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines: string[] = ["tree,level,code,count,examples,node_ids"];
    // A row per check rather than per fired issue: a clean document used to
    // export a header-only CSV, which read as a broken report instead of a
    // passing one. The same catalogue the tab renders keeps both in agreement.
    for (const tr of trees) {
      const codeToIssue = new Map(tr.issues.map((iss) => [iss.code, iss]));
      for (const c of checks) {
        const iss = codeToIssue.get(c.code);
        lines.push(
          [
            cell(tr.code),
            cell(iss ? iss.level : "pass"),
            cell(c.code.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)),
            String(iss?.count ?? 0),
            cell(iss ? iss.examples.join("; ") : ""),
            cell(iss ? iss.nodeIds.join("; ") : ""),
          ].join(","),
        );
      }
    }
    for (const g of warningGroups) {
      for (const w of g.items) {
        lines.push([cell(g.code), cell("warning"), cell("parse_warning"), "1", cell(w), ""].join(","));
      }
    }
    const csv = "\uFEFF" + lines.join("\n");
    const fname = `${baseName(fileName, t.exportDefaultStem)}-qc.csv`;
    if (isTauri()) {
      void desktopSaveText(fname, csv, "csv").then(() => showToast(`${t.exportedToast}: ${fname}`, "success"));
    } else {
      triggerCsvDownload(fname, csv);
      showToast(`${t.exportedToast}: ${fname}`, "success");
    }
  };

  return (
    <div className="rp-section">
      <p className="rp-checks-intro">
        {t.checksIntro}{" "}
        {issues.length === 0 && warningGroups.length === 0 ? (
          <span className="rp-checks-pass">{"\u2713"} {t.checkAllGood}</span>
        ) : (
          <span className="rp-checks-fail">
            {t.checksWithIssues.replace("{n}", formatCount(issues.length, locale)).replace("{m}", formatCount(checks.length, locale))}
            {docWarnings.length + nestedWarnings.length + compareWarnings.length > 0 && t.warningSuffix}
          </span>
        )}
      </p>
      <div className="rp-toolbar">
        <button className="btn" onClick={exportQc}>{t.exportReport}</button>
      </div>

      {warningGroups.map((g, gi) => (
        <RpCollapsible
          key={g.title}
          title={`${g.title} (${g.items.length})`}
          storageKey={`rpv.rp.warn-${gi}`}
          defaultOpen={g.items.length <= 5}
        >
          <ul className="rp-issue-ex" style={{ margin: 0, paddingLeft: 18 }}>
            {g.items.slice(0, 50).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {g.items.length > 50 && <li>{"\u2026"} +{g.items.length - 50}</li>}
          </ul>
        </RpCollapsible>
      ))}

      {checks.map((c) => {
        const iss = byCode.get(c.code);
        if (!iss) {
          return (
            <div key={c.code} className="rp-issue pass">
              <div className="rp-issue-head">
                <span className="rp-check-tick">{"\u2713"}</span>
                <span>{c.name}</span>
              </div>
            </div>
          );
        }
        return (
          <div key={c.code} className={`rp-issue ${iss.level}`}>
            <div className="rp-issue-head">
              <span className="rp-issue-count">{formatCount(iss.count, locale)}</span>
              <span>{c.problem}</span>
              <span className="ni-pane">{levelLabel(iss.level)}</span>
            </div>
            {iss.examples.length > 0 && (
              <div className="rp-issue-ex">
                {iss.nodeIds.length > 0 ? (
                  // The first flagged node is one click away: the examples used
                  // to be dead text, so "known problems" never became "found".
                  <button
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "1px 6px" }}
                    onClick={() => {
                      useStore.getState().setInspector({ kind: "gene", id: iss.nodeIds[0] });
                      useStore.getState().locateGene(iss.nodeIds[0]);
                    }}
                  >
                    {t.locateFirst}: {localizeExample(iss.examples[0], locale)}
                  </button>
                ) : (
                  iss.examples.map((ex) => localizeExample(ex, locale)).join(", ")
                )}
                {iss.count > iss.examples.length ? " \u2026" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
