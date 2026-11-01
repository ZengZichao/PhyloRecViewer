/**
 * Compare two reconciliations of the *same* gene family and derive a consensus:
 * which nodes agree and which disagree, across THREE dimensions - terminal
 * event type, species mapping, and transfer donor/recipient - so a result that
 * merely moves a gene to another species can no longer score a false 100%
 * (compare used to look at the event type only).
 *
 * Nodes are matched by a stable key - the gene name for internal nodes and the
 * extant gene name for leaves - so identically named nodes in the two results
 * are lined up. Nodes present in only one result, or disagreeing on any
 * compared dimension, are reported as disagreements.
 */
import type { GeneNode, GeneTree, Reconciliation } from "../model/types";

/** One matched pair of nodes with the detail both sides of the diff table need. */
export interface MatchedPair {
  aId: string;
  bId: string;
  /** Display label: the gene name, or the node name for internal clades. */
  name: string;
  family: string;
  eventA: string;
  eventB: string;
  speciesA: string;
  speciesB: string;
  /** Donor species of the first transfer arrival (null when the node has none). */
  donorA: string | null;
  donorB: string | null;
  /** Recipient species of the first transfer arrival (null when the node has none). */
  recipientA: string | null;
  recipientB: string | null;
  timeSliceA: number | null;
  timeSliceB: number | null;
  agreeEvent: boolean;
  agreeSpecies: boolean;
  agreeTransfer: boolean;
}

export interface DiffResult {
  /** Gene node ids in A that disagree with (or are absent from) B. */
  disagreeA: Set<string>;
  /** Gene node ids in B that disagree with (or are absent from) A. */
  disagreeB: Set<string>;
  /**
   * Matched nodes that agree on EVERY compared dimension (event type, species
   * mapping and transfer donor/recipient). This is the headline metric: a
   * result that only moves a gene to another species must NOT score 100%.
   */
  agree: number;
  /** Matched nodes agreeing on the terminal event type alone. */
  agreeEvent: number;
  /** Matched nodes whose species mapping is identical. */
  agreeSpecies: number;
  /** Matched nodes whose transfer donor/recipient agree (arrivals only). */
  agreeTransfer: number;
  /** Total matched nodes compared. */
  compared: number;
  /**
   * Size of the union of comparable nodes across both results. Agreement is
   * reported against this (a Jaccard-style denominator) so a result that simply
   * omits nodes cannot inflate the percentage.
   */
  union: number;
  /** Matched nodes present only in A / only in B. */
  onlyA: number;
  onlyB: number;
  /** Matched nodes where either side carries a transfer arrival. */
  transferCompared: number;
  /** Matched-pair details for the diff table (complete; the UI caps rows). */
  pairs: MatchedPair[];
}

/** Sorted extant-leaf-name signature of a node's subtree (topology key). */
function leafSetKey(g: GeneNode): string {
  const leaves: string[] = [];
  const walk = (n: GeneNode): void => {
    if (n.endEvent.type === "leaf") leaves.push(n.endEvent.geneName || n.name);
    for (const c of n.children) walk(c);
  };
  walk(g);
  return leaves.sort().join("|");
}

function keyOf(g: GeneNode): string {
  if (g.endEvent.type === "leaf") return `L:${g.endEvent.geneName || g.name}`;
  if (g.name) return `I:${g.name}`;
  // Unnamed internal node: match by descendant leaf set (topology) so NHX trees,
  // whose internals are unnamed, take part in the comparison.
  if (g.children.length > 0) return `T:${leafSetKey(g)}`;
  // Unnamed AND childless - the shape of a recPhyloXML <loss/> (see
  // samples/all-events.recphyloxml). A name-derived key would be "" here, which
  // leaves the node out of both matching and the `union` denominator, so two
  // reconciliations that disagree only on which species a loss happened in
  // would score 100% agreement. Key it on the event identity instead.
  return `X:${g.endEvent.type}:${g.speciesId}:${leafSetKey(g)}`;
}

/**
 * Family scope for matching keys. DTL outputs routinely reuse the same
 * clade/gene names in different families, and `indexByKey` builds ONE map per
 * document, so without a family prefix node N of family 1 is paired with node N
 * of family 2 and the diff is silently wrong. Prefer the gene-tree name (stable
 * across tools that label the same family identically) and fall back to index.
 */
function familyScope(tree: GeneTree): string {
  return `F<${tree.name ?? `#${tree.index}`}>:`;
}

function indexByKey(recon: Reconciliation): Map<string, GeneNode> {
  const map = new Map<string, GeneNode>();
  // DTL outputs routinely contain same-named paralogous clades; disambiguate
  // repeated keys by occurrence order so every duplicate-named node is
  // compared pairwise rather than silently dropped from the denominator.
  // Identically-built trees line up because traversal order is stable.
  const seen = new Map<string, number>();
  for (const tree of recon.geneTrees) {
    const scope = familyScope(tree);
    for (const g of tree.nodes) {
      const base = scope + keyOf(g);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      map.set(n === 0 ? base : `${base}#${n}`, g);
    }
  }
  return map;
}

/** First transfer arrival of a node, as (donor, recipient, timeSlice). */
function arrivalOf(g: GeneNode): {
  donor: string | null;
  recipient: string | null;
  timeSlice: number | null;
} {
  const t = g.events.find((e) => e.type === "transferBack");
  if (!t) return { donor: null, recipient: null, timeSlice: null };
  return {
    donor: t.speciesLocation ?? g.parent?.speciesId ?? null,
    recipient: t.destinationSpecies ?? g.speciesId ?? null,
    timeSlice: t.timeSlice ?? null,
  };
}

function pairOf(a: GeneNode, b: GeneNode, family: string): MatchedPair {
  const arrA = arrivalOf(a);
  const arrB = arrivalOf(b);
  const eventA = a.endEvent.type;
  const eventB = b.endEvent.type;
  const speciesA = a.speciesId || a.endEvent.speciesLocation || "";
  const speciesB = b.speciesId || b.endEvent.speciesLocation || "";
  const hasTransferA = arrA.donor !== null || arrA.recipient !== null;
  const hasTransferB = arrB.donor !== null || arrB.recipient !== null;
  const transferCompared = hasTransferA || hasTransferB;
  return {
    aId: a.id,
    bId: b.id,
    name: a.endEvent.geneName || a.name || b.endEvent.geneName || b.name || "(unnamed)",
    family,
    eventA,
    eventB,
    speciesA,
    speciesB,
    donorA: arrA.donor,
    donorB: arrB.donor,
    recipientA: arrA.recipient,
    recipientB: arrB.recipient,
    timeSliceA: arrA.timeSlice,
    timeSliceB: arrB.timeSlice,
    agreeEvent: eventA === eventB,
    agreeSpecies: speciesA === speciesB,
    agreeTransfer:
      !transferCompared ||
      (arrA.donor === arrB.donor && arrA.recipient === arrB.recipient),
  };
}

export function computeDiff(a: Reconciliation, b: Reconciliation): DiffResult {
  const mapA = indexByKey(a);
  const mapB = indexByKey(b);
  const disagreeA = new Set<string>();
  const disagreeB = new Set<string>();
  const pairs: MatchedPair[] = [];
  let agree = 0;
  let agreeEvent = 0;
  let agreeSpecies = 0;
  let agreeTransfer = 0;
  let transferCompared = 0;
  let compared = 0;
  let onlyA = 0;
  let onlyB = 0;

  const familyNameA = new Map(a.geneTrees.map((t) => [t.index, t.name ?? `#${t.index}`]));

  for (const [k, ga] of mapA) {
    const gb = mapB.get(k);
    if (!gb) {
      onlyA++;
      disagreeA.add(ga.id);
      continue;
    }
    compared++;
    const pair = pairOf(ga, gb, familyNameA.get(ga.treeIndex) ?? `#${ga.treeIndex}`);
    pairs.push(pair);
    if (pair.agreeEvent) agreeEvent++;
    if (pair.agreeSpecies) agreeSpecies++;
    // The transfer dimension is counted only when at least one side actually
    // carries an arrival, so plain vertical clades do not dilute it.
    const hasArrival = pair.donorA !== null || pair.donorB !== null;
    if (hasArrival) {
      transferCompared++;
      if (pair.agreeTransfer) agreeTransfer++;
    }
    if (pair.agreeEvent && pair.agreeSpecies && pair.agreeTransfer) agree++;
    if (!pair.agreeEvent || !pair.agreeSpecies || !pair.agreeTransfer) {
      disagreeA.add(ga.id);
      disagreeB.add(gb.id);
    }
  }
  for (const [k, gb] of mapB) {
    if (!mapA.has(k)) {
      onlyB++;
      disagreeB.add(gb.id);
    }
  }

  return {
    disagreeA,
    disagreeB,
    agree,
    agreeEvent,
    agreeSpecies,
    agreeTransfer,
    compared,
    union: compared + onlyA + onlyB,
    onlyA,
    onlyB,
    transferCompared,
    pairs,
  };
}

/**
 * Event-type agreement percentage (0-100), or null when there are no comparable
 * nodes. The denominator is the union of both results' comparable nodes, so a
 * node present in only one result counts as a disagreement, which is this
 * module's stated contract.
 */
export function agreementPct(d: DiffResult): number | null {
  return d.union > 0 ? Math.round((d.agree / d.union) * 100) : null;
}

/**
 * Species-mapping agreement among MATCHED nodes (0-100), or null when nothing
 * matched. Species mapping is only defined for paired nodes - a node missing
 * from one side has no mapping to compare - so the denominator here is
 * `compared`, not `union`. Displayed alongside the event-type percentage.
 */
export function speciesAgreementPct(d: DiffResult): number | null {
  return d.compared > 0 ? Math.round((d.agreeSpecies / d.compared) * 100) : null;
}
