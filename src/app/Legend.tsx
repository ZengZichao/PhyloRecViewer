import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import type { Reconciliation } from "../model/types";
import { geneColor, type Theme } from "../render/theme";
import { LEGEND_ROWS, type LegendKind } from "../render/legendRows";
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

  // Speciation, the transfer arc and its arrival, and the extant gene are all
  // painted in the FIRST family's colour by Scene.geneGlyph, so their keys carry
  // that colour; the family group below documents the per-family mapping.
  const firstFamilyColor = geneColors[0] ?? geneColor(theme, 0);

  /** The swatch for one row of the shared `LEGEND_ROWS` table. */
  const glyph = (kind: LegendKind): ReactNode => {
    switch (kind) {
      case "speciation":
        return <circle cx={c} cy={c} r={2.5} fill={firstFamilyColor} opacity={0.85} />;
      case "duplication":
        return <rect x={c - 3} y={c - 3} width={6} height={6} rx={1} fill={theme.event.duplication} />;
      case "loss":
        return (
          <g stroke={theme.event.loss} strokeWidth={1.6} strokeLinecap="round">
            <line x1={c - 3} y1={c - 3} x2={c + 3} y2={c + 3} />
            <line x1={c - 3} y1={c + 3} x2={c + 3} y2={c - 3} />
          </g>
        );
      case "transfer":
        return (
          <g>
            <line x1={1} y1={c} x2={s - 1} y2={c} stroke={firstFamilyColor} strokeWidth={1.6} strokeDasharray="1 3" />
            <path d={`M${s - 4},${c - 2} L${s - 1},${c} L${s - 4},${c + 2} Z`} fill={firstFamilyColor} />
          </g>
        );
      case "transferArrival":
        return (
          <g>
            <line x1={1} y1={c} x2={s - 5} y2={c} stroke={firstFamilyColor} strokeWidth={1.6} strokeDasharray="1 3" />
            <path d={`M${s - 8},${c - 3} L${s - 2},${c} L${s - 8},${c + 3} Z`} fill={firstFamilyColor} />
            <circle cx={s - 1} cy={c} r={1.6} fill={firstFamilyColor} />
          </g>
        );
      case "bifurcationOut":
        return <path d={`M${c},${c - 3} L${c + 3},${c} L${c},${c + 3} L${c - 3},${c} Z`} fill={theme.event.bifurcationOut} />;
      case "branchingOut":
        return (
          <circle
            cx={c}
            cy={c}
            r={4}
            fill={theme.background}
            stroke={theme.event.branchingOut}
            strokeWidth={2}
          />
        );
      case "collapsed":
        return <path d={`M${c - 4},${c + 3} L${c},${c - 4} L${c + 4},${c + 3} Z`} fill={theme.muted} />;
      case "leaf":
        return <circle cx={c} cy={c} r={3.5} fill={firstFamilyColor} />;
      case "locate":
        return <circle cx={c} cy={c} r={4.5} fill="none" stroke="var(--locate)" strokeWidth={2} />;
    }
  };

  const familyNames = recon.geneTrees
    .map((gt) => gt.name || `${t.geneTree} ${gt.index + 1}`)
    .join(", ");
  // Read from the same table the rows are drawn from, so the accessible name can
  // never list a different set — or a different order — than the overlay shows.
  const spokenRows = LEGEND_ROWS.map((r) => r.label({ t, events: t.event })).join(", ");

  return (
    <div
      className={`legend${horizontal ? " horizontal" : ""}`}
      aria-label={`${t.events}: ${spokenRows}; ${t.geneFamilies}: ${familyNames}`}
    >
      <button
        className="legend-dir"
        data-tooltip={horizontal ? t.legendVertical : t.legendHorizontal}
        aria-label={horizontal ? t.legendVertical : t.legendHorizontal}
        onClick={() => setHorizontal((h) => !h)}
      >
        {horizontal ? "\u22EE" : "\u22EF"}
      </button>
      <div className="legend-group events">
        <div className="legend-title">{t.events}</div>
        {LEGEND_ROWS.map((row) => (
          <LegendItem key={row.kind} label={row.label({ t, events: t.event })}>
            {glyph(row.kind)}
          </LegendItem>
        ))}
      </div>

      <div className="legend-group">
        <div className="legend-title">{t.geneFamilies}</div>
        {recon.geneTrees.map((tt) => (
          <div className="legend-item" key={tt.index}>
            <input
              type="color"
              className="legend-color"
              name={`legend-color-${tt.index}`}
              aria-label={`${tt.name || `${t.geneTree} ${tt.index + 1}`} · ${t.changeColor}`}
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
