/**
 * Format detection + dispatch for the file-open flow. recPhyloXML is the native
 * format; reconciled NHX gene trees are read directly, so a file from a
 * duplication/loss tool can be opened without converting it first.
 */
import type { GeneTree, Reconciliation } from "../model/types";
import { assignStableGeneIds, documentNamespace } from "../model/stableId";
import { parseRecPhyloXML } from "./recphyloxml";
import { parseNhxReconciliation } from "./nhx";

export type InputFormat = "recphyloxml" | "nhx";

/** Guess the input format from content (preferred) and file extension. */
export function detectFormat(text: string, fileName?: string): InputFormat {
  const head = text.slice(0, 8000).toLowerCase();
  if (head.includes("<recphylo")) return "recphyloxml";
  if (head.includes("[&&nhx")) return "nhx";
  const trimmed = text.trim();
  // A Newick statement ends with ";" and never contains markup. Keying only on
  // a leading "(" would send bracket-free single-leaf trees ("SpeciesA;") to
  // the XML parser, whose "missing <recPhylo> root" reply reads as though the
  // Newick itself were malformed.
  if (trimmed.includes(";") && !trimmed.includes("<")) return "nhx";
  if (trimmed.startsWith("(")) return "nhx";
  const ext = (fileName ?? "").toLowerCase();
  if (ext.endsWith(".nhx") || ext.endsWith(".nwk") || ext.endsWith(".newick")) {
    return "nhx";
  }
  return "recphyloxml";
}

/**
 * Parse any supported reconciliation format into the normalized model.
 *
 * `ns` overrides the per-document id namespace (see model/stableId.ts); by
 * default it is derived deterministically from the file name and content so
 * two different files with identical trees never share node ids.
 */
export function parseReconciliation(
  text: string,
  fileName?: string,
  ns?: string,
): Reconciliation {
  const namespace = ns ?? documentNamespace(fileName ?? "", text);
  return detectFormat(text, fileName) === "nhx"
    ? parseNhxReconciliation(text, namespace)
    : parseRecPhyloXML(text, namespace);
}

/**
 * Parse several gene-family files and merge them into one reconciliation that
 * shares the *first* file's species tree. Gene trees are re-indexed and named
 * after their source file so the legend/colors can tell them apart. Species
 * referenced by later files but absent from the first tree are reported.
 */
export function parseMerged(files: { name: string; text: string }[]): Reconciliation {
  const parsed = files
    .filter((f) => f.text.trim().length > 0)
    .map((f) => {
      const ns = documentNamespace(f.name, f.text);
      return { name: f.name, ns, recon: parseReconciliation(f.text, f.name, ns) };
    });
  if (parsed.length === 0) throw new Error("No files to load.");
  if (parsed.length === 1) return parsed[0].recon;

  const base = parsed[0].recon;
  const geneTrees: GeneTree[] = [];
  // Warnings from *every* file are kept, prefixed by file name - dropping the
  // later files' warnings would hide malformed input from the user.
  const warnings: string[] = [];
  let idx = 0;
  for (const { name, recon } of parsed) {
    for (const w of recon.warnings) warnings.push(`${name}: ${w}`);
    const famBase = name.replace(/\.[^.]+$/, "");
    const multi = recon.geneTrees.length > 1;
    for (const gt of recon.geneTrees) {
      const newIdx = idx++;
      for (const nd of gt.nodes) nd.treeIndex = newIdx;
      geneTrees.push({
        index: newIdx,
        name: gt.name ?? (multi ? `${famBase} #${gt.index + 1}` : famBase),
        root: gt.root,
        nodes: gt.nodes,
      });
    }
  }
  // The stable node ids were computed against each file's LOCAL treeIndex.
  // Re-derive them now that treeIndex is the global merged index: two
  // byte-identical files (same namespace) then land on disjoint ids, and no id
  // carries a stale treeIndex, which would silently overwrite coordinates in
  // Positions. The merge is a deterministic function of the file list, so
  // re-parsing the same session reproduces the same ids.
  for (const { ns, recon } of parsed) {
    assignStableGeneIds(recon.geneTrees.map((t) => t.root), ns);
  }
  const missing = new Set<string>();
  for (const gt of geneTrees) {
    for (const nd of gt.nodes) {
      if (nd.speciesId && !base.species.byName.has(nd.speciesId)) missing.add(nd.speciesId);
    }
  }
  if (missing.size > 0) {
    warnings.push(
      `${missing.size} species referenced by merged families are absent from the first file's species tree.`,
    );
  }

  // Detect species-tree TOPOLOGY mismatches between files. Shared species names
  // with different parentage would otherwise be drawn on the wrong tree with no
  // warning at all: compare each file's edge set against the first's.
  const edgeSet = (st: Reconciliation["species"]): Set<string> => {
    const s = new Set<string>();
    for (const n of st.nodes) if (n.parent) s.add(`${n.parent.name}\u2192${n.name}`);
    return s;
  };
  const baseEdges = edgeSet(base.species);
  for (const { name, recon } of parsed.slice(1)) {
    const edges = edgeSet(recon.species);
    let extra = 0;
    for (const e of edges) if (!baseEdges.has(e)) extra++;
    if (extra > 0) {
      warnings.push(
        `${name}: its species tree has ${extra} branch(es) that differ from the first file's species tree; the merged view is drawn on the first file's species tree only.`,
      );
    }
  }

  return { species: base.species, geneTrees, warnings };
}
