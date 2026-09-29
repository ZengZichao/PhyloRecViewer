import type { GeneNode, Reconciliation, TransferEdge } from "../model/types";

/** A node is a valid transfer donor only if it is a branching/bifurcation out. */
export function isTransferDonor(g: GeneNode | null): boolean {
  return !!g && (g.endEvent.type === "branchingOut" || g.endEvent.type === "bifurcationOut");
}

/**
 * Derive directed transfer edges from the event model.
 *
 * A horizontal gene transfer is encoded as a `branchingOut` / `bifurcationOut`
 * donor whose child carries a `transferBack` arrival. An arrival connects to its
 * parent ONLY when that parent really is a donor: a `transferBack` under an
 * ordinary speciation is a data error, not a transfer, so no arc is drawn and
 * the vertical tree edge is preserved (`validate.ts` flags it).
 *
 * Each `transferBack` event yields its own arc, so a clade carrying several
 * arrivals (one split, multiple outgoing lineages, as PrIME emits) contributes
 * one edge per arrival and nothing merges into a single counted transfer.
 */
export function computeTransfers(recon: Reconciliation): TransferEdge[] {
  const edges: TransferEdge[] = [];
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (!isTransferDonor(g.parent)) continue;
      let arrival = 0;
      for (const e of g.events) {
        if (e.type !== "transferBack") continue;
        edges.push({
          id: `t_${g.id}_${arrival++}`,
          from: g.parent as GeneNode,
          to: g,
          treeIndex: tree.index,
        });
      }
    }
  }
  return edges;
}
