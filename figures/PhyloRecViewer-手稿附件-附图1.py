#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PhyloRecViewer-手稿附件-附图1.py

Supplementary Figure S1: (a) capability matrix, (b) measured scaling, (c) the
same measurements in log-log.

(a) is a symbol matrix whose rows, columns and tool set are those of
    Supplementary Table S2.  It replaces the earlier radar chart, which turned
    ordinal 0 / 0.5 / 1 verdicts into an area whose value depended on the
    arbitrary order of the axes, drew one out-of-scale value, implied
    intermediate values through its radial tick rings, and separated its five
    series by colour alone.  The matrix carries the table's own verdicts, needs
    no colour to be read, and can be checked cell by cell.  The row labels are
    transcribed EXACTLY as Supplementary Table S2 spells its column names --
    "Pan/Zoom" and "Undo/Redo", not "Pan / zoom" and "Undo / redo" -- so each
    row traces back to the table by its own label.  The table's ‡ provenance
    marks are deliberately NOT repeated on the cells -- a
    ‡ at the 7 pt floor cannot fit the row pitch without overprinting the
    cell above or below -- and that layer is carried by the figure legend.
(b) end-to-end medians of the application's own parser, layout engine and
    scene-SVG builder on deterministically generated recPhyloXML inputs,
    whiskered by the across-run minimum and maximum, plus the real 9999.nhx
    sample for scale.
(c) the same in log-log, where the scaling behaviour is readable for every
    point rather than only the largest two.  Dotted lines are least-squares
    straight-line fits through the origin, one per series and drawn in that
    series' own colour: in (c) their log-log slope is exactly 1 (the line the
    series would follow if the cost were exactly proportional to the node
    count), while in (b) their gradient is each series' own fitted coefficient
    in ms per node, which is NOT 1.  Both panels key them as one dotted entry
    in the series legend (ISSUE-076), and the fitted power-law exponents are
    printed on stdout and annotated on (c) for the figure legend to quote.  The
    three exponent labels are stacked in the panel's free upper-left triangle,
    measured against the ink they sit over: the build fails if one would
    overprint data again (ISSUE-077).

Geometry note (the reason this file was rewritten): panel (a)'s highlight band
marks the article's own column, and it used to run from `centre - 2R` to the
box's right edge while the glyph column itself ends at the box edge.  The band
was therefore one glyph radius off-centre and read as belonging to the gutter
between the last two columns.  The glyph grid now carries a 2R inner padding,
so the band is both exactly centred on its column and flush with the box.

Raw numbers come from the frozen aggregate committed with the source:
`npm run measure` repeated, then folded by
`python3 scripts/aggregate-measurements.py <run dirs>`.

Style and print size come from phylorec_style, the single shared token
module that also drives the main figures: authored at the article's 166 mm text
block, nothing below 7 pt, 1200 dpi PNG with the resolution recorded, and a
Type3-free vector PDF.
"""

import csv
import os
import sys

import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# `phylorec_style` lives in this same directory now that the figure pipeline is
# repository content under `figures/` — there is no sibling figure folder to add.
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
import phylorec_style as st                                   # noqa: E402

st.apply_style()
import matplotlib.pyplot as plt                               # noqa: E402
from matplotlib.lines import Line2D                           # noqa: E402
from matplotlib.patches import Circle, Rectangle, Wedge       # noqa: E402
from matplotlib.ticker import FuncFormatter, MaxNLocator      # noqa: E402

# ---------------------------------------------------------------------------
# Print geometry - inches of *printed* page, three panels in one row
# ---------------------------------------------------------------------------
MARGIN = 0.10
CAP_GUTTER = 1.10        # capability labels (7 pt, widest 1.02 in: the export
                         # row, named exactly as Table S2 names it) + gap
A_X = MARGIN + CAP_GUTTER
PANEL_W = 1.45
GAP = 0.52               # rotated y-label + the widest tick label of (b)/(c)
B_X = A_X + PANEL_W + GAP
C_X = B_X + PANEL_W + GAP
FIG_W = C_X + PANEL_W + MARGIN          # derived, then rescaled to st.PRINT_IN below

PANEL_H = 1.80
BOX_BOT = 0.98           # footer: (a) tool names, (b)/(c) ticks + axis titles
BOX_TOP = BOX_BOT + PANEL_H
KEY_Y = BOX_TOP + 0.20   # glyph key and series key share this line
HEADING_Y = BOX_TOP + 0.46
FIG_H = BOX_TOP + 0.70

R_IN = 0.042             # glyph radius
PAD_Y = 0.05

# The block above is laid out for a 170 mm row; the article's text block is
# st.PRINT_MM. Scale every horizontal and vertical constant by one factor so the
# figure is authored at the size it is actually placed at - no "as printed"
# conversion is left for a reader to redo, and the 7 pt floor holds as placed.
_K = st.PRINT_IN / FIG_W
MARGIN *= _K
CAP_GUTTER *= _K
PANEL_W *= _K
GAP *= _K
PANEL_H *= _K
BOX_BOT *= _K
FIG_H *= _K
R_IN *= _K
PAD_Y *= _K
A_X = MARGIN + CAP_GUTTER
B_X = A_X + PANEL_W + GAP
C_X = B_X + PANEL_W + GAP
FIG_W = C_X + PANEL_W + MARGIN          # == st.PRINT_IN
BOX_TOP = BOX_BOT + PANEL_H
KEY_Y = BOX_TOP + 0.20 * _K
HEADING_Y = BOX_TOP + 0.46 * _K
PAD_X = 2 * R_IN

# ---------------------------------------------------------------------------
# Measured data
# ---------------------------------------------------------------------------
REQUIRED = ("nodes",
            "parse_med_ms", "parse_min_ms", "parse_max_ms",
            "layout_med_ms", "layout_min_ms", "layout_max_ms",
            "svg_med_ms", "svg_min_ms", "svg_max_ms", "n_runs")
COLS = {k: [] for k in REQUIRED}
# The frozen aggregate CSVs are repository content: `figures/../data/`, the same
# directory the article and `MANIFEST.json` cite.  One level up from `figures/`
# is the repository root, so nothing here reaches outside the repository.
_DATA = os.environ.get("PR_DATA_DIR") or os.path.join(SCRIPT_DIR, os.pardir, "data")
CSV_PATH = os.path.join(_DATA, "benchmarks-sweep-median.csv")
DS_PATH = os.path.join(_DATA, "benchmarks-datasets-median.csv")
for p in (CSV_PATH, DS_PATH):
    if not os.path.exists(p):
        raise SystemExit(f"{p} not found: from the repository root run "
                         "`python3 scripts/aggregate-measurements.py "
                         "<run dirs...>` first")
with open(CSV_PATH) as fh:
    reader = csv.DictReader(fh)
    missing = set(REQUIRED) - set(reader.fieldnames or [])
    if missing:
        raise SystemExit(f"{CSV_PATH}: missing columns {sorted(missing)}")
    for row in reader:
        for key in REQUIRED:
            COLS[key].append(float(row[key]))
N_RUNS = int(COLS["n_runs"][0])
for key in REQUIRED:
    if len(COLS[key]) != 9:
        raise SystemExit(f"{CSV_PATH}: expected 9 measurement rows, got "
                         f"{len(COLS[key])} in '{key}'")
nodes = np.array(COLS["nodes"])
if np.any(np.diff(nodes) <= 0):
    raise SystemExit(f"{CSV_PATH}: 'nodes' must increase monotonically")

SERIES = [("Parse", np.array(COLS["parse_med_ms"]),
           np.array(COLS["parse_min_ms"]), np.array(COLS["parse_max_ms"]),
           st.C_GENE, "o", "-"),
          ("Layout", np.array(COLS["layout_med_ms"]),
           np.array(COLS["layout_min_ms"]), np.array(COLS["layout_max_ms"]),
           st.C_DUP, "s", "--"),
          ("Scene SVG build", np.array(COLS["svg_med_ms"]),
           np.array(COLS["svg_min_ms"]), np.array(COLS["svg_max_ms"]),
           st.C_GREEN, "D", "-.")]
X_MAX = float(nodes.max())

REAL_NODES, REAL_MS = None, None
with open(DS_PATH) as fh:
    for row in csv.DictReader(fh):
        if row["dataset"] == "9999.nhx":
            REAL_NODES = int(row["nodes"])
            REAL_MS = float(row["total_med_ms"])
if REAL_MS is None:
    raise SystemExit(f"{DS_PATH}: no 9999.nhx row")

# ---------------------------------------------------------------------------
# Panel (a): capability matrix, rows/columns as in Supplementary Table S2
# ---------------------------------------------------------------------------
# 1 = supported, 0.5 = partial, 0 = absent (and a cell Table S2 does not grant
# at all -- "n.d." or "not assessed" -- is drawn absent, since the matrix can
# encode only three states).
#
# A cell is read as partial when Supplementary Table S2 QUALIFIES rather than
# grants it.  The qualifier words the matrix actually reads are "limited",
# "via converter", "multiple maps", "via static overlay", "tanglegram", and an
# export or embedding claim restricted to one form -- "+ SVG (static)",
# "+ (static)", "+ (2-level)".  Words that never occur in the table are not
# listed here: the earlier "via annotation" was not one of Table S2's cell
# values and has been dropped.
#
# Every verdict below IS the verdict of the named cell of Supplementary Table
# S2, and every row label IS that table's own column name, so a reader can
# trace a row back to the table by its label (ISSUE-073, ISSUE-074).  The two
# directions of the check both matter: a cell that understates a tool is as
# wrong as one that overstates it.  Five cells disagreed with the table before
# this revision -- NOTUNG/NHX (+ -> filled) and NOTUNG/Export
# ("- (PNG raster only)" -> open), iTOL/recPhyloXML ("- (reads PhyloXML, not
# recPhyloXML)" -> open), ETE 3/Pan-zoom ("+ (Qt TreeBrowser)" -> filled) and
# ETE 3/NHX ("+ (read/write)" -> filled).
#
# The ‡ marks of Table S2 are deliberately NOT repeated here (ISSUE-073).
# Table S2 puts ‡ on every SylvX cell and on NOTUNG's "Search / filter",
# "Transfer network", "Undo/Redo" and "Export" -- 18 of the 112 cells of this
# matrix (SylvX 14 of 14, NOTUNG 4) -- to mean "read from the tool's own published description, not
# independently re-tested".  A ‡ cannot be drawn on
# a cell: at the 7 pt floor the glyph is taller than the row pitch, so the mark
# would overprint the disc
# above or below it, and on a whole column it would stop reading as an
# exception.  The provenance layer is therefore carried by the figure legend,
# which states that the matrix encodes only the three verdict levels and where
# the ‡ marks stand.
CAPABILITIES = [
    "Pan/Zoom", "recPhyloXML (native)", "NHX (native)", "Multi-level nesting",
    "Tube-map embedding",
    "Side-by-side compare", "Event-level diff", "Search / filter",
    "Transfer network", "Structural checks", "Undo/Redo",
    "Export (SVG/PDF/PNG)", "Offline", "CJK text",
]
# Tube-map embedding (index 4) is transcribed from main-text Table 1, the
# source Supplementary Table S2 extends.  ALE and ecceTERA are not rows of that
# table, so Table S2 records "not assessed" for them and the matrix draws those
# two cells absent, exactly as it draws an "n.d." cell absent.
TOOLS = [
    ("recPhyloXML viz.", [0, 1, 0.5, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0.5, 0, 0]),
    ("NOTUNG", [0.5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]),
    ("iTOL", [1, 0, 1, 0, 0, 0.5, 0, 0, 0, 0, 0, 1, 0, 0]),
    ("ETE 3", [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0]),
    ("SylvX", [0.5, 0, 0, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 1, 0]),
    ("ALE", [0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]),
    ("ecceTERA", [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]),
    # spelled out rather than written [1] * 14: the cell-by-cell check the
    # review gate runs on this figure reads these rows as literal lists, so a
    # multiplied one would leave the article's own column unchecked.  Every
    # cell is 1 because Table S2 marks PhyloRecViewer "+" (or "yes") in all 14
    # capability columns, "+ (3-level)", "+ (interactive)" and
    # "+ (all three)" among them.
    ("PhyloRecViewer", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
]
# The matrix is only defensible while a row label and a verdict line up, so the
# pairing is asserted here rather than left to the loop below: one score per
# capability row, per tool.
_bad = [name for name, scores in TOOLS if len(scores) != len(CAPABILITIES)]
if _bad:
    raise SystemExit(
        "panel (a): %s carries %d verdicts but Table S2 / CAPABILITIES defines "
        "%d capability rows -- every score list must be one per row"
        % (", ".join(_bad), len(dict(TOOLS)[_bad[0]]), len(CAPABILITIES)))
EXPORT_ROW = "Export (SVG/PDF/PNG)"
if EXPORT_ROW not in CAPABILITIES:
    raise SystemExit("panel (a): the export row label must be Table S2's own")
N_ROW, N_COL = len(CAPABILITIES), len(TOOLS)
EXPORT_ROW = "Export (SVG/PDF/PNG)"      # the widest row label, addressed by name
GLYPH = "#3F3F46"
HIGHLIGHT = "PhyloRecViewer"

fig = plt.figure(figsize=(FIG_W, FIG_H))

# Panel (a) is drawn in inches on one full-figure overlay: a glyph radius is a
# physical size and nothing depends on how a data box maps onto the axes.
ov = fig.add_axes([0, 0, 1, 1], zorder=40)
ov.set_xlim(0, FIG_W)
ov.set_ylim(0, FIG_H)
ov.set_aspect("equal")
ov.set_axis_off()

A_LEFT = A_X
# The row labels are right-aligned against the glyph grid.  The export row now
# carries Table S2's own column name, Export (SVG/PDF/PNG), which is 1.0200 in
# of 7 pt type -- the widest label on the page.  Against the old 0.07 in
# label-to-grid gap it would have stopped 0.17 pt from the page trim, so the
# gap is set to 0.03 in: the label then stands 8.81 pt from the trim (the style
# module declares 6 pt) and 2.16 pt from the first disc column.  The label is
# not abbreviated to buy that room (ISSUE-074), and no geometry constant moves,
# so the page stays exactly as authored (DECISIONS section 10.2).
LABEL_R = A_LEFT - 0.03
COL_PITCH = (PANEL_W - 2 * PAD_X) / (N_COL - 1)
ROW_PITCH = (PANEL_H - 2 * PAD_Y) / (N_ROW - 1)
col_x = [A_LEFT + PAD_X + j * COL_PITCH for j in range(N_COL)]
row_y = [BOX_TOP - PAD_Y - i * ROW_PITCH for i in range(N_ROW)]

# the article's own column: the band is the column's own cell, centred on the
# glyphs and ending flush with the box's right edge
hl = N_COL - 1
# `lerp_hex` parses '#RRGGBB' only (phylorec_style._rgb_hex), so the ground of
# this band is the white token, not matplotlib's named colour 'white'.
ov.add_patch(Rectangle((col_x[hl] - PAD_X, BOX_BOT), 2 * PAD_X, PANEL_H,
                       facecolor=st.lerp_hex("#FFFFFF", st.C_GREEN, 0.10),
                       edgecolor=st.C_GREEN, lw=st.LW_TUBE, zorder=1))

_cap_labels = []
for i, cap in enumerate(CAPABILITIES):
    _cap_labels.append(
        ov.text(LABEL_R, row_y[i], cap, fontsize=st.MIN_TEXT, ha="right",
                va="center", color=st.INK))
    if i < N_ROW - 1:
        ov.plot([A_LEFT, A_LEFT + PANEL_W],
                [row_y[i] - ROW_PITCH / 2] * 2, color=st.HAIR,
                lw=st.LW_GUIDE, zorder=2)

# Nothing may be clipped, and only measuring the artists as drawn proves it:
# the delivered figure once put "Layou" on the page for "Layout" (the fragment
# gate R24 watches for).  A row label that no longer clears the trim the style
# module declares fails the build rather than running off the page, so widening
# a label -- or the type -- is caught at once.
fig.canvas.draw()
_rend = fig.canvas.get_renderer()
_offenders, ROW_LABEL_CLEAR, ROW_LABEL_WIDEST = [], 9.9, ""
for cap, art in zip(CAPABILITIES, _cap_labels):
    _bb = art.get_window_extent(renderer=_rend)
    _clear = _bb.x0 / fig.dpi
    if _clear < ROW_LABEL_CLEAR:
        ROW_LABEL_CLEAR, ROW_LABEL_WIDEST = _clear, cap
    if _clear < st.PAGE_MARGIN_IN:
        _offenders.append("%r leaves only %.3f in (%.2f pt) of the left trim"
                          % (cap, _clear, _clear * 72.0))
if _offenders:
    raise SystemExit(
        "(a) row label crosses the page trim, which declares %.4f in (%.1f pt) "
        "via st.PAGE_MARGIN_IN: %s.  Widen CAP_GUTTER or re-flow the label "
        "against Table S2's own column name -- do not abbreviate a carrier name "
        "and do not drop the type below %.2f pt"
        % (st.PAGE_MARGIN_IN, st.PAGE_MARGIN_IN * 72.0, "; ".join(_offenders),
           st.MIN_TEXT))

for j, (tool, _s) in enumerate(TOOLS):
    ov.text(col_x[j], BOX_BOT - 0.06, tool, fontsize=st.MIN_TEXT, ha="center",
            va="top", rotation=90,
            fontweight="bold" if tool == HIGHLIGHT else "normal",
            color=st.INK if tool == HIGHLIGHT else st.INK2)


def glyph_at(x, y, score, ax=None):
    """One circle, three fill levels: full, half, open.

    A single shape family keeps the three verdicts at the same optical weight;
    mixing a square with a circle made "supported" read heavier than its
    neighbours out of proportion to what it claims.
    """
    a = ax or ov
    a.add_patch(Circle((x, y), R_IN, facecolor="white",
                       edgecolor=GLYPH if score == 0.5 else st.GUIDE,
                       lw=st.LW_TUBE + 0.15, zorder=4))
    if score == 1:
        a.add_patch(Circle((x, y), R_IN, facecolor=GLYPH, edgecolor=GLYPH,
                           lw=st.LW_TUBE + 0.15, zorder=5))
    elif score == 0.5:
        a.add_patch(Wedge((x, y), R_IN, 90, 270, facecolor=GLYPH,
                          edgecolor=GLYPH, lw=st.LW_TUBE + 0.15, zorder=5))


for j, (_tool, scores) in enumerate(TOOLS):
    for i, s in enumerate(scores):
        glyph_at(col_x[j], row_y[i], s)

# Glyph key, on the shared key line, centred above panel (a)'s matrix box.
# The three labels are measured from the rendered glyphs rather than from a
# hand-tuned width table, so the block stays truly centred if the face, the
# size or the wording changes.
KEY_ITEMS = [(1, "supported"), (0.5, "partial"), (0, "absent")]
KEY_GAP = 0.13
KEY_TEXT_PAD = 0.05
key_artists = [(score, text,
                ov.text(0, KEY_Y, text, fontsize=st.MIN_TEXT, ha="left",
                        va="center", color=st.INK2))
               for score, text in KEY_ITEMS]
fig.canvas.draw()
_rend = fig.canvas.get_renderer()
key_w = [t.get_window_extent(renderer=_rend).width / fig.dpi
         for _s, _n, t in key_artists]
_unit = 2 * R_IN + KEY_TEXT_PAD
_key_total = sum(_unit + w for w in key_w) + KEY_GAP * (len(key_w) - 1)
kx = A_LEFT + PANEL_W / 2.0 - _key_total / 2.0
# recorded for the alt-text skeleton: where the key block actually landed
KEY_ROW = dict(items=[text for _s, text, _a in key_artists],
               x0=kx, x1=kx + _key_total, y=KEY_Y,
               centre=A_LEFT + PANEL_W / 2.0)
for (score, _text, t), w in zip(key_artists, key_w):
    glyph_at(kx + R_IN, KEY_Y, score)
    t.set_position((kx + _unit, KEY_Y))
    kx += _unit + w + KEY_GAP

# ---------------------------------------------------------------------------
# Panels (b) and (c): measured scaling, in the same box as panel (a)
# ---------------------------------------------------------------------------
def panel_axes(x_in):
    return fig.add_axes([x_in / FIG_W, BOX_BOT / FIG_H,
                         PANEL_W / FIG_W, PANEL_H / FIG_H])


ax_b, ax_c = panel_axes(B_X), panel_axes(C_X)
slopes = [float(np.linalg.lstsq(nodes.reshape(-1, 1), med, rcond=None)[0][0])
          for _n, med, _a, _b, *_r in SERIES]
handles = []
for (name, med, q1, q3, col, marker, ls), slope in zip(SERIES, slopes):
    lo, hi = med - q1, np.maximum(q3 - med, 0)
    for ax in (ax_b, ax_c):
        ax.errorbar(nodes, med, yerr=[lo, hi], fmt=marker, color=col, ls=ls,
                    mfc=col, mec=col, ms=3.6, elinewidth=st.LW_GUIDE,
                    capsize=1.2, zorder=4)
    ax_b.plot([0, X_MAX], [0, slope * X_MAX], ls=":", color=col,
              lw=st.LW_GENE, alpha=0.7, zorder=2)
    ax_c.plot([nodes.min(), X_MAX], [slope * nodes.min(), slope * X_MAX],
              ls=":", color=col, lw=st.LW_GENE, alpha=0.7, zorder=2)
    # `slope` is a through-origin least-squares coefficient in ms per node
    # (printed below, and recorded in the alt-text skeleton), so in (b) these
    # dotted lines are straight lines of that gradient -- NOT of unit gradient
    # -- while in the log-log panel (c) the same lines have slope exactly 1.
    # Keyed once, for both panels, by the dotted handle added to the series
    # legend below (ISSUE-076).
    handles.append(Line2D([], [], color=col, ls=ls, marker=marker, ms=3.6,
                          label=name))

# The 9999.nhx marker is described in the legend and the alt text as a WHITE
# star, so it has to read as one on paper.  At the previous ms 7.5 pt with a
# st.LW_TUBE (1.7 pt) keyline, the keyline swallowed the whole glyph at print
# size and it came out a solid dark star.  It is now drawn larger with a
# hair-weight keyline on the white canvas token, which leaves the arms white
# while keeping the mark legible where it sits on the axis.  STAR_MS, STAR_MEW
# and STAR_FILL are the single source of truth: the data-ink model below and
# the legend handle both read them.
STAR_MS = 11.0
STAR_MEW = 0.5
STAR_FILL = "#FFFFFF"
STAR_EDGE = st.INK

for _ax in (ax_b, ax_c):                       # the real sample, in both panels
    _ax.plot([REAL_NODES], [REAL_MS], marker="*", ls="None", ms=STAR_MS,
             mfc=STAR_FILL, mec=STAR_EDGE, mew=STAR_MEW, zorder=6,
             clip_on=False)
handles.append(Line2D([], [], color="none", marker="*", ms=STAR_MS,
                      mfc=STAR_FILL, mec=STAR_EDGE, mew=STAR_MEW,
                      label=f"9999.nhx ({REAL_NODES} nodes)"))
# ISSUE-076: both scaling panels drew a dotted straight line per series and
# keyed neither, so nothing on the figure told a reader what it was -- and the
# alt text called all of them "unit-slope" references, which is true only of
# panel (c).  One entry covers both panels, because the wording is true of
# both: the line is a straight-line (linear) fit, and the unit slope is scoped
# to the log-log panel, where a slope of 1 is exactly proportional scaling.
# In (b) the same lines carry each series' own ms-per-node gradient, which the
# figure legend states; the key cannot say it without breaking the 166 mm
# width, so it says the one thing that has to be true on the page.
# The handle is dotted at the weight and transparency the lines are drawn at,
# in the secondary ink rather than a fourth series colour.
handles.append(Line2D([], [], color=st.INK2, ls=":", lw=st.LW_GENE, alpha=0.7,
                      label="Dotted: linear fit, slope 1 in (c)"))

ax_b.set_xlim(0, 24500)
ax_b.set_xticks([0, 12000, 24000])
_peak = max(max(float((med + np.maximum(q3 - med, 0)).max()), s * X_MAX)
            for (med, q3, s) in zip([s[1] for s in SERIES],
                                    [s[3] for s in SERIES], slopes))
ax_b.set_ylim(0, 1.10 * _peak)
ax_b.yaxis.set_major_locator(MaxNLocator(4))
ax_b.grid(True, alpha=0.5, linewidth=st.LW_GUIDE)
ax_b.xaxis.set_major_formatter(FuncFormatter(lambda v, p: f"{int(v):,}"))
ax_b.set_xlabel("Gene nodes", fontsize=st.LABEL_TEXT, color=st.INK)
ax_b.set_ylabel(f"Median of {N_RUNS} runs (ms)", fontsize=st.LABEL_TEXT,
                color=st.INK)

ax_c.set_xscale("log")
ax_c.set_yscale("log")
ax_c.set_xlim(20, 30000)     # starts below the 23-node sample
ax_c.set_ylim(0.1, 1200)
ax_c.set_xticks([100, 1000, 10000])
ax_c.set_yticks([0.1, 1, 10, 100, 1000])
ax_c.grid(True, which="major", alpha=0.5, linewidth=st.LW_GUIDE)
ax_c.xaxis.set_major_formatter(FuncFormatter(lambda v, p: f"{int(v):,}"))
ax_c.yaxis.set_major_formatter(FuncFormatter(lambda v, p: f"{v:g}"))
ax_c.set_xlabel("Gene nodes (log scale)", fontsize=st.LABEL_TEXT, color=st.INK)
ax_c.set_ylabel("Time, ms (log scale)", fontsize=st.LABEL_TEXT, color=st.INK)

for ax in (ax_b, ax_c):
    ax.tick_params(labelsize=st.TICK_TEXT, which="major", length=3.0,
                   color=st.INK2, width=st.LW_GUIDE)
    ax.tick_params(which="minor", length=1.8, color=st.GUIDE,
                   width=st.LW_GUIDE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(st.GUIDE)
        ax.spines[side].set_linewidth(st.LW_GUIDE + 0.2)

# one series key for both scaling panels, on the shared key line.  Five
# entries no longer fit on one line inside the 166 mm page (the widest row
# would run past the trim), so the block re-flows to two rows of three rather
# than any type dropping below st.MIN_TEXT: matplotlib fills a multi-column
# legend down the columns, so the order of `handles` pairs the two short
# series names in one column, the long series name and the star in the next,
# and leaves the dotted reference alone in the third -- which makes the two-row
# block no wider than the one-row block it replaces.  `labelspacing` and
# `borderpad` are trimmed so the second row clears the top tick labels of (b)
# and (c); the guard after the draw below fails the build if it ever stops
# clearing the page trim.
KEY_NCOL = 3
KEY_NROW = -(-len(handles) // KEY_NCOL)          # ceil: rows the block draws
series_key = fig.legend(handles=handles, ncol=KEY_NCOL, fontsize=st.MIN_TEXT,
                        loc="center",
                        bbox_to_anchor=(((B_X + C_X + PANEL_W) / 2) / FIG_W,
                                        KEY_Y / FIG_H),
                        handlelength=1.5, handletextpad=0.4,
                        columnspacing=1.1, borderaxespad=0,
                        labelspacing=0.35, borderpad=0.2)

# ---------------------------------------------------------------------------
# Panel letters and titles
# ---------------------------------------------------------------------------
HEADINGS = []           # draw-order record for the alt-text skeleton


def heading(x_in, letter, title):
    HEADINGS.append((letter, title, x_in, HEADING_Y))
    ov.text(x_in, HEADING_Y, f"({letter})", fontsize=st.PANEL_LETTER,
            fontweight="bold", ha="left", va="baseline", color=st.INK)
    ov.text(x_in + 0.22, HEADING_Y, title, fontsize=st.PANEL_TITLE,
            fontweight="bold", ha="left", va="baseline", color=st.INK)


heading(A_X, "a", "Capability coverage")
heading(B_X, "b", "Measured scaling")
heading(C_X, "c", "Log-log")


# ---------------------------------------------------------------------------
# Report the fitted scaling so the legend can quote this run's numbers
# ---------------------------------------------------------------------------
def _loglog(x, y):
    lx, ly = np.log(x), np.log(y)
    coef = np.polyfit(lx, ly, 1)
    pred = np.polyval(coef, lx)
    r2 = 1 - float(((ly - pred) ** 2).sum() / ((ly - ly.mean()) ** 2).sum())
    return float(coef[0]), r2


print(f"data: {CSV_PATH}")
print(f"runs folded: {N_RUNS}")
ANNOT = []                             # (panel-(c) text, exponent, R²) per series
for i, (name, med, _a, _b, *_r) in enumerate(SERIES):
    e, r2 = _loglog(nodes, med)
    print(f"  {name:16s} exponent {e:.3f}  R² {r2:.4f}  "
          f"median@{int(nodes[-1]):,} = {med[-1]:.1f} ms")
    ANNOT.append((name, med, e, r2))
# The dotted reference is a THROUGH-ORIGIN linear fit, so its gradient is a
# coefficient in ms per node, not a unit slope: printed here (and in the
# alt-text skeleton) because the figure legend has to be able to say what the
# dotted lines in (b) actually are (ISSUE-076).
REF_FITS = [(name, s) for (name, *_r), s in zip(SERIES, slopes)]
print("  dotted reference, through-origin linear fit (ms per node): "
      + "; ".join(f"{name} = {s:.5f}" for name, s in REF_FITS))


# ---------------------------------------------------------------------------
# The exponents go on panel (c) as well as on stdout: a reader must be able to
# check the number the legend quotes against the curve it came from.  Four
# constraints the delivered figure used to break, all enforced below.
#   (i) the FULL series name is spelled out -- name.split()[0][:5] printed
#       "Layou" for "Layout" on the page, disagreeing with the series key;
#   (ii) no path effect -- st.stroke() turns glyphs into filled outlines, which
#       drops a label out of the selectable-text audit and therefore out of the
#       7 pt type floor check (phylorec_style.stroke() says the same);
#   (iii) nothing may leave the panel, let alone near the trim: a label wider
#       than the box is wrapped onto a second line, and one that still does not
#       fit fails the build instead of overprinting the page edge.
# ---------------------------------------------------------------------------
fig.canvas.draw()
_REND = fig.canvas.get_renderer()
_AX_W_IN = ax_c.get_window_extent(renderer=_REND).width / fig.dpi
_ANNOT_X0 = 0.025                      # axes fraction the block starts at
_ANNOT_SLACK = 0.006                   # inches kept clear of the right spine
_ANNOT_AVAIL = _AX_W_IN * (1.0 - _ANNOT_X0) - _ANNOT_SLACK
# The stack starts 2.5 pt inside the left spine rather than 4.1 pt: the widest
# block is 0.69 of the panel wide, and every fraction of a pt it saves on the
# right is a fraction the whisker of the 4,741-node sample cannot spend.  The
# wrap threshold above is still not met by the longest name, so the block
# shapes -- and the printed strings -- are unchanged by the shift.

# The series key is measured where it actually landed, in inches from the
# figure origin, and must keep the inner margin the style module declares from
# every page edge (the check is on the key's frame, so it is stricter than the
# trim test on the text itself, which is what check_figures.py runs).  A key
# that no longer fits is re-flowed or re-worded, never shrunk: the floor is
# st.MIN_TEXT for every selectable glyph on this page.
_BB = series_key.get_window_extent(renderer=_REND)
KEY_BOX = (_BB.x0 / fig.dpi, _BB.y0 / fig.dpi, _BB.x1 / fig.dpi, _BB.y1 / fig.dpi)
KEY_CLEAR = min(KEY_BOX[0], FIG_W - KEY_BOX[2], KEY_BOX[1], FIG_H - KEY_BOX[3])
if KEY_CLEAR < st.PAGE_MARGIN_IN:
    raise SystemExit(
        f"(b)/(c) series key comes within {KEY_CLEAR:.3f} in of the page trim; "
        f"the style module declares {st.PAGE_MARGIN_IN} in. Shorten a key label "
        f"or change KEY_NCOL -- do not drop the type below {st.MIN_TEXT} pt")


def _text_in(lines):
    """device width in inches of `lines` set at MIN_TEXT, as actually drawn."""
    probe = ov.text(0, 0, "\n".join(lines), fontsize=st.MIN_TEXT)
    w = probe.get_window_extent(renderer=fig.canvas.get_renderer()).width / fig.dpi
    probe.remove()
    return w


def _annot_text(name, e, r2):
    # U+00B2 SUPERSCRIPT TWO rather than "$R^2$".  Matplotlib sets mathtext in
    # its own mathtext.fontset (DejaVu by default), which would put a second,
    # non-HelveticaNeue font program on this page and break the subset naming
    # the supplement records for this figure; mathtext is also drawn as
    # separate glyph runs rather than as one selectable run of the label's own
    # type, which takes it out of the selectable-text audit the 7 pt floor is
    # run on.  The single character is carried by the same Helvetica Neue run
    # as the rest of the label, so "R2" becomes "R-squared" on the page
    # without moving the font, the subset, or the floor.
    one = f"{name} {e:.2f} (R² {r2:.3f})"
    if _text_in([one]) <= _ANNOT_AVAIL:
        return one
    two = [name, f"{e:.2f} (R² {r2:.3f})"]
    if _text_in(two) > _ANNOT_AVAIL:
        raise SystemExit(
            f"panel (c) annotation for {name!r} needs {_text_in(two):.3f} in "
            f"of a {_ANNOT_AVAIL:.3f} in box: shorten the series name rather "
            f"than clip it at the page edge")
    return "\n".join(two)


_ANN = [_annot_text(name, e, r2) for name, _med, e, r2 in ANNOT]

# (iv) a block may not sit ON the data.  The three used to be stacked on one
#      fixed pitch from one fixed top, which drove the wrapped "Scene SVG build"
#      block straight into the rising scene-SVG series: markers and whiskers
#      printed through the exponent, which is ISSUE-077.  Tightening the pitch
#      alone is not enough either, because the widest block reaches 0.69 of the
#      panel's width and the curves climb through it.  So each block is measured
#      as drawn and placed against the ink that would actually stand under it,
#      from the bottom up, and the build fails if the free triangle above the
#      curves can no longer hold the stack.
_AX_H_IN = ax_c.get_window_extent(renderer=_REND).height / fig.dpi
_AX_W_PT, _AX_H_PT = _AX_W_IN * 72.0, _AX_H_IN * 72.0
_ANNOT_GAP = 0.02        # axes fraction of white between blocks (~2.5 pt)
_ANNOT_TOP = 0.965       # nothing may climb into the y = 1000 gridline at 0.98


def _af_box(artist):
    """an artist's box in panel (c) axes-fraction units: (x0, y0, x1, y1)."""
    bb = artist.get_window_extent(renderer=fig.canvas.get_renderer())
    lo, hi = ax_c.transAxes.inverted().transform(
        [(bb.x0, bb.y0), (bb.x1, bb.y1)])
    return float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1])


def _data_ink():
    """every mark of panel (c) as (x, y, half_x, half_y), in axes fractions.

    The half-extents are the ink each mark really paints: an upper whisker end
    is an elinewidth-thick line with a cap, a median point carries a 3.6 pt
    marker on a 1.5 pt series line, the dotted reference is LW_GENE wide, the
    star is STAR_MS pt.  Nothing needs to be sampled along the segments: every
    series rises monotonically, so the right-hand vertex is the highest ink in
    any window that ends there.
    """
    out = []

    def add(xs, ys, hx_pt, hy_pt):
        a = ax_c.transAxes.inverted().transform(ax_c.transData.transform(
            np.column_stack([np.atleast_1d(xs).astype(float),
                             np.atleast_1d(ys).astype(float)])))
        for x, y in a:
            out.append((float(x), float(y), hx_pt / _AX_W_PT, hy_pt / _AX_H_PT))

    for (_n, med, _q1, q3, *_r), slope in zip(SERIES, slopes):
        add(nodes, q3, 2.0, 0.6)                       # whisker top + its cap
        add(nodes, med, 3.0, 3.0)                      # marker on the median
        add([nodes.min(), X_MAX],
            [slope * nodes.min(), slope * X_MAX], 2.0, 1.2)   # dotted reference
    add([REAL_NODES], [REAL_MS], STAR_MS / 2.0, STAR_MS / 2.0)  # 9999.nhx star
    return out


_DATA_INK = _data_ink()


def _ink_top(x0, x1):
    """highest data ink over axes-fraction x in [x0, x1], its top edge included."""
    top = 0.0
    for x, y, hx, hy in _DATA_INK:
        if x - hx <= x1 and x + hx >= x0:
            top = max(top, y + hy)
    return top


_geom = []
for _txt in _ANN:
    _probe = ax_c.annotate(_txt, xy=(_ANNOT_X0, 0.5), xycoords="axes fraction",
                           fontsize=st.MIN_TEXT, color=st.INK2, va="top",
                           ha="left")
    fig.canvas.draw()
    _x0, _y0, _x1, _y1 = _af_box(_probe)
    _probe.remove()
    _geom.append((_x1, _y1 - _y0))
_stack = [None] * len(_geom)
_below = None
for _i in range(len(_geom) - 1, -1, -1):
    _x1, _h = _geom[_i]
    _bottom = _ink_top(_ANNOT_X0, _x1) + _ANNOT_GAP
    if _below is not None:
        _bottom = max(_bottom, _below + _ANNOT_GAP)
    _stack[_i] = (_bottom, _bottom + _h)
    _below = _bottom + _h
if _stack[0][1] > _ANNOT_TOP:
    raise SystemExit(
        f"panel (c): the {len(_stack)} exponent blocks would have to reach "
        f"{_stack[0][1]:.3f} of the axes height, above the {_ANNOT_TOP} the free "
        f"triangle over the curves leaves. Shorten a series name -- do not print "
        f"an exponent on top of its own data")
for _txt, (_bottom, _top) in zip(_ANN, _stack):
    ax_c.annotate(_txt, xy=(_ANNOT_X0, _top), xycoords="axes fraction",
                  fontsize=st.MIN_TEXT, color=st.INK2, va="top", ha="left")
print("  (c) exponent blocks, axes-fraction y bottom..top, clear of data ink: "
      + "; ".join("%s %.3f..%.3f" % (n, b, t)
                  for (n, *_r), (b, t) in zip(SERIES, _stack)))
_lx, _ly = np.log(nodes[-4:]), np.log(SERIES[1][1][-4:])
print(f"  {'layout local':16s} exponent "
      f"{float(np.polyfit(_lx, _ly, 1)[0]):.3f} over the last four points")
print(f"  9999.nhx total median = {REAL_MS:.2f} ms ({REAL_NODES} gene nodes)")

# ---------------------------------------------------------------------------
# Machine-generated alt text (ISSUE-006/007/075)
# ---------------------------------------------------------------------------
# The manuscript's alt text was hand-copied off the rendered pictures, and the
# copying lost rows, reordered labels and invented a key entry. Every line of
# this skeleton is read back out of the artists and data tables this script
# actually drew, in draw order, so the docx can quote the figure instead of
# describing it from memory. Printed to stdout and merged into
# `figures/_build/alt_text_skeletons.md` — a generated report inside the
# repository, so the audit track's working directory is never a build
# dependency; PR_ALT_MD points it somewhere else, and a missing or unwritable
# target only costs the report, never the figure (the write below is guarded).
# This section is delimited so the main-figure script's section of the same file
# survives a run of either script in any order.
ALT_MD_DEFAULT = os.path.join(os.path.normpath(
    os.path.join(SCRIPT_DIR, "_build")), "alt_text_skeletons.md")
ALT_MD = os.environ.get("PR_ALT_MD") or ALT_MD_DEFAULT
ALT_SECTION = "supplementary-figure-s1"


# Height of the tallest glyph the 7 pt floor allows, measured as drawn rather
# than quoted from the previous revision (the ‡ is the widest floor-height mark
# the matrix would have needed to place inside a cell).
_probe_mark = ov.text(0, -10, "\u2021", fontsize=st.MIN_TEXT)
MARK_BB = _probe_mark.get_window_extent(renderer=fig.canvas.get_renderer())
MARK_GEO = "%.2f x %.2f pt" % (MARK_BB.width / fig.dpi * 72.0,
                               MARK_BB.height / fig.dpi * 72.0)
_probe_mark.remove()


def _fmt_ticks(ax, axis):
    """the tick LABEL STRINGS the axis will print, through its own formatter."""
    fmt = getattr(ax, axis + "axis").get_major_formatter()
    return [str(fmt(val)) for val in getattr(ax, "get_" + axis + "ticks")()]


def alt_skeleton():
    L = []
    A = L.append
    A("## Supplementary figures")
    A("")
    A("### Supplementary Fig. S1 (`PhyloRecViewer-手稿附件-附图1`)")
    A("- carriers: composed with matplotlib and written straight to PDF and "
      "1200 dpi PNG (no SVG parent); page %.3f x %.3f mm at the article's "
      "%.1f mm text block; smallest drawn type %.2f pt (floor %.2f pt)."
      % (FIG_W * 25.4, FIG_H * 25.4, st.PRINT_MM, st.MIN_TEXT, st.MIN_TEXT))
    A("- panel headings, in draw order:")
    for letter, title, _x, _y in HEADINGS:
        A("    - (%s) %s" % (letter, title))
    A("- sub-headings: none beyond the three panel titles; the (b)/(c) panels "
      "are titled by their axis labels (below).")
    A("- badge string: none in this figure (the interface agreement badge "
      "belongs to the main figures).")
    A("- (a) matrix ROW labels, draw order top to bottom (%d rows): %s"
      % (len(CAPABILITIES), ", ".join(CAPABILITIES)))
    A("    - the row labels are Supplementary Table S2's own column names, so "
      "the export row is drawn as %r. Widest label as drawn: %r, %.3f in wide, "
      "%.3f in (%.2f pt) clear of the page trim against the %.3f in (%.1f pt) "
      "the style module declares; the build fails if any label stops clearing "
      "it, so no label is clipped."
      % (EXPORT_ROW, ROW_LABEL_WIDEST, LABEL_R - ROW_LABEL_CLEAR,
         ROW_LABEL_CLEAR, ROW_LABEL_CLEAR * 72.0, st.PAGE_MARGIN_IN,
         st.PAGE_MARGIN_IN * 72.0))
    # The ‡ layer and the glyph geometry are MEASURED, not quoted from the
    # previous revision: the counts follow N_MARKED (SylvX's whole column plus
    # the four NOTUNG cells Table S2 marks), the cell count follows the matrix
    # as drawn, and the disc size and row pitch come from R_IN and ROW_PITCH,
    # so adding or dropping a capability row cannot leave a stale number here.
    N_MARKED = len(CAPABILITIES) + 4          # SylvX column + 4 NOTUNG cells
    A("    - provenance marks: the matrix draws the three verdict levels only. "
      "The ‡ marks that Supplementary Table S2 puts on %d of these %d cells "
      "(every SylvX cell, plus NOTUNG's Search / filter, Transfer network, "
      "Undo/Redo and Export) to mean 'read from the tool's own published "
      "description, not independently re-tested' are deliberately NOT repeated "
      "on the cells -- a ‡ set at the %.2f pt floor is %s, while a cell is a "
      "%.2f pt disc on a %.2f pt row pitch, so the mark would overprint the "
      "disc above or below -- and the legend must therefore carry that layer "
      "and point back to Table S2."
      % (N_MARKED, N_ROW * N_COL, st.MIN_TEXT, MARK_GEO,
         2 * R_IN * 72.0, ROW_PITCH * 72.0))
    A("- (a) matrix COLUMN labels, draw order left to right (%d columns): %s"
      % (len(TOOLS), ", ".join(name for name, _scores in TOOLS)))
    A("    - highlighted column, the article's own: %r (column %d of %d); "
      "verdicts per column, top row first: %s"
      % (HIGHLIGHT, N_COL, N_COL, "; ".join(
          "%s = %s" % (name, "/".join(str(v) for v in scores))
          for name, scores in TOOLS)))
    A("- (a) symbol key entries, in draw order: %s"
      % ", ".join('"%s"' % t for t in KEY_ROW["items"]))
    A("    - symbol key POSITION as drawn: ABOVE panel (a)'s matrix box, on "
      "the shared key line; %d row of %d items; centred on panel (a) at "
      "x = %.3f in, spanning x = %.3f..%.3f in; y = %.3f in from the figure "
      "bottom, i.e. %.3f in above the box top edge at y = %.3f in; the "
      "(b)/(c) series key is a separate %d-row block centred on the SAME line "
      "over panels (b)+(c), so this row of discs passes between its two rows."
      % (1, len(KEY_ROW["items"]), KEY_ROW["centre"], KEY_ROW["x0"],
         KEY_ROW["x1"], KEY_ROW["y"], KEY_ROW["y"] - BOX_TOP, BOX_TOP,
         KEY_NROW))
    A("    - what each key glyph means: supported = fully filled disc, "
      "partial = disc filled over its left half, absent = open disc. One "
      "shape family, three fill levels, so the verdicts need no colour.")
    A("- (b)/(c) series key, in draw order: %s"
      % ", ".join('"%s"' % h.get_label() for h in handles))
    A("    - series key POSITION as drawn: %d rows x %d columns, framed, "
      "centred on the shared key line over panels (b)+(c); block spans "
      "x = %.3f..%.3f in and y = %.3f..%.3f in from the figure bottom, i.e. "
      "%.3f in (%.2f pt) clear of the nearest page edge against the %.3f in "
      "(%.1f pt) inner margin the style module declares; every glyph in it is "
      "%.2f pt."
      % (KEY_NROW, KEY_NCOL, KEY_BOX[0], KEY_BOX[2], KEY_BOX[1], KEY_BOX[3],
         KEY_CLEAR, KEY_CLEAR * 72.0, st.PAGE_MARGIN_IN,
         st.PAGE_MARGIN_IN * 72.0, st.MIN_TEXT))
    A("    - the dotted reference line, keyed once for both panels as %r: a "
      "through-origin least-squares STRAIGHT-LINE fit to each series, drawn in "
      "that series' own colour, so it is NOT the fitted power law the (c) "
      "annotations quote. Its gradient in ms per node is %s in panel (b), "
      "which is therefore not a unit slope, and exactly 1 (proportional, i.e. "
      "linear, scaling) in the log-log panel (c)."
      % (handles[-1].get_label(),
         "; ".join("%s = %.5f" % (n, s) for n, s in REF_FITS)))
    A("    - series colour / marker / linestyle as drawn: %s"
      % "; ".join("%s = %s, %r, %r" % (name, colour, marker, ls)
                  for name, _m, _a, _b, colour, marker, ls in SERIES))
    A("- axis titles, draw order: (b) x = %r, y = %r; (c) x = %r, y = %r"
      % (ax_b.get_xlabel(), ax_b.get_ylabel(),
         ax_c.get_xlabel(), ax_c.get_ylabel()))
    A("- tick labels as printed: (b) x = %s, y = %s; (c) x = %s, y = %s"
      % (", ".join(_fmt_ticks(ax_b, "x")), ", ".join(_fmt_ticks(ax_b, "y")),
         ", ".join(_fmt_ticks(ax_c, "x")), ", ".join(_fmt_ticks(ax_c, "y"))))
    A("- (c) exponent annotations, draw order, each selectable text at "
      "%.2f pt (no path effect, so the 7 pt floor covers them): %s"
      % (st.MIN_TEXT, "; ".join(repr(t.replace("\n", " / ")) for t in _ANN)))
    A("- fitted numbers behind those annotations: %s"
      % "; ".join("%s exponent %.3f, R² %.4f" % (n, e, r)
                  for n, _m, e, r in ANNOT))
    A("- data files read this run: %s (%d folded runs, %d measurement rows) "
      "and %s (9999.nhx row: %d nodes, %.2f ms)"
      % (CSV_PATH, N_RUNS, len(nodes), DS_PATH, REAL_NODES, REAL_MS))
    return "\n".join(L)


def merge_alt_md(md_path, section, body):
    """replace only this script's delimited block inside the shared report."""
    md_path = st.confine_to_repo(md_path)
    begin, finish = f"<!-- BEGIN {section} -->", f"<!-- END {section} -->"
    block = "\n".join([begin, body, finish])
    old = ""
    if os.path.exists(md_path):
        with open(md_path, encoding="utf-8") as fh:
            old = fh.read()
    if begin in old and finish in old:
        head, rest = old.split(begin, 1)
        _gone, tail = rest.split(finish, 1)
        new = head + block + tail
    elif old.strip():
        new = old.rstrip("\n") + "\n\n" + block + "\n"
    else:
        new = ("# Alt-text skeletons (machine-generated)\n\n"
               "Generated by the figure scripts themselves: "
               "`PhyloRecViewer-手稿正文-图1-6.py` and "
               "`PhyloRecViewer-手稿附件-附图1.py`.  Each script replaces only "
               "its own delimited section, so either may be run first.  Do not "
               "hand-edit a section: re-run the script that owns it.\n\n"
               + block + "\n")
    parent = os.path.dirname(os.path.abspath(md_path))
    os.makedirs(parent, exist_ok=True)
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(new)
    return md_path


ALT_TEXT = alt_skeleton()
print()
print(ALT_TEXT)
try:
    print("\nalt-text skeleton merged into %s" % merge_alt_md(
        ALT_MD, ALT_SECTION, ALT_TEXT))
except OSError as exc:                     # never fail a figure over a report
    print("\n  (alt-text report not written: %s)" % exc)

st.save(fig, __file__)
