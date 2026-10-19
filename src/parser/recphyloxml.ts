import { XMLParser } from "fast-xml-parser";
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

/** Raw clade shape produced by fast-xml-parser (loosely typed on purpose). */
interface RawClade {
  name?: string | number;
  eventsRec?: RawEventsRec | RawEventsRec[];
  clade?: RawClade[];
  /** The XSD declares the attribute and the child element as equivalent. */
  "@_branch_length"?: string;
  branch_length?: string | number;
}

/** Raw <phylogeny> shape (only the attributes/children we consume). */
interface RawPhylogeny {
  clade?: RawClade[];
  name?: string | number;
  "@_rooted"?: string | number;
}

interface RawEventsRec {
  transferBack?: RawEvent[];
  speciation?: RawEvent | RawEvent[];
  duplication?: RawEvent | RawEvent[];
  loss?: RawEvent | RawEvent[];
  branchingOut?: RawEvent | RawEvent[];
  bifurcationOut?: RawEvent | RawEvent[];
  leaf?: RawEvent | RawEvent[];
}

interface RawEvent {
  "@_speciesLocation"?: string | number;
  "@_destinationSpecies"?: string | number;
  "@_timeSlice"?: string | number;
  "@_confidence"?: string | number;
  "@_geneName"?: string | number;
}

/**
 * Terminal event kinds in schema-precedence order. When a node (recPhyloXML)
 * or a set of tags (NHX) carries more than one end-event candidate, the first
 * entry of this list wins. The NHX reader shares this table so the same data
 * cannot resolve to `duplication` through one format and `loss` through the
 * other.
 */
export const END_EVENTS: readonly EndEventType[] = [
  "speciation",
  "duplication",
  "loss",
  "branchingOut",
  "bifurcationOut",
  "leaf",
];

/**
 * Resolve competing end-event candidates to a single type using the shared
 * schema precedence. Returns the candidate that appears earliest in
 * END_EVENTS; callers warn themselves when more than one candidate was given.
 */
export function resolveEndEventType(candidates: EndEventType[]): EndEventType {
  for (const type of END_EVENTS) {
    if (candidates.includes(type)) return type;
  }
  return "leaf";
}

/**
 * Recursion-depth ceiling for the species / gene tree builders. A pathologically
 * deep (or adversarial) tree would otherwise overflow the JS call stack with an
 * uncatchable RangeError; here it becomes a friendly, catchable
 * RecPhyloParseError instead. It mirrors newick.ts MAX_DEPTH at ~1000 frames,
 * safely below the capacity the call stack actually has.
 */
const MAX_TREE_DEPTH = 1000;
// Well above MAX_TREE_DEPTH so our accurate error fires first; each <clade>
// contributes a couple of nested tags, so this admits trees far deeper than we
// claim to support and lets the build-stage guard own the rejection.
const MAX_NESTING_LIMIT = 20000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // The official schema is namespace-qualified (recPhyloXML.xsd declares
  // targetNamespace="http://www.recg.org" with elementFormDefault="qualified"),
  // so a conformant real-world file carries a default or prefixed namespace.
  // Without this, such a document parses to `{"recg:recPhylo": …}` and the
  // reader reports "Missing <recPhylo> root element" on a perfectly valid file.
  removeNSPrefix: true,
  // fast-xml-parser's default maxNestedTags (100) is reached by only ~60 nested
  // <clade> elements (each clade nests a <name> too) and surfaces as a
  // misleading "XML is not well-formed" error. Raise it well above our own
  // MAX_TREE_DEPTH so the deep-tree rejection comes from our clear, accurate
  // message instead of the library's generic one.
  maxNestedTags: MAX_NESTING_LIMIT,
  // Force these tags to always be arrays so single/multiple children are uniform.
  isArray: (name) =>
    name === "clade" ||
    name === "phylogeny" ||
    name === "recGeneTree" ||
    name === "transferBack",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: string | number | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v).trim();
}

function num(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export class RecPhyloParseError extends Error {}

/**
 * Seeds the PROVISIONAL parse-order ids (`g{seq}_{treeIndex}_{n}`) that
 * buildGeneNode writes before assignStableGeneIds rewrites every id to its
 * content-derived value. The `seq` counter only guarantees uniqueness of the
 * provisional ids; the final cross-file uniqueness of the stable ids comes
 * from the per-document `ns` namespace (see model/stableId.ts).
 */
let PARSE_SEQ = 0;

/**
 * Locate the <recPhylo> element regardless of the case spelling used by the
 * producer, and transparently unwrap a <recPhyloXML> / <recphyloxml> root
 * wrapper around it: real-world files show <recPhyloXML>, <recphyloxml> and
 * bare <recPhylo>, so a case-sensitive lookup would report "missing root
 * element" for documents that are perfectly valid.
 */
function findRecPhylo(
  doc: Record<string, unknown>,
): Record<string, unknown> | undefined {
  let cur: Record<string, unknown> = doc;
  // Bounded walk: wrappers nest at most one or two levels deep.
  for (let depth = 0; depth < 8; depth++) {
    const keys = Object.keys(cur);
    const exact = keys.find((k) => k.toLowerCase() === "recphylo");
    if (exact) return cur[exact] as Record<string, unknown>;
    const wrapper = keys.find((k) => /^recphyloxml?$/i.test(k));
    if (!wrapper) return undefined;
    const inner = cur[wrapper];
    if (typeof inner !== "object" || inner === null) return undefined;
    cur = inner as Record<string, unknown>;
    // A <recPhyloXML>/<recphyloxml> that directly holds spTree/recGeneTree
    // IS the document body; accept it as such.
    if (Object.keys(cur).some((k) => /^(spTree|recGeneTree)$/i.test(k))) {
      return cur;
    }
  }
  return undefined;
}

/** Normalise the fast-xml-parser value of an attribute-less element. */
function asEventList(v: unknown): RawEvent[] {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : [v];
  // fast-xml-parser yields "" (or a text string) for <tag/> / <tag></tag>.
  return arr.map((e) =>
    typeof e === "object" && e !== null ? (e as RawEvent) : {},
  );
}

/** Classify one `rooted` attribute value. */
function checkRooted(value: unknown): "true" | "false" | "missing" {
  const v = str(value as string | number | undefined);
  if (v === undefined || v === "") return "missing";
  if (/^(true|1)$/i.test(v)) return "true";
  if (/^(false|0)$/i.test(v)) return "false";
  return "missing";
}

/** Parse a recPhyloXML string into a normalized Reconciliation.
 *
 * `ns` is the per-document id namespace (see model/stableId.ts). Callers that
 * may hold several documents in one view (parseMerged, session restore) pass a
 * deterministic namespace derived from the file's name and content so two
 * different files with identical gene trees never share node ids. Direct
 * single-document parses (tests, probes) may omit it.
 */
export function parseRecPhyloXML(xml: string, ns = ""): Reconciliation {
  const seq = PARSE_SEQ++;
  // An empty / whitespace-only document is a distinct, actionable case: report
  // it as "empty" (whose friendly message lists every supported format) rather
  // than the misleading "missing root element".
  if (xml.trim().length === 0) {
    throw new RecPhyloParseError("The file is empty (no recPhyloXML content).");
  }
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // fast-xml-parser reports overly-deep nesting as a generic well-formedness
    // failure; name the real cause so the user is not told their file is
    // corrupt when it is merely deeper than this version supports.
    if (/nest|recursi|stack/i.test(msg)) {
      throw new RecPhyloParseError(
        `The tree is nested more deeply than this version supports (up to about ${MAX_TREE_DEPTH} clade levels): ${msg}`,
      );
    }
    throw new RecPhyloParseError(`XML could not be parsed (is this well-formed recPhyloXML?): ${msg}`);
  }

  const recPhylo = findRecPhylo(doc);
  if (!recPhylo) {
    throw new RecPhyloParseError(
      "No <recPhylo> root element was found. This file does not look like recPhyloXML; " +
        "if it is a Newick/NHX tree, save it with a .nwk/.nhx extension or add [&&NHX:S=...] annotations.",
    );
  }

  const warnings: string[] = [];

  // ---- species tree ----
  const spTree = recPhylo.spTree as Record<string, unknown> | undefined;
  const spPhylos = asArray(spTree?.phylogeny as RawPhylogeny | RawPhylogeny[] | undefined);
  const spPhylo = spPhylos[0];
  if (spPhylos.length > 1) {
    // An <spTree> carries one phylogeny (schema-wise); without this note an
    // extra one would vanish without a word.
    warnings.push(
      `Species tree (<spTree>) contains ${spPhylos.length} <phylogeny> elements; only the first is used.`,
    );
  }
  const rootedStatus = checkRooted(spPhylo?.["@_rooted"]);
  if (rootedStatus === "false") {
    throw new RecPhyloParseError(
      'The species tree declares rooted="false", but a reconciliation is always rooted: ' +
        "PhyloRecViewer cannot draw unrooted trees. Re-root the species tree (the recPhyloXML schema requires rooted=\"true\").",
    );
  }
  if (rootedStatus === "missing") {
    warnings.push(
      'The species tree <phylogeny> omits the schema-required rooted="true" attribute; assuming a rooted tree.',
    );
  }
  const spRoots = asArray(spPhylo?.clade);
  const spRootRaw = spRoots[0];
  if (!spRootRaw) {
    throw new RecPhyloParseError("Species tree (<spTree>) has no clades.");
  }
  if (spRoots.length > 1) {
    warnings.push(
      `Species tree contains ${spRoots.length} root <clade> elements; only the first is used.`,
    );
  }
  const species = buildSpeciesTree(spRootRaw, seq);
  // Duplicate species names are ambiguous: gene nodes reference species by name,
  // so a repeated name resolves to the first occurrence. Surface it up front
  // (the consistency panel also reports it in detail).
  if (species.byName.size < species.nodes.length) {
    warnings.push(
      "Species tree contains duplicate species names; references resolve to the first occurrence.",
    );
  }

  // ---- gene trees ----
  const geneTrees: GeneTree[] = [];
  const recGeneTrees = asArray(recPhylo.recGeneTree as unknown) as Array<{
    phylogeny?: RawPhylogeny[];
  }>;
  let treeIndex = 0;
  let missingRooted = 0;
  for (const rgt of recGeneTrees) {
    for (const phy of asArray(rgt.phylogeny)) {
      const phyRooted = checkRooted(phy["@_rooted"]);
      if (phyRooted === "false") {
        throw new RecPhyloParseError(
          `The gene tree "${str(phy.name) ?? `#${treeIndex + 1}`}" declares rooted="false", but a reconciliation is always rooted: ` +
            "PhyloRecViewer cannot draw unrooted trees. Re-root the gene tree (the recPhyloXML schema requires rooted=\"true\").",
        );
      }
      if (phyRooted === "missing") missingRooted++;
      const rootRaws = asArray(phy.clade);
      const rootRaw = rootRaws[0];
      if (!rootRaw) continue;
      if (rootRaws.length > 1) {
        warnings.push(
          `Gene tree phylogeny contains ${rootRaws.length} root <clade> elements; only the first is used.`,
        );
      }
      const nodes: GeneNode[] = [];
      const root = buildGeneNode(rootRaw, null, treeIndex, nodes, species, warnings, seq, 0);
      geneTrees.push({
        index: treeIndex,
        name: str(phy.name),
        root,
        nodes,
      });
      treeIndex++;
    }
  }

  if (missingRooted > 0) {
    warnings.push(
      `${missingRooted} gene tree <phylogeny> element(s) omit the schema-required rooted="true" attribute; assuming rooted trees.`,
    );
  }

  if (geneTrees.length === 0) {
    warnings.push("No reconciled gene trees (<recGeneTree>) were found.");
  }

  // Replace the parse-order-sequential ids with content-derived stable ids so
  // re-parsing the same document (and session restore) keeps annotations,
  // collapse state and label overrides attached to the correct nodes.
  // The `ns` namespace keeps two DIFFERENT documents with identical content
  // from colliding in merged views.
  assignStableSpeciesIds(species.root, ns);
  assignStableGeneIds(geneTrees.map((t) => t.root), ns);

  return { species, geneTrees, warnings };
}

function buildSpeciesTree(rootRaw: RawClade, seq: number): SpeciesTree {
  const byName = new Map<string, SpeciesNode>();
  const nodes: SpeciesNode[] = [];
  let counter = 0;

  const build = (
    raw: RawClade,
    parent: SpeciesNode | null,
    depth: number,
  ): SpeciesNode => {
    if (depth > MAX_TREE_DEPTH) {
      throw new RecPhyloParseError(
        "Species tree is nested too deep (possible malformed input).",
      );
    }
    // Synthetic name for an unlabeled species clade. Use a control-symbol prefix
    // that cannot collide with a real species literally named like "sp_3"
    // (byName keeps the first occurrence, so a clash would mis-resolve refs).
    // Whitespace-only names (<name></name>, <name> </name>) count as absent: a
    // shared empty name would make every such clade one species, so gene nodes
    // referencing "" would land on the first clade and the name-keyed mirror
    // set would drag unrelated branches along.
    const name = str(raw.name) || `␟auto_${counter}`;
    const node: SpeciesNode = {
      id: `s${seq}_${counter++}`,
      name,
      children: [],
      parent,
      depth,
      // The XSD treats the branch_length attribute and child element as
      // equivalent (recGeneTreeXML.xsd); read both.
      branchLength: num(raw["@_branch_length"]) ?? num(raw.branch_length),
    };
    // Species are referenced by name; keep first occurrence if duplicated.
    if (!byName.has(name)) byName.set(name, node);
    nodes.push(node);
    for (const childRaw of asArray(raw.clade)) {
      node.children.push(build(childRaw, node, depth + 1));
    }
    return node;
  };

  const root = build(rootRaw, null, 0);
  return { root, byName, nodes };
}

function parseEvents(
  eventsRec: RawEventsRec | undefined,
  warnings: string[],
  label: string,
): RecEvent[] {
  const events: RecEvent[] = [];
  // <eventsRec/> and <eventsRec></eventsRec> arrive as the empty string, not
  // an object; guard on the TYPE, not on truthiness of a value.
  if (!eventsRec || typeof eventsRec !== "object") return events;

  // Intermediary events (transfer arrivals) come first. The XSD allows 0..n
  // transferBack elements (IntermediaryEvents).
  const arrivals = asEventList((eventsRec as Record<string, unknown>).transferBack);
  for (const t of arrivals) {
    events.push({
      type: "transferBack",
      destinationSpecies: str(t["@_destinationSpecies"]),
      speciesLocation: str(t["@_speciesLocation"]),
      timeSlice: num(t["@_timeSlice"]),
      confidence: num(t["@_confidence"]),
    });
  }
  if (arrivals.length > 1) {
    // Downstream consumers disagree about several arrivals on one node
    // (the host-species fallback and the NHX export use the first, while the
    // transfer arcs draw one per arrival). Say so instead of staying silent.
    warnings.push(
      `Gene node "${label}" carries ${arrivals.length} <transferBack> arrivals; ` +
        `the node's species and the NHX export use the first (${str(arrivals[0]["@_destinationSpecies"]) ?? "?"}).`,
    );
  }

  // Exactly one terminal event is expected per the recGeneTreeXML schema
  // (EndEvents is an xsd:choice). Key on element PRESENCE, not on the parsed
  // value: fast-xml-parser yields the empty string "" for an attribute-less
  // element such as <bifurcationOut/> or <loss/>, so a truthiness test would
  // drop exactly the form the XSD mandates (BifurcationOutRec has no
  // speciesLocation attribute at all).
  let kept: EndEventType | null = null;
  for (const type of END_EVENTS) {
    if (!(type in eventsRec)) continue;
    const e = asEventList((eventsRec as Record<string, unknown>)[type])[0] ?? {};
    if (kept === null) {
      kept = type;
      events.push({
        type,
        speciesLocation: str(e["@_speciesLocation"]),
        geneName: str(e["@_geneName"]),
        timeSlice: num(e["@_timeSlice"]),
        confidence: num(e["@_confidence"]),
      });
    } else {
      warnings.push(
        `Gene node "${label}" carries multiple terminal events (${kept} + ${type}); keeping "${kept}".`,
      );
    }
  }

  // Report elements this reader does not know instead of dropping them. The six
  // terminal names are matched EXACTLY and recPhyloXML element names are
  // case-sensitive, so <Loss/> or an unrecognised event would otherwise vanish
  // and degrade the node to a leaf with no signal, leaving the downstream event
  // counts wrong and unflagged.
  const known = new Set<string>([...END_EVENTS, "transferBack"]);
  for (const key of Object.keys(eventsRec as Record<string, unknown>)) {
    if (key.startsWith("@_")) continue;
    if (known.has(key)) continue;
    const lowered = key.toLowerCase();
    const nearMiss = END_EVENTS.find((t) => t.toLowerCase() === lowered);
    warnings.push(
      `Gene node "${label}" has an unrecognised <eventsRec> child "${key}"` +
        (nearMiss
          ? ` (recPhyloXML event names are case-sensitive; did you mean "${nearMiss}"?)`
          : "") +
        `; it was not read as an event, so this node's event list may be incomplete.`,
    );
  }
  return events;
}

function buildGeneNode(
  raw: RawClade,
  parent: GeneNode | null,
  treeIndex: number,
  out: GeneNode[],
  species: SpeciesTree,
  warnings: string[],
  seq: number,
  depth: number,
): GeneNode {
  if (depth > MAX_TREE_DEPTH) {
    throw new RecPhyloParseError(
      "Gene tree is nested too deep (possible malformed input).",
    );
  }
  const label = str(raw.name) ?? "?";
  // fast-xml-parser collapses a single <eventsRec> to an object but yields an
  // array when a clade erroneously carries several; keep the first and say so.
  const eventsRecRaw = raw.eventsRec;
  const eventsRecArr = Array.isArray(eventsRecRaw) ? eventsRecRaw : [eventsRecRaw];
  if (eventsRecArr.length > 1) {
    warnings.push(
      `Gene node "${label}" has ${eventsRecArr.length} <eventsRec> blocks; using the first.`,
    );
  }
  const events = parseEvents(eventsRecArr[0], warnings, label);
  // The end event must be a terminal (non-transferBack) event. A node with no
  // terminal event (empty <eventsRec/> or only transferBack arrivals) falls
  // back to a leaf and is reported, rather than letting a transferBack become
  // the endEvent - which would violate the EndEventType invariant downstream.
  const terminal = events.find((e) => e.type !== "transferBack");
  const endEvent = terminal ?? { type: "leaf" as const };
  if (!terminal) {
    warnings.push(`Gene node "${label}" has no terminal event; treated as a leaf.`);
    // Keep the "events = transferBack* + exactly one end event" invariant: the
    // synthesized leaf is part of the ordered event list, so endEvent is always
    // the last element of events.
    events.push(endEvent);
  }

  const transferBack = events.find((e) => e.type === "transferBack");
  const speciesId =
    endEvent.speciesLocation ??
    transferBack?.destinationSpecies ??
    "";

  // The arrival species is stated twice for a transferred node, and tools do
  // not always agree: the transferBack's destinationSpecies and the terminal
  // event's speciesLocation. The fallback above resolves in favour of
  // speciesLocation, which is also what the transfer matrix and the network
  // panel report as the recipient - so a disagreement has to be visible rather
  // than silently rewriting the recipient species.
  if (
    transferBack?.destinationSpecies &&
    endEvent.speciesLocation &&
    transferBack.destinationSpecies !== endEvent.speciesLocation
  ) {
    warnings.push(
      `Gene node "${label}" declares conflicting arrival species: <transferBack destinationSpecies="${transferBack.destinationSpecies}"/> vs the terminal event's speciesLocation="${endEvent.speciesLocation}"; the node and its transfer edge are placed in "${speciesId}".`,
    );
  }

  if (speciesId && !species.byName.has(speciesId)) {
    warnings.push(`Gene node "${label}" references unknown species "${speciesId}".`);
  }

  const node: GeneNode = {
    id: `g${seq}_${treeIndex}_${out.length}`,
    name: str(raw.name) ?? "",
    children: [],
    parent,
    events,
    endEvent,
    speciesId,
    treeIndex,
    // Attribute form and child-element form are equivalent per the XSD.
    branchLength: num(raw["@_branch_length"]) ?? num(raw.branch_length),
  };
  out.push(node);

  for (const childRaw of asArray(raw.clade)) {
    node.children.push(
      buildGeneNode(childRaw, node, treeIndex, out, species, warnings, seq, depth + 1),
    );
  }
  return node;
}

/** Utility: resolve the species node a gene node lives in (or null). */
export function hostSpecies(
  gene: GeneNode,
  species: SpeciesTree,
): SpeciesNode | null {
  return species.byName.get(gene.speciesId) ?? null;
}
