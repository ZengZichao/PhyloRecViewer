import type { GeneNode, Reconciliation } from "../model/types";
import { computeGeneX, computeGeneY, assignLanes } from "./geneEmbed";
import {
  defaultLayoutOptions,
  type LayoutOptions,
  type LayoutResult,
} from "./options";
import { createPositions, gnPos, spPos } from "./positions";
import { computeSpeciesX, computeSpeciesY, hasUsableSpeciesLengths, rootStubLen } from "./species";
import { computeTransfers } from "./transfers";

export * from "./options";
export * from "./positions";

/**
 * Largest sideways bulge a transfer arc can ever have, in px.
 *
 * `render/geometry.ts` clamps its control-point offset to `max(14, min(70,
 * chord * bow))`, so 70 px is the ceiling for ANY `transferBow` setting. The
 * layout must reserve that much room (see the bounds pass) or a wide arc gets
 * cropped by the canvas / the exported figure. Kept as a local copy of
 * that ceiling rather than an import, so the layout layer stays free of render
 * dependencies; `layout-placement.test.ts` asserts the two stay in step.
 */
const ARC_MAX_BULGE = 70;

/**
 * Run a complete layout pass over a reconciliation. Coordinates are written
 * into a fresh `Positions` map (keyed by node id) and returned in the result;
 * the model nodes themselves are never mutated.
 *
 * Ordering matters and is deliberately acyclic:
 *   1. species Y (depth-based, independent of everything else)
 *   2. gene Y (needs species Y)
 *   3. lane packing (needs gene Y) -> species laneCount
 *   4. species X (uniform tube width = speciesThickness, independent of laneCount)
 *   5. gene X (needs species X + lanes packed inside each tube)
 *   6. transfer edges + canvas bounds
 */
export function layout(
  recon: Reconciliation,
  options?: Partial<LayoutOptions>,
  swapped?: Set<string>,
  collapsed: Set<string> = new Set(),
  curved = true,
): LayoutResult {
  const opts: LayoutOptions = { ...defaultLayoutOptions, ...options };
  const { species } = recon;
  const pos = createPositions();

  // Gene nodes hidden because an ancestor is collapsed.
  const hidden = new Set<string>();
  const markSubtree = (g: GeneNode): void => {
    for (const c of g.children) {
      hidden.add(c.id);
      markSubtree(c);
    }
  };
  const walk = (g: GeneNode): void => {
    if (collapsed.has(g.id)) {
      markSubtree(g);
      return;
    }
    for (const c of g.children) walk(c);
  };
  for (const tree of recon.geneTrees) walk(tree.root);

  computeSpeciesY(species, opts, pos);
  computeGeneY(recon, species, opts, pos, collapsed);
  assignLanes(recon, species, opts, pos, hidden);
  computeSpeciesX(species, opts, pos, swapped);
  computeGeneX(recon, species, opts, pos, hidden, curved);
  const transfers = computeTransfers(recon).filter(
    (t) => !hidden.has(t.from.id) && !hidden.has(t.to.id),
  );

  // Gene nodes with no resolvable host species: exposed on the result so the UI
  // can mark them instead of drawing them as if they were located.
  const unplacedGeneIds = new Set<string>();
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (!hidden.has(g.id) && !species.byName.has(g.speciesId)) {
        unplacedGeneIds.add(g.id);
      }
    }
  }

  // ---- bounds ----
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const s of species.nodes) {
    const p = spPos(pos, s.id);
    acc(p.x - p.width / 2, p.y);
    acc(p.x + p.width / 2, p.y);
  }
  // include the stub above the root branch
  const rootP = spPos(pos, species.root.id);
  acc(rootP.x, rootP.y - rootStubLen(opts));
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (hidden.has(g.id)) continue;
      const p = gnPos(pos, g.id);
      acc(p.x, p.y);
    }
  }
  // Transfer arcs bow sideways off their chord by up to 70 px (see the
  // transferArc clamp in render/geometry.ts), and `margin` alone does not cover
  // that, so a wide arc would be clipped by the canvas. A quadratic Bezier lies
  // inside the convex hull of its three points, so folding in the control point
  // covers the whole curve. The renderer pushes the control point
  // perpendicular to the *projected* chord, and the four tree orientations flip
  // or swap the axes, so the bulge can land on either side: reserve for both.
  // `transferBow` is a render option the layout never sees, so the reservation
  // uses the renderer's own clamp bounds (14..70 px) at the widest setting -
  // the geometry can never bulge further than that.
  for (const t of transfers) {
    const a = gnPos(pos, t.from.id);
    const b = gnPos(pos, t.to.id);
    const dxe = b.x - a.x;
    const dye = b.y - a.y;
    const len = Math.hypot(dxe, dye) || 1;
    const off = Math.max(14, Math.min(ARC_MAX_BULGE, len));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const nx = (-dye / len) * off;
    const ny = (dxe / len) * off;
    acc(mx + nx, my + ny);
    acc(mx - nx, my - ny);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  // Room at the bottom for leaf labels (species + gene tips are rotated 45deg).
  let maxNameLen = 0;
  for (const s of species.nodes) {
    if (s.children.length === 0) maxNameLen = Math.max(maxNameLen, s.name.length);
  }
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      if (hidden.has(g.id)) continue;
      if (g.endEvent.type === "leaf") {
        // Match the label the renderer actually draws (geneName falls back to
        // name) so the reserved bottom space fits long extant-gene names.
        const label = g.endEvent.geneName || g.name;
        maxNameLen = Math.max(maxNameLen, label.length);
      }
    }
  }
  // Room at the bottom: gene tips sit on an upper tier and species names on a
  // lower tier, both rotated, so reserve for both plus the tier offset.
  // Calibrated at the renderer's default 12 px labels (~6 px per rotated
  // character); scale linearly so a larger print label reserves proportionally
  // more room instead of being clipped at the canvas edge.
  const labelScale = Math.max(1, opts.labelFontPx / 12);
  // Only the name-length term scales: at the default 12 px this reduces to the
  // original `200 + maxNameLen * 6`, and a larger print label grows the
  // per-character allowance instead of the fixed tier offset too.
  const labelSpace = Math.min(
    200 + maxNameLen * 6 * labelScale * 1.6,
    Math.max(180, 200 + maxNameLen * 6 * labelScale),
  );

  // Shift all coordinates so content starts at (margin, margin).
  const dx = opts.margin - minX;
  const dy = opts.margin - minY;
  for (const s of species.nodes) {
    const p = spPos(pos, s.id);
    p.x += dx;
    p.y += dy;
  }
  for (const tree of recon.geneTrees) {
    for (const g of tree.nodes) {
      const p = gnPos(pos, g.id);
      p.x += dx;
      p.y += dy;
    }
  }

  const width = maxX - minX + opts.margin * 2;
  const height = maxY - minY + opts.margin * 2 + labelSpace;

  return {
    reconciliation: recon,
    positions: pos,
    transfers,
    width,
    height,
    options: opts,
    collapsedIds: new Set(collapsed),
    hiddenIds: hidden,
    branchLengthMode: opts.useBranchLengths && hasUsableSpeciesLengths(species),
    unplacedGeneIds,
  };
}
