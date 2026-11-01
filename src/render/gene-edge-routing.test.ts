import { describe, expect, it } from "vitest";
import { layout } from "../layout";
import type { SpeciesNode } from "../model/types";
import { parseReconciliation } from "../parser/formats";
import { routedGeneEdge } from "./geometry";
import compareBXml from "../samples/compare-tool-b.recphyloxml?raw";
import nestedGeneXml from "../samples/nested-gene-symbiont.recphyloxml?raw";

/**
 * Gene edges must follow the species tubes: every routed edge has to pass
 * through each species fork between its endpoints and start/end exactly on
 * the gene node positions. A regression to a single point-to-point connector
 * would cut across forks and fail the fork-visiting assertion.
 *
 * A DUPLICATION additionally has to render as a real branch point: its two
 * child edges must visibly diverge AT the duplication node (not at the species
 * fork below it) while every point of the edge stays inside its host tube.
 */

/**
 * Fixture exercising EVERY event type (speciation, duplication, loss,
 * branchingOut, bifurcationOut, transferBack, leaf). Formerly the bundled
 * `all-events` sample (removed from the catalog); kept here as a layout
 * fixture so the routing tests still run on a tree with every event type.
 */
const allEventsXml = `<?xml version="1.0" encoding="UTF-8"?>
<recPhylo>
  <spTree>
    <phylogeny rooted="true">
      <clade>
        <name>R</name>
        <clade><name>A</name></clade>
        <clade><name>B</name></clade>
      </clade>
    </phylogeny>
  </spTree>
  <recGeneTree>
    <phylogeny rooted="true">
      <clade>
        <name>r</name>
        <eventsRec><speciation speciesLocation="R"/></eventsRec>
        <clade>
          <name>dup</name>
          <eventsRec><duplication speciesLocation="R"/></eventsRec>
          <clade><eventsRec><leaf speciesLocation="A" geneName="x1"/></eventsRec></clade>
          <clade><eventsRec><loss speciesLocation="B"/></eventsRec></clade>
        </clade>
        <clade>
          <name>sp2</name>
          <eventsRec><speciation speciesLocation="R"/></eventsRec>
          <clade>
            <name>bo</name>
            <eventsRec><branchingOut speciesLocation="A"/></eventsRec>
            <clade><eventsRec><leaf speciesLocation="A" geneName="keep"/></eventsRec></clade>
            <clade>
              <eventsRec><transferBack destinationSpecies="B"/><leaf speciesLocation="B" geneName="arr1"/></eventsRec>
            </clade>
          </clade>
          <clade>
            <name>bco</name>
            <eventsRec><bifurcationOut speciesLocation="B"/></eventsRec>
            <clade>
              <eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr2"/></eventsRec>
            </clade>
            <clade>
              <eventsRec><transferBack destinationSpecies="A"/><leaf speciesLocation="A" geneName="arr3"/></eventsRec>
            </clade>
          </clade>
        </clade>
      </clade>
    </phylogeny>
  </recGeneTree>
</recPhylo>
`;

interface SampledPath {
  points: { x: number; y: number }[];
}

/** Flatten a routed edge into a dense polyline (linears + subdivided cubics). */
function flatten(start: { x: number; y: number }, segs: ReturnType<typeof routedGeneEdge> extends null ? never : NonNullable<ReturnType<typeof routedGeneEdge>>["segs"]): SampledPath {
  const points: { x: number; y: number }[] = [start];
  const cubic = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ) => {
    for (let i = 1; i <= 32; i++) {
      const t = i / 32;
      const mt = 1 - t;
      points.push({
        x: mt ** 3 * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t ** 3 * p3.x,
        y: mt ** 3 * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t ** 3 * p3.y,
      });
    }
  };
  let cur = start;
  for (const s of segs) {
    if (s.kind === "L") {
      points.push(s.to);
      cur = s.to;
    } else {
      cubic(cur, s.c1, s.c2, s.to);
      cur = s.to;
    }
  }
  return { points };
}

/**
 * X of the tube centerline of the branch into `C` (from species `S`, or the
 * root stub when S is null) at canonical y - the same curve the layout and
 * the renderer draw. Used to keep sampled path points honest about staying
 * inside their tube.
 */
function centerlineX(
  pos: ReturnType<typeof layout>["positions"],
  S: SpeciesNode | null,
  C: SpeciesNode,
  y: number,
  curved = true,
): number {
  const cP = pos.species.get(C.id)!;
  if (!S) return cP.x;
  const sP = pos.species.get(S.id)!;
  if (cP.y - sP.y <= 1e-6) return cP.x;
  if (!curved) return y <= sP.y ? sP.x : cP.x;
  const ym = (sP.y + cP.y) / 2;
  let lo = 0;
  let hi = 1;
  let t = 0.5;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const yt = sP.y * (1 - t) ** 3 + 3 * ym * t * (1 - t) + cP.y * t ** 3;
    if (yt < y) lo = t;
    else hi = t;
  }
  const a = (1 - t) ** 3 + 3 * (1 - t) ** 2 * t;
  const b = 3 * (1 - t) * t * t + t ** 3;
  return sP.x * a + cP.x * b;
}

/** Interpolate the drawn x of a flattened path at a given y. */
function xAtY(points: { x: number; y: number }[], y: number): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      const dy = b.y - a.y;
      const f = Math.abs(dy) < 1e-9 ? 0 : (y - a.y) / dy;
      return a.x + (b.x - a.x) * f;
    }
  }
  return null;
}

const segDist = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * Distance from a point to the CENTERLINE path of the tube of branch (S -> C)
 * (stub, elbow polyline, or sampled cubic) - the containment measure that is
 * correct for both connector modes, unlike x-at-y for horizontal elbow bars.
 */
function distToTube(
  pos: ReturnType<typeof layout>["positions"],
  S: SpeciesNode | null,
  C: SpeciesNode,
  p: { x: number; y: number },
  curved: boolean,
): number {
  const cP = pos.species.get(C.id)!;
  if (!S) return Math.abs(p.x - cP.x);
  const sP = pos.species.get(S.id)!;
  if (cP.y - sP.y <= 1e-6) return Math.abs(p.x - cP.x);
  if (!curved) {
    const turn = { x: cP.x, y: sP.y };
    return Math.min(segDist(p, sP, turn), segDist(p, turn, cP));
  }
  const ym = (sP.y + cP.y) / 2;
  let best = Infinity;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const mt = 1 - t;
    const q = {
      x: mt ** 3 * sP.x + 3 * mt * mt * t * sP.x + 3 * mt * t * t * cP.x + t ** 3 * cP.x,
      y: mt ** 3 * sP.y + 3 * mt * mt * t * ym + 3 * mt * t * t * ym + t ** 3 * cP.y,
    };
    best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}

describe("routedGeneEdge follows the species tubes", () => {
  const cases: { name: string; xml: string }[] = [
    { name: "all-events fixture", xml: allEventsXml },
    { name: "compare outcome B", xml: compareBXml },
  ];

  for (const { name, xml } of cases) {
    for (const opts of [
      { label: "defaults" },
      { label: "tall levels + wide gaps", levelHeight: 220, speciesGap: 90 },
      { label: "flat levels + narrow gaps", levelHeight: 40, speciesGap: 8 },
    ]) {
      it(`${name}: edges visit every fork (${opts.label})`, () => {
        const recon = parseReconciliation(xml, "sample");
        const result = layout(recon, opts, undefined, new Set(), true);
        const { species } = recon;
        const pos = result.positions;

        for (const tree of recon.geneTrees) {
          for (const g of tree.nodes) {
            for (const c of g.children) {
              // A transfer arrival's tree edge is dropped at render time; the
              // arc replaces it. Skip those exactly like renderGeneEdges.
              const arrival = c.events.some((e) => e.type === "transferBack");
              const donor =
                g.endEvent.type === "branchingOut" || g.endEvent.type === "bifurcationOut";
              if (arrival && donor) continue;

              const routed = routedGeneEdge(species, pos, g, c, true);
              const tag = (n: typeof g): string =>
                `${n.name || n.id}@${n.speciesId}(y=${pos.gene.get(n.id)!.y.toFixed(1)},ev=${n.endEvent.type})`;
              const label = `edge ${tag(g)} -> ${tag(c)}`;
              expect(routed, `${label} should route`).not.toBeNull();
              const r = routed!;
              const gp = pos.gene.get(g.id)!;
              const cp = pos.gene.get(c.id)!;
              expect(r.start.x, `${label} start x`).toBeCloseTo(gp.x, 6);
              expect(r.start.y, `${label} start y`).toBeCloseTo(gp.y, 6);

              // End on the child position. The bisection that locates sub-curve
              // parameters is 24 iterations deep, so a few 1e-6 px of drift
              // are expected; anything coarser is a real routing error.
              const flat = flatten(r.start, r.segs);
              const last = flat.points[flat.points.length - 1]!;
              expect(last.x, `${label} end x`).toBeCloseTo(cp.x, 3);
              expect(last.y, `${label} end y`).toBeCloseTo(cp.y, 3);

              // Pass through every species fork the edge actually crosses:
              // a fork on the chain counts only when it sits at or above the
              // child gene (an in-branch child stops before its own species
              // node, so that fork is not on the drawn path).
              const sg = species.byName.get(g.speciesId)!;
              const forks: { x: number; y: number }[] = [];
              let curS: SpeciesNode | null | undefined = species.byName.get(c.speciesId);
              while (curS && curS.id !== sg.id) {
                const sp = pos.species.get(curS.id)!;
                if (sp.y <= cp.y + 0.5) forks.push({ x: sp.x, y: sp.y });
                curS = curS.parent;
              }
              for (const f of forks) {
                const hit = flat.points.some(
                  (p) => Math.hypot(p.x - f.x, p.y - f.y) < 0.5,
                );
                expect(hit, `edge ${g.id}->${c.id} misses fork at (${f.x},${f.y})`).toBe(true);
              }

              // Tube containment - the property fork-segmented routing was
              // introduced for (7f645f8) and which the duplication divergence
              // must NOT break. A same-species edge has no intermediate fork to
              // constrain it, so EVERY point of its drawn path must stay inside
              // the host species' incoming tube; a cross-species edge must stay
              // inside the parent species' incoming tube up to the parent fork.
              const forkY = pos.species.get(sg.id)!.y;
              const half = pos.species.get(sg.id)!.width / 2 + 0.75;
              const inParentTube = (p: { x: number; y: number }): void => {
                const cx = centerlineX(pos, sg.parent ?? null, sg, p.y);
                expect(
                  Math.abs(p.x - cx),
                  `edge ${g.id}->${c.id} leaves the tube of ${sg.name} at ` +
                    `y=${p.y.toFixed(1)} (x=${p.x.toFixed(1)}, cx=${cx.toFixed(1)})`,
                ).toBeLessThanOrEqual(half);
              };
              for (const p of flat.points) {
                if (c.speciesId === g.speciesId || p.y <= forkY + 0.5) inParentTube(p);
              }
            }
          }
        }
      });
    }
  }
});

/**
 * A DUPLICATION must render as a real branch point (issues 12 / 13): the two
 * child lineages visibly diverge from the duplication's own glyph, NOT from
 * the species fork below it - while every point stays inside the species
 * tube. Before the fix both child edges shared one centerline run and only
 * separated at the fork (compare outcome B looked exactly like the
 * speciation result) or at the tip baseline (nested gene→symbiont result).
 */
describe("a duplication's child edges diverge AT the duplication", () => {
  for (const { name, xml } of [
    { name: "compare outcome B (duplication@Mammalia/Sauropsida, cross-species copies)", xml: compareBXml },
    { name: "nested gene→symbiont (duplication@S_A, same-species copies)", xml: nestedGeneXml },
  ]) {
    for (const curved of [true, false]) {
      it(`${name} (${curved ? "curved" : "elbow"})`, () => {
        const recon = parseReconciliation(xml, "sample");
        const result = layout(recon, undefined, undefined, new Set(), curved);
        const { species } = recon;
        const pos = result.positions;

        const dups = recon.geneTrees
          .flatMap((t) => t.nodes)
          .filter((g) => g.endEvent.type === "duplication" && g.children.length === 2);
        expect(dups.length).toBeGreaterThan(0);

        for (const g of dups) {
          const gp = pos.gene.get(g.id)!;
          const sg = species.byName.get(g.speciesId)!;
          const forkY = pos.species.get(sg.id)!.y;
          const paths = g.children.map((c) => {
            const r = routedGeneEdge(species, pos, g, c, curved);
            expect(r, `dup ${g.name} -> ${c.name} should route`).not.toBeNull();
            return flatten(r!.start, r!.segs).points;
          });
          const [p1, p2] = paths as [
            { x: number; y: number }[],
            { x: number; y: number }[],
          ];

          // The split starts AT the square: already within the first 15% of
          // the vertical run to the lower of the two forks/targets the two
          // child lineages are measurably apart (>= 2 px laterally).
          const run = Math.min(...g.children.map((c) => pos.gene.get(c.id)!.y)) - gp.y;
          expect(run, "duplication must sit above its children").toBeGreaterThan(1);
          for (const frac of [0.08, 0.15]) {
            const y = gp.y + frac * run;
            const x1 = xAtY(p1, y);
            const x2 = xAtY(p2, y);
            expect(x1, `path 1 crosses y=${y.toFixed(1)}`).not.toBeNull();
            expect(x2, `path 2 crosses y=${y.toFixed(1)}`).not.toBeNull();
            const d = Math.abs(x1! - x2!);
            expect(
              d,
              `child edges of dup ${g.name} only ${d.toFixed(2)}px apart at ${Math.round(frac * 100)}% of the run`,
            ).toBeGreaterThanOrEqual(2);
          }

          // And they differ all the way DOWN to the parent species fork
          // (cross-species) or the tip baseline (same species): at a y just
          // above it the two lines are still apart, so the duplication does
          // not collapse back into the speciation picture at the fork.
          const bottomY = Math.min(...g.children.map((c) => pos.gene.get(c.id)!.y));
          const probe = bottomY - Math.max(1, 0.05 * (bottomY - gp.y));
          if (probe > gp.y) {
            const x1 = xAtY(p1, probe);
            const x2 = xAtY(p2, probe);
            if (x1 !== null && x2 !== null) {
              expect(Math.abs(x1 - x2), "child edges must still differ near the bottom of the parent branch").toBeGreaterThanOrEqual(2);
            }
          }

          // No cutting outside the tube: above the parent species fork every
          // point lies within half a tube of the parent's incoming tube
          // centerline; below it (cross-species copies) the point is measured
          // against the first downstream branch's tube, whose horizontal bar
          // at the fork level is part of the tube itself.
          const half = pos.species.get(sg.id)!.width / 2 + 0.75;
          g.children.forEach((c, k) => {
            const pts = paths[k]!;
            const sameSp = c.speciesId === g.speciesId;
            let down: SpeciesNode | null = null;
            if (!sameSp) {
              let curS: SpeciesNode | null | undefined = species.byName.get(c.speciesId);
              while (curS && curS.parent && curS.parent.id !== sg.id) curS = curS.parent;
              down = curS ?? null;
            }
            for (const p of pts) {
              if (sameSp || p.y < forkY - 0.5 || !down) {
                expect(
                  distToTube(pos, sg.parent ?? null, sg, p, curved),
                  `dup ${g.name} -> ${c.name} leaves the ${sg.name} tube at y=${p.y.toFixed(1)}`,
                ).toBeLessThanOrEqual(half);
              } else {
                const downY = pos.species.get(down.id)!.y;
                if (p.y <= downY + 0.5) {
                  expect(
                    distToTube(pos, sg, down, p, curved),
                    `dup ${g.name} -> ${c.name} leaves the ${down.name} tube at y=${p.y.toFixed(1)}`,
                  ).toBeLessThanOrEqual(half);
                }
              }
            }
          });
        }
      });
    }
  }
});
