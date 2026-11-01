/**
 * Search & filter matching.
 *
 * A "focus" is the set of gene nodes that satisfy the currently active search
 * query and event/family filters. When nothing is active the focus is `null`
 * (everything visible); otherwise the renderer dims every node outside the set.
 */
import type { GeneNode, Reconciliation } from "../model/types";

/** Which event categories are currently shown (all true = no filtering). */
export interface EventFilter {
  speciation: boolean;
  duplication: boolean;
  loss: boolean;
  transfer: boolean;
  /** Extant gene tips (`leaf` terminal events). (B-01) */
  leaf: boolean;
}

export const ALL_EVENTS: EventFilter = {
  speciation: true,
  duplication: true,
  loss: true,
  transfer: true,
  leaf: true,
};

export function eventFilterActive(f: EventFilter): boolean {
  return !(f.speciation && f.duplication && f.loss && f.transfer && f.leaf);
}

export interface FocusCriteria {
  query: string;
  regex: boolean;
  events: EventFilter;
  /** Tree indices to keep; null = all families. */
  families: Set<number> | null;
  /** Confidence window [min, max] in 0..1; [0,1] means "do not filter". */
  confidence?: [number, number];
  /** User annotations, searched alongside node names when provided. */
  annotations?: Record<string, { text: string; color: string }>;
}

/** Whether the confidence window is narrowed (i.e. actually filtering). */
export function confidenceActive(c?: [number, number]): boolean {
  return !!c && (c[0] > 0 || c[1] < 1);
}

/**
 * The confidence shown - and filtered - for a node: its terminal event first,
 * otherwise the first intermediary event that carries one. Some tools report
 * confidence only on `transferBack`, and the "has confidence" probe below reads
 * every event, so the filter MUST use the same accessor - otherwise the slider
 * is offered for a document whose nodes the window then filters out entirely
 *.
 */
export function nodeConfidence(g: GeneNode): number | undefined {
  if (g.endEvent.confidence != null) return g.endEvent.confidence;
  for (const e of g.events) if (e.confidence != null) return e.confidence;
  return undefined;
}

/** True if any gene node carries an event confidence value. */
export function reconHasConfidence(recon: Reconciliation): boolean {
  for (const tree of recon.geneTrees)
    for (const g of tree.nodes) {
      // Some tools report confidence only on the intermediary transferBack
      // event, not the terminal one; check every event on the node.
      if (nodeConfidence(g) != null) return true;
    }
  return false;
}

/** Compile a query into a predicate (regex, wildcard `*?`, or substring). */
function buildMatcher(query: string, regex: boolean): (s: string) => boolean {
  const q = query.trim();
  if (regex) {
    try {
      const re = new RegExp(q, "i");
      return (s) => re.test(s);
    } catch {
      // Callers surface this state via regexError(); the fallback keeps the
      // match list usable instead of empty while the error is displayed.
      const lq = q.toLowerCase();
      return (s) => s.toLowerCase().includes(lq);
    }
  }
  if (q.includes("*") || q.includes("?")) {
    const escaped = q.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const pattern = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    try {
      const re = new RegExp(pattern, "i");
      return (s) => re.test(s);
    } catch {
      /* fall through to substring */
    }
  }
  const lq = q.toLowerCase();
  return (s) => s.toLowerCase().includes(lq);
}

/**
 * Why an invalid regex fell back to substring matching, for the UI to display
 * next to the search field. Null when the pattern compiles (or regex mode is
 * off). An invalid regex used to degrade silently - the user believed their
 * pattern was active when it never was.
 */
export function regexError(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  try {
    // Same flags the matcher uses; a pattern valid here is valid there.
    new RegExp(q, "i");
    return null;
  } catch (e) {
    return (e as Error).message || "Invalid regular expression";
  }
}

function nodeMatchesEvents(g: GeneNode, f: EventFilter): boolean {
  const t = g.endEvent.type;
  // A transfer is a donor (branchingOut or bifurcationOut) or a transferBack
  // arrival. bifurcationOut is a transfer by recPhyloXML definition, so it
  // belongs in the `transfer` category (B-01).
  const isTransfer =
    t === "branchingOut" ||
    t === "bifurcationOut" ||
    g.events.some((e) => e.type === "transferBack");
  if (f.transfer && isTransfer) return true;
  if (f.leaf && t === "leaf") return true;
  if (f.speciation && t === "speciation") return true;
  if (f.duplication && t === "duplication") return true;
  if (f.loss && t === "loss") return true;
  return false;
}

/** Text a node is searchable by.
 *
 * Beyond the node's own names this includes the transfer arrival's donor and
 * recipient species and the terminal event type, so queries like "transfer",
 "B" (as a recipient) or "duplication" find the right nodes - a transfer's
 * donor species often has no gene node of its own to search for.
 */
function nodeTexts(
  g: GeneNode,
  annotations?: Record<string, { text: string; color: string }>,
): string[] {
  const texts = [g.name, g.endEvent.geneName ?? "", g.speciesId ?? "", g.endEvent.type];
  for (const e of g.events) {
    if (e.destinationSpecies) texts.push(e.destinationSpecies);
    if (e.type === "transferBack" && e.speciesLocation) texts.push(e.speciesLocation);
    if (e.timeSlice != null) texts.push(String(e.timeSlice));
  }
  const note = annotations?.[g.id];
  if (note?.text) texts.push(note.text);
  return texts.filter(Boolean);
}

/**
 * Ordered list of gene nodes matching every active criterion, or `null` when
 * no search/filter is active. Order follows parse order (stable for locate).
 */
export function focusMatches(
  recon: Reconciliation,
  c: FocusCriteria,
): GeneNode[] | null {
  const qActive = c.query.trim().length > 0;
  const eActive = eventFilterActive(c.events);
  const fActive = c.families !== null;
  const cActive = confidenceActive(c.confidence);
  if (!qActive && !eActive && !fActive && !cActive) return null;

  const match = qActive ? buildMatcher(c.query, c.regex) : null;
  const out: GeneNode[] = [];
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (fActive && !c.families!.has(g.treeIndex)) continue;
      if (eActive && !nodeMatchesEvents(g, c.events)) continue;
      if (cActive) {
        const conf = nodeConfidence(g);
        if (conf == null || conf < c.confidence![0] || conf > c.confidence![1]) continue;
      }
      if (match && !nodeTexts(g, c.annotations).some((s) => match(s))) continue;
      out.push(g);
    }
  }
  return out;
}

export function focusIdSet(matches: GeneNode[] | null): Set<string> | null {
  return matches ? new Set(matches.map((g) => g.id)) : null;
}
