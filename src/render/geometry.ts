import type { GeneNode, SpeciesNode, SpeciesTree } from "../model/types";
import { gnPos, spPos, type Positions } from "../layout/positions";

export interface Pt {
  x: number;
  y: number;
}

/** Canonical (pre-projection) drawing commands for one routed gene edge. */
export type EdgeSeg =
  | { kind: "L"; to: Pt }
  | { kind: "C"; c1: Pt; c2: Pt; to: Pt };

const EDGE_EPS = 1e-6;

/**
 * Smooth vertical connector between an upper point p0 and a lower point p1.
 * The curve leaves p0 and enters p1 vertically, bending horizontally in the
 * middle - this is what gives species branches their "tube" look and keeps
 * gene edges elegant.
 */
export function smoothV(p0: Pt, p1: Pt): string {
  const ym = (p0.y + p1.y) / 2;
  return `M${p0.x},${p0.y} C${p0.x},${ym} ${p1.x},${ym} ${p1.x},${p1.y}`;
}

/**
 * Parameter t in [0,1] on the smoothV cubic between species ys `sy < cy`
 * whose y equals `y`. With both control ys at the midpoint the cubic's y(t)
 * is monotone, so bisection converges; the exact x at that t is what
 * `tubeCenterX` (layout/geneEmbed.ts) places gene nodes on.
 */
export function cubicTForY(sy: number, cy: number, y: number): number {
  if (y <= sy) return 0;
  if (y >= cy) return 1;
  const ym = (sy + cy) / 2;
  let lo = 0;
  let hi = 1;
  let t = 0.5;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const yt = sy * (1 - t) ** 3 + 3 * ym * t * (1 - t) + cy * t ** 3;
    if (yt < y) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}

/**
 * de Casteljau subdivision: the sub-curve of a cubic between parameters
 * `t0 < t1`, as its four control points. Slicing the species-tube cubic
 * between two gene ys yields exactly the on-tube segment between them.
 */
export function cubicSlice(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  t0: number,
  t1: number,
): [Pt, Pt, Pt, Pt] {
  const lerp = (a: Pt, b: Pt, t: number): Pt => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  // Split at t0 and keep the right half [t0, 1].
  const r1 = lerp(p0, p1, t0);
  const r2 = lerp(p1, p2, t0);
  const r3 = lerp(p2, p3, t0);
  const r4 = lerp(r1, r2, t0);
  const r5 = lerp(r2, r3, t0);
  const r0 = lerp(r4, r5, t0); // point at t0
  const right: [Pt, Pt, Pt, Pt] = [r0, r5, r3, p3];
  // Split the right half at u = (t1 - t0) / (1 - t0) and keep the left half.
  const u = t1 >= 1 ? 1 : Math.max(0, (t1 - t0) / (1 - t0));
  const s1 = lerp(right[0], right[1], u);
  const s2 = lerp(right[1], right[2], u);
  const s3 = lerp(right[2], right[3], u);
  const s4 = lerp(s1, s2, u);
  const s5 = lerp(s2, s3, u);
  const start = lerp(s4, s5, u); // point at t1
  return [right[0], s1, s4, start];
}

/**
 * Orthogonal elbow connector for a top-down tree. The horizontal segment runs
 * at the *parent's* depth (p0.y), then drops vertically into the child — the
 * standard rectangular-cladogram convention, so siblings share a spanning bar
 * at their parent's level and the nesting reads unambiguously.
 */
export function elbowV(p0: Pt, p1: Pt): string {
  return `M${p0.x},${p0.y} L${p1.x},${p0.y} L${p1.x},${p1.y}`;
}

/** Smooth horizontal connector (bends vertically in the middle). */
export function smoothH(p0: Pt, p1: Pt): string {
  const xm = (p0.x + p1.x) / 2;
  return `M${p0.x},${p0.y} C${xm},${p0.y} ${xm},${p1.y} ${p1.x},${p1.y}`;
}

/**
 * Orthogonal elbow connector for a left/right (horizontal) tree. The vertical
 * segment runs at the *parent's* x (p0.x), then runs horizontally into the
 * child — the mirror of {@link elbowV}, so siblings share a spanning bar at
 * their parent's column.
 */
export function elbowH(p0: Pt, p1: Pt): string {
  return `M${p0.x},${p0.y} L${p0.x},${p1.y} L${p1.x},${p1.y}`;
}

export function branchPath(p0: Pt, p1: Pt, curved: boolean): string {
  return curved ? smoothV(p0, p1) : elbowV(p0, p1);
}

// --------------------------------------------------------------------------
// tree orientation
// --------------------------------------------------------------------------

export type Orientation = "top" | "bottom" | "left" | "right";

/**
 * Maps canonical top-down layout coordinates (root at small y, leaves at large
 * y) into screen coordinates for one of four orientations. The projection is a
 * distance-preserving axis swap/flip, so offsets computed in canonical space
 * (e.g. label tiers) stay correct after projection.
 */
export interface Projector {
  x(px: number, py: number): number;
  y(px: number, py: number): number;
  /** Screen-space bounding box (width/height swap for left/right). */
  width: number;
  height: number;
  /** True when branches run horizontally (left/right orientation). */
  horizontal: boolean;
  /** Screen-space unit vector pointing from a node toward the leaves. */
  leafDx: number;
  leafDy: number;
}

export function makeProjector(o: Orientation, w: number, h: number): Projector {
  switch (o) {
    case "bottom": // root at bottom, leaves grow up
      return { x: (px) => px, y: (_px, py) => h - py, width: w, height: h, horizontal: false, leafDx: 0, leafDy: -1 };
    case "left": // root at left, leaves grow right
      return { x: (_px, py) => py, y: (px) => px, width: h, height: w, horizontal: true, leafDx: 1, leafDy: 0 };
    case "right": // root at right, leaves grow left
      return { x: (_px, py) => h - py, y: (px) => px, width: h, height: w, horizontal: true, leafDx: -1, leafDy: 0 };
    case "top": // root at top, leaves grow down
    default:
      return { x: (px) => px, y: (_px, py) => py, width: w, height: h, horizontal: false, leafDx: 0, leafDy: 1 };
  }
}

/** Project a canonical point to screen space. */
export function pj(proj: Projector, p: Pt): Pt {
  return { x: proj.x(p.x, p.y), y: proj.y(p.x, p.y) };
}

/** Connector between two canonical points, projected, along the growth axis. */
export function connect(proj: Projector, c0: Pt, c1: Pt, curved: boolean): string {
  const p0 = pj(proj, c0);
  const p1 = pj(proj, c1);
  if (proj.horizontal) return curved ? smoothH(p0, p1) : elbowH(p0, p1);
  return curved ? smoothV(p0, p1) : elbowV(p0, p1);
}

/** A straight vertical line, used for the stub above the species root. */
export function vLine(x: number, y0: number, y1: number): string {
  return `M${x},${y0} L${x},${y1}`;
}

/**
 * Bowed transfer arc from a donor point to an arrival point. The control point
 * is pushed perpendicular to the chord so overlapping transfers stay legible.
 */
export function transferArc(from: Pt, to: Pt, bow = 0.22): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = Math.max(14, Math.min(70, len * bow));
  const mx = (from.x + to.x) / 2 + nx * off;
  const my = (from.y + to.y) / 2 + ny * off;
  return `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`;
}

/**
 * Stroke width for one transfer-network edge: the INTEGER number of transfers
 * on that donor->recipient pair, in steps of one pixel (6 or more saturates).
 * Deliberately not normalised by the busiest pair, so a reader can count
 * transfers off the drawing and the value does not move when another pair is
 * added.
 */
export function networkEdgeWidth(count: number): number {
  return 1 + Math.min(5, Math.max(0, Math.round(count) - 1));
}

// --------------------------------------------------------------------------
// gene-edge routing along the species tubes
// --------------------------------------------------------------------------

/**
 * Fraction of a branch's vertical run over which a duplication's child edge
 * finishes swinging away from the tube centerline (the diverging stub that
 * makes the two copies visibly split AT the duplication glyph), and the
 * fraction over which the divergence closes back onto the centerline before
 * the next species fork. See {@link routedGeneEdge}.
 */
const DUP_OPEN_FRAC = 0.4;
const DUP_CLOSE_FRAC = 0.4;

/**
 * Route a gene edge along the species tubes.
 *
 * Every gene node sits on its host branch's tube centerline (see
 * `computeGeneX`), and the tube centerline is itself the species connector
 * (a smooth cubic, or an elbow). A gene edge therefore has to be drawn as the
 * PIECES of those centerlines between the two gene ys - passing through each
 * species fork on the way - not as a single point-to-point connector, which
 * would cut across the fork whenever the two bends happen at different
 * heights (in-branch duplications, transfers, losses; any level height or
 * species spacing).
 *
 * EXCEPT when the parent is a DUPLICATION: a duplication is a branching point
 * in its own right, so its two child edges must visibly diverge from the
 * duplication's own position, not from the species fork below it (a lone
 * duplication would otherwise share one vertical run with its sibling and
 * read as a speciation). Each child edge therefore opens laterally inside the
 * parent's branch - toward the child's own lane (same-species child) or toward
 * the child's downstream species tube (cross-species child) - and, for
 * cross-species children, closes back onto the centerline by the end of the
 * FIRST downstream branch, so every deeper species fork is still visited
 * exactly and no edge leaves its tube (the offsets stay inside the tube's
 * inner half-width).
 *
 * Coordinates are canonical (root up, leaves down); the caller projects them.
 * Returns the canonical start point plus the segment list, or null when the
 * edge cannot be routed (a node without a resolvable species, or a child
 * species that is not a descendant of the parent's) and the caller falls back
 * to the plain connector.
 */
export function routedGeneEdge(
  species: SpeciesTree,
  pos: Positions,
  g: GeneNode,
  c: GeneNode,
  curved: boolean,
): { start: Pt; segs: EdgeSeg[] } | null {
  const sg = species.byName.get(g.speciesId);
  const sc = species.byName.get(c.speciesId);
  if (!sg || !sc) return null;

  // Species chain from the child's species up to the parent's.
  const chain: SpeciesNode[] = [];
  let cur: SpeciesNode | null | undefined = sc;
  let reaches = false;
  for (let guard = 0; cur && guard < 4096; guard++) {
    if (cur.id === sg.id) {
      reaches = true;
      break;
    }
    chain.push(cur);
    cur = cur.parent;
  }
  if (!reaches) return null;

  const gp = gnPos(pos, g.id);
  const cp = gnPos(pos, c.id);
  const start: Pt = { x: gp.x, y: gp.y };
  const end: Pt = { x: cp.x, y: cp.y };
  const segs: EdgeSeg[] = [];

  // X of the tube centerline of branch (S -> C) at canonical y. Mirrors
  // `tubeCenterX` in layout/geneEmbed.ts, which placed the gene nodes on it.
  const centerXAt = (S: SpeciesNode | null, C: SpeciesNode, y: number): number => {
    const cP = spPos(pos, C.id);
    if (!S) return cP.x;
    const sP = spPos(pos, S.id);
    if (cP.y - sP.y <= EDGE_EPS) return cP.x;
    if (!curved) return y <= sP.y ? sP.x : cP.x;
    const t = cubicTForY(sP.y, cP.y, y);
    const a = (1 - t) ** 3 + 3 * (1 - t) ** 2 * t;
    const b = 3 * (1 - t) * t * t + t ** 3;
    return sP.x * a + cP.x * b;
  };

  // Append the part of branch (S -> C) between canonical ys yFrom -> yTo.
  // The emitted geometry is the tube centerline restricted to that span,
  // shifted laterally by an offset blended linearly from `offFrom` (at yFrom)
  // to `offTo` (at yTo), so the gene edge stays on the tube for ANY level
  // height / species gap while a duplication can diverge inside it.
  // The direction matters: the root stub hosts in-branch genes ABOVE the
  // root fork, so a same-species edge can run upward.
  const emitAlong = (
    S: SpeciesNode | null,
    C: SpeciesNode,
    yFrom: number,
    yTo: number,
    offFrom = 0,
    offTo = offFrom,
  ): void => {
    if (Math.abs(yTo - yFrom) <= EDGE_EPS) return;
    const oAt = (y: number): number =>
      offFrom + ((offTo - offFrom) * (y - yFrom)) / (yTo - yFrom);
    const cP = spPos(pos, C.id);
    if (!S || cP.y - spPos(pos, S.id).y <= EDGE_EPS) {
      // Root stub (straight vertical at the root's x), or a degenerate
      // zero-length branch (the tube collapses to the child's x).
      segs.push({ kind: "L", to: { x: cP.x + offTo, y: yTo } });
      return;
    }
    const sP = spPos(pos, S.id);
    if (!curved) {
      // Elbow tube: horizontal along the parent's y, then a vertical drop at
      // the child's x. Above the turn the tube is that drop itself.
      if (Math.min(yFrom, yTo) <= sP.y + EDGE_EPS) {
        segs.push({ kind: "L", to: { x: cP.x + oAt(sP.y), y: sP.y } });
      }
      segs.push({ kind: "L", to: { x: cP.x + oAt(yTo), y: yTo } });
      return;
    }
    const yLo = Math.min(yFrom, yTo);
    const yHi = Math.max(yFrom, yTo);
    const ym = (sP.y + cP.y) / 2;
    const y0c = Math.min(Math.max(yLo, sP.y), cP.y);
    const y1c = Math.min(Math.max(yHi, sP.y), cP.y);
    const t0 = cubicTForY(sP.y, cP.y, y0c);
    const t1 = cubicTForY(sP.y, cP.y, y1c);
    const [q0, q1, q2, q3] = cubicSlice(
      { x: sP.x, y: sP.y },
      { x: sP.x, y: ym },
      { x: cP.x, y: ym },
      { x: cP.x, y: cP.y },
      t0,
      t1,
    );
    // Shift the slice onto the blended offset lane, point by point in y.
    const sh = (p: Pt): Pt => ({ x: p.x + oAt(p.y), y: p.y });
    const s0 = sh(q0);
    const s1 = sh(q1);
    const s2 = sh(q2);
    const s3 = sh(q3);
    // The slice is ordered yLo -> yHi; flip it when the edge runs upward.
    segs.push(
      yFrom <= yTo
        ? { kind: "C", c1: s1, c2: s2, to: s3 }
        : { kind: "C", c1: s2, c2: s1, to: s0 },
    );
  };

  // ---- duplication fork geometry -------------------------------------------
  // A duplication is the branching point of its two child lineages: give this
  // child edge a lateral identity inside the parent's branch so the siblings
  // visibly split at the duplication itself.
  const forkY = spPos(pos, sg.id).y;
  const inBranchParent = gp.y < forkY - EDGE_EPS;
  const dupFork = g.endEvent.type === "duplication" && (chain.length === 0 || inBranchParent);
  let dupOff = 0;
  if (dupFork && chain.length > 0) {
    // Cross-species child: swing toward the child's downstream species tube;
    // fall back to the child's ordinal among the siblings when the tubes are
    // vertically stacked (no lateral difference to read the side off).
    const down = chain[chain.length - 1] as SpeciesNode;
    const dx = spPos(pos, down.id).x - spPos(pos, sg.id).x;
    let side = dx > EDGE_EPS ? 1 : dx < -EDGE_EPS ? -1 : 0;
    if (side === 0) {
      const ordinal = g.children.indexOf(c);
      const mid = (g.children.length - 1) / 2;
      side = ordinal < mid ? -1 : ordinal > mid ? 1 : ordinal === 0 ? -1 : 1;
    }
    const half = spPos(pos, sg.id).width / 2;
    const inner = Math.max(0, half - 4);
    dupOff = side * Math.min(inner, Math.max(3, half * 0.5));
  }

  if (chain.length === 0) {
    // Two genes parked at the same fork in different lanes share the species
    // y: draw a short lane-to-lane connector inside the tube.
    if (Math.abs(cp.y - gp.y) <= EDGE_EPS) {
      segs.push({ kind: "L", to: end });
      return { start, segs };
    }
    // Same species: both ends lie on that species' incoming branch (or the
    // root stub); run directly from the parent gene's y to the child's - the
    // root stub hosts in-branch genes above the fork, so this can run upward.
    if (dupFork) {
      // Open from the duplication's own lane offset to the child's lane
      // offset within the first DUP_OPEN_FRAC of the run, then drop straight
      // down that lane: the sibling edges differ AT the square instead of
      // sharing one centerline run and hopping apart at the tip baseline.
      const o0 = gp.x - centerXAt(sg.parent ?? null, sg, gp.y);
      const o1 = cp.x - centerXAt(sg.parent ?? null, sg, cp.y);
      const yMid = gp.y + (cp.y - gp.y) * DUP_OPEN_FRAC;
      emitAlong(sg.parent ?? null, sg, gp.y, yMid, o0, o1);
      emitAlong(sg.parent ?? null, sg, yMid, cp.y, o1, o1);
    } else {
      emitAlong(sg.parent ?? null, sg, gp.y, cp.y);
    }
  } else {
    // An in-branch parent gene sits on ITS species' incoming branch: descend
    // along that branch to the fork first.
    if (inBranchParent) {
      if (dupFork) {
        // Diverge from the duplication inside this branch, then hold the
        // lane until the fork: the split is visibly ABOVE the species fork.
        const o0 = gp.x - centerXAt(sg.parent ?? null, sg, gp.y);
        const yMid = gp.y + (forkY - gp.y) * DUP_OPEN_FRAC;
        emitAlong(sg.parent ?? null, sg, gp.y, yMid, o0, dupOff);
        emitAlong(sg.parent ?? null, sg, yMid, forkY, dupOff, dupOff);
      } else {
        emitAlong(sg.parent ?? null, sg, gp.y, forkY);
      }
    }
    // Then follow every species branch on the path; the last one only runs
    // down to the child gene's own y. The FIRST downstream branch of a
    // duplication edge carries the divergence and closes back onto the
    // centerline (last DUP_CLOSE_FRAC of the branch), so every deeper fork
    // is still visited exactly.
    let prev = sg;
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i] as SpeciesNode;
      const endY = i === 0 ? cp.y : spPos(pos, node.id).y;
      const from =
        dupFork && inBranchParent && i === chain.length - 1 ? dupOff : 0;
      const startY = spPos(pos, prev.id).y;
      if (from !== 0 && Math.abs(endY - startY) > EDGE_EPS) {
        const closeY = startY + (endY - startY) * (1 - DUP_CLOSE_FRAC);
        emitAlong(prev, node, startY, closeY, from, from);
        emitAlong(prev, node, closeY, endY, from, 0);
      } else {
        emitAlong(prev, node, startY, endY, from, 0);
      }
      prev = node;
    }
  }
  // Lane packing can park a gene node a few px off the centerline inside its
  // tube; close the routed tube path onto the node's actual glyph position so
  // the stroke reaches it.
  const lastPt = segs.length > 0 ? segs[segs.length - 1]!.to : start;
  if (Math.hypot(lastPt.x - cp.x, lastPt.y - cp.y) > EDGE_EPS) {
    segs.push({ kind: "L", to: end });
  }
  return { start, segs };
}
