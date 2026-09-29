/**
 * Reverse export: serialize a reconciled gene tree back to NHX so it can feed
 * downstream Newick/NHX-consuming tools - and be re-read by this app without
 * losing events.
 *
 * Dialect (read back by parser/nhx.ts). This is a superset of classic NHX; a
 * reader that only understands S/D will still open the tree but will treat
 * transfers and losses as ordinary tips, so the app's NHX export is only
 * lossless for this app. Use recPhyloXML for a fully lossless, self-describing
 * round-trip (B-03 / J-03).
 *   S=<species>          species
 *   D=Y|N                duplication
 *   L=Y                  gene loss
 *   BO=Y / BC=Y          branching-out / bifurcation-out transfer donor
 *   TB=<donor>|<recip>   transfer-back arrival
 *   BL=<number>          gene-tree branch length (when present)
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

function nodeToNhx(node: GeneNode): string {
  const children = node.children.length
    ? "(" + node.children.map(nodeToNhx).join(",") + ")"
    : "";
  const label = safeLabel(node.endEvent.geneName || node.name || "");
  const tags: string[] = [];
  if (node.speciesId) tags.push(`S=${encodeNhxValue(node.speciesId)}`);
  const type = node.endEvent.type;
  tags.push(`D=${type === "duplication" ? "Y" : "N"}`);
  if (type === "loss") tags.push("L=Y");
  if (type === "branchingOut") tags.push("BO=Y");
  if (type === "bifurcationOut") tags.push("BC=Y");
  const transferBack = node.events.find((e) => e.type === "transferBack");
  if (transferBack) {
    const donor = transferBack.speciesLocation ?? node.parent?.speciesId ?? "?";
    const recipient = transferBack.destinationSpecies ?? node.speciesId ?? "?";
    tags.push(`TB=${encodeNhxValue(`${donor}|${recipient}`)}`);
  }
  if (node.branchLength != null && Number.isFinite(node.branchLength)) {
    tags.push(`BL=${node.branchLength}`);
  }
  return `${children}${label}[&&NHX:${tags.join(":")}]`;
}

/** Serialize every gene tree of a reconciliation to one NHX line each. */
export function reconToNhx(recon: Reconciliation): string {
  return (
    recon.geneTrees.map((t) => `${nodeToNhx(t.root)};`).join("\n") + "\n"
  );
}
