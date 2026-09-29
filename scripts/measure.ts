/**
 * Benchmark measurements for the bundled and synthetic datasets.
 *
 * Run from the project root:  npm run measure
 *
 * 1. Reports species / gene-node counts of the bundled datasets using the
 *    application's own parser (single source of truth for the node counts the
 *    documentation quotes).
 * 2. Benches parse / layout / full-scene SVG serialization on the bundled
 *    datasets and on deterministically generated synthetic reconciliations of
 *    increasing size (median [IQR] of 5 runs after one warm-up), writing
 *    _build/benchmarks-datasets.csv and _build/benchmarks.csv.
 *
 * This script emits data only. Anything that turns those numbers into figures
 * for release lives outside the repository.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseReconciliation } from "../src/parser/formats";
import { layout } from "../src/layout";
import { Scene } from "../src/render/Scene";
import { lightTheme } from "../src/render/theme";
import { defaultRenderOptions } from "../src/render/options";
import { computeStats } from "../src/analysis/stats";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "_build");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface Timing {
  parse: number;
  layout: number;
  svg: number;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function summarize(samples: Timing[]): string {
  const pick = (k: keyof Timing): number[] =>
    samples.map((s) => s[k]).sort((a, b) => a - b);
  const fmt = (k: keyof Timing): string => {
    const v = pick(k);
    const med = quantile(v, 0.5);
    const q1 = quantile(v, 0.25);
    const q3 = quantile(v, 0.75);
    return `${med.toFixed(1)} [${q1.toFixed(1)}–${q3.toFixed(1)}]`;
  };
  return `parse ${fmt("parse")} | layout ${fmt("layout")} | svg ${fmt("svg")}`;
}

function bench(label: string, text: string, runs = 5): Timing[] {
  const samples: Timing[] = [];
  for (let i = 0; i <= runs; i++) {
    const t0 = performance.now();
    const recon = parseReconciliation(text, label);
    const t1 = performance.now();
    const res = layout(recon);
    const t2 = performance.now();
    renderToStaticMarkup(
      createElement(Scene, {
        result: res,
        theme: lightTheme,
        options: defaultRenderOptions,
        highlight: null,
        interactive: false,
        detail: "full",
        showBackground: true,
      }),
    );
    const t3 = performance.now();
    if (i > 0) samples.push({ parse: t1 - t0, layout: t2 - t1, svg: t3 - t2 });
  }
  console.log(
    `${label.padEnd(28)} ${summarize(samples)}  (${runs} runs + warm-up)`,
  );
  return samples;
}

// ---------------------------------------------------------------------------
// 1. dataset inventory (via the application's parser)
// ---------------------------------------------------------------------------

console.log("== bundled datasets (application parser) ==");
const realFiles: Record<string, string> = {
  "showcase.recphyloxml": readFileSync(
    resolve(ROOT, "src/samples/showcase.recphyloxml"),
    "utf8",
  ),
  "nested-gene-symbiont": readFileSync(
    resolve(ROOT, "src/samples/nested-gene-symbiont.recphyloxml"),
    "utf8",
  ),
  "nested-symbiont-host": readFileSync(
    resolve(ROOT, "src/samples/nested-symbiont-host.recphyloxml"),
    "utf8",
  ),
  "compare-tool-a": readFileSync(
    resolve(ROOT, "src/samples/compare-tool-a.recphyloxml"),
    "utf8",
  ),
  "compare-tool-b": readFileSync(
    resolve(ROOT, "src/samples/compare-tool-b.recphyloxml"),
    "utf8",
  ),
  "9999.nhx": readFileSync(
    resolve(ROOT, "src/parser/__fixtures__/9999.nhx.xml"),
    "utf8",
  ),
};

const describeRecon = (label: string, text: string): void => {
  const recon = parseReconciliation(text, label);
  const leaves = recon.species.nodes.filter((n) => n.children.length === 0).length;
  const geneNodes = recon.geneTrees.reduce((n, t) => n + t.nodes.length, 0);
  const stats = computeStats(recon);
  console.log(
    `${label.padEnd(28)} species ${String(leaves).padStart(3)} | gene nodes ${String(
      geneNodes,
    ).padStart(3)} | families ${recon.geneTrees.length} | transfers ${stats.transferMatrix.reduce(
      (n, p) => n + p.count,
      0,
    )}`,
  );
};
for (const [label, text] of Object.entries(realFiles)) describeRecon(label, text);

// ---------------------------------------------------------------------------
// 2. benchmarks: bundled datasets + synthetic sweep
// ---------------------------------------------------------------------------

console.log("\n== benchmarks: bundled datasets (ms, median [IQR] of 5) ==");
// The raw per-dataset timings are written to their own CSV (from this same run)
// so the benchmark tables under data/ carry them; the synthetic sweep goes to
// benchmarks.csv, which is what the scaling analysis reads.
const datasetHeader =
  "dataset,nodes,parse_med_ms,parse_q1,parse_q3,layout_med_ms,layout_q1,layout_q3,svg_med_ms,svg_q1,svg_q3";
const datasetRows: string[] = [datasetHeader];
for (const [label, text] of Object.entries(realFiles)) {
  const nodes = parseReconciliation(text, label).geneTrees.reduce(
    (s, t) => s + t.nodes.length,
    0,
  );
  const samples = bench(label, text);
  const cell = (k: keyof Timing): string => {
    const v = samples.map((s) => s[k]).sort((a, b) => a - b);
    return `${quantile(v, 0.5).toFixed(2)},${quantile(v, 0.25).toFixed(2)},${quantile(
      v,
      0.75,
    ).toFixed(2)}`;
  };
  datasetRows.push(`${label},${nodes},${cell("parse")},${cell("layout")},${cell("svg")}`);
}
writeFileSync(resolve(OUT, "benchmarks-datasets.csv"), datasetRows.join("\n") + "\n");
console.log(`\nwrote ${resolve(OUT, "benchmarks-datasets.csv")}`);

/** Deterministic PRNG so every run of this script measures the same inputs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSpeciesTree(nLeaves: number): { xml: string; names: string[] } {
  const names = Array.from({ length: nLeaves }, (_, i) => `Species${i + 1}`);
  let next = 0;
  const build = (depth: number): string => {
    if (depth === 0 || next >= nLeaves) {
      const name = names[next++];
      return `<clade><name>${name}</name></clade>`;
    }
    // Balanced binary: two child subtrees per level.
    const a = build(depth - 1);
    const b = next < nLeaves ? build(depth - 1) : "";
    return `<clade><name>I${next}</name>${a}${b}</clade>`;
  };
  const depth = Math.ceil(Math.log2(nLeaves));
  return { xml: `<phylogeny><clade>${build(depth)}</clade></phylogeny>`, names };
}

function makeRecPhyloxml(nGeneNodes: number, seed = 42): string {
  const rng = mulberry32(seed);
  const sp = makeSpeciesTree(32);
  let geneId = 0;

  const events = (kind: string, species: string): string =>
    `<eventsRec><${kind} speciesLocation="${species}"/></eventsRec>`;

  // Recursive builder that spends `budget` clades per call. The count is NOT
  // exactly the requested size: a branchingOut donor writes one extra wrapper
  // clade (`g<id>t`, the transferBack arrival) that is not charged against the
  // budget, so a requested 50 arrives as 58 and 20,000 as 23,685 - 14-18%
  // larger. The tables under data/ report the MEASURED node counts, so what is
  // documented always matches what was actually generated.
  const gene = (spIdx: number, budget: number): string => {
    const id = geneId++;
    // Species index doubles with depth against a FIXED 32-tip tree, so past
    // depth 5 every node is clamped onto the last species name. The sweep's
    // gene:species ratio therefore grows to ~740:1, which no reconciled data set
    // bundled with the application approaches (the reference case is 23:63);
    // the documented numbers state this limit, not that the sweep is generic.
    const spName = sp.names[Math.min(spIdx, sp.names.length - 1)];
    if (budget <= 1) {
      // Terminal: extant leaf or loss.
      if (rng() < 0.6) {
        return `<clade><name>g${id}</name>${events(
          "leaf",
          spName,
        ).replace("/>", ` geneName="GEN${id}"/>`)}</clade>`;
      }
      return `<clade><name>g${id}</name>${events("loss", spName)}</clade>`;
    }
    const r = rng();
    const b1 = Math.max(1, Math.floor((budget - 1) * 0.45));
    const b2 = budget - 1 - b1;
    if (r < 0.68) {
      const a = gene(Math.min(spIdx * 2 + 1, sp.names.length - 1), b1);
      const b = gene(Math.min(spIdx * 2 + 2, sp.names.length - 1), b2);
      return `<clade><name>g${id}</name>${events("speciation", spName)}${a}${b}</clade>`;
    }
    if (r < 0.9) {
      const a = gene(spIdx, b1);
      const b = gene(spIdx, b2);
      return `<clade><name>g${id}</name>${events("duplication", spName)}${a}${b}</clade>`;
    }
    // branchingOut donor: one child transfers into another species.
    const dest = (spIdx + 7) % sp.names.length;
    const a = `<clade><name>g${id}t</name><eventsRec><transferBack destinationSpecies="${
      sp.names[dest]
    }"/></eventsRec>${gene(dest, Math.max(1, b1))}</clade>`;
    const b = gene(spIdx, Math.max(1, b2));
    return `<clade><name>g${id}</name>${events("branchingOut", spName)}${a}${b}</clade>`;
  };

  const geneTree = gene(0, nGeneNodes);
  const xml = `<recPhylo><spTree>${sp.xml}</spTree><recGeneTree><phylogeny rooted="true">${geneTree}</phylogeny></recGeneTree></recPhylo>`;
  return xml;
}

console.log("\n== benchmarks: synthetic sweep (ms, median [IQR] of 5) ==");
const sweepSizes = [50, 100, 250, 500, 1000, 2000, 4000, 10000, 20000];
const sweepRows: string[] = [
  "nodes,parse_med_ms,parse_q1,parse_q3,layout_med_ms,layout_q1,layout_q3,svg_med_ms,svg_q1,svg_q3",
];
for (const n of sweepSizes) {
  const xml = makeRecPhyloxml(n);
  const probe = parseReconciliation(xml, `sweep-${n}`);
  const nodes = probe.geneTrees.reduce((s, t) => s + t.nodes.length, 0);
  const samples = bench(`synthetic-${n} (actual ${nodes})`, xml);
  const row = (k: keyof Timing): string => {
    const v = samples.map((s) => s[k]).sort((a, b) => a - b);
    return `${quantile(v, 0.5).toFixed(2)},${quantile(v, 0.25).toFixed(2)},${quantile(
      v,
      0.75,
    ).toFixed(2)}`;
  };
  sweepRows.push(`${nodes},${row("parse")},${row("layout")},${row("svg")}`);
}
writeFileSync(resolve(OUT, "benchmarks.csv"), sweepRows.join("\n") + "\n");
console.log(`\nwrote ${resolve(OUT, "benchmarks.csv")}`);
