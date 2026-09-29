import type { GeneNode, Reconciliation, SpeciesNode, SpeciesTree } from "../model/types";
import type { LayoutOptions } from "./options";
import { gnPos, spPos, type Positions } from "./positions";
import { branchTopY } from "./species";

/**
 * A gene node sits "along a branch" (rather than at a species fork) when its
 * terminal event is neither a speciation nor an extant leaf. These are the
 * events that must be threaded between two species levels: duplications,
 * transfers and losses.
 */
function isInBranch(g: GeneNode): boolean {
  return g.endEvent.type !== "speciation" && g.endEvent.type !== "leaf";
}

/**
 * Vertical placement of gene nodes (requires species Y to be set).
 *
 * Speciation/leaf nodes are pinned to their host species node. In-branch events
 * (duplication/transfer/loss) are evenly distributed along the species branch
 * segment they belong to, so stacked duplications don't collapse onto a point.
 */
export function computeGeneY(
  recon: Reconciliation,
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
  collapsed: Set<string> = new Set(),
): void {
  for (const tree of recon.geneTrees) {
    // Post-order: longest chain of in-branch, same-species descendants.
    const descDepth = new Map<string, number>();
    const post = (g: GeneNode): number => {
      let best = 0;
      if (!collapsed.has(g.id)) {
        for (const c of g.children) {
          const d = post(c);
          if (c.speciesId === g.speciesId && isInBranch(c)) {
            best = Math.max(best, 1 + d);
          }
        }
      }
      descDepth.set(g.id, best);
      return best;
    };
    post(tree.root);

    const assign = (g: GeneNode): void => {
      const gp = gnPos(pos, g.id);
      const s = species.byName.get(g.speciesId);
      if (!s) {
        gp.y = g.parent ? gnPos(pos, g.parent.id).y + opts.levelHeight * 0.5 : 0;
      } else if (!isInBranch(g)) {
        gp.y = spPos(pos, s.id).y;
      } else {
        const topY = branchTopY(s, opts, pos);
        const sy = spPos(pos, s.id).y;
        // Even distribution of stacked in-branch events along the branch.
        let posn = 0;
        let a = g.parent;
        while (a && a.speciesId === g.speciesId && isInBranch(a)) {
          posn++;
          a = a.parent;
        }
        const segLen = posn + (descDepth.get(g.id) ?? 0) + 1;
        let frac = (posn + 1) / (segLen + 1);
        // Duplications: "center" puts them at the branch midpoint; otherwise
        // they sit in the upper half (nearer the ancestor), so toggling the
        // option is always visibly distinct - even for a lone duplication.
        if (g.endEvent.type === "duplication") {
          frac = opts.midwayDuplication ? 0.5 : frac * 0.5;
        }
        gp.y = topY + frac * (sy - topY);
      }
      if (collapsed.has(g.id)) return; // do not descend into a collapsed subtree
      for (const c of g.children) assign(c);
    };
    assign(tree.root);
  }
}

interface Interval {
  node: GeneNode;
  start: number;
  end: number;
}

/**
 * Assign each gene node a lane index inside its host species and record the
 * number of concurrent lanes per species.
 *
 * `laneCount` drives the lateral offset of a species' gene nodes and the
 * copy-number heatmap in `src/render/Scene.tsx`: it counts the concurrent gene
 * lanes on the branch, not the surviving (non-loss) gene nodes on it. It does
 * NOT drive tube width - every tube is `opts.speciesThickness` wide (see
 * `computeSpeciesX` in `species.ts`).
 *
 * The incoming edge of every gene node covers a vertical interval within its
 * species; overlapping intervals are packed into distinct lanes via classic
 * interval partitioning (first-fit by start = minimum number of lanes). Lanes
 * are pooled across all gene trees so multiple families never overlap.
 */
export function assignLanes(
  recon: Reconciliation,
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
  hidden: Set<string> = new Set(),
): void {
  for (const s of species.nodes) spPos(pos, s.id).laneCount = 1;

  const bySpecies = new Map<string, Interval[]>();
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (hidden.has(g.id)) continue;
      const s = species.byName.get(g.speciesId);
      if (!s) continue;
      const topY = branchTopY(s, opts, pos);
      const entryY =
        g.parent && g.parent.speciesId === g.speciesId
          ? gnPos(pos, g.parent.id).y
          : topY;
      const gy = gnPos(pos, g.id).y;
      const iv: Interval = {
        node: g,
        start: Math.min(entryY, gy),
        end: Math.max(entryY, gy),
      };
      const arr = bySpecies.get(g.speciesId);
      if (arr) arr.push(iv);
      else bySpecies.set(g.speciesId, [iv]);
    }
  }

  for (const [spId, ivs] of bySpecies) {
    ivs.sort((a, b) => a.start - b.start || a.end - b.end);
    const { lanes, count } = packLanes(ivs.map((iv) => ({ start: iv.start, end: iv.end })));
    ivs.forEach((iv, i) => {
      gnPos(pos, iv.node.id).lane = lanes[i] as number;
    });
    const s = species.byName.get(spId);
    if (s) spPos(pos, s.id).laneCount = count;
  }
}

/** One gene edge's vertical span inside its host species tube. */
export interface LaneInterval {
  start: number;
  end: number;
}

/**
 * Classic interval partitioning: sort by start, then first-fit each interval
 * into the lowest lane whose last segment ends at or before its start. The
 * number of lanes used is therefore the maximum number of simultaneously
 * overlapping intervals.
 *
 * The one exception: a zero-height interval (a node pinned to its own level,
 * which a branchless document or a zero-length branch produces) that lands
 * exactly on a coordinate already drawn has to take a fresh lane, or the two
 * glyphs stack on one point and one hides the other. The trigger is therefore
 * the shared coordinate, not zero height as such: a point is kept out of a lane
 * only where its start touches that lane's current end. Rejection on any
 * zero-height side would let every point interval consume a lane of its own, so
 * the count would rise above the maximum simultaneous overlap the packer is
 * defined by and the copy-number heatmap would over-count.
 *
 * Returns the lane index per input position plus the total lane count.
 */
export function packLanes(intervals: LaneInterval[]): { lanes: number[]; count: number } {
  const EPS = 1e-6;
  const isPoint = (iv: LaneInterval): boolean => iv.end - iv.start <= EPS;
  const order = intervals.map((iv, i) => ({ iv, i }));
  order.sort((a, b) => a.iv.start - b.iv.start || a.iv.end - b.iv.end);
  const lanes: number[] = new Array<number>(intervals.length).fill(0);
  const laneLast: LaneInterval[] = [];
  for (const { iv, i } of order) {
    let placed = -1;
    for (let k = 0; k < laneLast.length; k++) {
      const prev = laneLast[k] as LaneInterval;
      if (iv.start < prev.end - EPS) continue; // genuinely overlapping
      if ((isPoint(iv) || isPoint(prev)) && Math.abs(iv.start - prev.end) <= EPS) continue;
      placed = k;
      break;
    }
    if (placed === -1) {
      placed = laneLast.length;
      laneLast.push(iv);
    } else {
      laneLast[placed] = iv;
    }
    lanes[i] = placed;
  }
  return { lanes, count: Math.max(1, laneLast.length) };
}

/**
 * X of the species-tube centerline at a given y along the branch into `s`.
 *
 * The tube is drawn from the parent species down to `s` using the same
 * connector as gene edges (smooth cubic, or an elbow). In-branch gene nodes
 * must follow this centerline so the gene skeleton stays inside the tube -
 * snapping them to the child species x makes them poke out near the top of the
 * branch (where the tube runs close to the parent's x).
 */
function tubeCenterX(
  s: SpeciesNode,
  y: number,
  curved: boolean,
  pos: Positions,
): number {
  const sp = spPos(pos, s.id);
  if (!s.parent) return sp.x; // root: vertical stub at s.x
  const pp = spPos(pos, s.parent.id);
  const p0x = pp.x;
  const p0y = pp.y;
  const p1x = sp.x;
  const p1y = sp.y;
  if (p1y <= p0y) return sp.x;
  // Elbow (render/geometry.ts elbowV): the path runs horizontally along the
  // PARENT's y and then drops vertically at the CHILD's x - so for every y
  // strictly below p0y the tube is at p1x, and only at or above p0y is it at
  // p0x. Stepping at the branch midpoint would place the upper half of the
  // branch beside the tube instead of on it.
  if (!curved) return y <= p0y ? p0x : p1x;
  // smoothV cubic: P0=P1 at p0x, P2=P3 at p1x; y control points at the midpoint.
  const ym = (p0y + p1y) / 2;
  let lo = 0;
  let hi = 1;
  let t = 0.5;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const yt =
      p0y * (1 - t) ** 3 + 3 * ym * t * (1 - t) + p1y * t ** 3;
    if (yt < y) lo = t;
    else hi = t;
  }
  const a = (1 - t) ** 3 + 3 * (1 - t) ** 2 * t;
  const b = 3 * (1 - t) * t * t + t ** 3;
  return p0x * a + p1x * b;
}

/**
 * Smallest distance two lanes may end up apart.
 *
 * `geneGap` is the *desired* spacing, but the clamp that keeps lanes inside the
 * fixed-width tube drives it to sub-pixel values once a species hosts many
 * copies (1200 tips in a ~34 px tube is 0.14 px apart, where the glyphs would
 * merge into a single blob). Rather than collapse, extreme copy numbers spill
 * past the nominal tube; the canvas bounds are computed from the node
 * positions, so the drawing simply gets wider.
 */
const MIN_LANE_SPACING = 3;

/** Key identifying the pseudo-column of nodes with an unresolvable species. */
function unplacedKey(g: GeneNode, treeIndex: number): string {
  return g.parent ? g.parent.id : `\u0000root:${treeIndex}`;
}

/**
 * Horizontal placement of gene nodes: each node sits on its species-tube
 * centerline at its own y (so the gene skeleton hugs the tube), and lanes are
 * packed inside the uniform tube width, which is never widened for them.
 * `geneGap` is the desired lane spacing, clamped into the tube's inner width
 * and floored at MIN_LANE_SPACING (see the note on that constant above).
 */
export function computeGeneX(
  recon: Reconciliation,
  species: SpeciesTree,
  opts: LayoutOptions,
  pos: Positions,
  hidden: Set<string> = new Set(),
  curved = true,
): void {
  const pad = 4;
  const inner = Math.max(0, opts.speciesThickness / 2 - pad);

  // Nodes whose speciesLocation resolves to nothing have no tube to sit in, and
  // inheriting the parent's exact point would stack every such sibling on one
  // coordinate. Count them per parent so they can be spread in their own
  // column instead, in stable document order.
  const unplacedTotal = new Map<string, number>();
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (hidden.has(g.id) || species.byName.has(g.speciesId)) continue;
      const k = unplacedKey(g, tree.index);
      unplacedTotal.set(k, (unplacedTotal.get(k) ?? 0) + 1);
    }
  }
  const unplacedSeen = new Map<string, number>();

  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (hidden.has(g.id)) continue;
      const gp = gnPos(pos, g.id);
      const s = species.byName.get(g.speciesId);
      if (!s) {
        const k = unplacedKey(g, tree.index);
        const ordinal = unplacedSeen.get(k) ?? 0;
        unplacedSeen.set(k, ordinal + 1);
        const total = unplacedTotal.get(k) ?? 1;
        const base = g.parent ? gnPos(pos, g.parent.id).x : 0;
        gp.lane = ordinal;
        gp.x =
          base + (ordinal - (total - 1) / 2) * Math.max(MIN_LANE_SPACING, opts.geneGap);
        continue;
      }
      const cx = tubeCenterX(s, gp.y, curved, pos);
      const laneCount = spPos(pos, s.id).laneCount;
      if (laneCount <= 1) {
        gp.x = cx;
        continue;
      }
      const spacing = Math.max(
        MIN_LANE_SPACING,
        Math.min(opts.geneGap, (2 * inner) / (laneCount - 1)),
      );
      const laneOffset = (gp.lane - (laneCount - 1) / 2) * spacing;
      gp.x = cx + laneOffset;
    }
  }
}
