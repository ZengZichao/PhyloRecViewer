# Changelog

All notable changes to PhyloRecViewer are documented in this file. Released
versions are archived on Zenodo: the **concept DOI**
(`10.5281/zenodo.23053317`) always resolves to the newest deposit, and each
archived version carries its own immutable **version DOI** — v0.1.0 is
`10.5281/zenodo.23053318`; the version DOI of each later release is recorded
here once its deposit is published.

## [Unreleased]

A round of fixes against the published site, covering the empty-state hub, the
analysis panel, located-node visibility, duplication rendering and PDF export.

### Added

- **Stale-build chunk recovery** (`src/platform/preloadRecovery.ts`): a
  `vite:preloadError` listener reloads the page once per session when a
  lazily-imported chunk cannot be fetched, so a tab left open across a deploy
  lands back on one consistent build generation instead of degrading. Installed
  from the entry module rather than an inline `<script>`, because the desktop
  build's CSP allows no `script-src 'unsafe-inline'`.

### Changed

- **Located nodes get an outline, not just a pan** (`src/render/Scene.tsx`,
  `src/app/Canvas.tsx`): clicking a 匹配结果 row, a 定位第一处 finding or any
  other locate target now draws a bold ring on the node in the canvas, because
  dimming everything else left the located node unfindable. A background click
  clears it. The legend gained a key for it.
- **Empty-state hub** (`src/app/EmptyState.tsx`, `src/styles.css`): the sample
  choices and the action buttons are now equal-width, centered groups, and the
  open-a-file instructions were condensed into one line plus a compact
  three-step strip (the drag instruction used to appear twice).
- **Settings is a menu-bar destination** (`src/app/MenuBar.tsx`): 设置 sits
  beside 视图 instead of being buried at the bottom of its dropdown, and its
  option rows are one uniform grid.
- **Export menu layout** (`src/app/MenuBar.tsx`): formats, clipboard actions,
  DPI options and background choices are grouped into even chip rows instead of
  a mix of full-width menu rows and ragged inline controls.
- **Legend event key** (`src/app/Legend.tsx`): ten marks, laid out as two even
  rows of five in horizontal mode instead of a wrapped 6 + 4.
- **Every split pane carries the editing toolbar** (`src/app/Canvas.tsx`):
  undo, redo and the analysis-panel toggle are no longer restricted to the
  primary pane, so the lower level of a nested or compare view is not inert.
- The `all-events` bundled sample was removed from the catalog; its XML is kept
  as an inline test fixture so the every-event-type routing and glyph coverage
  is unchanged.

### Fixed

- **Data-check rows printed a literal `\u2713`** (`src/app/RightPanel.tsx`):
  backslash escapes are a JavaScript string-literal feature and are not decoded
  in JSX text children, so the tick rendered as six characters. Same class of
  bug fixed for the `\u2026` overflow marker.
- **QC report CSV was header-only for a clean document**
  (`src/app/RightPanel.tsx`): the report emitted one row per *fired* issue, so
  a document that passes every check exported nothing. It now writes one row
  per check for every loaded reconciliation level (a new `tree` column), which
  also means the nested level is finally checked at all.
- **PDF export failed with "Failed to fetch dynamically imported module"**
  (`src/export/exporters.ts`): both PDF paths awaited the same lazily-fetched
  jsPDF chunk, so a chunk renamed by a later deploy made the vector->raster
  fallback reject on the identical missing file and the export died outright
  instead of degrading. jsPDF is now a static import (the raster fallback needs
  zero network requests, and no `jspdf` chunk is emitted at all) and the
  svg2pdf.js converter is fetched through a guarded loader that reports
  unavailability rather than throwing.
- **A duplication did not render as a branch point**
  (`src/layout/geneEmbed.ts`, `src/render/geometry.ts`): the two copies of a
  duplication only separated at the species fork below it — or at the tip
  baseline — so 对比示例 result B looked identical to result A despite calling
  both nodes duplications, and the nested sample's copies split at the leaves.
  The duplication node is now centered between its copies' lanes and each child
  edge diverges from the duplication glyph itself, while every point still
  stays inside its host species tube (the property the tube-routing fix
  `7f645f8` introduced is preserved).

## 0.2.0 (2026-11-01)

A large review round: comparison, export, session/autosave and analysis
behaviour were reworked, and the documentation was brought back in step with
the code.

### Added

- **recPhyloXML export** (`src/export/recPhyloXmlExport.ts`): serializes a
  reconciliation back to recPhyloXML — species tree with branch lengths,
  gene-tree names, every event in schema order, multiple transferBack arrivals
  per node, timeSlice, confidence and gene branch lengths — a lossless
  round-trip pinned by round-trip tests. Exposed through the headless CLI
  (`npm run cli -- export --out <file>.recphyloxml`).
- **Headless CLI** (`npm run cli`, `scripts/cli.ts`): `stats` (CSV), `check`
  (JSON consistency report with meaningful exit codes) and `export`
  (SVG / interactive HTML / recPhyloXML / NHX), all rebuilt deterministically
  from a saved session file. Fully offline; no PNG (rasterization needs a
  browser canvas).
- **Three-dimensional comparison** (`src/analysis/compare.ts`): nodes are now
  compared on terminal event type, species mapping AND transfer
  donor/recipient, so a result that merely moves a gene to another species can
  no longer score a false 100%. Agreement % is computed against the union of
  comparable nodes; the compare status bar shows the species-mapping
  agreement, matched count and the only-in-A / only-in-B breakdown.
- **Link views**: a checkbox in the compare status bar keeps the two panes'
  zoom/pan in sync; unchecked, each pane navigates independently.
- **Split-orientation toggle** for nested/compare views: panes stack
  vertically by default; a ⇕/⇔ button switches to side-by-side and the choice
  is remembered.
- **Node inspector**: clicking a gene node (or a transfer arc) opens a detail
  card — species, family, donor/recipient, timeSlice, confidence/support,
  branch length, parent/children and the user annotation — with locate,
  annotate and copy-details actions.
- **Support values**: clade-level `<confidence>` elements (recPhyloXML), NHX
  `B=` tags and purely numeric internal Newick labels are read as statistical
  support; the "Support values" toggle shows event confidence and node/clade
  support; node tooltips carry timeSlice, confidence/support, branch length
  and every transfer arrival.
- **Session schema v2**: the compare pane's own mirror/collapse/colour state,
  per-node label renames (`labelOverridesById`), the `onlyMatches` flag and
  per-tab layout/style options are now stored. Files written by a newer app
  version are refused, as before.
- **Autosave hardening**: startup now **asks** "Restore last workspace? /
  Start blank" instead of silently restoring; `beforeunload` / `pagehide`
  flush prevents losing the last second of edits on a quick close; a snapshot
  that fails to restore is quarantined (kept and reported) instead of deleted.
- **Minimap keyboard support**: arrow keys pan the viewport, `Enter`/`Space`
  re-centres on the drawing; the minimap sits in the canvas's top-right
  corner.
- Input hardening: non-UTF-8 files (NUL bytes, mismatched XML declaration) are
  refused with a targeted message; recPhyloXML files declaring a DTD are
  refused (entity-expansion attack vector); a foreign XML namespace produces a
  warning.
- **Data health panel**: parser warnings (including the previously DISCARDED
  nested/compare layer warnings) are merged into the Checks tab with severity
  chips, click-to-locate on flagged nodes and a QC CSV export; the menu-bar
  warning badge became a keyboard-accessible button.
- **File menu restructured**: New workspace / Open… / Paste tree from
  clipboard / Load species tree (Newick)… / Close tab (`Ctrl+W`) / Save session
  as… / Open session…; Help menu gains an About dialog (version, citation,
  copy-diagnostics).
- **Export menu extended**: recPhyloXML item, NHX loss-disclosure dialog (with
  a one-click recPhyloXML alternative), Screen 2× / 300 / 600 / 1200 / custom
  DPI with an output-pixel estimate, transparent/white/theme background,
  Copy SVG / Copy PNG to the clipboard; exported PNGs now carry a pHYs chunk
  with their real DPI, and SVG/HTML/PDF carry a provenance metadata block.
- **Node/branch renames are per node**: renaming one of several same-named
  labels now offers "this node" (default) vs "all N same-named labels".
- **Presentation mode** (`P`): collapses both panels for a clean figure view;
  `Esc` exits.
- **Compare status bar**: one bottom bar replacing three overlapping overlays —
  agreement %, species agreement, matched / only-A / only-B counts, Link views,
  diff visibility and split-orientation toggles.
- **Paired diff table**: the Diff tab lists matched pairs with both sides'
  event/species/status, an only-differences filter and CSV export.
- **Search upgrades**: invalid regexes are reported inline instead of silently
  degrading to substring matching; a results list (click to locate + inspect);
  the search scope covers annotation text, transfer donor/recipient species,
  event types and time slices.
- **Dirty state rebuilt**: a per-document edit counter with a clean baseline —
  saving a session clears the dirty dot, restored documents start clean, and
  layout/style edits count as changes.
- **Keyboard & a11y**: species tubes are focusable (Enter mirrors), the
  interactive SVG uses role=group, roving tabindex survives viewport culling,
  menu items expose aria-checked, right-panel tabs get tab/tabpanel wiring,
  panel separators are keyboard-operable, error toasts use role=alert with a
  close button, and tables expose `scope`.
- **Desktop shell**: `.xml` / `.phyloxml` were removed from the default file
  associations (kept: `.recphyloxml` / `.recphylo` / `.nhx` / `.nwk` /
  `.newick`); the window title now names the open document.
- Tab bar: right-click menu (close / close others / close all / rename),
  drag-to-reorder, merged-document tooltip, and a working Delete-to-close.
- Batch rename shows a live match count and before→after previews before
  applying; "Reset all" is undoable; the first visit opens the layout controls.

### Changed

- **Default UI language is English** unless the system locale starts with
  `zh` (previously every non-English locale started Chinese).
- **Default PNG export DPI is 300** (was 600; the 600-floor forced every quick
  figure to be huge and pushed large drawings into the canvas-limit
  downgrade). The floor is now 72 (screen resolution).
- **NHX export dialect extended** (`src/export/newickExport.ts`): writes every
  transfer arrival (`TB=` for the first, `TB2=`…`TB9=` for further ones),
  `TS=` timeSlice, `CN=` event confidence, `B=` node support and the branch
  length both as the standard Newick `:length` and a redundant `BL=` tag;
  `S=` species tags are inferred for internal nodes from their ancestors.
  recPhyloXML is the lossless round-trip; NHX still loses the species tree
  itself, species branch lengths, gene-tree names and species never sampled by
  any gene tree.
- **Plain PhyloXML is (and stays) unsupported**: the app parses recPhyloXML
  content and NHX/Newick only. `.xml` / `.phyloxml` are treated as containers
  for recPhyloXML content; a `<phyloxml>` tree without a `<recPhylo>` root is
  refused with a "No <recPhylo> root element" error.
- **Statistics**: nodes are classified extant leaf / loss / internal (losses
  were previously folded into "internal") and listed tips-first, then losses,
  then internal events; the statistics CSV export uses stable English column
  names with a UTF-8 BOM and a provenance header, adds `transfer_arrivals`
  columns (separate from donor-side branchingOut/bifurcationOut), carries
  `donors` / `recipients` / `time_slice` / `confidence` / `branch_length` node
  columns, and reports unassigned nodes in an `(no species)` row.
- **Data checks grew from eleven to sixteen**: same-species transfers are
  reported under their own code; transfers into an ancestor species are
  flagged as errors; without timeSlice data the time-direction check reports
  "not assessable" instead of silently passing; new checks cover suspicious
  confidence scales (0–100 vs 0–1), negative/invalid branch lengths and
  vertical gene edges between unrelated clades.
- **Tab claim on open**: opening a file (drag & drop included) reuses the
  current tab only when it is blank or shows an *unmodified* bundled sample;
  a modified document always gets a new tab so existing work is kept.
- Multi-file merge: same-basename family names are disambiguated with a
  numbered suffix; species-tree topology mismatches between merged files are
  warned about in both directions (missing and extra branches).
- "Branch lengths" now explicitly affects the species tree only; "Align tips"
  flattens extant tips onto one baseline (overriding length-derived tip
  positions) — documented as a warning.
- Parser: `Infinity` branch lengths are treated as absent instead of poisoning
  layout coordinates; negative lengths are clamped to 0 for drawing.

### Fixed

- **First-launch freeze**: the onboarding tour's spotlight re-measurement ran
  in an infinite render loop the moment the tour was actually shown (the tour
  was opt-in before, which masked the bug; the new first-launch auto-show
  surfaced it). The step list is now stable across renders and the spotlight
  only commits when the measured rectangle changes.
- Loading a session from the File menu silently dropped every merged gene
  family, the search/filter criteria and the saved tab order; all restore
  paths (menu load and startup recovery) now share one code path and rebuild
  merged documents from their full `sourceFiles` list.
- Closing the window could lose the last second of edits (no unload flush
  existed).
- Compare agreement could reach 100% for results that only moved a gene to
  another species (event type was the only compared dimension).
- Minimap documentation: it sits in the top-right corner of the canvas, not
  bottom-left.

### Docs

- User manual (English and 中文) updated to v0.2.0: three-dimensional compare
  view and its status-bar breakdown, recPhyloXML/NHX export semantics, session
  schema v2 fields, autosave restore prompt, minimap position and keyboard
  support, support values, statistics/CSV format, sixteen data checks, format
  table (plain PhyloXML removed), default language, drag & drop tab claim, and
  a new "Known limitations" section.
- README (English and 中文) and `CITATION.cff` updated to v0.2.0
  (2026-11-01); this changelog created.

## 0.1.2 (2026-10-25)

- Maintenance release: gene edges are drawn along species tubes in segments;
  legend wording and horizontal-layout corrections.

## 0.1.1 (2026-10-08)

- Documentation and packaging release: project badges, GitHub Pages (web
  build) deployment.

## 0.1.0 (2026-09-29)

- Initial public release: recPhyloXML / NHX parsing, six-pass layout pipeline,
  nested and compare views, statistics, transfer network, consistency checks,
  SVG / PNG / PDF / HTML export, session save/load, bilingual UI.
