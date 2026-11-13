/**
 * Pins for the autosave contract: the snapshot signature is content-sensitive,
 * a "+ new tab" click never wipes a workspace whose other tabs hold content,
 * the multi-file `sourceFiles` list survives a session round-trip, and a
 * restore never fills a missing name with an internal English token.
 *
 * These drive the store directly (writeAutosave reads store state and never
 * re-parses), so the xml content is an opaque non-null string by design.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore } from "./store";
import { restoreAutosave, restoreTabs, savedTabsOfStore, writeAutosave } from "./autosave";
import { parseReconciliation } from "../parser/formats";
import type { Reconciliation } from "../model/types";
import {
  serializeSession,
  parseSession,
  CURRENT_SESSION_VERSION,
  type SavedTab,
  type SessionData,
} from "../session";
import { translations } from "../i18n";

const KEY = "rpv.autosave.v1";

function resetWorkspace() {
  localStorage.clear();
  useStore.setState({
    xml: null, fileName: null, recon: null, error: null, warnings: [],
    sourceFiles: null,
    tabs: [{ id: "tab-1", title: "" }], activeTabId: "tab-1", docs: {},
  });
  // Force the module-level `lastSignature` cache back to its empty baseline.
  writeAutosave();
}

describe("autosave signature is content-sensitive", () => {
  beforeEach(resetWorkspace);

  it("rewrites the snapshot when only a layout-option value changes", () => {
    useStore.setState({ xml: "<doc/>", fileName: "a" });
    writeAutosave();
    const first = localStorage.getItem(KEY);
    expect(first).not.toBeNull();

    const base = useStore.getState().layoutOptions;
    useStore.setState({ layoutOptions: { ...base, geneGap: base.geneGap + 5 } });
    writeAutosave();

    // Folding the options object into the fingerprint yields "[object Object]",
    // so a slider move would leave the signature untouched and skip the write.
    expect(localStorage.getItem(KEY)).not.toEqual(first);
  });

  it("rewrites the snapshot when xml content changes but byte-length is identical", () => {
    useStore.setState({ xml: "AAAA", fileName: "a" });
    writeAutosave();
    const first = localStorage.getItem(KEY);
    expect(first).not.toBeNull();

    useStore.setState({ xml: "BBBB" }); // same length, different content
    writeAutosave();

    // Fingerprinting xml by length alone would read a same-length edit as
    // "no change" and skip the write.
    expect(localStorage.getItem(KEY)).not.toEqual(first);
  });
});

describe("'+ new tab' must not wipe the whole-workspace autosave", () => {
  beforeEach(resetWorkspace);

  it("keeps the snapshot while an inactive tab holds content", () => {
    useStore.setState({ xml: "<doc/>", fileName: "a", tabs: [{ id: "tab-1", title: "a" }], activeTabId: "tab-1", docs: {} });
    writeAutosave();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    // Real newTab(): blanks the active doc but stashes the previous one into docs.
    useStore.getState().newTab();
    writeAutosave();

    expect(useStore.getState().xml).toBeNull(); // active tab really is blank
    expect(localStorage.getItem(KEY)).not.toBeNull(); // snapshot survives via other tabs
  });
});

describe("session serialization preserves multi-file sourceFiles", () => {
  it("a round-trip through serializeSession/parseSession keeps all merged files", () => {
    const merged = [
      { name: "famA.xml", text: "<a/>" },
      { name: "famB.xml", text: "<b/>" },
      { name: "famC.xml", text: "<c/>" },
    ];
    const s = useStore.getState();
    const session: SessionData = {
      version: CURRENT_SESSION_VERSION,
      fileName: "3 files",
      xml: "<a/>",
      sourceFiles: merged,
      layoutOptions: s.layoutOptions,
      renderOptions: s.renderOptions,
      themeId: s.themeId,
      swapped: [],
      nestedSwapped: [],
      collapsed: [],
      geneColors: {},
    };
    const text = serializeSession(session);
    const parsed = parseSession(text);
    expect(parsed.sourceFiles?.length).toBe(3);
    expect(parsed.sourceFiles?.map((f) => f.name)).toEqual(["famA.xml", "famB.xml", "famC.xml"]);
  });
});

/**
 * Localization pins (STYLE-GUIDE-UI 5.3 / GLOSSARY-UI rule 1). A restore must
 * never invent an English placeholder for a name it does not have: the tab, the
 * document and the failure toast fall back to the dictionary instead.
 */
describe("a nameless restored tab stays nameless", () => {
  beforeEach(resetWorkspace);

  /** The minimum a `SavedTab` must carry; `title` is what is under test. */
  const savedTab = (title: string | null): SavedTab => ({
    title,
    xml: "<recPhylo/>",
    swapped: [],
    nestedSwapped: [],
    collapsed: [],
    geneColors: {},
  });

  it("restores a null tab title and a null document fileName, not the word \"tab\"", () => {
    const ids = restoreTabs([savedTab(null)]);
    expect(ids).toHaveLength(1);
    const st = useStore.getState();
    expect(st.tabs.find((t) => t.id === ids[0])?.title).toBeNull();
    expect(st.docs[ids[0]]?.fileName).toBeNull();
  });

  it("keeps a titled tab's own name", () => {
    const ids = restoreTabs([savedTab("famA.xml")]);
    const st = useStore.getState();
    expect(st.tabs.find((t) => t.id === ids[0])?.title).toBe("famA.xml");
    expect(st.docs[ids[0]]?.fileName).toBe("famA.xml");
  });

  it("treats an empty saved title as no name as well", () => {
    const tabIds = restoreTabs([{ ...savedTab(""), xml: FRONT }]);
    const st = useStore.getState();
    expect(st.tabs.find((t) => t.id === tabIds[0])?.title).toBeNull();
    expect(st.docs[tabIds[0]]?.fileName).toBeNull();
    // And the lazy parse of that tab must hash the nameless seed, not `""`.
    useStore.getState().switchTab(tabIds[0]);
    expect(ids(useStore.getState().recon)).toEqual(ids(parseReconciliation(FRONT, "session")));
  });

  it("writes the nameless tab back out with a null title", () => {
    restoreTabs([savedTab(null)]);
    const saved = savedTabsOfStore().find((t) => t.xml === "<recPhylo/>");
    expect(saved?.title).toBeNull();
  });
});

describe("restore failure toasts speak the UI language", () => {
  beforeEach(resetWorkspace);

  /** Every toast message the restore produced, joined for substring checks. */
  function toastText(toast: ReturnType<typeof vi.fn>): string {
    return toast.mock.calls.map((c) => String(c[0])).join("\n");
  }

  /** Capture the toasts a restore attempt raises. */
  function restoreWith(locale: "zh" | "en"): string {
    const toast = vi.fn();
    useStore.setState({ showToast: toast as never, locale });
    // A snapshot whose every layer refuses to parse and which carries no file
    // names: exactly the case that used to print the internal field names.
    const bad = "###not a tree###";
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: CURRENT_SESSION_VERSION,
        xml: bad,
        fileName: null,
        nestedXml: bad,
        nestedName: null,
        compareXml: bad,
        compareName: null,
      }),
    );
    expect(restoreAutosave()).toBe(false);
    return toastText(toast);
  }

  it("names the panes under zh and never leaks session / nested / compare", () => {
    const msg = restoreWith("zh");
    expect(msg).toContain(translations.zh.paneTagA);
    expect(msg).toContain(translations.zh.paneSymbiontHost);
    expect(msg).toContain(translations.zh.paneComparison);
    // The names are joined with the Chinese list separator, which is copy and
    // therefore comes from the catalogue - not from a `locale === "zh" ? "、" :
    // ", "` in the restore path (STYLE-GUIDE-UI.md §5.2, §2). The en test below
    // pins its own join, so a fallback to the ASCII comma here would pass
    // without this assertion.
    expect(msg).toContain(
      [
        translations.zh.paneTagA,
        translations.zh.paneSymbiontHost,
        translations.zh.paneComparison,
      ].join(translations.zh.listSeparator),
    );
    // The whole-snapshot wording, with the three panes listed in Chinese.
    expect(msg).toContain(translations.zh.restoreFailed.split("{names}")[0]);
    expect(/session|nested|compare/.test(msg)).toBe(false);
  });

  it("lists the same dictionary pane labels under en", () => {
    const msg = restoreWith("en");
    expect(msg).toContain(
      `${translations.en.paneTagA}, ${translations.en.paneSymbiontHost}, ${translations.en.paneComparison}`,
    );
  });

  it("leaves the restored document, nested and compare layers unnamed", () => {
    restoreWith("zh");
    const st = useStore.getState();
    expect(st.fileName).toBeNull();
    expect(st.nestedName).toBeNull();
    expect(st.compareName).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Node-id namespace seeds across a session restore                   *
 * ------------------------------------------------------------------ */

/** Gene plus species node ids of one parse ([] when nothing was parsed). */
const ids = (r: Reconciliation | null): string[] =>
  r
    ? [
        ...r.species.nodes.map((n) => n.id),
        ...r.geneTrees.flatMap((t) => t.nodes.map((n) => n.id)),
      ]
    : [];

const FRONT =
  "((rabbit_g1[&&NHX:S=Rabbit:D=N],rabbit_g2[&&NHX:S=Rabbit:D=N])[&&NHX:S=Rabbit:D=Y],platypus_g[&&NHX:S=Platypus:D=N])[&&NHX:S=Mammalia:D=N];";
/** A second, unrelated document for the background tab. */
const OTHER =
  "((yeast_g1[&&NHX:S=Sacc:D=N],mold_g1[&&NHX:S=Asper:D=N])[&&NHX:S=Fungi:D=Y],amoeba_g[&&NHX:S=Amoe:D=N])[&&NHX:S=Eukaryota:D=N];";

/** One inner gene node id of the live document, for a collapse / annotation. */
function someGeneId(r: Reconciliation | null): string {
  const node = r?.geneTrees[0]?.nodes.find((n) => n.children.length > 0);
  if (!node) throw new Error("expected a gene node with children to collapse");
  return node.id;
}

/** Restore a raw snapshot the way a launch would, and return the live state. */
function restoreLegacy(obj: Record<string, unknown>): ReturnType<typeof useStore.getState> {
  localStorage.setItem(KEY, JSON.stringify({ version: CURRENT_SESSION_VERSION, ...obj }));
  expect(restoreAutosave()).toBe(true);
  return useStore.getState();
}

/**
 * Two halves of one contract. The previous build persisted its own parse seed
 * as the document name ("fileName": "session", "title": "tab", "nestedName":
 * "nested", "compareName": "compare"), so those tokens now have to read back
 * as "no name" for the localized label - WITHOUT changing the seed, because
 * node ids hash it and every persisted collapse / swap / annotation set is
 * keyed by node id. `title` and `fileName` share the one nameless seed, so a
 * nameless document restores identically in either role. Unlike the tests
 * above, these parse for real, so the documents below are valid trees; the
 * expected ids are derived from `parseReconciliation(xml, <the literal HEAD
 * passed>)`, never recorded.
 */
describe("a session restore reproduces HEAD's node ids", () => {
  beforeEach(resetWorkspace);

  it("keeps the oracle honest: an unnamed seed really does renumber the tree", () => {
    expect(ids(parseReconciliation(FRONT, "session"))).not.toEqual(
      ids(parseReconciliation(FRONT, "")),
    );
  });

  it("reads the persisted placeholders back as no name and keeps the front seed", () => {
    const st = restoreLegacy({ xml: FRONT, fileName: "session" });
    expect(st.fileName).toBeNull();
    expect(ids(st.recon)).toEqual(ids(parseReconciliation(FRONT, "session")));
  });

  it("keeps the nested layer's \"nested\" seed while dropping its displayed name", () => {
    const st = restoreLegacy({
      xml: FRONT,
      fileName: "session",
      nestedXml: OTHER,
      nestedName: "nested",
    });
    expect(st.nestedName).toBeNull();
    expect(ids(st.nested)).toEqual(ids(parseReconciliation(OTHER, "nested")));
  });

  it("keeps the compare layer's \"compare\" seed while dropping its displayed name", () => {
    const st = restoreLegacy({
      xml: FRONT,
      fileName: "session",
      compareXml: OTHER,
      compareName: "compare",
    });
    expect(st.compareName).toBeNull();
    expect(ids(st.compare)).toEqual(ids(parseReconciliation(OTHER, "compare")));
  });

  it("reads the legacy \"tab\" title back as no name and seeds the unified one", () => {
    const st = restoreLegacy({ xml: FRONT, fileName: null, tabs: [{ title: "tab", xml: OTHER }] });
    // The background tab is the restored one; the front tab of a nameless
    // session is nameless too, so the title cannot identify it.
    const tab = st.tabs.find((t) => t.id !== st.activeTabId);
    expect(tab).toBeDefined();
    const tabId = tab?.id ?? "";
    // The legacy placeholder is gone from the tab bar...
    expect(tab?.title).toBeNull();
    expect(st.docs[tabId]?.fileName).toBeNull();
    useStore.getState().switchTab(tabId);
    const after = useStore.getState();
    expect(after.fileName).toBeNull();
    // ...and the tab hashes the ONE nameless seed: `title` no longer has a seed
    // of its own, so a nameless document keeps its ids whichever role it is
    // restored in (this is the assertion that pins the role-divergent seeding).
    expect(ids(after.recon)).toEqual(ids(parseReconciliation(OTHER, "session")));
    expect(ids(after.recon)).not.toEqual(ids(parseReconciliation(OTHER, "tab")));
  });

  it("keeps a real tab title and seeds its ids from that exact name", () => {
    const st = restoreLegacy({
      xml: FRONT,
      fileName: null,
      tabs: [{ title: "Mammals.nhx", xml: OTHER }],
    });
    const tab = st.tabs.find((t) => t.title === "Mammals.nhx");
    expect(tab).toBeDefined();
    useStore.getState().switchTab(tab?.id ?? "");
    const after = useStore.getState();
    expect(after.fileName).toBe("Mammals.nhx");
    expect(ids(after.recon)).toEqual(ids(parseReconciliation(OTHER, "Mammals.nhx")));
    expect(ids(after.recon)).not.toEqual(ids(parseReconciliation(OTHER, "session")));
  });

  it("cost case: a front document really named \"tab\" keeps BOTH its name and its ids", () => {
    // `tab` is the placeholder of a TAB TITLE, not of `fileName`, so this
    // session is read literally: no localized label, and the same ids as
    // before the sanitizer existed.
    const st = restoreLegacy({ xml: FRONT, fileName: "tab" });
    expect(st.fileName).toBe("tab");
    expect(ids(st.recon)).toEqual(ids(parseReconciliation(FRONT, "tab")));
  });
});

/**
 * The legacy-name rule is deliberately the narrowest one possible: an exact,
 * whole-string, case-sensitive compare against the placeholder THAT field
 * alone could ever have held. Anything else - another field's placeholder, a
 * different case, padding, an extension - is a real name and is kept.
 */
describe("only the exact legacy placeholder of a field reads back as no name", () => {
  /** Parse a session document whose four name slots are set as given. */
  const namesOf = (over: Record<string, unknown>) => {
    const d = parseSession(
      JSON.stringify({ version: CURRENT_SESSION_VERSION, xml: "<recPhylo/>", ...over }),
    );
    return {
      fileName: d.fileName,
      nestedName: d.nestedName,
      compareName: d.compareName,
      titles: d.tabs?.map((t) => t.title) ?? null,
    };
  };

  it("removes the placeholder each field itself could have carried", () => {
    expect(
      namesOf({
        fileName: "session",
        nestedName: "nested",
        compareName: "compare",
        tabs: [{ title: "tab", xml: "A;" }, { title: "session", xml: "B;" }],
      }),
    ).toEqual({
      fileName: null,
      nestedName: null,
      compareName: null,
      // "tab" is the superseded title seed, "session" the current one.
      titles: [null, null],
    });
  });

  it("reads the empty string back as no name in every field", () => {
    // A build that never normalized one persisted `""` for a nameless
    // document; the seeds it was written with must still be applied.
    expect(
      namesOf({
        fileName: "",
        nestedName: "",
        compareName: "",
        tabs: [{ title: "", xml: "A;" }],
      }),
    ).toEqual({
      fileName: null,
      nestedName: null,
      compareName: null,
      titles: [null],
    });
  });

  it("keeps every name that only resembles a placeholder", () => {
    expect(
      namesOf({
        // "tab" was never a placeholder for `fileName`, only for a tab title.
        fileName: "tab",
        nestedName: "Session",
        compareName: "nested.nhx",
        tabs: [
          { title: "TAB", xml: "A;" },
          { title: "tab ", xml: "B;" },
          { title: "tab.txt", xml: "C;" },
        ],
      }),
    ).toEqual({
      fileName: "tab",
      nestedName: "Session",
      compareName: "nested.nhx",
      titles: ["TAB", "tab ", "tab.txt"],
    });
  });
});

/**
 * The two data-loss holes in that design, pinned end to end through the real
 * snapshot writer and the real restore path:
 *  1. the EMPTY STRING: a nameless load wrote `""` into the tab title and into
 *     `fileName`, `?? seed` does not catch it, and the restore therefore hashed
 *     `""` instead of the nameless seed - renumbering every persisted set.
 *  2. the document's ROLE: the front document hashed `fileName`'s seed while
 *     the same document restored as a background tab hashed `title`'s, so
 *     merely switching tabs between saves orphaned its collapse state.
 * As everywhere above, expected ids come from literal
 * `parseReconciliation(xml, "<seed>")` calls, never from PARSE_SEEDS.
 */
describe("a nameless document keeps one id namespace across save / restore roles", () => {
  beforeEach(resetWorkspace);

  /** Write the live workspace to localStorage, wipe it, restore it, and hand
   *  back the snapshot text that was stored. */
  function saveAndRestore(): string {
    writeAutosave();
    const snapshot = localStorage.getItem(KEY);
    if (!snapshot) throw new Error("expected writeAutosave to store a snapshot");
    resetWorkspace();
    localStorage.setItem(KEY, snapshot);
    expect(restoreAutosave()).toBe(true);
    return snapshot;
  }

  it("restores the front document of a nameless snapshot with the live ids", () => {
    useStore.getState().loadXml(FRONT, null);
    const geneId = someGeneId(useStore.getState().recon);
    useStore.getState().toggleCollapse(geneId);
    useStore.getState().setAnnotation(geneId, "note", "#ff0000");
    const live = ids(useStore.getState().recon);
    const snapshot = saveAndRestore();

    // Hole 1: nothing in the snapshot carries `""` as a name.
    expect(snapshot).not.toMatch(/"(fileName|title|nestedName|compareName)": ""/);
    const st = useStore.getState();
    expect(st.fileName).toBeNull();
    // The tab that holds it is nameless too, so the next save keeps no name.
    expect(st.tabs.find((t) => t.id === st.activeTabId)?.title).toBeNull();
    expect(ids(st.recon)).toEqual(live);
    expect(ids(st.recon)).toEqual(ids(parseReconciliation(FRONT, "session")));
    // ...and the state keyed by a live id survived the round trip.
    expect(st.collapsed.has(geneId)).toBe(true);
    expect(st.annotations[geneId]).toEqual({ text: "note", color: "#ff0000" });
  });

  it("restores the same document as a background tab with those very ids", () => {
    useStore.getState().loadXml(FRONT, null);
    const geneId = someGeneId(useStore.getState().recon);
    useStore.getState().toggleCollapse(geneId);
    const live = ids(useStore.getState().recon);
    // "+ new tab" moves the nameless document into a background tab.
    useStore.getState().newTab();
    const snapshot = saveAndRestore();
    expect(JSON.parse(snapshot).tabs[0].title).toBeNull();

    const before = useStore.getState();
    const tabId = before.tabs.find((t) => t.id !== before.activeTabId)?.id ?? "";
    // It really is the lazy path: a restored tab is parsed on first activation.
    expect(before.docs[tabId]?.recon).toBeNull();
    expect(before.docs[tabId]?.lazyDoc).not.toBeNull();
    useStore.getState().switchTab(tabId);

    const after = useStore.getState();
    expect(after.fileName).toBeNull();
    expect(after.tabs.find((t) => t.id === tabId)?.title).toBeNull();
    // Hole 2: the background role must not seed differently from the front one.
    expect(ids(after.recon)).toEqual(live);
    expect(ids(after.recon)).toEqual(ids(parseReconciliation(FRONT, "session")));
    expect(after.collapsed.has(geneId)).toBe(true);
  });

  it("hashes one nameless document identically in the front and the background role", () => {
    useStore.getState().loadXml(FRONT, null);
    const live = ids(useStore.getState().recon);
    useStore.getState().newTab();
    // What a save writes while the nameless document sits in a background tab.
    const savedTabs = JSON.parse(JSON.stringify(savedTabsOfStore()));
    expect(savedTabs).toHaveLength(1);
    expect(savedTabs[0].title).toBeNull();

    // Role 1: restored as the session's front document (`fileName` seed).
    resetWorkspace();
    const front = restoreLegacy({ xml: FRONT, fileName: null });
    expect(ids(front.recon)).toEqual(live);

    // Role 2: the very same tab data restored as a background tab (`title`
    // seed), with no front document at all.
    resetWorkspace();
    const back = restoreLegacy({ xml: "", fileName: null, tabs: savedTabs });
    const tabId = back.tabs.find((t) => t.id !== back.activeTabId)?.id ?? "";
    useStore.getState().switchTab(tabId);
    const backIds = ids(useStore.getState().recon);

    expect(backIds).toEqual(live);
    expect(backIds).toEqual(ids(parseReconciliation(FRONT, "session")));
  });

  it("repairs a snapshot the buggy build wrote with an empty name", () => {
    const st = restoreLegacy({
      xml: FRONT,
      fileName: "",
      tabs: [{ title: "", xml: OTHER }],
    });
    expect(st.fileName).toBeNull();
    expect(ids(st.recon)).toEqual(ids(parseReconciliation(FRONT, "session")));
    const tab = st.tabs.find((t) => t.id !== st.activeTabId);
    expect(tab?.title).toBeNull();
    useStore.getState().switchTab(tab?.id ?? "");
    const after = useStore.getState();
    expect(after.fileName).toBeNull();
    expect(ids(after.recon)).toEqual(ids(parseReconciliation(OTHER, "session")));
  });

  it("keeps both nameless tab-title placeholders on the one canonical seed", () => {
    // "tab" is what the previous build hashed for a nameless tab, "session" is
    // what the unified seed hashes now; both read back as no name.
    const expected = ids(parseReconciliation(OTHER, "session"));
    for (const legacyTitle of ["tab", "session"]) {
      resetWorkspace();
      const st = restoreLegacy({
        xml: "",
        fileName: null,
        tabs: [{ title: legacyTitle, xml: OTHER }],
      });
      const tab = st.tabs.find((t) => t.id !== st.activeTabId);
      expect(tab?.title).toBeNull();
      useStore.getState().switchTab(tab?.id ?? "");
      const after = useStore.getState();
      expect(after.fileName).toBeNull();
      expect(ids(after.recon)).toEqual(expected);
    }
  });
});

