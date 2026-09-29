/**
 * Build a Reconciliation from a reconciled gene tree in NHX format.
 *
 * recPhyloXML's own NHX workflow pairs the gene tree with a separate species
 * tree, but well-annotated NHX (e.g. the vendored `9999.nhx.xml` sample) carries
 * a species `S=` tag on *every* node - including internals - so the species tree
 * can be reconstructed directly from the gene tree, making the file
 * self-contained.
 *
 * Event model. This reader understands a superset of the classic New Hampshire
 * eXtended convention so it can losslessly read back what the app's own NHX
 * exporter writes (see export/newickExport.ts):
 *   S=<species>          species the node lives in (SP= accepted as an alias)
 *   D=Y|N                duplication
 *   L=Y                  gene loss
 *   BO=Y                 branching-out transfer donor
 *   BC=Y                 bifurcation-out transfer donor (both lineages leave)
 *   TB=<donor>|<recip>   transfer-back arrival (this node was horizontally moved)
 *   BL=<number>          gene-tree branch length
 * A node without any event tag falls back to leaf / speciation by structure.
 * When several event tags compete on one node (e.g. D=Y together with L=Y) the
 * winner is chosen with the SAME precedence the recPhyloXML reader uses
 * (duplication > loss > branchingOut > bifurcationOut) and a warning names the
 * conflict.
 *
 * Species-tree reconstruction uses only VERTICAL edges. A transfer-arrival edge
 * (a child carrying TB=) is horizontal movement, not common ancestry, so it is
 * excluded. Genuine third-party NHX files that contain HGT but carry no
 * TB= marker cannot be distinguished from speciation by this dialect, so we say
 * so explicitly rather than silently producing a wrong topology.
 */
import type {
  EndEventType,
  GeneNode,
  GeneTree,
  RecEvent,
  Reconciliation,
  SpeciesNode,
  SpeciesTree,
} from "../model/types";
import { assignStableGeneIds, assignStableSpeciesIds } from "../model/stableId";
import { resolveEndEventType } from "./recphyloxml";
import { parseNewick, type NewickNode } from "./newick";

let NHX_SEQ = 0;

export class NhxParseError extends Error {}

/**
 * Recursion-depth ceiling for the reconstructed species / gene tree builders.
 * Must stay below the real JS stack capacity (see newick.ts); a legal-but-deep
 * tree then fails with a friendly, catchable error rather than an uncatchable
 * RangeError.
 */
const MAX_TREE_DEPTH = 1000;

/**
 * Species tag for one node. `SP=` is accepted as an alias because some
 * third-party NHX writers emit it; it is part of this reader's dialect and is
 * covered by a test (see nhx.test.ts "accepts the SP= species alias").
 */
const speciesOf = (node: NewickNode): string | undefined =>
  node.nhx.S || node.nhx.SP || undefined;

/** NHX keys this reader interprets. Anything else is kept but reported. */
const INTERPRETED_NHX_KEYS = new Set(["S", "SP", "D", "L", "BO", "BC", "TB", "BL"]);

const flag = (v: string | undefined): boolean =>
  (v ?? "").toUpperCase() === "Y";

/** Classified event view of one Newick node (structure + NHX tags). */
interface Classified {
  endType: EndEventType;
  /** Transfer-back arrival, when present: donor and recipient species. */
  arrival?: { donor: string; recipient: string };
  /** Branch length, when the input provides one. */
  branchLength?: number;
  /** True when this node is the child end of a horizontal transfer edge. */
  isTransferArrival: boolean;
}

function classify(nd: NewickNode, warnings: string[]): Classified {
  const isLeaf = nd.children.length === 0;
  const label = nd.name || speciesOf(nd) || "?";
  const dup = flag(nd.nhx.D);
  const loss = flag(nd.nhx.L);
  const branching = flag(nd.nhx.BO);
  const bifurc = flag(nd.nhx.BC);

  let arrival: Classified["arrival"];
  const tb = nd.nhx.TB;
  if (tb) {
    const [donor, recipient] = tb.replace(/^@/, "").split("|");
    arrival = { donor: donor ?? "?", recipient: recipient ?? speciesOf(nd) ?? "?" };
  }

  // Resolve competing event tags with the recPhyloXML reader's shared
  // precedence (duplication > loss > branchingOut > bifurcationOut) and tell
  // the user when the input contradicts itself: the two readers must not
  // prefer different events for the same data, and a conflict is never
  // settled silently.
  const tagged: EndEventType[] = [];
  if (dup) tagged.push("duplication");
  if (loss) tagged.push("loss");
  if (branching) tagged.push("branchingOut");
  if (bifurc) tagged.push("bifurcationOut");
  const endType: EndEventType =
    tagged.length > 0
      ? resolveEndEventType(tagged)
      : isLeaf
        ? "leaf"
        : "speciation";
  if (tagged.length > 1) {
    warnings.push(
      `Gene node "${label}" carries conflicting event tags (${tagged.join(" + ")}); keeping "${endType}" (the precedence shared with recPhyloXML).`,
    );
  }

  if (isLeaf && tagged.length > 0) {
    warnings.push(
      `Gene node "${label}" is a terminal Newick leaf but carries an internal-event tag; it is kept as a ${endType} (an upstream tool may have pruned it).`,
    );
  }
  for (const frag of nd.nhxUnparsed ?? []) {
    // A comment fragment with no `key=` carries an annotation this dialect
    // cannot name; dropping it silently would hide a missing event or species.
    warnings.push(
      `Gene node "${label}" has an NHX comment fragment with no key ("${frag}"); it was not decoded, so whatever it annotated is missing from this reconciliation.`,
    );
  }
  if (!isLeaf && nd.children.length === 1 && tagged.length === 0) {
    // A single child is not a speciation by definition (speciation splits two
    // lineages). Report it and let the consistency checks flag it too.
    warnings.push(
      `Gene node "${label}" is an internal node with a single child; treated as a speciation but this usually indicates a re-rooted or collapsed tree.`,
    );
  }

  // BL= and the Newick :length describe the same quantity; prefer BL= (the
  // exporter's canonical form) but report a disagreement.
  const blRaw = nd.nhx.BL ?? (nd.length != null ? String(nd.length) : undefined);
  const branchLength = blRaw != null && blRaw !== "" ? Number(blRaw) : undefined;
  if (
    nd.nhx.BL !== undefined &&
    nd.nhx.BL !== "" &&
    nd.length != null &&
    Number(nd.nhx.BL) !== nd.length
  ) {
    warnings.push(
      `Gene node "${label}" declares both BL=${nd.nhx.BL} and a Newick branch length (:${nd.length}); they disagree, keeping BL=${nd.nhx.BL}.`,
    );
  }

  return {
    endType,
    arrival,
    branchLength: branchLength != null && Number.isFinite(branchLength) ? branchLength : undefined,
    isTransferArrival: !!arrival,
  };
}

/** Parse an NHX reconciled-gene-tree file into a normalized Reconciliation.
 *
 * `ns` is the per-document id namespace forwarded to the stable-id assignment
 * (see model/stableId.ts and parseRecPhyloXML); merged / restored views pass a
 * deterministic namespace so two files with the same content never share node
 * ids.
 */
export function parseNhxReconciliation(text: string, ns = ""): Reconciliation {
  const seq = NHX_SEQ++;
  const forest = parseNewick(text);
  if (forest.length === 0) {
    throw new NhxParseError("No Newick/NHX tree was found in this file.");
  }

  // Pre-classify every node (structure + event) before reconstructing the
  // species tree, so transfer edges can be excluded from ancestry evidence.
  const warnings: string[] = [];
  const cls = new Map<NewickNode, Classified>();
  const collect = (nd: NewickNode): void => {
    cls.set(nd, classify(nd, warnings));
    for (const c of nd.children) collect(c);
  };
  for (const root of forest) collect(root);

  // Report the dialect, not just the individual oddities. The classic
  // recPhyloXML NHX workflow writes only D= and synthesises losses from the
  // species tree, so a file carrying no L=/BO=/BC=/TB= marker cannot express a
  // loss or a transfer at all: the structural fallback below would read every
  // loss as a leaf and every transfer as a speciation, with no per-node signal.
  let sawDOrOther = false;
  let sawLossOrTransfer = false;
  const ignoredKeys = new Set<string>();
  const walkTags = (nd: NewickNode): void => {
    const t = nd.nhx;
    if (flag(t.D) || flag(t.L) || flag(t.BO) || flag(t.BC) || t.TB) sawDOrOther = true;
    if (flag(t.L) || flag(t.BO) || flag(t.BC) || t.TB) sawLossOrTransfer = true;
    for (const k of Object.keys(t)) if (!INTERPRETED_NHX_KEYS.has(k)) ignoredKeys.add(k);
    for (const c of nd.children) walkTags(c);
  };
  for (const root of forest) walkTags(root);
  if (ignoredKeys.size > 0) {
    // Named-but-uninterpreted keys are otherwise dropped without a trace, which
    // is the one silent-loss case this reader is supposed to avoid.
    warnings.push(
      `This NHX file uses ${ignoredKeys.size} tag key(s) this reader does not interpret and has dropped: ${[...ignoredKeys].sort().join(", ")}. Species, duplication, loss, donor and arrival state comes only from S=/SP=, D=, L=, BO=, BC= and TB=.`,
    );
  }
  if (!sawLossOrTransfer) {
    warnings.push(
      sawDOrOther
        ? "This NHX file carries no L=, BO=, BC= or TB= markers, so it cannot represent a loss or a horizontal transfer: untagged terminal nodes are read as gene leaves and untagged internal nodes as speciations. Re-export as recPhyloXML, or with those markers, if the reconciliation contains losses or transfers."
        : "This NHX file carries no event markers at all (no D=, L=, BO=, BC= or TB=); every internal node has been read as a speciation and every terminal node as a gene leaf. Reconciled NHX from duplication/loss tools needs at least D=, and losses and transfers need L=/BO=/BC=/TB=.",
    );
  }

  // Every internal node must carry a species tag for reconstruction to work.
  for (const root of forest) {
    const stack = [root];
    while (stack.length) {
      const nd = stack.pop() as NewickNode;
      if (nd.children.length > 0 && !speciesOf(nd)) {
        throw new NhxParseError(
          "NHX internal nodes lack species (S=) annotations, so the species tree cannot be reconstructed from this file. " +
            "Add an S=<species> tag to every internal node, or export the reconciliation as recPhyloXML.",
        );
      }
      for (const c of nd.children) stack.push(c);
    }
  }

  // ---- reconstruct the species tree from S= tags, VERTICAL edges only ----
  const parentOf = new Map<string, string>();
  const allSpecies = new Set<string>();
  for (const root of forest) {
    const walk = (nd: NewickNode): void => {
      const s = speciesOf(nd);
      if (s) allSpecies.add(s);
      for (const c of nd.children) {
        const cs = speciesOf(c);
        if (cs) allSpecies.add(cs);
        // A transfer-arrival child moved INTO species cs from another species;
        // the parent->child Newick edge is horizontal, not common ancestry, so
        // counting it would make an HGT edge an ancestor of the species.
        const childIsTransfer = cls.get(c)?.isTransferArrival ?? false;
        if (s && cs && cs !== s && !childIsTransfer) {
          const prev = parentOf.get(cs);
          if (prev === undefined) {
            parentOf.set(cs, s);
          } else if (prev !== s) {
            // Conflicting ancestors that our vertical filter could not resolve
            // (e.g. an external NHX file whose HGT edges are unmarked). Keep the
            // first and tell the user the reconstruction is uncertain rather
            // than silently choosing a winner or blaming their annotation.
            warnings.push(
              `Species "${cs}" is annotated under conflicting parents ("${prev}" and "${s}"); kept "${prev}". The NHX format cannot always tell vertical ancestry from unmarked horizontal transfers, so the reconstructed species tree may differ from the true one.`,
            );
          }
        }
        walk(c);
      }
    };
    walk(root);
  }
  if (allSpecies.size === 0) {
    throw new NhxParseError("No species (S=) annotations found in the NHX file.");
  }

  // The root species is the topmost ancestor of the first tree's root species.
  let rootSpecies = speciesOf(forest[0]) ?? [...allSpecies][0];
  const seen = new Set<string>();
  while (rootSpecies && parentOf.has(rootSpecies) && !seen.has(rootSpecies)) {
    seen.add(rootSpecies);
    rootSpecies = parentOf.get(rootSpecies) as string;
  }

  const childrenBySpecies = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    const arr = childrenBySpecies.get(parent) ?? [];
    arr.push(child);
    childrenBySpecies.set(parent, arr);
  }

  const byName = new Map<string, SpeciesNode>();
  const spNodes: SpeciesNode[] = [];
  let spCounter = 0;
  const built = new Set<string>();
  const buildSpecies = (name: string, parent: SpeciesNode | null, depth: number): SpeciesNode => {
    if (depth > MAX_TREE_DEPTH) {
      throw new NhxParseError("Species tree is nested too deep (possible malformed input).");
    }
    built.add(name);
    const node: SpeciesNode = {
      id: `sn${seq}_${spCounter++}`,
      name,
      children: [],
      parent,
      depth,
    };
    if (!byName.has(name)) byName.set(name, node);
    spNodes.push(node);
    for (const cn of childrenBySpecies.get(name) ?? []) {
      if (!built.has(cn)) node.children.push(buildSpecies(cn, node, depth + 1));
    }
    return node;
  };
  const spRoot = buildSpecies(rootSpecies, null, 0);
  const species: SpeciesTree = { root: spRoot, byName, nodes: spNodes };

  // Species referenced by gene nodes but unreachable from the reconstructed
  // root (multi-tree files, disconnected annotations) never enter the species
  // tree; explain the cause rather than only emitting confusing per-node errors.
  for (const s of allSpecies) {
    if (!built.has(s)) {
      warnings.push(
        `Species "${s}" cannot be attached to the reconstructed species tree (disconnected annotations); gene nodes placed in it are reported as unknown-species.`,
      );
    }
  }

  // ---- build the reconciled gene trees ----
  const geneTrees: GeneTree[] = [];
  let treeIndex = 0;
  for (const root of forest) {
    const idx = treeIndex;
    const nodes: GeneNode[] = [];
    const build = (nd: NewickNode, parent: GeneNode | null, depth: number): GeneNode => {
      if (depth > MAX_TREE_DEPTH) {
        throw new NhxParseError("Gene tree is nested too deep (possible malformed input).");
      }
      const info = cls.get(nd)!;
      const s = speciesOf(nd) ?? "";
      const events: RecEvent[] = [];
      if (info.arrival) {
        events.push({
          type: "transferBack",
          destinationSpecies: info.arrival.recipient,
          speciesLocation: info.arrival.donor,
        });
      }
      const endEvent: RecEvent = {
        type: info.endType,
        speciesLocation: s,
        geneName: info.endType === "leaf" ? nd.name : undefined,
      };
      events.push(endEvent);
      if (s && !species.byName.has(s)) {
        warnings.push(`Gene node references unknown species "${s}".`);
      }
      const gene: GeneNode = {
        id: `gn${seq}_${idx}_${nodes.length}`,
        name: nd.name,
        children: [],
        parent,
        events,
        endEvent,
        speciesId: s,
        treeIndex: idx,
        branchLength: info.branchLength,
      };
      nodes.push(gene);
      for (const c of nd.children) gene.children.push(build(c, gene, depth + 1));
      return gene;
    };
    const geneRoot = build(root, null, 0);
    geneTrees.push({ index: idx, name: undefined, root: geneRoot, nodes });
    treeIndex++;
  }

  // Replace parse-order ids with content-derived stable ids, matching the
  // recPhyloXML reader so NHX documents behave the same across re-parses.
  assignStableSpeciesIds(species.root, ns);
  assignStableGeneIds(geneTrees.map((t) => t.root), ns);

  // Only mention transfer exclusion when the file actually carries transfers:
  // an unconditional note would fire on every NHX file, including the many with
  // no TB= at all, and train users to ignore it.
  let hasTransfers = false;
  for (const info of cls.values()) {
    if (info.isTransferArrival) {
      hasTransfers = true;
      break;
    }
  }
  if (hasTransfers) {
    warnings.push(
      "Species tree reconstructed from NHX species (S=) annotations; horizontal transfers carried by TB= were excluded from ancestry. If this file also contains HGT without TB= markers, re-export it with TB= annotations on every transfer arrival (or as recPhyloXML), because unmarked transfers cannot be told apart from speciation here.",
    );
  }
  return { species, geneTrees, warnings };
}
