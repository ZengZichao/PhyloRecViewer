import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { App } from "./App";
import { samples } from "../samples";
import { useStore } from "../state/store";

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

async function mount(host: HTMLDivElement) {
  const root = createRoot(host);
  await act(async () => {
    root.render(<App />);
    await new Promise((r) => setTimeout(r, 400));
  });
  return root;
}

function transforms(host: HTMLElement): (string | null)[] {
  return [...host.querySelectorAll(".split-pane")]
    .map((pane) => pane.querySelector("[transform]")?.getAttribute("transform") ?? null);
}

describe("linked views in compare mode", () => {
  it("mirrors one pane onto the other without a feedback loop", async () => {
    const compare = samples.find((s) => s.id === "compare");
    expect(compare?.compareXml).toBeTruthy();
    await act(async () => {
      const s = useStore.getState();
      s.loadXml(compare!.xml, "A.xml");
      s.loadCompareXml(compare!.compareXml!, "B.xml");
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = await mount(host);

    const link = host.querySelector<HTMLInputElement>(".compare-link input");
    expect(link).not.toBeNull();
    await act(async () => {
      link!.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(link!.checked).toBe(true);

    const before = transforms(host);
    expect(before).toHaveLength(2);

    // Wheel-zoom on the first pane: d3-zoom listens on its container, the
    // listened element is the one carrying class "canvas".
    const pane = host.querySelectorAll(".split-pane")[0];
    const canvas = pane.querySelector(".canvas")!;
    await act(async () => {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -140,
          clientX: 240,
          clientY: 180,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((r) => setTimeout(r, 60));
    });
    const after = transforms(host);
    // The wheel landed (so the assertion below is not vacuous)…
    expect(after[0]).not.toBe(before[0]);
    // …and the second pane followed it exactly.
    expect(after[1]).toBe(after[0]);

    // Applying the peer value must not have queued another broadcast: after a
    // settle there is nothing left to move. The old echo loop kept flipping
    // the transform every frame, so a second frame would differ.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(transforms(host)).toEqual(after);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
