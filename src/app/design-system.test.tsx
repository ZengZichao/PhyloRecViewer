import { describe, it, expect, beforeEach, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Settings } from "./Settings";
import { MenuBar } from "./MenuBar";
import { useStore } from "../state/store";
import { APP_NAME } from "../version";
import { translations } from "../i18n";

/**
 * Mechanical guards for the visual system in `docs/STYLE-GUIDE-UI.md` §7.
 * These cover the rules that a screenshot review can miss on a later edit:
 * a gradient creeping back into a slider, a glyph slipping into a menu, a
 * surfaced regaining a hard border, or the Preferences page losing its groups.
 * Anything that needs eyes (alignment, spacing rhythm) stays a review item;
 * everything a string or a render can prove is checked here.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CSS = read("src/styles.css");

/** The declarations of one top-level CSS rule, without its selector. */
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  localStorage.clear();
});

describe("no gradients, glow or replaying keyframes", () => {
  it("never paints a gradient or a text glow", () => {
    // A gradient trick on the native range track is how the sliders used to
    // fill; a painted gradient or glow anywhere is a regression of §7.1.
    expect(CSS).not.toMatch(/(?:^|[^-])linear-gradient/);
    expect(CSS).not.toMatch(/text-shadow\s*:/);
    expect(CSS).not.toMatch(/filter\s*:\s*(?:drop-shadow|glow)/);
  });

  it("uses transitions, not keyframes, for interface state", () => {
    // The single remaining keyframe is the loading spinner: rotation cannot be
    // a transition, and it is not a state that a second click interrupts.
    const names = [...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names).toEqual(["rpv-spin"]);
    // The old one-shot entrance/pulse keyframes must not come back.
    expect(CSS).not.toContain("@keyframes toast-in");
    expect(CSS).not.toContain("@keyframes rpv-locate");
  });
});

describe("spacing, radius and shadow tokens", () => {
  it("defines the fixed motion, radius and shadow steps", () => {
    for (const token of [
      "--radius:",
      "--radius-sm:",
      "--radius-xs:",
      "--radius-full:",
      "--motion:",
      "--motion-fast:",
      "--motion-slow:",
      "--ease-out:",
      "--shadow-panel:",
      "--shadow-pop:",
      "--shadow-modal:",
    ]) {
      expect(CSS, token).toContain(token);
    }
    // No stray one-off radii from before the token scale existed.
    expect(CSS).not.toMatch(/border-radius:\s*3px/);
  });

  it("uses layered shadows instead of hard borders on floating surfaces", () => {
    for (const selector of [".sidebar", ".right-panel", ".main", ".dropdown-menu", ".help-card", ".settings-card"]) {
      const block = cssBlock(selector);
      expect(block, selector).toContain("box-shadow");
      // A `border: none` reset is fine (it documents that a border was
      // removed); a drawn border is not.
      expect(block, selector).not.toMatch(
        /\bborder(?:-(?:top|right|bottom|left))?:\s*(?!\s*(?:none|0|transparent)\b)/,
      );
    }
  });

  it("keeps the sidebar inset, rounded and symmetrically padded", () => {
    const block = cssBlock(".sidebar");
    expect(block).toContain("border-radius: var(--radius)");
    expect(block).toContain("box-shadow: var(--shadow-panel)");
    expect(block).toContain("scrollbar-gutter: stable both-edges");
    expect(block).not.toMatch(/border-right/);
  });
});

describe("detail rules", () => {
  it("makes every number tabular and balances heading wraps", () => {
    expect(cssBlock("body")).toContain("font-variant-numeric: tabular-nums");
    const h1 = CSS.match(/(?:^|\n)h1\s*\{\s*text-wrap: balance;?\s*\}/);
    expect(h1, "h1 has an explicit text-wrap: balance rule").not.toBeNull();
    expect(CSS).toMatch(/h1,\n?\s*h2,\n?\s*h3,\n?\s*h4\s*\{\s*text-wrap: balance;/);
  });

  it("declares every custom property it references", () => {
    // `var(--warning-text)` was used for the Checks warning level but never
    // declared, so the colour silently fell back to the inherited text.
    const defined = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });

  it("shares one solid-fill geometry between the two range controls", () => {
    expect(CSS).toContain(".slider-fill");
    expect(CSS).toContain(".range-fill");
    expect(CSS).toContain(".range-track");
  });
});

describe("one linear icon set, no emoji or font glyph icons", () => {
  it("does not use text symbols or emoji as chrome icons", async () => {
    const banned = /[☀🌙🖥✓✔✕⇔⇕◎◉✎⋮⋯‹›▸▾]/u;
    // Every display component, not a hand-picked list: a new panel should not
    // be able to reintroduce a font glyph because it was not on the list.
    const files = readdirSync(join(ROOT, "src/app"))
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .map((f) => `src/app/${f}`);
    for (const f of files) {
      // Strip block and line comments: the icon module documents what was
      // removed, and a comment is not a rendered glyph.
      const source = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const hit = source.match(banned);
      expect(hit, `${f} renders a text glyph (${hit?.[0]})`).toBeNull();
      // A glyph written as a `\u2713` string escape is still a font glyph in
      // the UI; the escape form is how the check marks previously slipped
      // past a literal-character scan.
      const escaped = source.match(/\\u(?:2713|2714|2715|2716|2717|2718)\b/);
      expect(escaped, `${f} renders an escaped glyph (${escaped?.[0]})`).toBeNull();
    }
  });

  it("draws the menu disclosure and check marks with the icon component", () => {
    const menu = read("src/app/MenuBar.tsx");
    expect(menu).toContain('className="menu-caret"');
    expect(menu).toContain('<Icon name="chevronDown"');
    expect(menu).toContain('<Icon name="check"');
    // The old CSS caret (a font ▾ injected by ::after) is gone.
    expect(CSS).not.toContain('content: "▾"');
  });

  it("renders the app heading as a real, visually hidden h1", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      const { App } = await import("./App");
      await act(async () => {
        root.render(<App />);
        await new Promise((r) => setTimeout(r, 150));
      });
      const h1 = host.querySelector("h1.sr-only");
      expect(h1, "the app renders an h1 for assistive tech").not.toBeNull();
      expect(h1!.textContent).toBe(APP_NAME);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

describe("Preferences is a grouped, borderless settings page", () => {
  it("renders one group per heading with the reset group last", async () => {
    const t = translations.en;
    useStore.setState({ locale: "en" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<Settings open onClose={() => undefined} />));
      const groups = Array.from(host.querySelectorAll<HTMLElement>(".settings-group"));
      expect(groups.length).toBeGreaterThanOrEqual(5);
      const titles = groups.map((g) => g.querySelector(".settings-group-title")?.textContent);
      expect(titles).toEqual([
        t.prefsGroupAppearance,
        t.prefsGroupExport,
        t.prefsGroupWorkspace,
        t.prefsGroupHelp,
        t.prefsGroupReset,
      ]);
      // Destructive actions are alone under a rule at the very bottom.
      const danger = host.querySelector(".settings-card > .settings-group-danger");
      expect(danger, "the reset group is the last block of the page").not.toBeNull();
      expect(danger!.querySelectorAll(".settings-reset")).toHaveLength(1);
      // Every row still follows label-left / control-right.
      for (const row of Array.from(host.querySelectorAll<HTMLElement>(".settings-field"))) {
        const label = row.querySelector(".settings-label, .settings-group-title");
        const control = row.querySelector(".settings-actions, .segmented");
        expect(label, "a row has a left-hand name").not.toBeNull();
        expect(control, "a row has a right-hand control").not.toBeNull();
      }
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe("menus open through the presence transition", () => {
  it("mounts a dropdown on open and marks its state", () => {
    useStore.setState({ locale: "en", recon: null });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<MenuBar panes={[]} onOpenSettings={() => undefined} />));
      const trigger = host.querySelector<HTMLButtonElement>(".menu-bar-item")!;
      act(() => {
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const menu = host.querySelector(".dropdown-menu");
      expect(menu, "the dropdown mounts").not.toBeNull();
      expect(["enter", "shown"]).toContain(menu!.getAttribute("data-state"));
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});