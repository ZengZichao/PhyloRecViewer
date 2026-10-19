/**
 * Structural consistency checks for a parsed reconciliation.
 *
 * This is not a full recPhyloXML XSD validation, but catches the mistakes that
 * actually break a drawing or signal a bad reconciliation: dangling species
 * references, unpaired transfers, and extant genes placed on internal species.
 * Results are returned as structured, countable issues so the UI can localize
 * them.
 */
import type { GeneNode, Reconciliation } from "../model/types";

export type IssueCode =
  | "unknownSpecies"
  | "donorNoTransferBack"
  | "transferBackNoParent"
  | "transferBackNoDonor"
  | "bifurcationNoTransferBack"
  | "terminalEventWithChildren"
  | "nonBinaryNode"
  | "transferBackwardsInTime"
  | "leafInternalSpecies"
  | "noSpecies"
  | "duplicateSpecies";

export interface ConsistencyIssue {
  code: IssueCode;
  level: "error" | "warning";
  count: number;
  /** A few representative node/species names for context. */
  examples: string[];
}

function push(
  map: Map<IssueCode, ConsistencyIssue>,
  code: IssueCode,
  level: "error" | "warning",
  example: string,
): void {
  const cur = map.get(code);
  if (cur) {
    cur.count++;
    if (cur.examples.length < 5 && example && !cur.examples.includes(example)) {
      cur.examples.push(example);
    }
  } else {
    map.set(code, { code, level, count: 1, examples: example ? [example] : [] });
  }
}

/** Run all consistency checks; returns [] when the reconciliation looks clean. */
export function checkConsistency(recon: Reconciliation): ConsistencyIssue[] {
  const issues = new Map<IssueCode, ConsistencyIssue>();
  const { species } = recon;

  // Duplicate species names (species are referenced by name, so dupes are bad).
  // The example carries the depth of the repeated clade as well as its name:
  // when the duplicate names are all EMPTY (an empty <name/> element), the
  // depth is what distinguishes the offending clades from one blank label.
  const seenNames = new Set<string>();
  for (const s of species.nodes) {
    if (seenNames.has(s.name)) {
      push(issues, "duplicateSpecies", "warning", `${s.name || "(unnamed)"} @depth ${s.depth}`);
    }
    seenNames.add(s.name);
  }

  const hasTransferBack = (g: GeneNode): boolean =>
    g.events.some((e) => e.type === "transferBack");

  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      const label = g.name || g.endEvent.geneName || "?";

      // Unknown species references. Reported once per distinct name per node:
      // counting per event would let one badly-annotated node inflate the count
      // and pull the panel's total away from the number of nodes it flags.
      const unknownRefs = new Set<string>();
      for (const ev of g.events) {
        if (ev.speciesLocation && !species.byName.has(ev.speciesLocation)) {
          unknownRefs.add(ev.speciesLocation);
        }
        if (ev.destinationSpecies && !species.byName.has(ev.destinationSpecies)) {
          unknownRefs.add(ev.destinationSpecies);
        }
      }
      for (const name of unknownRefs) push(issues, "unknownSpecies", "warning", name);

      // Gene node without any species.
      if (!g.speciesId) push(issues, "noSpecies", "warning", label);

      const isDonor = (n: GeneNode): boolean =>
        n.endEvent.type === "branchingOut" || n.endEvent.type === "bifurcationOut";

      // A transfer donor (branching or bifurcation out) needs a transferred child.
      if (g.endEvent.type === "branchingOut" && !g.children.some(hasTransferBack)) {
        push(issues, "donorNoTransferBack", "warning", label);
      }
      if (g.endEvent.type === "bifurcationOut" && !g.children.some(hasTransferBack)) {
        push(issues, "bifurcationNoTransferBack", "warning", label);
      }

      // A transfer arrival must have a donor lineage (a parent), and that parent
      // must actually be a donor. An arrival under an ordinary speciation is a
      // data error: the viewer keeps the vertical edge instead of drawing an arc.
      if (hasTransferBack(g)) {
        if (!g.parent) {
          push(issues, "transferBackNoParent", "error", label);
        } else if (!isDonor(g.parent)) {
          push(issues, "transferBackNoDonor", "error", label);
        } else {
          // Time-ordering check: a transfer may not send a lineage into
          // an ancestor species. Prefer explicit timeSlice; fall back to species
          // depth. Every arrival is checked, not just the first, because one node
          // may legitimately carry several intermediary transferBack events and
          // computeTransfers draws one arc per arrival.
          const donorSp = species.byName.get(g.parent.speciesId);
          const recipSp = species.byName.get(g.speciesId);
          for (const arr of g.events) {
            if (arr.type !== "transferBack") continue;
            const donorTS = g.parent.endEvent.timeSlice;
            const recipTS = arr.timeSlice;
            let backwards = false;
            if (donorTS != null && recipTS != null) {
              backwards = recipTS < donorTS;
            } else if (donorSp && recipSp) {
              backwards = recipSp.depth < donorSp.depth;
            }
            // A donor and recipient in the same species is a transfer that goes
            // nowhere: it is flagged under the same code, and the example label
            // marks it as a same-species transfer.
            const selfLoop = !!g.parent.speciesId && g.parent.speciesId === g.speciesId;
            if (backwards || selfLoop) {
              push(
                issues,
                "transferBackwardsInTime",
                "warning",
                selfLoop && !backwards ? `${label} (same-species transfer)` : label,
              );
            }
          }
        }
      }

      // Terminal events (loss / leaf) are schema leaves and must have no children.
      if ((g.endEvent.type === "loss" || g.endEvent.type === "leaf") && g.children.length > 0) {
        push(issues, "terminalEventWithChildren", "error", label);
      }

      // Speciation / duplication split exactly two lineages.
      if ((g.endEvent.type === "speciation" || g.endEvent.type === "duplication") && g.children.length !== 2) {
        push(issues, "nonBinaryNode", "warning", label);
      }

      // Extant genes should sit on leaf species, not internal branches.
      if (g.endEvent.type === "leaf" && g.speciesId) {
        const sp = species.byName.get(g.speciesId);
        if (sp && sp.children.length > 0) {
          push(issues, "leafInternalSpecies", "warning", label);
        }
      }
    }
  }

  return [...issues.values()].sort((a, b) =>
    a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1,
  );
}
