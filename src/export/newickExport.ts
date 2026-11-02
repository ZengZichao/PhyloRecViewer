/**
 * Reverse export: serialize a reconciled gene tree back to NHX so it can feed
 * downstream Newick/NHX-consuming tools - and be re-read by this app without
 * losing events.
 *
 * Dialect (read back by parser/nhx.ts). This is a superset of classic NHX; a
 * reader that only understands S/D will still open the tree but will treat
 * transfers and losses as ordinary tips, so this dialect is NOT a universal
 * exchange format. recPhyloXML is the app's lossless export - the export menu
 * offers it first, and the NHX item discloses what a given document would lose.
 *   S=<species>          species
 *   D=Y|N                duplication
 *   L=Y                  gene loss
 *   BO=Y / BC=Y          branching-out / bifurcation-out transfer donor
 *   TB=<donor>|<recipient>   first transfer-back arrival (TB2…TBn: further ones)
 *   TS=<n> / CN=<n>      terminal-event timeSlice / confidence
 *   BL=<number>          gene-tree branch length (redundant with :length)
 * A node without any event tag falls back to leaf / speciation by structure.
 * When several event tags compete on one node (e.g. D=Y together with L=Y) the
 * winner is chosen with the SAME precedence the recPhyloXML reader uses
 * (duplication > loss > branchingOut > bifurcationOut) and a warning names the
 * conflict.
 */
import type { GeneNode, Reconciliation } from "../model/types";
import { encodeNhxValue } from "../parser/newick";

/** Characters that must not appear bare in a Newick label. */
const LABEL_UNSAFE = /[\s(),:;[\]'"@&]/;

/** Quote a label per the Newick convention (wrap in '...', double inner ''). */
function safeLabel(name: string): string {
  if (!name) return "";
  if (LABEL_UNSAFE.test(name)) return "'" + name.replace(/'/g, "''") + "'";
  return name;
}

/**
 * Resolve the species an NHX `S=` tag is written from. NHX re-import requires
 * EVERY internal node to carry `S=` (that is how the species tree is
 * reconstructed), so a node whose model species is empty falls back to its
 * parent's species - the vertical-inheritance reading - instead of emitting a
 * file this app itself could not open.
 */
function speciesTagFor(node: GeneNode): string | null {
  if (node.speciesId) return node.speciesId;
  let p = node.parent;
  while (p) {
    if (p.speciesId) return p.speciesId;
    p = p.parent;
  }
  return null;
}

function nodeToNhx(node: GeneNode): string {
  const children = node.children.length
    ? "(" + node.children.map(nodeToNhx).join(",") + ")"
    : "";
  const label = safeLabel(node.endEvent.geneName || node.name || "");
  const tags: string[] = [];
  const species = speciesTagFor(node);
  if (species) tags.push(`S=${encodeNhxValue(species)}`);
  const type = node.endEvent.type;
  tags.push(`D=${type === "duplication" ? "Y" : "N"}`);
  if (type === "loss") tags.push("L=Y");
  if (type === "branchingOut") tags.push("BO=Y");
  if (type === "bifurcationOut") tags.push("BC=Y");
  // Every arrival gets its own tag: TB= carries the first, TB2..TB9 the rest,
  // so a node with multiple transfer arrivals round-trips one-for-one. Donor
  // and recipient are encoded SEPARATELY and joined with a bare `|`, so a
  // species value containing a pipe cannot corrupt the donor/recipient split.
  const arrivals = node.events.filter((e) => e.type === "transferBack");
  arrivals.forEach((transferBack, i) => {
    const donor = transferBack.speciesLocation ?? node.parent?.speciesId ?? "?";
    const recipient = transferBack.destinationSpecies ?? node.speciesId ?? "?";
    tags.push(
      `${i === 0 ? "TB" : `TB${i + 1}`}=${encodeNhxValue(donor)}|${encodeNhxValue(recipient)}`,
    );
  });
  if (node.endEvent.timeSlice != null) tags.push(`TS=${node.endEvent.timeSlice}`);
  if (node.endEvent.confidence != null) tags.push(`CN=${node.endEvent.confidence}`);
  if (node.support) tags.push(`B=${node.support.value}`);
  // The branch length is written in the STANDARD Newick `:length` position AND
  // as the redundant BL= tag, so both standard readers and this app's dialect
  // see the same value.
  const hasLength = node.branchLength != null && Number.isFinite(node.branchLength);
  const lengthSuffix = hasLength ? `:${node.branchLength}` : "";
  if (hasLength) tags.push(`BL=${node.branchLength}`);
  return `${children}${label}[&&NHX:${tags.join(":")}]${lengthSuffix}`;
}

/** Serialize every gene tree of a reconciliation to one NHX line each. */
export function reconToNhx(recon: Reconciliation): string {
  return (
    recon.geneTrees.map((t) => `${nodeToNhx(t.root)};`).join("\n") + "\n"
  );
}
