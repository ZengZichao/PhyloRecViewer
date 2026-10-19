import type { EventType } from "../model/types";

/** Visual theme: colors for the canvas, species tubes, text and events. */
export interface Theme {
  id: "light" | "dark";
  name: string;
  background: string;
  panel: string;
  speciesFill: string;
  speciesStroke: string;
  speciesLabel: string;
  text: string;
  muted: string;
  gridline: string;
  /** Categorical palette that separates distinct gene trees by color. */
  genePalette: string[];
  event: Record<EventType, string>;
}

/** User theme preference; "system" follows the OS dark/light setting. */
export type ThemePref = "light" | "dark" | "system";

/**
 * Okabe-Ito colorblind-safe categorical palette (Okabe & Ito 2008,
 * https://jfly.uni-koeln.de/color/) for telling gene families apart.
 * Ordered so the first families get the highest-contrast hues on white
 * (blue/vermillion/green first; yellow and black last).
 *
 * The base set has only eight entries, so eight hues alone would render family
 * 9 exactly like family 1, with nothing but colour to separate them. The list
 * is therefore extended with lightness/saturation variants of the SAME hues:
 * the hue channel keeps a family inside its colourblind-safe group, and the
 * variant separates the 9th..16th families. Family labels are additionally
 * shown as text in the legend and the family filter, so colour is never the
 * only channel.
 */
const OKABE_ITO = [
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#009E73", // bluish green
  "#E69F00", // orange
  "#CC79A7", // reddish purple
  "#56B4E9", // sky blue
  "#F0E442", // yellow
  "#000000", // black
  "#004A73", // blue, dark
  "#8A3B00", // vermillion, dark
  "#00614A", // bluish green, dark
  "#A66F00", // orange, dark
  "#8E4A6F", // reddish purple, dark
  "#2E86C0", // sky blue, deep
  "#B8AF1E", // yellow, olive
  "#52525B", // black, soft
];

/**
 * Lightness-adjusted variants of the same Okabe-Ito hues for dark backgrounds,
 * keeping the colorblind-safe hue ordering while staying legible on dark.
 */
const OKABE_ITO_DARK = [
  "#56B4E9", // sky blue
  "#F5A623", // brightened vermillion/orange
  "#34D399", // brightened bluish green
  "#F0E442", // yellow
  "#D8B4FE", // brightened reddish purple
  "#7DD3FC", // light blue
  "#FDE68A", // light yellow
  "#E2E8F0", // near-white
  "#1D6FA5", // blue, muted for dark ground
  "#C96A1B", // vermillion, deep
  "#1FA97F", // bluish green, saturated
  "#D4A017", // yellow, gold
  "#B07AA1", // reddish purple, muted
  "#A5E3FB", // sky blue, pale
  "#FFF0A6", // yellow, pale
  "#9CA3AF", // grey, mid
];

const eventLight: Record<EventType, string> = {
  speciation: "#2563eb",
  duplication: "#f97316",
  loss: "#9ca3af",
  branchingOut: "#7c3aed",
  bifurcationOut: "#10b981",
  transferBack: "#7c3aed",
  leaf: "#0891b2",
};

const eventDark: Record<EventType, string> = {
  speciation: "#3b82f6",
  duplication: "#fb923c",
  loss: "#9ca3af",
  branchingOut: "#a78bfa",
  bifurcationOut: "#34d399",
  transferBack: "#a78bfa",
  leaf: "#22d3ee",
};

export const lightTheme: Theme = {
  id: "light",
  name: "Light",
  background: "#ffffff",
  panel: "#ffffff",
  speciesFill: "#f4f4f5",
  speciesStroke: "#e4e4e7",
  speciesLabel: "#3f3f46",
  text: "#18181b",
  muted: "#71717a",
  gridline: "#f4f4f5",
  genePalette: OKABE_ITO,
  event: eventLight,
};

export const darkTheme: Theme = {
  id: "dark",
  name: "Dark",
  background: "#18181b",
  panel: "#27272a",
  speciesFill: "#3f3f46",
  speciesStroke: "#52525b",
  speciesLabel: "#d4d4d8",
  text: "#fafafa",
  muted: "#a1a1aa",
  gridline: "#27272a",
  genePalette: OKABE_ITO_DARK,
  event: eventDark,
};

export const themes: Record<Theme["id"], Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

export function geneColor(theme: Theme, treeIndex: number): string {
  return theme.genePalette[treeIndex % theme.genePalette.length];
}

/** Human-readable labels used in the legend and tooltips. */
export const EVENT_LABELS: Record<EventType, string> = {
  speciation: "Speciation",
  duplication: "Duplication",
  loss: "Loss",
  branchingOut: "Transfer (donor)",
  bifurcationOut: "Bifurcation out",
  transferBack: "Transfer (arrival)",
  leaf: "Extant gene",
};
