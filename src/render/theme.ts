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
 * Categorical gene-family palette built from Radix Colors. Light mode uses the
 * high-contrast text steps (11) so every family line reads on a white canvas;
 * dark mode uses the bright solid steps (9). Family names are also shown in the
 * legend and filter, so colour is never the only channel.
 */
const RADIX_FAMILIES_LIGHT = [
  "#0d74ce", // blue 11
  "#cc4e00", // orange 11
  "#2a7e3b", // grass 11
  "#6550b9", // violet 11
  "#107d98", // cyan 11
  "#5c7c2f", // lime 11
  "#d13415", // tomato 11
  "#067a6f", // teal 11
  "#5753c6", // iris 11
  "#ab6400", // amber 11
  "#8145b5", // purple 11
  "#ca244d", // ruby 11
  "#208368", // jade 11
  "#3a5bc7", // indigo 11
  "#c2298a", // pink 11
  "#815e46", // brown 11
];

const RADIX_FAMILIES_DARK = [
  "#0090ff", // blue 9
  "#f76b15", // orange 9
  "#46a758", // grass 9
  "#6e56cf", // violet 9
  "#00a2c7", // cyan 9
  "#bdee63", // lime 9
  "#e54d2e", // tomato 9
  "#12a594", // teal 9
  "#5b5bd6", // iris 9
  "#ffc53d", // amber 9
  "#8e4ec6", // purple 9
  "#e54666", // ruby 9
  "#29a383", // jade 9
  "#3e63dd", // indigo 9
  "#d6409f", // pink 9
  "#ad7f58", // brown 9
];

const eventLight: Record<EventType, string> = {
  speciation: "#0d74ce", // blue 11
  duplication: "#cc4e00", // orange 11
  loss: "#60646c", // slate 11
  branchingOut: "#6550b9", // violet 11
  bifurcationOut: "#218358", // green 11
  transferBack: "#953ea3", // plum 11
  leaf: "#107d98", // cyan 11
};

const eventDark: Record<EventType, string> = {
  speciation: "#0090ff", // blue 9
  duplication: "#f76b15", // orange 9
  loss: "#777b84", // slate 10
  branchingOut: "#6e56cf", // violet 9
  bifurcationOut: "#30a46c", // green 9
  transferBack: "#ab4aba", // plum 9
  leaf: "#00a2c7", // cyan 9
};

export const lightTheme: Theme = {
  id: "light",
  name: "Light",
  background: "#f9f9fb", // slate 2
  panel: "#fcfcfd", // slate 1
  speciesFill: "#f0f0f3", // slate 3
  speciesStroke: "#d9d9e0", // slate 6
  speciesLabel: "#1c2024", // slate 12
  text: "#1c2024", // slate 12
  muted: "#60646c", // slate 11
  gridline: "#f0f0f3", // slate 3
  genePalette: RADIX_FAMILIES_LIGHT,
  event: eventLight,
};

export const darkTheme: Theme = {
  id: "dark",
  name: "Dark",
  background: "#111113", // slate 1
  panel: "#18191b", // slate 2
  speciesFill: "#212225", // slate 3
  speciesStroke: "#363a3f", // slate 6
  speciesLabel: "#edeef0", // slate 12
  text: "#edeef0", // slate 12
  muted: "#b0b4ba", // slate 11
  gridline: "#212225", // slate 3
  genePalette: RADIX_FAMILIES_DARK,
  event: eventDark,
};

export const themes: Record<Theme["id"], Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

export function geneColor(theme: Theme, treeIndex: number): string {
  return theme.genePalette[treeIndex % theme.genePalette.length];
}
