/**
 * Compare two reconciliations of the *same* gene family and derive a consensus:
 * which nodes agree on their event type and which disagree.
 *
 * Nodes are matched by a stable key - the gene name for internal nodes and the
 * extant gene name for leaves - so identically named nodes in the two results
 * are lined up. Nodes present in only one result, or with a different event
 * type, count as disagreements.
 */
import type { GeneNode, GeneTree, Reconciliation } from "../model/types";

export interface DiffResult {
  /** Gene node ids in A that disagree with (or are absent from) B. */
  disagreeA: Set<string>;
  /** Gene node ids in B that disagree with (or are absent from) A. */
  disagreeB: Set<string>;
  /** Matched nodes that agree on event type. */
  agree: number;
  /** Total matched nodes compared. */
  compared: number;
  /**
   * Size of the union of comparable nodes across both results. Agreement is
   * reported against this (a Jaccard-style denominator) so a result that simply
   * omits nodes cannot inflate the percentage.
   */
  union: number;
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

export function computeDiff(a: Reconciliation, b: Reconciliation): DiffResult {
  const mapA = indexByKey(a);
  const mapB = indexByKey(b);
  const disagreeA = new Set<string>();
  const disagreeB = new Set<string>();
  let agree = 0;
  let compared = 0;
  let onlyA = 0;
  let onlyB = 0;

  for (const [k, ga] of mapA) {
    const gb = mapB.get(k);
    if (!gb) {
      onlyA++;
      disagreeA.add(ga.id);
      continue;
    }
    compared++;
    if (ga.endEvent.type === gb.endEvent.type) {
      agree++;
    } else {
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

  return { disagreeA, disagreeB, agree, compared, union: compared + onlyA + onlyB };
}

/**
 * Agreement percentage (0-100), or null when there are no comparable nodes.
 * The denominator is the union of both results' comparable nodes, so a node
 * present in only one result counts as a disagreement, which is this module's
 * stated contract.
 */
export function agreementPct(d: DiffResult): number | null {
  return d.union > 0 ? Math.round((d.agree / d.union) * 100) : null;
}
