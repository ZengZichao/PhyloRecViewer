import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { App } from "./App";
import { useStore } from "../state/store";
import { samples } from "../samples";
import { translations } from "../i18n";

/**
 * Bundled sample names must follow the UI language: the English interface shows
 * the English names, the Chinese interface the Chinese ones — in the menu, the
 * empty-state hub and the document tab title (the fix that replaced the
 * hardcoded labels baked into src/samples with i18n keys).
 */

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
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  localStorage.clear();
  useStore.setState({
    xml: null, fileName: null, recon: null, error: null, warnings: [],
    nested: null, nestedName: null, nestedXml: null, nestedError: null,
    compare: null, compareName: null, compareXml: null, compareError: null,
    swapped: new Set(), nestedSwapped: new Set(), collapsed: new Set(),
    geneColors: {}, annotations: {}, annotating: null,
    sampleId: null, searchQuery: "", searchRegex: false, onlyMatches: false,
    eventFilter: { speciation: true, duplication: true, loss: true, transfer: true, leaf: true },
    familyFilter: null, confidenceMin: 0, confidenceMax: 1, locate: null,
    past: [], future: [], pendingMulti: null,
  });
});

async function renderApp(host: HTMLDivElement) {
  const root = createRoot(host);
  await act(async () => {
    root.render(<App />);
    await new Promise((r) => setTimeout(r, 400));
  });
  return root;
}

async function unmountAndRemove(root: ReturnType<typeof createRoot>, host: HTMLDivElement) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

const showcase = samples[0];
const enName = translations.en[showcase.labelKey];
const zhName = translations.zh[showcase.labelKey];

describe("localized sample names", () => {
  it("every bundled sample has distinct en/zh names", () => {
    for (const s of samples) {
      expect(translations.en[s.labelKey].length).toBeGreaterThan(0);
      expect(translations.zh[s.labelKey].length).toBeGreaterThan(0);
      expect(translations.en[s.labelKey]).not.toBe(translations.zh[s.labelKey]);
      if (s.nestedLabelKey) {
        expect(translations.en[s.nestedLabelKey]).not.toBe(translations.zh[s.nestedLabelKey]);
      }
      if (s.compareLabelKey) {
        expect(translations.en[s.compareLabelKey]).not.toBe(translations.zh[s.compareLabelKey]);
      }
    }
  });

  it("empty-state hub shows the English names under the en locale", async () => {
    useStore.setState({ locale: "en" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    const text = host.querySelector(".empty-samples")?.textContent ?? "";
    expect(text).toContain(enName);
    expect(text).not.toContain(zhName);
    await unmountAndRemove(root, host);
  });

  it("empty-state hub shows the Chinese names under the zh locale", async () => {
    useStore.setState({ locale: "zh" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    const text = host.querySelector(".empty-samples")?.textContent ?? "";
    expect(text).toContain(zhName);
    expect(text).not.toContain(enName);
    await unmountAndRemove(root, host);
  });

  it("the tab title of a loaded sample re-localizes when the language changes", async () => {
    await act(async () => {
      useStore.getState().loadXml(showcase.xml, zhName);
      useStore.getState().setSampleId(showcase.id);
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    useStore.setState({ locale: "en" });
    const root = await renderApp(host);
    let title = host.querySelector(".tab-title")?.textContent ?? "";
    expect(title).toBe(enName);
    await act(async () => {
      useStore.setState({ locale: "zh" });
    });
    title = host.querySelector(".tab-title")?.textContent ?? "";
    expect(title).toBe(zhName);
    await unmountAndRemove(root, host);
  });
});

/**
 * STYLE §5.3: the compare panes' on-screen titles must not keep an English
 * "A"/"B" fallback. When a compare-mode pane carries no document name (a
 * pasted/untitled buffer) its `.pane-label` falls back to the CURRENT
 * dictionary's `paneTagA`/`paneTagB`, so the Chinese interface reads
 * 「主文档 / 对比文档」 rather than the untranslated letters. Comparing against
 * `translations[locale]` (not a literal) is what fails the test if the hard-coded
 * "A"/"B" is ever re-introduced.
 */
describe("compare pane title fallback is localized", () => {
  const cmp = samples.find((s) => s.id === "compare")!;

  it.each(["en", "zh"] as const)(
    "labels the unnamed compare panes with the %s dictionary tags",
    async (locale) => {
      const prev = useStore.getState().locale;
      useStore.setState({ locale });
      await act(async () => {
        useStore.getState().loadXml(cmp.xml, "toolA");
        useStore.getState().loadCompareXml(cmp.compareXml!, "toolB");
      });
      // Trigger the fallback: strip the pane document names.
      await act(async () => {
        useStore.setState({ fileName: null, compareName: null });
      });
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = await renderApp(host);
      try {
        const labels = Array.from(host.querySelectorAll(".pane-label")).map(
          (n) => n.textContent,
        );
        const dict = translations[locale];
        // Exactly the two split panes, primary then compare, in DOM order.
        expect(labels).toEqual([dict.paneTagA, dict.paneTagB]);
      } finally {
        await unmountAndRemove(root, host);
        useStore.setState({ locale: prev });
      }
    },
  );

  it("never shows the raw English letters on the Chinese interface", async () => {
    const prev = useStore.getState().locale;
    useStore.setState({ locale: "zh" });
    await act(async () => {
      useStore.getState().loadXml(cmp.xml, "toolA");
      useStore.getState().loadCompareXml(cmp.compareXml!, "toolB");
    });
    await act(async () => {
      useStore.setState({ fileName: null, compareName: null });
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    try {
      const labels = Array.from(host.querySelectorAll(".pane-label")).map(
        (n) => n.textContent ?? "",
      );
      expect(labels.length).toBeGreaterThan(0);
      expect(labels).not.toContain("A");
      expect(labels).not.toContain("B");
      expect(labels).toContain(translations.zh.paneTagA);
      expect(labels).toContain(translations.zh.paneTagB);
    } finally {
      await unmountAndRemove(root, host);
      useStore.setState({ locale: prev });
    }
  });
});
