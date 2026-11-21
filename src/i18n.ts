import type { EventType } from "./model/types";
import { useStore } from "./state/store";

export type Locale = "zh" | "en";

/** All user-facing UI strings (data like node names is never translated). */
export interface Dict {
  // menu bar / toolbar
  menuFile: string;
  menuView: string;
  menuLanguage: string;
  morePreferences: string;
  /** Language endonyms: each language is named in itself, so both dictionaries
   *  hold the same pair and the label does not move with the locale. */
  langNameZh: string;
  langNameEn: string;
  openFile: string;
  nestedLevel: string;
  nestedTitle: string;
  nestedPrefix: string;
  nestedRemoveTitle: string;
  compareLevel: string;
  compareTitle: string;
  comparePrefix: string;
  compareRemoveTitle: string;
  compareErrorPrefix: string;
  warnings: string;
  darkTheme: string;
  lightTheme: string;
  systemTheme: string;
  /** Settings dialog: theme section title. */
  theme: string;
  save: string;
  exportImage: string;
  exportData: string;
  exportedToast: string;
  savedToast: string;
  controlsPanel: string;
  newTabTitle: string;
  closeTabTitle: string;
  untitledTab: string;
  collapse: string;
  expand: string;
  analysisEmpty: string;
  exportLabel: string;
  includeLegend: string;
  includeLegendTitle: string;
  loadFailed: string;
  exportFailed: string;
  // sidebar - layout
  levelHeight: string;
  levelHeightTitle: string;
  geneSpacing: string;
  geneSpacingTitle: string;
  speciesSpacing: string;
  speciesSpacingTitle: string;
  speciesWidth: string;
  alignTips: string;
  alignTipsTitle: string;
  compactTidy: string;
  compactTidyTitle: string;
  midwayDup: string;
  midwayDupTitle: string;
  branchLengths: string;
  branchLengthsTitle: string;
  branchLengthsHint: string;
  minimap: string;
  reduceCrossings: string;
  reduceCrossingsTitle: string;
  crossingsReduced: string;
  crossingsNone: string;
  crossingsNoTransfers: string;
  resetSwaps: string;
  undo: string;
  redo: string;
  annoTitle: string;
  annoPlaceholder: string;
  annoColor: string;
  annoRemove: string;
  annoClearAll: string;
  annoClearAllConfirm: string;
  annoCancel: string;
  // sidebar - style
  style: string;
  curvedBranches: string;
  geneThickness: string;
  symbolSize: string;
  transferCurve: string;
  haloUnderGenes: string;
  eventGlyphs: string;
  supportValues: string;
  tubeGradient: string;
  copyHeatmap: string;
  // sidebar - labels
  labelsSection: string;
  speciesNames: string;
  geneTipNames: string;
  internalGeneNames: string;
  fullLabels: string;
  labelAngle: string;
  labelSize: string;
  labelBold: string;
  labelItalic: string;
  labelOffset: string;
  labelAlign: string;
  alignAuto: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  // label editing (rename / batch replace)
  renameLabels: string;
  findLabel: string;
  replaceWith: string;
  renameScope: string;
  scopeSpecies: string;
  scopeGenes: string;
  scopeAll: string;
  renameApply: string;
  renameReset: string;
  renameHint: string;
  labelEditedToast: string;
  labelResetToast: string;
  // sidebar - actions section
  /** Section title for the layout buttons. */
  layoutActions: string;
  /** Section title for the layout sliders & toggles. */
  layoutParams: string;
  /** Tooltip of the pin button: hold this section open. */
  pinOpen: string;
  /** Tooltip of the pin button while pinned: let the section close again. */
  unpinOpen: string;
  /** Toggle for the legend's layout direction. */
  legendVertical: string;
  legendHorizontal: string;
  /** Legend key for the outline left on a located node. */
  legendLocate: string;
  /** Help overlay / settings entry that opens the first-run tutorial. */
  viewTour: string;
  replayTour: string;
  // tree orientation
  orientation: string;
  orientTop: string;
  orientBottom: string;
  orientLeft: string;
  orientRight: string;
  hint: string;
  /** Hover hint on a gene node: the click gestures it offers. */
  hintClickHighlight: string;
  hintShiftAnnotate: string;
  /** kbd chip for the collapse/expand gesture: Canvas.onGeneClick fires on
   *  Alt/⌥ OR ⌘ (metaKey), so all three names belong in the chip. */
  hintAltCollapse: string;
  hintHighlightAction: string;
  /** Hover-hint wording for the collapse/expand gesture. */
  collapseExpandAction: string;
  // legend
  events: string;
  geneFamilies: string;
  geneTree: string;
  changeColor: string;
  transferLegend: string;
  /** Search/filter label for the transfer event family (donor + arrival). */
  transferFilter: string;
  /** Wording of the collapsed-clade tooltip. */
  collapsedClade: string;
  leavesUnit: string;
  expandHint: string;
  // app states + stats
  emptyFormats: string;
  errorTitle: string;
  errorHint: string;
  /** Error panel action that takes the user back to the file picker. */
  errorRetry: string;
  /** Error panel action that returns to the document shown before the failed one. */
  errorBack: string;
  /** Error panel action that loads one of the bundled samples. */
  errorSample: string;
  dropToOpen: string;
  /** Display names of the bundled samples, used in the menu, empty state and tabs. */
  sampleShowcase: string;
  sampleCompare: string;
  sampleCompareB: string;
  sampleNested: string;
  sampleNestedB: string;
  parsing: string;
  /** Loading overlay text for a file that takes longer than ~800 ms to parse. */
  parsingLarge: string;
  helpButton: string;
  helpTitle: string;
  helpKeyboard: string;
  helpMouse: string;
  helpFit: string;
  helpZoomInOut: string;
  helpClosePanel: string;
  /** Help overlay: what ←/→ plus Home/End do while a tab strip (the document
   *  tab bar or the analysis panel's tab row) has focus — `TabBar.tsx` and
   *  `RightPanel.tsx` move to the previous/next tab and jump to the first/last
   *  one, and both activate the tab they land on. */
  helpSwitchTabs: string;
  /** Help overlay row: ⌘/Ctrl + Enter is bound to the annotation editor's note
   *  field (`AnnotationEditor.tsx`), so it saves a note that is already being
   *  written — it never opens the editor, which Shift-click does. */
  helpSaveAnnotation: string;
  /** Help overlay: the section listing mouse gestures on nodes. */
  interactionsTitle: string;
  /** Help overlay row: clicking empty space clears the selection. */
  hintClear: string;
  /** Help overlay row: clicking a species branch mirrors it. */
  hintMirror: string;
  /** Tooltip on a species branch: click to mirror its subtree. */
  mirrorHint: string;
  /** Toast naming the file-association files the OS could not read ({names} = list). */
  openFailedToast: string;
  /** The open dialog's filter name for the extensions the app accepts. The OS
   *  draws this label itself, so the app hands it over in the current language;
   *  the extensions live in `OPEN_EXTENSIONS` in `src-tauri/src/lib.rs`. */
  filterAllTrees: string;
  /** The save dialog's fallback filter name, for an extension with no display
   *  name of its own — see `filter_display_name` in `src-tauri/src/lib.rs`. */
  filterAnyFile: string;
  /** Toast for a PNG export scaled down to fit the canvas limit ({dpi} = effective DPI). */
  pngScaledToast: string;
  /** Toast for a PDF whose vector conversion failed, so a raster PDF was written. */
  pdfRasterToast: string;
  /** The coachmark bubble shown on the first gene-node hover. */
  viewShortcuts: string;
  nestedErrorPrefix: string;
  /** Count unit for `countLabel()` (「25 个物种」); the Chinese value carries the
   *  classifier on purpose, like `geneTreeUnit` and `geneNodes`. Table headers
   *  and field labels take the noun `inspSpecies` instead. */
  species: string;
  geneTreeUnit: string;
  geneNodes: string;
  paneGeneSymbiont: string;
  paneSymbiontHost: string;
  paneSymbiontHostNamed: string;
  // canvas
  zoomIn: string;
  zoomOut: string;
  zoomLimit: string;
  fit: string;
  // analysis panel
  analyze: string;
  panelSearch: string;
  panelStats: string;
  panelNetwork: string;
  /** The tab where annotations are managed. */
  panelAnnotate: string;
  /** The differences tab, available in compare mode. */
  panelDiff: string;
  /** Shown while the annotation list is still empty. */
  noAnnotations: string;
  /** Legend chip naming the colour of the compare-mode highlight. */
  diffLegend: string;
  /** Toggle that hides the compare highlight. */
  diffHide: string;
  /** The multi-file open prompt: merge into one document or one tab each. "{n}" = file count. */
  multiOpenTitle: string;
  mergeMode: string;
  tabMode: string;
  /** Toast confirming that N files came together as one document. */
  mergedToast: string;
  /** The sidebar's reset-everything control. */
  resetAll: string;
  resetAllTitle: string;
  /** The stats section's expand / collapse all toggle. */
  /** The one-line per-species summary stats show while a section is folded. */
  /** The preferences dialog. */
  prefsTitle: string;
  /** Group headings inside the preferences dialog (one row per setting). */
  prefsGroupAppearance: string;
  prefsGroupExport: string;
  prefsGroupWorkspace: string;
  prefsGroupHelp: string;
  prefsGroupReset: string;
  defaultView: string;
  saveDefaultView: string;
  clearDefaultView: string;
  restorePrefs: string;
  /** The first-run onboarding tour. */
  onboardSkip: string;
  onboardNext: string;
  onboardPrev: string;
  onboardDone: string;
  tourStep1Title: string;
  tourStep1Body: string;
  tourStep2Title: string;
  tourStep2Body: string;
  tourStep3Title: string;
  tourStep3Body: string;
  tourStep4Title: string;
  tourStep4Body: string;
  tourStep5Title: string;
  tourStep5Body: string;
  /** Close-tab confirmation (dirty documents). */
  closeConfirmTitle: string;
  closeConfirmBody: string;
  searchPlaceholder: string;
  useRegex: string;
matchCount: string;
noMatches: string;
noEvents: string;
  prevMatch: string;
  nextMatch: string;
  filterEvents: string;
  filterEvent: string;
  filterFamilies: string;
  clearFilters: string;
  statsTotals: string;
  statsByFamily: string;
  statsTransferMatrix: string;
  statsBySpecies: string;
  topOfShort: string;
  exportCsv: string;
  donor: string;
  recipient: string;
  countCol: string;
  copiesCol: string;
  /** Count unit for the same figure: `countLabel` needs a plural noun that
   *  `SINGULAR_UNITS` can decline, which a column header cannot be (STYLE §3.6). */
  copiesUnit: string;
  nodesCol: string;
  statsNodes: string;
  statsNodesLimited: string;
  colNum: string;
  colName: string;
  colType: string;
  colEvent: string;
  nodeLeaf: string;
  nodeInternal: string;
  geneTreesCol: string;
  eventDistribution: string;
  filterConfidence: string;
  /** Search: "show only matching nodes" toggle. */
  searchOnlyMatch: string;
  /** Lightweight "tree is rearranging" indicator. */
  rendering: string;
  pngResolution: string;
  noTransfers: string;
  panelChecks: string;
  checkAllGood: string;
  checkUnknownSpecies: string;
  checkDonorNoTransferBack: string;
  checkTransferBackNoParent: string;
  checkLeafInternalSpecies: string;
  checkNoSpecies: string;
  checkDuplicateSpecies: string;
  checksWithIssues: string;
  checksPassing: string;
  checkNameUnknownSpecies: string;
  checkNameDuplicateSpecies: string;
  checkNameNoSpecies: string;
  checkNameLeafInternalSpecies: string;
  checkNameDonorNoTransferBack: string;
  checkNameTransferBackNoParent: string;
  checkNameTransferBackNoDonor: string;
  checkTransferBackNoDonor: string;
  checkNameBifurcationNoTransferBack: string;
  checkBifurcationNoTransferBack: string;
  checkNameTerminalEventWithChildren: string;
  checkTerminalEventWithChildren: string;
  checkNameNonBinaryNode: string;
  checkNonBinaryNode: string;
  checkNameTransferBackwardsInTime: string;
  checkTransferBackwardsInTime: string;
  overviewMode: string;
  renameLabel: string;
  renameAllSameName: string;
  menuNew: string;
  closeTabMenu: string;
  closeOthers: string;
  closeAll: string;
  pasteTree: string;
  pasteTreeEmpty: string;
  pasteTreeOk: string;
  loadSpeciesTree: string;
  speciesTreeLoaded: string;
  speciesTreeCleared: string;
  saveSessionAs: string;
  openSession: string;
  exportRecPhylo: string;
  exportNhxExt: string;
  nhxDialectTitle: string;
  nhxLossList: string;
  nhxExportAnyway: string;
  nhxUseRecPhylo: string;
  pngScreen: string;
  dpiCustomLabel: string;
  pixelEstimate: string;
  transparentBg: string;
  whiteBg: string;
  themeBg: string;
  copySvg: string;
  copyPng: string;
  copyOk: string;
  copyFailed: string;
  aboutTitle: string;
  aboutVersion: string;
  aboutCitation: string;
  aboutLicense: string;
  copyDiagnostics: string;
  dataHealth: string;
  parseWarnings: string;
  nestedWarningsLabel: string;
  nestedWarningsNamed: string;
  compareWarningsLabel: string;
  compareWarningsNamed: string;
  exportReport: string;
  locateNode: string;
  locateNodeTitle: string;
  levelError: string;
  levelWarning: string;
  levelInfo: string;
  splitSideBySide: string;
  linkViews: string;
  diffMatched: string;
  /** Compare status: percentage of nodes that agree (union denominator). */
  agreePct: string;
  diffOnlyA: string;
  diffOnlyB: string;
  speciesAgreeShort: string;
  diffColStatus: string;
  diffOnlyDiff: string;
  exportDiffCsv: string;
  scopePrimary: string;
  scopeNote: string;
  arrivalsCol: string;
  topOf: string;
  topOfSpecies: string;
  unknownSpeciesRow: string;
  nodeLoss: string;
  regexInvalid: string;
  resultsList: string;
  restoreTitle: string;
  restoreBody: string;
  restoreAccept: string;
  restoreDecline: string;
  restoreCleared: string;
  presentation: string;
  exitPresentation: string;
  unsavedChanges: string;
  close: string;
  autosaveSection: string;
  autosaveOn: string;
  autosaveNone: string;
  autosaveFailedLabel: string;
  clearAutosave: string;
  clearAutosaveConfirm: string;
  clearAutosaveDone: string;
  recoverySection: string;
  recoveryFound: string;
  recoveryExport: string;
  renameTab: string;
  tabTooltipMerged: string;
  batchPreview: string;
  batchPreviewEmpty: string;
  batchInvalidRegex: string;
  inspectorTitle: string;
  inspSpecies: string;
  inspTimeSlice: string;
  inspConfidence: string;
  inspSupport: string;
  inspBranch: string;
  inspFamily: string;
  inspParent: string;
  inspChildren: string;
  inspDonor: string;
  inspRecipient: string;
  inspAnnotation: string;
  inspCopy: string;
  inspLocate: string;
  inspNone: string;
  mergeBase: string;
  mergeConflict: string;
  mergeNoConflict: string;
  checkNameSameSpeciesTransfer: string;
  checkSameSpeciesTransfer: string;
  checkNameTransferTimeUnknown: string;
  checkTransferTimeUnknown: string;
  checkNameConfidenceScaleSuspect: string;
  checkConfidenceScaleSuspect: string;
  checkNameNegativeBranchLength: string;
  checkNegativeBranchLength: string;
  checkNameVerticalEdgeAcrossClades: string;
  checkVerticalEdgeAcrossClades: string;
  // P0 wording fixes
  warningSuffix: string;
  valueSuffix: string;
  valueIncrease: string;
  valueDecrease: string;
  patternPlaceholder: string;
  samplesHeading: string;
  removeSpeciesTree: string;
  background: string;
  paneComparison: string;
  paneTagA: string;
  paneTagB: string;
  notApplicable: string;
  diffShow: string;
  resizeHint: string;
  exportAction: string;
  labelSearchPlaceholder: string;
  zoomLevel: string;
  exportDefaultStem: string;
  pastedTreeName: string;
  unsavedSource: string;
  splitStacked: string;
  crashTitle: string;
  crashBody: string;
  crashExport: string;
  crashReload: string;
  supportBootstrap: string;
  supportPosterior: string;
  supportAlrt: string;
  supportUnknown: string;
  // events
  parseEmptyFile: string;
  supportedFormats: string;
  mergedTabTitle: string;
  fileTooLarge: string;
  tabFileOpenFailed: string;
  alreadyOpenTab: string;
  tabCorrupt: string;
  nestedSwitchToast: string;
  compareSwitchToast: string;
  nestedAddedToast: string;
  compareAddedToast: string;
  restoreFailed: string;
  someDocsFailed: string;
  unknownFile: string;
  /** Joins the names inside a list message. It is copy, so it lives here and
   *  not in a `locale === "zh" ? …` ternary (STYLE-GUIDE-UI 5.2). */
  listSeparator: string;
  autosaveUnavailable: string;
  event: Record<EventType, string>;
}

/** Dict keys whose value is a plain (non-parameterized, non-list) string —
 *  safe to reference by key from data structures like the bundled samples. */
export type StringDictKey = {
  [K in keyof Dict]: Dict[K] extends string ? K : never;
}[keyof Dict];

const en: Dict = {
  menuFile: "File",
  menuView: "View",
  menuLanguage: "Language",
  morePreferences: "Preferences…",
  langNameZh: "中文",
  langNameEn: "English",
  openFile: "Open file",
  nestedLevel: "+ Nested level",
  nestedTitle: "Add a nested symbiont → host reconciliation to show a 3-level view.",
  nestedPrefix: "Nested: {name}",
  nestedRemoveTitle: "Nested level (click to remove): {name}",
  compareLevel: "+ Compare",
  compareTitle: "Load an alternative reconciliation of the same gene family to compare",
  comparePrefix: "Compare: {name}",
  compareRemoveTitle: "Comparison (click to remove): {name}",
  compareErrorPrefix: "Comparison file error:",
  warnings: "warnings",
  darkTheme: "Dark theme",
  lightTheme: "Light theme",
  systemTheme: "System theme",
  theme: "Theme",
  save: "Save",
  exportImage: "Export image",
  exportData: "Data",
  exportedToast: "Exported",
  savedToast: "Saved",
  controlsPanel: "Controls",
  newTabTitle: "New tab",
  closeTabTitle: "Close tab",
  untitledTab: "Untitled",
  collapse: "Collapse",
  expand: "Expand",
  analysisEmpty: "Open a reconciliation to use the analysis tools.",
  exportLabel: "Export",
  includeLegend: "Show legend",
  includeLegendTitle: "Show the legend on the canvas and include it in exported images",
  loadFailed: "Load failed",
  exportFailed: "Export failed",
  levelHeight: "Species level spacing",
  levelHeightTitle: "Vertical distance between successive species-tree levels.",
  geneSpacing: "Gene lane spacing",
  geneSpacingTitle: "Horizontal gap between gene lanes inside a species band.",
  speciesSpacing: "Species slot spacing",
  speciesSpacingTitle: "Horizontal gap between species slots (tip positions).",
  speciesWidth: "Species branch thickness",
  alignTips: "Align species tips",
  alignTipsTitle: "Align species-tree tips to a common baseline. Only visible when tips sit at different depths.",
  compactTidy: "Compact layout",
  compactTidyTitle: "Pack sibling subtrees closer together using contour packing instead of reserving a fixed-width slot per leaf.",
  midwayDup: "Center gene-duplication nodes",
  midwayDupTitle: "Place gene-duplication nodes at the midpoint of their species branch (otherwise closer to the ancestral end).",
  branchLengths: "Branch lengths",
  branchLengthsTitle: "Use branch lengths as a time proxy to space species levels (assumes a dated or ultrametric tree). Requires branch lengths in the file.",
  branchLengthsHint: "This document has no species branch lengths, so the toggle has no effect.",
  minimap: "Minimap",
  reduceCrossings: "Reduce crossings",
  reduceCrossingsTitle: "Automatically mirror subtrees to reduce transfer crossings",
  crossingsReduced: "Crossings reduced: {before} → {after}",
  crossingsNone: "No further crossing reduction found",
  crossingsNoTransfers: "This document has no transfers to rearrange",
  resetSwaps: "Reset mirroring",
  undo: "Undo",
  redo: "Redo",
  annoTitle: "Annotate",
  annoPlaceholder: "Add a note…",
  annoColor: "Color",
  annoRemove: "Remove",
  annoClearAll: "Clear all annotations",
  annoClearAllConfirm: "Remove all annotations from this document? This can be undone with Ctrl+Z / ⌘Z.",
  annoCancel: "Cancel",
  style: "Style",
  curvedBranches: "Curved branches",
  geneThickness: "Gene branch thickness",
  symbolSize: "Event symbol size",
  transferCurve: "Transfer arc curvature",
  haloUnderGenes: "Halo behind gene edges",
  eventGlyphs: "Event markers",
  supportValues: "Confidence and support values",
  tubeGradient: "Species branch gradient",
  copyHeatmap: "Gene-lane occupancy heatmap",
  labelsSection: "Labels",
  speciesNames: "Species names",
  geneTipNames: "Extant gene names",
  internalGeneNames: "Internal gene node names",
  fullLabels: "Full labels",
  labelAngle: "Angle",
  labelSize: "Font size",
  labelBold: "Bold",
  labelItalic: "Italic",
  labelOffset: "Label offset",
  labelAlign: "Align",
  alignAuto: "Auto",
  alignLeft: "Left",
  alignCenter: "Center",
  alignRight: "Right",
  renameLabels: "Rename labels",
  findLabel: "Find",
  replaceWith: "Replace with",
  renameScope: "Scope",
  scopeSpecies: "Species labels",
  scopeGenes: "Gene labels",
  scopeAll: "All labels",
  renameApply: "Apply",
  renameReset: "Reset labels",
  renameHint: "Click a label on the canvas to rename it individually.",
  labelEditedToast: "Labels renamed",
  labelResetToast: "Labels reset",
  layoutActions: "Layout actions",
  layoutParams: "Layout parameters",
  pinOpen: "Pin section open",
  unpinOpen: "Unpin section",
  legendVertical: "Vertical legend",
  legendHorizontal: "Horizontal legend",
  legendLocate: "Located node",
  viewTour: "Tour",
  replayTour: "Replay tour",
  orientation: "Orientation",
  orientTop: "Root top",
  orientBottom: "Root bottom",
  orientLeft: "Root left",
  orientRight: "Root right",
  hint: "Tip: scroll to zoom, drag to pan. Click a gene node to highlight its ancestors and descendants; click a species branch to mirror its subtree; Alt-click or Ctrl/⌘-click an internal gene node to collapse or expand; Shift-click a gene node to annotate; click empty space to clear the selection.",
  hintClickHighlight: "Click",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt / Ctrl / ⌘",
  hintHighlightAction: "highlight related nodes",
  collapseExpandAction: "Collapse or expand",
  events: "Events and symbols",
  geneFamilies: "Gene families",
  geneTree: "Gene tree",
  changeColor: "Change color",
  transferLegend: "Transfer arc",
  transferFilter: "Transfers",
  collapsedClade: "Collapsed clade",
  leavesUnit: "extant genes",
  expandHint: "Alt-click or Ctrl/⌘-click to expand",
  emptyFormats: "recPhyloXML, NHX, Newick",
  errorTitle: "Could not parse this file",
  errorHint: "Supported formats: recPhyloXML (.recphyloxml / .recphylo / .xml), NHX (.nhx), Newick (.nwk / .newick). Check the file format and encoding.",
  errorRetry: "Choose another file",
  errorBack: "Back to previous",
  errorSample: "Load sample",
  dropToOpen: "Drop to open",
  sampleShowcase: "Showcase",
  sampleCompare: "Comparison",
  sampleCompareB: "Outcome B (duplication-rich)",
  sampleNested: "Nested",
  sampleNestedB: "Symbiont → Host",
  parsing: "Parsing…",
  parsingLarge: "Opening a large file…",
  helpButton: "Help",
  helpTitle: "Help & shortcuts",
  helpKeyboard: "Keyboard",
  helpMouse: "Mouse & touch",
  helpFit: "Fit to window",
  helpZoomInOut: "Zoom in / out",
  helpClosePanel: "Close panel / clear selection",
  helpSwitchTabs: "Switch document tab / panel tab",
  helpSaveAnnotation: "Save the annotation while its editor is open",
  interactionsTitle: "Interactions",
  hintClear: "Click empty space to clear the selection",
  hintMirror: "Click a species branch to mirror its subtree",
  mirrorHint: "Click to mirror this subtree",
  openFailedToast: "Could not open: {names}",
  filterAllTrees: "All supported tree files",
  filterAnyFile: "File",
  pngScaledToast: "The drawing is too large at this DPI: the image was scaled down to ≈ {dpi} DPI to fit the platform’s maximum canvas size.",
  pdfRasterToast: "Vector PDF conversion failed; a full-page raster PDF was written instead",
  viewShortcuts: "Help & shortcuts",
  nestedErrorPrefix: "Nested file error:",
  species: "species",
  geneTreeUnit: "gene trees",
  geneNodes: "gene nodes",
  paneGeneSymbiont: "Gene → Symbiont",
  paneSymbiontHost: "Symbiont → Host",
  paneSymbiontHostNamed: "Symbiont → Host ({name})",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomLimit: "limit reached",
  fit: "Fit to window",
  analyze: "Analysis",
  panelSearch: "Search",
  panelStats: "Statistics",
  panelNetwork: "Transfer network",
  panelAnnotate: "Annotations",
  panelDiff: "Differences",
  noAnnotations: "No annotations yet. Shift-click a gene node (or use annotation mode) to add one.",
  diffLegend: "Nodes differing between documents",
  diffHide: "Hide highlight",
  multiOpenTitle: "How do you want to open the {n} files?",
  mergeMode: "Merge into one document",
  tabMode: "One tab per file",
  mergedToast: "Merged {n} files into one document",
  resetAll: "Reset all",
  resetAllTitle: "Reset every layout and style option to its default",
  prefsTitle: "Preferences",
  prefsGroupAppearance: "Appearance",
  prefsGroupExport: "Export",
  prefsGroupWorkspace: "Workspace",
  prefsGroupHelp: "Help",
  prefsGroupReset: "Reset",
  defaultView: "Default layout & display options",
  saveDefaultView: "Save as default layout",
  clearDefaultView: "Clear default layout",
  restorePrefs: "Reset preferences",
  onboardSkip: "Skip",
  onboardNext: "Next",
  onboardPrev: "Back",
  onboardDone: "Done",
  tourStep1Title: "Controls",
  tourStep1Body: "The left panel composes the picture: orientation, spacing, style and labels. Everything here updates the canvas live.",
  tourStep2Title: "Analysis",
  tourStep2Body: "The right panel inspects it: search & filter, statistics, the transfer network and data checks.",
  tourStep3Title: "Canvas",
  tourStep3Body: "Click a gene node to highlight its ancestors and descendants, Shift-click a gene node to annotate, Alt-click or Ctrl/⌘-click an internal gene node to collapse it, and click a species branch to mirror its subtree.",
  tourStep4Title: "Nested & compare views",
  tourStep4Body: "Add a nested level for a 3-level gene → symbiont → host view, or load a second reconciliation to compare.",
  tourStep5Title: "Export",
  tourStep5Body: "Export the drawing as PNG / SVG / PDF / HTML, or save the whole session to reopen later.",
  closeConfirmTitle: "Close tab?",
  closeConfirmBody: "This document has unsaved changes. Close anyway?",
  searchPlaceholder: "Search names, species, events or notes…",
  useRegex: "Regular expression",
matchCount: "matches",
noMatches: "No matches found",
noEvents: "No events",
  prevMatch: "Previous",
  nextMatch: "Next",
  filterEvents: "By event type",
  filterEvent: "Show nodes with this event",
  filterFamilies: "By gene family",
  clearFilters: "Clear",
  statsTotals: "Summary",
  statsByFamily: "By gene family",
  statsTransferMatrix: "Transfer-count matrix",
  statsBySpecies: "By species",
  topOfShort: "First {n}",
  exportCsv: "Export CSV",
  donor: "Donor",
  recipient: "Recipient",
  countCol: "Count",
  copiesCol: "Non-loss gene nodes",
  copiesUnit: "non-loss gene nodes",
  nodesCol: "Nodes",
  statsNodes: "Nodes",
  statsNodesLimited: "Table truncated (first {n} rows)",
  colNum: "#",
  colName: "Name",
  colType: "Type",
  colEvent: "Event",
  nodeLeaf: "Extant gene",
  nodeInternal: "Internal node",
  geneTreesCol: "Gene trees",
  eventDistribution: "Event distribution",
  filterConfidence: "Confidence range",
  searchOnlyMatch: "Show matching nodes only",
  rendering: "Rendering…",
  pngResolution: "PNG output density (DPI)",
  noTransfers: "No transfers",
  panelChecks: "Data checks",
  checkAllGood: "All data checks passed",
  checkUnknownSpecies: "gene nodes reference species missing from the species tree",
  checkDonorNoTransferBack: "branching-out nodes whose departing subtree contains no transfer arrival",
  checkTransferBackNoParent: "transfer arrivals with no parent node",
  checkLeafInternalSpecies: "extant genes placed at internal species-tree nodes",
  checkNoSpecies: "gene nodes with no species assignment",
  checkDuplicateSpecies: "duplicate species names in the species tree",
  checksWithIssues: "{n} of {m} checks raised an issue",
  checksPassing: "Passing",
  checkNameUnknownSpecies: "Species references",
  checkNameDuplicateSpecies: "Species name uniqueness",
  checkNameNoSpecies: "Species assignment",
  checkNameLeafInternalSpecies: "Extant genes at species-tree tips",
  checkNameDonorNoTransferBack: "Branching-out arrivals",
  checkNameTransferBackNoParent: "Transfer arrival parent",
  checkTransferBackNoDonor: "transfer arrivals whose parent is not a branching-out or bifurcation-out node",
  checkNameTransferBackNoDonor: "Transfer arrival donor",
  checkBifurcationNoTransferBack: "bifurcation-out nodes whose subtree contains no transfer arrival",
  checkNameBifurcationNoTransferBack: "Bifurcation-out arrivals",
  checkTerminalEventWithChildren: "terminal (loss / extant gene) events that have child nodes",
  checkNameTerminalEventWithChildren: "Terminal events",
  checkNonBinaryNode: "speciation / duplication nodes that do not have exactly two children",
  checkNameNonBinaryNode: "Speciation / duplication node arity",
  checkTransferBackwardsInTime: "transfers into an ancestor species (backwards in time)",
  checkNameTransferBackwardsInTime: "Transfer time direction",
  overviewMode: "Zoom in to show labels",
  renameLabel: "Rename label",
  renameAllSameName: "Apply to all {n} labels with this name",
  menuNew: "New document",
  closeTabMenu: "Close tab",
  closeOthers: "Close other tabs",
  closeAll: "Close all tabs",
  pasteTree: "Paste tree from clipboard",
  pasteTreeEmpty: "The clipboard does not contain any text",
  pasteTreeOk: "Pasted tree opened",
  loadSpeciesTree: "Load species tree (Newick)…",
  speciesTreeLoaded: "Species tree “{name}” loaded; gene trees you open next will use it",
  speciesTreeCleared: "External species tree cleared",
  saveSessionAs: "Save session as…",
  openSession: "Open session…",
  exportRecPhylo: "recPhyloXML (full export, re-readable)",
  exportNhxExt: "NHX (with event tags)…",
  nhxDialectTitle: "About the NHX export",
  nhxLossList: "This NHX file will not include:",
  nhxExportAnyway: "Export NHX anyway",
  nhxUseRecPhylo: "Use recPhyloXML instead",
  pngScreen: "2× screen size (192 DPI)",
  dpiCustomLabel: "Custom DPI",
  pixelEstimate: "Output ≈ {w} × {h} px",
  transparentBg: "Transparent background",
  whiteBg: "White background",
  themeBg: "Theme background",
  copySvg: "Copy SVG",
  copyPng: "Copy PNG",
  copyOk: "Copied to clipboard",
  copyFailed: "Clipboard is unavailable",
  aboutTitle: "About PhyloRecViewer",
  aboutVersion: "Version",
  aboutCitation: "Citation info",
  aboutLicense: "MIT License. Runs offline without telemetry.",
  copyDiagnostics: "Copy diagnostics",
  dataHealth: "Data checks",
  parseWarnings: "Parser warnings",
  nestedWarningsLabel: "Nested layer warnings",
  nestedWarningsNamed: "Nested layer warnings ({name})",
  compareWarningsLabel: "Compare layer warnings",
  compareWarningsNamed: "Compare layer warnings ({name})",
  exportReport: "Export data-check report",
  locateNode: "Locate",
  locateNodeTitle: "Locate this node on the canvas",
  levelError: "Error",
  levelWarning: "Warning",
  levelInfo: "Note",
  splitSideBySide: "Side by side",
  linkViews: "Link views",
  diffMatched: "{n} nodes compared",
  agreePct: "{p}% node agreement",
  diffOnlyA: "{n} only in the primary document",
  diffOnlyB: "{n} only in the comparison document",
  speciesAgreeShort: "{p}% species-mapping agreement",
  diffColStatus: "Differs in",
  diffOnlyDiff: "Show differences only",
  exportDiffCsv: "Export differences (CSV)",
  scopePrimary: "Primary document",
  scopeNote: "Covers the primary document only",
  arrivalsCol: "Transfer arrivals",
  topOf: "Top {n} of {total}",
  topOfSpecies: "Top {n} of {total} species",
  unknownSpeciesRow: "(no species)",
  nodeLoss: "Loss",
  regexInvalid: "Invalid regular expression. Falling back to literal text matching.",
  resultsList: "Matches",
  restoreTitle: "Restore last session?",
  restoreBody: "An autosaved snapshot from {time} is available.",
  restoreAccept: "Restore",
  restoreDecline: "Start blank",
  restoreCleared: "Previous snapshot discarded",
  presentation: "Presentation mode",
  exitPresentation: "Exit presentation (Esc)",
  unsavedChanges: "Unsaved changes",
  close: "Close",
  autosaveSection: "Autosave",
  autosaveOn: "Last saved {time}",
  autosaveNone: "Not saved yet this session",
  autosaveFailedLabel: "Autosave failed. Export a session file to avoid losing work.",
  clearAutosave: "Clear autosave data",
  clearAutosaveConfirm: "Discard the saved snapshot? The next refresh will start from a blank tab.",
  clearAutosaveDone: "Autosave data cleared",
  recoverySection: "Recovery",
  recoveryFound: "A snapshot that failed to restore was kept. Export it to inspect or re-import:",
  recoveryExport: "Export snapshot (JSON)",
  renameTab: "Rename tab",
  tabTooltipMerged: "Merged from {n} source files",
  batchPreview: "Labels to replace: {n}",
  batchPreviewEmpty: "No label matches this pattern",
  batchInvalidRegex: "Invalid regular expression",
  inspectorTitle: "Node details",
  inspSpecies: "Species",
  inspTimeSlice: "Time slice",
  inspConfidence: "Confidence",
  inspSupport: "Support",
  inspBranch: "Branch length",
  inspFamily: "Gene family",
  inspParent: "Parent",
  inspChildren: "Children",
  inspDonor: "Donor",
  inspRecipient: "Recipient",
  inspAnnotation: "Annotation",
  inspCopy: "Copy details",
  inspLocate: "Locate",
  inspNone: "—",
  mergeBase: "Reference species tree: {name}",
  mergeConflict: "Files listing different species: {n}",
  mergeNoConflict: "No species-name differences detected",
  warningSuffix: " + parser warnings",
  valueSuffix: "value",
  valueIncrease: "Increase",
  valueDecrease: "Decrease",
  patternPlaceholder: "regular expression…",
  samplesHeading: "Samples",
  removeSpeciesTree: "Remove species tree",
  background: "Background",
  paneComparison: "Comparison",
  paneTagA: "Primary",
  paneTagB: "Comparison",
  notApplicable: "—",
  parseEmptyFile: "The file is empty. Choose a recPhyloXML, NHX or Newick file with tree data.",
  supportedFormats: "Supported formats: {formats}.",
  mergedTabTitle: "{name} ({n} gene families)",
  fileTooLarge: "Exceeds the 64 MiB limit: {names}",
  tabFileOpenFailed: "Failed to open a file in tab “{title}”",
  alreadyOpenTab: "“{name}” is already open — switched to its tab",
  tabCorrupt: "Could not open tab “{title}”: the document is corrupt or from another version",
  nestedSwitchToast: "Switched to nested view; compare layer removed",
  compareSwitchToast: "Switched to compare view; nested layer removed",
  nestedAddedToast: "Nested level added: {name}",
  compareAddedToast: "Comparison added: {name}",
  restoreFailed: "Last session could not be restored: {names}. The raw snapshot is kept.",
  someDocsFailed: "Some documents could not be restored: {names}",
  unknownFile: "unknown file",
  listSeparator: ", ",
  autosaveUnavailable: "Autosave unavailable: local storage is full or blocked. Export your session file.",
  diffShow: "Show highlight",
  resizeHint: "Drag to resize",
  exportAction: "Export",
  labelSearchPlaceholder: "Label or match pattern…",
  zoomLevel: "Zoom",
  exportDefaultStem: "reconciliation",
  pastedTreeName: "Pasted tree",
  unsavedSource: "(unsaved)",
  splitStacked: "Stacked",
  crashTitle: "PhyloRecViewer ran into an error",
  crashBody: "Your annotations and layout are still in memory. Save the session before reloading.",
  crashExport: "Save session…",
  crashReload: "Reload",
  supportBootstrap: "bootstrap support",
  supportPosterior: "posterior probability",
  supportAlrt: "aLRT support",
  supportUnknown: "support type not stated",
  checkNameSameSpeciesTransfer: "Same-species transfer",
  checkSameSpeciesTransfer: "A transfer arrives in the same species it left; this may be genuine within-species gene transfer between gene lineages — judge it against your model, it is not a time-direction error.",
  checkNameTransferTimeUnknown: "Transfer direction",
  checkTransferTimeUnknown: "No time slice on the donor event or the arrival event, and the two species are not in an ancestor–descendant relation, so the time direction cannot be determined (topology depth is not time).",
  checkNameConfidenceScaleSuspect: "Event confidence range",
  checkConfidenceScaleSuspect: "An event confidence value is above 1 and at most 100; the confidence filter expects 0–1.",
  checkNameNegativeBranchLength: "Negative / non-finite values",
  checkNegativeBranchLength: "A branch length or time slice is negative or not finite; it is clamped to 0 for drawing.",
  checkNameVerticalEdgeAcrossClades: "Gene edge between unrelated species",
  checkVerticalEdgeAcrossClades: "A non-transfer gene edge connects two species that are not in an ancestor–descendant relation — impossible without a transfer. Check the species recorded on each event.",
  event: {
    speciation: "Speciation",
    duplication: "Duplication",
    loss: "Loss",
    branchingOut: "Branching out",
    bifurcationOut: "Bifurcation out",
    transferBack: "Transfer arrival",
    leaf: "Extant gene",
  },
};

const zh: Dict = {
  menuFile: "文件",
  menuView: "视图",
  menuLanguage: "语言",
  morePreferences: "偏好设置…",
  langNameZh: "中文",
  langNameEn: "English",
  openFile: "打开文件",
  nestedLevel: "+ 嵌套层",
  nestedTitle: "添加嵌套层（共生体→宿主调和），以显示三层视图",
  nestedPrefix: "嵌套：{name}",
  nestedRemoveTitle: "嵌套层（点击移除）：{name}",
  compareLevel: "+ 对比",
  compareTitle: "载入同一基因家族的另一份调和结果进行对比",
  comparePrefix: "对比：{name}",
  compareRemoveTitle: "对比（点击移除）：{name}",
  compareErrorPrefix: "对比文件错误：",
  warnings: "个警告",
  darkTheme: "深色主题",
  lightTheme: "浅色主题",
  systemTheme: "跟随系统",
  theme: "主题",
  save: "保存",
  exportImage: "导出图像",
  exportData: "数据",
  exportedToast: "已导出",
  savedToast: "已保存",
  controlsPanel: "控制面板",
  newTabTitle: "新建标签页",
  closeTabTitle: "关闭标签页",
  untitledTab: "未命名",
  collapse: "收起",
  expand: "展开",
  analysisEmpty: "载入调和结果后可使用分析工具。",
  exportLabel: "导出",
  includeLegend: "显示图例",
  includeLegendTitle: "在画布上显示图例，并在导出图像时一并包含",
  loadFailed: "载入失败",
  exportFailed: "导出失败",
  levelHeight: "物种层级间距",
  levelHeightTitle: "物种树相邻层级之间的垂直距离。",
  geneSpacing: "基因泳道间距",
  geneSpacingTitle: "物种带内相邻基因泳道之间的水平间距。",
  speciesSpacing: "物种槽位间距",
  speciesSpacingTitle: "物种槽位（末端位置）之间的水平间距。",
  speciesWidth: "物种枝粗细",
  alignTips: "物种末端对齐",
  alignTipsTitle: "把物种树末端对齐到同一基线。仅当末端处于不同深度时才有可见变化。",
  compactTidy: "紧凑布局",
  compactTidyTitle: "按轮廓线压紧相邻子树，不再为每个叶节点保留固定宽度的位置。",
  midwayDup: "基因重复节点居中",
  midwayDupTitle: "把基因重复节点放在其物种枝的中点（否则更靠近祖先端）。",
  branchLengths: "枝长",
  branchLengthsTitle: "用枝长作为时间近似来排布物种层级（假设树已定年或为超度量树）。需要文件中带枝长。",
  branchLengthsHint: "本文档没有物种枝长，因此该开关不会产生变化。",
  minimap: "小地图",
  reduceCrossings: "减少交叉",
  reduceCrossingsTitle: "自动镜像子树以减少转移交叉",
  crossingsReduced: "交叉已减少：{before} → {after}",
  crossingsNone: "未找到可进一步减少交叉的镜像方案",
  crossingsNoTransfers: "本文档没有可重排的转移",
  resetSwaps: "重置镜像",
  undo: "撤销",
  redo: "重做",
  annoTitle: "添加批注",
  annoPlaceholder: "输入批注内容…",
  annoColor: "颜色",
  annoRemove: "删除",
  annoClearAll: "清除全部批注",
  annoClearAllConfirm: "移除本文档的全部批注？可用 Ctrl+Z / ⌘Z 撤销。",
  annoCancel: "取消",
  style: "样式",
  curvedBranches: "弯曲枝",
  geneThickness: "基因枝线宽",
  symbolSize: "事件标记大小",
  transferCurve: "转移弧弯曲度",
  haloUnderGenes: "基因边下方衬底",
  eventGlyphs: "事件标记",
  supportValues: "置信度与支持度",
  tubeGradient: "物种枝渐变",
  copyHeatmap: "基因泳道占用热图",
  labelsSection: "标签",
  speciesNames: "物种名",
  geneTipNames: "现存基因名",
  internalGeneNames: "内部基因节点名",
  fullLabels: "完整标签",
  labelAngle: "角度",
  labelSize: "字号",
  labelBold: "加粗",
  labelItalic: "斜体",
  labelOffset: "标签偏移",
  labelAlign: "对齐",
  alignAuto: "自动",
  alignLeft: "左对齐",
  alignCenter: "居中对齐",
  alignRight: "右对齐",
  renameLabels: "批量重命名标签",
  findLabel: "查找",
  replaceWith: "替换为",
  renameScope: "范围",
  scopeSpecies: "物种标签",
  scopeGenes: "基因标签",
  scopeAll: "全部标签",
  renameApply: "应用",
  renameReset: "重置标签",
  renameHint: "点击画布上的标签可单独重命名。",
  labelEditedToast: "标签已重命名",
  labelResetToast: "标签已重置",
  layoutActions: "布局操作",
  layoutParams: "布局参数",
  pinOpen: "固定展开此区块",
  unpinOpen: "取消固定",
  legendVertical: "图例竖排",
  legendHorizontal: "图例横排",
  legendLocate: "已定位节点",
  viewTour: "新手导览",
  replayTour: "重新播放导览",
  orientation: "树朝向",
  orientTop: "根在上",
  orientBottom: "根在下",
  orientLeft: "根在左",
  orientRight: "根在右",
  hint: "提示：滚轮缩放、拖动平移；点击基因节点高亮其祖先与后代；点击物种枝以镜像该子树；按 Alt 或 Ctrl/⌘ 点击内部基因节点可折叠或展开；Shift 点击基因节点添加批注；点击空白处清除选择。",
  hintClickHighlight: "点击",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt / Ctrl / ⌘",
  hintHighlightAction: "高亮相关节点",
  collapseExpandAction: "折叠或展开",
  events: "事件与符号",
  geneFamilies: "基因家族",
  geneTree: "基因树",
  changeColor: "更改颜色",
  transferLegend: "转移弧",
  transferFilter: "转移",
  collapsedClade: "折叠演化支",
  leavesUnit: "个现存基因",
  expandHint: "按 Alt 或 Ctrl/⌘ 点击可展开",
  emptyFormats: "recPhyloXML、NHX、Newick",
  errorTitle: "无法解析该文件",
  errorHint: "支持格式：recPhyloXML（.recphyloxml / .recphylo / .xml）、NHX（.nhx）、Newick（.nwk / .newick）。请检查文件格式与编码。",
  errorRetry: "重新选择文件",
  errorBack: "返回上一份",
  errorSample: "装入示例",
  dropToOpen: "释放以打开",
  sampleShowcase: "完整示例",
  sampleCompare: "对比示例",
  sampleCompareB: "结果 B（以基因重复为主）",
  sampleNested: "嵌套示例",
  sampleNestedB: "共生体 → 宿主",
  parsing: "解析中…",
  parsingLarge: "正在打开较大的文件…",
  helpButton: "帮助",
  helpTitle: "帮助与快捷键",
  helpKeyboard: "键盘快捷键",
  helpMouse: "鼠标与触控",
  helpFit: "适应窗口",
  helpZoomInOut: "放大 / 缩小",
  helpClosePanel: "关闭面板 / 清除选择",
  helpSwitchTabs: "切换文档标签页 / 面板标签页",
  helpSaveAnnotation: "批注编辑器打开时保存批注",
  interactionsTitle: "图上操作",
  hintClear: "点击空白处清除选择",
  hintMirror: "点击物种枝以镜像该子树",
  mirrorHint: "点击以镜像此子树",
  openFailedToast: "无法打开：{names}",
  filterAllTrees: "所有支持的树文件",
  filterAnyFile: "文件",
  pngScaledToast: "图形在该 DPI 下过大：已缩小到约 {dpi} DPI 以适应平台的最大画布尺寸。",
  pdfRasterToast: "矢量 PDF 转换失败，已改为输出整页位图 PDF",
  viewShortcuts: "帮助与快捷键",
  nestedErrorPrefix: "嵌套文件错误：",
  species: "个物种",
  geneTreeUnit: "棵基因树",
  geneNodes: "个基因节点",
  paneGeneSymbiont: "基因 → 共生体",
  paneSymbiontHost: "共生体 → 宿主",
  paneSymbiontHostNamed: "共生体 → 宿主（{name}）",
  zoomIn: "放大",
  zoomOut: "缩小",
  zoomLimit: "已到缩放边界",
  fit: "适应窗口",
  analyze: "分析面板",
  panelSearch: "搜索",
  panelStats: "结果统计",
  panelNetwork: "转移网络",
  panelAnnotate: "批注",
  panelDiff: "差异对比",
  noAnnotations: "还没有批注。Shift 点击基因节点（或使用批注模式）添加一条。",
  diffLegend: "文档间不一致的节点",
  diffHide: "隐藏高亮",
  multiOpenTitle: "你想以哪种方式打开 {n} 个文件？",
  mergeMode: "合并为一个文档",
  tabMode: "每个文件一个标签页",
  mergedToast: "已将 {n} 个文件合并为一个文档",
  resetAll: "全部重置",
  resetAllTitle: "将所有布局与样式选项重置为默认",
  prefsTitle: "偏好设置",
  prefsGroupAppearance: "外观",
  prefsGroupExport: "导出",
  prefsGroupWorkspace: "工作区",
  prefsGroupHelp: "帮助",
  prefsGroupReset: "重置",
  defaultView: "默认布局与显示选项",
  saveDefaultView: "保存为默认布局",
  clearDefaultView: "清除默认布局",
  restorePrefs: "重置偏好设置",
  onboardSkip: "跳过",
  onboardNext: "下一步",
  onboardPrev: "上一步",
  onboardDone: "完成",
  tourStep1Title: "控制面板",
  tourStep1Body: "左侧面板用于构图：方向、间距、样式与标签，所有调整都会实时反映在画布上。",
  tourStep2Title: "分析面板",
  tourStep2Body: "右侧面板用于检视：搜索与筛选、结果统计、转移网络与数据检查。",
  tourStep3Title: "画布",
  tourStep3Body: "点击基因节点高亮其祖先与后代，Shift 点击基因节点添加批注，按 Alt 或 Ctrl/⌘ 点击内部基因节点可折叠，点击物种枝以镜像该子树。",
  tourStep4Title: "嵌套与对比视图",
  tourStep4Body: "添加嵌套层可展示基因 → 共生体 → 宿主三层视图；或载入另一份调和结果进行对比。",
  tourStep5Title: "导出",
  tourStep5Body: "可将图形导出为 PNG / SVG / PDF / HTML，或保存整个会话以便以后重新打开。",
  closeConfirmTitle: "关闭标签页？",
  closeConfirmBody: "此文档有未保存的更改，确定关闭吗？",
  searchPlaceholder: "搜索名称、物种、事件或批注…",
  useRegex: "正则表达式",
matchCount: "个匹配项",
noMatches: "无匹配项",
noEvents: "无事件",
  prevMatch: "上一个",
  nextMatch: "下一个",
  filterEvents: "按事件类型",
  filterEvent: "显示包含此事件的节点",
  filterFamilies: "按基因家族",
  clearFilters: "清除筛选",
  statsTotals: "汇总",
  statsByFamily: "按基因家族",
  statsTransferMatrix: "物种间转移计数矩阵",
  statsBySpecies: "按物种",
  topOfShort: "前 {n}",
  exportCsv: "导出 CSV",
  donor: "供体",
  recipient: "受体",
  countCol: "次数",
  copiesCol: "非丢失基因节点",
  copiesUnit: "个非丢失基因节点",
  nodesCol: "节点数",
  statsNodes: "节点数",
  statsNodesLimited: "表格已截断（前 {n} 行）",
  colNum: "编号",
  colName: "名称",
  colType: "类型",
  colEvent: "事件",
  nodeLeaf: "现存基因",
  nodeInternal: "内部节点",
  geneTreesCol: "基因树",
  eventDistribution: "事件分布",
  filterConfidence: "置信度范围",
  searchOnlyMatch: "仅显示匹配项",
  rendering: "渲染中…",
  pngResolution: "PNG 输出密度（DPI）",
  noTransfers: "无转移事件",
  panelChecks: "数据检查",
  checkAllGood: "全部数据检查通过",
  checkUnknownSpecies: "基因节点引用了物种树中不存在的物种",
  checkDonorNoTransferBack: "出枝转移节点的转移到达缺失（直接或经树外分叉）",
  checkTransferBackNoParent: "转移到达缺少父节点",
  checkLeafInternalSpecies: "现存基因位于物种树内部节点",
  checkNoSpecies: "基因节点未分配物种",
  checkDuplicateSpecies: "物种树中存在重名物种",
  checksWithIssues: "{m} 项检查中 {n} 项需要关注",
  checksPassing: "通过",
  checkNameUnknownSpecies: "物种引用",
  checkNameDuplicateSpecies: "物种名称唯一性",
  checkNameNoSpecies: "物种归属",
  checkNameLeafInternalSpecies: "现存基因位于物种树末端",
  checkNameDonorNoTransferBack: "出枝转移的转移到达",
  checkNameTransferBackNoParent: "转移到达的父节点",
  checkTransferBackNoDonor: "转移到达的父节点不是出枝转移或树外分叉节点",
  checkNameTransferBackNoDonor: "转移到达的供体节点",
  checkBifurcationNoTransferBack: "树外分叉节点的转移到达缺失",
  checkNameBifurcationNoTransferBack: "树外分叉的转移到达",
  checkTerminalEventWithChildren: "末端事件（基因丢失 / 现存基因）含有子节点",
  checkNameTerminalEventWithChildren: "末端事件",
  checkNonBinaryNode: "物种形成 / 基因重复节点不是二分支（应有两个子节点）",
  checkNameNonBinaryNode: "物种形成 / 基因重复的子节点数",
  checkTransferBackwardsInTime: "转移到祖先物种（时间方向倒退）",
  checkNameTransferBackwardsInTime: "转移的时间方向",
  overviewMode: "放大后显示标签",
  renameLabel: "重命名标签",
  renameAllSameName: "应用到所有 {n} 个同名标签",
  menuNew: "新建文档",
  closeTabMenu: "关闭标签页",
  closeOthers: "关闭其他标签页",
  closeAll: "关闭所有标签页",
  pasteTree: "从剪贴板粘贴树",
  pasteTreeEmpty: "剪贴板中没有文本",
  pasteTreeOk: "已打开粘贴的树",
  loadSpeciesTree: "载入物种树（Newick）…",
  speciesTreeLoaded: "已载入物种树「{name}」，之后打开的基因树将使用它",
  speciesTreeCleared: "已清除外部物种树",
  saveSessionAs: "会话另存为…",
  openSession: "打开会话…",
  exportRecPhylo: "recPhyloXML（完整导出，可重新读入）",
  exportNhxExt: "NHX（含事件标签的扩展格式）…",
  nhxDialectTitle: "关于 NHX 导出",
  nhxLossList: "此 NHX 文件不包含：",
  nhxExportAnyway: "仍要导出 NHX",
  nhxUseRecPhylo: "改用 recPhyloXML",
  pngScreen: "屏幕 2 倍尺寸（192 DPI）",
  dpiCustomLabel: "自定义 DPI",
  pixelEstimate: "输出约 {w} × {h} 像素",
  transparentBg: "透明背景",
  whiteBg: "白色背景",
  themeBg: "主题背景",
  copySvg: "复制 SVG",
  copyPng: "复制 PNG",
  copyOk: "已复制到剪贴板",
  copyFailed: "剪贴板不可用",
  aboutTitle: "关于 PhyloRecViewer",
  aboutVersion: "版本",
  aboutCitation: "引用信息",
  aboutLicense: "MIT 许可证。完全离线运行，无遥测。",
  copyDiagnostics: "复制诊断信息",
  dataHealth: "数据检查",
  parseWarnings: "解析警告",
  nestedWarningsLabel: "嵌套层警告",
  nestedWarningsNamed: "嵌套层警告（{name}）",
  compareWarningsLabel: "对比层警告",
  compareWarningsNamed: "对比层警告（{name}）",
  exportReport: "导出数据检查报告",
  locateNode: "定位",
  locateNodeTitle: "在画布中定位该节点",
  levelError: "错误",
  levelWarning: "警告",
  levelInfo: "说明",
  splitSideBySide: "左右分栏",
  linkViews: "联动视图",
  diffMatched: "匹配 {n} 个",
  agreePct: "节点一致率 {p}%",
  diffOnlyA: "仅主文档有 {n} 个",
  diffOnlyB: "仅对比文档有 {n} 个",
  speciesAgreeShort: "物种归属一致率 {p}%",
  diffColStatus: "差异维度",
  diffOnlyDiff: "只看差异",
  exportDiffCsv: "导出差异（CSV）",
  scopePrimary: "主文档",
  scopeNote: "仅覆盖主文档",
  arrivalsCol: "转移到达",
  topOf: "前 {n} / 共 {total}",
  topOfSpecies: "前 {n} / 共 {total} 个物种",
  unknownSpeciesRow: "（无物种）",
  nodeLoss: "基因丢失",
  regexInvalid: "正则表达式无效，已改用普通文本匹配。",
  resultsList: "匹配结果",
  restoreTitle: "恢复上次会话？",
  restoreBody: "有一份自动保存的会话快照（{time}）。",
  restoreAccept: "恢复",
  restoreDecline: "从空白开始",
  restoreCleared: "已丢弃上次的快照",
  presentation: "演示模式",
  exitPresentation: "退出演示（Esc）",
  unsavedChanges: "未保存的更改",
  close: "关闭",
  autosaveSection: "自动保存",
  autosaveOn: "上次保存 {time}",
  autosaveNone: "本次会话尚未保存",
  autosaveFailedLabel: "自动保存失败，请导出会话文件以免丢失数据。",
  clearAutosave: "清除自动保存数据",
  clearAutosaveConfirm: "丢弃已保存的快照？下次刷新将从空白标签页开始。",
  clearAutosaveDone: "已清除自动保存数据",
  recoverySection: "恢复",
  recoveryFound: "有一份恢复失败的快照已保留。可导出以检查或重新导入：",
  recoveryExport: "导出快照（JSON）",
  renameTab: "重命名标签页",
  tabTooltipMerged: "由 {n} 个源文件合并而成",
  batchPreview: "待替换标签：{n} 个",
  batchPreviewEmpty: "没有标签匹配该模式",
  batchInvalidRegex: "正则表达式无效",
  inspectorTitle: "节点详情",
  inspSpecies: "物种",
  inspTimeSlice: "时间片",
  inspConfidence: "置信度",
  inspSupport: "支持度",
  inspBranch: "枝长",
  inspFamily: "基因家族",
  inspParent: "父节点",
  inspChildren: "子节点",
  inspDonor: "供体",
  inspRecipient: "受体",
  inspAnnotation: "批注",
  inspCopy: "复制详情",
  inspLocate: "定位",
  inspNone: "—",
  mergeBase: "基准物种树：{name}",
  mergeConflict: "{n} 个文件的物种列表不同",
  mergeNoConflict: "未检测到物种名称差异",
  warningSuffix: " + 解析警告",
  valueSuffix: "数值",
  valueIncrease: "增大",
  valueDecrease: "减小",
  patternPlaceholder: "正则表达式…",
  samplesHeading: "示例",
  removeSpeciesTree: "移除物种树",
  background: "背景",
  paneComparison: "对比文档",
  paneTagA: "主文档",
  paneTagB: "对比文档",
  notApplicable: "—",
  parseEmptyFile: "文件为空。请选择包含树数据的 recPhyloXML、NHX 或 Newick 文件。",
  supportedFormats: "支持格式：{formats}。",
  mergedTabTitle: "{name}（{n} 个基因家族）",
  fileTooLarge: "超过 64 MiB 上限的文件：{names}",
  tabFileOpenFailed: "标签页「{title}」中的文件打开失败",
  alreadyOpenTab: "「{name}」已打开 — 已切换到该标签页",
  tabCorrupt: "无法打开标签页「{title}」：文档已损坏或来自其他版本",
  nestedSwitchToast: "已切换到嵌套视图，对比层已移除",
  compareSwitchToast: "已切换到对比视图，嵌套层已移除",
  nestedAddedToast: "已添加嵌套层级：{name}",
  compareAddedToast: "已添加对比：{name}",
  restoreFailed: "上次的会话无法恢复：{names}。原始快照已保留。",
  someDocsFailed: "部分文档无法恢复：{names}",
  unknownFile: "未知文件",
  listSeparator: "、",
  autosaveUnavailable: "自动保存不可用：本地存储已满或被禁用。请导出会话文件。",
  diffShow: "显示高亮",
  resizeHint: "拖动以调整宽度",
  exportAction: "导出",
  labelSearchPlaceholder: "标签或匹配模式…",
  zoomLevel: "缩放",
  exportDefaultStem: "调和结果",
  pastedTreeName: "粘贴的树",
  unsavedSource: "（未保存）",
  splitStacked: "上下分栏",
  crashTitle: "PhyloRecViewer 出错了",
  crashBody: "你的批注与布局仍在内存中，请先保存会话再重新加载。",
  crashExport: "保存会话…",
  crashReload: "重新加载",
  supportBootstrap: "自展支持率",
  supportPosterior: "后验概率",
  supportAlrt: "aLRT 支持值",
  supportUnknown: "支持类型未注明",
  checkNameSameSpeciesTransfer: "种内转移",
  checkSameSpeciesTransfer: "一次转移的供体与受体为同一物种；这可能是预期的种内基因转移（同一物种内不同基因谱系之间），请结合模型判断 — 这不算时间方向错误。",
  checkNameTransferTimeUnknown: "转移方向",
  checkTransferTimeUnknown: "供体事件或转移到达事件缺少时间片，且两个物种不构成祖先与后代关系，因此无法判定时间方向（拓扑深度不是时间）。",
  checkNameConfidenceScaleSuspect: "事件置信度范围",
  checkConfidenceScaleSuspect: "某个事件置信度大于 1 且不超过 100；置信度筛选按 0–1 处理。",
  checkNameNegativeBranchLength: "负值 / 非有限值",
  checkNegativeBranchLength: "某个枝长或时间片为负或非有限值；绘图时按 0 处理。",
  checkNameVerticalEdgeAcrossClades: "无关物种之间的基因边",
  checkVerticalEdgeAcrossClades: "一条无转移的基因边连接的两个物种不构成祖先与后代关系 — 没有转移时不可能发生，请检查各事件记录的物种。",
  event: {
    speciation: "物种形成",
    duplication: "基因重复",
    loss: "基因丢失",
    branchingOut: "出枝转移",
    bifurcationOut: "树外分叉",
    transferBack: "转移到达",
    leaf: "现存基因",
  },
};

/**
 * "1 gene trees" and "3 matches" read wrong in English. The dictionaries carry
 * the plural form, so singularise it when the count is one; Chinese units take
 * no plural suffix and are left untouched. Exported so the copy-style guard can
 * require every counted unit to be declared here (STYLE §3.6).
 */
export const SINGULAR_UNITS: Record<string, string> = {
  "gene trees": "gene tree",
  "gene nodes": "gene node",
  matches: "match",
  warnings: "warning",
  species: "species",
  "extant genes": "extant gene",
  "non-loss gene nodes": "non-loss gene node",
};

export function formatConfidence(v: number | string): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}

/**
 * The two BCP-47 tags a locale maps to, in one place: `htmlLang` for the
 * document's `lang` (and the HTML export), `intlTag` for `Intl` and date
 * formatting. Machine tags, so they stay outside `Dict` - but a component must
 * not spell them out again in a `locale === "zh" ? …` ternary (STYLE 5.2).
 */
export const htmlLang: Record<Locale, string> = { zh: "zh-CN", en: "en" };
export const intlTag: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

export function formatCount(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTag[locale]).format(n);
}

export function countLabel(n: number, unit: string): string {
  if (n !== 1) return `${n} ${unit}`;
  // Stripping a trailing "s" would corrupt "matches" and "species", so the few
  // units the app counts are mapped explicitly; anything else is left as-is.
  return `1 ${SINGULAR_UNITS[unit] ?? unit}`;
}

export const translations: Record<Locale, Dict> = { zh, en };

/** Single source for the accepted file types shown in errors and menus. */
export const SUPPORTED_FORMATS =
  "recPhyloXML (.recphyloxml / .recphylo / .xml), NHX (.nhx), Newick (.nwk / .newick)";

/** Hook: current-locale dictionary. */
export function useT(): Dict {
  const locale = useStore((s) => s.locale);
  return translations[locale];
}

/**
 * Current-locale dictionary for code that runs OUTSIDE React and therefore
 * cannot call `useT()` - today the SVG/PDF exporters, which build their legend
 * in plain functions (and head-lessly through `npm run cli`). Reading the labels
 * here instead of writing them out again is what keeps an exported legend
 * literally identical to the on-screen one and removes the hard-coded English
 * fallback (STYLE §5.3).
 */
export function currentDict(): Dict {
  const locale = useStore.getState().locale;
  return translations[locale] ?? translations.en;
}
