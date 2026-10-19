/**
 * Reconciliation analytics: event counts, per-family breakdown, transfer
 * donor->recipient matrix and per-species event density.
 *
 * All functions are pure over the (immutable) model, so results can be memoized
 * against the current Reconciliation and reused by the stats panel, the copy
 * heatmap and the transfer-network view.
 */
import type { GeneNode, Reconciliation } from "../model/types";
import { computeTransfers } from "../layout/transfers";

/** Counts of each event kind. `transfer` counts transferBack arrivals. */
export interface EventCounts {
  speciation: number;
  duplication: number;
  loss: number;
  branchingOut: number;
  transfer: number;
  bifurcationOut: number;
  leaf: number;
}

export interface FamilyStats {
  index: number;
  name: string;
  nodes: number;
  counts: EventCounts;
}

/** A directed transfer count between two species. */
export interface TransferPair {
  from: string;
  to: string;
  count: number;
}

/** Whether a gene node is a tip (no children) or an internal node. */
export type NodeKind = "leaf" | "internal";

/** One gene node, numbered for cross-reference in the statistics panel. */
export interface NodeInfo {
  /** Stable gene node id, so a table row can locate the node on the canvas. */
  id: string;
  /**
   * 1-based number in the listing order: all tips (leaves) first, then internal
   * nodes (the usual phylogenetic convention), NOT raw parse order.
   */
  num: number;
  name: string;
  kind: NodeKind;
  event: GeneNode["endEvent"]["type"];
  species: string;
  family: number;
  familyName: string;
}

export interface SpeciesEventCount {
  species: string;
  counts: EventCounts;
  total: number;
  /**
   * Non-loss gene nodes assigned to this species. NOTE: this is NOT the
   * concurrent copy number (a duplication plus its two children all resident
   * here would count 3). The on-screen copy-number heatmap uses the true
   * concurrent value, `laneCount`, computed by the layout; this column
   * is an event-density measure and is labeled accordingly.
   */
  copies: number;
}

export interface ReconStats {
  total: EventCounts;
  families: FamilyStats[];
  transferMatrix: TransferPair[];
  perSpecies: SpeciesEventCount[];
  /** Every gene node, numbered and tagged tip/internal. */
  nodes: NodeInfo[];
  leafCount: number;
  internalCount: number;
}

function emptyCounts(): EventCounts {
  return { speciation: 0, duplication: 0, loss: 0, branchingOut: 0, transfer: 0, bifurcationOut: 0, leaf: 0 };
}

function tallyNode(c: EventCounts, g: GeneNode): void {
  switch (g.endEvent.type) {
    case "speciation":
      c.speciation++;
      break;
    case "duplication":
      c.duplication++;
      break;
    case "loss":
      c.loss++;
      break;
    case "branchingOut":
      c.branchingOut++;
      break;
    case "bifurcationOut":
      c.bifurcationOut++;
      break;
    case "leaf":
      c.leaf++;
      break;
  }
  // `transfer` is an overlay count of transferBack ARRIVALS: it is orthogonal to
  // the mutually-exclusive terminal event above (a transfer arrival also carries
  // its own terminal event), so it is NOT part of the six-way partition. Count
  // every arrival event, not one-per-node, so a clade with several outgoing
  // transfers is not undercounted.
  for (const e of g.events) if (e.type === "transferBack") c.transfer++;
}

/** Species a gene node is counted under (its recorded host). */
function nodeSpecies(g: GeneNode): string {
  // g.speciesId is resolved during parsing to endEvent.speciesLocation ?? the
  // transferBack destination, so it is the authoritative host; the location
  // fallback below only applies to a node whose speciesId is empty.
  return g.speciesId || (g.endEvent.speciesLocation ?? "");
}

/** Compute the full statistics bundle for a reconciliation. */
export function computeStats(recon: Reconciliation): ReconStats {
  const total = emptyCounts();
  const families: FamilyStats[] = [];
  const perSpeciesMap = new Map<string, EventCounts>();
  const copiesMap = new Map<string, number>();
  const nodes: NodeInfo[] = [];
  const rawNodes: Omit<NodeInfo, "num">[] = [];
  let leafCount = 0;
  let internalCount = 0;

  for (const tree of recon.geneTrees) {
    const counts = emptyCounts();
    for (const g of tree.nodes) {
      tallyNode(counts, g);
      tallyNode(total, g);
      const sp = nodeSpecies(g);
      // "leaf" means an extant gene (a `leaf` event), not merely "has no
      // children": a gene LOSS also has no children, so classifying it as a tip
      // would make the panel's tip count contradict its own leaf-event count
      // for the same document.
      const kind: NodeKind = g.endEvent.type === "leaf" ? "leaf" : "internal";
      if (kind === "leaf") leafCount++;
      else internalCount++;
      rawNodes.push({
        id: g.id,
        name: (g.endEvent.type === "leaf" ? g.endEvent.geneName || g.name : g.name) || "",
        kind,
        event: g.endEvent.type,
        species: sp,
        family: tree.index,
        familyName: tree.name || `#${tree.index + 1}`,
      });
      if (sp) {
        const m = perSpeciesMap.get(sp) ?? emptyCounts();
        tallyNode(m, g);
        perSpeciesMap.set(sp, m);
        // Count every non-loss gene node resident in this species (an
        // event-density measure, not the concurrent copy number - see the
        // `copies` field doc).
        if (g.endEvent.type !== "loss") {
          copiesMap.set(sp, (copiesMap.get(sp) ?? 0) + 1);
        }
      }
    }
    families.push({
      index: tree.index,
      name: tree.name || `#${tree.index + 1}`,
      nodes: tree.nodes.length,
      counts,
    });
  }

  // Number nodes tips-first, then internal nodes (the usual phylogenetic
  // convention), so the list reads 1..leaves then leaves+1..N.
  let n = 0;
  for (const r of rawNodes) if (r.kind === "leaf") nodes.push({ num: ++n, ...r });
  for (const r of rawNodes) if (r.kind === "internal") nodes.push({ num: ++n, ...r });

  // Transfer donor -> recipient matrix (by species name).
  const pairMap = new Map<string, number>();
  for (const t of computeTransfers(recon)) {
    const from = t.from.speciesId || "?";
    const to = t.to.speciesId || t.to.endEvent.destinationSpecies || "?";
    const key = `${from}\u0000${to}`;
    pairMap.set(key, (pairMap.get(key) ?? 0) + 1);
  }
  const transferMatrix: TransferPair[] = [...pairMap.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split("\u0000");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  const perSpecies: SpeciesEventCount[] = [...perSpeciesMap.entries()]
    .map(([species, counts]) => ({
      species,
      counts,
      total:
        counts.speciation +
        counts.duplication +
        counts.loss +
        counts.branchingOut +
        counts.bifurcationOut +
        counts.leaf,
      copies: copiesMap.get(species) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { total, families, transferMatrix, perSpecies, nodes, leafCount, internalCount };
}

/** Max non-loss node count across species (scales the stats table's density
 *  column only; the copy-number heatmap scales by layout `laneCount`). */
export function maxCopies(stats: ReconStats): number {
  let m = 0;
  for (const s of stats.perSpecies) m = Math.max(m, s.copies);
  return m;
}

function csvCell(v: string | number): string {
  let s = String(v);
  // Neutralize CSV formula / DDE injection: a cell beginning with a formula
  // trigger is prefixed with a single quote so spreadsheets treat it as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Serialize the statistics to a multi-section CSV document (per-family counts,
 * transfer matrix and per-species density), using the supplied localized
 * column headers.
 */
export function statsToCsv(
  stats: ReconStats,
  headers: {
    family: string;
    species: string;
    speciation: string;
    duplication: string;
    loss: string;
    branchingOut: string;
    bifurcationOut: string;
    leafEvent: string;
    transfer: string;
    donor: string;
    recipient: string;
    count: string;
    copies: string;
    nodes: string;
    nodesSection: string;
    num: string;
    name: string;
    type: string;
    event: string;
    nodeLeaf: string;
    nodeInternal: string;
  },
): string {
  const lines: string[] = [];
  lines.push(`# ${headers.family}`);
  lines.push(
    csvRow([
      headers.family,
      headers.nodes,
      headers.speciation,
      headers.duplication,
      headers.loss,
      headers.branchingOut,
      headers.bifurcationOut,
      headers.leafEvent,
      headers.transfer,
    ]),
  );
  for (const f of stats.families) {
    lines.push(
      csvRow([
        f.name,
        f.nodes,
        f.counts.speciation,
        f.counts.duplication,
        f.counts.loss,
        f.counts.branchingOut,
        f.counts.bifurcationOut,
        f.counts.leaf,
        f.counts.transfer,
      ]),
    );
  }

  lines.push("");
  lines.push(`# ${headers.donor} -> ${headers.recipient}`);
  lines.push(csvRow([headers.donor, headers.recipient, headers.count]));
  for (const p of stats.transferMatrix) lines.push(csvRow([p.from, p.to, p.count]));

  lines.push("");
  lines.push(`# ${headers.species}`);
  lines.push(
    csvRow([
      headers.species,
      headers.copies,
      headers.speciation,
      headers.duplication,
      headers.loss,
      headers.branchingOut,
      headers.bifurcationOut,
      headers.leafEvent,
      headers.transfer,
    ]),
  );
  for (const s of stats.perSpecies) {
    lines.push(
      csvRow([
        s.species,
        s.copies,
        s.counts.speciation,
        s.counts.duplication,
        s.counts.loss,
        s.counts.branchingOut,
        s.counts.bifurcationOut,
        s.counts.leaf,
        s.counts.transfer,
      ]),
    );
  }

  lines.push("");
  lines.push(`# ${headers.nodesSection}`);
  lines.push(csvRow([headers.num, headers.name, headers.type, headers.event, headers.species, headers.family]));
  for (const n of stats.nodes) {
    lines.push(
      csvRow([
        n.num,
        n.name,
        n.kind === "leaf" ? headers.nodeLeaf : headers.nodeInternal,
        n.event,
        n.species,
        n.familyName,
      ]),
    );
  }

  return lines.join("\n");
}
