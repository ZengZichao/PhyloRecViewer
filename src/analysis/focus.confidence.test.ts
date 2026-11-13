import { describe, expect, it, vi } from "vitest";
import { parseReconciliation } from "../parser/formats";
import { translations } from "../i18n";
import { useStore } from "../state/store";
import {
  confidenceActive,
  focusMatches,
  reconHasConfidence,
  regexError,
  type FocusCriteria,
} from "./focus";
import { ALL_EVENTS } from "./focus";

/** Minimal reconciliation with event confidences: g0 (spec, 0.9), gB (dup, 0.4),
 *  and three leaves with no confidence. */
const XML = `<recPhylo>
  <spTree><phylogeny><clade><name>root</name>
    <clade><name>A</name></clade>
    <clade><name>B</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true">
    <clade><name>g0</name>
      <eventsRec><speciation speciesLocation="root" confidence="0.9"/></eventsRec>
      <clade><name>gA</name><eventsRec><leaf speciesLocation="A" geneName="gA"/></eventsRec></clade>
      <clade><name>gB</name>
        <eventsRec><duplication speciesLocation="B" confidence="0.4"/></eventsRec>
        <clade><name>gB1</name><eventsRec><leaf speciesLocation="B" geneName="gB1"/></eventsRec></clade>
        <clade><name>gB2</name><eventsRec><leaf speciesLocation="B" geneName="gB2"/></eventsRec></clade>
      </clade>
    </clade>
  </phylogeny></recGeneTree>
</recPhylo>`;

const base: Omit<FocusCriteria, "confidence"> = {
  query: "",
  regex: false,
  events: { ...ALL_EVENTS },
  families: null,
};

describe("confidence filtering", () => {
  const recon = parseReconciliation(XML, "conf.recphyloxml");

  it("detects that the reconciliation carries confidences", () => {
    expect(reconHasConfidence(recon)).toBe(true);
  });

  it("treats the full [0,1] window as inactive", () => {
    expect(confidenceActive([0, 1])).toBe(false);
    expect(focusMatches(recon, { ...base, confidence: [0, 1] })).toBeNull();
  });

  it("keeps only nodes whose confidence is in the window (tips-with-no-confidence excluded)", () => {
    const hi = focusMatches(recon, { ...base, confidence: [0.5, 1] });
    expect(hi?.map((g) => g.name)).toEqual(["g0"]); // 0.9 only

    const mid = focusMatches(recon, { ...base, confidence: [0.3, 0.5] });
    expect(mid?.map((g) => g.name)).toEqual(["gB"]); // 0.4 only
  });
});

/**
 * regexError() prints the engine's own SyntaxError text into the search panel
 * (`RightPanel.tsx`), so the only string it authors is the fallback for an empty
 * engine message - and that one must come from the active dictionary, not from a
 * hardcoded English literal (STYLE §5.3). Stubbing RegExp is how the
 * empty-message case is reached: no real pattern produces such an error.
 */
describe("regexError()", () => {
  function withEmptyMessageRegExp(query: string): string | null {
    class EmptyMessageSyntaxError {
      constructor() {
        throw new Error("");
      }
    }
    vi.stubGlobal("RegExp", EmptyMessageSyntaxError);
    try {
      return regexError(query);
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("reports the engine's own text while it has any", () => {
    expect(regexError("(")).toContain("Invalid regular expression");
    expect(regexError("g")).toBeNull();
  });

  it("takes the invalid-regex fallback from the active dictionary", () => {
    const prev = useStore.getState().locale;
    try {
      useStore.setState({ locale: "zh" });
      expect(withEmptyMessageRegExp("([")).toBe(translations.zh.batchInvalidRegex);
      useStore.setState({ locale: "en" });
      expect(withEmptyMessageRegExp("([")).toBe(translations.en.batchInvalidRegex);
    } finally {
      useStore.setState({ locale: prev });
    }
  });
});
