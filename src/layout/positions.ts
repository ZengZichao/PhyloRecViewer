/**
 * Non-destructive layout output.
 *
 * Writing x/y/width/lane straight back into the shared model nodes (which live
 * in the store) would couple geometry to the data model and make a single
 * reconciliation impossible to lay out two different ways at once. Coordinates
 * live here instead, keyed by node id, so the model stays an immutable
 * description and each `layout()` call owns its own result.
 */

/** Computed geometry of a species node. */
export interface SpeciesPos {
  x: number;
  y: number;
  /** Band ("tube") width for this branch, in px. */
  width: number;
  /** Number of concurrent gene lanes packed into this species. */
  laneCount: number;
}

/** Computed geometry of a gene node. */
export interface GenePos {
  x: number;
  y: number;
  /** Lane index within the host species band. */
  lane: number;
}

export interface Positions {
  /** SpeciesNode.id -> geometry. */
  species: Map<string, SpeciesPos>;
  /** GeneNode.id -> geometry. */
  gene: Map<string, GenePos>;
}

export function createPositions(): Positions {
  return { species: new Map(), gene: new Map() };
}

/** Get (or lazily create) the geometry record for a species node. */
export function spPos(pos: Positions, id: string): SpeciesPos {
  let p = pos.species.get(id);
  if (!p) {
    p = { x: 0, y: 0, width: 0, laneCount: 1 };
    pos.species.set(id, p);
  }
  return p;
}

/** Get (or lazily create) the geometry record for a gene node. */
export function gnPos(pos: Positions, id: string): GenePos {
  let p = pos.gene.get(id);
  if (!p) {
    p = { x: 0, y: 0, lane: 0 };
    pos.gene.set(id, p);
  }
  return p;
}
