import type { StringDictKey } from "../i18n";
import showcaseRaw from "./showcase.recphyloxml?raw";
import allEvents from "./all-events.recphyloxml?raw";
import nestedGeneSymbiont from "./nested-gene-symbiont.recphyloxml?raw";
import nestedSymbiontHost from "./nested-symbiont-host.recphyloxml?raw";
import compareToolA from "./compare-tool-a.recphyloxml?raw";
import compareToolB from "./compare-tool-b.recphyloxml?raw";

export interface Sample {
  id: string;
  /** i18n key of the display name, resolved at render/load time so the name
   *  follows the UI language instead of being baked in at module load. */
  labelKey: StringDictKey;
  xml: string;
  /** Optional second file to demonstrate a 3-level (nested) reconciliation. */
  nestedXml?: string;
  nestedLabelKey?: StringDictKey;
  /** Optional second reconciliation of the SAME family, for the compare view. */
  compareXml?: string;
  compareLabelKey?: StringDictKey;
}

/**
 * Bundled sample(s) inlined at build time so the app always has content to show
 * offline. Real datasets are loaded through the File > Open flow.
 */
export const samples: Sample[] = [
  {
    id: "showcase",
    labelKey: "sampleShowcase",
    xml: showcaseRaw,
  },
  {
    id: "all-events",
    labelKey: "sampleAllEvents",
    xml: allEvents,
  },
  {
    id: "compare",
    labelKey: "sampleCompare",
    xml: compareToolA,
    compareXml: compareToolB,
    compareLabelKey: "sampleCompareB",
  },
  {
    id: "nested",
    labelKey: "sampleNested",
    xml: nestedGeneSymbiont,
    nestedXml: nestedSymbiontHost,
    nestedLabelKey: "sampleNestedB",
  },
];
