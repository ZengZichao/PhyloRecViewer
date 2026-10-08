/**
 * PhyloRecViewer-手稿正文-图2.ts
 *
 * 论文图 2 面板 (a) 的数据源：把软件自带的 9999.nhx.xml 参考谱系推送过
 * PhyloRecViewer 自己的 parser -> layout -> Scene -> renderToStaticMarkup 路径，
 * 输出 SVG（外加 computeStats() 的统计卡片 JSON）。
 *
 * 这个脚本住在软件仓库的 `figures/` 里（ISSUE-053/058/062：生成投稿图版的代码
 * 属于"支撑论文的 software code"，必须随软件一起公开、一起归档）。它存在的理由
 * 是投稿图版的印刷要求（把物种名放大到 175 mm 图宽下仍 >= 7 pt），但它需要的东西—
 * 被渲染的树、渲染管线、统计口径—都直接引用仓库自身，不复制：import 路径就是
 * `figures/../src/…`，fixture 是 `figures/../src/parser/__fixtures__/9999.nhx.xml`。
 *
 * 依赖解析：本脚本在仓库内，react / react-dom 由 Node 向上查找到仓库根的
 * `node_modules/`（`npm install` 的产物），不需要任何指向仓库外的符号链接。
 *
 * 运行（在仓库根，即 PhyloRecViewer-项目代码/）：
 *     node node_modules/vite-node/vite-node.mjs figures/PhyloRecViewer-手稿正文-图2.ts
 * 印刷版（图 2 用的那组参数）：
 *     PR_OUT=figure2-app-print.svg PR_GENE_THICKNESS=9 PR_SYMBOL_SIZE=18 \
 *     PR_SPECIES_FILL='#e9e9ee' PR_SPECIES_STROKE='#d9d9e0' \
 *     node node_modules/vite-node/vite-node.mjs figures/PhyloRecViewer-手稿正文-图2.ts
 * 输出: figures/_build/<PR_OUT>（默认 figure2-app-legible.svg）
 *       + figures/_build/figure2-stats.json
 * `vite-node` 是 vitest 的依赖，随 `npm install` 一起落地；仓库根的 `vite.config.ts`
 * 提供 @vitejs/plugin-react，本脚本才能 import Scene.tsx。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseReconciliation } from "../src/parser/formats";
import { layout } from "../src/layout";
import { defaultLayoutOptions } from "../src/layout/options";
import { defaultRenderOptions } from "../src/render/options";
import { lightTheme } from "../src/render/theme";
import { Scene } from "../src/render/Scene";
import { computeStats } from "../src/analysis/stats";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The repository root: `figures/` sits directly inside it, so the application's
 *  own sources and fixtures are one level up — no sibling-directory assumption
 *  and no out-of-repo symlink (ISSUE-062). */
const APP = resolve(HERE, "..");
/** Generated inputs for Fig. 2 live beside this script, under `figures/_build/`.
 *  PR_BUILD_DIR relocates it for a scratch run. */
const OUT = process.env.PR_BUILD_DIR ? resolve(process.env.PR_BUILD_DIR) : resolve(HERE, "_build");
mkdirSync(OUT, { recursive: true });

/** SVG units needed so the tip names print >= 7 pt at a 175 mm figure width.
 *  printed_pt = size * (6.89 in / canvas_width_units) * 72  ->  size ~= 56 for a
 *  ~3850-unit canvas. levelHeight is raised so the rotated names fit vertically
 *  without touching the tree (height only; width, hence printed_pt, unchanged). */
const LABEL_SIZE = Number(process.env.PR_LABEL_SIZE ?? 56);
const LEVEL_HEIGHT = Number(process.env.PR_LEVEL_HEIGHT ?? 150);

/** Print-weighted glyph scale.
 *
 *  The interactive defaults (geneThickness 3.6, symbolSize 7) are tuned for a
 *  canvas the user zooms into. Fig. 2 panel (a) reduces the same ~3850-unit
 *  canvas to ~6.1 in, i.e. 0.114 pt per unit, so those defaults draw the
 *  reconciled gene tree at 0.4 pt and the event glyphs at well under 1 pt —
 *  the reconciliation, which is the subject of the figure, disappears against
 *  the 34-unit species tubes. These values put the gene edges at ~1 pt and the
 *  event glyphs at ~2 pt, which is where the app's own sliders can be set; the
 *  geometry, topology and colours are untouched. */
const GENE_THICKNESS = Number(process.env.PR_GENE_THICKNESS ?? 3.6);
const SYMBOL_SIZE = Number(process.env.PR_SYMBOL_SIZE ?? 7);

/** Tube tone for print. #f4f4f5 measures 0.96 reflectance and drops out of a
 *  reproduced page; the pair below keeps the tubes clearly lighter than the
 *  gene tree while surviving 400 lpi halftone. */
const SPECIES_FILL = process.env.PR_SPECIES_FILL ?? lightTheme.speciesFill;
const SPECIES_STROKE = process.env.PR_SPECIES_STROKE ?? lightTheme.speciesStroke;
const OUT_NAME = process.env.PR_OUT ?? "figure2-app-legible.svg";

const xml = readFileSync(resolve(APP, "src/parser/__fixtures__/9999.nhx.xml"), "utf8");
const recon = parseReconciliation(xml, "9999.nhx.xml");
const res = layout(recon, {
  ...defaultLayoutOptions,
  levelHeight: LEVEL_HEIGHT,
  // the reservation for rotated tip labels scales with the label size; a print
  // render that raises the font without raising this clips the longest names
  labelFontPx: LABEL_SIZE,
});
const options = {
  ...defaultRenderOptions,
  // Fig. 2 tube mode: orthogonal ("横平竖直", elbowV + butt/miter) by default;
  // set PR_CURVED=1 to emit the smooth-curve variant for comparison.
  curved: process.env.PR_CURVED === "1",
  geneThickness: GENE_THICKNESS,
  symbolSize: SYMBOL_SIZE,
  // F-04-2: the app's gene-name labels (geneTipLabelStyle 11u, geneInternalLabelStyle
  // 10u) stay at screen pixels and, on a 3850-unit canvas printed to 4.95 in, reduce to
  // ~1 pt; up to six identical long binomials stack in one species tube and overprint into
  // an unreadable blob.  Scaling them to the species label (56u) still lands at ~5 pt (below
  // the floor) and the strings are far too long to fit a tube column, so for THIS figure we
  // turn gene labels off through the application's own documented switch (RenderOptions.
  // showGeneLabels) rather than emit sub-floor text.  The reconciled gene tree and its event
  // glyphs (the subject of panel a) are unaffected; only their name strings are suppressed.
  showGeneLabels: false,
  speciesLabelStyle: { ...defaultRenderOptions.speciesLabelStyle, size: LABEL_SIZE },
};
const theme = {
  ...lightTheme,
  speciesFill: SPECIES_FILL,
  speciesStroke: SPECIES_STROKE,
};
const svg = renderToStaticMarkup(
  createElement(Scene, {
    result: res,
    theme,
    options,
    highlight: null,
    interactive: false,
    detail: "full",
    showBackground: true,
  }),
);
const file = resolve(OUT, OUT_NAME);
writeFileSync(file, svg);

/** The count card in the figure's right column quotes the application's own
 *  computeStats(), so the numbers cannot drift from what the app displays. */
const stats = computeStats(recon);
const dist = {
  ...stats.total,
  transfer: stats.total.transfer,
  species: recon.species.nodes.filter((n) => n.children.length === 0).length,
  geneNodes: recon.geneTrees.reduce((n, t) => n + t.nodes.length, 0),
  families: recon.geneTrees.length,
  transferPairs: stats.transferMatrix.length,
};
const statsFile = resolve(OUT, "figure2-stats.json");
writeFileSync(statsFile, JSON.stringify(dist, null, 2));

console.log(
  `wrote ${file} (${svg.length} bytes) canvas ${res.width}x${res.height} units, ` +
  `label ${LABEL_SIZE}u, gene ${GENE_THICKNESS}u, symbol ${SYMBOL_SIZE}u, ` +
  `tubes ${SPECIES_FILL}/${SPECIES_STROKE}`,
);
console.log(`wrote ${statsFile}: ${JSON.stringify(dist)}`);
