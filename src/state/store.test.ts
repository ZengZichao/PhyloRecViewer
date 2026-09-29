import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore, friendlyParseError } from "./store";
import { parseRecPhyloXML } from "../parser/recphyloxml";

// jsdom lacks matchMedia; the store reads it at init and on theme changes.
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
  useStore.setState({
    xml: null,
    fileName: null,
    recon: null,
    error: null,
    warnings: [],
    nested: null, nestedName: null, nestedXml: null, nestedError: null,
    compare: null, compareName: null, compareXml: null, compareError: null,
    swapped: new Set(), nestedSwapped: new Set(), collapsed: new Set(),
    geneColors: {}, annotations: {}, annotating: null,
    sampleId: null, searchQuery: "", searchRegex: false, onlyMatches: false,
    eventFilter: { speciation: true, duplication: true, loss: true, transfer: true, leaf: true },
    familyFilter: null, confidenceMin: 0, confidenceMax: 1, locate: null,
    past: [], future: [], pendingMulti: null,
    // Tab state is module-global in the store: without this reset, a test that
    // opened tabs leaves them behind for the next one.
    tabs: [{ id: "tab-1", title: "" }], activeTabId: "tab-1", docs: {}, lazyDoc: null,
  });
});

const NHX = "((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];";

/** A species tree where the name "A" sits on TWO different clades: the shape
 *  that makes a name-keyed mirror set mirror unrelated branches. */
const DUP_NAME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<recPhylo>
  <spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name><clade><name>A1</name></clade><clade><name>A2</name></clade></clade>
    <clade><name>A</name><clade><name>A3</name></clade><clade><name>A4</name></clade></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true"><clade><name>r</name>
    <eventsRec><speciation speciesLocation="R"/></eventsRec>
    <clade><eventsRec><leaf speciesLocation="A1" geneName="g1"/></eventsRec></clade>
    <clade><eventsRec><leaf speciesLocation="A3" geneName="g2"/></eventsRec></clade>
  </clade></phylogeny></recGeneTree>
</recPhylo>`;

/** A File whose `text()` resolves after `delay` ms (a slow read / drop). */
function fakeFile(name: string, text: string, delay = 0): File {
  return {
    name,
    text: () => new Promise((res) => setTimeout(() => res(text), delay)),
  } as unknown as File;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("heavy tasks never wait on a frame that may never come", () => {
  it("runHeavy runs and clears the overlay when rAF never fires", async () => {
    // A background tab / minimized or occluded Tauri window stops painting:
    // requestAnimationFrame is called back with nothing, ever.
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 0 as unknown as number);
    try {
      let ran = false;
      await useStore.getState().runHeavy(() => {
        useStore.getState().loadXml(NHX, "sample.nhx");
        ran = true;
      });
      expect(ran).toBe(true);
      expect(useStore.getState().recon).not.toBeNull();
      expect(useStore.getState().loading).toBe(false);
    } finally {
      raf.mockRestore();
    }
  });

  it("openFiles loads a dropped file even when rAF never fires", async () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 0 as unknown as number);
    try {
      await useStore.getState().openFiles([fakeFile("dropped.nhx", NHX, 5)]);
      expect(useStore.getState().fileName).toBe("dropped.nhx");
      expect(useStore.getState().recon).not.toBeNull();
      expect(useStore.getState().loading).toBe(false);
    } finally {
      raf.mockRestore();
    }
  });

  it("an exception inside a heavy task clears the overlay", async () => {
    const before = useStore.getState().loading;
    await useStore.getState().runHeavy(() => {
      throw new Error("boom");
    });
    expect(useStore.getState().loading).toBe(before);
    expect(useStore.getState().error).toContain("boom");
  });
});

describe("concurrent opens: destination tab and loading ref-count", () => {
  it("lands a dropped document in a tab of its own, never the one the user moved to", async () => {
    useStore.getState().loadXml(NHX, "first.nhx");
    const tabA = useStore.getState().activeTabId;
    useStore.getState().newTab();
    useStore.getState().switchTab(tabA); // back onto the document tab

    const p = useStore.getState().openFiles([fakeFile("dropped.nhx", NHX, 30)]);
    await sleep(5);
    // The user opens another tab while the file is still being read:
    useStore.getState().newTab();
    const tabC = useStore.getState().activeTabId;
    await p;

    const st = useStore.getState();
    // claimTabForLoad never overwrites a tab that already holds work, so the
    // drop got a tab of its own ...
    expect(st.docs[tabA]?.fileName).toBe("first.nhx");
    // ... the document is present somewhere rather than lost or aimed at the
    // tab that became frontmost during the read, ...
    const all = [st.fileName, ...Object.values(st.docs).map((d) => d.fileName ?? null)];
    expect(all).toContain("dropped.nhx");
    expect(st.docs[tabC]?.fileName ?? null).toBeNull();
    // ... and the user keeps the tab they moved to.
    expect(st.activeTabId).toBe(tabC);
    expect(st.fileName).toBeNull();
    expect(st.loading).toBe(false);
  });

  it("keeps the overlay up until the LAST concurrent read finishes", async () => {
    const fast = useStore.getState().openFiles([fakeFile("fast.nhx", NHX, 0)]);
    const slow = useStore.getState().openFiles([fakeFile("slow.nhx", NHX, 60)]);
    await sleep(20);
    // Two drops never aim at the same tab, so each one gets its own.
    expect(useStore.getState().tabs.length).toBe(2);
    expect(useStore.getState().loading).toBe(true);
    await fast;
    expect(useStore.getState().loading).toBe(true);
    await slow;
    expect(useStore.getState().loading).toBe(false);
    const st = useStore.getState();
    const titles = [st.fileName, ...Object.values(st.docs).map((d) => d.fileName)].sort();
    expect(titles).toEqual(["fast.nhx", "slow.nhx"]);
  });

  it("reopen a document in a fresh tab when its destination tab was closed", async () => {
    const p = useStore.getState().openFiles([fakeFile("gone.nhx", NHX, 20)]);
    await sleep(5);
    useStore.getState().closeTab(useStore.getState().activeTabId);
    await p;
    expect(useStore.getState().fileName).toBe("gone.nhx");
    expect(useStore.getState().loading).toBe(false);
  });

  it("routes a read failure to the tab it belongs to, not the front tab", async () => {
    useStore.getState().loadXml(NHX, "front.nhx");
    const tabA = useStore.getState().activeTabId;
    const broken = {
      name: "bad.nhx",
      text: () => Promise.reject(new Error("EISDIR: illegal operation on a directory")),
    } as unknown as File;
    const p = useStore.getState().openFiles([broken]);
    await sleep(5);
    useStore.getState().newTab();
    useStore.getState().loadXml(NHX, "other.nhx");
    await p;
    const st = useStore.getState();
    // The document the user is looking at is untouched and shows no error ...
    expect(st.fileName).toBe("other.nhx");
    expect(st.error).toBeNull();
    expect(st.docs[tabA]?.error ?? null).toBeNull();
    // ... while the tab the failed read was aimed at records it, so the failure
    // is discoverable instead of vanishing.
    const failed = Object.values(st.docs).filter((d) => d?.error);
    expect(failed.length).toBeGreaterThan(0);
    expect(String(failed[0].error)).toContain("EISDIR");
    expect(st.loading).toBe(false);
  });

  it("loadNestedXml pushes a history step and undo removes the nested layer", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    const n = useStore.getState().past.length;
    useStore.getState().loadNestedXml(NHX, "nested.nhx");
    expect(useStore.getState().past.length).toBe(n + 1);
    expect(useStore.getState().nested).not.toBeNull();
    useStore.getState().undo();
    expect(useStore.getState().nested).toBeNull();
    expect(useStore.getState().fileName).toBe("a.nhx");
  });

  it("loadCompareXml pushes a history step and undo removes the compare layer", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    const n = useStore.getState().past.length;
    useStore.getState().loadCompareXml(NHX, "b.nhx");
    expect(useStore.getState().past.length).toBe(n + 1);
    expect(useStore.getState().compare).not.toBeNull();
    useStore.getState().undo();
    expect(useStore.getState().compare).toBeNull();
  });

  it("a nested load does not steal the pre-drag snapshot of an open slider run", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().setLayout({ levelHeight: 111 }); // starts a merge window
    useStore.getState().loadNestedXml(NHX, "nested.nhx"); // must end it
    useStore.getState().setLayout({ levelHeight: 222 });
    useStore.getState().undo();
    // Undo returns to the value before the SECOND drag, not to the one the
    // nested load would have merged away.
    expect(useStore.getState().layoutOptions.levelHeight).toBe(111);
  });
});

describe("toast dismissal by identity", () => {
  it("a repeated identical message is not cleared by the earlier timer", () => {
    vi.useFakeTimers();
    try {
      const show = (m: string) => useStore.getState().showToast(m, "success");
      show("saved");
      vi.advanceTimersByTime(3000);
      show("saved"); // same text, second toast
      vi.advanceTimersByTime(1000); // the first toast's 4s deadline passes
      expect(useStore.getState().toast?.msg).toBe("saved");
      vi.advanceTimersByTime(3001); // the second one expires
      expect(useStore.getState().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("each toast gets a fresh id", () => {
    useStore.getState().showToast("one", "info");
    const first = useStore.getState().toast;
    useStore.getState().showToast("one", "info");
    const second = useStore.getState().toast;
    expect(first).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });
});

describe("mirrored clades keyed by species identity", () => {
  it("stores the species-node id so two same-named clades can differ", () => {
    useStore.getState().loadXml(DUP_NAME_XML, "dup.xml");
    const dupes = useStore.getState().recon!.species.nodes.filter((n) => n.name === "A");
    expect(dupes.length).toBe(2);
    expect(dupes[0].id).not.toBe(dupes[1].id);

    useStore.getState().toggleSwap(dupes[0].id);
    const swapped = useStore.getState().swapped;
    expect(swapped.has(dupes[0].id)).toBe(true);
    expect(swapped.has(dupes[1].id)).toBe(false);

    useStore.getState().toggleSwap(dupes[0].id);
    expect(useStore.getState().swapped.has(dupes[0].id)).toBe(false);
  });

  it("mirrors both same-named clades independently and keeps the shared name while one is on", () => {
    useStore.getState().loadXml(DUP_NAME_XML, "dup.xml");
    const [a1, a2] = useStore.getState().recon!.species.nodes.filter((n) => n.name === "A");
    useStore.getState().toggleSwap(a1.id);
    useStore.getState().toggleSwap(a2.id);
    useStore.getState().toggleSwap(a1.id);
    const swapped = useStore.getState().swapped;
    expect(swapped.has(a1.id)).toBe(false);
    // a2 remains mirrored, so the shared name key has to stay in the set.
    expect(swapped.has(a2.id)).toBe(true);
    expect(swapped.has("A")).toBe(true);
  });

  it("a click that sends a bare species name mirrors by name", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    const rabbit = useStore.getState().recon!.species.nodes.find((n) => n.name === "Rabbit");
    useStore.getState().toggleSwap("Rabbit");
    const swapped = useStore.getState().swapped;
    expect(swapped.has("Rabbit")).toBe(true);
    // The resolved node id rides along so an id-keyed consumer sees the same
    // clade the user clicked.
    expect(rabbit ? swapped.has(rabbit.id) : false).toBe(true);
    useStore.getState().toggleSwap("Rabbit");
    expect(useStore.getState().swapped.size).toBe(0);
  });

  it("nested swaps stay in their own set", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().loadNestedXml(NHX, "nested.nhx");
    const nestedRabbit = useStore.getState().nested!.species.nodes.find((n) => n.name === "Rabbit");
    useStore.getState().toggleNestedSwap(nestedRabbit!.id);
    expect(useStore.getState().nestedSwapped.has(nestedRabbit!.id)).toBe(true);
    expect(useStore.getState().swapped.has(nestedRabbit!.id)).toBe(false);
  });
});

describe("lazily restored tabs", () => {
  it("switchTab parses a stashed document on first activation only", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    const tabA = useStore.getState().activeTabId;
    useStore.getState().newTab();
    // Stash a not-yet-parsed snapshot in the background tab, exactly like
    // `restoreTabs` does.
    useStore.setState((s) => ({
      docs: {
        ...s.docs,
        [tabA]: { ...s.docs[tabA]!, recon: null, lazyDoc: { title: "a.nhx", xml: NHX } as never },
      },
    }));
    expect(useStore.getState().docs[tabA].recon).toBeNull();

    useStore.getState().switchTab(tabA);
    const st = useStore.getState();
    expect(st.recon).not.toBeNull();
    expect(st.lazyDoc).toBeNull();
    expect(st.fileName).toBe("a.nhx");
  });

  it("an unparsable lazy tab keeps its document and reports it by name", () => {
    const toast = vi.fn();
    useStore.setState({ showToast: toast as never, locale: "en" });
    useStore.getState().loadXml(NHX, "a.nhx");
    const tabA = useStore.getState().activeTabId;
    useStore.getState().newTab();
    useStore.setState((s) => ({
      docs: {
        ...s.docs,
        [tabA]: {
          ...s.docs[tabA]!,
          xml: "###not a tree###",
          fileName: "corrupt.nhx",
          recon: null,
          lazyDoc: { title: "corrupt.nhx", xml: "###not a tree###" } as never,
        },
      },
      // A restored tab carries its own title in the tab bar.
      tabs: s.tabs.map((tb) => (tb.id === tabA ? { ...tb, title: "corrupt.nhx" } : tb)),
    }));
    useStore.getState().switchTab(tabA);
    const st = useStore.getState();
    expect(st.recon).toBeNull();
    expect(st.error).not.toBeNull();
    // The raw document survives, so the next autosave stores it.
    expect(st.xml).toBe("###not a tree###");
    expect(toast.mock.calls.some((c) => String(c[0]).includes("corrupt.nhx"))).toBe(true);
  });
});

describe("undo/redo covers layout & render options", () => {
  it("records layout changes and undoes them", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    const before = useStore.getState().layoutOptions.levelHeight;
    useStore.getState().setLayout({ levelHeight: before + 40 });
    expect(useStore.getState().layoutOptions.levelHeight).toBe(before + 40);
    useStore.getState().undo();
    expect(useStore.getState().layoutOptions.levelHeight).toBe(before);
    useStore.getState().redo();
    expect(useStore.getState().layoutOptions.levelHeight).toBe(before + 40);
  });

  it("merges rapid slider drags into one history step", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    // Default geneGap is 16; a fast drag 20 -> 22 -> 24 must collapse into one
    // undo step that returns to the value before the whole run started (16),
    // not to an intermediate value like 22.
    useStore.getState().setLayout({ geneGap: 20 });
    useStore.getState().setLayout({ geneGap: 22 });
    useStore.getState().setLayout({ geneGap: 24 });
    expect(useStore.getState().layoutOptions.geneGap).toBe(24);
    useStore.getState().undo();
    expect(useStore.getState().layoutOptions.geneGap).toBe(16);
  });
});

describe("parse errors are recoverable", () => {
  it("keeps the previous good document and file name on failure", () => {
    useStore.getState().loadXml(NHX, "good.nhx");
    expect(useStore.getState().recon).not.toBeNull();
    expect(useStore.getState().fileName).toBe("good.nhx");

    useStore.getState().loadXml("<broken>", "bad.xml");
    expect(useStore.getState().error).not.toBeNull();
    // Breadcrumb must not show the bad file name.
    expect(useStore.getState().fileName).toBe("good.nhx");
    // The previous document remains available via clearError.
    useStore.getState().clearError();
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().recon).not.toBeNull();
  });
});

describe("undo open (back to previous document)", () => {
  it("restores the previous document after loading a new file", () => {
    useStore.getState().loadXml(NHX, "first.nhx");
    useStore.getState().loadXml(NHX, "second.nhx");
    expect(useStore.getState().fileName).toBe("second.nhx");
    useStore.getState().undo();
    expect(useStore.getState().fileName).toBe("first.nhx");
    expect(useStore.getState().recon).not.toBeNull();
  });
});

describe("per-tab document isolation", () => {
  it("stashes and restores per-document state across tab switches", () => {
    useStore.getState().loadXml(NHX, "tab-a.nhx");
    useStore.getState().toggleSwap("Rabbit");
    useStore.getState().setAnnotation("g0_0_0", "note", "#ff0000");
    useStore.getState().newTab();
    // The new tab is a blank document.
    expect(useStore.getState().fileName).toBeNull();
    expect(useStore.getState().swapped.size).toBe(0);
    // Back to the first tab: its document AND its view state return.
    const firstTabId = useStore.getState().tabs[0].id;
    useStore.getState().switchTab(firstTabId);
    expect(useStore.getState().fileName).toBe("tab-a.nhx");
    expect(useStore.getState().swapped.has("Rabbit")).toBe(true);
    expect(useStore.getState().annotations["g0_0_0"]).toBeDefined();
  });

  it("resets labelOverrides when a new document is loaded", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().setLabelOverride("Rabbit", "Lepus");
    expect(useStore.getState().labelOverrides.Rabbit).toBe("Lepus");
    useStore.getState().loadXml(NHX, "b.nhx");
    // Old file's renames must not leak into the new document.
    expect(useStore.getState().labelOverrides).toEqual({});
  });

  it("gives each tab an independent undo history (no cross-tab merge)", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().setLayout({ levelHeight: 111 });
    useStore.getState().newTab();
    useStore.getState().loadXml(NHX, "b.nhx");
    // Edit immediately after switching tabs: the merge window from tab A's
    // slider must not overwrite tab B's first history entry.
    useStore.getState().setLayout({ levelHeight: 222 });
    useStore.getState().undo();
    expect(useStore.getState().layoutOptions.levelHeight).not.toBe(222);
    expect(useStore.getState().fileName).toBe("b.nhx");
  });
});

describe("preference persistence", () => {
  it("persists theme and locale to localStorage", () => {
    useStore.getState().setTheme("dark");
    useStore.getState().setLocale("en");
    const saved = JSON.parse(localStorage.getItem("rpv.prefs") ?? "{}");
    expect(saved.themeId).toBe("dark");
    expect(saved.locale).toBe("en");
  });
});

describe("friendlyParseError", () => {
  // Drive it from the REAL parser output, not hand-written strings, so the
  // message shown to a user is the one actually produced.
  function thrown(fn: () => unknown): Error {
    try {
      fn();
    } catch (e) {
      return e as Error;
    }
    throw new Error("expected the parser to throw");
  }
  it("empty input yields the actionable 'empty' message with format hints", () => {
    const msg = friendlyParseError(thrown(() => parseRecPhyloXML("   ")));
    expect(msg).toMatch(/empty/i);
    expect(msg).toMatch(/NHX/);
    expect(msg).toMatch(/Newick/);
  });
  it("non-recPhylo content keeps the technical detail and lists formats", () => {
    const msg = friendlyParseError(thrown(() => parseRecPhyloXML("<notrecphylo/>")));
    expect(msg).toMatch(/Supported: recPhyloXML/);
    expect(msg).toMatch(/NHX/);
  });
});

describe("applyViewState history", () => {
  it("preserves undo history when resetHistory is false", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().setLayout({ levelHeight: 120 }); // pushes a history step
    expect(useStore.getState().past.length).toBeGreaterThan(0);
    const before = useStore.getState().past.length;
    useStore.getState().applyViewState({
      layoutOptions: { ...useStore.getState().layoutOptions, geneGap: 30 },
      resetHistory: false,
    });
    expect(useStore.getState().past.length).toBe(before);
  });
  it("clears undo history by default (session restore)", () => {
    useStore.getState().loadXml(NHX, "a.nhx");
    useStore.getState().setLayout({ levelHeight: 120 });
    useStore.getState().applyViewState({ themeId: "dark" });
    expect(useStore.getState().past.length).toBe(0);
  });
});
