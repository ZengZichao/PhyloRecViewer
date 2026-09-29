import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { App } from "./App";
import { useStore } from "../state/store";

/** jsdom lacks a few browser APIs the app uses; stub the ones touched on mount. */
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
    // Wait past the ~350ms "rendering" flash timer and the initial layout
    // effect so their store updates happen inside act() (React test hygiene).
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

describe("App smoke render", () => {
  it("renders menu bar, sidebar and the empty-state hub without crashing", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    expect(host.querySelector(".menu-bar")).not.toBeNull();
    expect(host.querySelector(".sidebar")).not.toBeNull();
    expect(host.querySelector(".state-panel.empty-hub")).not.toBeNull();
    await unmountAndRemove(root, host);
  });

  it("renders an error panel with recovery actions after a parse failure", async () => {
    await act(async () => {
      useStore.getState().loadXml("<broken", "bad.xml");
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    expect(host.querySelector(".state-panel.error")).not.toBeNull();
    // The recovery actions must be present (reopen / sample / back).
    expect(host.querySelector(".error-actions")).not.toBeNull();
    await unmountAndRemove(root, host);
  });

  it("renders the canvas once a valid document is loaded", async () => {
    const NHX =
      "((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];";
    await act(async () => {
      useStore.getState().loadXml(NHX, "good.nhx");
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    expect(host.querySelector(".canvas")).not.toBeNull();
    // The always-visible interaction hint bar.
    expect(host.querySelector(".canvas-hint")).not.toBeNull();
    await unmountAndRemove(root, host);
  });

  it("makes interactive gene nodes keyboard-reachable real tab stops", async () => {
    const NHX =
      "((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];";
    await act(async () => {
      useStore.getState().loadXml(NHX, "good.nhx");
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await renderApp(host);
    const canvas = host.querySelector(".canvas") as HTMLElement;
    const buttons = Array.from(canvas.querySelectorAll<SVGElement>('g[role="button"]'));
    // The gene layer has to be keyboard reachable, but making EVERY glyph a tab
    // stop would turn a real reconciliation into thousands of stops before focus
    // could leave the canvas. The layer is a roving single stop with arrow-key
    // traversal, so the assertions are: more than one interactive node exists,
    // exactly one is in the tab order, and arrowing moves that stop to a
    // sibling instead of stranding the handler.
    expect(buttons.length).toBeGreaterThan(1);
    const stops = buttons.filter((b) => b.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    const start = stops[0];
    const next = start.nextElementSibling as SVGElement | null;
    expect(next?.tagName).toBe("g");
    expect(next?.getAttribute("tabindex")).toBe("-1");
    await act(async () => {
      start.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(start.getAttribute("tabindex")).toBe("-1");
    expect(next!.getAttribute("tabindex")).toBe("0");
    await unmountAndRemove(root, host);
  });
});
