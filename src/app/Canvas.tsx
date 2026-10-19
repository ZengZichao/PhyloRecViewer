import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { select as d3select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { countLabel, useT } from "../i18n";
import type { LayoutResult } from "../layout";
import type { GeneNode } from "../model/types";
import { lineageIds } from "../model/traverse";
import { Scene, type CullRect } from "../render/Scene";
import { makeProjector, type Orientation } from "../render/geometry";
import { detailLevelForZoom, type RenderOptions } from "../render/options";
import { type Theme } from "../render/theme";
import { useStore, type PaneId } from "../state/store";
import { useGlobalShortcuts, isTextInput } from "./hooks";

/** Above this gene-node count the canvas virtualizes (culls off-screen gene
 *  elements) so panning/zooming a very large tree stays responsive. */
const CULL_THRESHOLD = 1500;

interface View {
  k: number;
  x: number;
  y: number;
}

interface Tip {
  text: string;
  sub: string;
  x: number;
  y: number;
  /** Whether the hovered node supports collapse (internal node). */
  canCollapse: boolean;
}

export function Canvas({
  result,
  theme,
  options,
  title,
  paneId = "primary",
  onSpeciesClick,
  onToggleCollapse,
  geneColors,
  focus,
  locate,
}: {
  result: LayoutResult;
  theme: Theme;
  options: RenderOptions;
  title?: string;
  /** Identifies which pane this canvas is, so locate requests route correctly. */
  paneId?: PaneId;
  onSpeciesClick?: (name: string) => void;
  onToggleCollapse?: (geneId: string) => void;
  geneColors?: Record<number, string>;
  /** Search/filter focus set: nodes outside it are dimmed. */
  focus?: Set<string> | null;
  /** Center-on-node request (routes by pane). */
  locate?: { geneId: string; nonce: number; pane?: PaneId } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const reconRef = useRef<unknown>(null);
  const orientRef = useRef<string | null>(null);
  const lastLocate = useRef(0);
  const lastSize = useRef({ w: result.width, h: result.height });
  const t = useT();
  const minimap = useStore((s) => s.minimap);
  const annotations = useStore((s) => s.annotations);
  const labelOverrides = useStore((s) => s.labelOverrides);
  const setLabelOverride = useStore((s) => s.setLabelOverride);
  const setAnnotating = useStore((s) => s.setAnnotating);
  const onlyMatches = useStore((s) => s.onlyMatches);
  // Canvas-level actions (undo/redo + analysis panel toggle) — only shown on
  // the primary pane so split/compare views do not duplicate the controls.
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const rightPanelTab = useStore((s) => s.rightPanelTab);
  const openPanel = useStore((s) => s.openPanel);
  const closePanel = useStore((s) => s.closePanel);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<Tip | null>(null);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{
    originalLabel: string;
    x: number;
    y: number;
  } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    const zb = zoomRef.current;
    if (!el || !zb) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    // The projector reports the on-screen bounding box (swapped for left/right),
    // so fit against that rather than the raw layout size.
    const proj = makeProjector(options.orientation, result.width, result.height);
    const cw0 = proj.width;
    const ch0 = proj.height;
    // Guard against a zero/NaN projected size (e.g. a single-leaf species tree
    // with margin 0): Math.min(...) can yield Infinity or NaN, which is truthy
    // and would poison the transform with translate(NaN,NaN). Require a finite,
    // positive scale before applying it.
    const rawK = (cw0 > 0 && ch0 > 0 ? Math.min(cw / cw0, ch / ch0) : 1) * 0.92;
    const k = Number.isFinite(rawK) && rawK > 0 ? rawK : 1;
    const x = (cw - cw0 * k) / 2;
    const y = (ch - ch0 * k) / 2;
    d3select(el).call(zb.transform, zoomIdentity.translate(x, y).scale(k));
  }, [result.width, result.height, options.orientation]);

  // Attach the d3-zoom behavior once; it drives wheel-zoom and drag-pan and
  // reports the transform back into React state (which applies the CSS matrix).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const zb = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.03, 10])
      .on("zoom", (ev) => {
        const t = ev.transform;
        setView({ k: t.k, x: t.x, y: t.y });
      });
    zoomRef.current = zb;
    const sel = d3select(el);
    sel.call(zb);
    // Disable d3-zoom's default double-click-to-zoom so it never interferes
    // with label click-to-edit or other double-click interactions.
    sel.on("dblclick.zoom", null);
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  // Track the container size so the culling viewport can be derived from it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when a new reconciliation is loaded or the orientation changes (both
  // reshape the drawing) - never on other option tweaks, so adjusting level
  // height / gene spacing does not rescale the drawing.
  useEffect(() => {
    if (
      reconRef.current !== result.reconciliation ||
      orientRef.current !== options.orientation
    ) {
      reconRef.current = result.reconciliation;
      orientRef.current = options.orientation;
      fit();
    }
  }, [result, fit, options.orientation]);

  // Auto-adapt: when layout options make the drawing grow significantly (e.g.
  // increasing level height / species width), refit so the tree never silently
  // runs off the viewport.
  useEffect(() => {
    const prev = lastSize.current;
    const area = result.width * result.height;
    const prevArea = prev.w * prev.h;
    lastSize.current = { w: result.width, h: result.height };
    if (prevArea > 0 && area > prevArea * 1.35 && view.k > 0.5) {
      // The drawing grew a lot; refit if the user was zoomed in beyond the new
      // fit scale (i.e. content would overflow the viewport).
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.width, result.height]);

  // Clear the click-driven lineage highlight when the underlying reconciliation
  // changes (file / tab / nested / compare switch) so a stale node-id set never
  // dims an unrelated tree.
  useEffect(() => {
    setHighlight(null);
  }, [result.reconciliation]);

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    const zb = zoomRef.current;
    if (el && zb) d3select(el).call(zb.scaleBy, factor);
  };

  // Keyboard: F = fit to view, Cmd/Ctrl +/- = zoom in/out (ignored while typing
  // in a field). Uses the shared useGlobalShortcuts hook.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const zoomByRef = useRef(zoomBy);
  zoomByRef.current = zoomBy;
  useGlobalShortcuts((e) => {
    if (isTextInput(e)) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoomByRef.current(1.2);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "-") {
      e.preventDefault();
      zoomByRef.current(1 / 1.2);
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      fitRef.current();
    }
  });

  // Center the viewport on a specific gene node (used by search "locate").
  const centerOnGene = useCallback(
    (geneId: string) => {
      const el = containerRef.current;
      const zb = zoomRef.current;
      if (!el || !zb) return;
      const gp = result.positions.gene.get(geneId);
      if (!gp) return;
      const proj = makeProjector(options.orientation, result.width, result.height);
      const sx = proj.x(gp.x, gp.y);
      const sy = proj.y(gp.x, gp.y);
      const k = Math.max(view.k, 1);
      const x = el.clientWidth / 2 - sx * k;
      const y = el.clientHeight / 2 - sy * k;
      d3select(el).call(zb.transform, zoomIdentity.translate(x, y).scale(k));
    },
    [result, options.orientation, view.k],
  );

  // When the active document changes (tab switch loads a different
  // reconciliation), adopt the incoming locate nonce as already-seen so we do
  // NOT re-run that document's last search on mount — only genuinely new
  // locate requests (a nonce increment) should center the view.
  const lastResultRef = useRef(result);
  useEffect(() => {
    if (lastResultRef.current !== result) {
      lastResultRef.current = result;
      lastLocate.current = locate?.nonce ?? 0;
    }
  }, [result, locate?.nonce]);

  // Fire the center-on-node request whenever its nonce changes, but only when
  // the request targets this pane (or is pane-agnostic, i.e. the primary).
  useEffect(() => {
    if (!locate || locate.nonce === lastLocate.current) return;
    if (locate.pane && locate.pane !== paneId) return;
    lastLocate.current = locate.nonce;
    centerOnGene(locate.geneId);
  }, [locate, paneId, centerOnGene]);

  // Center the viewport on a content-space (projected) point (minimap drag).
  const navTo = useCallback(
    (cxProj: number, cyProj: number) => {
      const el = containerRef.current;
      const zb = zoomRef.current;
      if (!el || !zb) return;
      const k = view.k;
      const x = el.clientWidth / 2 - cxProj * k;
      const y = el.clientHeight / 2 - cyProj * k;
      d3select(el).call(zb.transform, zoomIdentity.translate(x, y).scale(k));
    },
    [view.k],
  );

  const onCanvasClick = (e: ReactMouseEvent) => {
    // d3-zoom suppresses the click that ends a drag, so a real click here is a
    // background click: clear the lineage highlight unless a gene was clicked.
    const t = e.target as Element;
    if (t.closest && t.closest(".gene-layer")) return;
    setHighlight(null);
  };

  const onGeneEnter = useCallback(
    (node: GeneNode, evt: ReactMouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const where =
        node.endEvent.speciesLocation ??
        node.endEvent.destinationSpecies ??
        node.speciesId;
      setTip({
        text: node.name || t.event[node.endEvent.type],
        sub: `${t.event[node.endEvent.type]}${where ? ` @ ${where}` : ""}`,
        x: evt.clientX,
        y: evt.clientY,
        canCollapse: node.children.length > 0,
      });
      // Cursor-as-hint: annotate mode shows a "mark" cursor; internal nodes
      // show pointer (already handled by the glyph) — keep it explicit here.
      if (annotateMode) el.style.cursor = "copy";
      else el.style.cursor = "";
    },
    [t, annotateMode],
  );

  const onGeneLeave = useCallback(() => {
    setTip(null);
    const el = containerRef.current;
    if (el) el.style.cursor = "";
  }, []);

  const onLabelClick = useCallback(
    (originalLabel: string, evt: ReactMouseEvent) => {
      setEditingLabel({
        originalLabel,
        x: evt.clientX,
        y: evt.clientY,
      });
    },
    [],
  );

  const onGeneClick = useCallback(
    (node: GeneNode, evt: ReactMouseEvent) => {
      // Annotate mode: a plain click annotates (no Shift needed).
      if (annotateMode) {
        setAnnotating({ id: node.id, name: node.name || node.endEvent.geneName || node.id });
        return;
      }
      // Shift-click opens the annotation editor for this node.
      if (evt.shiftKey) {
        setAnnotating({ id: node.id, name: node.name || node.endEvent.geneName || node.id });
        return;
      }
      // Alt/Option-click collapses or expands an internal clade.
      if ((evt.altKey || evt.metaKey) && node.children.length > 0 && onToggleCollapse) {
        onToggleCollapse(node.id);
        return;
      }
      setHighlight(lineageIds(node));
    },
    [annotateMode, onToggleCollapse, setAnnotating],
  );

  // Keyboard access to nodes (A11Y): Enter = highlight lineage, Shift+Enter =
  // annotate, Alt+Enter = collapse — same semantics as the mouse gestures.
  const onGeneKeyDown = useCallback(
    (node: GeneNode, evt: ReactKeyboardEvent) => {
      if (evt.key !== "Enter" && evt.key !== " ") return;
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.shiftKey || annotateMode) {
        setAnnotating({ id: node.id, name: node.name || node.endEvent.geneName || node.id });
      } else if (evt.altKey && node.children.length > 0 && onToggleCollapse) {
        onToggleCollapse(node.id);
      } else {
        setHighlight(lineageIds(node));
      }
    },
    [annotateMode, onToggleCollapse, setAnnotating],
  );

  const gridStep = 24 * view.k;
  const gridColor =
    theme.id === "dark" ? "rgba(255,255,255,0.06)" : "rgba(24,24,27,0.06)";
  const showGrid = gridStep >= 6;
  // Level of detail follows the zoom: heavily zoomed-out views drop
  // labels/glyphs for legibility and rendering speed.
  const detail = detailLevelForZoom(view.k);
  // A click-driven lineage highlight takes precedence over the search/filter
  // focus; clearing the click returns to whatever the filter dims.
  const effectiveHighlight = highlight ?? focus ?? null;
  // "Show only matches": hide every node outside the focus set entirely.
  const hideOutside = onlyMatches && focus !== null ? focus : null;

  // Virtualization: on very large trees, derive a projected-space viewport rect
  // (rounded + margined so it only changes in chunks) and let the Scene skip
  // gene elements outside it. Small trees pass null -> nothing is culled.
  const geneCount = useMemo(
    () => result.reconciliation.geneTrees.reduce((n, tr) => n + tr.nodes.length, 0),
    [result],
  );
  const ariaSummary = `${countLabel(result.reconciliation.species.nodes.length, t.species)} · ${countLabel(result.reconciliation.geneTrees.length, t.geneTreeUnit)} · ${countLabel(geneCount, t.geneNodes)}`;
  const cullRef = useRef<CullRect | null>(null);
  const viewport = useMemo<CullRect | null>(() => {
    if (geneCount <= CULL_THRESHOLD || size.w === 0) return null;
    const k = view.k;
    const mx = (size.w / k) * 0.5;
    const my = (size.h / k) * 0.5;
    const STEP = 64;
    const round = (v: number) => Math.round(v / STEP) * STEP;
    const r: CullRect = {
      x0: round(-view.x / k - mx),
      y0: round(-view.y / k - my),
      x1: round((size.w - view.x) / k + mx),
      y1: round((size.h - view.y) / k + my),
    };
    const p = cullRef.current;
    if (p && p.x0 === r.x0 && p.y0 === r.y0 && p.x1 === r.x1 && p.y1 === r.y1) return p;
    cullRef.current = r;
    return r;
  }, [geneCount, size.w, size.h, view.k, view.x, view.y]);

  return (
    <div
      ref={containerRef}
      className="canvas"
      onClick={onCanvasClick}
      style={{
        backgroundColor: theme.background,
        backgroundImage: showGrid
          ? `radial-gradient(circle, ${gridColor} 1px, transparent 1px)`
          : undefined,
        backgroundSize: showGrid ? `${gridStep}px ${gridStep}px` : undefined,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      {title && <div className="pane-label">{title}</div>}
      <Scene
        result={result}
        theme={theme}
        options={options}
        highlight={effectiveHighlight}
        hideOutside={hideOutside}
        interactive
        detail={detail}
        eventLabels={t.event}
        collapsedWord={t.collapsedClade}
        leavesWord={t.leavesUnit}
        expandHint={t.expandHint}
        mirrorWord={t.mirrorHint}
        viewportMode
        contentTransform={`translate(${view.x},${view.y}) scale(${view.k})`}
        onGeneEnter={onGeneEnter}
        onGeneLeave={onGeneLeave}
        onGeneClick={onGeneClick}
        onGeneKeyDown={onGeneKeyDown}
        onSpeciesClick={onSpeciesClick}
        labelOverrides={labelOverrides}
        onLabelClick={onLabelClick}
        geneColors={geneColors}
        annotations={annotations}
        showBackground={false}
        viewport={viewport}
        ariaLabel={ariaSummary}
      />

      {tip && createPortal(
        <div
          className="tooltip"
          style={{
            position: "fixed",
            left: Math.min(tip.x + 14, window.innerWidth - 280),
            top: Math.min(tip.y + 14, window.innerHeight - 120),
          }}
        >
          <strong>{tip.text}</strong>
          <span>{tip.sub}</span>
          <div className="tooltip-hint">
            <span><kbd>{t.hintClickHighlight}</kbd> {t.hintHighlightAction}</span>
            <span><kbd>{t.hintShiftAnnotate}</kbd> {t.annoTitle}</span>
            {tip.canCollapse && <span><kbd>{t.hintAltCollapse}</kbd> {t.collapsedClade}</span>}
          </div>
        </div>,
        document.body,
      )}

      {editingLabel && createPortal(
        <LabelEditor
          currentLabel={labelOverrides[editingLabel.originalLabel] ?? editingLabel.originalLabel}
          x={editingLabel.x}
          y={editingLabel.y}
          onCommit={(value) => {
            setLabelOverride(editingLabel.originalLabel, value);
            setEditingLabel(null);
          }}
          onCancel={() => setEditingLabel(null)}
        />,
        document.body,
      )}

      {/* Always-visible interaction legend (bottom-right corner): makes the
          hidden-gesture capabilities discoverable without hovering. */}
      <div className="canvas-hint">
        <span><kbd>{t.hintClickHighlight}</kbd> {t.hintHighlightAction}</span>
        <span><kbd>{t.hintAltCollapse}</kbd> {t.hintCollapseAction}</span>
        <span><kbd>{t.hintShiftAnnotate}</kbd> {t.annoTitle}</span>
        <span className="canvas-hint-mirror">{t.hintMirror}</span>
      </div>

      {minimap && (
        <MiniMap
          result={result}
          orientation={options.orientation}
          theme={theme}
          view={view}
          container={containerRef.current}
          onNav={navTo}
        />
      )}

      {/* Unified canvas control cluster (top-left): zoom out, zoom level,
          zoom in, fit-to-view, undo/redo, annotate, fullscreen, and — on the
          primary pane only — the analysis panel toggle. */}
      <div className="float-toolbar">
        <button data-tooltip={`${t.zoomOut} · ⌘-`} aria-label={t.zoomOut} onClick={() => zoomBy(1 / 1.2)}>
          −
        </button>
        <span className="zoom-level" aria-hidden="true">{Math.round(view.k * 100)}%</span>
        <button data-tooltip={`${t.zoomIn} · ⌘+`} aria-label={t.zoomIn} onClick={() => zoomBy(1.2)}>
          +
        </button>
        <div className="ft-divider" />
        <button data-tooltip={`${t.fit} · F`} aria-label={t.fit} onClick={fit}>
          ⤢
        </button>
        {paneId === "primary" && (
          <>
            <button
              data-tooltip={`${t.undo} · ⌘Z`}
              aria-label={t.undo}
              disabled={!canUndo}
              onClick={undo}
            >
              ↶
            </button>
            <button
              data-tooltip={`${t.redo} · ⌘⇧Z`}
              aria-label={t.redo}
              disabled={!canRedo}
              onClick={redo}
            >
              ↷
            </button>
          </>
        )}
        <div className="ft-divider" />
        <button
          className={annotateMode ? "active" : ""}
          data-tooltip={t.annoTitle}
          aria-label={t.annoTitle}
          aria-pressed={annotateMode}
          onClick={() => setAnnotateMode((v) => !v)}
        >
          ✎
        </button>
        {paneId === "primary" && (
          <button
            className={rightPanelOpen ? "active" : ""}
            data-tooltip={t.analyze}
            aria-label={t.analyze}
            aria-pressed={rightPanelOpen}
            disabled={!result}
            onClick={() => (rightPanelOpen ? closePanel() : openPanel(rightPanelTab))}
          >
            ◧
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Bottom-left overview thumbnail: draws the species skeleton at small scale and
 * a draggable viewport rectangle. Pointer handling is native (attached to the
 * SVG) so it does not trigger the canvas's d3-zoom pan/zoom behind it.
 */
function MiniMap({
  result,
  orientation,
  theme,
  view,
  container,
  onNav,
}: {
  result: LayoutResult;
  orientation: Orientation;
  theme: Theme;
  view: View;
  container: HTMLDivElement | null;
  onNav: (cxProj: number, cyProj: number) => void;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const proj = useMemo(
    () => makeProjector(orientation, result.width, result.height),
    [orientation, result.width, result.height],
  );
  const MW = 168;
  const MH = 120;
  const ms = Math.min(MW / proj.width, MH / proj.height) || 1;
  const mapW = Math.max(1, proj.width * ms);
  const mapH = Math.max(1, proj.height * ms);

  const onNavRef = useRef(onNav);
  onNavRef.current = onNav;
  const msRef = useRef(ms);
  msRef.current = ms;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let dragging = false;
    const toContent = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { cx: (e.clientX - r.left) / msRef.current, cy: (e.clientY - r.top) / msRef.current };
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const p = toContent(e);
      onNavRef.current(p.cx, p.cy);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      e.stopPropagation();
      const p = toContent(e);
      onNavRef.current(p.cx, p.cy);
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const stop = (e: Event) => e.stopPropagation();
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("wheel", stop, { passive: false });
    svg.addEventListener("click", stop);
    return () => {
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("wheel", stop);
      svg.removeEventListener("click", stop);
    };
  }, []);

  // The species outline is static during pan/zoom, so memoize it (only the
  // viewport indicator below tracks `view`). Branches that collapse to under a
  // pixel at minimap scale are dropped - invisible anyway, and on a huge species
  // tree this culls the bulk of the elements.
  const lines = useMemo(() => {
    const out: JSX.Element[] = [];
    for (const n of result.reconciliation.species.nodes) {
      if (!n.parent) continue;
      const p = result.positions.species.get(n.parent.id);
      const c = result.positions.species.get(n.id);
      if (!p || !c) continue;
      const x1 = proj.x(p.x, p.y) * ms;
      const y1 = proj.y(p.x, p.y) * ms;
      const x2 = proj.x(c.x, c.y) * ms;
      const y2 = proj.y(c.x, c.y) * ms;
      if (Math.abs(x2 - x1) < 0.6 && Math.abs(y2 - y1) < 0.6) continue;
      out.push(
        <line
          key={n.id}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={theme.speciesStroke}
          strokeWidth={1}
          strokeLinecap="round"
        />,
      );
    }
    return out;
  }, [result, theme, ms, proj]);

  const cw = container?.clientWidth ?? 0;
  const ch = container?.clientHeight ?? 0;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const vx = clamp((-view.x / view.k) * ms, 0, mapW);
  const vy = clamp((-view.y / view.k) * ms, 0, mapH);
  const vw = clamp((cw / view.k) * ms, 2, mapW - vx);
  const vh = clamp((ch / view.k) * ms, 2, mapH - vy);

  return (
    <div className="minimap">
      <svg
        ref={svgRef}
        width={mapW}
        height={mapH}
        tabIndex={0}
        role="group"
        aria-label={t.minimap}
        style={{ display: "block", cursor: "pointer", touchAction: "none" }}
      >
        <rect x={0} y={0} width={mapW} height={mapH} fill={theme.background} />
        {lines}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          fill={theme.id === "dark" ? "rgba(255,255,255,0.10)" : "rgba(24,24,27,0.08)"}
          stroke={theme.id === "dark" ? "#fafafa" : "#18181b"}
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

/**
 * Inline label editor: a small input overlay positioned at the clicked label's
 * screen position. Enter commits, Escape cancels, blur commits.
 */
function LabelEditor({
  currentLabel,
  x,
  y,
  onCommit,
  onCancel,
}: {
  currentLabel: string;
  x: number;
  y: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentLabel);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  return (
    <input
      className="label-edit-input"
      value={value}
      autoFocus
      onFocus={(e) => e.target.select()}
      style={{ position: "fixed", left: x, top: y }}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
    />
  );
}
