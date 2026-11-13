import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { App } from "./App";
import { Legend } from "./Legend";
import { HelpOverlay } from "./HelpOverlay";
import { NodeInspector } from "./NodeInspector";
import { RightPanel } from "./RightPanel";
import { Settings } from "./Settings";
import { lightTheme } from "../render/theme";
import { screenLegendRows } from "../render/legendRows";
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

/** The toast the app actually shows: one singleton, rendered by App. */
function toastText(host: HTMLElement): string {
  return host.querySelector(".toast-msg")?.textContent ?? "";
}

/**
 * The desktop build's native save dialog is the one step of an export that can
 * fail after the document itself rendered, so a rejecting `invoke` is how these
 * tests reach the `catch` that produces the failure toast. `isTauri()` only
 * looks for `window.__TAURI_INTERNALS__`, and `@tauri-apps/api`'s `invoke` /
 * `transformCallback` are the two internals the save path touches.
 */
async function withFailingDesktopSave(rawError: string, run: () => Promise<void>): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  w.__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error(rawError)),
    transformCallback: () => 0,
  };
  try {
    await run();
  } finally {
    delete w.__TAURI_INTERNALS__;
  }
}

/**
 * STYLE §4.4: a parser or exporter throw is a DIAGNOSTIC, and diagnostics reach
 * the user through `localizeDiagnostic` / `friendlyParseError`. Three catch
 * blocks used to paste the raw English onto the Chinese interface while the
 * handler fourteen lines above them localized — these pin each site (the
 * exporter messages come from `src/export/exporters.ts`, the session one from
 * `src/session.ts`, all with a rule in `src/i18nDiagnostics.ts`), plus the
 * search panel, which printed the JS engine's own regex SyntaxError untranslated
 * and needed rules of its own.
 */
describe("export and load failure toasts are localized", () => {
  it("says the HTML export failure in Chinese, not in raw exporter English", async () => {
    const s = samples.find((x) => x.id === "showcase")!;
    await act(async () => {
      useStore.getState().loadXml(s.xml, "showcase");
    });
    const prev = useStore.getState().locale;
    useStore.setState({ locale: "zh" });
    const host = document.createElement("div");
    const root = await mount(host);
    try {
      const trigger = host.querySelector("#menu-export .menu-bar-item") as HTMLButtonElement;
      expect(trigger).not.toBeNull();
      await act(async () => {
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const htmlBtn = Array.from(
        host.querySelectorAll("#menu-export .dropdown-menu .menu-scale-btn"),
      ).find((b) => (b.textContent ?? "").includes("HTML"));
      expect(htmlBtn).toBeDefined();

      await act(async () => {
        await withFailingDesktopSave("Failed to rasterize SVG", async () => {
          (htmlBtn as HTMLButtonElement).click();
          await new Promise((r) => setTimeout(r, 50));
        });
      });

      // Whole-string assertion: the prefix AND the translated diagnostic, so a
      // re-introduced raw message fails here even if it keeps the prefix.
      expect(toastText(host)).toBe(`${translations.zh.exportFailed}: SVG 栅格化失败。`);
      expect(toastText(host)).not.toContain("Failed to rasterize SVG");
    } finally {
      await unmount(root, host);
      useStore.setState({ locale: prev });
    }
  });

  it("says the statistics CSV failure in Chinese from the analysis panel", async () => {
    await withDesktopWidth(async () => {
      const s = samples.find((x) => x.id === "showcase")!;
      const prev = useStore.getState().locale;
      await act(async () => {
        useStore.getState().loadXml(s.xml, "showcase");
        useStore.setState({ rightPanelOpen: true, rightPanelTab: "stats", locale: "zh" });
      });
      const host = document.createElement("div");
      const root = await mount(host);
      try {
        const csvBtn = Array.from(host.querySelectorAll(".rp-toolbar .btn")).find(
          (b) => (b.textContent ?? "").trim() === translations.zh.exportCsv,
        );
        expect(csvBtn).toBeDefined();

        await act(async () => {
          await withFailingDesktopSave("Canvas 2D context unavailable", async () => {
            (csvBtn as HTMLButtonElement).click();
            await new Promise((r) => setTimeout(r, 50));
          });
        });

        expect(toastText(host)).toBe(`${translations.zh.exportFailed}: 无法获取 Canvas 2D 上下文。`);
        expect(toastText(host)).not.toContain("Canvas 2D context unavailable");
      } finally {
        await unmount(root, host);
        useStore.setState({ locale: prev });
      }
    });
  });

  it("translates a session file the parser refuses on import", async () => {
    const prev = useStore.getState().locale;
    useStore.setState({ locale: "zh" });
    const host = document.createElement("div");
    const root = await mount(host);
    try {
      const input = host.querySelector('input[name="session-file"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      // Two reader refusals, one file each: the file that is not JSON at all,
      // and a JSON file that is not a session. The second is the one that used
      // to be actively misleading — the catch went through
      // `friendlyParseError`, which appends its "Supported formats: recPhyloXML
      // (.recphyloxml…), NHX, Newick" hint, i.e. advice to re-save the session
      // as a tree file. jsdom gives a file input no programmatically-settable
      // FileList, and its Blob has no text(), so hand the handler one readable
      // entry instead.
      const cases: [string, string][] = [
        ["{ not json", "会话文件不是有效的 JSON。"],
        ['{"note":"a JSON file that is not a session"}', "不是 PhyloRecViewer 会话文件。"],
      ];
      for (const [text, zh] of cases) {
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [
            { name: "broken.rpvsession.json", text: () => Promise.resolve(text) },
          ] as unknown as FileList,
        });
        await act(async () => {
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 50));
        });

        // Whole-string assertion: the prefix AND the translated diagnostic, so
        // a re-introduced raw message — or a re-appended format hint — fails
        // here even if it keeps the prefix.
        expect(toastText(host)).toBe(`${translations.zh.loadFailed}: ${zh}`);
        expect(toastText(host)).not.toContain("Session file is not valid JSON");
        expect(toastText(host)).not.toContain("Not a PhyloRecViewer session file");
        expect(toastText(host)).not.toContain("recPhyloXML (.recphyloxml");
      }
    } finally {
      await unmount(root, host);
      useStore.setState({ locale: prev });
    }
  });

  it("shows the engine's invalid-regex complaint in Chinese in the search panel", async () => {
    await withDesktopWidth(async () => {
      const s = samples.find((x) => x.id === "showcase")!;
      const prev = useStore.getState().locale;
      await act(async () => {
        useStore.getState().loadXml(s.xml, "showcase");
        useStore.setState({
          rightPanelOpen: true,
          rightPanelTab: "search",
          locale: "zh",
          searchRegex: true,
          searchQuery: "(",
        });
      });
      const host = document.createElement("div");
      const root = await mount(host);
      try {
        // `focus.ts` keeps V8's canonical SyntaxError text (the analysis layer
        // stays locale-free); the panel that prints it under the translated
        // `regexInvalid` headline is a display boundary and must localise.
        const code = host.querySelector(".regex-error code");
        expect(code, "the search panel reports the invalid pattern").not.toBeNull();
        expect(code!.textContent).toBe('无效的正则表达式：/(/i：分组括号未闭合（缺少匹配的 ")"）。');
        expect(code!.textContent).not.toContain("Unterminated group");
      } finally {
        await unmount(root, host);
        useStore.setState({ locale: prev });
      }
    });
  });
});

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
  /** The event-group labels the overlay actually shows, in DOM order. */
  function screenRows(host: HTMLElement): string[] {
    const events = host.querySelector(".legend-group.events")!;
    return Array.from(events.querySelectorAll(".legend-item > span")).map((el) => el.textContent ?? "");
  }

  function renderLegend(): { host: HTMLElement; unmount: () => void } {
    const recon = parseRecPhyloXML(samples.find((x) => x.id === "showcase")!.xml);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Legend theme={lightTheme} recon={recon} />));
    return {
      host,
      unmount: () => {
        act(() => root.unmount());
        host.remove();
      },
    };
  }

  it.each(["en", "zh"] as const)("shows the %s rows of the shared legend table, in order", (locale) => {
    localStorage.setItem("rpv.legend.dir", "v");
    const prev = useStore.getState().locale;
    useStore.setState({ locale });
    const t = translations[locale];
    const { host, unmount } = renderLegend();
    try {
      // The overlay renders the shared `LEGEND_ROWS` table and nothing else, so
      // the exported key can be compared with it row for row (STYLE §6).
      expect(screenRows(host)).toEqual(screenLegendRows({ t, events: t.event }));
      // The row that used to be missing from every export: without a key for
      // the arrival arrowhead, a reader of the figure cannot decode it.
      expect(screenRows(host)).toContain(t.event.transferBack);
    } finally {
      unmount();
      useStore.setState({ locale: prev });
    }
  });

  it("lists ten event marks so the group fills two even rows of five", () => {
    localStorage.setItem("rpv.legend.dir", "h");
    const { host, unmount } = renderLegend();
    try {
      const events = host.querySelector(".legend-group.events")!;
      expect(events).not.toBeNull();
      expect(events.querySelectorAll(".legend-item")).toHaveLength(10);
    } finally {
      unmount();
    }
  });
});

describe("help overlay shortcut table", () => {
  it.each(["en", "zh"] as const)(
    "labels the ←/→ plus Home/End row with what those keys really do (%s)",
    (locale) => {
      const prev = useStore.getState().locale;
      useStore.setState({ locale, helpOpen: true });
      const t = translations[locale];
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      act(() => root.render(<HelpOverlay />));
      try {
        const rows = Array.from(host.querySelectorAll(".help-row")).map((r) => ({
          keys: Array.from(r.querySelectorAll("kbd")).map((k) => k.textContent ?? ""),
          label: r.querySelector(".help-label")?.textContent ?? "",
        }));
        const row = rows.find((r) => r.keys.includes("Home/End"));
        expect(row, "the overlay lists Home/End next to the arrows").toBeDefined();
        // Those four keys belong to the tab strips: `TabBar.tsx` moves to and
        // activates the previous/next DOCUMENT tab and jumps to the first/last,
        // `RightPanel.tsx` does the same across the analysis panel's tabs. The
        // row used to read "Annotations" (`panelAnnotate`) — a panel title no
        // shortcut opens, and a label the manual could not list.
        expect(row!.keys).toEqual(["←/→", "Home/End"]);
        expect(row!.label).toBe(t.helpSwitchTabs);
        expect(row!.label).not.toBe(t.panelAnnotate);
        // ⌘/Ctrl+Enter is bound to the note field inside the annotation editor
        // (`AnnotationEditor.tsx`), so the row says "save the annotation while
        // its editor is open" — not "Annotate", which would promise a gesture
        // that opens nothing. Opening an annotation is the Shift-click row of
        // the interaction table.
        const enterRows = rows.filter((r) => r.keys.includes("Enter"));
        expect(enterRows, "exactly one row claims the Enter chord").toHaveLength(1);
        expect(enterRows[0].label).toBe(t.helpSaveAnnotation);
        expect(enterRows[0].label).not.toBe(t.annoTitle);
        expect(enterRows[0].keys).toEqual(["⌘/Ctrl", "Enter"]);
        expect(rows.find((r) => r.label === t.annoTitle)?.keys).toContain("Shift");
      } finally {
        act(() => root.unmount());
        host.remove();
        useStore.setState({ locale: prev, helpOpen: false });
      }
    },
  );
});

/**
 * GLOSSARY-UI row 36 (空值) / STYLE-GUIDE-UI §3.7: `—` is the ONLY mark for an
 * empty value, in both locales, and `?`, `N/A`, `none`, `unnamed` and
 * `no species` are banned aliases.
 *
 * An audit found the banned `?` in five separate render/export sites at once.
 * src/i18nText.test.ts already sweeps the source text of the display layers for
 * those fallbacks; the cases here cover the other half — that the node inspector
 * actually RENDERS the dictionary mark, in both locales, for a document whose
 * transfer arrival has no donor, no destination and no species.
 */
describe("empty value is marked with the glossary em dash", () => {
  /**
   * A root clade carrying a bare `<transferBack/>` and an attribute-less `<leaf/>`:
   * no donor species, no destination species, no gene name and no species — every
   * slot that used to render `?`.
   */
  const BLANK_DOC = `<recPhylo>
    <spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>
    <recGeneTree><phylogeny><clade><eventsRec><transferBack/><leaf/></eventsRec></clade></phylogeny></recGeneTree>
  </recPhylo>`;
  const blank = parseRecPhyloXML(BLANK_DOC);
  const arrivalNode = blank.geneTrees[0].nodes.find((n) =>
    n.events.some((e) => e.type === "transferBack"),
  );

  /** The inspector's `<dt>`/`<dd>` rows plus its whole visible text. */
  function renderInspector(locale: "en" | "zh"): { rows: Map<string, string>; text: string } {
    const prev = useStore.getState().locale;
    useStore.setState({
      locale,
      recon: blank,
      inspector: { kind: "transfer", id: `tr-${arrivalNode!.id}` },
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<NodeInspector />));
      const rows = new Map<string, string>();
      for (const row of Array.from(host.querySelectorAll(".ni-row"))) {
        rows.set(
          row.querySelector("dt")?.textContent ?? "",
          row.querySelector("dd")?.textContent ?? "",
        );
      }
      expect(rows.size, "the inspector rendered its rows").toBeGreaterThan(0);
      return { rows, text: host.textContent ?? "" };
    } finally {
      act(() => root.unmount());
      host.remove();
      useStore.setState({ locale: prev, recon: null, inspector: null });
    }
  }

  /** The same clade with a species recorded on its leaf event. Comparing the
   *  two documents leaves one species cell blank, which is what the difference
   *  table's mark is about. */
  const SP_DOC = `<recPhylo>
    <spTree><phylogeny><clade><name>R</name><clade><name>A</name></clade><clade><name>B</name></clade></clade></phylogeny></spTree>
    <recGeneTree><phylogeny><clade><eventsRec><transferBack/><leaf speciesLocation="A"/></eventsRec></clade></phylogeny></recGeneTree>
  </recPhylo>`;
  const withSpecies = parseRecPhyloXML(SP_DOC);

  /**
   * Mounts the analysis panel on `tab` and hands back the first table row's
   * cells plus the panel's text. The gene-node table lives in a collapsed
   * section, so its own header is clicked open the way a user would.
   */
  function renderPanelRow(locale: "en" | "zh", tab: "stats" | "diff"): { cells: string[]; text: string } {
    const prev = useStore.getState();
    const t = translations[locale];
    useStore.setState({
      locale,
      recon: blank,
      compare: tab === "diff" ? withSpecies : null,
      rightPanelOpen: true,
      rightPanelTab: tab,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<RightPanel />));
      if (tab === "stats") {
        const head = Array.from(host.querySelectorAll<HTMLButtonElement>("button.rp-collapse-head")).find(
          (b) => (b.textContent ?? "").includes(t.statsNodes),
        );
        expect(head, "the gene-node section is rendered").toBeDefined();
        act(() => {
          head!.click();
        });
      }
      const row = host.querySelector(tab === "stats" ? ".rp-node-table tbody tr" : ".rp-table tbody tr");
      expect(row, `the ${tab} table rendered a row`).not.toBeNull();
      return {
        cells: Array.from(row!.querySelectorAll("td")).map((td) => td.textContent ?? ""),
        text: host.textContent ?? "",
      };
    } finally {
      act(() => root.unmount());
      host.remove();
      useStore.setState({
        locale: prev.locale,
        recon: prev.recon,
        compare: prev.compare,
        rightPanelOpen: prev.rightPanelOpen,
        rightPanelTab: prev.rightPanelTab,
      });
    }
  }

  /**
   * The node and difference tables used to write the mark as a `"\u2014"`
   * escape inside the component - banned twice over by STYLE-GUIDE-UI: §2.10
   * (no `\uXXXX` escape in a UI string) and §5.1 (on-screen copy comes from
   * `src/i18n.ts`). Comparing the cell with the dictionary value pins both, in
   * both languages.
   */
  it.each(["en", "zh"] as const)(
    "marks the blank cells of the gene-node table with the dictionary value (%s)",
    (locale) => {
      const t = translations[locale];
      const { cells, text } = renderPanelRow(locale, "stats");
      // Columns: number, name, kind, event, species.
      expect(cells[1], "an unnamed node is marked, not left empty").toBe(t.inspNone);
      expect(cells[4], "a node with no species is marked, not left empty").toBe(t.inspNone);
      expect(text).not.toContain("(unnamed)");
      expect(text).not.toContain("N/A");
      // One mark for one concept, identical in both languages (GLOSSARY row 36).
      expect(translations.en.inspNone).toBe(translations.zh.inspNone);
    },
  );

  it.each(["en", "zh"] as const)(
    "marks the blank species column of the difference table with the dictionary value (%s)",
    (locale) => {
      const t = translations[locale];
      const { cells } = renderPanelRow(locale, "diff");
      // Columns: name, event A, event B, species A, species B, status.
      expect(cells[3], "the side that records no species is marked").toBe(t.inspNone);
      expect(cells[4], "the side that records a species shows it").toBe("A");
    },
  );

  it("reaches the transfer-arrival inspector these cases are about", () => {
    // Guards every case below: if the fixture stopped producing a transfer
    // inspector, the assertions would pass vacuously.
    expect(arrivalNode).toBeDefined();
    expect(blank.geneTrees[0].nodes).toHaveLength(1);
    const t = translations.en;
    const { rows } = renderInspector("en");
    expect(rows.has(t.inspDonor)).toBe(true);
    expect(rows.has(t.inspRecipient)).toBe(true);
  });

  it.each(["en", "zh"] as const)("marks the blank species and donor of an arrival with `—` (%s)", (locale) => {
    const t = translations[locale];
    const { rows } = renderInspector(locale);
    // Exact equality, so a re-introduced `?` or `(none)` fails here.
    expect(rows.get(t.inspSpecies)).toBe("\u2014");
    expect(rows.get(t.inspDonor)).toBe("\u2014");
    // The sibling arrival row spells the pair out; both ends are blank here.
    expect(rows.get(t.event.transferBack)).toBe("\u2014 \u2192 \u2014");
  });

  it.each(["en", "zh"] as const)("leaves no banned empty-value alias in the inspector card (%s)", (locale) => {
    const { text } = renderInspector(locale);
    expect(text).not.toContain("?");
    expect(text).not.toContain("(unnamed)");
    expect(text).not.toContain("N/A");
    // The dictionary mark is the same character in both locales (GLOSSARY 36).
    expect(translations[locale].inspNone).toBe("\u2014");
  });

  it("marks the donor with the dictionary mark, not with a parser placeholder", () => {
    // The `?` this replaces came from the transfer-donor fallback, so a
    // regression can show up either as a literal `?` or as the `?` a reader
    // injected into `speciesLocation` upstream. Both are caught by requiring
    // the row to be exactly the dictionary value (`inspNone`, `—`).
    const t = translations.en;
    const { rows } = renderInspector("en");
    expect(rows.get(t.inspDonor)).toBe(t.inspNone);
    expect(rows.get(t.inspDonor)).not.toContain("?");
    // Same value for the same concept in both locales (GLOSSARY row 36).
    expect(translations.zh.inspNone).toBe(translations.en.inspNone);
    expect(renderInspector("zh").rows.get(translations.zh.inspDonor)).toBe("\u2014");
  });
});

/**
 * STYLE-GUIDE-UI §5.2 / §3.5: a date or number is formatted with the BCP-47 tag
 * from the single-source `intlTag` map in `src/i18n.ts`, never with a
 * `locale === "zh" ? "zh-CN" : "en-US"` ternary in the component. The tags are
 * spelled out per locale below (and the other locale's tag is asserted absent),
 * so a call site that drops the argument and falls back to the runtime default
 * fails instead of passing quietly.
 */
describe("the preferences dialog formats the autosave time for the UI locale", () => {
  const TS = Date.UTC(2026, 2, 4, 6, 30, 0);
  const cases = [
    ["en", "en-US", "zh-CN"],
    ["zh", "zh-CN", "en-US"],
  ] as const;

  it.each(cases)("renders the %s dialog's last-save line with the %s tag", (locale, tag, otherTag) => {
    const prev = useStore.getState();
    const t = translations[locale];
    // The two tags must really disagree, or the absent-the-other-tag assertion
    // below would prove nothing.
    const fromTag = new Date(TS).toLocaleString(tag);
    const fromOther = new Date(TS).toLocaleString(otherTag);
    expect(fromTag).not.toBe(fromOther);
    useStore.setState({ locale, autosaveAt: TS, autosaveFailed: false });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<Settings open onClose={() => undefined} />));
      const notes = Array.from(host.querySelectorAll("p.settings-note")).map((n) => n.textContent ?? "");
      expect(notes, "the autosave line is rendered").toContain(t.autosaveOn.replace("{time}", fromTag));
      expect(notes.join(" ")).not.toContain(fromOther);
    } finally {
      act(() => root.unmount());
      host.remove();
      useStore.setState({
        locale: prev.locale,
        autosaveAt: prev.autosaveAt,
        autosaveFailed: prev.autosaveFailed,
      });
    }
  });
});
