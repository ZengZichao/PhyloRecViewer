import type { EventType } from "./model/types";
import { useStore } from "./state/store";

export type Locale = "zh" | "en";

/** All user-facing UI strings (data like node names is never translated). */
export interface Dict {
  // menu bar / toolbar
  menuFile: string;
  menuView: string;
  menuLanguage: string;
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
  agree: string;
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
  geneSpacing: string;
  speciesSpacing: string;
  speciesWidth: string;
  alignTips: string;
  compactTidy: string;
  compactTidyTitle: string;
  midwayDup: string;
  midwayDupTitle: string;
  branchLengths: string;
  minimap: string;
  reduceCrossings: string;
  reduceCrossingsTitle: string;
  resetSwaps: string;
  undo: string;
  redo: string;
  annoTitle: string;
  annoPlaceholder: string;
  annoColor: string;
  annoRemove: string;
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
  // tree orientation
  orientation: string;
  orientTop: string;
  orientBottom: string;
  orientLeft: string;
  orientRight: string;
  hint: string;
  /** Title of the tips box, centered above the bullet list. */
  tipsTitle: string;
  /** The individual tip lines, listed at the bottom of the sidebar. */
  tips: string[];
  /** Hover hint on a gene node: the click gestures it offers. */
  hintClickHighlight: string;
  hintShiftAnnotate: string;
  /** kbd chip for the collapse/expand gesture: Canvas.onGeneClick fires on
   *  Alt/⌥ OR ⌘ (metaKey), so all three names belong in the chip. */
  hintAltCollapse: string;
  hintHighlightAction: string;
  /** Hover-hint wording for the collapse/expand gesture. */
  hintCollapseAction: string;
  collapseExpandAction: string;
  // legend
  events: string;
  geneFamilies: string;
  geneTree: string;
  changeColor: string;
  transferLegend: string;
  /** Wording of the collapsed-clade tooltip. */
  collapsedClade: string;
  leavesUnit: string;
  expandHint: string;
  // app states + stats
  emptyBody: string;
  errorTitle: string;
  errorHint: string;
  /** Error panel action that takes the user back to the file picker. */
  errorRetry: string;
  /** Error panel action that returns to the document shown before the failed one. */
  errorBack: string;
  /** Error panel action that loads one of the bundled samples. */
  errorSample: string;
  dropToOpen: string;
  emptyOrSample: string;
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
  expandAll: string;
  collapseAll: string;
  /** The one-line per-species summary stats show while a section is folded. */
  /** The preferences dialog. */
  prefsTitle: string;
  defaultView: string;
  saveDefaultView: string;
  saveDefaultViewTitle: string;
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
donutTotal: string;
  prevMatch: string;
  nextMatch: string;
  filterEvents: string;
  filterFamilies: string;
  clearFilters: string;
  statsTotals: string;
  statsByFamily: string;
  statsTransferMatrix: string;
  statsBySpecies: string;
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
  eventDistribution: string;
  transferOverlayNote: string;
  filterConfidence: string;
  /** Search: "show only matching nodes" toggle. */
  searchOnlyMatch: string;
  /** Lightweight "tree is rearranging" indicator. */
  rendering: string;
  pngResolution: string;
  noTransfers: string;
  networkHint: string;
  panelChecks: string;
  checkAllGood: string;
  checkUnknownSpecies: string;
  checkDonorNoTransferBack: string;
  checkTransferBackNoParent: string;
  checkLeafInternalSpecies: string;
  checkNoSpecies: string;
  checkDuplicateSpecies: string;
  checksIntro: string;
  checksWithIssues: string;
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
  locateFirst: string;
  levelError: string;
  levelWarning: string;
  levelInfo: string;
  splitSideBySide: string;
  linkViews: string;
  diffMatched: string;
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
  pinHighlight: string;
  unpinHighlight: string;
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
  tabCorrupt: string;
  nestedSwitchToast: string;
  compareSwitchToast: string;
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
  langNameZh: "中文",
  langNameEn: "English",
  openFile: "Open file",
  nestedLevel: "+ Nested level",
  nestedTitle: "Add a nested (host) reconciliation for a 3-level view",
  nestedPrefix: "Nested: {name}",
  nestedRemoveTitle: "Nested level (click to remove): {name}",
  compareLevel: "+ Compare",
  compareTitle: "Load an alternative reconciliation of the same family to compare",
  comparePrefix: "Compare: {name}",
  compareRemoveTitle: "Comparison (click to remove): {name}",
  compareErrorPrefix: "Comparison file error:",
  agree: "in agreement",
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
  levelHeight: "Level height",
  geneSpacing: "Gene spacing",
  speciesSpacing: "Species spacing",
  speciesWidth: "Species branch thickness",
  alignTips: "Align tips",
  compactTidy: "Compact layout",
  compactTidyTitle: "Pack sibling subtrees closer together (contour packing) instead of using fixed-width leaf slots.",
  midwayDup: "Center duplications",
  midwayDupTitle: "Place gene-duplication nodes at the midpoint of their species branch (otherwise nearer the ancestor).",
  branchLengths: "Branch lengths",
  minimap: "Minimap",
  reduceCrossings: "Reduce crossings",
  reduceCrossingsTitle: "Automatically mirror subtrees to reduce transfer crossings",
  resetSwaps: "Reset mirroring",
  undo: "Undo",
  redo: "Redo",
  annoTitle: "Annotate",
  annoPlaceholder: "Add a note…",
  annoColor: "Color",
  annoRemove: "Remove",
  annoCancel: "Cancel",
  style: "Style",
  curvedBranches: "Curved branches",
  geneThickness: "Gene tree thickness",
  symbolSize: "Symbol size",
  transferCurve: "Transfer curve",
  haloUnderGenes: "Halo under genes",
  eventGlyphs: "Event glyphs",
  supportValues: "Support values",
  tubeGradient: "Tube gradient",
  copyHeatmap: "Heatmap of overlapping copies",
  labelsSection: "Labels",
  speciesNames: "Species names",
  geneTipNames: "Gene tip names",
  internalGeneNames: "Internal gene node names",
  fullLabels: "Full labels",
  labelAngle: "Angle",
  labelSize: "Size",
  labelBold: "Bold",
  labelItalic: "Italic",
  labelOffset: "Offset",
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
  legendVertical: "Vertical layout",
  legendHorizontal: "Horizontal layout",
  legendLocate: "Located node",
  viewTour: "Tutorial",
  orientation: "Orientation",
  orientTop: "Root top",
  orientBottom: "Root bottom",
  orientLeft: "Root left",
  orientRight: "Root right",
  hint: "Tip: scroll to zoom, drag to pan. Click a gene node to highlight its lineage; click a species branch to mirror it; Alt/⌥- or ⌘-click an internal gene node to collapse / expand; Shift-click a node to annotate; click empty space to clear.",
  tipsTitle: "Tips",
  tips: [
    "Scroll to zoom, drag to pan",
    "Click a gene node to highlight its lineage",
    "Click a species branch to mirror it",
    "Alt/⌥- or ⌘-click an internal gene node to collapse / expand",
    "Shift-click a node to annotate",
    "Click empty space to clear",
  ],
  hintClickHighlight: "Click",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt / ⌥ / ⌘",
  hintHighlightAction: "highlight lineage",
  hintCollapseAction: "collapse / expand",
  collapseExpandAction: "Collapse or expand a clade",
  events: "Evolutionary events",
  geneFamilies: "Gene families",
  geneTree: "Gene tree",
  changeColor: "Change color",
  transferLegend: "Transfer",
  collapsedClade: "Collapsed clade",
  leavesUnit: "extant genes",
  expandHint: "Alt/⌥- or ⌘-click to expand",
  emptyBody: "Drop a file here, or open one from the File menu.",
  errorTitle: "Could not parse this file",
  errorHint: "Supported: recPhyloXML (.recphyloxml / .recphylo / .phyloxml / .xml), NHX (.nhx), Newick (.nwk / .newick). Check the file format and encoding.",
  errorRetry: "Choose another file",
  errorBack: "Back to previous",
  errorSample: "Load sample",
  dropToOpen: "Drop to open",
  emptyOrSample: "Load sample:",
  sampleShowcase: "Showcase",
  sampleCompare: "Comparison",
  sampleCompareB: "Outcome B (duplication-rich)",
  sampleNested: "Nested",
  sampleNestedB: "Symbiont → Host",
  parsing: "Parsing…",
  parsingLarge: "Large file — this may take a moment…",
  helpButton: "Help",
  helpTitle: "Shortcuts & interactions",
  helpKeyboard: "Keyboard",
  helpMouse: "Mouse & touch",
  helpFit: "Fit to window",
  helpZoomInOut: "Zoom in / out",
  helpClosePanel: "Close panel / clear selection",
  helpSwitchTabs: "Switch document tab / panel tab",
  helpSaveAnnotation: "Save the annotation while its editor is open",
  interactionsTitle: "Interactions",
  hintClear: "Click empty space to clear",
  hintMirror: "Click a species branch to mirror it",
  mirrorHint: "Click to mirror this subtree",
  openFailedToast: "Could not open: {names}",
  filterAllTrees: "All supported trees",
  filterAnyFile: "File",
  pngScaledToast: "Drawing is very large: resolution was scaled down (≈ {dpi} DPI) to fit the canvas limit",
  pdfRasterToast: "Vector PDF conversion failed; a full-page raster PDF was written instead",
  viewShortcuts: "Shortcuts & help",
  nestedErrorPrefix: "Nested file error:",
  species: "species",
  geneTreeUnit: "gene trees",
  geneNodes: "gene nodes",
  paneGeneSymbiont: "Gene → Symbiont",
  paneSymbiontHost: "Symbiont → Host",
  paneSymbiontHostNamed: "Symbiont → Host ({name})",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to window",
  analyze: "Analysis",
  panelSearch: "Search & filter",
  panelStats: "Statistics",
  panelNetwork: "Transfer network",
  panelAnnotate: "Annotations",
  panelDiff: "Differences",
  noAnnotations: "No annotations yet. Shift-click a gene node (or use annotation mode) to add one.",
  diffLegend: "Nodes differing between files",
  diffHide: "Hide highlight",
  multiOpenTitle: "How do you want to open the {n} files?",
  mergeMode: "Merge into one document",
  tabMode: "One tab per file",
  mergedToast: "Merged {n} files into one document",
  resetAll: "Reset all",
  resetAllTitle: "Reset every layout and style option to its default",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  prefsTitle: "Preferences",
  defaultView: "Default view",
  saveDefaultView: "Set as default view",
  saveDefaultViewTitle: "Apply the current layout / style to every new document",
  clearDefaultView: "Clear default view",
  restorePrefs: "Reset preferences",
  onboardSkip: "Skip",
  onboardNext: "Next",
  onboardPrev: "Back",
  onboardDone: "Done",
  tourStep1Title: "Controls — shape the drawing",
  tourStep1Body: "The left panel composes the picture: orientation, spacing, style and labels. Everything here updates the canvas live.",
  tourStep2Title: "Analysis — read the data",
  tourStep2Body: "The right panel inspects it: search & filter, statistics, the transfer network and data checks.",
  tourStep3Title: "Canvas — nodes are interactive",
  tourStep3Body: "Click a gene node to highlight its lineage, Shift-click to annotate, Alt/⌥- or ⌘-click an internal node to collapse it. Click a species branch to mirror it.",
  tourStep4Title: "Nested & compare views",
  tourStep4Body: "Add a nested level for a 3-level gene → symbiont → host view, or load a second reconciliation to compare.",
  tourStep5Title: "Export",
  tourStep5Body: "Export the drawing as PNG / SVG / PDF / HTML, or save the whole session to reopen later.",
  closeConfirmTitle: "Close tab?",
  closeConfirmBody: "This document has unsaved annotations, mirroring or colors. Close anyway?",
  searchPlaceholder: "Search names or species…",
  useRegex: "Regex",
matchCount: "matches",
noMatches: "No matches",
noEvents: "No events",
donutTotal: "Total events",
  prevMatch: "Previous",
  nextMatch: "Next",
  filterEvents: "By event type",
  filterFamilies: "By gene family",
  clearFilters: "Clear",
  statsTotals: "Summary",
  statsByFamily: "By gene family",
  statsTransferMatrix: "Transfer matrix",
  statsBySpecies: "By species (top {n})",
  exportCsv: "Export CSV",
  donor: "Donor",
  recipient: "Recipient",
  countCol: "Count",
  copiesCol: "Non-loss lineages",
  copiesUnit: "non-loss lineages",
  nodesCol: "Nodes",
  statsNodes: "Nodes",
  statsNodesLimited: "Table truncated (first {n} rows)",
  colNum: "#",
  colName: "Name",
  colType: "Type",
  colEvent: "Event",
  nodeLeaf: "Tip node",
  nodeInternal: "Internal node",
  eventDistribution: "Event distribution",
  transferOverlayNote: "Transfer arrivals are an overlay event, not part of the composition above; the count is shown in Summary.",
  filterConfidence: "Confidence range",
  searchOnlyMatch: "Show only matches",
  rendering: "Rendering…",
  pngResolution: "PNG resolution (DPI)",
  noTransfers: "No transfers",
  networkHint: "Nodes = species, arrows = transfers (thicker = more). Hover to focus.",
  panelChecks: "Data checks",
  checkAllGood: "All data checks passed",
  checkUnknownSpecies: "references to species missing from the species tree",
  checkDonorNoTransferBack: "transfer donors without a transfer-arrival child",
  checkTransferBackNoParent: "transfer arrivals without a donor lineage",
  checkLeafInternalSpecies: "extant genes placed on internal (non-leaf) species",
  checkNoSpecies: "gene nodes with no species assignment",
  checkDuplicateSpecies: "duplicated species names in the species tree",
  checksIntro: "Structural checks on the loaded data:",
  checksWithIssues: "{n} of {m} checks flagged",
  checkNameUnknownSpecies: "Species references resolve",
  checkNameDuplicateSpecies: "Species names are unique",
  checkNameNoSpecies: "Every gene has a species",
  checkNameLeafInternalSpecies: "Extant genes on leaf species",
  checkNameDonorNoTransferBack: "Transfer donors are paired",
  checkNameTransferBackNoParent: "Transfer arrivals have a donor",
  checkTransferBackNoDonor: "transfer arrivals whose parent is not a donor",
  checkNameTransferBackNoDonor: "Transfer arrivals sit under a donor",
  checkBifurcationNoTransferBack: "bifurcation donors with no transferred child",
  checkNameBifurcationNoTransferBack: "Bifurcation donors are paired",
  checkTerminalEventWithChildren: "terminal (loss / extant gene) events that have children",
  checkNameTerminalEventWithChildren: "Loss / extant events are leaves",
  checkNonBinaryNode: "speciation / duplication nodes that are not binary",
  checkNameNonBinaryNode: "Speciation / duplication are binary",
  checkTransferBackwardsInTime: "transfers into an ancestor species (backwards in time)",
  checkNameTransferBackwardsInTime: "Transfers move forward in time",
  overviewMode: "Overview mode — zoom in to see labels",
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
  exportRecPhylo: "recPhyloXML (lossless round-trip)",
  exportNhxExt: "NHX (extended dialect)…",
  nhxDialectTitle: "About the NHX export",
  nhxLossList: "This NHX file will not include:",
  nhxExportAnyway: "Export NHX anyway",
  nhxUseRecPhylo: "Use recPhyloXML instead",
  pngScreen: "Screen 2× (192 DPI)",
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
  aboutCitation: "Citation",
  aboutLicense: "Released under the MIT License. Runs fully offline; no telemetry.",
  copyDiagnostics: "Copy diagnostics",
  dataHealth: "Data checks",
  parseWarnings: "Parser warnings",
  nestedWarningsLabel: "Nested layer warnings",
  nestedWarningsNamed: "Nested layer warnings ({name})",
  compareWarningsLabel: "Compare layer warnings",
  compareWarningsNamed: "Compare layer warnings ({name})",
  exportReport: "Export quality report",
  locateFirst: "Scroll to first match",
  levelError: "Error",
  levelWarning: "Warning",
  levelInfo: "Note",
  splitSideBySide: "Side by side",
  linkViews: "Link views",
  diffMatched: "{n} matched",
  diffOnlyA: "{n} only in A",
  diffOnlyB: "{n} only in B",
  speciesAgreeShort: "{p}% species match",
  diffColStatus: "Status",
  diffOnlyDiff: "Show differences only",
  exportDiffCsv: "Export differences (CSV)",
  scopePrimary: "Primary document",
  scopeNote: "Covers the primary document only",
  arrivalsCol: "Incoming transfers",
  topOf: "Top {n} of {total}",
  topOfSpecies: "Top {n} of {total} species",
  unknownSpeciesRow: "(no species)",
  nodeLoss: "Loss",
  regexInvalid: "Invalid regular expression — plain-text matching is used instead",
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
  autosaveOn: "On — last saved {time}",
  autosaveNone: "On — nothing saved yet this session",
  autosaveFailedLabel: "Autosave failed — export a session file to be safe",
  clearAutosave: "Clear autosave data",
  clearAutosaveDone: "Autosave data cleared",
  recoverySection: "Recovery",
  recoveryFound: "A snapshot that failed to restore was kept. Export it to inspect or re-import:",
  recoveryExport: "Export snapshot (JSON)",
  renameTab: "Rename tab",
  tabTooltipMerged: "Merged document — {n} source files",
  batchPreview: "Labels to replace: {n}",
  batchPreviewEmpty: "No label matches this pattern",
  batchInvalidRegex: "Invalid regular expression",
  inspectorTitle: "Inspector",
  inspSpecies: "Species",
  inspTimeSlice: "Time slice",
  inspConfidence: "Confidence",
  inspSupport: "Support",
  inspBranch: "Branch length",
  inspFamily: "Family",
  inspParent: "Parent",
  inspChildren: "Children",
  inspDonor: "Donor",
  inspRecipient: "Recipient",
  inspAnnotation: "Annotation",
  inspCopy: "Copy details",
  inspLocate: "Locate",
  inspNone: "—",
  mergeBase: "Species tree base: {name}",
  mergeConflict: "Files differing from the base species tree: {n}",
  mergeNoConflict: "All files share the base species tree",
  warningSuffix: " + parser warnings",
  valueSuffix: "value",
  patternPlaceholder: "pattern…",
  samplesHeading: "Samples",
  removeSpeciesTree: "Remove species tree",
  background: "Background",
  paneComparison: "Comparison",
  paneTagA: "A",
  paneTagB: "B",
  notApplicable: "—",
  parseEmptyFile: "The file is empty. Choose a recPhyloXML, NHX or Newick file with tree data.",
  supportedFormats: "Supported: {formats}.",
  mergedTabTitle: "{n} families · {name}",
  fileTooLarge: "Exceeds the 64 MiB limit: {names}",
  tabFileOpenFailed: "Failed to open a file in tab “{title}”",
  tabCorrupt: "Could not open tab “{title}”: the document is corrupt or from another version",
  nestedSwitchToast: "Switched to nested view; compare layer removed",
  compareSwitchToast: "Switched to compare view; nested layer removed",
  restoreFailed: "Last session could not be restored: {names}. The raw snapshot is kept.",
  someDocsFailed: "Some documents could not be restored: {names}",
  unknownFile: "unknown file",
  listSeparator: ", ",
  autosaveUnavailable: "Autosave unavailable: local storage is full or blocked. Export your session file.",
  diffShow: "Show highlight",
  resizeHint: "Drag to resize",
  exportAction: "Export",
  labelSearchPlaceholder: "Label or pattern…",
  pinHighlight: "Pin highlight",
  unpinHighlight: "Unpin highlight",
  zoomLevel: "Zoom",
  exportDefaultStem: "reconciliation",
  pastedTreeName: "Pasted tree",
  unsavedSource: "(unsaved)",
  splitStacked: "Split stacked",
  crashTitle: "PhyloRecViewer ran into an error",
  crashBody: "Your annotations and layout are still in memory. Save the session before reloading.",
  crashExport: "Save session…",
  crashReload: "Reload",
  supportBootstrap: "Bootstrap",
  supportPosterior: "Posterior",
  supportAlrt: "aLRT",
  supportUnknown: "Unknown",

  checkNameSameSpeciesTransfer: "Same-species transfer",
  checkSameSpeciesTransfer: "A transfer arrives in the species it left. This may be intended gene flow within one lineage — decide based on your model; it is not a time-direction error.",
  checkNameTransferTimeUnknown: "Transfer time not assessable",
  checkTransferTimeUnknown: "No time slice on the donor or the arrival, and the species are unrelated, so the time direction cannot be judged (topology depth is not time).",
  checkNameConfidenceScaleSuspect: "Confidence may use a 0–100 scale",
  checkConfidenceScaleSuspect: "A confidence / support value is above 1 and at most 100, which suggests a 0–100 percentage rather than a 0–1 probability; the confidence filter expects 0–1.",
  checkNameNegativeBranchLength: "Negative / invalid branch length",
  checkNegativeBranchLength: "A branch length is negative or not finite; it is clamped to 0 for drawing.",
  checkNameVerticalEdgeAcrossClades: "Vertical edge between unrelated clades",
  checkVerticalEdgeAcrossClades: "A non-transfer gene edge jumps from one species to an unrelated clade — impossible without a transfer. Check the species recorded on each event.",
  event: {
    speciation: "Speciation",
    duplication: "Duplication",
    loss: "Loss",
    branchingOut: "Transfer donor",
    bifurcationOut: "Bifurcation donor",
    transferBack: "Transfer arrival",
    leaf: "Extant gene",
  },
};

const zh: Dict = {
  menuFile: "文件",
  menuView: "视图",
  menuLanguage: "语言",
  langNameZh: "中文",
  langNameEn: "English",
  openFile: "打开文件",
  nestedLevel: "+ 嵌套层",
  nestedTitle: "添加嵌套的（宿主）调和结果以显示三层视图",
  nestedPrefix: "嵌套：{name}",
  nestedRemoveTitle: "嵌套层（点击移除）：{name}",
  compareLevel: "+ 对比",
  compareTitle: "载入同一家族的另一份调和结果进行对比",
  comparePrefix: "对比：{name}",
  compareRemoveTitle: "对比（点击移除）：{name}",
  compareErrorPrefix: "对比文件错误：",
  agree: "一致",
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
  levelHeight: "层高",
  geneSpacing: "基因间距",
  speciesSpacing: "物种间距",
  speciesWidth: "物种枝粗细",
  alignTips: "末端对齐",
  compactTidy: "紧凑布局",
  compactTidyTitle: "把相邻子树尽量靠拢排列（轮廓法），而不是使用固定宽度的叶槽。",
  midwayDup: "重复事件居中",
  midwayDupTitle: "把基因重复节点放在其物种分支的中点（否则更靠近祖先端）。",
  branchLengths: "分支长度",
  minimap: "小地图",
  reduceCrossings: "减少交叉",
  reduceCrossingsTitle: "自动镜像子树以减少转移交叉",
  resetSwaps: "重置镜像",
  undo: "撤销",
  redo: "重做",
  annoTitle: "添加批注",
  annoPlaceholder: "输入批注内容…",
  annoColor: "颜色",
  annoRemove: "删除",
  annoCancel: "取消",
  style: "样式",
  curvedBranches: "曲线分支",
  geneThickness: "基因树粗细",
  symbolSize: "符号大小",
  transferCurve: "转移弧度",
  haloUnderGenes: "基因描边",
  eventGlyphs: "事件符号",
  supportValues: "支持度",
  tubeGradient: "管道渐变",
  copyHeatmap: "重叠拷贝数（泳道）热力图",
  labelsSection: "标签",
  speciesNames: "物种名",
  geneTipNames: "末端基因名",
  internalGeneNames: "基因内部节点名称",
  fullLabels: "完整标签",
  labelAngle: "角度",
  labelSize: "字号",
  labelBold: "加粗",
  labelItalic: "斜体",
  labelOffset: "偏移",
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
  legendVertical: "图例垂直排布",
  legendHorizontal: "图例水平排布",
  legendLocate: "定位节点",
  viewTour: "新手指南",
  orientation: "树朝向",
  orientTop: "根在上",
  orientBottom: "根在下",
  orientLeft: "根在左",
  orientRight: "根在右",
  hint: "提示：滚轮缩放、拖拽平移；点击基因节点高亮其谱系；点击物种枝镜像；Alt/⌥ 或 ⌘ 单击内部基因节点折叠 / 展开；Shift 点击节点添加批注；点击空白清除。",
  tipsTitle: "提示",
  tips: [
    "滚轮缩放、拖拽平移",
    "点击基因节点高亮其谱系",
    "点击物种枝镜像",
    "Alt/⌥ 或 ⌘ 单击内部基因节点折叠 / 展开",
    "Shift 点击节点添加批注",
    "点击空白清除",
  ],
  hintClickHighlight: "点击",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt / ⌥ / ⌘",
  hintHighlightAction: "高亮谱系",
  hintCollapseAction: "折叠 / 展开",
  collapseExpandAction: "折叠或展开演化支",
  events: "演化事件",
  geneFamilies: "基因家族",
  geneTree: "基因树",
  changeColor: "更改颜色",
  transferLegend: "基因转移",
  collapsedClade: "折叠分支",
  leavesUnit: "个现存基因",
  expandHint: "Alt/⌥ 或 ⌘ 单击展开",
  emptyBody: "将文件拖拽到此处，或使用「文件」菜单打开。",
  errorTitle: "无法解析该文件",
  errorHint: "支持格式：recPhyloXML（.recphyloxml / .recphylo / .phyloxml / .xml）、NHX（.nhx）、Newick（.nwk / .newick）。请检查文件格式与编码。",
  errorRetry: "重新选择文件",
  errorBack: "返回上一份",
  errorSample: "装入示例",
  dropToOpen: "释放以打开",
  emptyOrSample: "装入示例：",
  sampleShowcase: "完整示例",
  sampleCompare: "对比示例",
  sampleCompareB: "结果 B（重复为主）",
  sampleNested: "嵌套示例",
  sampleNestedB: "共生体 → 宿主",
  parsing: "解析中…",
  parsingLarge: "文件较大 — 可能需要稍候…",
  helpButton: "帮助",
  helpTitle: "快捷键与操作",
  helpKeyboard: "键盘快捷键",
  helpMouse: "鼠标与触控",
  helpFit: "适应窗口",
  helpZoomInOut: "放大 / 缩小",
  helpClosePanel: "关闭面板 / 清除选择",
  helpSwitchTabs: "切换文档标签页 / 面板标签页",
  helpSaveAnnotation: "批注编辑器打开时保存批注",
  interactionsTitle: "图上操作",
  hintClear: "点击空白清除",
  hintMirror: "点击物种枝镜像",
  mirrorHint: "点击镜像此子树",
  openFailedToast: "无法打开：{names}",
  filterAllTrees: "所有受支持的树文件",
  filterAnyFile: "文件",
  pngScaledToast: "图形过大，分辨率已降低（约 {dpi} DPI）以适应画布上限",
  pdfRasterToast: "矢量 PDF 转换失败，已改为输出整页位图 PDF",
  viewShortcuts: "快捷键与帮助",
  nestedErrorPrefix: "嵌套文件错误：",
  species: "个物种",
  geneTreeUnit: "棵基因树",
  geneNodes: "个基因节点",
  paneGeneSymbiont: "基因 → 共生体",
  paneSymbiontHost: "共生体 → 宿主",
  paneSymbiontHostNamed: "共生体 → 宿主（{name}）",
  zoomIn: "放大",
  zoomOut: "缩小",
  fit: "适应窗口",
  analyze: "分析面板",
  panelSearch: "搜索与筛选",
  panelStats: "结果统计",
  panelNetwork: "转移网络",
  panelAnnotate: "批注",
  panelDiff: "差异",
  noAnnotations: "还没有批注。Shift 点击基因节点（或使用批注模式）添加一条。",
  diffLegend: "两个文件不一致的节点",
  diffHide: "隐藏高亮",
  multiOpenTitle: "你想以哪种方式打开 {n} 个文件？",
  mergeMode: "合并为一个文档",
  tabMode: "每个文件一个标签页",
  mergedToast: "已将 {n} 个文件合并为一个文档",
  resetAll: "全部重置",
  resetAllTitle: "将所有布局与样式选项重置为默认",
  expandAll: "全部展开",
  collapseAll: "全部收起",
  prefsTitle: "设置",
  defaultView: "默认视图",
  saveDefaultView: "设为默认视图",
  saveDefaultViewTitle: "对每个新文档应用当前的布局 / 样式",
  clearDefaultView: "清除默认视图",
  restorePrefs: "重置偏好",
  onboardSkip: "跳过",
  onboardNext: "下一步",
  onboardPrev: "上一步",
  onboardDone: "完成",
  tourStep1Title: "控制面板 — 构图",
  tourStep1Body: "左侧面板用于构图：方向、间距、样式与标签，所有调整都会实时反映在画布上。",
  tourStep2Title: "分析面板 — 读数据",
  tourStep2Body: "右侧面板用于检视：搜索与筛选、结果统计、转移网络与数据检查。",
  tourStep3Title: "画布 — 节点可交互",
  tourStep3Body: "点击基因节点高亮谱系，Shift 点击添加批注，Alt/⌥ 或 ⌘ 单击内部节点折叠 / 展开，点击物种枝镜像。",
  tourStep4Title: "嵌套与对比视图",
  tourStep4Body: "添加嵌套层可展示基因 → 共生体 → 宿主三层视图；或载入另一份调和结果进行对比。",
  tourStep5Title: "导出",
  tourStep5Body: "可将图形导出为 PNG / SVG / PDF / HTML，或保存整个会话以便以后重新打开。",
  closeConfirmTitle: "关闭标签页？",
  closeConfirmBody: "此文档包含未保存的批注、镜像或颜色。确定关闭吗？",
  searchPlaceholder: "搜索名称 / 物种…",
  useRegex: "正则表达式",
matchCount: "个匹配",
noMatches: "无匹配",
noEvents: "无事件",
donutTotal: "事件总数",
  prevMatch: "上一个",
  nextMatch: "下一个",
  filterEvents: "按事件类型",
  filterFamilies: "按基因家族",
  clearFilters: "清除筛选",
  statsTotals: "汇总",
  statsByFamily: "按基因家族",
  statsTransferMatrix: "转移矩阵",
  statsBySpecies: "按物种（前 {n}）",
  exportCsv: "导出 CSV",
  donor: "供体",
  recipient: "受体",
  countCol: "次数",
  copiesCol: "非丢失谱系",
  copiesUnit: "个非丢失谱系",
  nodesCol: "节点数",
  statsNodes: "节点",
  statsNodesLimited: "表格已截断（前 {n} 行）",
  colNum: "编号",
  colName: "名称",
  colType: "类型",
  colEvent: "事件",
  nodeLeaf: "末端节点",
  nodeInternal: "内部节点",
  eventDistribution: "事件分布",
  transferOverlayNote: "转移到达为叠加事件，不计入上面的构成占比；其计数见「汇总」。",
  filterConfidence: "置信度区间",
  searchOnlyMatch: "仅显示匹配",
  rendering: "渲染中…",
  pngResolution: "PNG 分辨率（DPI）",
  noTransfers: "无转移事件",
  networkHint: "节点 = 物种，箭头 = 转移（越粗越多）；悬停可聚焦。",
  panelChecks: "数据检查",
  checkAllGood: "全部数据检查通过",
  checkUnknownSpecies: "处引用了物种树中不存在的物种",
  checkDonorNoTransferBack: "个转移供体缺少转移到达子节点",
  checkTransferBackNoParent: "个转移到达缺少供体谱系",
  checkLeafInternalSpecies: "个现存基因位于内部（非叶）物种",
  checkNoSpecies: "个基因节点未分配物种",
  checkDuplicateSpecies: "处物种树中存在重名物种",
  checksIntro: "对载入数据的结构检查：",
  checksWithIssues: "{m} 项检查中 {n} 项异常",
  checkNameUnknownSpecies: "物种引用有效",
  checkNameDuplicateSpecies: "物种命名唯一",
  checkNameNoSpecies: "基因均有物种归属",
  checkNameLeafInternalSpecies: "现存基因落在叶物种",
  checkNameDonorNoTransferBack: "转移供体配对完整",
  checkNameTransferBackNoParent: "转移到达有供体谱系",
  checkTransferBackNoDonor: "转移到达的父节点不是供体",
  checkNameTransferBackNoDonor: "转移到达位于供体之下",
  checkBifurcationNoTransferBack: "二叉输出供体缺少转移子节点",
  checkNameBifurcationNoTransferBack: "二叉输出供体已配对",
  checkTerminalEventWithChildren: "末端事件（基因丢失 / 现存基因）却含有子节点",
  checkNameTerminalEventWithChildren: "基因丢失 / 现存基因事件为末端节点",
  checkNonBinaryNode: "物种形成 / 基因重复节点不是二叉",
  checkNameNonBinaryNode: "物种形成 / 基因重复应为二叉",
  checkTransferBackwardsInTime: "转移到祖先物种（时间倒流）",
  checkNameTransferBackwardsInTime: "转移沿时间正向",
  overviewMode: "总览模式 — 放大后显示标签",
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
  exportRecPhylo: "recPhyloXML（无损往返）",
  exportNhxExt: "NHX（扩展方言）…",
  nhxDialectTitle: "关于 NHX 导出",
  nhxLossList: "此 NHX 文件不包含：",
  nhxExportAnyway: "仍要导出 NHX",
  nhxUseRecPhylo: "改用 recPhyloXML",
  pngScreen: "屏幕 2×（192 DPI）",
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
  aboutCitation: "引用",
  aboutLicense: "基于 MIT 许可证发布。完全离线运行，无遥测。",
  copyDiagnostics: "复制诊断信息",
  dataHealth: "数据检查",
  parseWarnings: "解析警告",
  nestedWarningsLabel: "嵌套层警告",
  nestedWarningsNamed: "嵌套层警告（{name}）",
  compareWarningsLabel: "对比层警告",
  compareWarningsNamed: "对比层警告（{name}）",
  exportReport: "导出质量报告",
  locateFirst: "滚动到第一处",
  levelError: "错误",
  levelWarning: "警告",
  levelInfo: "说明",
  splitSideBySide: "左右分栏",
  linkViews: "联动视图",
  diffMatched: "匹配 {n}",
  diffOnlyA: "仅主文档有 {n}",
  diffOnlyB: "仅对比文档有 {n}",
  speciesAgreeShort: "物种一致 {p}%",
  diffColStatus: "差异",
  diffOnlyDiff: "只看差异",
  exportDiffCsv: "导出差异（CSV）",
  scopePrimary: "主文档",
  scopeNote: "仅覆盖主文档",
  arrivalsCol: "转入事件",
  topOf: "前 {n} / 共 {total}",
  topOfSpecies: "前 {n} / 共 {total} 个物种",
  unknownSpeciesRow: "（无物种）",
  nodeLoss: "基因丢失",
  regexInvalid: "正则表达式无效 — 已改用普通文本匹配",
  resultsList: "匹配结果",
  restoreTitle: "恢复上次会话？",
  restoreBody: "发现 {time} 自动保存的会话快照。",
  restoreAccept: "恢复",
  restoreDecline: "从空白开始",
  restoreCleared: "已丢弃上次的自动保存",
  presentation: "演示模式",
  exitPresentation: "退出演示（Esc）",
  unsavedChanges: "未保存的更改",
  close: "关闭",
  autosaveSection: "自动保存",
  autosaveOn: "已开启 — 上次保存 {time}",
  autosaveNone: "已开启 — 本次会话尚未保存",
  autosaveFailedLabel: "自动保存失败 — 请导出会话文件以防丢失",
  clearAutosave: "清除自动保存数据",
  clearAutosaveDone: "已清除自动保存数据",
  recoverySection: "恢复",
  recoveryFound: "存在一份未能恢复的快照，已保留。可导出以便检查或重新导入：",
  recoveryExport: "导出快照（JSON）",
  renameTab: "重命名标签页",
  tabTooltipMerged: "合并文档 — {n} 个源文件",
  batchPreview: "将替换 {n} 个标签",
  batchPreviewEmpty: "没有标签匹配该模式",
  batchInvalidRegex: "正则表达式无效",
  inspectorTitle: "节点检查器",
  inspSpecies: "物种",
  inspTimeSlice: "时间片",
  inspConfidence: "置信度",
  inspSupport: "支持度",
  inspBranch: "枝长",
  inspFamily: "家族",
  inspParent: "父节点",
  inspChildren: "子节点",
  inspDonor: "供体",
  inspRecipient: "受体",
  inspAnnotation: "批注",
  inspCopy: "复制详情",
  inspLocate: "定位",
  inspNone: "—",
  mergeBase: "基准物种树：{name}",
  mergeConflict: "{n} 个文件与基准物种树存在差异",
  mergeNoConflict: "所有文件的物种树与基准一致",
  warningSuffix: " + 解析警告",
  valueSuffix: "数值",
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
  mergedTabTitle: "{n} 个基因家族 · {name}",
  fileTooLarge: "超过 64 MiB 上限的文件：{names}",
  tabFileOpenFailed: "标签页「{title}」中的文件打开失败",
  tabCorrupt: "无法打开标签页「{title}」：文档已损坏或来自其它版本",
  nestedSwitchToast: "已切换到嵌套视图，对比层已移除",
  compareSwitchToast: "已切换到对比视图，嵌套层已移除",
  restoreFailed: "上次的会话无法恢复：{names}。原始快照已保留。",
  someDocsFailed: "部分文档无法恢复：{names}",
  unknownFile: "未知文件",
  listSeparator: "、",
  autosaveUnavailable: "自动保存不可用：本地存储已满或被禁用。请导出会话文件。",
  diffShow: "显示高亮",
  resizeHint: "拖动以调整宽度",
  exportAction: "导出",
  labelSearchPlaceholder: "标签或表达式…",
  pinHighlight: "固定高亮",
  unpinHighlight: "取消固定高亮",
  zoomLevel: "缩放",
  exportDefaultStem: "调和结果",
  pastedTreeName: "粘贴的树",
  unsavedSource: "（未保存）",
  splitStacked: "上下分栏",
  crashTitle: "PhyloRecViewer 出错了",
  crashBody: "你的批注与布局仍在内存中，请先保存会话再重新加载。",
  crashExport: "保存会话…",
  crashReload: "重新加载",
  supportBootstrap: "自举值",
  supportPosterior: "后验概率",
  supportAlrt: "aLRT",
  supportUnknown: "未知",

  checkNameSameSpeciesTransfer: "同物种内转移",
  checkSameSpeciesTransfer: "一次转移到达其出发的同一物种。这可能是预期的种内基因流，请结合模型判断 — 它不是时间方向错误。",
  checkNameTransferTimeUnknown: "转移时间不可判定",
  checkTransferTimeUnknown: "供体或到达事件缺少时间片，且两个物种不构成祖先关系，因此无法判断时间方向（拓扑深度不是时间）。",
  checkNameConfidenceScaleSuspect: "置信度疑似 0–100 刻度",
  checkConfidenceScaleSuspect: "某个置信度 / 支持度大于 1 且不超过 100，可能是 0–100 百分数而非 0–1 概率；置信度筛选按 0–1 解释。",
  checkNameNegativeBranchLength: "负值 / 非法枝长",
  checkNegativeBranchLength: "某个枝长为负或非有限值；绘图时按 0 处理。",
  checkNameVerticalEdgeAcrossClades: "垂直边跨到无关演化支",
  checkVerticalEdgeAcrossClades: "一条非转移的基因边从一个物种直接跳到无关演化支 — 没有转移时不可能发生，请检查各事件记录的物种。",
  event: {
    speciation: "物种形成",
    duplication: "基因重复",
    loss: "基因丢失",
    branchingOut: "转移供体",
    bifurcationOut: "二叉输出",
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
  "non-loss lineages": "non-loss lineage",
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
  "recPhyloXML (.recphyloxml / .recphylo / .phyloxml / .xml), NHX (.nhx), Newick (.nwk / .newick)";

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
