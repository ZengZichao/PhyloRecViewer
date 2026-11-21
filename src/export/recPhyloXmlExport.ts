/**
 * Native recPhyloXML export: serialize a reconciliation back to the format the
 * app reads, so edited/annotated results can be handed to upstream and
 * downstream tools (ALE, GeneRax, Ranger-DTL, Notung, ecceTERA, ...) instead of
 * only through the lossy NHX dialect.
 *
 * The scientific content the viewer models is written back: the species tree
 * (with branch lengths), every gene tree (with its name), all events on every
 * node - in the schema's order, transfer arrivals first - including MULTIPLE
 * transferBack arrivals per node, plus timeSlice, confidence, geneName and
 * branch lengths. Clade-level support elements are parsed but not re-emitted,
 * so the export is full-fidelity for events, not a byte-for-byte round trip.
 *
 * User display renames and annotations are deliberately NOT written into the
 * science names: they are view state, and writing them back would corrupt the
 * entity names the upstream tools match on.
 */
import type { GeneNode, RecEvent, Reconciliation, SpeciesNode } from "../model/types";

/** Escape the five XML special characters for element text and attribute values. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serialize a numeric event attribute, or "" when absent. */
function numAttr(name: string, v: number | undefined): string {
  return v != null && Number.isFinite(v) ? ` ${name}="${esc(String(v))}"` : "";
}

function speciesAttr(v: string | undefined): string {
  return v ? ` speciesLocation="${esc(v)}"` : "";
}

function eventToXml(e: RecEvent): string {
  if (e.type === "transferBack") {
    const dest = e.destinationSpecies ? ` destinationSpecies="${esc(e.destinationSpecies)}"` : "";
    return `<transferBack${dest}${speciesAttr(e.speciesLocation)}${numAttr("timeSlice", e.timeSlice)}${numAttr("confidence", e.confidence)}/>`;
  }
  const geneName = e.type === "leaf" && e.geneName ? ` geneName="${esc(e.geneName)}"` : "";
  return `<${e.type}${speciesAttr(e.speciesLocation)}${geneName}${numAttr("timeSlice", e.timeSlice)}${numAttr("confidence", e.confidence)}/>`;
}

function eventsRecToXml(node: GeneNode): string {
  // Schema order: the IntermediaryEvents (transfer arrivals) come first, then
  // exactly one end event. Keeping the model's event order (arrivals are
  // already stored first) reproduces the input byte-for-byte in practice.
  const inner = node.events.map(eventToXml).join("");
  return `<eventsRec>${inner}</eventsRec>`;
}

function geneNodeToXml(node: GeneNode, indent: string): string {
  const parts: string[] = [];
  const bl =
    node.branchLength != null && Number.isFinite(node.branchLength)
      ? ` branch_length="${esc(String(node.branchLength))}"`
      : "";
  parts.push(`${indent}<clade${bl}>`);
  // Write the clade name whenever the node carries one (leaves included, as
  // real-world recPhyloXML files do), so node names survive the round trip.
  if (node.name) parts.push(`${indent}  <name>${esc(node.name)}</name>`);
  parts.push(`${indent}  ${eventsRecToXml(node)}`);
  for (const c of node.children) parts.push(geneNodeToXml(c, `${indent}  `));
  parts.push(`${indent}</clade>`);
  return parts.join("\n");
}

function speciesNodeToXml(node: SpeciesNode, indent: string): string {
  const bl =
    node.branchLength != null && Number.isFinite(node.branchLength)
      ? ` branch_length="${esc(String(node.branchLength))}"`
      : "";
  const parts: string[] = [`${indent}<clade${bl}>`];
  parts.push(`${indent}  <name>${esc(node.name)}</name>`);
  for (const c of node.children) parts.push(speciesNodeToXml(c, `${indent}  `));
  parts.push(`${indent}</clade>`);
  return parts.join("\n");
}

/**
 * Serialize a reconciliation to recPhyloXML. The root carries the official
 * namespace (the parser strips prefixes, so prefixed documents round-trip as
 * default-namespace documents - same model, canonical spelling).
 */
export function reconToRecPhyloXml(recon: Reconciliation): string {
  const lines: string[] = [];
  lines.push('<recPhylo xmlns="http://www.recg.org">');
  lines.push("  <spTree>");
  lines.push('    <phylogeny rooted="true">');
  lines.push(speciesNodeToXml(recon.species.root, "      "));
  lines.push("    </phylogeny>");
  lines.push("  </spTree>");
  for (const tree of recon.geneTrees) {
    lines.push("  <recGeneTree>");
    const treeName = tree.name ? `\n      <name>${esc(tree.name)}</name>` : "";
    lines.push(`    <phylogeny rooted="true">${treeName}`);
    lines.push(geneNodeToXml(tree.root, "      "));
    lines.push("    </phylogeny>");
    lines.push("  </recGeneTree>");
  }
  lines.push("</recPhylo>");
  return lines.join("\n") + "\n";
}

/**
 * What an NHX export of this reconciliation would LOSE, for the export-time
 * disclosure dialog: time slice and event confidence on transfer arrivals
 * (terminal-event values are written), the species tree (and species never
 * sampled by any gene tree), species branch lengths and the gene-tree names.
 * Multiple arrivals per node are NOT lost: the writer emits TB=, TB2=, TB3=…
 */
export function nhxExportLosses(recon: Reconciliation): string[] {
  const losses: string[] = [];
  let timeSlices = 0;
  let confidences = 0;
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      for (const e of g.events) {
        if (e.type !== "transferBack") continue;
        if (e.timeSlice != null) timeSlices++;
        if (e.confidence != null) confidences++;
      }
    }
  }
  const sampled = new Set<string>();
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) if (g.speciesId) sampled.add(g.speciesId);
  }
  const unsampledSpecies = recon.species.nodes.filter((s) => !sampled.has(s.name));
  const spBranchLengths = recon.species.nodes.filter(
    (s) => s.branchLength != null && Number.isFinite(s.branchLength),
  ).length;
  const treeNames = recon.geneTrees.filter((t) => t.name).length;

  if (timeSlices > 0)
    losses.push(`${timeSlices} ${timeSlices === 1 ? "time slice value on a transfer arrival is" : "time slice values on transfer arrivals are"} not written to NHX`);
  if (confidences > 0)
    losses.push(`${confidences} ${confidences === 1 ? "event confidence value on a transfer arrival is" : "event confidence values on transfer arrivals are"} not written to NHX`);
  if (unsampledSpecies.length > 0)
    losses.push(`${unsampledSpecies.length} ${unsampledSpecies.length === 1 ? "species-tree taxon is" : "species-tree taxa are"} not sampled by any gene tree and would disappear from the NHX species reconstruction`);
  if (spBranchLengths > 0)
    losses.push(`${spBranchLengths} ${spBranchLengths === 1 ? "species branch length is" : "species branch lengths are"} not carried by the NHX species tree`);
  if (treeNames > 0)
    losses.push(`${treeNames} ${treeNames === 1 ? "gene tree name is" : "gene tree names are"} not written to NHX`);
  return losses;
}
