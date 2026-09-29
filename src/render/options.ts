import type { Orientation } from "./geometry";

/**
 * Typography of one class of text labels. Each label role (species names, gene
 * tip names, internal gene names) carries its own independently-adjustable
 * style so users can tune them separately.
 */
export interface LabelStyle {
  /** Font size in px. */
  size: number;
  bold: boolean;
  italic: boolean;
  /** Rotation in degrees; 0 = horizontal (natural), -90 = reading upward. */
  angle: number;
  /** Extra distance (px) pushing the label away from its node toward the tips. */
  offset: number;
  /** Text alignment; "auto" follows the tree orientation. */
  align: "auto" | "left" | "center" | "right";
}

/**
 * Sensible default rotation for tip labels given the tree orientation: labels
 * read horizontally when the tree grows sideways (root left/right) and are
 * turned upright (-90deg) when it grows vertically (root top/bottom), which
 * keeps dense tips from overlapping.
 */
export function defaultLabelAngle(o: Orientation): number {
  return o === "left" || o === "right" ? 0 : -90;
}

/**
 * Presentation-only knobs (kept separate from geometric LayoutOptions and from
 * the Scene component, so state/session/UI can depend on plain option types
 * without importing the renderer).
 */
export interface RenderOptions {
  curved: boolean;
  geneThickness: number;
  speciesOpacity: number;
  symbolSize: number;
  showGeneLabels: boolean;
  showInternalGeneNames: boolean;
  showSpeciesLabels: boolean;
  /** Draw event glyphs (duplication/loss/transfer/speciation markers). */
  showEvents: boolean;
  /** Draw event confidence/support values next to nodes when present. */
  showSupport: boolean;
  /** Paint species tubes with a subtle gradient. */
  speciesGradient: boolean;
  transferBow: number;
  haloUnderGenes: boolean;
  /** Shade species tubes by the number of gene copies passing through them. */
  copyHeatmap: boolean;
  /** Root placement: which edge the root sits on (leaves grow opposite). */
  orientation: Orientation;
  /** Typography for species (host) tip names. */
  speciesLabelStyle: LabelStyle;
  /** Typography for extant gene tip names. */
  geneTipLabelStyle: LabelStyle;
  /** Typography for internal gene node names. */
  geneInternalLabelStyle: LabelStyle;
}

export const defaultRenderOptions: RenderOptions = {
  curved: true,
  geneThickness: 3.6,
  speciesOpacity: 1,
  symbolSize: 7,
  showGeneLabels: true,
  showInternalGeneNames: false,
  showSpeciesLabels: true,
  showEvents: true,
  showSupport: false,
  speciesGradient: false,
  transferBow: 0.22,
  haloUnderGenes: true,
  copyHeatmap: false,
  orientation: "top",
  // Species names are italic by default (biological nomenclature convention).
  speciesLabelStyle: { size: 12, bold: true, italic: true, angle: -90, offset: 0, align: "auto" },
  geneTipLabelStyle: { size: 11, bold: false, italic: false, angle: -90, offset: 0, align: "auto" },
  geneInternalLabelStyle: { size: 10, bold: false, italic: false, angle: -90, offset: 0, align: "auto" },
};

/**
 * Level of detail for on-screen rendering. Derived from the current zoom so
 * that heavily zoomed-out drawings skip labels/glyphs (both for legibility and
 * performance). Exports always use "full".
 */
export type DetailLevel = "full" | "medium" | "low";

/** Map a zoom scale to a detail level. Thresholds chosen empirically. */
export function detailLevelForZoom(k: number): DetailLevel {
  if (k < 0.16) return "low";
  if (k < 0.42) return "medium";
  return "full";
}
