import type { LayoutOptions } from "../layout";
import type { RenderOptions } from "../render/options";
import type { ThemePref } from "../render/theme";
import type { EventFilter } from "../analysis/focus";
import { sanitizeLayoutOptions, sanitizeRenderOptions } from "../session";

/**
 * Global preference persistence (theme / language / default view / onboarding
 * flag). The single source of truth for everything that should survive a
 * restart, complementing useCollapsible's per-section localStorage keys.
 *
 * Storage keys:
 *  - "rpv.prefs"    -> { themeId, locale, pngDpi, defaultView }
 *  - "rpv.onboarded" -> "1" once the first-run tour has been seen/skipped
 */

export interface DefaultViewPrefs {
  layoutOptions?: Partial<LayoutOptions>;
  renderOptions?: Partial<RenderOptions>;
}

export interface Prefs {
  themeId?: ThemePref;
  locale?: "zh" | "en";
  pngDpi?: number;
  /** Show the legend on the canvas and in exports (persisted). */
  showLegend?: boolean;
  /** Show the minimap navigator overlay (persisted). */
  minimap?: boolean;
  /** Persisted panel widths (sidebar / right panel). */
  panelWidths?: { sidebar: number; right: number };
  /** Default view applied when opening a new document/tab. */
  defaultView?: DefaultViewPrefs | null;
  /** Event-type filter chips (Search → By event type), persisted like the
   *  other view preferences so a working set survives a reload. */
  eventFilter?: EventFilter;
}

const KEY = "rpv.prefs";
const ONBOARD_KEY = "rpv.onboarded";

/** Read the persisted preferences (best effort; missing/corrupt -> {}).
 *  The `defaultView` block is sanitized with the same validators used for
 *  session files so a corrupted/malicious prefs entry cannot reach the layout
 *  or render engine (parity with the session-file trust boundary). */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const d = JSON.parse(raw) as Prefs;
    if (!d || typeof d !== "object") return {};
    // Sanitize the default view so prefs and session files have the same
    // trust level.
    if (d.defaultView) {
      const dv = d.defaultView;
      d.defaultView = {
        layoutOptions: dv.layoutOptions
          ? sanitizeLayoutOptions(dv.layoutOptions)
          : undefined,
        renderOptions: dv.renderOptions
          ? sanitizeRenderOptions(dv.renderOptions)
          : undefined,
      };
    }
    // The event filter is five booleans; a corrupted entry must not be able to
    // invent event keys the search layer then reads as false.
    if (d.eventFilter && typeof d.eventFilter === "object") {
      const f = d.eventFilter as unknown as Record<string, unknown>;
      d.eventFilter = {
        speciation: f.speciation !== false,
        duplication: f.duplication !== false,
        loss: f.loss !== false,
        transfer: f.transfer !== false,
        leaf: f.leaf !== false,
      };
    } else {
      delete d.eventFilter;
    }
    return d;
  } catch {
    return {};
  }
}

/** Write preferences (best effort; private mode / quota just skips). */
export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

/** Read the first-run tour flag (true once seen or skipped). */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark the first-run tour as seen/skipped. */
export function setOnboarded(on: boolean): void {
  try {
    localStorage.setItem(ONBOARD_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}
