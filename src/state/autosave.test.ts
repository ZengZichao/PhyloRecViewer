/**
 * Pins for the autosave contract: the snapshot signature is content-sensitive,
 * a "+ new tab" click never wipes a workspace whose other tabs hold content,
 * and the multi-file `sourceFiles` list survives a session round-trip.
 *
 * These drive the store directly (writeAutosave reads store state and never
 * re-parses), so the xml content is an opaque non-null string by design.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { writeAutosave } from "./autosave";
import { serializeSession, parseSession, CURRENT_SESSION_VERSION, type SessionData } from "../session";

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
