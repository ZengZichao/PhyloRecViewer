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
 * referenced by later files but absent from the first tree are reported, as are
 * branches of the first tree that a later file's own species tree lacks.
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
  // Same-basename files (e.g. two directories both containing "result.xml")
  // would produce identical family names and indistinguishable legend colors;
  // disambiguate with a numbered suffix.
  const famNameSeen = new Map<string, number>();
  const famNameFor = (fileName: string): string => {
    const base_ = fileName.replace(/\.[^.]+$/, "");
    const n = famNameSeen.get(base_) ?? 0;
    famNameSeen.set(base_, n + 1);
    return n === 0 ? base_ : `${base_} (${n + 1})`;
  };
  let idx = 0;
  for (const { name, recon } of parsed) {
    for (const w of recon.warnings) warnings.push(`${name}: ${w}`);
    const famBase = famNameFor(name);
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
      `${missing.size} species referenced by merged families ${missing.size === 1 ? "is" : "are"} absent from the first file's species tree.`,
    );
  }

  // Detect species-tree TOPOLOGY mismatches between files, in BOTH directions:
  // branches a later file lacks (its species tree is a subset - a dropped
  // clade) and branches it adds. Either way the merged view is drawn on the
  // first file's tree, and a family drawn on a tree that disagrees with its own
  // input must be visible, not silent.
  const edgeSet = (st: Reconciliation["species"]): Set<string> => {
    const s = new Set<string>();
    for (const n of st.nodes) if (n.parent) s.add(`${n.parent.name}\u2192${n.name}`);
    return s;
  };
  const baseEdges = edgeSet(base.species);
  for (const { name, recon } of parsed.slice(1)) {
    const edges = edgeSet(recon.species);
    let extra = 0;
    let missingEdges = 0;
    const missingSpecies = new Set<string>();
    for (const e of edges) {
      if (!baseEdges.has(e)) {
        extra++;
      }
    }
    for (const e of baseEdges) {
      if (!edges.has(e)) {
        missingEdges++;
        const child = e.split("\u2192")[1];
        if (child) missingSpecies.add(child);
      }
    }
    if (extra > 0) {
      warnings.push(
        `${name}: its species tree has ${extra} ${extra === 1 ? "branch that differs" : "branches that differ"} from the first file's species tree; the merged view is drawn on the first file's species tree only.`,
      );
    }
    if (missingEdges > 0) {
      warnings.push(
        `${name}: its species tree is missing ${missingEdges} ${missingEdges === 1 ? "branch" : "branches"} present in the first file's species tree (e.g. ${[...missingSpecies].slice(0, 3).join(", ")}); the merged view is drawn on the first file's species tree only.`,
      );
    }
  }

  return { species: base.species, geneTrees, warnings };
}

/**
 * Detect an encoding problem a successful-but-lossy UTF-8 decode would leave
 * behind, before the text reaches the parsers: UTF-16 byte pairs decoded as
 * UTF-8 show up as NUL characters, and an XML declaration naming another
 * single-byte encoding means the bytes were NOT decoded as the file claims.
 * Returns a user-facing problem description, or null when the text is plausibly
 * correct UTF-8.
 */
export function detectEncodingProblem(text: string): string | null {
  const head = text.slice(0, 400);
  if (head.includes("\u0000")) {
    return "This file does not appear to be UTF-8 text (it contains NUL bytes, as UTF-16 files do when decoded as UTF-8). Re-export it as UTF-8 and try again.";
  }
  const decl = head.match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  if (decl) {
    const enc = decl[1].trim().toLowerCase();
    if (enc !== "utf-8" && enc !== "utf8") {
      return `The XML declaration says encoding="${decl[1]}" but the file was decoded as UTF-8. Non-UTF-8 files (e.g. ${decl[1]}) are not supported; re-save the file as UTF-8.`;
    }
  }
  if (/^\uFFFD/.test(text)) {
    return "This file could not be decoded as UTF-8 (it starts with a replacement character). Re-save it as UTF-8.";
  }
  return null;
}
