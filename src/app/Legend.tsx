import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import type { Reconciliation } from "../model/types";
import { geneColor, type Theme } from "../render/theme";
import { useStore } from "../state/store";

const DIR_KEY = "rpv.legend.dir";

/**
 * Compact, self-explanatory legend rendered as an overlay on the canvas.
 * Two layouts — vertical (default, each group stacks with one item per row)
 * and horizontal (each group — evolutionary events / gene families — flows
 * on a single row) — toggled by the corner button and remembered in
 * localStorage.
 */
export function Legend({
  theme,
  recon,
}: {
  theme: Theme;
  recon: Reconciliation;
}) {
  const t = useT();
  const s = 12;
  const c = s / 2;
  const geneColors = useStore((st) => st.geneColors);
  const setGeneColor = useStore((st) => st.setGeneColor);
  const [horizontal, setHorizontal] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DIR_KEY) === "h";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DIR_KEY, horizontal ? "h" : "v");
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [horizontal]);

  return (
    <div
      className={`legend${horizontal ? " horizontal" : ""}`}
      aria-label={`${t.events}: ${t.event.speciation}, ${t.event.duplication}, ${t.event.loss}, ${t.transferLegend}, ${t.event.branchingOut}, ${t.event.bifurcationOut}, ${t.collapsedClade}, ${t.event.leaf}; ${t.geneFamilies}: ${recon.geneTrees.map((gt) => gt.name || `${t.geneTree} ${gt.index + 1}`).join(", ")}`}
    >
      <button
        className="legend-dir"
        data-tooltip={horizontal ? t.legendVertical : t.legendHorizontal}
        aria-label={horizontal ? t.legendVertical : t.legendHorizontal}
        onClick={() => setHorizontal((h) => !h)}
      >
        {horizontal ? "\u22EE" : "\u22EF"}
      </button>
      <div className="legend-group">
        <div className="legend-title">{t.events}</div>
        <LegendItem label={t.event.speciation}>
          {/* Scene.geneGlyph draws speciation and extant genes in the GENE
              FAMILY colour, not in a fixed event colour; a blue dot for
              speciation would match nothing on screen. Both show the first
              family's colour, and the family group below documents the
              per-family mapping. */}
          <circle cx={c} cy={c} r={2.5} fill={geneColors[0] ?? geneColor(theme, 0)} opacity={0.85} />
        </LegendItem>
        <LegendItem label={t.event.duplication}>
          <rect x={c - 3} y={c - 3} width={6} height={6} rx={1} fill={theme.event.duplication} />
        </LegendItem>
        <LegendItem label={t.event.loss}>
          <g stroke={theme.event.loss} strokeWidth={1.6} strokeLinecap="round">
            <line x1={c - 3} y1={c - 3} x2={c + 3} y2={c + 3} />
            <line x1={c - 3} y1={c + 3} x2={c + 3} y2={c - 3} />
          </g>
        </LegendItem>
        <LegendItem label={t.transferLegend}>
          {/* Arcs and their heads are drawn in the family colour (Scene), so the
              key has to show that colour to decode the figure. */}
          <g>
            <line x1={1} y1={c} x2={s - 1} y2={c} stroke={geneColors[0] ?? geneColor(theme, 0)} strokeWidth={1.6} strokeDasharray="1 3" />
            <path d={`M${s - 4},${c - 2} L${s - 1},${c} L${s - 4},${c + 2} Z`} fill={geneColors[0] ?? geneColor(theme, 0)} />
          </g>
        </LegendItem>
        <LegendItem label={t.event.bifurcationOut}>
          <path d={`M${c},${c - 3} L${c + 3},${c} L${c},${c + 3} L${c - 3},${c} Z`} fill={theme.event.bifurcationOut} />
        </LegendItem>
        {/* The transfer donor is drawn as a hollow ring (Scene.geneGlyph) and a
            collapsed clade as a wedge; without a key here, readers of the
            figure would have no way to decode them. */}
        <LegendItem label={t.event.branchingOut}>
          <circle
            cx={c}
            cy={c}
            r={4}
            fill={theme.background}
            stroke={theme.event.branchingOut}
            strokeWidth={2}
          />
        </LegendItem>
        <LegendItem label={t.collapsedClade}>
          <path d={`M${c - 4},${c + 3} L${c},${c - 4} L${c + 4},${c + 3} Z`} fill={theme.muted} />
        </LegendItem>
        <LegendItem label={t.event.leaf}>
          <circle cx={c} cy={c} r={3.5} fill={geneColors[0] ?? geneColor(theme, 0)} />
        </LegendItem>
      </div>

      <div className="legend-group">
        <div className="legend-title">{t.geneFamilies}</div>
        {recon.geneTrees.map((tt) => (
          <div className="legend-item" key={tt.index}>
            <input
              type="color"
              className="legend-color"
              name={`legend-color-${tt.index}`}
              aria-label={`${tt.name || `${t.geneTree} ${tt.index + 1}`} - ${t.changeColor}`}
              title={t.changeColor}
              value={geneColors[tt.index] ?? geneColor(theme, tt.index)}
              onChange={(e) => setGeneColor(tt.index, e.target.value)}
            />
            <span>{tt.name || `${t.geneTree} ${tt.index + 1}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="legend-item">
      <svg width={14} height={14} viewBox="0 0 12 12" aria-hidden="true">
        {children}
      </svg>
      <span>{label}</span>
    </div>
  );
}
