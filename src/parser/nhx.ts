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
  NodeSupport,
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
 * The app's NHX exporter writes `?` as a machine-readable placeholder for an
 * unknown donor or recipient (see export/newickExport.ts). GLOSSARY-UI row 36
 * bans `?` as an on-screen empty mark, and on import that placeholder must not
 * re-enter the model as a species or event location literally named `?`, so the
 * mark reads as *absent* here rather than as a value. Style §4.4: the parser
 * stays locale-free; the display layer renders absent values as `—`.
 */
const markToAbsent = (v: string | undefined): string | undefined =>
  v === "?" ? undefined : v;

/**
 * Species tag for one node. `SP=` is accepted as an alias because some
 * third-party NHX writers emit it; it is part of this reader's dialect and is
 * covered by a test (see nhx.test.ts "accepts the SP= species alias").
 */
const speciesOf = (node: NewickNode): string | undefined =>
  markToAbsent(node.nhx.S || node.nhx.SP || undefined);

/**
 * NHX keys this reader interprets. Anything else is kept but reported.
 * `TB` and every `TB<n>` hold the first and the further transfer arrivals of a
 * node (the exporter numbers every arrival it writes and this reader recognises
 * the whole numbering, so a node's arrivals round-trip one-for-one); `B=` carries
 * a clade support value, `TS=` a time slice and `CN=` an event confidence.
 */
const INTERPRETED_NHX_KEYS = new Set<string>([
  "S", "SP", "D", "L", "BO", "BC", "TB", "BL", "TS", "CN", "B",
]);

/** A numbered transfer-arrival tag: `TB2`, `TB3`, and so on without an upper cap. */
const ARRIVAL_TAG = /^TB([2-9]|[1-9]\d+)$/;

/** Whether a tag key carries a transfer arrival: `TB` the first, `TB<n>` the n-th. */
const isArrivalTag = (key: string): boolean => key === "TB" || ARRIVAL_TAG.test(key);

/** Which arrival a tag carries, so a node's arrivals keep their written order. */
const arrivalIndex = (key: string): number =>
  key === "TB" ? 1 : Number(key.slice(2));

/**
 * All transfer-arrival tags of a node, in written order (`TB`, then `TB2`,
 * `TB3`, …). Ordered by the number rather than by key order: a file may list its
 * tags in any order, and `TB10` sorts before `TB2` as text.
 */
function arrivalTags(nd: NewickNode): { key: string; value: string }[] {
  const keys = Object.keys(nd.nhx)
    .filter(isArrivalTag)
    .sort((a, b) => arrivalIndex(a) - arrivalIndex(b));
  const out: { key: string; value: string }[] = [];
  for (const k of keys) {
    const v = nd.nhx[k];
    if (v != null && v !== "") out.push({ key: k, value: v });
  }
  return out;
}

const flag = (v: string | undefined): boolean =>
  (v ?? "").toUpperCase() === "Y";

/** Classified event view of one Newick node (structure + NHX tags). */
interface Classified {
  endType: EndEventType;
  /** Transfer-back arrivals, in file order: donor and recipient species, each
   * absent (not `"?"`) when the input supplies only the export placeholder. */
  arrivals: { donor?: string; recipient?: string }[];
  /** Branch length, when the input provides one. */
  branchLength?: number;
  /** timeSlice (TS=) and confidence (CN=) of the terminal event, when given. */
  timeSlice?: number;
  confidence?: number;
  /** Clade-level support (B= tag or a numeric internal Newick label). */
  support?: NodeSupport;
  /** True when this node is the child end of a horizontal transfer edge. */
  isTransferArrival: boolean;
}

/** Purely-numeric labels (`)95`) are bootstrap/support values, not gene names. */
const NUMERIC_LABEL = /^\d+(?:\.\d+)?$/;

function classify(nd: NewickNode, warnings: string[]): Classified {
  const isLeaf = nd.children.length === 0;
  const label = nd.name || speciesOf(nd) || "—";
  const dup = flag(nd.nhx.D);
  const loss = flag(nd.nhx.L);
  const branching = flag(nd.nhx.BO);
  const bifurc = flag(nd.nhx.BC);

  const arrivals: Classified["arrivals"] = [];
  for (const { value } of arrivalTags(nd)) {
    const [donor, recipient] = value.replace(/^@/, "").split("|");
    // An unknown donor/recipient is left ABSENT from the model rather than
    // written as `"?"`, so the node inspector and re-exported files never show
    // or smuggle the banned empty mark (see markToAbsent above).
    arrivals.push({
      donor: markToAbsent(donor),
      recipient: markToAbsent(recipient) ?? speciesOf(nd),
    });
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

  const tsNum = nd.nhx.TS != null && nd.nhx.TS !== "" ? Number(nd.nhx.TS) : undefined;
  const cnNum = nd.nhx.CN != null && nd.nhx.CN !== "" ? Number(nd.nhx.CN) : undefined;

  // Clade support: an explicit B= tag wins; otherwise a purely-numeric internal
  // Newick label (`)95`) is the conventional bootstrap support, not a gene
  // name. Numeric LEAF labels stay gene names - extant ids can be numeric.
  let support: NodeSupport | undefined;
  const bRaw = nd.nhx.B;
  if (bRaw != null && bRaw !== "" && Number.isFinite(Number(bRaw))) {
    support = { value: Number(bRaw), type: "unknown" };
  } else if (!isLeaf && nd.name && NUMERIC_LABEL.test(nd.name.trim())) {
    support = { value: Number(nd.name.trim()), type: "unknown" };
    nd.name = "";
    warnings.push(
      `An internal node label ("${support.value}") was interpreted as a statistical support value, not a gene name; if it really is a name, add S=/D= tags or export from recPhyloXML.`,
    );
  }

  return {
    endType,
    arrivals,
    branchLength: branchLength != null && Number.isFinite(branchLength) ? branchLength : undefined,
    timeSlice: tsNum != null && Number.isFinite(tsNum) ? tsNum : undefined,
    confidence: cnNum != null && Number.isFinite(cnNum) ? cnNum : undefined,
    support,
    isTransferArrival: arrivals.length > 0,
  };
}

/** Parse an NHX reconciled-gene-tree file into a normalized Reconciliation.
 *
 * `ns` is the per-document id namespace forwarded to the stable-id assignment
 * (see model/stableId.ts and parseRecPhyloXML); merged / restored views pass a
 * deterministic namespace so two files with the same content never share node
 * ids.
 *
 * `externalSpecies` supplies a separately provided species tree (see
 * parser/speciesTree.ts). When given, the strict "every internal node needs
 * S=" requirement is lifted: leaf-only S= annotations are accepted, internal
 * nodes without a species tag resolve to no species, and the provided tree is
 * used verbatim instead of a leaf-annotation reconstruction.
 */
export function parseNhxReconciliation(
  text: string,
  ns = "",
  externalSpecies?: SpeciesTree,
): Reconciliation {
  const seq = NHX_SEQ++;
  const forest = parseNewick(text);
  if (forest.length === 0) {
    throw new NhxParseError("No Newick/NHX tree was found in this file.");
  }
  // Newick's standard `[&U]` unrooted marker means the tree has no root and a
  // reconciliation cannot be drawn on it. Accepting it silently would render a
  // wrong rooting as if it were data, so refuse with an actionable message.
  for (const root of forest) {
    const frags = [...(root.nhxUnparsed ?? []), ...Object.keys(root.nhx)];
    if (frags.some((f) => /^&?\s*U$/i.test(f.trim()))) {
      throw new NhxParseError(
        "This Newick/NHX tree is marked unrooted ([&U]). A reconciliation needs a rooted gene tree: re-root it (outgroup or midpoint) and re-export, or remove the [&U] marker if the tree is in fact rooted.",
      );
    }
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
    if (
      flag(t.D) || flag(t.L) || flag(t.BO) || flag(t.BC) || arrivalTags(nd).length > 0
    ) sawDOrOther = true;
    if (flag(t.L) || flag(t.BO) || flag(t.BC) || arrivalTags(nd).length > 0) sawLossOrTransfer = true;
    for (const k of Object.keys(t)) {
      if (!INTERPRETED_NHX_KEYS.has(k) && !isArrivalTag(k)) ignoredKeys.add(k);
    }
    for (const c of nd.children) walkTags(c);
  };
  for (const root of forest) walkTags(root);
  if (ignoredKeys.size > 0) {
    // Named-but-uninterpreted keys are otherwise dropped without a trace, which
    // is the one silent-loss case this reader is supposed to avoid.
    warnings.push(
      `This NHX file uses ${ignoredKeys.size} ${ignoredKeys.size === 1 ? "tag key" : "tag keys"} this reader does not interpret and has dropped: ${[...ignoredKeys].sort().join(", ")}. Species, duplication, loss, donor and arrival state comes only from S=/SP=, D=, L=, BO=, BC= and TB=.`,
    );
  }
  if (!sawLossOrTransfer) {
    warnings.push(
      sawDOrOther
        ? "This NHX file carries no L=, BO=, BC= or TB= markers, so it cannot represent a loss or a horizontal transfer: untagged terminal nodes are read as gene leaves and untagged internal nodes as speciations. Re-export as recPhyloXML, or with those markers, if the reconciliation contains losses or transfers."
        : "This NHX file carries no event markers at all (no D=, L=, BO=, BC= or TB=); every internal node has been read as a speciation and every terminal node as a gene leaf. Reconciled NHX from duplication/loss tools needs at least D=, and losses and transfers need L=/BO=/BC=/TB=.",
    );
  }

  // Every internal node must carry a species tag for reconstruction to work -
  // unless a separately provided species tree takes over that role.
  if (!externalSpecies) {
    for (const root of forest) {
      const stack = [root];
      while (stack.length) {
        const nd = stack.pop() as NewickNode;
        if (nd.children.length > 0 && !speciesOf(nd)) {
          throw new NhxParseError(
            "NHX internal nodes lack species (S=) annotations, so the species tree cannot be reconstructed from this file. " +
              "Add an S=<species> tag to every internal node, load a species tree first (File → Load species tree) and open the gene trees against it, or export the reconciliation as recPhyloXML.",
          );
        }
        for (const c of nd.children) stack.push(c);
      }
    }
  }

  // ---- the species tree: externally provided, or reconstructed from S= tags
  // (VERTICAL edges only) ----
  let species: SpeciesTree;
  let allSpecies = new Set<string>();
  let builtNames = new Set<string>();

  if (externalSpecies) {
    species = externalSpecies;
    // Record which species the file actually annotates, so gene nodes in
    // species the external tree lacks produce the normal unknown-species report.
    for (const root of forest) {
      const walk = (nd: NewickNode): void => {
        const s = speciesOf(nd);
        if (s) allSpecies.add(s);
        for (const c of nd.children) walk(c);
      };
      walk(root);
    }
    builtNames = new Set(species.nodes.map((n) => n.name));
    warnings.push(
      "Species tree taken from the separately provided file; NHX internal nodes without S= resolve to no species.",
    );
  } else {
    const parentOf = new Map<string, string>();
    allSpecies = new Set<string>();
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
    species = { root: spRoot, byName, nodes: spNodes };
    builtNames = built;
  }

  // Species referenced by gene nodes but unreachable from the (reconstructed)
  // root (multi-tree files, disconnected annotations) never enter the species
  // tree; explain the cause rather than only emitting confusing per-node errors.
  for (const s of allSpecies) {
    if (!builtNames.has(s)) {
      warnings.push(
        `Species "${s}" cannot be attached to the species tree (disconnected annotations); gene nodes placed in it are reported as unknown-species.`,
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
      // Every arrival tag becomes its own transferBack event, so a node with
      // several arrivals survives the NHX round trip one-for-one.
      for (const a of info.arrivals) {
        events.push({
          type: "transferBack",
          destinationSpecies: a.recipient,
          speciesLocation: a.donor,
        });
      }
      const endEvent: RecEvent = {
        type: info.endType,
        speciesLocation: s,
        geneName: info.endType === "leaf" ? nd.name : undefined,
      };
      if (info.timeSlice != null) endEvent.timeSlice = info.timeSlice;
      if (info.confidence != null) endEvent.confidence = info.confidence;
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
      if (info.support) gene.support = info.support;
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
  if (hasTransfers && !externalSpecies) {
    warnings.push(
      "Species tree reconstructed from NHX species (S=) annotations; horizontal transfers carried by TB= were excluded from ancestry. If this file also contains HGT without TB= markers, re-export it with TB= annotations on every transfer arrival (or as recPhyloXML), because unmarked transfers cannot be told apart from speciation here.",
    );
  }
  return { species, geneTrees, warnings };
}
