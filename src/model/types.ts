/**
 * Core data model for recPhyloXML reconciliations.
 *
 * A recPhyloXML file contains one species ("upper") tree and one or more
 * reconciled gene ("lower") trees whose nodes are annotated with evolutionary
 * events (speciation, duplication, loss, transfer, ...).
 *
 * These types are the normalized, framework-agnostic representation produced by
 * the parser and consumed by the layout engine.
 */

/** Terminal ("end") event kinds as defined by the recGeneTreeXML schema. */
export type EndEventType =
  | "speciation"
  | "duplication"
  | "loss"
  | "branchingOut"
  | "bifurcationOut"
  | "leaf";

/** All event kinds, including the intermediary transfer-arrival event. */
export type EventType = EndEventType | "transferBack";

/** A single reconciliation event attached to a gene node. */
export interface RecEvent {
  type: EventType;
  /** Species this event happens in (most events). */
  speciesLocation?: string;
  /** For transferBack: the species the lineage arrives into. */
  destinationSpecies?: string;
  timeSlice?: number;
  confidence?: number;
  /** Optional explicit gene name carried by a leaf event. */
  geneName?: string;
}

/**
 * A node of the species (host) tree.
 *
 * This is a pure structural description: geometry (x/y/width/laneCount) is
 * produced by the layout engine into a separate `Positions` map keyed by id,
 * never written back here.
 */
export interface SpeciesNode {
  id: string;
  name: string;
  children: SpeciesNode[];
  parent: SpeciesNode | null;
  /** 0-based distance from the root. */
  depth: number;
  /** Optional branch length (from the parent), when the input provides one. */
  branchLength?: number;
}

/**
 * A node of a reconciled gene tree.
 *
 * Pure structural description; geometry (x/y/lane) lives in the layout
 * `Positions` map keyed by id, not on the node.
 */
export interface GeneNode {
  id: string;
  name: string;
  children: GeneNode[];
  parent: GeneNode | null;
  /** Ordered events: any transferBack(s) followed by exactly one end event. */
  events: RecEvent[];
  /** Convenience pointer to the terminal event of this node. */
  endEvent: RecEvent;
  /** The species this node is placed in (endEvent.speciesLocation). */
  speciesId: string;
  /** Which gene tree this node belongs to (index into Reconciliation.geneTrees). */
  treeIndex: number;
  /**
   * Optional gene-tree branch length (from the parent), when the input provides
   * one. Preserved on parse and NHX round-trip so downstream analyses and the
   * `useBranchLengths` option are not fed an all-missing column.
   */
  branchLength?: number;
}

export interface GeneTree {
  index: number;
  name?: string;
  root: GeneNode;
  /** Flat list of all nodes (parse order), for convenient iteration. */
  nodes: GeneNode[];
}

export interface SpeciesTree {
  root: SpeciesNode;
  /** name -> node, for resolving speciesLocation references. */
  byName: Map<string, SpeciesNode>;
  nodes: SpeciesNode[];
}

/** A complete two-level reconciliation (one species tree + N gene trees). */
export interface Reconciliation {
  species: SpeciesTree;
  geneTrees: GeneTree[];
  /** Non-fatal issues discovered while parsing (unknown refs, etc.). */
  warnings: string[];
}

/** A directed gene transfer, computed from branchingOut/transferBack pairs. */
export interface TransferEdge {
  id: string;
  from: GeneNode;
  to: GeneNode;
  treeIndex: number;
}
