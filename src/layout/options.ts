import type { Reconciliation, TransferEdge } from "../model/types";
import type { Positions } from "./positions";

/** Tunable knobs that control the geometry of a reconciliation drawing. */
export interface LayoutOptions {
  /** Vertical distance (px) between two adjacent species depth levels. */
  levelHeight: number;
  /** Horizontal gap (px) between two gene lanes inside a species band. */
  geneGap: number;
  /** Uniform width (px) of every species tube (constant across all branches). */
  speciesThickness: number;
  /** Horizontal gap (px) between two adjacent species leaf slots. */
  speciesGap: number;
  /** Outer margin (px) around the whole drawing. */
  margin: number;
  /** Align extant species tips to a common baseline (ultrametric-like look). */
  alignTips: boolean;
  /** Species horizontal placement strategy. */
  layoutMode: "rectangular" | "tidy";
  /** Place duplication nodes at the midway point of their species branch. */
  midwayDuplication: boolean;
  /** Scale species depths by branch length (when the input provides lengths). */
  useBranchLengths: boolean;
  /**
   * Font size (px) the rotated species and gene-tip labels are drawn at.
   * The bottom label reservation scales with it: the geometry was calibrated
   * for the renderer's default 12 px labels, so a print render that raises
   * the label size without raising this value clips the longest names off
   * the canvas. Keep it equal to `RenderOptions.speciesLabelStyle.size`.
   */
  labelFontPx: number;
}

export const defaultLayoutOptions: LayoutOptions = {
  levelHeight: 90,
  labelFontPx: 12,
  geneGap: 16,
  speciesThickness: 34,
  speciesGap: 26,
  margin: 48,
  alignTips: true,
  layoutMode: "rectangular",
  midwayDuplication: false,
  useBranchLengths: false,
};

/** Output of a full layout pass. Node coordinates live in `positions` (by id). */
export interface LayoutResult {
  reconciliation: Reconciliation;
  /** Computed geometry, keyed by node id (the model is never mutated). */
  positions: Positions;
  transfers: TransferEdge[];
  width: number;
  height: number;
  options: LayoutOptions;
  /** Gene nodes whose subtree is collapsed (drawn as a triangle). */
  collapsedIds: Set<string>;
  /** Gene nodes hidden because an ancestor is collapsed. */
  hiddenIds: Set<string>;
  /**
   * Whether branch-length scaling actually took effect. False when the option
   * is on but the document has no usable species branch lengths, in which case
   * the layout silently fell back to depth mode - the UI can say so instead of
   * appearing to ignore the toggle.
   */
  branchLengthMode: boolean;
  /**
   * Gene nodes whose `speciesLocation` did not resolve against the species tree.
   * They are drawn in their own column rather than inside a tube, and the UI can
   * mark them as unplaced instead of pretending they are located.
   */
  unplacedGeneIds: Set<string>;
}
