import { Fragment, memo, useId, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type {
  EventType,
  GeneNode,
  SpeciesNode,
  SpeciesTree,
  TransferEdge,
} from "../model/types";
import type { LayoutResult } from "../layout";
import { gnPos, spPos, type Positions } from "../layout/positions";
import { rootStubLen } from "../layout/species";
import {
  connect,
  makeProjector,
  pj,
  routedGeneEdge,
  transferArc,
  type Orientation,
  type Projector,
  type Pt,
} from "./geometry";
import { type DetailLevel, type LabelStyle, type RenderOptions } from "./options";
import { countLabel, formatConfidence, useT, type Dict } from "../i18n";
import { geneColor, type Theme } from "./theme";

export interface SceneProps {
  result: LayoutResult;
  theme: Theme;
  options: RenderOptions;
  /** When set, gene nodes not in this set are dimmed (lineage highlight). */
  highlight?: Set<string> | null;
  /** "Show only matches": nodes outside this set are fully hidden (opacity 0). */
  hideOutside?: Set<string> | null;
  /** Nodes ring-highlighted (compare disagreements) instead of dimmed. */
  diffSet?: Set<string> | null;
  /** The node(s) the user just located (search match, QC "locate first").
   *  Dimming everything else does not make one node findable, so these get a
   *  bold outline drawn on top of the drawing. */
  locateSet?: Set<string> | null;
  interactive?: boolean;
  /** Level of detail; heavily zoomed-out views drop labels/glyphs. */
  detail?: DetailLevel;
  /** Localized event names for the native SVG `<title>` tooltips. */
  eventLabels?: Record<EventType, string>;
  onGeneEnter?: (node: GeneNode, evt: ReactMouseEvent) => void;
  onGeneLeave?: () => void;
  onGeneClick?: (node: GeneNode, evt: ReactMouseEvent) => void;
  /** Keyboard activation of a focused gene node (Enter/Space; modifiers follow
   *  the mouse semantics: Shift = annotate, Alt = collapse). */
  onGeneKeyDown?: (node: GeneNode, evt: ReactKeyboardEvent) => void;
  /** Toggle the child order (mirror) of a species subtree. */
  onSpeciesClick?: (speciesName: string) => void;
  /** User renames of labels, keyed by original label text. */
  labelOverrides?: Record<string, string>;
  /** User renames keyed by NODE ID: renaming one of several same-named labels. */
  labelOverridesById?: Record<string, string>;
  /** Click a species or gene label to rename it (node id enables a per-node
   *  rename instead of rewriting every label carrying the same text). */
  onLabelClick?: (originalLabel: string, nodeId: string | undefined, evt: ReactMouseEvent) => void;
  /** Click a transfer arc to inspect it (donor, recipient, family, time). */
  onTransferClick?: (edge: TransferEdge) => void;
  /** Per gene-tree color overrides, keyed by tree index. */
  geneColors?: Record<number, string>;
  /** User notes to draw on gene nodes, keyed by node id. */
  annotations?: Record<string, { text: string; color: string }>;
  /** Paint the full-canvas background rect (off for the infinite on-screen canvas). */
  showBackground?: boolean;
  /** On-screen mode: fill the container; pan/zoom via an SVG group transform (vector-crisp). */
  viewportMode?: boolean;
  /** SVG transform applied to the content group in viewport mode. */
  contentTransform?: string;
  /** When set, gene elements outside this projected rect are not rendered
   *  (virtualization for very large trees). Species and transfers always draw. */
  viewport?: CullRect | null;
  /** Accessible summary of the drawing for screen readers (on-screen only). */
  ariaLabel?: string;
  /**
   * The dictionary every string drawn by this scene is taken from.
   *
   * An exported figure renders `Scene` through `renderToStaticMarkup`, and
   * `useSyncExternalStore` (which zustand's `useT()` is built on) reads
   * `getInitialState()` during a server render - the language
   * `navigator.language` handed the store when it was created, NOT the one the
   * user picked (that is applied later, in `main.tsx`). Left to `useT()` alone,
   * an export would draw English tooltips under a Chinese legend. The exporters
   * therefore inject `currentDict()`, exactly like `buildLegendGroup` does, so
   * one artefact can never contain two locales (docs/STYLE-GUIDE-UI.md §5.1,
   * §6). The on-screen canvas omits this and gets the live `useT()` dictionary.
   */
  dict?: Dict;
  /** Localized collapsed-clade tooltip words (default to English). */
  collapsedWord?: string;
  leavesWord?: string;
  expandHint?: string;
  /** Localized "mirror subtree" tooltip for multi-child species branches. */
  mirrorWord?: string;
}

/** Coordinate accessors that read geometry out of the layout positions map. */
function spPoint(pos: Positions, s: SpeciesNode): Pt {
  const p = spPos(pos, s.id);
  return { x: p.x, y: p.y };
}
function gnPoint(pos: Positions, g: GeneNode): Pt {
  const p = gnPos(pos, g.id);
  return { x: p.x, y: p.y };
}

/** A viewport rectangle in projected (post-transform) coordinates for culling
 *  off-screen gene elements on very large trees. */
export interface CullRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Is a projected point inside the cull rect? (No rect = never culled.) */
function ptVisible(p: Pt, vp: CullRect | null | undefined): boolean {
  return !vp || (p.x >= vp.x0 && p.x <= vp.x1 && p.y >= vp.y0 && p.y <= vp.y1);
}

/** Does the bounding box of a segment overlap the cull rect? */
function segVisible(a: Pt, b: Pt, vp: CullRect | null | undefined): boolean {
  if (!vp) return true;
  return (
    Math.max(a.x, b.x) >= vp.x0 &&
    Math.min(a.x, b.x) <= vp.x1 &&
    Math.max(a.y, b.y) >= vp.y0 &&
    Math.min(a.y, b.y) <= vp.y1
  );
}

/** Text-anchor that makes tip labels read outward from the tree. */
function tipAnchor(o: Orientation): "start" | "middle" | "end" {
  return o === "left" ? "start" : o === "right" ? "end" : "middle";
}

/** Resolve a label's alignment to a text-anchor ("auto" follows orientation). */
function resolveAnchor(
  align: LabelStyle["align"] | undefined,
  o: Orientation,
): "start" | "middle" | "end" {
  return align === "left"
    ? "start"
    : align === "center"
      ? "middle"
      : align === "right"
        ? "end"
        : tipAnchor(o);
}

/** SVG font attributes for a label typography style. */
function labelFont(st: LabelStyle): {
  fontSize: number;
  fontWeight: number;
  fontStyle: "italic" | "normal";
} {
  return {
    fontSize: st.size,
    fontWeight: st.bold ? 600 : 400,
    fontStyle: st.italic ? "italic" : "normal",
  };
}

function hexToRgb(h: string): [number, number, number] {
  let s = h.replace("#", "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend between two hex colors, t in [0,1]. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const c = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/** Longest extant gene-tip label across all trees (for tier spacing). */
function maxGeneLeafLen(result: LayoutResult): number {
  let m = 0;
  for (const t of result.reconciliation.geneTrees) {
    for (const g of t.nodes) {
      if (g.endEvent.type === "leaf") {
        m = Math.max(m, (g.endEvent.geneName || g.name).length);
      }
    }
  }
  return m;
}

/**
 * Pure SVG renderer for a reconciliation. The heavy element tree is built by
 * the memoized `SceneContent`; only this thin outer shell re-runs on pan/zoom
 * (it just updates the `<g transform>`), so scrubbing the viewport does not
 * rebuild hundreds of paths.
 *
 * Rendering is a deterministic function of (layout + theme + options), which
 * lets us reuse it for on-screen display and for static export via
 * renderToStaticMarkup.
 */
export function Scene(props: SceneProps) {
  const {
    result,
    theme,
    options,
    showBackground = true,
    viewportMode = false,
    contentTransform,
    ariaLabel,
  } = props;
  // Per-instance suffix for SVG <defs> ids: several Scene instances (primary /
  // nested / compare panes) coexist in one document, and duplicate ids would be
  // invalid HTML and could make one pane's marker/gradient reference dangle
  // when another unmounts.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arrowId = `rpv-arrow-${theme.id}-${uid}`;
  const tubeGradId = `rpv-tube-${theme.id}-${uid}`;
  const proj = makeProjector(options.orientation, result.width, result.height);
  const grad = gradientVector(options.orientation);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      // "group", not "img": an image role flattens the subtree for assistive
      // tech, hiding the interactive gene buttons inside it. The aria-label
      // still summarizes the drawing for everyone.
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      viewBox={viewportMode ? undefined : `0 0 ${proj.width} ${proj.height}`}
      width={viewportMode ? "100%" : proj.width}
      height={viewportMode ? "100%" : proj.height}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
        ...(viewportMode
          ? { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }
          : {}),
      }}
    >
      <defs>
        {Array.from(
          new Set([
            ...result.reconciliation.geneTrees.map((tree) => tree.index),
            ...result.transfers.map((t) => t.treeIndex),
          ]),
        ).map((ti) => (
          <marker
            key={ti}
            id={`${arrowId}-${ti}`}
            markerWidth="9"
            markerHeight="9"
            refX="6.5"
            refY="3"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            {/* The arc is drawn in its family colour (renderTransfers), so the
                head has to be too: a fixed purple head on a blue arc would
                match neither the arc nor the legend swatch. */}
            <path d="M0,0 L7,3 L0,6 Z" fill={props.geneColors?.[ti] ?? geneColor(theme, ti)} />
          </marker>
        ))}
        <linearGradient id={tubeGradId} x1={grad.x1} y1={grad.y1} x2={grad.x2} y2={grad.y2}>
          <stop offset="0" stopColor={theme.speciesFill} />
          <stop offset="1" stopColor={theme.speciesStroke} />
        </linearGradient>
      </defs>

      {showBackground && (
        <rect x={0} y={0} width={proj.width} height={proj.height} fill={theme.background} />
      )}

      <g className="rpv-content" transform={viewportMode ? contentTransform : undefined}>
        <SceneContent
          result={result}
          theme={theme}
          options={options}
          highlight={props.highlight}
          hideOutside={props.hideOutside}
          diffSet={props.diffSet}
          locateSet={props.locateSet}
          labelOverridesById={props.labelOverridesById}
          onTransferClick={props.onTransferClick}
          interactive={props.interactive}
          detail={props.detail}
          dict={props.dict}
          eventLabels={props.eventLabels}
          collapsedWord={props.collapsedWord}
          leavesWord={props.leavesWord}
          expandHint={props.expandHint}
          mirrorWord={props.mirrorWord}
          arrowId={arrowId}
          tubeGradId={tubeGradId}
          onGeneEnter={props.onGeneEnter}
          onGeneLeave={props.onGeneLeave}
          onGeneClick={props.onGeneClick}
          onGeneKeyDown={props.onGeneKeyDown}
          onSpeciesClick={props.onSpeciesClick}
          labelOverrides={props.labelOverrides}
          onLabelClick={props.onLabelClick}
          geneColors={props.geneColors}
          annotations={props.annotations}
          viewport={props.viewport}
        />
      </g>
    </svg>
  );
}

/**
 * The actual element tree. Memoized so it only rebuilds when the drawing truly
 * changes (layout/theme/options/highlight/detail/colors) - never on pan/zoom,
 * which only mutates the parent `<g transform>` in `Scene`.
 */
const SceneContent = memo(function SceneContent({
  result,
  theme,
  options,
  highlight = null,
  hideOutside = null,
  interactive = false,
  detail = "full",
  arrowId,
  tubeGradId,
  onGeneEnter,
  onGeneLeave,
  onGeneClick,
  onGeneKeyDown,
  onSpeciesClick,
  labelOverrides,
  labelOverridesById,
  onLabelClick,
  onTransferClick,
  diffSet = null,
  locateSet = null,
  geneColors,
  annotations = {},
  viewport = null,
  dict,
}: SceneProps & { arrowId: string; tubeGradId: string }) {
  const liveT = useT();
  // An injected dictionary wins: a static markup render cannot see the locale
  // the user picked (see `SceneProps.dict`). Omitted = the live on-screen one.
  const t = dict ?? liveT;
  const { reconciliation: recon, transfers, width, height, positions: pos } = result;
  const { species } = recon;
  const hidden = result.hiddenIds;
  const collapsed = result.collapsedIds;
  const colorOf = (ti: number) => geneColors?.[ti] ?? geneColor(theme, ti);
  const proj = makeProjector(options.orientation, width, height);
  const showLabels = detail !== "low";
  // Species names sit on a lower tier only when gene-tip labels are also shown;
  // otherwise they hug the tips.
  const speciesLabelDy =
    14 + (options.showGeneLabels ? Math.min(180, maxGeneLeafLen(result) * 5.2) : 0);

  return (
    <>
      <g className="species-layer">
        {renderSpecies(species.root, species.nodes, theme, options, result, proj, pos, interactive ? onSpeciesClick : undefined, t.mirrorHint, tubeGradId)}
      </g>
      {options.showSpeciesLabels && showLabels && (
        <g className="species-labels">{renderSpeciesLabels(species.nodes, theme, options, proj, pos, speciesLabelDy, labelOverrides, onLabelClick)}</g>
      )}
      {options.showSpeciesCladeNames && showLabels && (
        <g className="species-clade-labels">{renderSpeciesCladeLabels(species.nodes, theme, options, proj, pos, labelOverrides, onLabelClick)}</g>
      )}

      <g className="gene-layer">
        {recon.geneTrees.map((tree) => (
          <Fragment key={tree.index}>
            {renderGeneEdges(tree.nodes, theme, options, proj, pos, species, highlight, hidden, detail, colorOf(tree.index), viewport, hideOutside)}
            {renderGeneGlyphs(tree.nodes, theme, options, proj, pos, highlight, hidden, collapsed, detail, t, colorOf(tree.index), {
              interactive,
              onGeneEnter,
              onGeneLeave,
              onGeneClick,
              onGeneKeyDown,
            }, viewport, hideOutside, diffSet)}
            {options.showGeneLabels && showLabels && renderGeneLabels(tree.nodes, theme, options, proj, pos, highlight, hidden, collapsed, colorOf(tree.index), viewport, hideOutside, labelOverrides, labelOverridesById, onLabelClick, t)}
          </Fragment>
        ))}
      </g>

      <g className="transfer-layer">
        {renderTransfers(transfers, options, proj, pos, arrowId, highlight, hideOutside, colorOf, t, onTransferClick)}
      </g>

      <g className="annotation-layer">
        {renderAnnotations(annotations, pos, proj, hidden, options.symbolSize, hideOutside)}
      </g>

      {locateSet && locateSet.size > 0 && (
        <g className="locate-layer">
          {renderLocate(locateSet, pos, proj, hidden, options.symbolSize)}
        </g>
      )}
    </>
  );
});

/**
 * Outline for the node a locate request targeted. The id is looked up in the
 * gene map first and then the species map, so a located node is ringed
 * whatever kind it is, and the ring needs only a position — which is why it
 * still shows at detail levels that hide the glyphs and labels themselves.
 */
function renderLocate(
  ids: Set<string>,
  pos: Positions,
  proj: Projector,
  hidden: Set<string>,
  symbolSize: number,
): ReactNode[] {
  const out: ReactNode[] = [];
  const r = symbolSize + 7;
  for (const id of ids) {
    if (hidden.has(id)) continue;
    const p = pos.gene.get(id) ?? pos.species.get(id);
    if (!p) continue;
    const q = pj(proj, { x: p.x, y: p.y });
    out.push(
      <g key={`locate-${id}`} pointerEvents="none">
        <circle cx={q.x} cy={q.y} r={r + 5} fill="var(--locate)" fillOpacity={0.14} />
        <circle
          className="locate-ring"
          cx={q.x}
          cy={q.y}
          r={r}
          fill="none"
          stroke="var(--locate)"
          strokeWidth={3}
        />
      </g>,
    );
  }
  return out;
}

/** Gradient direction (objectBoundingBox) aligned with the growth axis. */
function gradientVector(o: Orientation): { x1: number; y1: number; x2: number; y2: number } {
  switch (o) {
    case "bottom": // grow up
      return { x1: 0, y1: 1, x2: 0, y2: 0 };
    case "left": // grow right
      return { x1: 0, y1: 0, x2: 1, y2: 0 };
    case "right": // grow left
      return { x1: 1, y1: 0, x2: 0, y2: 0 };
    case "top": // grow down
    default:
      return { x1: 0, y1: 0, x2: 0, y2: 1 };
  }
}

// --------------------------------------------------------------------------
// species tubes
// --------------------------------------------------------------------------

function renderSpecies(
  root: SpeciesNode,
  nodes: SpeciesNode[],
  theme: Theme,
  options: RenderOptions,
  result: LayoutResult,
  proj: Projector,
  pos: Positions,
  onSpeciesClick?: (name: string) => void,
  mirrorWord = "",
  tubeGradId?: string,
) {
  const paths: JSX.Element[] = [];
  const tubeStroke = options.speciesGradient && tubeGradId
    ? `url(#${tubeGradId})`
    : theme.speciesFill;
  // Copy-number heatmap: shade each branch by how many gene lanes it carries.
  let maxLane = 1;
  if (options.copyHeatmap) {
    for (const n of nodes) maxLane = Math.max(maxLane, spPos(pos, n.id).laneCount);
  }
  const strokeFor = (n: SpeciesNode): string => {
    if (!options.copyHeatmap) return tubeStroke;
    const lane = spPos(pos, n.id).laneCount;
    const tt = maxLane > 1 ? (lane - 1) / (maxLane - 1) : 0;
    return lerpHex(theme.speciesFill, theme.event.duplication, tt);
  };
  const swapProps = (n: SpeciesNode) =>
    onSpeciesClick && n.children.length > 1
      ? {
          style: { cursor: "pointer" as const },
          onClick: () => onSpeciesClick(n.name),
          // Keyboard parity for the mirror gesture: the species tubes were
          // mouse-only, which stranded keyboard users at a core interaction.
          tabIndex: 0,
          role: "button" as const,
          "aria-label": `${mirrorWord}: ${n.name}`,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onSpeciesClick(n.name);
            }
          },
        }
      : {};
  // root stub (short, straight segment above the root along the growth axis)
  const stub = rootStubLen(result.options);
  const rootPt = spPoint(pos, root);
  const rootWidth = spPos(pos, root.id).width;
  const a = pj(proj, { x: rootPt.x, y: rootPt.y - stub });
  const b = pj(proj, { x: rootPt.x, y: rootPt.y });
  paths.push(
    <path
      key="sp-root-stub"
      d={`M${a.x},${a.y} L${b.x},${b.y}`}
      stroke={strokeFor(root)}
      strokeWidth={rootWidth}
      strokeLinecap={options.curved ? "round" : "butt"}
      fill="none"
      opacity={options.speciesOpacity}
      {...swapProps(root)}
    >
      {onSpeciesClick && root.children.length > 1 && <title>{mirrorWord}</title>}
    </path>,
  );
  for (const n of nodes) {
    if (!n.parent) continue;
    paths.push(
      <path
        key={`sp-${n.id}`}
        d={connect(proj, spPoint(pos, n.parent), spPoint(pos, n), options.curved)}
        stroke={strokeFor(n)}
        strokeWidth={spPos(pos, n.id).width}
        strokeLinecap={options.curved ? "round" : "butt"}
        strokeLinejoin={options.curved ? "round" : "miter"}
        fill="none"
        opacity={options.speciesOpacity}
        {...swapProps(n)}
      >
        {onSpeciesClick && n.children.length > 1 && <title>{mirrorWord}</title>}
      </path>,
    );
  }
  return paths;
}

/** Species tip labels along the leaf baseline. */
function renderSpeciesLabels(
  nodes: SpeciesNode[],
  theme: Theme,
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  dy: number,
  labelOverrides?: Record<string, string>,
  onLabelClick?: (originalLabel: string, nodeId: string | undefined, evt: ReactMouseEvent) => void,
) {
  const leaves = nodes.filter((n) => n.children.length === 0);
  const st = options.speciesLabelStyle;
  const font = labelFont(st);
  const anchor = resolveAnchor(st.align, options.orientation);
  return leaves.map((n) => {
    const sp = spPos(pos, n.id);
    const p = pj(proj, { x: sp.x, y: sp.y + dy + st.offset });
    const displayName = labelOverrides?.[n.name] ?? n.name;
    return (
      <text
        key={`spl-${n.id}`}
        x={p.x}
        y={p.y}
        fill={theme.speciesLabel}
        {...font}
        textAnchor={anchor}
        dominantBaseline="middle"
        transform={`rotate(${st.angle} ${p.x} ${p.y})`}
        style={{
          paintOrder: "stroke",
          stroke: theme.background,
          strokeWidth: 3,
          strokeLinejoin: "round",
          ...(onLabelClick ? { cursor: "pointer" } : {}),
        }}
        onClick={onLabelClick ? (e) => { e.stopPropagation(); onLabelClick(n.name, n.id, e); } : undefined}
      >
        {displayName}
      </text>
    );
  });
}

/** Labels of INTERNAL species clades (phylum/class/... names), shown on demand.
 *  The clade name carries the node's support value when one was parsed and the
 *  support toggle is on, so a bootstrap on an internal species is visible. */
function renderSpeciesCladeLabels(
  nodes: SpeciesNode[],
  theme: Theme,
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  labelOverrides?: Record<string, string>,
  onLabelClick?: (originalLabel: string, nodeId: string | undefined, evt: ReactMouseEvent) => void,
) {
  const st = { ...options.speciesLabelStyle, size: Math.max(10, options.speciesLabelStyle.size - 1.5) };
  const font = labelFont(st);
  const anchor = resolveAnchor(st.align, options.orientation);
  return nodes
    .filter((n) => n.children.length > 0)
    .map((n) => {
      const sp = spPos(pos, n.id);
      const p = pj(proj, { x: sp.x, y: sp.y });
      const base = labelOverrides?.[n.name] ?? n.name;
      const support = options.showSupport && n.support ? ` (${n.support.value})` : "";
      if (!base) return null;
      return (
        <text
          key={`spc-${n.id}`}
          x={p.x}
          y={p.y}
          fill={theme.muted}
          {...font}
          textAnchor={anchor}
          dominantBaseline="middle"
          transform={`rotate(${st.angle} ${p.x} ${p.y})`}
          style={{
            paintOrder: "stroke",
            stroke: theme.background,
            strokeWidth: 3,
            strokeLinejoin: "round",
            ...(onLabelClick ? { cursor: "pointer" } : {}),
          }}
          onClick={onLabelClick ? (e) => { e.stopPropagation(); onLabelClick(n.name, n.id, e); } : undefined}
        >
          {`${base}${support}`}
        </text>
      );
    });
}

// --------------------------------------------------------------------------
// gene edges
// --------------------------------------------------------------------------

function isTransferArrival(g: GeneNode): boolean {
  return g.events.some((e) => e.type === "transferBack");
}

// A transfer arrival's edge is only dropped when its parent is a genuine donor,
// mirroring layout/transfers.computeTransfers so the arc layer and the tree
// edges stay consistent.
function isTransferDonor(g: GeneNode): boolean {
  return g.endEvent.type === "branchingOut" || g.endEvent.type === "bifurcationOut";
}

/**
 * Opacity for a node under the lineage/search highlight set. Nodes hidden by
 * "show only matches" are skipped entirely by the render functions below
 * (never rendered), so they cannot be hovered, clicked or annotated.
 */
function dimmed(id: string, highlight: Set<string> | null): number {
  if (!highlight) return 1;
  return highlight.has(id) ? 1 : 0.12;
}

/**
 * Path for a gene edge between parent `g` and child `c`.
 *
 * Whenever both ends have a resolvable species the edge is routed along the
 * species tubes (see {@link routedGeneEdge}); otherwise it falls back to the
 * plain connector. In fallback elbow mode the edge bends at the *child's
 * species-branch midpoint* - the closest single-bend approximation of the
 * tube turn.
 */
function geneEdgePath(
  proj: Projector,
  species: SpeciesTree,
  pos: Positions,
  g: GeneNode,
  c: GeneNode,
  curved: boolean,
): string {
  const routed = routedGeneEdge(species, pos, g, c, curved);
  if (routed && routed.segs.length > 0) {
    const p0 = pj(proj, routed.start);
    let d = `M${p0.x},${p0.y}`;
    for (const s of routed.segs) {
      if (s.kind === "L") {
        const p = pj(proj, s.to);
        d += ` L${p.x},${p.y}`;
      } else {
        const a = pj(proj, s.c1);
        const b = pj(proj, s.c2);
        const p = pj(proj, s.to);
        d += ` C${a.x},${a.y} ${b.x},${b.y} ${p.x},${p.y}`;
      }
    }
    return d;
  }
  const c0 = gnPoint(pos, g);
  const c1 = gnPoint(pos, c);
  if (curved) return connect(proj, c0, c1, true);
  let bendY = (c0.y + c1.y) / 2;
  const sc = species.byName.get(c.speciesId);
  if (sc && sc.parent) {
    const mid = (spPos(pos, sc.parent.id).y + spPos(pos, sc.id).y) / 2;
    const lo = Math.min(c0.y, c1.y);
    const hi = Math.max(c0.y, c1.y);
    bendY = Math.max(lo, Math.min(hi, mid));
  }
  const p0 = pj(proj, c0);
  const b1 = pj(proj, { x: c0.x, y: bendY });
  const b2 = pj(proj, { x: c1.x, y: bendY });
  const p1 = pj(proj, c1);
  return `M${p0.x},${p0.y} L${b1.x},${b1.y} L${b2.x},${b2.y} L${p1.x},${p1.y}`;
}

function renderGeneEdges(
  nodes: GeneNode[],
  theme: Theme,
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  species: SpeciesTree,
  highlight: Set<string> | null,
  hidden: Set<string>,
  detail: DetailLevel,
  color: string,
  viewport: CullRect | null,
  hideOutside?: Set<string> | null,
) {
  // Halos double the path count; drop them when zoomed far out.
  const halo = options.haloUnderGenes && detail !== "low";
  const out: JSX.Element[] = [];
  for (const g of nodes) {
    if (hidden.has(g.id)) continue;
    for (const c of g.children) {
      if (hidden.has(c.id)) continue;
      // A transfer arrival is drawn as an arc (in the transfer layer) and its
      // vertical tree edge dropped - but ONLY when the parent really is a
      // donor. An unpaired transferBack under a normal node keeps its tree edge
      // so the drawn topology matches the file.
      if (isTransferArrival(c) && isTransferDonor(g)) continue;
      // "Show only matches": hidden nodes are not rendered at all, so they
      // stay un-hoverable / un-clickable (opacity alone keeps them interactive).
      if (hideOutside && !hideOutside.has(c.id)) continue;
      if (viewport && !segVisible(pj(proj, gnPoint(pos, g)), pj(proj, gnPoint(pos, c)), viewport)) continue;
      const op = dimmed(c.id, highlight);
      const d = geneEdgePath(proj, species, pos, g, c, options.curved);
      if (halo) {
        out.push(
          <path
            key={`he-${c.id}`}
            d={d}
            stroke={theme.background}
            strokeWidth={options.geneThickness + 2.2}
            strokeLinecap="round"
            fill="none"
            opacity={op}
          />,
        );
      }
      out.push(
        <path
          key={`ge-${c.id}`}
          d={d}
          stroke={color}
          strokeWidth={options.geneThickness}
          strokeLinecap="round"
          fill="none"
          opacity={op}
        />,
      );
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// gene glyphs
// --------------------------------------------------------------------------

interface GlyphHandlers {
  interactive: boolean;
  onGeneEnter?: (node: GeneNode, evt: ReactMouseEvent) => void;
  onGeneLeave?: () => void;
  onGeneClick?: (node: GeneNode, evt: ReactMouseEvent) => void;
  onGeneKeyDown?: (node: GeneNode, evt: ReactKeyboardEvent) => void;
}

function renderGeneGlyphs(
  nodes: GeneNode[],
  theme: Theme,
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  highlight: Set<string> | null,
  hidden: Set<string>,
  collapsed: Set<string>,
  detail: DetailLevel,
  dict: Dict,
  color: string,
  h: GlyphHandlers,
  viewport: CullRect | null,
  hideOutside?: Set<string> | null,
  diffSet?: Set<string> | null,
) {
  const s = options.symbolSize;
  // Pure event glyphs (dup/loss/transfer/speciation markers) only at full
  // detail; collapsed wedges and leaf tips always render so structure reads.
  const showEventGlyph = options.showEvents && detail === "full";
  const visible = nodes.filter(
      (g) =>
        !hidden.has(g.id) &&
        !(hideOutside && !hideOutside.has(g.id)) &&
        (showEventGlyph ||
          collapsed.has(g.id) ||
          g.endEvent.type === "leaf"),
  );
  // Which nodes survive viewport culling is only known while mapping; track it
  // so the FIRST CULLED-SURVIVING node carries the roving tab stop. Culling
  // used to be able to remove exactly the one node with tabIndex=0, leaving
  // keyboard users with no tab stop in the drawing at all.
  let renderedCount = 0;
  return visible
    .map((g) => {
      const op = dimmed(g.id, highlight);
      const isCollapsed = collapsed.has(g.id);
      const c = pj(proj, gnPoint(pos, g));
      if (viewport && !ptVisible(c, viewport)) return null;
      const tabStop = renderedCount === 0;
      renderedCount += 1;
      const glyph = isCollapsed
        ? collapsedGlyph(c.x, c.y, proj, color, s)
        : geneGlyph(g.endEvent.type, c.x, c.y, theme, color, s);
      const title = isCollapsed
        ? // The expand gesture is only promised where a click exists to make it:
          // a PNG/SVG/PDF is a static picture, so selling "Alt/⌥- or ⌘-click to
          // expand" inside it would be wording the artefact's own implementation
          // cannot carry out (docs/STYLE-GUIDE-UI.md §3.3).
          `${g.name ? `${g.name}\n` : ""}${dict.collapsedClade} · ${countLabel(leafCount(g), dict.leavesUnit)}${
            h.interactive ? ` · ${dict.expandHint}` : ""
          }`
        : tooltipText(g, dict);
      // Confidence shown next to the node: the terminal event's value first,
      // then a clade-level support - the same accessor the filter uses, so a
      // value that can be filtered on is also visible.
      const conf = g.endEvent.confidence ?? g.support?.value;
      const isDiff = diffSet?.has(g.id) ?? false;
      return (
        <g
          key={`gg-${g.id}`}
          role={h.interactive ? "button" : undefined}
          // Roving tabindex: the gene layer is ONE stop in the tab order
          // and the arrow keys move focus between nodes. Giving every glyph
          // tabIndex=0 would make a 4,000-node tree a 4,000-stop walk that no
          // keyboard user can traverse; the nodes stay real focusable buttons
          // with their aria-label, they are just reached by arrowing.
          tabIndex={h.interactive ? (tabStop ? 0 : -1) : undefined}
          aria-label={h.interactive ? title : undefined}
          opacity={op}
          style={h.interactive ? { cursor: "pointer" } : undefined}
          onMouseEnter={h.interactive && h.onGeneEnter ? (e) => h.onGeneEnter!(g, e) : undefined}
          onMouseLeave={h.interactive ? h.onGeneLeave : undefined}
          onClick={h.interactive && h.onGeneClick ? (e) => h.onGeneClick!(g, e) : undefined}
          onKeyDown={
            h.interactive
              ? (e) => {
                  const dir =
                    e.key === "ArrowRight" || e.key === "ArrowDown"
                      ? 1
                      : e.key === "ArrowLeft" || e.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (dir !== 0) {
                    const sib = (
                      dir > 0 ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling
                    ) as SVGGElement | null;
                    if (sib && sib.tagName === "g" && sib.hasAttribute("aria-label")) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.setAttribute("tabindex", "-1");
                      sib.setAttribute("tabindex", "0");
                      sib.focus();
                    }
                    return;
                  }
                  h.onGeneKeyDown?.(g, e);
                }
              : undefined
          }
        >
          {/* The native SVG <title> and the app's own portal tooltip say the same
              thing, so showing both stacks two popups on hover. Keep the
              native one only where the custom tooltip is not in play. */}
          {!(h.interactive && h.onGeneEnter) && <title>{title}</title>}
          {h.interactive && (
            <circle cx={c.x} cy={c.y} r={s + 4} fill="transparent" />
          )}
          {glyph}
          {isDiff && (
            // Compare-mode disagreement ring: visible at the same time as the
            // search dimming, which the old single `focus` channel could not
            // express (the diff used to REPLACE the search focus).
            <circle
              cx={c.x}
              cy={c.y}
              r={s + 2.5}
              fill="none"
              stroke={theme.event.duplication}
              strokeWidth={2}
              opacity={0.9}
            />
          )}
          {options.showSupport && conf != null && (
            <text
              x={c.x + s}
              y={c.y - s * 0.6}
              fontSize={9}
              fill={theme.muted}
            >
              {conf}
            </text>
          )}
        </g>
      );
    });
}

/** Number of extant-leaf descendants under a node (for collapsed labels). */
function leafCount(g: GeneNode): number {
  if (g.children.length === 0) return g.endEvent.type === "leaf" ? 1 : 0;
  let n = 0;
  for (const c of g.children) n += leafCount(c);
  return n;
}

/** Wedge marking a collapsed clade, pointing toward the leaves. */
function collapsedGlyph(
  x: number,
  y: number,
  proj: Projector,
  color: string,
  s: number,
): JSX.Element {
  const w = s * 1.5;
  const hgt = s * 1.9;
  const bx = x + proj.leafDx * hgt;
  const by = y + proj.leafDy * hgt;
  // perpendicular to the leaf direction
  const px = -proj.leafDy;
  const py = proj.leafDx;
  return (
    <path
      d={`M${x},${y} L${bx + px * w},${by + py * w} L${bx - px * w},${by - py * w} Z`}
      fill={color}
      opacity={0.85}
      stroke={color}
      strokeWidth={1}
      strokeLinejoin="round"
    />
  );
}

function geneGlyph(
  type: string,
  x: number,
  y: number,
  theme: Theme,
  color: string,
  s: number,
): JSX.Element {
  const half = s / 2;
  switch (type) {
    case "duplication":
      return (
        <rect
          x={x - half}
          y={y - half}
          width={s}
          height={s}
          rx={0}
          fill={theme.event.duplication}
          stroke={theme.background}
          strokeWidth={1}
        />
      );
    case "loss":
      return (
        <g stroke={theme.event.loss} strokeWidth={1.8} strokeLinecap="round">
          <line x1={x - half} y1={y - half} x2={x + half} y2={y + half} />
          <line x1={x - half} y1={y + half} x2={x + half} y2={y - half} />
        </g>
      );
    case "bifurcationOut":
      return (
        <path
          d={`M${x},${y - half} L${x + half},${y} L${x},${y + half} L${x - half},${y} Z`}
          fill={theme.event.bifurcationOut}
          stroke={theme.background}
          strokeWidth={1}
        />
      );
    case "branchingOut":
      return (
        <circle
          cx={x}
          cy={y}
          r={half}
          fill={theme.background}
          stroke={theme.event.branchingOut}
          strokeWidth={2}
        />
      );
    case "leaf":
      return <circle cx={x} cy={y} r={half - 0.5} fill={color} />;
    case "speciation":
    default:
      return <circle cx={x} cy={y} r={half - 1.5} fill={color} opacity={0.85} />;
  }
}

function tooltipText(g: GeneNode, t: Dict): string {
  const ev = g.endEvent;
  const label = t.event[ev.type];
  const where = ev.speciesLocation ?? ev.destinationSpecies ?? g.speciesId;
  const name = g.name ? `${g.name}\n` : "";
  const lines: string[] = [`${name}${label}${where ? ` · ${where}` : ""}`.trimEnd()];
  // The scientific evidence a reviewer needs, without opening a panel: time
  // slice, event confidence, clade support, and every transfer arrival.
  if (ev.timeSlice != null) lines.push(`${t.inspTimeSlice}: ${ev.timeSlice}`);
  if (ev.confidence != null) lines.push(`${t.inspConfidence}: ${formatConfidence(ev.confidence)}`);
  else if (g.support) lines.push(`${t.inspSupport}: ${g.support.value}`);
  if (g.branchLength != null) lines.push(`${t.inspBranch}: ${g.branchLength}`);
  for (const e of g.events) {
    if (e.type === "transferBack") {
      lines.push(
        `${t.event.transferBack}: ${e.speciesLocation ?? t.inspNone} → ${e.destinationSpecies ?? t.inspNone}` +
          // The arrival's own evidence rides on as ` · ` fields, never in
          // brackets: STYLE §2.4 gives English `()` and Chinese `（）`, and this
          // one line of code is read by both, so the half-width pair used to put
          // English punctuation into a Chinese tooltip (STYLE §2.6 allows ` · `
          // as the separator, §2.4 prefers it over brackets for spliced text).
          (e.timeSlice != null ? ` · ${t.inspTimeSlice} ${e.timeSlice}` : "") +
          (e.confidence != null ? ` · ${t.inspConfidence} ${e.confidence}` : ""),
      );
    }
  }
  return lines.join("\n");
}

function renderGeneLabels(
  nodes: GeneNode[],
  theme: Theme,
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  highlight: Set<string> | null,
  hidden: Set<string>,
  collapsed: Set<string>,
  color: string,
  viewport: CullRect | null,
  hideOutside?: Set<string> | null,
  labelOverrides?: Record<string, string>,
  labelOverridesById?: Record<string, string>,
  onLabelClick?: (originalLabel: string, nodeId: string | undefined, evt: ReactMouseEvent) => void,
  t?: Dict,
) {
  const bottom: GeneNode[] = [];
  const internal: GeneNode[] = [];
  for (const g of nodes) {
    if (hidden.has(g.id)) continue;
    if (hideOutside && !hideOutside.has(g.id)) continue;
    const isLeaf = g.endEvent.type === "leaf";
    const isCollapsed = collapsed.has(g.id);
    if (isLeaf || isCollapsed) bottom.push(g);
    else if (options.showInternalGeneNames && g.name) internal.push(g);
  }

  const out: JSX.Element[] = [];
  const emit = (g: GeneNode, isBottom: boolean): void => {
    const isCollapsed = collapsed.has(g.id);
    const isLeaf = g.endEvent.type === "leaf";
    // The override key: the original label text (without collapsed suffix).
    const overrideKey = isLeaf
      ? (g.endEvent.geneName || g.name)
      : g.name;
    // Rename resolution: a NODE-ID rename (renaming ONE of several same-named
    // labels) wins over the text-keyed override.
    const idOverride = labelOverridesById?.[g.id];
    // Apply user override to the base label.
    let displayName: string;
    if (isCollapsed) {
      // An unnamed collapsed clade is still a clade, so the drawn text names it
      // with the dictionary's collapsed-clade word: the bare ` (2)` it used to
      // produce - and the `undefined` the glyph tooltip spelled out for the same
      // node - both restated a deleted dictionary key (`cladeFallback`, whose
      // value broke GLOSSARY row 16) as a label. STYLE §5.1: the wording comes
      // from the dictionary, which is also why `t` is passed in at the call site.
      const base = overrideKey ? (idOverride ?? labelOverrides?.[overrideKey] ?? overrideKey) : (t?.collapsedClade ?? "");
      // The leaf count is spliced on with ` · `, not in brackets: §2.4 gives
      // English `()` and Chinese `（）` and this line feeds both.
      displayName = `${base} · ${leafCount(g)}`;
    } else {
      displayName = overrideKey ? (idOverride ?? labelOverrides?.[overrideKey] ?? overrideKey) : "";
    }
    if (!displayName) return;
    // Long taxon / gene identifiers - environmental sample names routinely run
    // to hundreds of characters - are truncated to LABEL_MAX: at full length
    // they overflow the label tier the layout reserves and collide with
    // neighbouring labels. The glyph's own tooltip and aria-label carry the
    // whole string, so nothing is lost to a hover or a screen reader.
    const LABEL_MAX = 48;
    // "Full labels" trades tidiness for completeness: publication exports of
    // long accessions used to lose everything past 48 characters with no
    // in-figure way to recover it.
    if (!options.fullLabels && displayName.length > LABEL_MAX) {
      displayName = displayName.slice(0, LABEL_MAX - 1) + "\u2026";
    }
    const st = isBottom ? options.geneTipLabelStyle : options.geneInternalLabelStyle;
    const font = labelFont(st);
    const anchor = resolveAnchor(st.align, options.orientation);
    // bottom labels sit beyond the tip (toward leaves); internal labels sit
    // just back toward the root.
    const dyOff = (isBottom ? options.symbolSize + 6 : -8) + st.offset;
    const gp = gnPos(pos, g.id);
    const p = pj(proj, { x: gp.x, y: gp.y + dyOff });
    if (viewport && !ptVisible(p, viewport)) return;
    out.push(
      <text
        key={`gl-${g.id}`}
        x={p.x}
        y={p.y}
        fill={isBottom ? color : theme.muted}
        {...font}
        textAnchor={anchor}
        dominantBaseline="middle"
        transform={`rotate(${st.angle} ${p.x} ${p.y})`}
        opacity={dimmed(g.id, highlight)}
        style={{
          paintOrder: "stroke",
          stroke: theme.background,
          strokeWidth: 3,
          strokeLinejoin: "round",
          ...(onLabelClick && overrideKey ? { cursor: "pointer" } : {}),
        }}
        onClick={onLabelClick && overrideKey ? (e) => { e.stopPropagation(); onLabelClick(overrideKey, g.id, e); } : undefined}
      >
        {displayName}
      </text>,
    );
  };
  for (const g of bottom) emit(g, true);
  for (const g of internal) emit(g, false);
  return out;
}

// --------------------------------------------------------------------------
// transfers
// --------------------------------------------------------------------------

function renderTransfers(
  transfers: TransferEdge[],
  options: RenderOptions,
  proj: Projector,
  pos: Positions,
  arrowId: string,
  highlight: Set<string> | null,
  hideOutside: Set<string> | null,
  colorOf: (ti: number) => string,
  dict: Dict,
  onTransferClick?: (edge: TransferEdge) => void,
) {
  // Multiple arrivals on one node (or the same donor->recipient pair) used to
  // draw perfectly overlapping arcs - N statistical events looked like one.
  // Lateral index offsets spread them apart so each arrival is countable.
  const pairSeen = new Map<string, number>();
  return transfers.map((t) => {
    // "Show only matches": arcs touching a hidden node are skipped entirely.
    if (hideOutside && (!hideOutside.has(t.from.id) || !hideOutside.has(t.to.id))) return null;
    const op = Math.min(dimmed(t.from.id, highlight), dimmed(t.to.id, highlight));
    // Use the gene tree color for each transfer, so different families are
    // visually distinguished instead of all being the same color.
    const stroke = colorOf(t.treeIndex);
    const pairKey = `${t.from.id}\u0000${t.to.id}`;
    const idx = pairSeen.get(pairKey) ?? 0;
    pairSeen.set(pairKey, idx + 1);
    const bow = Math.min(0.5, options.transferBow + idx * 0.09);
    const donorSp = t.from.speciesId || t.from.endEvent.speciesLocation || dict.inspNone;
    const recipSp = t.to.speciesId || t.to.endEvent.destinationSpecies || dict.inspNone;
    const arrival = t.to.events.find((e) => e.type === "transferBack");
    const title =
      `${dict.event.transferBack}: ${donorSp} → ${recipSp}` +
      (arrival?.timeSlice != null ? `\n${dict.inspTimeSlice}: ${arrival.timeSlice}` : "") +
      (arrival?.confidence != null ? `\n${dict.inspConfidence}: ${formatConfidence(arrival.confidence)}` : "");
    return (
      <path
        key={t.id}
        d={transferArc(pj(proj, gnPoint(pos, t.from)), pj(proj, gnPoint(pos, t.to)), bow)}
        stroke={stroke}
        strokeWidth={2.5}
        strokeDasharray="2 4"
        strokeLinecap="round"
        fill="none"
        markerEnd={`url(#${arrowId}-${t.treeIndex})`}
        opacity={op}
        style={onTransferClick ? { cursor: "pointer" } : undefined}
        onClick={
          onTransferClick
            ? (e) => {
                e.stopPropagation();
                onTransferClick(t);
              }
            : undefined
        }
      >
        <title>{title}</title>
      </path>
    );
  });
}

// --------------------------------------------------------------------------
// annotations
// --------------------------------------------------------------------------

/** Draw a colored ring plus note text on every annotated (visible) gene node. */
function renderAnnotations(
  annotations: Record<string, { text: string; color: string }>,
  pos: Positions,
  proj: Projector,
  hidden: Set<string>,
  symbolSize: number,
  hideOutside?: Set<string> | null,
) {
  const out: JSX.Element[] = [];
  const r = symbolSize + 3;
  for (const [id, note] of Object.entries(annotations)) {
    const gp = pos.gene.get(id);
    if (!gp || hidden.has(id)) continue;
    if (hideOutside && !hideOutside.has(id)) continue;
    const p = pj(proj, { x: gp.x, y: gp.y });
    out.push(
      <g key={`anno-${id}`}>
        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={note.color} strokeWidth={2} />
        {note.text && (
          <text
            x={p.x + r + 3}
            y={p.y}
            fontSize={11}
            fontWeight={600}
            fill={note.color}
            dominantBaseline="central"
          >
            {note.text}
          </text>
        )}
      </g>,
    );
  }
  return out;
}
