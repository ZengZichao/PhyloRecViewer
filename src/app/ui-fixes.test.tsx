import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { App } from "./App";
import { Legend } from "./Legend";
import { lightTheme } from "../render/theme";
import { samples } from "../samples";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { useStore } from "../state/store";
import { translations } from "../i18n";

/** Same browser-API stubs App.test.tsx needs for a full render. */
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
    unmount() {}
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
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<App />);
    await new Promise((r) => setTimeout(r, 400));
  });
  return root;
}

/** The hub and toolbar labels depend on the persisted UI language, so match
 *  either dictionary rather than pinning the test to one locale. */
const anyLabel = (host: Element, labels: string[]) =>
  Array.from(host.querySelectorAll("button")).some((b) =>
    labels.includes(b.getAttribute("aria-label") ?? ""),
  );

async function unmount(root: ReturnType<typeof createRoot>, host: HTMLDivElement) {
  await act(async () => root.unmount());
  host.remove();
}

/** jsdom defaults to a 1024px window: below the 1180 launch threshold App now
 *  starts with the analysis panel closed, so tests that need it open stub a
 *  desktop viewport for their duration. */
async function withDesktopWidth(run: () => Promise<void>): Promise<void> {
  const w = window as { innerWidth: number };
  const original = w.innerWidth;
  w.innerWidth = 1440;
  try {
    await run();
  } finally {
    w.innerWidth = original;
  }
}

/** jsdom's Blob has no text(); read the downloaded CSV through FileReader. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(blob);
  });
}

function loadNestedSample() {
  const s = samples.find((x) => x.id === "nested")!;
  useStore.getState().loadXml(s.xml, "nested");
  useStore.getState().loadNestedXml(s.nestedXml!, "symbiont-host");
}

describe("located nodes get a canvas outline, not just a pan", () => {
  it("outlines the node when a search match row is clicked", async () => {
    await withDesktopWidth(async () => {
      const s = samples.find((x) => x.id === "showcase")!;
      await act(async () => {
        useStore.getState().loadXml(s.xml, "showcase");
      });
      const recon = useStore.getState().recon!;
      const named = recon.geneTrees.flatMap((t) => t.nodes).find((g) => g.name);
      expect(named).toBeDefined();

      await act(async () => {
        useStore.setState({ rightPanelOpen: true, rightPanelTab: "search" });
      });
      const host = document.createElement("div");
      const root = await mount(host);
      await act(async () => {
        useStore.getState().setSearchQuery(named!.name!);
      });

      const row = host.querySelector(".rp-result-row");
      expect(row).not.toBeNull();
      expect(host.querySelector(".locate-layer")).toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(host.querySelector(".locate-layer circle.locate-ring")).not.toBeNull();
      await unmount(root, host);
    });
  });

  it("draws the outline ring for the node a locate request targeted", async () => {
    const s = samples.find((x) => x.id === "showcase")!;
    await act(async () => {
      useStore.getState().loadXml(s.xml, "showcase");
    });
    const geneId = useStore.getState().recon!.geneTrees[0].nodes[0].id;
    const host = document.createElement("div");
    const root = await mount(host);
    expect(host.querySelector(".locate-layer")).toBeNull();

    await act(async () => {
      useStore.getState().locateGene(geneId);
    });
    const ring = host.querySelector(".locate-layer circle.locate-ring");
    expect(ring).not.toBeNull();
    // cx/cy must be a real projected position, or the ring floats off-tree.
    expect(Number(ring!.getAttribute("cx"))).not.toBeNaN();
    expect(Number(ring!.getAttribute("cy"))).not.toBeNaN();

    await act(async () => {
      useStore.getState().clearLocate();
    });
    expect(host.querySelector(".locate-layer")).toBeNull();
    await unmount(root, host);
  });
});

describe("every split-view pane carries the editing toolbar", () => {
  it("shows undo, redo and the analysis-panel toggle on all nested panes", async () => {
    await act(async () => loadNestedSample());
    const host = document.createElement("div");
    const root = await mount(host);
    const panes = Array.from(host.querySelectorAll(".split-pane"));
    expect(panes.length).toBeGreaterThan(1);
    for (const pane of panes) {
      const bar = pane.querySelector(".float-toolbar");
      expect(bar).not.toBeNull();
      expect(anyLabel(bar!, ["撤销", "Undo"])).toBe(true);
      expect(anyLabel(bar!, ["重做", "Redo"])).toBe(true);
      expect(anyLabel(bar!, ["分析面板", "Analysis"])).toBe(true);
    }
    await unmount(root, host);
  });
});

describe("empty-state hub copy", () => {
  it("states the open-a-file step once, without repeating the format list", async () => {
    const host = document.createElement("div");
    const root = await mount(host);
    const hub = host.querySelector(".empty-hub")!;
    const text = hub.textContent ?? "";
    expect(text).not.toContain(".recphyloxml / .recphylo");
    // One drag instruction only: the hub used to say it twice.
    expect(text.match(/拖拽|Drop a file/g) ?? []).toHaveLength(1);
    expect(host.querySelectorAll(".empty-actions .btn")).toHaveLength(3);
    expect(host.querySelectorAll(".empty-sample-list .empty-sample-btn")).toHaveLength(
      samples.length,
    );
    const locale = useStore.getState().locale;
    const labels = [...host.querySelectorAll(".empty-sample-name")].map((n) => n.textContent);
    expect(labels).toEqual(samples.map((s) => translations[locale][s.labelKey]));
    // Per-sample explainer badges ("Differences", "Gene → Symbiont…") are gone.
    expect(host.querySelector(".empty-samples .multi-open-badge")).toBeNull();
    await unmount(root, host);
  });

  it("aligns the sample row with the action row, same button size", () => {
    const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const block = (selector: string) =>
      css.match(new RegExp(`${selector.replace(/\./g, "\\.") }\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
    const actions = block(".empty-actions");
    const samples = block(".empty-sample-list");
    for (const rule of [
      "grid-template-columns: repeat(3, var(--hub-btn-w))",
      "gap: 8px",
    ]) {
      expect(actions).toContain(rule);
      expect(samples).toContain(rule);
    }
    expect(block(".empty-sample-btn")).toContain("width: var(--hub-btn-w)");
    expect(block(".empty-actions .btn")).toContain("width: var(--hub-btn-w)");
  });
});

describe("settings is a menu-bar destination, not a View menu entry", () => {
  it("renders 设置 as a direct child of the menu bar", async () => {
    const host = document.createElement("div");
    const root = await mount(host);
    const bar = host.querySelector(".menu-bar")!;
    const own = Array.from(bar.children).filter((el) =>
      ["设置", "Preferences"].includes(el.getAttribute("aria-label") ?? ""),
    );
    expect(own).toHaveLength(1);
    expect(own[0].classList.contains("menu-bar-item")).toBe(true);
    await unmount(root, host);
  });
});

describe("QC report export", () => {
  it("writes rows for a document whose checks all pass", async () => {
    await withDesktopWidth(async () => {
      await act(async () => loadNestedSample());
      await act(async () => {
        useStore.setState({ rightPanelOpen: true, rightPanelTab: "check" });
      });
      const host = document.createElement("div");
      const root = await mount(host);

      const captured: Blob[] = [];
      const original = URL.createObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        captured.push(blob);
        return "blob:captured";
      }) as typeof URL.createObjectURL;
      try {
        const btn = Array.from(host.querySelectorAll("button")).find((b) =>
          /质检报告|CSV|report/i.test(b.textContent ?? ""),
        );
        expect(btn).toBeDefined();
        await act(async () => {
          btn!.click();
          await new Promise((r) => setTimeout(r, 0));
        });
      } finally {
        URL.createObjectURL = original;
      }
      expect(captured).toHaveLength(1);
      const csv = (await readBlob(captured[0])).replace(/^/, "");
      const lines = csv.split("\n").filter(Boolean);
      // The bug was a header-only file: a clean document exported nothing.
      expect(lines.length).toBeGreaterThan(16);
      expect(lines[0]).toBe("tree,level,code,count,examples,node_ids");
      const trees = new Set(lines.slice(1).map((l) => l.split(",")[0]));
      // Both reconciliation levels of the nested sample are represented.
      expect(trees.size).toBeGreaterThanOrEqual(2);
      await unmount(root, host);
    });
  });
});

describe("export dropdown layout", () => {
  it("groups the export actions into even chip rows instead of loose menu rows", async () => {
    const s = samples.find((x) => x.id === "showcase")!;
    await act(async () => {
      useStore.getState().loadXml(s.xml, "showcase");
    });
    const host = document.createElement("div");
    const root = await mount(host);
    const trigger = host.querySelector("#menu-export .menu-bar-item") as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const menu = host.querySelector("#menu-export .dropdown-menu");
    expect(menu).not.toBeNull();
    // Formats and copy actions sit in equal-width chip rows; none of them may
    // be a plain full-width menu row any more.
    const chipRows = menu!.querySelectorAll(".menu-scale");
    expect(chipRows.length).toBeGreaterThanOrEqual(4);
    const looseRows = Array.from(menu!.querySelectorAll(":scope > .menu-item"));
    expect(looseRows.map((b) => b.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("recPhyloXML")]),
    );
    expect(looseRows.length).toBeLessThanOrEqual(2);
    await unmount(root, host);
  });
});

describe("legend event key", () => {
  it("lists ten event marks so the group fills two even rows of five", () => {
    localStorage.setItem("rpv.legend.dir", "h");
    const recon = parseRecPhyloXML(samples.find((x) => x.id === "showcase")!.xml);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Legend theme={lightTheme} recon={recon} />));
    const events = host.querySelector(".legend-group.events")!;
    expect(events).not.toBeNull();
    expect(events.querySelectorAll(".legend-item")).toHaveLength(10);
    act(() => root.unmount());
    host.remove();
  });
});
