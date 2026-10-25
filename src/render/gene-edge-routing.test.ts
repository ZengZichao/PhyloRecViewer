import { describe, expect, it } from "vitest";
import { layout } from "../layout";
import type { SpeciesNode } from "../model/types";
import { parseReconciliation } from "../parser/formats";
import { routedGeneEdge } from "./geometry";
import allEventsXml from "../samples/all-events.recphyloxml?raw";
import compareBXml from "../samples/compare-tool-b.recphyloxml?raw";

/**
 * Gene edges must follow the species tubes: every routed edge has to pass
 * through each species fork between its endpoints and start/end exactly on
 * the gene node positions. A regression to a single point-to-point connector
 * would cut across forks and fail the fork-visiting assertion.
 */

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

describe("routedGeneEdge follows the species tubes", () => {
  const cases: { name: string; xml: string }[] = [
    { name: "all-events sample", xml: allEventsXml },
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
            }
          }
        }
      });
    }
  }
});
