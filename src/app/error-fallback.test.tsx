import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { translations } from "../i18n";
import { localizeDiagnostic } from "../i18nDiagnostics";
import { useStore } from "../state/store";

/**
 * Two render-layer spots that used to hand a Chinese user raw English text:
 * the crash panel of the root error boundary (an untranslated parse/session
 * message, STYLE §4.4) and the batch-rename toast for an invalid pattern (a
 * raw V8 SyntaxError used as the whole message body, STYLE §5.3).
 */

/** Verbatim from `src/session.ts` - exactly the kind of text that lands in the
 *  crash panel when a session-dependent render path throws. */
const CRASH_MESSAGE = "Session file is not valid JSON";

function Crashing(): never {
  throw new Error(CRASH_MESSAGE);
}

/** React only lets a controlled input be written through the native setter. */
function typeInto(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  expect(setValue, "jsdom exposes the HTMLInputElement value setter").toBeDefined();
  act(() => {
    setValue!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(el: HTMLElement): void {
  act(() => {
    el.click();
  });
}

function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

beforeEach(() => {
  localStorage.clear();
  // The boundary diagnoses the crash locally with console.error.
  vi.spyOn(console, "error").mockImplementation(() => {});
  useStore.setState({ toast: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ locale: "en", toast: null });
});

describe("crash panel", () => {
  it.each(["en", "zh"] as const)("shows the %s error text of the panel it renders", (locale) => {
    useStore.setState({ locale });
    const t = translations[locale];
    const { host, root } = mount(
      <ErrorBoundary>
        <Crashing />
      </ErrorBoundary>,
    );
    try {
      const panel = host.querySelector(".state-panel.error");
      expect(panel, "the boundary must not leave a blank window").not.toBeNull();
      expect(panel!.querySelector("h2")?.textContent).toBe(t.crashTitle);
      const shown = panel!.querySelector("p")?.textContent ?? "";
      // Every string in the panel comes from the display layer, the engine's
      // canonical message included (`i18nDiagnostics`, as in MenuBar/RightPanel).
      expect(shown).toBe(localizeDiagnostic(CRASH_MESSAGE, locale));
      if (locale === "zh") expect(shown).not.toContain(CRASH_MESSAGE);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe("batch-rename dialog", () => {
  it("answers an invalid pattern with the dictionary phrase, not the engine text", () => {
    useStore.setState({ locale: "zh" });
    const t = translations.zh;
    const { host, root } = mount(<Sidebar />);
    try {
      // The Labels section ships collapsed, and its header button also holds
      // the chevron glyph, so the title is matched on the heading inside it.
      const sectionHead = Array.from(host.querySelectorAll<HTMLElement>(".panel-head")).find(
        (b) => b.querySelector("h3")?.textContent === t.labelsSection,
      );
      expect(sectionHead, "the sidebar lists a Labels section").toBeDefined();
      click(sectionHead!);
      const openDialog = Array.from(host.querySelectorAll<HTMLElement>("button")).find(
        (b) => b.textContent === t.renameLabels,
      );
      expect(openDialog, "the Labels section offers batch rename").toBeDefined();
      click(openDialog!);

      const dialog = host.querySelector(".label-rename-dialog");
      expect(dialog, "the batch-rename dialog is mounted").not.toBeNull();
      const [findInput] = Array.from(
        dialog!.querySelectorAll<HTMLInputElement>('input[type="text"]'),
      );
      typeInto(findInput, "("); // an unterminated group
      const useRegex = dialog!.querySelector<HTMLInputElement>('input[type="checkbox"]');
      act(() => useRegex!.click());
      const apply = Array.from(dialog!.querySelectorAll<HTMLElement>("button")).find(
        (b) => b.textContent === t.renameApply,
      );
      expect(apply, "the dialog has an Apply button").toBeDefined();
      click(apply!);

      const toast = useStore.getState().toast;
      expect(toast?.kind).toBe("error");
      // This used to be `Invalid regular expression: /(/: Unterminated group` -
      // V8's own text, in a language the user never chose, as the whole toast.
      expect(toast?.msg).toBe(t.batchInvalidRegex);
      expect(toast?.msg).not.toContain("Unterminated");
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

/**
 * The label-truncation switch. Its dictionary key and its `renderOptions`
 * reader both outlived a copy edit that deleted the control itself, so only a
 * rendered row proves a user can still turn truncation off - in either
 * language, since the row is labelled from the catalogue.
 */
describe("sidebar label toggles", () => {
  it.each(["en", "zh"] as const)("renders the %s full-labels switch and writes the option", (locale) => {
    const initial = useStore.getState().renderOptions.fullLabels;
    useStore.setState({ locale });
    const t = translations[locale];
    const { host, root } = mount(<Sidebar />);
    try {
      // The Labels section ships collapsed; its header button carries the
      // chevron glyph, so the heading inside it is what identifies it.
      const sectionHead = Array.from(host.querySelectorAll<HTMLElement>(".panel-head")).find(
        (b) => b.querySelector("h3")?.textContent === t.labelsSection,
      );
      expect(sectionHead, "the sidebar lists a Labels section").toBeDefined();
      click(sectionHead!);
      const row = Array.from(host.querySelectorAll<HTMLElement>(".control-row")).find(
        (l) => l.querySelector(".control-label")?.textContent === t.fullLabels,
      );
      expect(row, "the Labels section offers a full-labels switch").toBeDefined();
      const input = row!.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(input, "the row holds a switch").not.toBeNull();
      expect(input!.checked).toBe(initial);
      click(input!);
      expect(useStore.getState().renderOptions.fullLabels).toBe(!initial);
      expect(input!.checked).toBe(!initial);
      click(input!);
      expect(useStore.getState().renderOptions.fullLabels).toBe(initial);
    } finally {
      act(() => root.unmount());
      host.remove();
      useStore.setState({
        locale: "en",
        renderOptions: { ...useStore.getState().renderOptions, fullLabels: initial },
      });
    }
  });
});
