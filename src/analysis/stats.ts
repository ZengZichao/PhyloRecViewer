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

/**
 * Structural class of a gene node. "leaf" means an extant gene (a `leaf`
 * terminal event), "loss" a gene-loss node, and "internal" any other event
 * node. Losses were previously folded into "internal", which read as though
 * the tree had a tip where it only has a loss.
 */
export type NodeKind = "leaf" | "loss" | "internal";

/** One gene node, numbered for cross-reference in the statistics panel. */
export interface NodeInfo {
  /** Stable gene node id, so a table row can locate the node on the canvas. */
  id: string;
  /**
   * 1-based number in the listing order: all tips (leaves) first, then losses,
   * then internal nodes, NOT raw parse order.
   */
  num: number;
  name: string;
  kind: NodeKind;
  event: GeneNode["endEvent"]["type"];
  species: string;
  family: number;
  familyName: string;
  /** Donor species of each transfer arrival (";"-joined when several). */
  donors: string;
  /** Recipient species of each transfer arrival (";"-joined when several). */
  recipients: string;
  timeSlice: number | null;
  confidence: number | null;
  branchLength: number | null;
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

/** Nodes whose species is unknown, kept out of `perSpecies` on purpose. */
export interface UnassignedStats {
  nodes: number;
  counts: EventCounts;
}

export interface ReconStats {
  total: EventCounts;
  families: FamilyStats[];
  transferMatrix: TransferPair[];
  perSpecies: SpeciesEventCount[];
  /** Every gene node, numbered and tagged leaf/loss/internal. */
  nodes: NodeInfo[];
  /** Extant-gene tips (terminal `leaf` events). */
  leafCount: number;
  /** Gene-loss nodes (terminal `loss` events). */
  lossCount: number;
  /** All other event nodes. */
  internalCount: number;
  /** Nodes without any species, so Σ perSpecies + unassigned = total. */
  unassigned: UnassignedStats;
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

function kindOf(g: GeneNode): NodeKind {
  if (g.endEvent.type === "leaf") return "leaf";
  if (g.endEvent.type === "loss") return "loss";
  return "internal";
}

/** Compute the full statistics bundle for a reconciliation. */
export function computeStats(recon: Reconciliation): ReconStats {
  const total = emptyCounts();
  const families: FamilyStats[] = [];
  const perSpeciesMap = new Map<string, EventCounts>();
  const copiesMap = new Map<string, number>();
  const nodes: NodeInfo[] = [];
  const rawNodes: Omit<NodeInfo, "num">[] = [];
  const unassigned: UnassignedStats = { nodes: 0, counts: emptyCounts() };
  let leafCount = 0;
  let lossCount = 0;
  let internalCount = 0;

  for (const tree of recon.geneTrees) {
    const counts = emptyCounts();
    for (const g of tree.nodes) {
      tallyNode(counts, g);
      tallyNode(total, g);
      const sp = nodeSpecies(g);
      const kind = kindOf(g);
      if (kind === "leaf") leafCount++;
      else if (kind === "loss") lossCount++;
      else internalCount++;
      const arrivals = g.events.filter((e) => e.type === "transferBack");
      rawNodes.push({
        id: g.id,
        name: (g.endEvent.type === "leaf" ? g.endEvent.geneName || g.name : g.name) || "",
        kind,
        event: g.endEvent.type,
        species: sp,
        family: tree.index,
        familyName: tree.name || `#${tree.index + 1}`,
        donors: arrivals.map((e) => e.speciesLocation ?? "?").join(";"),
        recipients: arrivals.map((e) => e.destinationSpecies ?? "?").join(";"),
        timeSlice: g.endEvent.timeSlice ?? arrivals.find((e) => e.timeSlice != null)?.timeSlice ?? null,
        confidence: g.endEvent.confidence ?? arrivals.find((e) => e.confidence != null)?.confidence ?? null,
        branchLength: g.branchLength ?? null,
      });
      if (sp && recon.species.byName.has(sp)) {
        const m = perSpeciesMap.get(sp) ?? emptyCounts();
        tallyNode(m, g);
        perSpeciesMap.set(sp, m);
        // Count every non-loss gene node resident in this species (an
        // event-density measure, not the concurrent copy number - see the
        // `copies` field doc).
        if (g.endEvent.type !== "loss") {
          copiesMap.set(sp, (copiesMap.get(sp) ?? 0) + 1);
        }
      } else {
        // Nodes without a species - or referencing a species the tree does not
        // contain - get their own bucket so the per-species table can account
        // for the whole document (Σ perSpecies + unassigned = total).
        unassigned.nodes++;
        tallyNode(unassigned.counts, g);
      }
    }
    families.push({
      index: tree.index,
      name: tree.name || `#${tree.index + 1}`,
      nodes: tree.nodes.length,
      counts,
    });
  }

  // Number nodes tips-first, then losses, then internal nodes, so the list
  // reads extant genes, losses, then the internal events.
  let n = 0;
  for (const r of rawNodes) if (r.kind === "leaf") nodes.push({ num: ++n, ...r });
  for (const r of rawNodes) if (r.kind === "loss") nodes.push({ num: ++n, ...r });
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

  return { total, families, transferMatrix, perSpecies, nodes, leafCount, lossCount, internalCount, unassigned };
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

export interface StatsCsvMeta {
  /** Source document name(s), written into the header comment block. */
  sourceFile?: string | null;
  /** The writing application + version, e.g. "PhyloRecViewer 0.2.0". */
  generatedBy?: string;
  /** ISO timestamp of the export. */
  generatedAt?: string;
}

/**
 * Serialize the statistics to a machine-readable CSV document.
 *
 * The CSV is deliberately LOCALE-INDEPENDENT: stable English column names and
 * English enum values, so a downstream pipeline (pandas/R/Excel Power Query)
 * never sees the UI language. A UTF-8 BOM is prepended so Windows Excel opens
 * species names without mojibake. Localized values remain a UI concern only.
 */
export function statsToCsv(stats: ReconStats, meta: StatsCsvMeta = {}): string {
  const lines: string[] = [];
  // Header block: provenance for anyone reading the file months later.
  lines.push(`# PhyloRecViewer statistics export`);
  if (meta.generatedBy) lines.push(`# generated_by,${csvCell(meta.generatedBy)}`);
  if (meta.generatedAt) lines.push(`# generated_at,${csvCell(meta.generatedAt)}`);
  if (meta.sourceFile) lines.push(`# source_file,${csvCell(meta.sourceFile)}`);
  lines.push("# csv_format,PhyloRecViewer stats v2 (UTF-8 BOM; sections: families, transfer_matrix, species, nodes)");

  lines.push("");
  lines.push("# section: families");
  lines.push(csvRow(["family", "nodes", "speciation", "duplication", "loss", "branching_out", "bifurcation_out", "leaf", "transfer_arrivals"]));
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
  lines.push("# section: transfer_matrix (donor -> recipient, one row per species pair)");
  lines.push(csvRow(["donor", "recipient", "count"]));
  for (const p of stats.transferMatrix) lines.push(csvRow([p.from, p.to, p.count]));

  lines.push("");
  lines.push("# section: species (per-species event density; copies = non-loss node count, NOT concurrent copy number)");
  lines.push(csvRow(["species", "copies", "speciation", "duplication", "loss", "branching_out", "bifurcation_out", "leaf", "transfer_arrivals"]));
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
  if (stats.unassigned.nodes > 0) {
    const c = stats.unassigned.counts;
    lines.push(
      csvRow([
        "(no species)",
        0,
        c.speciation,
        c.duplication,
        c.loss,
        c.branchingOut,
        c.bifurcationOut,
        c.leaf,
        c.transfer,
      ]),
    );
  }

  lines.push("");
  lines.push("# section: nodes (kind: leaf=extant gene, loss=gene loss, internal=other event)");
  lines.push(
    csvRow([
      "num", "name", "kind", "event", "species", "family",
      "donors", "recipients", "time_slice", "confidence", "branch_length",
    ]),
  );
  for (const n of stats.nodes) {
    lines.push(
      csvRow([
        n.num,
        n.name,
        n.kind,
        n.event,
        n.species,
        n.familyName,
        n.donors,
        n.recipients,
        n.timeSlice ?? "",
        n.confidence ?? "",
        n.branchLength ?? "",
      ]),
    );
  }

  // UTF-8 BOM: Windows Excel decodes the file as UTF-8 instead of ANSI.
  return "\uFEFF" + lines.join("\n");
}
