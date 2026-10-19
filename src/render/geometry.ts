export interface Pt {
  x: number;
  y: number;
}

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
