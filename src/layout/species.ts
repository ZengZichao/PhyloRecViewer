import type { SpeciesNode, SpeciesTree } from "../model/types";
import type { LayoutOptions } from "./options";
import { spPos, type Positions } from "./positions";

/**
 * True when the document carries at least one usable (positive) species branch
 * length, i.e. when branch-length mode can actually say something about time.
 *
 * Every bundled sample and every NHX-derived species tree has none at all
 * (`parser/nhx.ts` never sets it), and with a cumulative length of 0 everywhere
 * the branch-length mode put every internal species on y=0 while `alignTips`
 * snapped all tips onto the baseline: a 3-level tree rendered as 2 rows, with
 * the whole in-branch band collapsed. The UI can use this to tell the
 * user the toggle had no data to work with.
 */
export function hasUsableSpeciesLengths(species: SpeciesTree): boolean {
  return species.nodes.some((n) => n.parent && (n.branchLength ?? 0) > 0);
}

/**
 * Assign the vertical position of every species node.
 *
 * The tree flows top -> bottom: the root sits at the top and time increases
 * downward. When `alignTips` is set, extant species (leaves) are pushed to a
 * shared baseline for the familiar ultrametric look; edges always point down.
 */
export function computeSpeciesY(
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
): number {
  let maxDepth = 0;
  for (const n of species.nodes) maxDepth = Math.max(maxDepth, n.depth);

  // Branch-length mode: y is the cumulative branch length from the root,
  // rescaled so the deepest tip lands at roughly the same height as depth mode.
  // Falls back to depth mode when there are no lengths to scale.
  if (opts.useBranchLengths && hasUsableSpeciesLengths(species)) {
    const cum = new Map<string, number>();
    const walk = (n: SpeciesNode): void => {
      const parentCum = n.parent ? (cum.get(n.parent.id) ?? 0) : 0;
      // A missing length contributes 0 rather than a fabricated 1 (which would
      // mix real branch lengths with an arbitrary constant and distort the
      // scale); a negative length is floored at 0 so a child can never render
      // above its parent.
      const len = n.parent ? Math.max(0, n.branchLength ?? 0) : 0;
      cum.set(n.id, parentCum + len);
      for (const c of n.children) walk(c);
    };
    walk(species.root);
    let maxCum = 0;
    for (const v of cum.values()) maxCum = Math.max(maxCum, v);
    const bottomY = maxDepth * opts.levelHeight;
    const scale = maxCum > 0 ? bottomY / maxCum : opts.levelHeight;
    // `alignTips` still applies in branch-length mode: leaves snap to the tip
    // baseline while internals keep their proportional cumulative height.
    for (const n of species.nodes) {
      const isLeaf = n.children.length === 0;
      spPos(pos, n.id).y =
        isLeaf && opts.alignTips ? bottomY : (cum.get(n.id) ?? 0) * scale;
    }
    return bottomY;
  }

  const bottomY = maxDepth * opts.levelHeight;
  for (const n of species.nodes) {
    const isLeaf = n.children.length === 0;
    spPos(pos, n.id).y =
      isLeaf && opts.alignTips ? bottomY : n.depth * opts.levelHeight;
  }
  return bottomY;
}

/** Top edge (y) of a species branch: its parent's y, or above-root for the root. */
export function branchTopY(
  s: SpeciesNode,
  opts: LayoutOptions,
  pos: Positions,
): number {
  return s.parent
    ? spPos(pos, s.parent.id).y
    : spPos(pos, s.id).y - opts.levelHeight;
}

/**
 * Visual length of the decorative stub drawn above the species root. Kept short
 * and independent of `levelHeight` so the root branch never looks overlong.
 */
export function rootStubLen(opts: LayoutOptions): number {
  return Math.max(20, Math.min(48, opts.levelHeight * 0.5));
}

/**
 * Is this species node marked for mirroring?
 *
 * The mirror set has historically been keyed by species NAME (that is what
 * `optimizeCrossings` returns and what the click-to-mirror action writes), but
 * names are not unique in real files - an empty `<name/>` or two conspecific
 * clades make one click mirror every same-named branch. Accepting the
 * stable node id as well lets the UI key mirroring unambiguously without the
 * layout having to change the shape of the set it is handed.
 */
function isSwapped(n: SpeciesNode, swapped?: Set<string>): boolean {
  return !!swapped && (swapped.has(n.name) || swapped.has(n.id));
}

/** Order of `kids` for drawing: reversed when the node is mirrored. */
function mirroredChildren(
  n: SpeciesNode,
  swapped?: Set<string>,
): SpeciesNode[] {
  return isSwapped(n, swapped) ? [...n.children].reverse() : n.children;
}

/**
 * Assign horizontal position and band width of every species node.
 *
 * Every tube is given the SAME width (`opts.speciesThickness`): the tube width
 * is uniform and does NOT scale with `laneCount`. `laneCount` is consumed later
 * by computeGeneX to pack lanes *inside* the fixed-width tube. Leaves are laid
 * out left-to-right; internal nodes are centered over their children.
 */
export function computeSpeciesX(
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
  swapped?: Set<string>,
): number {
  for (const n of species.nodes) {
    spPos(pos, n.id).width = opts.speciesThickness;
  }

  if (opts.layoutMode === "tidy") {
    return computeSpeciesXTidy(species, opts, pos, swapped);
  }

  let cursor = 0;
  const place = (n: SpeciesNode): void => {
    const p = spPos(pos, n.id);
    if (n.children.length === 0) {
      p.x = cursor + p.width / 2;
      cursor += p.width + opts.speciesGap;
      return;
    }
    const kids = mirroredChildren(n, swapped);
    for (const c of kids) place(c);
    // Loop rather than Math.min(...xs) so a star node with thousands of direct
    // children does not blow the argument-count / call-stack limit.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const c of n.children) {
      const cx = spPos(pos, c.id).x;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
    }
    p.x = (minX + maxX) / 2;
  };
  place(species.root);

  // Total content width = right edge of the last placed leaf slot.
  return Math.max(0, cursor - opts.speciesGap);
}

// --------------------------------------------------------------------------
// tidy (Reingold-Tilford contour) layout
// --------------------------------------------------------------------------

interface Contour {
  /** Leftmost edge per RENDERED row (keyed by the node's final y, not by
   *  relative depth - see tidySubtree). */
  left: Map<number, number>;
  /** Rightmost edge per rendered row. */
  right: Map<number, number>;
  /** Relative x of every node in the subtree (root at 0). */
  rel: Map<string, number>;
}

/** Quantised row key: nodes sharing it are drawn on the same horizontal line. */
function rowKey(y: number): number {
  return Math.round(y * 1000);
}

/**
 * Reingold-Tilford style contour placement adapted to variable tube widths.
 * Sibling subtrees are slid together until their contours nearly touch, which
 * packs the drawing far tighter than fixed leaf slots when tips are not aligned.
 *
 * Contours are indexed by the node's FINAL y rather than by its depth relative
 * to the subtree root. `computeSpeciesY` has already run, so with `alignTips`
 * on, leaves from different relative levels all sit on one baseline; indexing by
 * relative level compared rows that never actually meet and left the tubes on
 * that shared baseline overlapping each other.
 */
function tidySubtree(
  n: SpeciesNode,
  opts: LayoutOptions,
  pos: Positions,
  swapped?: Set<string>,
): Contour {
  const hw = spPos(pos, n.id).width / 2;
  const myRow = rowKey(spPos(pos, n.id).y);
  if (n.children.length === 0) {
    return {
      left: new Map([[myRow, -hw]]),
      right: new Map([[myRow, hw]]),
      rel: new Map([[n.id, 0]]),
    };
  }
  const kids = mirroredChildren(n, swapped);
  const gap = opts.speciesGap;
  const childC = kids.map((c) => tidySubtree(c, opts, pos, swapped));

  const px: number[] = [];
  const accLeft = new Map<number, number>();
  const accRight = new Map<number, number>();
  childC.forEach((cc, i) => {
    let shift = 0;
    if (i > 0) {
      let has = false;
      for (const [row, rightEdge] of accRight) {
        const lft = cc.left.get(row);
        if (lft === undefined) continue;
        const need = rightEdge + gap - lft;
        if (!has || need > shift) {
          shift = need;
          has = true;
        }
      }
    }
    px.push(shift);
    for (const [row, lft] of cc.left) {
      const shifted = lft + shift;
      const rgt = (cc.right.get(row) ?? lft) + shift;
      if (accLeft.has(row)) {
        accLeft.set(row, Math.min(accLeft.get(row)!, shifted));
        accRight.set(row, Math.max(accRight.get(row)!, rgt));
      } else {
        accLeft.set(row, shifted);
        accRight.set(row, rgt);
      }
    }
  });

  const center = (px[0] + px[px.length - 1]) / 2;
  const rel = new Map<string, number>();
  rel.set(n.id, 0);
  childC.forEach((cc, i) => {
    const off = px[i] - center;
    for (const [id, x] of cc.rel) rel.set(id, x + off);
  });

  const left = new Map<number, number>([[myRow, -hw]]);
  const right = new Map<number, number>([[myRow, hw]]);
  childC.forEach((cc, i) => {
    const off = px[i] - center;
    for (const [row, lft] of cc.left) {
      const rgt = cc.right.get(row)! + off;
      const shifted = lft + off;
      if (left.has(row)) {
        left.set(row, Math.min(left.get(row)!, shifted));
        right.set(row, Math.max(right.get(row)!, rgt));
      } else {
        left.set(row, shifted);
        right.set(row, rgt);
      }
    }
  });
  return { left, right, rel };
}

function computeSpeciesXTidy(
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
  swapped?: Set<string>,
): number {
  const c = tidySubtree(species.root, opts, pos, swapped);
  let minEdge = Infinity;
  let maxEdge = -Infinity;
  for (const n of species.nodes) {
    const rx = c.rel.get(n.id) ?? 0;
    const hw = spPos(pos, n.id).width / 2;
    minEdge = Math.min(minEdge, rx - hw);
    maxEdge = Math.max(maxEdge, rx + hw);
  }
  if (!Number.isFinite(minEdge)) return 0;
  const off = -minEdge;
  for (const n of species.nodes) spPos(pos, n.id).x = (c.rel.get(n.id) ?? 0) + off;
  return maxEdge - minEdge;
}
