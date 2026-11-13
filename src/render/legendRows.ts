import type { Dict } from "../i18n";
import type { EventType } from "../model/types";

/**
 * Which glyph a legend row keys.
 *
 * The SAME kinds get drawn twice: once by the on-screen legend overlay
 * (`src/app/Legend.tsx`, one JSX glyph per kind) and once by the exported
 * figure (`src/export/exporters.ts`, `iconEl`, one SVG glyph per kind). Sharing
 * the identifier and this table is what stops a row from existing in one of the
 * two and being missing from the other — docs/STYLE-GUIDE-UI.md §6 requires the
 * exported key and the on-screen key to be word-for-word identical.
 */
export type LegendKind =
  | "speciation"
  | "duplication"
  | "loss"
  | "transfer"
  | "transferArrival"
  | "bifurcationOut"
  | "branchingOut"
  | "collapsed"
  | "leaf"
  | "locate";

/**
 * Kinds that key an outline ONLY the interactive canvas draws. `Scene` renders
 * the locate ring solely from its `locateSet` prop, and no export path passes
 * one (`renderPaneMarkup` renders `Scene` without it), so an exported figure
 * must not key a glyph it can never contain. Listing a kind here removes it from
 * `ExportLegendKind`, which is what makes `iconEl`'s switch stay exhaustive.
 */
export type ScreenOnlyLegendKind = "locate";

/** Kinds an exported figure has to draw a swatch for. */
export type ExportLegendKind = Exclude<LegendKind, ScreenOnlyLegendKind>;

/** Every swatch the exported key can ask for: the exported event rows plus the
 *  gene-family colour chip, which is data rather than an event row and so
 *  stands outside `LEGEND_ROWS`. */
export type LegendSwatch = ExportLegendKind | "family";

const SCREEN_ONLY_KINDS: readonly ScreenOnlyLegendKind[] = ["locate"];

/** Does this kind key a glyph only the interactive canvas draws? */
function isScreenOnlyKind(kind: LegendKind): kind is ScreenOnlyLegendKind {
  return SCREEN_ONLY_KINDS.includes(kind as ScreenOnlyLegendKind);
}

/** The glyph kinds whose colour comes from the FIRST gene family, because
 *  `Scene.geneGlyph` paints them with the family colour rather than with a
 *  fixed event colour. Both legends must agree, or a key shows a hue the
 *  drawing never contains. */
export const FAMILY_COLOURED_KINDS: ReadonlySet<LegendKind> = new Set<LegendKind>([
  "speciation",
  "transfer",
  "transferArrival",
  "leaf",
]);

/** The words a legend row is allowed to use: the live dictionary plus the
 *  event-type names. An export may pass its own event names per document, but
 *  they always come from a dictionary — never from a hard-coded English string
 *  (STYLE §5.3). */
export interface LegendStrings {
  t: Dict;
  events: Record<EventType, string>;
}

export interface LegendRow {
  kind: LegendKind;
  /** Resolves the row's label verbatim from a dictionary. */
  label: (s: LegendStrings) => string;
}

/**
 * The complete, ordered row set of the legend — the single source of truth for
 * both renderings. The order is the reading order of the on-screen overlay and
 * therefore also the order of the exported key.
 */
export const LEGEND_ROWS: readonly LegendRow[] = [
  // Speciation and the extant gene are painted in the family colour (see
  // FAMILY_COLOURED_KINDS); a fixed blue dot would match nothing on screen.
  { kind: "speciation", label: ({ events }) => events.speciation },
  { kind: "duplication", label: ({ events }) => events.duplication },
  { kind: "loss", label: ({ events }) => events.loss },
  // The arc of a transfer, from donor to recipient.
  { kind: "transfer", label: ({ t }) => t.transferLegend },
  // The recipient end of a transfer is the arrowhead landing on a gene lineage,
  // not the arc itself — readers need both ends keyed.
  { kind: "transferArrival", label: ({ events }) => events.transferBack },
  { kind: "bifurcationOut", label: ({ events }) => events.bifurcationOut },
  // The transfer donor is drawn as a hollow ring and a collapsed clade as a
  // wedge; without a key here, a reader of the figure could not decode them.
  { kind: "branchingOut", label: ({ events }) => events.branchingOut },
  { kind: "collapsed", label: ({ t }) => t.collapsedClade },
  { kind: "leaf", label: ({ events }) => events.leaf },
  // The outline a search hit or a data-check "locate" leaves behind: an
  // interactive-only affordance, so it is listed in ScreenOnlyLegendKind.
  { kind: "locate", label: ({ t }) => t.legendLocate },
];

/** Every row of the table, labelled for the on-screen overlay. */
export function screenLegendRows(s: LegendStrings): string[] {
  return LEGEND_ROWS.map((row) => row.label(s));
}

/** The rows an exported figure keys: the table in the same order, minus the
 *  glyphs the export cannot contain. */
export function exportLegendRowDefs(s: LegendStrings): { kind: ExportLegendKind; label: string }[] {
  const rows: { kind: ExportLegendKind; label: string }[] = [];
  for (const row of LEGEND_ROWS) {
    const kind: LegendKind = row.kind;
    if (isScreenOnlyKind(kind)) continue;
    rows.push({ kind, label: row.label(s) });
  }
  return rows;
}

/** Labels of `exportLegendRowDefs`, for assertions. */
export function exportLegendRows(s: LegendStrings): string[] {
  return exportLegendRowDefs(s).map((r) => r.label);
}
