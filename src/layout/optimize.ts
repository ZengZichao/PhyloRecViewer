import type { Reconciliation, SpeciesNode } from "../model/types";
import { computeTransfers } from "./transfers";

/**
 * Heuristic crossing reduction: pick a set of species subtrees to mirror
 * (by name) so that transfer donor/recipient species sit closer together in
 * leaf order, which shortens transfer arcs and reduces crossings.
 *
 * Uses a cheap leaf-order proxy (no full layout per trial) and greedy hill
 * climbing. The objective is transfer-arc leaf-order distance, NOT a crossing
 * count: minimising it is a heuristic that usually reduces crossings but is not
 * guaranteed to, and only the <= MAX_OPTIMIZER_PASSES sweeps over at most
 * MAX_CANDIDATES candidate subtrees are tried. Only internal nodes whose subtree actually contains a transfer
 * donor/recipient species are trial candidates — mirroring an unrelated
 * subtree can never reduce transfer distance, so skipping them keeps the
 * pass cost proportional to the transfer involvement rather than the whole
 * tree (large species trees would otherwise stall the UI).
 */

/** Hard cap on trial candidates per pass (safety for pathological inputs). */
const MAX_CANDIDATES = 256;

/** Hill-climbing ceiling: at most this many full sweeps over the candidate set. */
export const MAX_OPTIMIZER_PASSES = 8;

export function optimizeCrossings(recon: Reconciliation): Set<string> {
  const transfers = computeTransfers(recon);
  const swapped = new Set<string>();
  if (transfers.length === 0) return swapped;

  const species = recon.species;
  // Species actually involved in a transfer (donor or recipient side).
  const involved = new Set<string>();
  for (const t of transfers) {
    const a = species.byName.get(t.from.speciesId);
    const b = species.byName.get(t.to.speciesId);
    if (a) involved.add(a.id);
    if (b) involved.add(b.id);
  }

  // One post-order labelling pass gives every node the facts the candidate
  // selection and the incremental re-indexing below need. Walking the whole
  // subtree *per candidate* would be O(n·h) - O(n²) on a caterpillar - and a
  // full leaf-order rebuild on every trial would make the greedy loop grow with
  // the whole species tree rather than the flipped subtree (48 ms on a
  // 1400-node caterpillar that way, against 1 ms for the layout itself).
  // `SpeciesTree.nodes` is in pre-order (parents before children), so iterating
  // it backwards is a valid post-order for bottom-up accumulation.
  const involvedUnder = new Map<string, boolean>();
  const subSize = new Map<string, number>();
  const leafWidth = new Map<string, number>();
  for (let i = species.nodes.length - 1; i >= 0; i--) {
    const n = species.nodes[i] as SpeciesNode;
    let size = 1;
    let leaves = n.children.length === 0 ? 1 : 0;
    // The aggregate is strictly descendant-based: an internal node counts as
    // involved only through its children, never through its own id.
    let has = n.children.length === 0 && involved.has(n.id);
    for (const c of n.children) {
      size += subSize.get(c.id) ?? 1;
      leaves += leafWidth.get(c.id) ?? 1;
      has = has || !!involvedUnder.get(c.id);
    }
    subSize.set(n.id, size);
    leafWidth.set(n.id, leaves);
    involvedUnder.set(n.id, has);
  }

  // Internal nodes whose subtree contains at least one involved species.
  let candidates = species.nodes.filter(
    (n) => n.children.length > 1 && !!involvedUnder.get(n.id),
  );
  if (candidates.length > MAX_CANDIDATES) {
    // Prefer nodes closest to the involved leaves (smallest subtrees): their
    // mirror flip has the most direct effect on leaf order.
    candidates = candidates
      .map((n) => ({ n, size: subSize.get(n.id) ?? 1 }))
      .sort((a, b) => a.size - b.size)
      .slice(0, MAX_CANDIDATES)
      .map((e) => e.n);
  }

  // `swapped` is keyed by species NAME, so mirroring a name can reorient several
  // nodes at once (duplicate names); the reindex step below covers them all.
  const nodesByName = new Map<string, SpeciesNode[]>();
  for (const n of species.nodes) {
    const arr = nodesByName.get(n.name);
    if (arr) arr.push(n);
    else nodesByName.set(n.name, [n]);
  }

  // Leaf order for the current `swapped` set: leaves get sequential positions,
  // internal nodes the midpoint of their leaf span.
  //
  // A mirror flip permutes the leaves *within* the flipped node's span, so it
  // cannot move any other node's span (widths are invariant) nor change an
  // ancestor's midpoint. Re-indexing just the flipped subtree is therefore
  // exact, and keeps a trial at O(subtree) rather than O(whole tree).
  const idx = new Map<string, number>();
  const spanStart = new Map<string, number>();
  const reindex = (root: SpeciesNode): void => {
    let p = spanStart.get(root.id) ?? 0;
    const dfs = (n: SpeciesNode): void => {
      if (n.children.length === 0) {
        idx.set(n.id, p);
        spanStart.set(n.id, p);
        p++;
        return;
      }
      const start = p;
      const kids = n.children;
      const deg = kids.length;
      const flip = swapped.has(n.name);
      // Mirror by reading the children backwards rather than allocating a
      // reversed copy per node per trial.
      for (let k = 0; k < deg; k++) {
        const c = kids[flip ? deg - 1 - k : k] as SpeciesNode;
        spanStart.set(c.id, p);
        dfs(c);
      }
      idx.set(n.id, (start + p - 1) / 2);
    };
    dfs(root);
  };
  const reindexAfterFlip = (name: string): void => {
    for (const n of nodesByName.get(name) ?? []) reindex(n);
  };

  // Resolve both arc endpoints to species ids once: `cost` runs per trial, so
  // redoing the `byName` lookups inside it would repeat identical work.
  const pairs: [string, string][] = [];
  for (const t of transfers) {
    const a = species.byName.get(t.from.speciesId);
    const b = species.byName.get(t.to.speciesId);
    if (a && b) pairs.push([a.id, b.id]);
  }

  const cost = (): number => {
    let c = 0;
    for (const [ai, bi] of pairs) {
      c += Math.abs((idx.get(ai) ?? 0) - (idx.get(bi) ?? 0));
    }
    return c;
  };

  spanStart.set(species.root.id, 0);
  reindex(species.root);
  let best = cost();
  let improved = true;
  let passes = 0;
  while (improved && passes < MAX_OPTIMIZER_PASSES) {
    improved = false;
    passes++;
    for (const n of candidates) {
      const on = !swapped.has(n.name);
      if (on) swapped.add(n.name);
      else swapped.delete(n.name);
      reindexAfterFlip(n.name);
      const c = cost();
      if (c < best - 1e-9) {
        best = c;
        improved = true;
      } else {
        if (on) swapped.delete(n.name);
        else swapped.add(n.name);
        reindexAfterFlip(n.name);
      }
    }
  }
  return swapped;
}
