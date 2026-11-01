/**
 * Structural consistency checks for a parsed reconciliation.
 *
 * This is not a full recPhyloXML XSD validation, but catches the mistakes that
 * actually break a drawing or signal a bad reconciliation: dangling species
 * references, unpaired transfers, extant genes placed on internal species,
 * suspect support scales, negative branch lengths and transfers whose time
 * direction cannot be assessed from the data. Results are returned as
 * structured, countable issues so the UI can localize them.
 */
import type { GeneNode, Reconciliation, SpeciesNode } from "../model/types";

export type IssueCode =
  | "unknownSpecies"
  | "donorNoTransferBack"
  | "transferBackNoParent"
  | "transferBackNoDonor"
  | "bifurcationNoTransferBack"
  | "terminalEventWithChildren"
  | "nonBinaryNode"
  | "transferBackwardsInTime"
  | "sameSpeciesTransfer"
  | "transferTimeUnknown"
  | "leafInternalSpecies"
  | "noSpecies"
  | "duplicateSpecies"
  | "confidenceScaleSuspect"
  | "negativeBranchLength"
  | "verticalEdgeAcrossClades";

export type IssueLevel = "error" | "warning" | "info";

export interface ConsistencyIssue {
  code: IssueCode;
  level: IssueLevel;
  count: number;
  /** A few representative node/species names for context. */
  examples: string[];
  /** Gene-node ids of the first flagged nodes, so the UI can locate them. */
  nodeIds: string[];
}

function push(
  map: Map<IssueCode, ConsistencyIssue>,
  code: IssueCode,
  level: IssueLevel,
  example: string,
  nodeId?: string,
): void {
  const cur = map.get(code);
  if (cur) {
    cur.count++;
    if (cur.examples.length < 5 && example && !cur.examples.includes(example)) {
      cur.examples.push(example);
    }
    if (nodeId && cur.nodeIds.length < 5 && !cur.nodeIds.includes(nodeId)) {
      cur.nodeIds.push(nodeId);
    }
  } else {
    map.set(code, {
      code,
      level,
      count: 1,
      examples: example ? [example] : [],
      nodeIds: nodeId ? [nodeId] : [],
    });
  }
}

/** True when `anc` is a strict ancestor of `desc` in the species tree. */
function isAncestor(anc: SpeciesNode, desc: SpeciesNode): boolean {
  let cur: SpeciesNode | null = desc.parent;
  while (cur) {
    if (cur === anc) return true;
    cur = cur.parent;
  }
  return false;
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
    if (s.branchLength != null && (!Number.isFinite(s.branchLength) || s.branchLength < 0)) {
      push(issues, "negativeBranchLength", "warning", `${s.name || "(unnamed)"}: ${s.branchLength}`);
    }
    if (s.support != null && s.support.value > 1 && s.support.value <= 100 && s.support.type !== "bootstrap") {
      push(issues, "confidenceScaleSuspect", "info", `${s.name || "(unnamed)"}: ${s.support.value}`);
    }
  }

  const hasTransferBack = (g: GeneNode): boolean =>
    g.events.some((e) => e.type === "transferBack");

  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      const label = g.name || g.endEvent.geneName || "?";

      if (g.branchLength != null && (!Number.isFinite(g.branchLength) || g.branchLength < 0)) {
        push(issues, "negativeBranchLength", "warning", label, g.id);
      }
      for (const ev of g.events) {
        if (ev.confidence != null && ev.confidence > 1 && ev.confidence <= 100) {
          push(issues, "confidenceScaleSuspect", "info", `${label}: ${ev.confidence}`, g.id);
        }
        if (ev.timeSlice != null && (!Number.isFinite(ev.timeSlice) || ev.timeSlice < 0)) {
          push(issues, "negativeBranchLength", "warning", `${label}: timeSlice ${ev.timeSlice}`, g.id);
        }
      }
      if (g.support != null && g.support.value > 1 && g.support.value <= 100 && g.support.type !== "bootstrap") {
        push(issues, "confidenceScaleSuspect", "info", `${label}: ${g.support.value}`, g.id);
      }

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
      if (!g.speciesId) push(issues, "noSpecies", "warning", label, g.id);

      const isDonor = (n: GeneNode): boolean =>
        n.endEvent.type === "branchingOut" || n.endEvent.type === "bifurcationOut";

      // A transfer donor (branching or bifurcation out) needs a transferred child.
      if (g.endEvent.type === "branchingOut" && !g.children.some(hasTransferBack)) {
        push(issues, "donorNoTransferBack", "warning", label, g.id);
      }
      if (g.endEvent.type === "bifurcationOut" && !g.children.some(hasTransferBack)) {
        push(issues, "bifurcationNoTransferBack", "warning", label, g.id);
      }

      // A vertical (non-transfer) gene edge must stay inside the parent
      // species' subtree: a lineage that jumps from species A straight to an
      // unrelated clade B without a transfer is impossible, yet it can be
      // drawn silently. Reported when both endpoints resolve to species.
      if (g.parent && !hasTransferBack(g)) {
        const parentSp = species.byName.get(g.parent.speciesId);
        const childSp = species.byName.get(g.speciesId);
        if (parentSp && childSp && parentSp !== childSp && !isAncestor(parentSp, childSp)) {
          push(
            issues,
            "verticalEdgeAcrossClades",
            "error",
            `${label}: ${parentSp.name} → ${childSp.name}`,
            g.id,
          );
        }
      }

      // A transfer arrival must have a donor lineage (a parent), and that parent
      // must actually be a donor. An arrival under an ordinary speciation is a
      // data error: the viewer keeps the vertical edge instead of drawing an arc.
      if (hasTransferBack(g)) {
        if (!g.parent) {
          push(issues, "transferBackNoParent", "error", label, g.id);
        } else if (!isDonor(g.parent)) {
          push(issues, "transferBackNoDonor", "error", label, g.id);
        } else {
          // Same-species transfers are gene flow WITHIN one lineage - a model
          // question, not a time-direction error - so they are reported under
          // their own code instead of "backwards in time".
          const selfLoop = !!g.parent.speciesId && g.parent.speciesId === g.speciesId;
          if (selfLoop) {
            push(issues, "sameSpeciesTransfer", "warning", `${label} (${g.parent.speciesId})`, g.id);
          }
          // Time-ordering evidence, strongest first:
          //  1. reaching an ANCESTOR species of the donor is backwards in time
          //     (pure structure, no time data needed);
          //  2. explicit timeSlice values on both sides are compared directly;
          //  3. otherwise the direction is NOT assessable - topology depth is
          //     not time, so no pass/fail verdict is issued (an earlier version
          //     fell back to depth and could claim "passed" on that basis).
          const donorSp = species.byName.get(g.parent.speciesId);
          const recipSp = species.byName.get(g.speciesId);
          for (const arr of g.events) {
            if (arr.type !== "transferBack") continue;
            if (selfLoop) continue;
            if (donorSp && recipSp && isAncestor(recipSp, donorSp)) {
              push(issues, "transferBackwardsInTime", "error", `${label} (into ancestor ${recipSp.name})`, g.id);
              continue;
            }
            const donorTS = g.parent.endEvent.timeSlice;
            const recipTS = arr.timeSlice;
            if (donorTS != null && recipTS != null) {
              if (recipTS < donorTS) {
                push(issues, "transferBackwardsInTime", "warning", `${label} (timeSlice ${recipTS} < ${donorTS})`, g.id);
              }
            } else {
              push(issues, "transferTimeUnknown", "info", label, g.id);
            }
          }
        }
      }

      // Terminal events (loss / leaf) are schema leaves and must have no children.
      if ((g.endEvent.type === "loss" || g.endEvent.type === "leaf") && g.children.length > 0) {
        push(issues, "terminalEventWithChildren", "error", label, g.id);
      }

      // Speciation / duplication split exactly two lineages.
      if ((g.endEvent.type === "speciation" || g.endEvent.type === "duplication") && g.children.length !== 2) {
        push(issues, "nonBinaryNode", "warning", label, g.id);
      }

      // Extant genes should sit on leaf species, not internal branches.
      if (g.endEvent.type === "leaf" && g.speciesId) {
        const sp = species.byName.get(g.speciesId);
        if (sp && sp.children.length > 0) {
          push(issues, "leafInternalSpecies", "warning", label, g.id);
        }
      }
    }
  }

  const levelRank: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  return [...issues.values()].sort((a, b) =>
    a.level === b.level ? b.count - a.count : levelRank[a.level] - levelRank[b.level],
  );
}
