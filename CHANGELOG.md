# Changelog

All notable changes to PhyloRecViewer are documented in this file. Released
versions are archived on Zenodo: the **concept DOI**
(`10.5281/zenodo.23053317`) always resolves to the newest deposit, and each
archived version carries its own immutable **version DOI**: v0.1.0 is
`10.5281/zenodo.23053318`, v0.1.2 is `10.5281/zenodo.23653805` and v0.2.0 is
`10.5281/zenodo.24108315`. There is no archived v0.1.1 release.

## [Unreleased]

A round of fixes against the published site, covering the empty-state hub, the
analysis panel, located-node visibility, duplication rendering and PDF export.

### UI design review round (2026-11-06)

A dedicated visual pass over the interface — headless-browser screenshots of
every major surface at 1440/1280/1024 window widths, light and dark themes,
both languages — with every finding traced back to its root cause and fixed.
Full report with evidence: `docs/UI-REVIEW-2026-11-06.md`.

**Added**

- **Nested-split orientation toggle** (`src/app/App.tsx`, `src/styles.css`):
  the ⇔/⇕ button lived only in the compare status bar, so the nested view had
  no reachable way to switch stacked/side-by-side even though the shared
  `rpv.split.orientation` preference supports both. A floating toggle now sits
  at the top-right of the nested split, reusing the existing strings.

**Fixed**

- **Compare status bar covered the bottom pane's interaction hints**
  (`src/app/App.tsx`, `src/styles.css`): the bar was an absolute overlay on top
  of the canvas-hint chip, with translucent text bleeding through both layers.
  It is now an in-flow sibling of the pane row (`.split-outer`), so the panes
  make room in both split orientations.
- **Split-pane titles hid under the floating toolbar** (`src/styles.css`):
  the centered `.pane-label` sat at the toolbar's own top band, so on narrower
  panes the title slid completely behind it. Titles now render below the
  toolbar with an ellipsis cap for long file names.
- **Export-menu labels truncated or center-clipped** (`src/styles.css`): the
  fixed 1fr chip grid clipped "Export PNG" to "Export…" on all four format
  buttons and cut long radio labels from both ends ("Screen 2× (192 DPI)" →
  "n 2×("). Chips are now content-sized and wrap (`flex-wrap`), so every
  format, DPI and background label reads in full.
- **Preferences buttons ellipsis-truncated** (`src/styles.css`): "Screen 2×
  (19…", "Use current vi…", "Clear autosav…", "Reset prefere…" now wrap to a
  second line instead, keeping the fixed track alignment.
- **Narrow-window panel policy** (`src/app/App.tsx`): the launch thresholds
  (1000/820) left both panels open at 1024×768, tripling up the legend, stats
  pill and hint chip on a ~470px canvas. Panels now close below 1180/920, the
  hint caps at 60% width and the legend scrolls beyond `calc(100% - 96px)`.
  The presentation-mode restore effect no longer runs on mount — it used to
  re-open both panels right after the narrow-viewport effect closed them.
- **Node inspector covered the sidebar** (`src/app/App.tsx`): the card is
  absolutely positioned bottom-left but rendered at the app root, so its
  anchor was the viewport. It now renders inside `.main` and docks to the
  canvas.
- **Minimap collided with the floating toolbar** (`src/styles.css`): on narrow
  canvases the toolbar's last buttons ran under the minimap; the minimap now
  sits below the toolbar band.
- **Presentation exit button sat on the menu bar** (`src/styles.css`): it now
  floats bottom-center, clear of Preferences/Help.
- **Shortcuts & interactions card rows duplicated themselves**
  (`src/app/HelpOverlay.tsx`): kbd chips contained whole sentences repeated
  verbatim in the label column, one row restated the mouse tip below, and the
  clear-selection row was labelled with Esc semantics. The gesture catalogue
  now pairs short gesture chips with distinct consequences.
- **Narrow-pane toolbar clipped its last buttons** (`src/styles.css`): the
  toolbar wraps and caps at the canvas width, and a container query hides the
  zoom-percentage readout below a 480px canvas so the bar keeps one row (the
  +/− buttons and keyboard zoom are unaffected).
- **Legend and canvas-hint collided on ~500px panes** (`src/styles.css`): when
  the legend is shown, `:has(.legend)` reserves its footprint so the hint chip
  never slides underneath it.
- **Sidebar control labels truncated** (`src/styles.css`): "Species branch
  thickn…" now wraps, matching the section-title wrapping policy.
- **Transfer-network tab mixed alignments** (`src/app/RightPanel.tsx`): the
  hint line was centred while the scope note under it was left-aligned; both
  are left-aligned notes now.
- **Tab context menu styling** (`src/styles.css`): square corners, a hardcoded
  shadow, gray hover and 12px text made it a second, off-system menu style
  next to the dropdowns; it now shares the dropdown treatment (radius,
  layered shadow, accent-weak hover, body-size text), verified in dark theme.

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
- **Bilingual copy aligned with the term table** (`src/i18n.ts`,
  `src/i18nDiagnostics.ts`, `docs/USER_MANUAL.md`, `docs/USER_MANUAL.zh-CN.md`):
  an audit of every interface string found the two locales drifting from
  `docs/GLOSSARY-UI.md` — 「数据健康」 beside the `Data checks` panel title,
  「丢失」 beside 「基因丢失」, "Species names" / "Gene names" beside "All
  labels", "By family" for a gene family — plus counts hedged as `key(s)`
  instead of declined, internal identifiers such as `timeSlice` echoed into
  user-visible English, and the `——` and ` — ` dash styles mixed in one
  catalogue. Counts that one locale spelled out and the other wrote as a digit
  (`已将 {n} 个文件合并为 1 个文档` beside "… into one document", "3-level"
  beside 「三层」) were unified, and the manuals now quote the copy the app
  actually renders. Each fix is enforced at the string: the text guards also
  cover the localiser's Chinese rule strings and the canonical English the
  parsers build, a new guard re-reads every sentence the manuals introduce as
  verbatim UI text against the copy the code holds, and every number a producer
  interpolates is checked for the same treatment in both locales — so a doc that
  drifts from a toast, or a rule that keeps a count in one language only, fails
  the suite. The six translated documents are now compared with each other —
  their headings, tables, code blocks, anchors and URLs must match, and so must
  every figure they state, a number one edition may spell out and the other
  write as a digit — which is the largest single class the audit found. A
  document that names another one's section also has to name a heading that
  exists. Working through those two rules corrected CONTRIBUTING's stale section
  name, the `TB2=`…`TB9=` range the manual credited the exporter with (it is the
  reader's ceiling, and the exporter has none), an agreement score the English
  edition paraphrased where the Chinese one gave 100%, and a missing pair of
  spaces around `=`. Two examples in `docs/STYLE-GUIDE-UI.md` were corrected to
  quote real shipped copy, and the language menu's own entries — 「中文」 and
  "English", names that must not move with the locale — went into the catalogue
  as `langNameZh` / `langNameEn` so that no Chinese literal is written in a
  component any more and the guard that used to excuse them has no exception
  left to abuse. A fixed class cannot silently reopen.

### Fixed

- **The full-labels switch had gone missing** (`src/app/Sidebar.tsx`): the
  option, the canvas cap it lifts (`renderOptions.fullLabels`, `LABEL_MAX` in
  `src/render/Scene.tsx`) and its session round-trip all existed, but the
  Labels section had lost its row during a label-shortening edit, so a long
  accession name could only be read in full from the tooltip. It is back as
  「完整标签」 / "Full labels", and a render test now fails if the row
  disappears again.
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

## 0.2.0 (2026-11-10)

Released as GitHub release v0.2.0 and archived on Zenodo with version DOI
`10.5281/zenodo.24108315`.

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
  transfer arrival (`TB=` for the first, then `TB2=`, `TB3=` and so on, with no
  upper limit, of which the reader interprets the first nine),
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
  (2026-11-10); this changelog created.

## 0.1.2 (2026-10-26)

Archived as GitHub release v0.1.2 and Zenodo version DOI
`10.5281/zenodo.23653805`.

- Maintenance release: gene edges are drawn along species tubes in segments;
  legend wording and horizontal-layout corrections.

## 0.1.1 (2026-10-08)

- Documentation and packaging release: project badges, GitHub Pages (web
  build) deployment. This version was never published as a GitHub or Zenodo
  release; use v0.1.2 instead.

## 0.1.0 (2026-09-29)

Archived as GitHub release v0.1.0 and Zenodo version DOI
`10.5281/zenodo.23053318` (record deposited 2026-09-30).

- Initial public release: recPhyloXML / NHX parsing, six-pass layout pipeline,
  nested and compare views, statistics, transfer network, consistency checks,
  SVG / PNG / PDF / HTML export, session save/load, bilingual UI.
