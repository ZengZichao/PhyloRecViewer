import type { EventType } from "./model/types";
import { useStore } from "./state/store";

export type Locale = "zh" | "en";

/** All user-facing UI strings (data like node names is never translated). */
export interface Dict {
  // menu bar / toolbar
  menuFile: string;
  menuView: string;
  menuLanguage: string;
  openFile: string;
  loadSample: string;
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
  noFile: string;
  warnings: string;
  darkTheme: string;
  lightTheme: string;
  systemTheme: string;
  /** Settings dialog: theme section title. */
  theme: string;
  session: string;
  save: string;
  load: string;
  exportImage: string;
  exportData: string;
  exportedToast: string;
  savedToast: string;
  controlsPanel: string;
  composeDesc: string;
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
  layout: string;
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
  renameLabelsTitle: string;
  findLabel: string;
  replaceWith: string;
  renameScope: string;
  scopeSpecies: string;
  scopeGenes: string;
  scopeAll: string;
  renameApply: string;
  renameReset: string;
  renameHint: string;
  labelEditTitle: string;
  labelEditedToast: string;
  labelResetToast: string;
  // sidebar - actions section
  /** The "Actions" section: reduce crossings / reset swaps / reset all. */
  actions: string;
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
  hintAltCollapse: string;
  hintHighlightAction: string;
  /** Hover-hint wording for the collapse/expand gesture. */
  hintCollapseAction: string;
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
  emptyTitle: string;
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
  emptyDragHint: string;
  loadSampleCta: string;
  /** Display names of the bundled samples, used in the menu, empty state and tabs. */
  sampleShowcase: string;
  sampleAllEvents: string;
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
  /** Toast for a PNG export scaled down to fit the canvas limit ({dpi} = effective DPI). */
  pngScaledToast: string;
  /** Toast for a PDF whose vector conversion failed, so a raster PDF was written. */
  pdfRasterToast: string;
  /** The coachmark bubble shown on the first gene-node hover. */
  coachTitle: string;
  coachBody: string;
  coachGotIt: string;
  viewShortcuts: string;
  nestedErrorPrefix: string;
  species: string;
  geneTreeUnit: string;
  geneNodes: string;
  paneGeneSymbiont: string;
  paneSymbiontHost: string;
  // canvas
  zoomIn: string;
  zoomOut: string;
  fit: string;
  fullscreen: string;
  exitFullscreen: string;
  more: string;
  // analysis panel
  analyze: string;
  inspectDesc: string;
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
  speciesPreview: string;
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
  onboardReplay: string;
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
  closeKeep: string;
  closeDiscard: string;
  closePanel: string;
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
  // events
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
  openFile: "Open file",
  loadSample: "Load sample...",
  nestedLevel: "+ Nested level",
  nestedTitle: "Add a nested (host) reconciliation for a 3-level view",
  nestedPrefix: "Nested:",
  nestedRemoveTitle: "Nested level (click to remove)",
  compareLevel: "+ Compare",
  compareTitle: "Load an alternative reconciliation of the same family to compare",
  comparePrefix: "Compare:",
  compareRemoveTitle: "Comparison (click to remove)",
  compareErrorPrefix: "Comparison file error:",
  agree: "agree",
  noFile: "No file",
  warnings: "warnings",
  darkTheme: "Dark theme",
  lightTheme: "Light theme",
  systemTheme: "System theme",
  theme: "Theme",
  session: "Session",
  save: "Save",
  load: "Load",
  exportImage: "Image / page",
  exportData: "Data",
  exportedToast: "Exported",
  savedToast: "Saved",
  controlsPanel: "Controls",
  composeDesc: "Compose — shape layout & style",
  newTabTitle: "New tab",
  closeTabTitle: "Close tab",
  untitledTab: "Untitled",
  collapse: "Collapse",
  expand: "Expand",
  analysisEmpty: "Open a reconciliation to use the analysis tools.",
  exportLabel: "Export",
  includeLegend: "Legend",
  includeLegendTitle: "Show the legend on the canvas and include it in exported images",
  loadFailed: "Load failed",
  exportFailed: "Export failed",
  layout: "Layout",
  levelHeight: "Level height",
  geneSpacing: "Gene spacing",
  speciesSpacing: "Species spacing",
  speciesWidth: "Species width",
  alignTips: "Align tips",
  compactTidy: "Compact layout",
  compactTidyTitle: "Pack sibling subtrees closer together (contour packing) instead of using fixed-width leaf slots.",
  midwayDup: "Center duplications",
  midwayDupTitle: "Place gene-duplication nodes at the midpoint of their species branch (otherwise nearer the ancestor).",
  branchLengths: "Branch lengths",
  minimap: "Minimap",
  reduceCrossings: "Reduce crossings",
  reduceCrossingsTitle: "Auto-mirror subtrees to reduce transfer crossings",
  resetSwaps: "Reset swaps",
  undo: "Undo",
  redo: "Redo",
  annoTitle: "Annotate",
  annoPlaceholder: "Add a note...",
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
  copyHeatmap: "Overlapping copies (lanes) heatmap",
  labelsSection: "Labels",
  speciesNames: "Species names",
  geneTipNames: "Gene tip node names",
  internalGeneNames: "Internal gene node names",
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
  renameLabels: "Rename Labels",
  renameLabelsTitle: "Batch rename labels (regex supported)",
  findLabel: "Find",
  replaceWith: "Replace with",
  renameScope: "Scope",
  scopeSpecies: "Species names",
  scopeGenes: "Gene names",
  scopeAll: "All labels",
  renameApply: "Apply",
  renameReset: "Reset labels",
  renameHint: "Click a label on the canvas to rename it individually.",
  labelEditTitle: "Rename label",
  labelEditedToast: "Labels renamed",
  labelResetToast: "Labels reset",
  actions: "Actions",
  layoutActions: "Layout Actions",
  layoutParams: "Layout Parameters",
  pinOpen: "Pin section open",
  unpinOpen: "Unpin section",
  legendVertical: "Vertical layout",
  legendHorizontal: "Horizontal layout",
  viewTour: "View tutorial",
  orientation: "Orientation",
  orientTop: "Root top",
  orientBottom: "Root bottom",
  orientLeft: "Root left",
  orientRight: "Root right",
  hint: "Tip: scroll to zoom, drag to pan. Click a gene node to highlight its lineage; click a species branch to mirror it; Alt/Option-click an internal gene node to collapse/expand; Shift-click a node to annotate; click empty space to clear.",
  tipsTitle: "Tips",
  tips: [
    "Scroll to zoom, drag to pan",
    "Click a gene node to highlight its lineage",
    "Click a species branch to mirror it (swap)",
    "Alt/Option-click an internal gene node to collapse/expand",
    "Shift-click a node to annotate",
    "Click empty space to clear",
  ],
  hintClickHighlight: "Click",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt",
  hintHighlightAction: "highlight lineage",
  hintCollapseAction: "collapse / expand",
  events: "Evolutionary events",
  geneFamilies: "Gene families",
  geneTree: "Gene tree",
  changeColor: "Change color",
  transferLegend: "Transfer",
  collapsedClade: "Collapsed",
  leavesUnit: "leaves",
  expandHint: "Alt-click to expand",
  emptyTitle: "Open a recPhyloXML file",
  emptyBody: "Use the File menu, or drag & drop a .recphyloxml / .recphylo / .phyloxml / .xml / .nhx / .nwk file here.",
  errorTitle: "Could not parse this file",
  errorHint: "Supported: recPhyloXML (.recphyloxml / .recphylo / .phyloxml / .xml), NHX (.nhx), Newick (.nwk / .newick). Check the file format and encoding.",
  errorRetry: "Choose another file",
  errorBack: "Back to previous",
  errorSample: "Load a sample",
  dropToOpen: "Drop to open",
  emptyOrSample: "Load sample:",
  emptyDragHint: "You can also drag & drop a file anywhere in the window.",
  loadSampleCta: "Load sample ▸",
  sampleShowcase: "Showcase: speciation / duplication / loss / transfer",
  sampleAllEvents:
    "All event types: speciation / duplication / loss / branching-out / bifurcation-out / transfer",
  sampleCompare: "Comparison: two outcomes of one gene family",
  sampleCompareB: "Outcome B (duplication-rich)",
  sampleNested: "Nested: gene / symbiont / host",
  sampleNestedB: "Symbiont → host",
  parsing: "Parsing\u2026",
  parsingLarge: "This file is large, please wait\u2026",
  helpButton: "Help",
  helpTitle: "Shortcuts & interactions",
  helpKeyboard: "Keyboard",
  helpMouse: "Mouse & touch",
  helpFit: "Fit to window",
  helpZoomInOut: "Zoom in / out",
  helpClosePanel: "Close panel / clear selection",
  interactionsTitle: "Interactions",
  hintClear: "Click empty space to clear",
  hintMirror: "Click a species branch to mirror it",
  mirrorHint: "Click to mirror this subtree",
  openFailedToast: "Could not open: {names}",
  pngScaledToast: "Drawing is very large: resolution was scaled down (≈{dpi} DPI) to fit the canvas limit",
  pdfRasterToast: "Vector PDF conversion failed; a full-page raster PDF was written instead",
  coachTitle: "Node interactions",
  coachBody: "Click a gene node to highlight its lineage. Shift-click to annotate, Alt/Option-click an internal node to collapse it.",
  coachGotIt: "Got it",
  viewShortcuts: "Shortcuts & help",
  nestedErrorPrefix: "Nested file error:",
  species: "species",
  geneTreeUnit: "gene trees",
  geneNodes: "gene nodes",
  paneGeneSymbiont: "Gene \u2192 Symbiont",
  paneSymbiontHost: "Symbiont \u2192 Host",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to view",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  more: "More",
  analyze: "Analysis",
  inspectDesc: "Inspect — search, measure & validate",
  panelSearch: "Search & Filter",
  panelStats: "Statistics",
  panelNetwork: "Transfer Network",
  panelAnnotate: "Annotations",
  panelDiff: "Differences",
  noAnnotations: "No annotations yet. Shift-click a gene node (or use the annotate mode) to add one.",
  diffLegend: "Nodes differing between files",
  diffHide: "Hide highlight",
  multiOpenTitle: "Open {n} files as…",
  mergeMode: "Merge into one document",
  tabMode: "One tab per file",
  mergedToast: "Merged N files into one reconciliation",
  resetAll: "Reset all",
  resetAllTitle: "Reset every layout & style option to its default",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  speciesPreview: "Species",
  prefsTitle: "Preferences",
  defaultView: "Default view",
  saveDefaultView: "Use current view as default",
  saveDefaultViewTitle: "Apply the current layout/style to every new document",
  clearDefaultView: "Clear default view",
  restorePrefs: "Reset preferences",
  onboardSkip: "Skip",
  onboardNext: "Next",
  onboardPrev: "Back",
  onboardDone: "Done",
  onboardReplay: "Replay tour",
  tourStep1Title: "Controls — shape the drawing",
  tourStep1Body: "The left panel composes the picture: orientation, spacing, style and labels. Everything here updates the canvas live.",
  tourStep2Title: "Analysis — read the data",
  tourStep2Body: "The right panel inspects it: search & filter, statistics, the transfer network and data checks.",
  tourStep3Title: "Canvas — nodes are interactive",
  tourStep3Body: "Click a gene node to highlight its lineage, Shift-click to annotate, Alt/Option-click an internal node to collapse it. Click a species branch to mirror it.",
  tourStep4Title: "Nested & compare views",
  tourStep4Body: "Add a nested level for a 3-level gene \u2192 symbiont \u2192 host view, or load a second reconciliation to compare.",
  tourStep5Title: "Export",
  tourStep5Body: "Export the drawing as PNG / SVG / PDF / HTML, or save the whole session to reopen later.",
  closeConfirmTitle: "Close tab?",
  closeConfirmBody: "This document has unsaved annotations, swaps or colors. Close anyway?",
  closeKeep: "Keep",
  closeDiscard: "Close anyway",
  closePanel: "Close",
  searchPlaceholder: "Search name / species...",
  useRegex: "Regex",
matchCount: "matches",
noMatches: "No matches",
noEvents: "No events",
donutTotal: "Total",
  prevMatch: "Prev",
  nextMatch: "Next",
  filterEvents: "By event type",
  filterFamilies: "By gene family",
  clearFilters: "Clear",
  statsTotals: "Totals",
  statsByFamily: "By family",
  statsTransferMatrix: "Transfer matrix",
  statsBySpecies: "By species (top)",
  exportCsv: "Export CSV",
  donor: "Donor",
  recipient: "Recipient",
  countCol: "Count",
  copiesCol: "Lineages (non-loss)",
  nodesCol: "Nodes",
  statsNodes: "Nodes",
  statsNodesLimited: "table truncated",
  colNum: "No.",
  colName: "Name",
  colType: "Type",
  colEvent: "Event",
  nodeLeaf: "Tip node",
  nodeInternal: "Internal node",
  eventDistribution: "Event distribution",
  transferOverlayNote: "Transfer arrivals are an overlay event, not part of the composition above; the count is shown in Totals.",
  filterConfidence: "Confidence range",
  searchOnlyMatch: "Show only matches",
  rendering: "Rendering\u2026",
  pngResolution: "PNG resolution",
  noTransfers: "No transfers",
  networkHint: "Nodes = species, arrows = transfers (thicker = more). Hover to focus.",
  panelChecks: "Data checks",
  checkAllGood: "All checks passed",
  checkUnknownSpecies: "references to species missing from the species tree",
  checkDonorNoTransferBack: "transfer donors without a transfer-arrival child",
  checkTransferBackNoParent: "transfer arrivals without a donor lineage",
  checkLeafInternalSpecies: "extant genes placed on internal (non-leaf) species",
  checkNoSpecies: "gene nodes with no species assignment",
  checkDuplicateSpecies: "duplicated species names in the species tree",
  checksIntro: "Structural checks on the loaded data:",
  checksWithIssues: "with issues",
  checkNameUnknownSpecies: "Species references resolve",
  checkNameDuplicateSpecies: "Species names are unique",
  checkNameNoSpecies: "Every gene has a species",
  checkNameLeafInternalSpecies: "Extant genes on leaf species",
  checkNameDonorNoTransferBack: "Transfer donors are paired",
  checkNameTransferBackNoParent: "Transfer arrivals have a donor",
  checkTransferBackNoDonor: "transfer arrivals whose parent is not a donor",
  checkNameTransferBackNoDonor: "Transfer arrivals sit under a donor",
  checkBifurcationNoTransferBack: "bifurcation-out donors with no transferred child",
  checkNameBifurcationNoTransferBack: "Bifurcation donors are paired",
  checkTerminalEventWithChildren: "terminal (loss/leaf) events that have children",
  checkNameTerminalEventWithChildren: "Loss / extant events are leaves",
  checkNonBinaryNode: "speciation / duplication nodes that are not binary",
  checkNameNonBinaryNode: "Speciation / duplication are binary",
  checkTransferBackwardsInTime: "transfers into an ancestor species (time-travelling)",
  checkNameTransferBackwardsInTime: "Transfers move forward in time",
  event: {
    speciation: "Speciation",
    duplication: "Duplication",
    loss: "Loss",
    branchingOut: "Transfer (donor)",
    bifurcationOut: "Bifurcation out",
    transferBack: "Transfer (arrival)",
    leaf: "Extant gene",
  },
};

const zh: Dict = {
  menuFile: "\u6587\u4ef6",
  menuView: "\u89c6\u56fe",
  menuLanguage: "\u8bed\u8a00",
  openFile: "\u6253\u5f00\u6587\u4ef6",
  loadSample: "\u8f7d\u5165\u793a\u4f8b\u2026",
  nestedLevel: "+ \u5d4c\u5957\u5c42",
  nestedTitle: "添加嵌套的(宿主)调和以显示三层视图",
  nestedPrefix: "\u5d4c\u5957\uff1a",
  nestedRemoveTitle: "\u5d4c\u5957\u5c42(\u70b9\u51fb\u79fb\u9664)",
  compareLevel: "+ \u5bf9\u6bd4",
  compareTitle: "\u52a0\u8f7d\u540c\u4e00\u5bb6\u65cf\u7684\u53e6\u4e00\u8c03\u548c\u7ed3\u679c\u8fdb\u884c\u5bf9\u6bd4",
  comparePrefix: "\u5bf9\u6bd4\uff1a",
  compareRemoveTitle: "\u5bf9\u6bd4(\u70b9\u51fb\u79fb\u9664)",
  compareErrorPrefix: "\u5bf9\u6bd4\u6587\u4ef6\u9519\u8bef\uff1a",
  agree: "\u4e00\u81f4",
  noFile: "\u65e0\u6587\u4ef6",
  warnings: "\u4e2a\u8b66\u544a",
  darkTheme: "\u6df1\u8272\u4e3b\u9898",
  lightTheme: "\u6d45\u8272\u4e3b\u9898",
  systemTheme: "\u8ddf\u968f\u7cfb\u7edf",
  theme: "\u4e3b\u9898",
  session: "\u4f1a\u8bdd",
  save: "\u4fdd\u5b58",
  load: "\u8f7d\u5165",
  exportImage: "\u56fe\u50cf / \u9875\u9762",
  exportData: "\u6570\u636e",
  exportedToast: "\u5df2\u5bfc\u51fa",
  savedToast: "\u5df2\u4fdd\u5b58",
  controlsPanel: "\u63a7\u5236\u9762\u677f",
  composeDesc: "\u6784\u56fe · 改变图形布局与样式",
  newTabTitle: "\u65b0\u5efa\u6807\u7b7e\u9875",
  closeTabTitle: "\u5173\u95ed\u6807\u7b7e\u9875",
  untitledTab: "\u672a\u547d\u540d",
  collapse: "\u6536\u8d77",
  expand: "\u5c55\u5f00",
  analysisEmpty: "\u8f7d\u5165\u8c03\u548c\u6570\u636e\u540e\u53ef\u4f7f\u7528\u5206\u6790\u5de5\u5177\u3002",
  exportLabel: "\u5bfc\u51fa",
  includeLegend: "\u56fe\u4f8b",
  includeLegendTitle: "\u5728\u753b\u5e03\u4e0a\u663e\u793a\u56fe\u4f8b\uff0c\u5e76\u5728\u5bfc\u51fa\u56fe\u50cf\u65f6\u4e00\u5e76\u5305\u542b",
  loadFailed: "\u8f7d\u5165\u5931\u8d25",
  exportFailed: "\u5bfc\u51fa\u5931\u8d25",
  layout: "\u5e03\u5c40",
  levelHeight: "层高",
  geneSpacing: "基因间距",
  speciesSpacing: "物种间距",
  speciesWidth: "物种树粗细",
  alignTips: "末端对齐",
  compactTidy: "紧凑布局",
  compactTidyTitle: "把相邻子树尽量靠拢排列（轮廓法），而不是使用固定宽度的叶槽。",
  midwayDup: "重复事件居中",
  midwayDupTitle: "把基因重复节点放在其物种分支的中点（否则更靠近祖先端）。",
  branchLengths: "\u5206\u652f\u957f\u5ea6",
  minimap: "\u5c0f\u5730\u56fe",
  reduceCrossings: "\u51cf\u5c11\u4ea4\u53c9",
  reduceCrossingsTitle: "\u81ea\u52a8\u955c\u50cf\u5b50\u6811\u4ee5\u51cf\u5c11\u8f6c\u79fb\u4ea4\u53c9",
  resetSwaps: "\u91cd\u7f6e\u6362\u679d",
  undo: "\u64a4\u9500",
  redo: "\u91cd\u505a",
  annoTitle: "\u6807\u6ce8",
  annoPlaceholder: "\u6dfb\u52a0\u5907\u6ce8\u2026",
  annoColor: "\u989c\u8272",
  annoRemove: "\u5220\u9664",
  annoCancel: "\u53d6\u6d88",
  style: "\u6837\u5f0f",
  curvedBranches: "\u66f2\u7ebf\u5206\u652f",
  geneThickness: "\u57fa\u56e0\u6811\u7c97\u7ec6",
  symbolSize: "\u7b26\u53f7\u5927\u5c0f",
  transferCurve: "\u8f6c\u79fb\u5f27\u5ea6",
  haloUnderGenes: "\u57fa\u56e0\u63cf\u8fb9",
  eventGlyphs: "\u4e8b\u4ef6\u7b26\u53f7",
  supportValues: "\u652f\u6301\u503c",
  tubeGradient: "\u7ba1\u9053\u6e10\u53d8",
  copyHeatmap: "\u91cd\u53e0\u62f7\u8d1d\u6570\uff08\u6cf3\u9053\uff09\u70ed\u529b\u56fe",
  labelsSection: "\u6807\u7b7e",
  speciesNames: "\u7269\u79cd\u540d",
  geneTipNames: "基因末端节点名称",
  internalGeneNames: "基因内部节点名称",
  labelAngle: "角度",
  labelSize: "字号",
  labelBold: "加粗",
  labelItalic: "斜体",
  labelOffset: "偏移",
  labelAlign: "\u5bf9\u9f50",
  alignAuto: "\u81ea\u52a8",
  alignLeft: "\u5de6\u5bf9\u9f50",
  alignCenter: "\u5c45\u4e2d\u5bf9\u9f50",
  alignRight: "\u53f3\u5bf9\u9f50",
  renameLabels: "\u6279\u91cf\u91cd\u547d\u540d",
  renameLabelsTitle: "\u6279\u91cf\u91cd\u547d\u540d\u6807\u7b7e\uff08\u652f\u6301\u6b63\u5219\uff09",
  findLabel: "\u67e5\u627e",
  replaceWith: "\u66ff\u6362\u4e3a",
  renameScope: "\u8303\u56f4",
  scopeSpecies: "\u7269\u79cd\u540d\u79f0",
  scopeGenes: "\u57fa\u56e0\u540d\u79f0",
  scopeAll: "\u5168\u90e8\u6807\u7b7e",
  renameApply: "\u5e94\u7528",
  renameReset: "\u91cd\u7f6e\u6807\u7b7e",
  renameHint: "\u70b9\u51fb\u753b\u5e03\u4e0a\u7684\u6807\u7b7e\u53ef\u5355\u72ec\u91cd\u547d\u540d\u3002",
  labelEditTitle: "\u91cd\u547d\u540d\u6807\u7b7e",
  labelEditedToast: "\u6807\u7b7e\u5df2\u91cd\u547d\u540d",
  labelResetToast: "\u6807\u7b7e\u5df2\u91cd\u7f6e",
  actions: "\u64cd\u4f5c",
  layoutActions: "\u5e03\u5c40\u64cd\u4f5c",
  layoutParams: "\u5e03\u5c40\u53c2\u6570",
  pinOpen: "\u56fa\u5b9a\u5c55\u5f00\u6b64\u533a\u5757",
  unpinOpen: "\u53d6\u6d88\u56fa\u5b9a",
  legendVertical: "\u56fe\u4f8b\u5782\u76f4\u6392\u5e03",
  legendHorizontal: "\u56fe\u4f8b\u6c34\u5e73\u6392\u5e03",
  viewTour: "\u67e5\u770b\u65b0\u624b\u6307\u5357",
  orientation: "树朝向",
  orientTop: "根在上",
  orientBottom: "根在下",
  orientLeft: "根在左",
  orientRight: "根在右",
  hint: "\u63d0\u793a\uff1a\u6eda\u8f6e\u7f29\u653e\u3001\u62d6\u62fd\u5e73\u79fb\uff1b\u70b9\u51fb\u57fa\u56e0\u8282\u70b9\u9ad8\u4eae\u5176\u8c31\u7cfb\uff1b\u70b9\u51fb\u7269\u79cd\u679d\u955c\u50cf(\u6362\u679d)\uff1bAlt/\u2325\u70b9\u51fb\u5185\u90e8\u57fa\u56e0\u8282\u70b9\u6298\u53e0/\u5c55\u5f00\uff1bShift\u70b9\u51fb\u8282\u70b9\u6dfb\u52a0\u6807\u6ce8\uff1b\u70b9\u51fb\u7a7a\u767d\u6e05\u9664\u3002",
  tipsTitle: "\u63d0\u793a",
  tips: [
    "\u6eda\u8f6e\u7f29\u653e\u3001\u62d6\u62fd\u5e73\u79fb",
    "\u70b9\u51fb\u57fa\u56e0\u8282\u70b9\u9ad8\u4eae\u5176\u8c31\u7cfb",
    "\u70b9\u51fb\u7269\u79cd\u679d\u955c\u50cf\uff08\u6362\u679d\uff09",
    "Alt/\u2325 \u70b9\u51fb\u5185\u90e8\u57fa\u56e0\u8282\u70b9\u6298\u53e0/\u5c55\u5f00",
    "Shift \u70b9\u51fb\u8282\u70b9\u6dfb\u52a0\u6807\u6ce8",
    "\u70b9\u51fb\u7a7a\u767d\u6e05\u9664",
  ],
  hintClickHighlight: "\u70b9\u51fb",
  hintShiftAnnotate: "Shift",
  hintAltCollapse: "Alt",
  hintHighlightAction: "\u9ad8\u4eae\u8c31\u7cfb",
  hintCollapseAction: "\u6298\u53e0 / \u5c55\u5f00",
  events: "\u6f14\u5316\u4e8b\u4ef6",
  geneFamilies: "\u57fa\u56e0\u5bb6\u65cf",
  geneTree: "\u57fa\u56e0\u6811",
  changeColor: "\u66f4\u6539\u989c\u8272",
  transferLegend: "\u57fa\u56e0\u8f6c\u79fb",
  collapsedClade: "\u5df2\u6298\u53e0",
  leavesUnit: "\u53f6",
  expandHint: "Alt \u70b9\u51fb\u5c55\u5f00",
  emptyTitle: "\u6253\u5f00\u4e00\u4e2a recPhyloXML \u6587\u4ef6",
  emptyBody: "\u4f7f\u7528\u6587\u4ef6\u83dc\u5355\uff0c\u6216\u5c06 .recphyloxml / .recphylo / .phyloxml / .xml / .nhx / .nwk \u6587\u4ef6\u62d6\u62fd\u5230\u6b64\u5904\u3002",
  errorTitle: "\u65e0\u6cd5\u89e3\u6790\u8be5\u6587\u4ef6",
  errorHint: "\u652f\u6301\u683c\u5f0f\uff1arecPhyloXML\uff08.recphyloxml / .recphylo / .phyloxml / .xml\uff09\u3001NHX\uff08.nhx\uff09\u3001Newick\uff08.nwk / .newick\uff09\u3002\u8bf7\u68c0\u67e5\u6587\u4ef6\u683c\u5f0f\u4e0e\u7f16\u7801\u3002",
  errorRetry: "\u91cd\u65b0\u9009\u62e9\u6587\u4ef6",
  errorBack: "\u8fd4\u56de\u4e0a\u4e00\u4efd",
  errorSample: "\u8f7d\u5165\u793a\u4f8b",
  dropToOpen: "\u91ca\u653e\u4ee5\u6253\u5f00",
  emptyOrSample: "\u52a0\u8f7d\u793a\u4f8b",
  emptyDragHint: "\u4e5f\u53ef\u4ee5\u5c06\u6587\u4ef6\u62d6\u62fd\u5230\u7a97\u53e3\u4efb\u610f\u4f4d\u7f6e\u3002",
  loadSampleCta: "载入示例 ▸",
  sampleShowcase: "完整示例：物种形成 / 重复 / 丢失 / 转移",
  sampleAllEvents: "全事件类型：物种形成 / 重复 / 丢失 / 转移(供体) / 树外分叉 / 转移(受体)",
  sampleCompare: "对比示例：同一家族的两种结果",
  sampleCompareB: "结果 B（重复为主）",
  sampleNested: "嵌套示例：基因/共生体/宿主",
  sampleNestedB: "共生体 → 宿主",
  parsing: "\u89e3\u6790\u4e2d\u2026",
  parsingLarge: "\u6587\u4ef6\u8f83\u5927\uff0c\u8bf7\u7a0d\u5019\u2026",
  helpButton: "\u5e2e\u52a9",
  helpTitle: "\u5feb\u6377\u952e\u4e0e\u64cd\u4f5c",
  helpKeyboard: "\u952e\u76d8\u5feb\u6377\u952e",
  helpMouse: "\u9f20\u6807\u4e0e\u89e6\u63a7",
  helpFit: "\u9002\u5e94\u7a97\u53e3",
  helpZoomInOut: "\u653e\u5927 / \u7f29\u5c0f",
  helpClosePanel: "\u5173\u95ed\u9762\u677f / \u6e05\u9664\u9009\u62e9",
  interactionsTitle: "\u56fe\u4e0a\u64cd\u4f5c",
  hintClear: "\u70b9\u51fb\u7a7a\u767d\u6e05\u9664",
  hintMirror: "\u70b9\u51fb\u7269\u79cd\u679d\u955c\u50cf\uff08\u6362\u679d\uff09",
  mirrorHint: "\u70b9\u51fb\u955c\u50cf\u6b64\u5b50\u6811",
  openFailedToast: "\u65e0\u6cd5\u6253\u5f00\uff1a{names}",
  pngScaledToast: "\u56fe\u5f62\u8fc7\u5927\uff0c\u5206\u8fa8\u7387\u5df2\u964d\u4f4e\uff08\u7ea6 {dpi} DPI\uff09\u4ee5\u9002\u5e94\u753b\u5e03\u4e0a\u9650",
  pdfRasterToast: "\u77e2\u91cf PDF \u8f6c\u6362\u5931\u8d25\uff0c\u5df2\u6539\u4e3a\u8f93\u51fa\u6574\u9875\u4f4d\u56fe PDF",
  coachTitle: "\u8282\u70b9\u64cd\u4f5c",
  coachBody: "\u70b9\u51fb\u57fa\u56e0\u8282\u70b9\u9ad8\u4eae\u5176\u8c31\u7cfb\uff1bShift \u70b9\u51fb\u6dfb\u52a0\u6807\u6ce8\uff1bAlt/\u2325 \u70b9\u51fb\u5185\u90e8\u8282\u70b9\u6298\u53e0\u3002",
  coachGotIt: "\u660e\u767d\u4e86",
  viewShortcuts: "\u5feb\u6377\u952e\u4e0e\u5e2e\u52a9",
  nestedErrorPrefix: "\u5d4c\u5957\u6587\u4ef6\u9519\u8bef\uff1a",
  species: "\u7269\u79cd",
  geneTreeUnit: "\u57fa\u56e0\u6811",
  geneNodes: "\u57fa\u56e0\u8282\u70b9",
  paneGeneSymbiont: "\u57fa\u56e0 \u2192 \u5171\u751f\u4f53",
  paneSymbiontHost: "\u5171\u751f\u4f53 \u2192 \u5bbf\u4e3b",
  zoomIn: "\u653e\u5927",
  zoomOut: "\u7f29\u5c0f",
  fit: "\u9002\u914d\u89c6\u56fe",
  fullscreen: "\u5168\u5c4f",
  exitFullscreen: "\u9000\u51fa\u5168\u5c4f",
  more: "\u66f4\u591a",
  analyze: "分析面板",
  inspectDesc: "检视 · 检索、统计与校验数据",
  panelSearch: "\u641c\u7d22\u8fc7\u6ee4",
  panelStats: "\u7ed3\u679c\u7edf\u8ba1",
  panelNetwork: "\u8f6c\u79fb\u7f51\u7edc",
  panelAnnotate: "\u4fe1\u606f\u6807\u6ce8",
  panelDiff: "\u5dee\u5f02",
  noAnnotations: "\u8fd8\u6ca1\u6709\u6807\u6ce8\u3002Shift \u70b9\u51fb\u57fa\u56e0\u8282\u70b9\uff08\u6216\u4f7f\u7528\u6807\u6ce8\u6a21\u5f0f\uff09\u6dfb\u52a0\u4e00\u6761\u3002",
  diffLegend: "\u4e24\u4e2a\u6587\u4ef6\u4e0d\u4e00\u81f4\u7684\u8282\u70b9",
  diffHide: "\u9690\u85cf\u9ad8\u4eae",
  multiOpenTitle: "\u5982\u4f55\u6253\u5f00 {n} \u4e2a\u6587\u4ef6\uff1f",
  mergeMode: "\u5408\u5e76\u4e3a\u4e00\u4e2a\u6587\u6863",
  tabMode: "\u6bcf\u4e2a\u6587\u4ef6\u65b0\u5efa\u6807\u7b7e",
  mergedToast: "\u5df2\u5c06 N \u4e2a\u6587\u4ef6\u5408\u5e76\u4e3a 1 \u4e2a\u8c03\u548c\u6587\u6863",
  resetAll: "\u5168\u90e8\u91cd\u7f6e",
  resetAllTitle: "\u5c06\u6240\u6709\u5e03\u5c40\u4e0e\u6837\u5f0f\u9009\u9879\u91cd\u7f6e\u4e3a\u9ed8\u8ba4",
  expandAll: "\u5168\u90e8\u5c55\u5f00",
  collapseAll: "\u5168\u90e8\u6536\u8d77",
  speciesPreview: "\u7269\u79cd",
  prefsTitle: "\u8bbe\u7f6e",
  defaultView: "\u9ed8\u8ba4\u89c6\u56fe",
  saveDefaultView: "\u5c06\u5f53\u524d\u89c6\u56fe\u8bbe\u4e3a\u9ed8\u8ba4",
  saveDefaultViewTitle: "\u5bf9\u6bcf\u4e2a\u65b0\u6587\u6863\u5e94\u7528\u5f53\u524d\u7684\u5e03\u5c40/\u6837\u5f0f",
  clearDefaultView: "\u6e05\u9664\u9ed8\u8ba4\u89c6\u56fe",
  restorePrefs: "\u91cd\u7f6e\u504f\u597d",
  onboardSkip: "\u8df3\u8fc7",
  onboardNext: "\u4e0b\u4e00\u6b65",
  onboardPrev: "\u4e0a\u4e00\u6b65",
  onboardDone: "\u5b8c\u6210",
  onboardReplay: "\u91cd\u65b0\u89c2\u770b\u5f15\u5bfc",
  tourStep1Title: "\u63a7\u5236\u9762\u677f \u2014 \u6784\u56fe",
  tourStep1Body: "\u5de6\u4fa7\u9762\u677f\u7528\u4e8e\u6784\u56fe\uff1a\u65b9\u5411\u3001\u95f4\u8ddd\u3001\u6837\u5f0f\u4e0e\u6807\u7b7e\uff0c\u6240\u6709\u8c03\u6574\u90fd\u4f1a\u5b9e\u65f6\u53cd\u6620\u5728\u753b\u5e03\u4e0a\u3002",
  tourStep2Title: "\u5206\u6790\u9762\u677f \u2014 \u8bfb\u6570\u636e",
  tourStep2Body: "\u53f3\u4fa7\u9762\u677f\u7528\u4e8e\u68c0\u89c6\uff1a\u641c\u7d22\u8fc7\u6ee4\u3001\u7ed3\u679c\u7edf\u8ba1\u3001\u8f6c\u79fb\u7f51\u7edc\u4e0e\u6570\u636e\u68c0\u67e5\u3002",
  tourStep3Title: "\u753b\u5e03 \u2014 \u8282\u70b9\u53ef\u4ea4\u4e92",
  tourStep3Body: "\u70b9\u51fb\u57fa\u56e0\u8282\u70b9\u9ad8\u4eae\u8c31\u7cfb\uff0cShift \u70b9\u51fb\u6807\u6ce8\uff0cAlt/\u2325 \u70b9\u51fb\u5185\u90e8\u8282\u70b9\u6298\u53e0\uff0c\u70b9\u51fb\u7269\u79cd\u679d\u955c\u50cf\u3002",
  tourStep4Title: "\u5d4c\u5957\u4e0e\u5bf9\u6bd4\u89c6\u56fe",
  tourStep4Body: "\u6dfb\u52a0\u5d4c\u5957\u5c42\u53ef\u5c55\u793a\u57fa\u56e0 \u2192 \u5171\u751f\u4f53 \u2192 \u5bbf\u4e3b\u4e09\u5c42\u89c6\u56fe\uff1b\u6216\u52a0\u8f7d\u53e6\u4e00\u4efd\u8c03\u548c\u7ed3\u679c\u8fdb\u884c\u5bf9\u6bd4\u3002",
  tourStep5Title: "\u5bfc\u51fa",
  tourStep5Body: "\u53ef\u5c06\u56fe\u5f62\u5bfc\u51fa\u4e3a PNG / SVG / PDF / HTML\uff0c\u6216\u4fdd\u5b58\u6574\u4e2a\u4f1a\u8bdd\u4ee5\u4fbf\u4ee5\u540e\u91cd\u65b0\u6253\u5f00\u3002",
  closeConfirmTitle: "\u5173\u95ed\u6807\u7b7e\u9875\uff1f",
  closeConfirmBody: "\u6b64\u6587\u6863\u5305\u542b\u672a\u5bfc\u51fa\u7684\u6807\u6ce8\u3001\u6362\u679d\u6216\u989c\u8272\u3002\u786e\u5b9a\u5173\u95ed\u5417\uff1f",
  closeKeep: "\u4fdd\u7559",
  closeDiscard: "\u4ecd\u5173\u95ed",
  closePanel: "\u5173\u95ed",
  searchPlaceholder: "\u641c\u7d22\u540d\u79f0 / \u7269\u79cd\u2026",
  useRegex: "正则表达式",
matchCount: "\u4e2a\u5339\u914d",
noMatches: "\u65e0\u5339\u914d",
noEvents: "\u65e0\u4e8b\u4ef6",
donutTotal: "\u603b\u8ba1",
  prevMatch: "\u4e0a\u4e00\u4e2a",
  nextMatch: "\u4e0b\u4e00\u4e2a",
  filterEvents: "\u6309\u4e8b\u4ef6\u7c7b\u578b",
  filterFamilies: "\u6309\u57fa\u56e0\u5bb6\u65cf",
  clearFilters: "\u6e05\u9664\u7b5b\u9009",
  statsTotals: "\u603b\u8ba1",
  statsByFamily: "\u6309\u5bb6\u65cf",
  statsTransferMatrix: "\u8f6c\u79fb\u77e9\u9635",
  statsBySpecies: "\u6309\u7269\u79cd\uff08\u524d\u5217\uff09",
  exportCsv: "\u5bfc\u51fa CSV",
  donor: "\u4f9b\u4f53",
  recipient: "\u53d7\u4f53",
  countCol: "\u6b21\u6570",
  copiesCol: "\u8c31\u7cfb\uff08\u975e\u4e22\u5931\uff09",
  nodesCol: "\u8282\u70b9\u6570",
  statsNodes: "节点",
  statsNodesLimited: "表格已截断",
  colNum: "编号",
  colName: "名称",
  colType: "类型",
  colEvent: "事件",
  nodeLeaf: "末端节点",
  nodeInternal: "内部节点",
  eventDistribution: "事件分布",
  transferOverlayNote: "转移(到达)为叠加事件，不计入上面的构成占比；其计数见“总计”。",
  filterConfidence: "置信度区间",
  searchOnlyMatch: "仅显示匹配",
  rendering: "渲染中…",
  pngResolution: "PNG DPI",
  noTransfers: "\u65e0\u8f6c\u79fb\u4e8b\u4ef6",
  networkHint: "\u8282\u70b9=\u7269\u79cd\uff0c\u7bad\u5934=\u8f6c\u79fb\uff08\u8d8a\u7c97\u8d8a\u591a\uff09\uff1b\u60ac\u505c\u53ef\u805a\u7126\u3002",
  panelChecks: "\u6570\u636e\u68c0\u67e5",
  checkAllGood: "\u5168\u90e8\u901a\u8fc7",
  checkUnknownSpecies: "\u5904\u5f15\u7528\u4e86\u7269\u79cd\u6811\u4e2d\u4e0d\u5b58\u5728\u7684\u7269\u79cd",
  checkDonorNoTransferBack: "\u4e2a\u8f6c\u79fb\u4f9b\u4f53\u7f3a\u5c11\u53d7\u4f53\u5b50\u8282\u70b9",
  checkTransferBackNoParent: "\u4e2a\u8f6c\u79fb\u53d7\u4f53\u7f3a\u5c11\u4f9b\u4f53\u8c31\u7cfb",
  checkLeafInternalSpecies: "\u4e2a\u73b0\u5b58\u57fa\u56e0\u4f4d\u4e8e\u5185\u90e8(\u975e\u53f6)\u7269\u79cd",
  checkNoSpecies: "\u4e2a\u57fa\u56e0\u8282\u70b9\u672a\u5206\u914d\u7269\u79cd",
  checkDuplicateSpecies: "\u5904\u7269\u79cd\u6811\u4e2d\u5b58\u5728\u91cd\u540d\u7269\u79cd",
  checksIntro: "\u5bf9\u8f7d\u5165\u6570\u636e\u7684\u7ed3\u6784\u68c0\u67e5\uff1a",
  checksWithIssues: "\u9879\u6709\u95ee\u9898",
  checkNameUnknownSpecies: "\u7269\u79cd\u5f15\u7528\u6709\u6548",
  checkNameDuplicateSpecies: "\u7269\u79cd\u547d\u540d\u552f\u4e00",
  checkNameNoSpecies: "\u57fa\u56e0\u5747\u6709\u7269\u79cd\u5f52\u5c5e",
  checkNameLeafInternalSpecies: "\u73b0\u5b58\u57fa\u56e0\u843d\u5728\u53f6\u7269\u79cd",
  checkNameDonorNoTransferBack: "\u8f6c\u79fb\u4f9b\u4f53\u914d\u5bf9\u5b8c\u6574",
  checkNameTransferBackNoParent: "\u8f6c\u79fb\u53d7\u4f53\u6709\u4f9b\u4f53\u8c31\u7cfb",
  checkTransferBackNoDonor: "\u8f6c\u79fb\u53d7\u4f53\u7684\u7236\u8282\u70b9\u4e0d\u662f\u4f9b\u4f53",
  checkNameTransferBackNoDonor: "\u8f6c\u79fb\u53d7\u4f53\u4f4d\u4e8e\u4f9b\u4f53\u4e4b\u4e0b",
  checkBifurcationNoTransferBack: "\u4e8c\u5206\u88c2\u51fa\u6b96\u4f9b\u4f53\u7f3a\u5c11\u8f6c\u79fb\u5b50\u8282\u70b9",
  checkNameBifurcationNoTransferBack: "\u4e8c\u5206\u88c2\u4f9b\u4f53\u5df2\u914d\u5bf9",
  checkTerminalEventWithChildren: "\u7ec8\u7aef\u4e8b\u4ef6\uff08\u4e22\u5931/\u73b0\u5b58\uff09\u5374\u542b\u6709\u5b50\u8282\u70b9",
  checkNameTerminalEventWithChildren: "\u4e22\u5931/\u73b0\u5b58\u4e8b\u4ef6\u4e3a\u672b\u7aef\u8282\u70b9",
  checkNonBinaryNode: "\u7269\u79cd\u5f62\u6210/\u91cd\u590d\u8282\u70b9\u975e\u4e8c\u6b67",
  checkNameNonBinaryNode: "\u7269\u79cd\u5f62\u6210/\u91cd\u590d\u4e3a\u4e8c\u6b67",
  checkTransferBackwardsInTime: "\u8f6c\u79fb\u5230\u7956\u5148\u7269\u79cd\uff08\u65f6\u95f4\u5012\u6d41\uff09",
  checkNameTransferBackwardsInTime: "\u8f6c\u79fb\u6cbf\u65f6\u95f4\u6b63\u5411",
  event: {
    speciation: "\u7269\u79cd\u5f62\u6210",
    duplication: "\u57fa\u56e0\u91cd\u590d",
    loss: "\u57fa\u56e0\u4e22\u5931",
    branchingOut: "\u57fa\u56e0\u8f6c\u79fb(\u4f9b\u4f53)",
    bifurcationOut: "\u6811\u5916\u5206\u53c9",
    transferBack: "\u57fa\u56e0\u8f6c\u79fb(\u53d7\u4f53)",
    leaf: "\u73b0\u5b58\u57fa\u56e0",
  },
};

/**
 * "1 gene trees" and "3 matches" read wrong in English. The dictionaries carry
 * the plural form, so singularise it when the count is one; Chinese units take
 * no plural suffix and are left untouched.
 */
const SINGULAR_UNITS: Record<string, string> = {
  "gene trees": "gene tree",
  "gene nodes": "gene node",
  matches: "match",
  warnings: "warning",
  species: "species",
  "source files": "source file",
};

export function countLabel(n: number, unit: string): string {
  if (n !== 1) return `${n} ${unit}`;
  // Stripping a trailing "s" would corrupt "matches" and "species", so the few
  // units the app counts are mapped explicitly; anything else is left as-is.
  return `1 ${SINGULAR_UNITS[unit] ?? unit}`;
}

export const translations: Record<Locale, Dict> = { zh, en };

/** Hook: current-locale dictionary. */
export function useT(): Dict {
  const locale = useStore((s) => s.locale);
  return translations[locale];
}
