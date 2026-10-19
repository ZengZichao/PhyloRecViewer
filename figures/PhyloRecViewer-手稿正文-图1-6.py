#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manuscript main figures 1, 3, 4, 5, 6 for PhyloRecViewer.

One shared design system (canvas, type ladder, colour tokens, glyph grammar)
emits vector SVGs sized for a 166 mm journal text block; PNG/TIFF/PDF are
rendered from these SVGs by export.sh.

Everything is read and written inside the repository: the SVGs land next to this
script (`figures/`, or PR_FIG_OUT), and the machine-generated alt text lands in
`figures/_build/` rather than in /tmp or in the audit track's working directory.
"""
import math
import os
import re

import phylorec_style as st

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Where the SVGs are written.  A relative `f.save("…svg")` argument is resolved
# against this directory rather than the caller's cwd, so the five carriers can
# be produced from any working directory and always land beside the script —
# inside `figures/`, i.e. inside the repository (ISSUE-062).  PR_FIG_OUT
# relocates them for a scratch run.
OUT_DIR = os.path.abspath(os.environ.get("PR_FIG_OUT") or SCRIPT_DIR)

# ----------------------------------------------------------------- canvas ---
# Typography, canvas size, line-weight floor and the render checks all come from
# the shared style module, so the hand-authored SVGs and the matplotlib figures
# cannot drift apart. 1 unit = 0.1153 mm = 0.3267 pt at the article's text block.
UW = 1440.0          # viewBox width in units
PRINT_MM = st.PRINT_MM
ML = 24.0            # inner margin, in units
K = PRINT_MM / UW    # mm per unit
PT_PER_UNIT = K * 72.0 / 25.4


def pt(font_units):   # printed size in points, for sanity checks
    return font_units * PT_PER_UNIT


def u(min_pt):        # smallest unit count that still prints at min_pt
    return math.ceil(min_pt / PT_PER_UNIT)

# ------------------------------------------------------------------ ink -----
INK    = "#141A21"
INK2   = "#3C4653"
MUT    = "#828D9B"
FAINT  = "#AEB6C0"
HAIR   = "#E1E5EA"

# ------------------------------------------- application theme (print-safe) --
# Mirrored from src/render/theme.ts via the shared style module: these figures
# are meant to decode like the real export in Fig. 2, so the hues must match.
TUBE_F = st.TUBE_F   # species tube fill  (theme.tube.fill, print weight)
TUBE_S = st.TUBE_EDGE
BLUE   = st.APP_GENE     # gene-tree edge, family colour (theme OKABE_ITO[0])
BLUE_D = st.APP_LEAF     # leaf discs: same token as BLUE, larger radius only
ORANGE = st.APP_DUP      # theme.event.duplication
ORANGE_L = st.APP_DUP_L
VIOLET = st.APP_DONOR    # theme.event.branchingOut / .transferBack
LOSS   = st.APP_LOSS
GREEN  = st.APP_BIFURC
AMBER  = st.APP_AMBER
PINK   = st.APP_PINK
SLATE  = st.APP_SLATE
HEAT   = list(st.HEAT)   # lane-count ramp, derived from TUBE_F -> APP_DUP

# The comparison badge quotes the interface's own string, not a paraphrase of
# the arithmetic behind it: the application renders `${pct}% ${t.agree} ·
# ${diff.compared} ${t.geneNodes}` for the bundled Compare demo
# (src/app/App.tsx:533-535, src/i18n.ts agree/geneNodes).  5 of those 7 compared
# gene nodes agree, which is where the 71 % comes from; the badge itself shows
# the percentage and the number of compared nodes.
BADGE_COMPARE = "71% agree · 7 gene nodes"

# The sidebar switch that turns the tube shading on is labelled "Overlapping
# copies (lanes) heatmap" (src/i18n.ts:430), so the quantity itself is named
# "Overlapping copies (lanes)" in the interface; the Fig. 1(a) column heading
# uses exactly that wording.
UI_LANE_LABEL = "Overlapping copies (lanes)"

FONT = ", ".join(st.FONT_FAMILY)

# U+2265 GREATER-THAN OR EQUAL TO, the one non-ASCII sign these figures quote
# off the interface ("networkEdgeWidth(1|3|>=6)").  It is never SET as a glyph:
# Fig.ge6() draws it as line work, because the CID-keyed subset CairoSVG writes
# for it carries no cmap table for the glyph-coverage gate to check.  Every
# string below may contain it; ttext() routes those through relation_text().
GE_CHAR = "\u2265"

# ------------------------------------------------------------ type ladder ---
# Every rung is derived from a point floor, never hand-tuned below it.
F_PL = u(st.PANEL_LETTER)   # panel letter
F_PT = u(st.PANEL_TITLE)    # panel title
F_PS = u(st.MIN_TEXT)       # panel subtitle
F_LB = u(st.LABEL_TEXT)     # primary label
F_SM = u(st.MIN_TEXT)       # secondary label / legend
F_XS = u(st.MIN_TEXT)       # in-glyph letter

# ------------------------------------------------------- line-weight floor ---
MIN_SW = st.sw()            # smallest stroke that survives a 400 lpi screen

# --------------------------------------------------------------- geometry ---
R_SPEC = 7.0    # speciation disc radius
R_LEAF = 11.0   # leaf disc radius
R_DONOR = 10.0  # transfer donor ring radius
SQ_DUP = 18.0   # duplication square side
W_EDGE = 2.4    # gene-tree edge
W_TUBE = 1.3    # tube outline
PRINT_FACTOR = st.PRINT_FACTOR   # interface px -> figure units at 166 mm

# ------------------------------------------------------------ label leading --
# A line of type reserves its FONT BOX: Helvetica Neue at the 23-unit (7.52 pt)
# body rung measures 0.952 em of ascent plus 0.213 em of descent = 26.8 units.
# Two lines set on a tighter pitch share a strip of that box, which is exactly
# what "no two drawn labels overprint" means on the carrier (check_figures.py
# intersects the boxes PyMuPDF reports for the spans), so every stacked pair in
# these figures is laid out on this pitch and never tighter: 30 units is 1.30
# leading at the body rung, against the 0.87 leading that produced ISSUE-020.
STACK_LEAD = 30.0      # baseline pitch of a two-line label (title + subtitle)
SUB_DY = 16.0          # panel title -> panel subtitle baseline gap


# ------------------------------------------------------------ lane packing ---
# The schematic in Fig. 1(a) reports the same quantity the interface reports
# under the label "Overlapping copies (lanes)": the MAXIMUM NUMBER OF
# SIMULTANEOUSLY OVERLAPPING incoming-edge intervals inside one species tube,
# computed by interval partitioning (sort by start, first-fit) exactly as
# assignLanes()/packLanes() do in src/layout/geneEmbed.ts:103-145,170-194 —
# NOT a count of gene nodes in the species.  The numbers drawn in the figure
# are the output of this function on the figure's own edge geometry.
EPS = 1e-6


def pack_lanes(intervals):
    """first-fit lane packing; returns (lane index per interval, lane count).

    A faithful transcription of packLanes() (src/layout/geneEmbed.ts:170-194):
    intervals that merely touch - a parent edge ending where its child edge
    starts - share a lane, while genuinely overlapping ones do not, and a
    zero-length interval that touches the end of another is still treated as
    conflicting.  First-fit over intervals sorted by start is the minimum
    number of lanes, i.e. the maximum number that overlap at once.
    """
    order = sorted(range(len(intervals)),
                   key=lambda i: (intervals[i][0], intervals[i][1]))
    lanes = [0] * len(intervals)
    lane_last = []                             # (start, end) per open lane
    for i in order:
        start, end = intervals[i]
        placed = -1
        for k, (ps, pe) in enumerate(lane_last):
            if start < pe - EPS:               # genuinely overlapping
                continue
            if ((end - start <= EPS or pe - ps <= EPS)
                    and abs(start - pe) <= EPS):
                continue
            placed = k
            break
        if placed == -1:
            placed = len(lane_last)
            lane_last.append((start, end))
        else:
            lane_last[placed] = (start, end)
        lanes[i] = placed
    return lanes, max(1, len(lane_last))


def r(v):
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

class Fig:
    def __init__(self, h, name):
        self.h = h
        self.name = name
        # Draw-order record for the machine-generated alt-text skeleton: every
        # piece of text the figure emits, with its position, and every glyph-key
        # row with its own position.  The manuscript's alt text is written from
        # this record rather than copied off the picture by hand, so a list of
        # species rows or legend items cannot silently lose an entry.
        self.texts = []
        self.keys = []
        self.heads = []
        self.badges = []
        self.net_weights = {}
        self.net_arcs = []
        self.notes = []
        self.clear = []
        self.lane_counts = {}
        self.heat_ramp = None
        self.path_out = None
        self.b = ['<?xml version="1.0" encoding="UTF-8"?>',
                  '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
                  'width="%smm" height="%smm" viewBox="0 0 %s %s" '
                  'font-family="%s" text-rendering="geometricPrecision">'
                  % (r(PRINT_MM), r(h * K), r(UW), r(h), FONT)]
        self.defs = []
        self.b.append('<rect width="%s" height="%s" fill="#FFFFFF"/>' % (r(UW), r(h)))

    # -- primitives ------------------------------------------------------
    def raw(self, s):
        self.b.append(s)

    def line(self, x1, y1, x2, y2, stroke=BLUE, w=W_EDGE, dash=None, cap="butt",
             marker=None, opacity=None):
        w = max(MIN_SW, w)
        a = 'x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s"' % (
            r(x1), r(y1), r(x2), r(y2), stroke, r(w))
        a += ' stroke-linecap="%s"' % cap
        if dash:
            a += ' stroke-dasharray="%s"' % dash
        if marker:
            a += ' marker-end="%s"' % marker
        if opacity:
            a += ' opacity="%s"' % opacity
        self.b.append('<line %s/>' % a)

    def path(self, d, stroke=None, w=W_EDGE, fill="none", dash=None, cap="round",
             marker=None, join="round", opacity=None):
        a = 'd="%s"' % d
        if stroke:
            w = max(MIN_SW, w)
            a += ' stroke="%s" stroke-width="%s" stroke-linecap="%s" stroke-linejoin="%s"' % (
                stroke, r(w), cap, join)
        if dash:
            a += ' stroke-dasharray="%s"' % dash
        a += ' fill="%s"' % (fill or "none")
        if marker:
            a += ' marker-end="%s"' % marker
        if opacity:
            a += ' opacity="%s"' % opacity
        self.b.append('<path %s/>' % a)

    def rect(self, x, y, w, h, fill="none", stroke="none", sw=0.0, rx=0.0,
             dash=None, opacity=None):
        a = 'x="%s" y="%s" width="%s" height="%s"' % (r(x), r(y), r(w), r(h))
        if rx:
            a += ' rx="%s"' % r(rx)
        if fill:
            a += ' fill="%s"' % fill
        if stroke:
            a += ' stroke="%s" stroke-width="%s"' % (stroke, r(max(MIN_SW, sw)))
            if dash:
                a += ' stroke-dasharray="%s"' % dash
        else:
            a += ' stroke="none"'
        if opacity:
            a += ' opacity="%s"' % opacity
        self.b.append('<rect %s/>' % a)

    def circle(self, cx, cy, rad, fill=BLUE, stroke="none", sw=0.0, opacity=None,
               dash=None):
        a = 'cx="%s" cy="%s" r="%s" fill="%s"' % (r(cx), r(cy), r(rad), fill)
        if stroke:
            a += ' stroke="%s" stroke-width="%s"' % (stroke, r(max(MIN_SW, sw)))
        if opacity:
            a += ' opacity="%s"' % opacity
        self.b.append('<circle %s/>' % a)

    def text(self, x, y, s, size=F_LB, fill=INK, anchor="start", weight="normal",
             style="normal", spacing=None, record=True):
        size = max(F_XS, size)  # never below the shared 7 pt floor
        a = ('x="%s" y="%s" font-size="%s" fill="%s" text-anchor="%s"' %
             (r(x), r(y), r(size), fill, anchor))
        if weight != "normal":
            a += ' font-weight="%s"' % weight
        if style != "normal":
            a += ' font-style="%s"' % style
        if spacing:
            a += ' letter-spacing="%s"' % r(spacing)
        self.b.append('<text %s>%s</text>' % (a, esc(s)))
        if record:
            self.texts.append(dict(x=x, y=y, s=str(s), size=size, fill=fill,
                                   anchor=anchor, weight=weight, style=style))

    def ge6(self, x, base, size, fill=INK2):
        """draw the relation 'at least' as two strokes over a bar.

        U+2265 is a real glyph of Helvetica Neue, but CairoSVG sets it in a
        CID-keyed Identity-H subset that ships no cmap table at all (measured on
        the delivered 图1/图4 PDFs: the RFUNIP+HelveticaNeue program has Glyph
        outlines and a /ToUnicode CMap, and no cmap), so the glyph-coverage gate
        over the carrier can never certify the sign, and a press that honours
        the subset has no unicode cross-check of its own either.  Drawing the
        relation as line work retires the dependency: the mark is geometry in
        every carrier, and it is the same remedy the audit accepted for the
        U+2192 arrow (ISSUE-025), which was drawn rather than set.

        The proportions and the advance are the font's own, measured off the
        delivered glyph (chevron -0.526..-0.084 em over the baseline, bar on it,
        ink spanning 0.083..0.915 of a 0.60 em advance), so the text laid out
        beside it does not move.  Returns the advance.
        """
        w = text_w(GE_CHAR, size)
        x0, x1 = x + 0.083 * w, x + 0.915 * w
        self.path("M %s,%s L %s,%s L %s,%s" % (
                      r(x0), r(base - 0.526 * size),
                      r(x1), r(base - 0.305 * size),
                      r(x0), r(base - 0.084 * size)),
                  stroke=fill, w=0.075 * size, cap="round", join="round")
        self.line(x0, base - 0.010 * size, x1, base - 0.010 * size,
                  stroke=fill, w=0.067 * size, cap="butt")
        return w

    def relation_text(self, x, base, s, size=F_LB, fill=INK, anchor="start",
                      weight="normal", style="normal"):
        """lay `s` out on one baseline, drawing every GE_CHAR as geometry.

        The runs between the signs are ordinary <text>, positioned by the
        advances the font really gives them, so the whole string occupies the
        same box, anchored the same way, as a single <text> would.  One draw
        record is kept for the whole string: the alt-text skeleton and the
        figure-side overlap report must see the label the reader reads, not the
        pieces it was set from.
        """
        size = max(F_XS, size)
        w = text_w(s, size)
        cur = (x - w / 2.0 if anchor == "middle" else
               x - w if anchor == "end" else x)
        parts = s.split(GE_CHAR)
        for i, part in enumerate(parts):
            if part:
                self.text(cur, base, part, size=size, fill=fill, anchor="start",
                          weight=weight, style=style, record=False)
                cur += text_w(part, size)
            if i < len(parts) - 1:
                cur += self.ge6(cur, base, size, fill)
        self.texts.append(dict(x=cur - w, y=base, s=s, size=size, fill=fill,
                               anchor="start", weight=weight, style=style))

    def ttext(self, x, cy, s, **kw):
        """text positioned by the vertical centre of its cap-height"""
        size = kw.get("size", F_LB)
        base = cy + size * 0.355
        if GE_CHAR in str(s):
            self.relation_text(x, base, str(s), **kw)
        else:
            self.text(x, base, s, **kw)

    def lab(self, x, cy, s, size=F_SM, fill=INK, anchor="start", weight="normal",
            style="normal", halo="#FFFFFF"):
        """label with an opaque white under-stroke, so it survives crossings"""
        base = cy + size * 0.355
        a = 'x="%s" y="%s" font-size="%s" text-anchor="%s"' % (r(x), r(base), r(size),
                                                              anchor)
        if weight != "normal":
            a += ' font-weight="%s"' % weight
        if style != "normal":
            a += ' font-style="%s"' % style
        self.b.append('<text %s fill="%s" stroke="%s" stroke-width="%s" '
                      'stroke-linejoin="round">%s</text>'
                      % (a, fill, halo, r(size * 0.32), esc(s)))
        self.b.append('<text %s fill="%s">%s</text>' % (a, fill, esc(s)))
        self.texts.append(dict(x=x, y=base, s=str(s), size=size, fill=fill,
                               anchor=anchor, weight=weight, style=style))

    # -- composite glyphs -------------------------------------------------
    def marker(self, mid, color, w=11.0, h=8.0):
        self.defs.append(
            '<marker id="%s" viewBox="0 0 10 10" refX="9.4" refY="5" '
            'markerWidth="%s" markerHeight="%s" markerUnits="userSpaceOnUse" '
            'orient="auto-start-reverse"><path d="M0,0.6 L10,5 L0,9.4 Z" fill="%s"/></marker>'
            % (mid, r(w), r(h), color))

    def tube(self, x, cy, w, h, fill=TUBE_F, stroke=TUBE_S, rx=None):
        self.rect(x, cy - h / 2.0, w, h, fill=fill, stroke=stroke, sw=W_TUBE,
                  rx=rx if rx is not None else h / 2.0)

    def spec(self, cx, cy, rad=R_SPEC, color=BLUE):
        self.circle(cx, cy, rad, fill=color)

    def leaf(self, cx, cy, rad=R_LEAF, color=BLUE_D):
        self.circle(cx, cy, rad, fill=color)

    def dup(self, cx, cy, side=SQ_DUP, color=ORANGE):
        self.rect(cx - side / 2.0, cy - side / 2.0, side, side, fill=color, rx=2.0)

    def donor(self, cx, cy, rad=R_DONOR):
        self.circle(cx, cy, rad, fill="#FFFFFF", stroke=VIOLET, sw=2.2)

    def loss(self, cx, cy, size=10.0, w=3.0, label=None, lx=0, ly=-20,
             anchor="middle"):
        self.circle(cx, cy, size + 1.8, fill="#FFFFFF")
        self.line(cx - size, cy - size, cx + size, cy + size, stroke=LOSS, w=w, cap="round")
        self.line(cx - size, cy + size, cx + size, cy - size, stroke=LOSS, w=w, cap="round")
        if label:
            self.ttext(cx + lx, cy + ly, label, size=F_SM, fill=MUT, anchor=anchor)

    def disagree(self, cx, cy, side=40.0):
        self.rect(cx - side / 2.0, cy - side / 2.0, side, side,
                  fill=ORANGE_L, stroke=ORANGE, sw=1.7, rx=8.0, dash="6 4.5")

    def header(self, x, y, letter, title, subtitle=None):
        self.text(x, y + F_PL * 0.34, "(%s)" % letter, size=F_PL, weight="bold")
        self.text(x + 40, y + F_PT * 0.34, title, size=F_PT, weight="bold")
        if subtitle:
            self.text(x + 40, y + F_PT + SUB_DY, subtitle, size=F_PS, fill=MUT)
        self.heads.append(dict(letter=letter, title=title, subtitle=subtitle,
                               x=x, y=y))

    def check(self):
        """warn about anything that would fall outside the print margins"""
        txt = "\n".join(self.b)
        bad = []
        # Ink box used for the trim-clearance audit.  A PDF text span is measured
        # against the FONT box, not the cap-height, so the check uses the full
        # ascent and a generous descent; it is deliberately stricter than the
        # visible ink so no label can ever be reported as too close to the trim.
        ASCENT, DESCENT = 1.00, 0.30
        for m in re.finditer(r'<text\b([^>]*)>([^<]*)</text>', txt):
            at, t = m.group(1), m.group(2)
            g = lambda k: (float(re.search(k + r'="(-?[\d.]+)"', at).group(1))
                           if re.search(k + r'="(-?[\d.]+)"', at) else None)
            x, y, fs = g("x"), g("y"), g("font-size") or F_LB
            a = re.search(r'text-anchor="(\w+)"', at)
            a = a.group(1) if a else "start"
            w = text_w(t.replace("&amp;", "&"), fs)
            r_ = x + w / 2 if a == "middle" else (x if a == "end" else x + w)
            l_ = x - w / 2 if a == "middle" else (x - w if a == "end" else x)
            if r_ > UW - ML + 2 or l_ < ML - 2:
                bad.append((round(l_), round(r_), t[:46]))
            if t.strip():
                top, bot = y - ASCENT * fs, y + DESCENT * fs
                self.clear.append((min(l_, UW - r_, top, self.h - bot),
                                   t[:40]))
        if bad:
            print("  !! %s 越界 %d 处:" % (self.name, len(bad)))
            for l_, r_, t in bad:
                print("       x %4d..%-4d  %s" % (l_, r_, t))
        floor_pt = st.PAGE_MARGIN_IN * 72.0
        if self.clear:
            worst, which = min(self.clear)
            flag = "ok " if worst * PT_PER_UNIT >= floor_pt - 0.05 else "FAIL"
            print("     [%s] %s trim clearance: nearest text %.2f pt from a page "
                  "edge (%s) - module inner margin %.2f pt"
                  % (flag, self.name, worst * PT_PER_UNIT, which, floor_pt))
            if worst * PT_PER_UNIT < floor_pt - 0.05:
                print("     !! %s text sits inside the declared 6 pt margin"
                      % self.name)

    def save(self, path):
        if not os.path.isabs(path):
            path = os.path.join(OUT_DIR, path)
        path = st.confine_to_repo(path)
        out = self.b[:2] + ["<defs>" + "".join(self.defs) + "</defs>"] + self.b[2:]
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + "\n</svg>\n")
        self.path_out = path
        print("%-46s %s x %s units  ->  %.0f x %.0f mm  (min label %.1f pt)"
              % (self.name, r(UW), r(self.h), PRINT_MM, self.h * K, pt(F_SM)))
        self.check()


# =========================================================== shared blocks ==
def compare_pair(f, x0, y0, pitch=40.0, scale=1.0, badge=True, labels=True,
                 badge_w=250.0):
    """Event-level comparison of the two bundled Compare-demo reconciliations.

    Tool A calls g1/g2 speciations, Tool B calls them duplications.
    `badge_w` is a MINIMUM pill width; the pill is measured from BADGE_COMPARE so
    the interface wording is never clipped.
    Returns the x of the right edge of the drawing.
    """
    # depth order, root at the top: time runs top -> bottom, the
    # application's default orientation (Pass 1 assigns species Y by depth)
    ROWS = ["Root", "Mammalia", "Sauropsida", "Human", "Mouse", "Chicken", "Lizard"]
    s = scale
    th = 26.0 * s                      # tube height
    tw = 92.0 * s                      # tube width
    gap = 13.0 * s                     # horizontal gap between depth columns
    yrow = {n: y0 + i * pitch for i, n in enumerate(ROWS)}
    blockA = x0 + 132 * s
    blockB = blockA + 3 * (tw + gap) + 32 * s
    span = 3 * (tw + gap) - gap
    # badge and column heads
    if badge:
        cx = (blockA + blockB + span) / 2.0
        bs = F_SM + 1.5
        # the pill is sized from the measured string, so the interface wording
        # can never be clipped by a hand-picked badge width
        bw = max(badge_w * s if badge_w else 0.0,
                 text_w(BADGE_COMPARE, bs) + 44 * s)
        f.rect(cx - bw / 2.0, y0 - 80 * s, bw, 28 * s, fill="#FFFFFF",
               stroke=INK, sw=1.2, rx=14 * s)
        f.ttext(cx, y0 - 66 * s, BADGE_COMPARE, size=bs,
                weight="bold", anchor="middle")
        f.badges.append(BADGE_COMPARE)
        f.ttext(blockA + span / 2.0, y0 - 36 * s, "Tool A", size=F_LB,
                anchor="middle", weight="bold")
        f.ttext(blockB + span / 2.0, y0 - 36 * s, "Tool B", size=F_LB,
                anchor="middle", weight="bold")
    for n in ROWS:
        f.ttext(blockA - 8 * s, yrow[n], n, size=F_SM, anchor="end",
                style="italic")
    POS = lambda col: {"Root": (col[0], yrow["Root"]),
                       "Mammalia": (col[1], yrow["Mammalia"]),
                       "Sauropsida": (col[1], yrow["Sauropsida"]),
                       "Human": (col[2], yrow["Human"]),
                       "Mouse": (col[2], yrow["Mouse"]),
                       "Chicken": (col[2], yrow["Chicken"]),
                       "Lizard": (col[2], yrow["Lizard"])}
    for tool, bx in (("A", blockA), ("B", blockB)):
        col = [bx, bx + tw + gap, bx + 2 * (tw + gap)]
        pos = POS(col)
        for lvl, names in ((0, ["Root"]), (1, ["Mammalia", "Sauropsida"]),
                           (2, ["Human", "Mouse", "Chicken", "Lizard"])):
            for n in names:
                f.tube(col[lvl], pos[n][1], tw, th)
        for par, chi in (("Root", "Mammalia"), ("Root", "Sauropsida"),
                         ("Mammalia", "Human"), ("Mammalia", "Mouse"),
                         ("Sauropsida", "Chicken"), ("Sauropsida", "Lizard")):
            x1, y1 = pos[par]
            x2, y2 = pos[chi]
            f.line(x1, y1, x2, y2, stroke=BLUE, w=W_EDGE * s)
        for n in ("Human", "Mouse", "Chicken", "Lizard"):
            f.leaf(*pos[n], rad=R_LEAF * s)
        f.spec(*pos["Root"], rad=R_SPEC * s)
        for n, g in (("Mammalia", "g1"), ("Sauropsida", "g2")):
            px, py = pos[n]
            f.disagree(px, py, side=40 * s)
            if tool == "A":
                f.spec(px, py, rad=R_SPEC * s)
            else:
                f.dup(px, py, side=SQ_DUP * s)
            if labels:
                f.ttext(px - 27 * s, py, g, size=F_SM + 1, anchor="end", fill=INK2)
    return blockB + span


def transfer_network(f, cx, cy, rad, scale=1.0, labels=True, marker="arrV",
                     label_size=None):
    """Circular transfer network, drawn the way the application draws it.

    Nodes are filled DISCS in the speciation/family colour whose radius grows
    with the total number of transfers that species takes part in
    (`nodeR = 4 + 8*weight/maxWeight`, src/app/RightPanel.tsx:815,879 - the
    interface fills them with `theme.event.speciation`, and the article's
    one-blue rule maps that token onto APP_GENE).  A species that transfers to
    itself is drawn as a RING on the outer side of its own disc
    (`RightPanel.tsx:832-843`).  Arcs are stroked in the transferBack colour
    (APP_DONOR) with the interface's own step function
    (`networkEdgeWidth`, src/render/geometry.ts:127-129) scaled to print by
    `phylorec_style.PRINT_FACTOR`, so 1 / 3 / >=6 transfers read as 1 / 3 / 6 px
    on screen and 2.2 / 6.6 / 13.2 figure units here.  Radii keep the
    interface's own ratio to the ring (a 4-12 px node on a 112 px ring).
    """
    s = scale
    names = ["Sp A", "Sp B", "Sp C", "Sp D", "Sp E", "Sp F", "Sp G", "Sp H"]
    ang = [90, 135, 180, 225, 270, 315, 0, 45]           # A at top, then CCW
    P = {}
    for n, a in zip(names, ang):
        t = math.radians(a)
        P[n] = (cx + rad * math.cos(t), cy - rad * math.sin(t))
    f.circle(cx, cy, rad, fill="none", stroke=HAIR, sw=1.2)
    # (from, to, transfers).  "Sp D" -> "Sp D" is a self-transfer and is drawn
    # as a ring, exactly as the interface draws it.
    arcs = [("Sp B", "Sp A", 6), ("Sp H", "Sp A", 3), ("Sp C", "Sp B", 5),
            ("Sp H", "Sp B", 3), ("Sp C", "Sp E", 4), ("Sp D", "Sp E", 3),
            ("Sp E", "Sp F", 5), ("Sp G", "Sp F", 3), ("Sp G", "Sp D", 4),
            ("Sp F", "Sp G", 3), ("Sp B", "Sp G", 1), ("Sp D", "Sp D", 2)]
    # per-species transfer volume, accumulated the way the interface does: a
    # pair adds its count to BOTH endpoints, so a self-transfer counts twice for
    # its own species.
    weight = {n: 0 for n in names}
    for a, b, k in arcs:
        weight[a] += k
        weight[b] += k
    maxw = max(1, max(weight.values()))
    # the interface draws this view in a 340 px box with the nodes on a 112 px
    # ring, so a node radius in px maps onto this panel by rad/112; the arc
    # WIDTHS instead map by PRINT_FACTOR, because they are absolute print
    # weights (1 / 3 / 6 px of the interface's own step function).
    k_r = rad / 112.0 * s
    node_r = {n: st.network_node_radius(weight[n], maxw) * k_r for n in names}
    for i, (a, b, k) in enumerate(arcs):
        w = st.network_edge_units(k, s)
        if a == b:                               # self-transfer: an open ring
            x, y = P[a]
            t = math.radians(ang[names.index(a)])
            f.circle(x + 10 * k_r * math.cos(t), y - 10 * k_r * math.sin(t),
                     7 * k_r, fill="none", stroke=VIOLET, sw=w)
            continue
        x1, y1 = P[a]
        x2, y2 = P[b]
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        vx, vy = mx - cx, my - cy
        d = math.hypot(vx, vy) or 1.0
        bow = 0.11 * rad * (1.0 if i % 2 else -1.0)
        qx, qy = mx + vx / d * bow, my + vy / d * bow
        t1 = math.hypot(qx - x1, qy - y1) or 1.0
        t2 = math.hypot(qx - x2, qy - y2) or 1.0
        sx = x1 + (qx - x1) * ((node_r[a] + 2 * s) / t1)
        sy = y1 + (qy - y1) * ((node_r[a] + 2 * s) / t1)
        ex = x2 + (qx - x2) * ((node_r[b] + w / 2.0 + 6 * s) / t2)
        ey = y2 + (qy - y2) * ((node_r[b] + w / 2.0 + 6 * s) / t2)
        f.path("M %s,%s Q %s,%s %s,%s" % (r(sx), r(sy), r(qx), r(qy), r(ex), r(ey)),
               stroke=VIOLET, w=w, marker="url(#%s)" % marker)
    for n in names:                              # discs sit on top of the arcs
        x, y = P[n]
        f.circle(x, y, node_r[n], fill=BLUE, stroke="#FFFFFF", sw=1.2 * s)
    if labels:
        ls = label_size or F_SM + 1
        for n in names:
            x, y = P[n]
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            out = d + node_r[n] + 15 * s
            lx, ly = cx + dx / d * out, cy + dy / d * out
            anc = "middle" if abs(dx) < 0.35 * d else ("start" if dx > 0 else "end")
            f.ttext(lx + (9 * s if dx > 0.35 * d else (-9 * s if dx < -0.35 * d else 0)),
                    ly, n, size=ls, anchor=anc)
    f.net_weights = dict(weight)
    f.net_arcs = list(arcs)
    return P


# ============================================================ tube-map panel ==
# Fig. 1(a) draws one reconciled family inside three species tubes.  The
# species geometry and the gene-node list are declared ONCE below; the lane
# column is then COMPUTED from the edges that are actually drawn (see
# species_lanes()), never typed in.
TUBE_X, TUBE_W, TUBE_H = 150.0, 300.0, 92.0
TUBE_CY = {"Sp A": 146.0, "Sp B": 272.0, "Sp C": 398.0}
SPECIES_ORDER = ("Sp A", "Sp B", "Sp C")      # top to bottom, i.e. draw order
GENE_COL = {0: TUBE_X + 45.0, 1: TUBE_X + 150.0, 2: TUBE_X + 255.0}
LANE_OFF = 26.0                      # lateral offset per lane, in units
# the column heading is the interface's own label for this quantity
# (src/i18n.ts:430 copyHeatmap = "Overlapping copies (lanes) heatmap"); it is
# split over two lines to stay inside the column, so the joined text is checked
# against that label below.
LANE_HEADING = ("Overlapping copies", "(lanes)")
# name, species, depth column, y, glyph, parent (None = the family root)
GENE_NODES = [
    ("g0",  "Sp A", 0, 124.0, "spec",  None),
    ("gL",  "Sp A", 1, 152.0, "loss",  "g0"),
    ("gA",  "Sp A", 2, 170.0, "donor", "g0"),
    ("g1",  "Sp B", 0, 246.0, "donor", "g0"),
    ("gB",  "Sp B", 1, 268.0, "dup",   "g1"),
    ("gB1", "Sp B", 2, 300.0, "leaf",  "gB"),
    ("gB2", "Sp B", 2, 306.0, "leaf",  "gB"),
    ("gT",  "Sp B", 2, 312.0, "leaf",  "gA"),
    ("gC",  "Sp C", 1, 360.0, "dup",   "g1"),
    ("gC1", "Sp C", 2, 398.0, "leaf",  "gC"),
    ("gC2", "Sp C", 2, 420.0, "leaf",  "gC"),
]
# transfers: donor -> arrival (the arrival's species differs from its parent's)
GENE_TRANSFERS = [("gA", "gT"), ("g1", "gC")]
GENE_LABELS = ("g0", "gL", "gA", "g1", "gB", "gT", "gC")


def band_of(species):
    cy = TUBE_CY[species]
    return cy - TUBE_H / 2.0, cy + TUBE_H / 2.0


def species_lanes():
    """the lane column, computed from the edges this figure actually draws.

    For every gene node, the incoming edge's span inside its own species tube
    (from the parent's y when the parent shares the species, otherwise from the
    top of the tube - the same entry rule as assignLanes(),
    src/layout/geneEmbed.ts:110-142); the reported number is then the maximum
    number of those intervals that overlap at one depth, obtained by first-fit
    interval partitioning.  Returns ({species: lanes}, {name: lane}, intervals).
    """
    pos = {n: (c, y) for n, _s, c, y, _k, _p in GENE_NODES}
    sp_of = {n: s for n, s, _c, _y, _k, _p in GENE_NODES}
    per_species = {}
    for n, s, _c, y, _k, par in GENE_NODES:
        top, _bot = band_of(s)
        entry = pos[par][1] if par and sp_of[par] == s else top
        per_species.setdefault(s, []).append((n, min(entry, y), max(entry, y)))
    lanes, counts = {}, {}
    for s, rows in sorted(per_species.items()):
        ivs = [(a, b) for _n, a, b in rows]
        got, count = pack_lanes(ivs)
        # independent cross-check: the maximum number of intervals covering a
        # single depth (a sweep, not a packing) must equal the first-fit count.
        # Intervals are half-open at the far end, because the interface lets one
        # edge start exactly where its parent's ends without taking a new lane.
        depth_points = sorted({a for a, _b in ivs})
        sweep = max(sum(1 for a, b in ivs if a <= p < b) for p in depth_points)
        assert sweep == count, f"{s}: first-fit {count} != sweep overlap {sweep}"
        for (n, _a, _b), k in zip(rows, got):
            lanes[n] = k
        counts[s] = count
    return counts, lanes, per_species


def draw_gene_node(f, kind, x, y, s=1.0):
    if kind == "spec":
        f.spec(x, y, rad=R_SPEC * s)
    elif kind == "leaf":
        f.leaf(x, y, rad=R_LEAF * s)
    elif kind == "dup":
        f.dup(x, y, side=SQ_DUP * s)
    elif kind == "donor":
        f.donor(x, y, rad=R_DONOR * s)
    elif kind == "loss":
        f.loss(x, y, size=9.0 * s, w=3.0)
    else:
        raise ValueError("unknown gene glyph %r" % kind)


def tube_map(f, with_lanes=True):
    """species tubes + one reconciled family + the computed lane column.

    The tube shade, the number beside each tube and the lateral position of
    every gene copy all come out of species_lanes(), i.e. they are computed
    from the edges drawn here rather than typed in.  The shade is the
    interface's own relative ramp, `lerpHex(speciesFill, event.duplication,
    (lane-1)/(maxLane-1))` (Scene.tsx:391-399): the busiest species in the
    drawing carries the full duplication colour.  The same ramp is what the
    heat key in the legend then shows, so key and drawing cannot disagree.
    """
    counts, lanes, _per = species_lanes()
    max_lane = max(counts.values())
    f.heat_ramp = [TUBE_F] + [st.heat_shade(i, max_lane)
                              for i in range(1, max_lane + 1)]
    for name in SPECIES_ORDER:
        f.tube(TUBE_X, TUBE_CY[name], TUBE_W, TUBE_H,
               fill=f.heat_ramp[int(counts[name])] if with_lanes else TUBE_F)
        f.ttext(TUBE_X - 14, TUBE_CY[name], name, size=F_LB, anchor="end",
                style="italic")
    P = {}
    for n, sp, col, y, _k, _p in GENE_NODES:
        off = (lanes[n] - (counts[sp] - 1) / 2.0) * LANE_OFF
        P[n] = (GENE_COL[col] + off, y)
    sp_of = {n: s for n, s, _c, _y, _k, _p in GENE_NODES}
    for n, sp, _c, _y, _k, par in GENE_NODES:
        # a solid gene edge only inside one species; a cross-species descent is
        # the dashed transfer arc below, exactly as the interface separates them
        if par and sp_of[par] == sp:
            f.line(P[par][0], P[par][1], P[n][0], P[n][1])
    for donor, arr in GENE_TRANSFERS:
        x1, y1 = P[donor]
        x2, y2 = P[arr]
        f.path("M %s,%s C %s,%s %s,%s %s,%s" % (
            x1, y1 + R_DONOR, x1 - 20, y1 + 70, x2 + 60, y2 - 60, x2, y2 - R_LEAF),
            stroke=VIOLET, w=2.4, dash="9 6", marker="url(#arrV)")
    for n, _sp, _c, _y, k, _p in GENE_NODES:
        draw_gene_node(f, k, P[n][0], P[n][1])
    col_of = {n: c for n, _s, c, _y, _k, _p in GENE_NODES}
    for n in GENE_LABELS:
        # the leftmost column is labelled above its node: the species name
        # already owns the space to the left of the tube
        if col_of[n] == 0:
            f.lab(P[n][0], P[n][1] - R_LEAF - 12, n, size=F_LB, anchor="middle")
        else:
            f.lab(P[n][0] - 14, P[n][1], n, size=F_LB, anchor="end")
    if with_lanes:
        cx = TUBE_X + TUBE_W + 62.0
        # the two heading lines and the two footer lines are set on STACK_LEAD:
        # at the old 20-unit pitch the descenders of line 1 landed on the
        # ascenders of line 2 (ISSUE-020's overprint class)
        f.ttext(cx, 88, LANE_HEADING[0], size=F_SM, fill=MUT, anchor="middle")
        f.ttext(cx, 88 + STACK_LEAD, LANE_HEADING[1], size=F_SM, fill=MUT,
                anchor="middle")
        for name in SPECIES_ORDER:
            f.circle(cx, TUBE_CY[name], 27, fill=f.heat_ramp[int(counts[name])],
                     stroke=TUBE_S, sw=1.3)
            f.ttext(cx, TUBE_CY[name], str(counts[name]), size=F_LB,
                    weight="bold", anchor="middle")
        f.ttext(cx, 457, "incoming edges", size=F_SM, fill=MUT, anchor="middle")
        f.ttext(cx, 457 + STACK_LEAD, "overlapping at once", size=F_SM, fill=MUT,
                anchor="middle")
    f.lane_counts = dict(counts)
    f.lane_of = dict(lanes)
    return P, counts, lanes
_FONTS = {}
_FONT_FILES = ["/System/Library/Fonts/HelveticaNeue.ttc",
               "/System/Library/Fonts/Helvetica.ttc"]


def _pfont(size):
    """the face the SVG actually resolves to, cached per size"""
    key = round(size * 4)
    if key not in _FONTS:
        f = None
        try:
            from PIL import ImageFont
            for path in _FONT_FILES:
                try:
                    f = ImageFont.truetype(path, max(4, key))
                    break
                except OSError:
                    continue
        except ImportError:
            f = None
        _FONTS[key] = f
    return _FONTS[key]


def text_w(s, size):
    """advance width in user units, measured from the real font metrics"""
    f = _pfont(size)
    return f.getlength(s) / 4.0 if f else len(s) * size * 0.585


def tw_(s, size):
    return text_w(s, size)


SW_W = {"tube": 28, "edge": 28, "spec": 12, "leaf": 18, "dup": 16,
        "loss": 14, "donor": 16, "disagree": 18, "dotted": 26, "width": 96,
        "heat": 66, "node": 26, "ring": 26}


def _sw_tube(f, x, cy):
    f.rect(x, cy - 8, 28, 16, fill=TUBE_F, stroke=TUBE_S, sw=1.1, rx=8)
    return SW_W["tube"]


def _sw_edge(f, x, cy):
    f.line(x, cy, x + 28, cy, stroke=BLUE, w=W_EDGE)
    return SW_W["edge"]


def _sw_spec(f, x, cy):
    f.circle(x + 6, cy, 6, fill=BLUE)
    return SW_W["spec"]


def _sw_leaf(f, x, cy):
    f.circle(x + 9, cy, 9, fill=BLUE_D)
    return SW_W["leaf"]


def _sw_dup(f, x, cy):
    f.rect(x, cy - 8, 16, 16, fill=ORANGE, rx=2)
    return SW_W["dup"]


def _sw_loss(f, x, cy):
    f.line(x, cy - 7, x + 14, cy + 7, stroke=LOSS, w=3.6, cap="round")
    f.line(x, cy + 7, x + 14, cy - 7, stroke=LOSS, w=3.6, cap="round")
    return SW_W["loss"]


def _sw_donor(f, x, cy):
    f.circle(x + 8, cy, 8, fill="#FFFFFF", stroke=VIOLET, sw=2)
    return SW_W["donor"]


def _sw_disagree(f, x, cy):
    f.rect(x, cy - 9, 18, 18, fill=ORANGE_L, stroke=ORANGE, sw=1.5, rx=4.5,
           dash="5 3.5")
    return SW_W["disagree"]


def _sw_dotted(f, x, cy):
    f.line(x, cy, x + 26, cy, stroke=FAINT, w=1.6, dash="4 4", marker="url(#arrG)")
    return SW_W["dotted"]


def _sw_width(f, x, cy):
    """the three keyed arc widths: networkEdgeWidth(1|3|>=6) x PRINT_FACTOR"""
    for i, k in enumerate((1, 3, 6)):
        xx = x + i * 31
        w = st.network_edge_units(k)
        f.line(xx, cy - 8, xx + 25, cy - 8, stroke=VIOLET, w=w)
        f.ttext(xx + 12.5, cy + 13, "≥6" if k == 6 else str(k), size=F_XS,
                fill=INK2, anchor="middle")
    return SW_W["width"]


def _sw_heat(f, x, cy):
    """the copy-number key: the very shades the tubes in this figure carry"""
    ramp = getattr(f, "heat_ramp", None) or HEAT
    assert len(ramp) >= 4, "the heat key needs lanes 1..3 to exist in the drawing"
    for i in range(3):
        f.rect(x + i * 17, cy - 8, 15, 16, fill=ramp[i + 1], stroke=TUBE_S,
               sw=0.9, rx=3)
        f.ttext(x + i * 17 + 7.5, cy, str(i + 1), size=F_XS, anchor="middle",
                fill=INK2)
    return SW_W["heat"]


def _sw_node(f, x, cy):
    """a network node: a filled disc in the family colour, radius = transfers"""
    f.circle(x + 9, cy, 9, fill=BLUE, stroke="#FFFFFF", sw=1.2)
    f.circle(x + 22, cy, 4.5, fill=BLUE, stroke="#FFFFFF", sw=1.2)
    return SW_W["node"]


def _sw_ring(f, x, cy):
    """a self-transfer: an open ring beside its own node"""
    f.circle(x + 6, cy, 6, fill=BLUE, stroke="#FFFFFF", sw=1.2)
    f.circle(x + 19, cy, 7, fill="none", stroke=VIOLET, sw=2.2)
    return SW_W["ring"]


def legend_w(items, gap=26.0, size=F_SM, sgap=9.0):
    """width a legend row would occupy, so it can be right-aligned"""
    total = 0.0
    for kind, label in items:
        if kind == "txt":
            total += text_w(label, size) + gap
        else:
            total += SW_W[kind] + (sgap + text_w(label, size) if label
                                   else 0) + gap
    return total - gap


def legend_center_block(f, y0, rows, rule=True, gap=26.0, dy=38.0):
    """every legend row centred on the canvas; the rule brackets the widest one"""
    ws = [legend_w(r, gap) for r in rows]
    if rule:
        f.line((UW - max(ws)) / 2.0, y0 - 28, (UW + max(ws)) / 2.0, y0 - 28,
               stroke=HAIR, w=1.1)
    for i, r in enumerate(rows):
        legend(f, 0, y0 + i * dy, r, gap=gap, center=True)
    return max(ws)


def legend_rule(f, y, full=True, x1=None, x2=None):
    f.line(ML if full else x1, y, (UW - ML) if full else x2, y,
           stroke=HAIR, w=1.1)


def legend_split(f, y, left, right=None, gap=26.0):
    """glyph key justified left, caveat note justified right on the same line"""
    legend(f, ML, y, left, gap=gap)
    if right:
        legend(f, UW - ML - legend_w(right, gap) - 4, y, right, gap=gap)


def legend(f, x, y, items, gap=24.0, size=F_SM, sgap=9.0, center=False):
    if center:
        x = (UW - legend_w(items, gap, size)) / 2.0
    x0 = x
    f.keys.append(dict(y=y, x=x0, center=center,
                       items=[lab for _k, lab in items if lab],
                       kinds=[k for k, _l in items]))
    for kind, label in items:
        if kind == "txt":
            f.ttext(x, y, label, size=size, fill=INK2)
            x += tw_(label, size) + gap
            continue
        fn = {"tube": _sw_tube, "edge": _sw_edge, "spec": _sw_spec, "leaf": _sw_leaf,
              "dup": _sw_dup, "loss": _sw_loss, "donor": _sw_donor,
              "disagree": _sw_disagree, "dotted": _sw_dotted,
              "width": _sw_width, "heat": _sw_heat, "node": _sw_node,
              "ring": _sw_ring}[kind]
        w = fn(f, x, y)
        if label:
            f.ttext(x + w + sgap, y, label, size=size, fill=INK2)
            x += w + sgap + tw_(label, size)
        else:
            x += w
        x += gap
    return max(x - gap, x0)


def legend_block(f, y0, rows, rule=True, gap=22.0):
    """stack legend rows and draw a rule that brackets their real width"""
    ends = []
    for i, items in enumerate(rows):
        ends.append(legend(f, ML, y0 + i * 38, items, gap=gap))
    top = y0 - 38 + 14
    if rule:
        f.line(ML, top, max(ends), top, stroke=HAIR, w=1.1)
    return max(ends)


# ============================================================== alt text ====
def overlap_report(f, name, tol_pt=0.5, strict=True):
    """list pairs of drawn text whose boxes overlap (the F-04-10 gate).

    The box is the one the carrier will report: the font box PyMuPDF returns for
    the span (Helvetica Neue reserves 0.952 em above the baseline and 0.213 em
    below it, 1.165 em in all), the width being the sum of the real advances.
    This is the figure-side mirror of check_figures.py's overlap assert and uses
    the same rectangle, so a pair the carrier would fail is named here before
    any carrier exists -- an earlier version measured only the cap band and
    therefore saw none of the stacked labels it was written to catch.

    A haloed label (lab()) is ONE label: the under-stroke and the fill share a
    box by construction, and only the first is recorded, so no dedupe is needed
    on this side.
    """
    boxes = []
    for t in f.texts:
        s = t["s"]
        if not s.strip():
            continue
        size = t["size"]
        w = text_w(s, size)
        x, y = t["x"], t["y"]
        if t["anchor"] == "middle":
            x0 = x - w / 2.0
        elif t["anchor"] == "end":
            x0 = x - w
        else:
            x0 = x
        asc, desc = 0.952 * size, 0.213 * size
        boxes.append((x0, y - asc, x0 + w, y + desc, s))
    tol_pt_u = tol_pt / PT_PER_UNIT
    hits = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            ox = min(a[2], b[2]) - max(a[0], b[0])
            oy = min(a[3], b[3]) - max(a[1], b[1])
            if ox > tol_pt_u and oy > tol_pt_u and ox * oy * PT_PER_UNIT ** 2 > 1.0:
                hits.append((a[4], b[4], ox * PT_PER_UNIT, oy * PT_PER_UNIT))
    if hits:
        print("  !! %s text overlaps (%d pair(s), >1 pt^2 of font box):"
              % (name, len(hits)))
        for s1, s2, ox, oy in sorted(hits, reverse=True):
            print("       %r x %r  overlap %.2f x %.2f pt" % (s1, s2, ox, oy))
        if strict:
            raise SystemExit("%s: %d drawn-text pair(s) share a box; fix the "
                             "layout before exporting carriers" % (name, len(hits)))
    else:
        print("     [ok ] %s: no two drawn-text boxes overlap" % name)
    return hits


def alt_skeleton(f):
    """a machine-generated description of what this figure ACTUALLY draws.

    The manuscript's alt text was hand-copied from the pictures and lost,
    reordered and invented entries as a result (ISSUE-006/007).  Everything here
    is read back out of the draw-order record the Fig object kept while it was
    emitting SVG, so the docx can quote the figure truthfully: species rows in
    draw order, glyph-key items in draw order, the badge string, the panel
    headings and the position of the symbol key.
    """
    L = []
    A = L.append
    italic, nodes = [], []
    for t in f.texts:
        s = t["s"]
        if t["style"] == "italic" and s not in italic:
            italic.append(s)
        if re.fullmatch(r"g[0-9A-Za-z]+", s) and s not in nodes:
            nodes.append(s)
    A("### %s (`%s`)" % (f.name, os.path.basename(f.path_out or "")))
    A("- canvas: %.1f x %.1f mm (1440 x %g units); smallest drawn type %.2f pt; "
      "text ink nearest the page edge %.2f pt (module inner margin %.2f pt)"
      % (PRINT_MM, f.h * K, f.h, pt(F_SM),
         (min(f.clear)[0] * PT_PER_UNIT) if f.clear else float("nan"),
         st.PAGE_MARGIN_IN * 72.0))
    A("- panel headings, in draw order:")
    for hd in f.heads:
        A("    - (%s) %s%s" % (hd["letter"], hd["title"],
                               (" — " + hd["subtitle"]) if hd["subtitle"] else ""))
    if italic:
        A("- species / tube labels, in draw order (top to bottom): %s"
          % ", ".join(italic))
        # the same labels also grouped by the run they were drawn in, so an
        # alt-text sentence about one panel's rows cannot borrow another's
        runs, cur, last_y = [], [], None
        for t in f.texts:
            if t["style"] != "italic":
                continue
            if last_y is not None and t["y"] < last_y:
                if cur:
                    runs.append(cur)
                cur = []
            if t["s"] not in cur:
                cur.append(t["s"])
            last_y = t["y"]
        if cur:
            runs.append(cur)
        for i, run in enumerate(runs):
            A("    - row group %d (%d rows): %s" % (i + 1, len(run), ", ".join(run)))
    if nodes:
        A("- gene-node labels, in draw order: %s" % ", ".join(nodes))
    if f.badges:
        A("- badge string exactly as drawn: %s"
          % " / ".join('"%s"' % b for b in f.badges))
    if f.lane_counts:
        A("- %s column, COMPUTED by first-fit interval partitioning of the "
          "incoming edges drawn in this panel: %s"
          % (UI_LANE_LABEL, ", ".join("%s=%d" % (k, v)
                                      for k, v in sorted(f.lane_counts.items()))))
    if f.net_weights:
        A("- transfer network: %d species discs filled with %s (the "
          "speciation/family token), radius = total transfers of that species "
          "(interface `nodeR = 4 + 8*weight/maxWeight`): %s"
          % (len(f.net_weights), st.APP_GENE,
             ", ".join("%s=%d" % (k, v) for k, v in sorted(f.net_weights.items()))))
        selfs = ["%s→%s: %d" % (a, b, k) for a, b, k in f.net_arcs if a == b]
        A("  - arcs are stroked in %s (theme.event.transferBack) with the "
          "interface step function `1 + min(5, max(0, round(k)-1))` times the "
          "print factor %s: 1 transfer = %.1f, 3 = %.1f, >=6 = %.1f units"
          % (st.APP_DONOR, st.PRINT_FACTOR, st.network_edge_units(1),
             st.network_edge_units(3), st.network_edge_units(6)))
        A("  - self-transfer ring(s) drawn: %s" % (", ".join(selfs) or "none"))
    if f.keys:
        A("- symbol key / glyph key, in draw order (position as drawn):")
        for i, row in enumerate(sorted(f.keys, key=lambda r: r["y"])):
            where = "centred on the canvas" if row["center"] else "left-aligned"
            vert = ("upper third" if row["y"] < f.h / 3.0 else
                    ("lower third" if row["y"] > 2.0 * f.h / 3.0 else "middle"))
            A("    - row %d: %s; %d item(s); y = %g units (%.1f mm from the top, "
              "%s of the canvas), %s"
              % (i + 1, " | ".join(row["items"]) or "(swatches only)",
                 len(row["items"]), row["y"], row["y"] * K, vert, where))
    for n in f.notes:
        A("- note: %s" % n)
    return "\n".join(L)


def emit_alt(f):
    """print the skeleton and keep it for the combined `figures/_build/` report."""
    txt = alt_skeleton(f)
    print(txt)
    try:
        out_path = st.confine_to_repo(os.path.join(ALT_DIR, f.name + ".md"))
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(txt + "\n")
    except OSError as exc:                 # never fail a figure over a report
        print("  (alt-text report not written: %s)" % exc)
    ALT_BLOCKS.append(txt)
    return txt


ALT_DIR = os.environ.get("PR_ALT_DIR") or os.path.join(SCRIPT_DIR, "_build", "alt_text")
ALT_BLOCKS = []

# The combined report also goes to the shared file where 附图1.py writes its own
# section of it.  Each script replaces only its own delimited block, so the two
# may run in either order and neither clobbers the other.  The default target is
# `figures/_build/alt_text_skeletons.md`, i.e. inside the repository: the audit
# track's working directory is NOT a build dependency (ISSUE-062).  PR_ALT_MD
# overrides the path, and both writers are guarded — an absent or unwritable
# report directory costs the report, never the figure.
ALT_MD = os.environ.get("PR_ALT_MD") or os.path.join(
    os.path.normpath(os.path.join(SCRIPT_DIR, "_build")), "alt_text_skeletons.md")
ALT_SECTION = "main-figures-1-3-4-5-6"


def merge_alt_md(md_path, section, body):
    """splice this script's section into the shared alt-text report."""
    md_path = st.confine_to_repo(md_path)
    begin, finish = "<!-- BEGIN %s -->" % section, "<!-- END %s -->" % section
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


# ==================================================================== Fig 1 ==
def fig1():
    H = 1140.0
    f = Fig(H, "图1")
    f.marker("arrG", FAINT, 9, 7)
    f.marker("arrV", VIOLET, 12, 9)
    f.marker("arrP", PINK, 10, 8)
    f.marker("arrVs", VIOLET, 9, 6.5)

    # ---------------------------------------------------------- (a) tube map
    ax = ML
    # The top-row headers sit 8 units higher than they used to: panel (a)'s
    # subtitle and the 'g0' label above the family root shared 2.8 pt of font
    # box (ISSUE-020's overprint class), and the subtitle cannot move up on its
    # own without meeting the panel title it belongs to.
    f.header(ax, 38, "a", "Tube-map embedding",
             "one gene family in its species tree")
    # the lane column, the tube shading and the copy offsets are all the output
    # of the interval partitioning below - nothing in this panel is typed in
    _P, counts, _lanes = tube_map(f)
    assert " ".join(LANE_HEADING) == UI_LANE_LABEL, LANE_HEADING
    assert max(counts.values()) > min(counts.values()), \
        "lane column collapsed to a constant: %s" % counts
    assert sum(counts.values()) > len(counts), \
        "no species carries overlapping copies: %s" % counts

    # ------------------------------------------------------- (b) three levels
    bx = 620
    f.header(bx, 38, "b", "Three-level nesting")
    up = [138, 198, 258]
    lo = [356, 416, 476]
    f.ttext(bx, 98, "gene tree -> symbiont tree", size=F_LB, weight="bold", fill=INK2)
    f.ttext(bx, 318, "symbiont tree -> host tree", size=F_LB, weight="bold", fill=INK2)
    SXT, SW, SH = 700, 540, 52
    for cy, n in zip(up, ("Sroot", "S_A", "S_B")):
        f.tube(SXT, cy, SW, SH)
        f.ttext(SXT - 12, cy, n, size=F_LB, anchor="end", style="italic")
    for cy, n in zip(lo, ("Hroot", "H1", "H2")):
        f.tube(SXT, cy, SW, SH)
        f.ttext(SXT - 12, cy, n, size=F_LB, anchor="end", style="italic")
    u0, uA = (760, 138), (1100, 198)
    u1, u2, u3 = (1200, 184), (1200, 212), (1200, 258)
    for a, b in ((u0, uA), (uA, u1), (uA, u2), (u0, u3)):
        f.line(a[0], a[1], b[0], b[1])
    f.spec(*u0, rad=7.5)
    f.dup(*uA)
    for n in (u1, u2, u3):
        f.leaf(*n, rad=9.5)
    l0, lA, lB = (760, 356), (1100, 416), (1180, 476)
    f.line(l0[0], l0[1], lA[0], lA[1])
    f.line(l0[0], l0[1], lB[0], lB[1])
    f.spec(*l0, rad=7.5)
    f.leaf(*lA, rad=9.5)
    f.leaf(*lB, rad=9.5)
    f.ttext(760, 378, "Sroot", size=F_SM + 1, anchor="middle")
    f.ttext(1114, 416, "S_A", size=F_SM + 1)
    f.ttext(1194, 476, "S_B", size=F_SM + 1)
    rail = 1276
    f.line(rail, up[0], rail, lo[2], stroke=FAINT, w=1.4, dash="4 4")
    for a, b in zip(up, lo):
        f.line(SXT + SW, a, rail, a, stroke=FAINT, w=1.4, dash="4 4")
        f.line(rail, b, SXT + SW + 7, b, stroke=FAINT, w=1.4, dash="4 4",
               marker="url(#arrG)")
        f.circle(rail, a, 2.4, fill=FAINT)
    f.ttext(rail + 6, 112, "maps to", size=F_SM, fill=MUT)

    # --------------------------------------------------- (c) compare + network
    f.header(ML, 520, "c", "Event-level comparison and transfer network",
             "the same family reconciled twice, and the HGT summary drawn "
             "beside it")
    right = compare_pair(f, ML, 680, pitch=38.0, badge_w=278.0)
    f.line(right + 34, 592, right + 34, 920, stroke=HAIR, w=1.1)
    ncx, ncy = 1148, 812
    f.ttext(ncx, 594, "Transfer network", size=F_LB, weight="bold", anchor="middle")
    # the caption cross-references this thumbnail as "Fig. 4(b)", so the on-screen
    # subtitle now carries the same figure number rather than a figure-less phrase
    f.ttext(ncx, 594 + STACK_LEAD, "thumbnail · full view in Fig. 4(b)",
            size=F_SM, fill=MUT, anchor="middle")
    transfer_network(f, ncx, ncy, 116, scale=0.86, marker="arrVs",
                     label_size=F_SM)
    f.notes.append("Panel (c) transfer-network subtitle: %r"
                   % "thumbnail · full view in Fig. 4(b)")

    # --------------------------------------------------------------- legend
    legend_center_block(f, 1010, [
        [("tube", "Species tube"), ("edge", "Gene-tree edge"),
         ("spec", "Speciation"), ("leaf", "Leaf"), ("dup", "Duplication"),
         ("loss", "Loss"), ("donor", "Transfer donor")],
        [("disagree", "Disagreeing node"), ("dotted", "Maps to"),
         ("heat", UI_LANE_LABEL)],
        [("node", "Network species · radius = transfers"),
         ("ring", "Self-transfer"), ("width", None),
         ("txt", "edge · 1 / 3 / ≥6 transfers")]])
    f.save("PhyloRecViewer-手稿正文-图1.svg")
    return f



# ==================================================================== Fig 3 ==
def fig3():
    """Three-level nesting, drawn as two levels side by side (as the nested
    mode renders them) so the correspondence runs left to right."""
    f = Fig(424.0, "图3")
    f.marker("arrG", FAINT, 10, 8)
    TXA, TXB, TW, TH = 190, 900, 440, 54
    rows = [136, 222, 308]
    f.header(ML, 38, "a", "Gene tree -> symbiont tree",
             "five-node family · gA duplicates, both copies kept in S_A")
    f.header(800, 38, "b", "Symbiont tree -> host tree",
             "each symbiont species is itself a gene node one level up")
    # ------------------------------------------------------------- (a) level 1
    for cy, n in zip(rows, ("Sroot", "S_A", "S_B")):
        f.tube(TXA, cy, TW, TH)
        f.ttext(TXA - 12, cy, n, size=F_LB, anchor="end", style="italic")
    g0, gA = (235, 136), (320, 222)
    # the two duplicate copies sit STACK_LEAD+2 apart, not 28: their labels are
    # set on the labels' own pitch (F_SM + 2 = 25 units), which reserves a
    # 29.1-unit box, so at a 28-unit pitch the two labels shared a strip of box
    # (9.85 pt^2 measured on the delivered span rectangles)
    a1, a2, b1 = (560, 206), (560, 238), (560, 308)
    for q, w in ((g0, gA), (gA, a1), (gA, a2), (g0, b1)):
        f.line(q[0], q[1], w[0], w[1])
    f.spec(*g0, rad=7.5)
    f.dup(*gA, side=17)
    for n in (a1, a2, b1):
        f.leaf(*n, rad=8.5)
    f.lab(235, 118, "g0", size=F_SM + 2, anchor="middle")
    f.lab(320, 204, "gA", size=F_SM + 2, anchor="middle")
    for (x, y), n in ((a1, "geneA1"), (a2, "geneA2"), (b1, "geneB")):
        f.lab(x - 12, y, n, size=F_SM + 2, anchor="end")
    f.line(594, 206, 594, 238, stroke=MUT, w=1.3)
    f.line(589, 206, 599, 206, stroke=MUT, w=1.3)
    f.line(589, 238, 599, 238, stroke=MUT, w=1.3)
    f.ttext(612, 222, "×2", size=F_SM, fill=MUT, anchor="middle")
    # ------------------------------------------------------------- (b) level 2
    for cy, n in zip(rows, ("Hroot", "H1", "H2")):
        f.tube(TXB, cy, TW, TH)
        f.ttext(TXB + TW + 12, cy, n, size=F_LB, style="italic")
    s0, sA, sB = (950, 136), (1180, 222), (1230, 308)
    f.line(s0[0], s0[1], sA[0], sA[1])
    f.line(s0[0], s0[1], sB[0], sB[1])
    f.spec(*s0, rad=7.5)
    f.leaf(*sA, rad=8.5)
    f.leaf(*sB, rad=8.5)
    f.lab(962, 136, "Sroot", size=F_SM + 2)
    f.lab(1192, 222, "S_A", size=F_SM + 2)
    f.lab(1242, 308, "S_B", size=F_SM + 2)
    # ----------------------------------------------------------- correspondence
    f.ttext(773, 100, "one level up", size=F_SM, fill=MUT, anchor="middle")
    for cy in rows:
        f.line(TXA + TW + 14, cy, TXB - 10, cy, stroke=FAINT, w=1.5, dash="5 4.5",
               marker="url(#arrG)")
    legend_center_block(f, 380, [
        [("tube", "Species tube"), ("edge", "Gene-tree edge"),
         ("spec", "Speciation"), ("dup", "Duplication"), ("leaf", "Leaf"),
         ("dotted", "Symbiont -> host link"),
         ("txt", "Uniform tubes · no transfers")]], gap=18.0)
    f.save("PhyloRecViewer-手稿正文-图3.svg")
    return f


# ==================================================================== Fig 4 ==
def fig4():
    f = Fig(700.0, "图4")
    f.marker("arrG", FAINT, 9, 7)
    f.marker("arrV", VIOLET, 13, 10)
    f.header(ML, 38, "a", "Event-level comparison",
             "the same seven-node family reconciled twice; g1 and g2 flip "
             "their event call")
    right = compare_pair(f, ML, 190, pitch=48.0, badge_w=300.0)
    f.line(right + 36, 108, right + 36, 500, stroke=HAIR, w=1.1)
    f.header(880, 38, "b", "Transfer network",
             "edge width and node radius count transfers")
    # the view is centered on its own half of the page: 8 discs whose radius
    # encodes the species' transfer volume, 12 arcs of which one is a
    # self-transfer ring, all in the interface's own encodings
    transfer_network(f, 1122, 306, 170, scale=1.0, marker="arrV")
    legend_center_block(f, 580, [
        [("tube", "Species tube"), ("edge", "Gene-tree edge"),
         ("spec", "Speciation"), ("leaf", "Leaf"), ("dup", "Duplication"),
         ("disagree", "Disagreeing node")],
        [("node", "Network species · radius = transfers"),
         ("ring", "Self-transfer"), ("width", None),
         ("txt", "edge · 1 / 3 / ≥6 transfers")]])
    f.save("PhyloRecViewer-手稿正文-图4.svg")
    return f


# ==================================================================== Fig 5 ==
def box(f, x, y, w, h, title, sub, color, ts=20.0, ss=18.0):
    """a titled card; a two-line card respects the font-box leading floor.

    A title and its subtitle are laid out STACK_LEAD apart, not 24 units apart:
    23-unit type reserves 26.8 units of box (0.952 em of ascent plus 0.213 em of
    descent, the rectangle the PDF reports for the span), so at a 24-unit pitch
    every card in Fig. 5 shared a strip of box with its own subtitle -- the
    overprint class check_figures.py now measures.  The pair is centred on the
    card's own ink (cap top of the title to descender bottom of the subtitle),
    not on the mid-point of the baselines.
    """
    f.rect(x, y, w, h, fill="#FFFFFF", stroke=color, sw=1.5, rx=10)
    if sub:
        f.ttext(x + w / 2.0, y + h / 2.0 - (STACK_LEAD / 2.0 + 2.3), title,
                size=ts, weight="bold", anchor="middle")
        f.ttext(x + w / 2.0, y + h / 2.0 + (STACK_LEAD / 2.0 - 2.3), sub, size=ss,
                fill=MUT, anchor="middle")
    else:
        f.ttext(x + w / 2.0, y + h / 2.0, title, size=ts, weight="bold",
                anchor="middle")


def lane(f, x, w, label, color, tint, y0=100.0, y1=580.0):
    f.rect(x, y0, w, y1 - y0, fill=tint, stroke=None, rx=12)
    f.rect(x, y0, w, 4.5, fill=color, stroke=None, rx=2)
    # 22 units above the lane, not 16: the first card in a lane now carries a
    # two-line title, and the lane heading has to keep a whole font box clear of
    # the card title's box (the gap the carrier measures is wider than the
    # ascender+descender sum the source model uses, so it is not cut fine)
    f.ttext(x + 2, y0 - 22, label, size=F_SM, weight="bold", fill=color)


def fig5():
    f = Fig(800.0, "图5")
    # ---- Fig 5 lane identity colours: the light theme's Okabe-Ito family ----
    # (src/render/theme.ts:37-46 OKABE_ITO), each shown as a pale tint of the
    # same hue.  The article states "box tints are derived from the light theme's
    # Okabe-Ito family colours"; these six hues ARE members of that set, so the
    # figure now matches that sentence.  This is Fig 5's organisational palette
    # only; the app's event-glyph colours (orange duplication etc) used in
    # Figs 1/3/4/6 are the app's own tokens and are unchanged.
    C_INPUT = "#0072B2"; T_INPUT = "#EAF3FB"   # OKABE_ITO[0] blue
    C_MODEL = "#E69F00"; T_MODEL = "#FBF1DA"   # OKABE_ITO[3] orange
    C_COMP  = "#D55E00"; T_COMP  = "#FBE9DE"   # OKABE_ITO[1] vermillion
    C_OUT   = "#009E73"; T_OUT   = "#E4F3EC"   # OKABE_ITO[2] bluish green
    C_STORE = "#CC79A7"; T_STORE = "#F6E7EF"   # OKABE_ITO[4] reddish purple
    C_TAURI = "#000000"; T_TAURI = "#EDEEF0"   # OKABE_ITO[7] black
    f.marker("arrS", C_TAURI, 10, 8)
    f.marker("arrP", C_STORE, 10, 8)
    f.marker("arrO", C_COMP, 10, 8)
    f.marker("arrB", C_INPUT, 10, 8)
    f.marker("arrGn", C_OUT, 10, 8)
    f.marker("arrM", C_MODEL, 10, 8)
    f.text(ML, 44, "System architecture and data flow", size=F_PT, weight="bold")
    # ------------------------------------------------------------------ lanes
    lane(f, 24, 262, "Input layer", C_INPUT, T_INPUT)
    lane(f, 480, 200, "Normalized model", C_MODEL, T_MODEL)
    lane(f, 698, 400, "Computation layer", C_COMP, T_COMP)
    lane(f, 1116, 300, "Output layer", C_OUT, T_OUT)
    for i, (t, s) in enumerate((("recPhyloXML file", ".recphyloxml"),
                               ("NHX / Newick file", ".nhx · .nwk"),
                               ("Drag & drop", "one or more files"),
                               ("File association", "double-click"))):
        cy = 196 + i * 88
        box(f, 40, cy - 40, 230, 80, t, s, C_INPUT)
        f.path("M 270,%s H 296" % cy, stroke=C_INPUT, w=1.5)
    f.line(296, 196, 296, 460, stroke=C_INPUT, w=1.5)
    f.line(296, 328, 304, 328, stroke=C_INPUT, w=2.2, marker="url(#arrB)")
    # parser chip sits on the flow arrow between the input and model lanes
    box(f, 312, 268, 150, 120, "Parser module", None, C_INPUT, ts=18.0)
    f.ttext(387, 358, "detectFormat()", size=F_SM, fill=MUT, anchor="middle")
    f.line(462, 328, 490, 328, stroke=C_MODEL, w=2.2, marker="url(#arrM)")
    # ------------------------------------------------------- normalized model
    f.rect(496, 246, 168, 164, fill="#FFFFFF", stroke=C_MODEL, sw=1.5, rx=10)
    f.ttext(580, 262, "Reconciliation", size=F_LB, weight="bold", anchor="middle")
    f.ttext(580, 292, "one SpeciesTree", size=F_SM, fill=MUT, anchor="middle")
    f.ttext(580, 322, "+ GeneTree[ ]", size=F_SM, fill=MUT, anchor="middle")
    f.rect(508, 332, 144, 62, fill="#FFFFFF", stroke=C_MODEL, sw=1.2, rx=8)
    f.ttext(580, 353, "warnings[ ]", size=F_SM, weight="bold", anchor="middle",
            fill=INK2)
    f.ttext(580, 383, "structured", size=F_SM, fill=MUT, anchor="middle")
    f.path("M 664,270 H 688 V 128 H 706", stroke=C_MODEL, w=2.4,
           marker="url(#arrO)")
    # ------------------------------------------------------- computation lane
    comp = (("Layout engine", "six-pass · acyclic", 128),
            ("Crossing optimizer", "greedy mirror search", 224),
            ("Positions map", "x · y · lane", 320),
            ("Renderer", "pure SVG layers", 416),
            ("Analysis", "stats · compare · focus", 512))
    for t, s, cy in comp:
        box(f, 714, cy - 32, 368, 64, t, s, C_COMP)
    # feeds / swaps back live in the 32-unit gap between the first two boxes,
    # pinned either side of their own arrow so the two labels cannot meet:
    # "feeds" ends left of the down arrow (x 790), "swaps back" starts right of
    # the up arrow (x 980) (F-04-10).
    f.line(790, 160, 790, 192, stroke=C_COMP, w=1.8, marker="url(#arrO)")
    f.line(980, 192, 980, 160, stroke=C_COMP, w=1.8, marker="url(#arrO)")
    f.ttext(782, 176, "feeds", size=F_SM, fill=MUT, anchor="end")
    f.ttext(988, 176, "swaps back", size=F_SM, fill=MUT, anchor="start")
    # the three spine labels sit in the vertical gap between successive boxes,
    # centred in that gap (y = box bottom + 16) and clear of both box borders
    # (F-04-10): they no longer print on the box top edge.
    for y1, lab in ((256, "orders"), (352, "reads"), (448, "scene + model")):
        f.line(790, y1, 790, y1 + 32, stroke=C_COMP, w=1.8, marker="url(#arrO)")
        f.ttext(798, y1 + 16, lab, size=F_SM, fill=MUT)
    # ------------------------------------------------------------ output lane
    # the application's own export set: SVG scene, PNG, PDF, self-contained
    # interactive HTML, a CSV statistics export (src/analysis/stats.ts:240,
    # src/app/RightPanel.tsx:507-544), reverse NHX and the session file, which
    # the interface writes as `<name>.rpvsession.json` (src/app/MenuBar.tsx:261)
    outs = (("SVG", "vector scene graph"), ("PNG", "rasterized at print dpi"),
            ("PDF", "vector · raster fallback"), ("Interactive HTML", "viewer"),
            ("CSV statistics", "per-family · matrix · density"),
            ("NHX reverse export", "reconciliation to NHX"),
            ("Session file", ".rpvsession.json"))
    out_pitch = 68.0
    for i, (t, s) in enumerate(outs):
        box(f, 1128, 101 + i * out_pitch, 276, 64, t, s, C_OUT)
    f.path("M 1082,416 H 1107", stroke=C_OUT, w=2.0)
    f.line(1107, 133, 1107, 133 + (len(outs) - 1) * out_pitch, stroke=C_OUT, w=2.0)
    for i in range(len(outs)):
        f.line(1107, 133 + i * out_pitch, 1124, 133 + i * out_pitch,
               stroke=C_OUT, w=2.0, marker="url(#arrGn)")
    # ------------------------------------------------------- cross-cutting bars
    f.rect(698, 612, 400, 60, fill=T_STORE, stroke=C_STORE, sw=1.4, rx=10)
    f.ttext(898, 625, "State store · Zustand", size=F_SM, weight="bold",
            anchor="middle")
    f.ttext(898, 655, "undo / redo · depth 100", size=F_SM, fill=MUT,
            anchor="middle")
    f.line(780, 612, 780, 584, stroke=C_STORE, w=1.6, dash="6 4.5",
           marker="url(#arrP)")
    f.line(1020, 584, 1020, 612, stroke=C_STORE, w=1.6, dash="6 4.5",
           marker="url(#arrP)")
    f.ttext(768, 598, "publishes", size=F_SM, fill=MUT, anchor="end")
    f.ttext(1032, 598, "drives", size=F_SM, fill=MUT)
    f.rect(24, 700, 1392, 56, fill=T_TAURI, stroke=C_TAURI, sw=1.4, rx=10)
    f.ttext(ML + 16, 728, "Tauri v2 desktop shell · Rust backend", size=F_SM,
            weight="bold")
    # no unmeasured performance claim in the artwork: the interface supplies the
    # dialogs and the file association, the binary is native per platform, and
    # installer size / memory footprint are not measured anywhere in the article
    f.ttext(UW - ML - 16, 728, "native open / save dialogs · OS file "
            "association · native binary per platform", size=F_SM, fill=MUT,
            anchor="end")
    for x, lab in ((155, "open · double-click"), (1262, "save dialogs")):
        f.line(x, 700, x, 584, stroke=C_TAURI, w=1.6, dash="6 4.5",
               marker="url(#arrS)")
        f.ttext(x + 12, 646, lab, size=F_SM, fill=MUT)
    f.save("PhyloRecViewer-手稿正文-图5.svg")
    return f


# ==================================================================== Fig 6 ==
PROV = {"Root": 250, "A": 175, "B": 320, "C": 105, "D": 245, "E": 295, "F": 345}
FINAL = {"Root": 225, "A": 115, "B": 335, "C": 60, "D": 170, "E": 280, "F": 390}
LINKS = (("Root", "A", 1), ("Root", "B", 1), ("A", "C", 2), ("A", "D", 2),
         ("B", "E", 2), ("B", "F", 2))
LVL = {"Root": 0, "A": 1, "B": 1, "C": 2, "D": 2, "E": 2, "F": 2}
STUB = 64.0        # leaf tube length: keeps the capsule reading as a tube
TW_T = 44.0
R_LEAF6 = 8.5
LANE = 11.0


def toy_species(f, ox, oy, xs, ghost=False):
    L = [oy, oy + 100, oy + 200]
    if ghost:
        fill, stroke, sw, dash = "none", "none", 0.0, None
    else:
        fill, stroke, sw, dash = TUBE_F, TUBE_S, 1.3, None
    if not ghost:
        for p, c, lvl in LINKS:
            f.line(ox + xs[p], L[lvl], ox + xs[c], L[lvl], stroke=stroke, w=2.4)
    spans = {"Root": (L[0], L[1]), "A": (L[1], L[2]), "B": (L[1], L[2])}
    for n in ("C", "D", "E", "F"):
        spans[n] = (L[2], L[2] + STUB)
    for n, (y0, y1) in spans.items():
        if ghost:                       # previous position: dashed centre axis
            f.line(ox + xs[n], y0, ox + xs[n], y1, stroke="#BFC6D0", w=1.5,
                   dash="6 5")
            f.line(ox + xs[n] - 9, y0, ox + xs[n] + 9, y0, stroke="#BFC6D0", w=1.5)
            f.line(ox + xs[n] - 9, y1, ox + xs[n] + 9, y1, stroke="#BFC6D0", w=1.5)
            continue
        f.rect(ox + xs[n] - TW_T / 2.0, y0, TW_T, y1 - y0, fill=fill,
               stroke=stroke, sw=sw, rx=TW_T / 2.0, dash=dash)
    return L


def toy_species_labels(f, ox, L, xs):
    """species names: italic, same grammar as Figs 1/3/4"""
    for n, x in xs.items():
        y = L[LVL[n]] - 17 if LVL[n] < 2 else L[2] + STUB + 22
        f.lab(ox + x, y, n, size=F_LB, anchor="middle", style="italic")


def toy_gene(f, ox, L, xs, transfer=False, glabels=()):
    g0 = (ox + xs["Root"], L[0] + 26)
    gA1 = (ox + xs["A"], L[1] + 20)
    gA2 = (ox + xs["A"] - 16, L[1] + 58)
    gL = (ox + xs["A"] + 34, L[1] + 52)
    gC1 = (ox + xs["C"] - LANE, L[2] + 32)
    gC2 = (ox + xs["C"] + LANE, L[2] + 32)
    gB = (ox + xs["B"], L[1] + 20)
    gE = (ox + xs["E"], L[2] + 32)
    gF = (ox + xs["F"], L[2] + 22)
    gD = (ox + xs["D"], L[2] + 32)
    for q, w in ((g0, gA1), (g0, gB), (gA1, gA2), (gA1, gL), (gA2, gC1),
                 (gA2, gC2), (gB, gE), (gB, gF)):
        f.line(q[0], q[1], w[0], w[1], stroke=BLUE, w=W_EDGE)
    f.loss(gL[0], gL[1], size=8.5, w=2.8)
    f.spec(*g0, rad=6.5)
    f.spec(*gA1, rad=6.5)
    f.spec(*gB, rad=6.5)
    f.dup(*gA2, side=15)
    for n in (gC1, gC2, gE, gD):
        f.leaf(*n, rad=R_LEAF6)
    f.donor(*gF, rad=8.0)
    if transfer:
        f.path("M %s,%s C %s,%s %s,%s %s,%s" % (
            gF[0], gF[1] + 10, gF[0] - 26, L[2] + STUB - 10,
            gD[0] + 46, L[2] + STUB - 10, gD[0] + 4, gD[1] + 11),
            stroke=VIOLET, w=2.2, dash="8 5.5", marker="url(#arrV)")
    spot = {"gC1": (gC1[0] - 24, gC1[1], "end"), "gC2": (gC2[0] + 24, gC2[1], "start"),
            "gD": (gD[0], gD[1] - 22, "middle"), "gF": (gF[0], gF[1] - 20, "middle")}
    for n in glabels:
        x, y, anc = spot[n]
        f.lab(x, y, n, size=F_SM, anchor=anc, fill=INK2)


def fig6():
    f = Fig(936.0, "图6")
    f.marker("arrV", VIOLET, 11, 8.5)
    f.marker("arrG", FAINT, 10, 7.5)
    f.marker("arrD2", INK2, 11, 8)
    cells = [(24, 40), (501, 40), (978, 40), (24, 470), (501, 470), (978, 470)]
    heads = [("a", "Pass 1 · species Y", "depth assigned · x provisional"),
             ("b", "Pass 2 · gene Y", "gene nodes pinned to species level"),
             ("c", "Pass 3 · lane packing", "interval partitioning in species C"),
             ("d", "Pass 4 · species X", "equal leaf slots · ancestors re-centered"),
             ("e", "Pass 5 · gene X", "copies offset by lane inside a tube"),
             ("f", "Pass 6 · transfers & bounds", "donor -> arrival arcs · bounds")]
    for (ox, oy), (lt, t, st) in zip(cells, heads):
        f.header(ox, oy, lt, t, st)
    # ---------------------------------------------------------------- (a), (b)
    La = toy_species(f, 24, 122, PROV)
    for i, y in enumerate(La):
        f.line(30, y, 402, y, stroke=HAIR, w=1.2, dash="7 6")
        f.ttext(410, y, "depth %d" % i, size=F_SM, fill=MUT)
    toy_species_labels(f, 24, La, PROV)
    Lb = toy_species(f, 501, 122, PROV)
    toy_species_labels(f, 501, Lb, PROV)
    toy_gene(f, 501, Lb, PROV, glabels=("gC1", "gC2", "gD"))
    # --------------------------------------------------------------------- (c)
    ox = 978
    for tx, lanes, note in ((ox + 36, None, "overlapping intervals"),
                            (ox + 238, (16, 80), "two lanes")):
        f.rect(tx, 122, 96, 240, fill=TUBE_F, stroke=TUBE_S, sw=1.3, rx=18)
        if lanes is None:
            f.line(tx + 40, 122, tx + 40, 262, stroke=BLUE, w=2.4)
            f.line(tx + 56, 182, tx + 56, 362, stroke=BLUE, w=2.4)
            f.rect(tx + 6, 182, 84, 80, fill=VIOLET, stroke="none", rx=8,
                   opacity="0.13")
            f.rect(tx + 6, 182, 84, 80, fill="none", stroke=VIOLET, sw=1.2,
                   rx=8, dash="5 4")
        else:
            f.line(tx + lanes[0], 122, tx + lanes[0], 262, stroke=BLUE, w=2.4)
            f.line(tx + lanes[1], 182, tx + lanes[1], 362, stroke=BLUE, w=2.4)
            for lx, lab in zip(lanes, ("lane 1", "lane 2")):
                f.ttext(tx + lx, 112, lab, size=F_SM, anchor="middle", fill=MUT)
        f.ttext(tx + 48, 384, note, size=F_SM, anchor="middle", fill=MUT)
    f.line(ox + 142, 242, ox + 230, 242, stroke=INK2, w=1.8, marker="url(#arrD2)")
    f.ttext(ox + 186, 226, "first-fit", size=F_SM, anchor="middle", fill=MUT)
    # ------------------------------------------------------------------ (d)
    Ld = toy_species(f, 24, 552, FINAL)
    toy_species(f, 24, 552, PROV, ghost=True)
    for n in ("Root", "A", "B", "C", "D", "E", "F"):
        y = Ld[LVL[n]] + (50 if LVL[n] < 2 else 32)
        x1, x2 = 24 + PROV[n], 24 + FINAL[n]
        if abs(x2 - x1) < 14:
            continue
        f.line(x1, y, x2 + (11 if x2 > x1 else -11), y, stroke=FAINT, w=1.7,
               dash="6 5", marker="url(#arrG)")
    toy_species_labels(f, 24, Ld, FINAL)
    # -------------------------------------------------------------- (e), (f)
    Le = toy_species(f, 501, 552, FINAL)
    toy_species_labels(f, 501, Le, FINAL)
    toy_gene(f, 501, Le, FINAL, glabels=("gC1", "gC2", "gD", "gF"))
    Lf = toy_species(f, 978, 552, FINAL)
    toy_species_labels(f, 978, Lf, FINAL)
    toy_gene(f, 978, Lf, FINAL, transfer=True, glabels=("gF",))
    f.rect(1000, 526, 404, 320, fill="none", stroke=PINK, sw=1.5,
           dash="9 6", rx=8)
    f.text(1012, 526 + F_PS + 6, "canvas bounds", size=F_PS, fill=PINK)
    # ---------------------------------------------------------------- legend
    legend_center_block(f, 900, [
        [("tube", "Species tube"), ("edge", "Gene-tree edge"),
         ("spec", "Speciation"), ("dup", "Duplication"), ("leaf", "Leaf"),
         ("loss", "Loss"), ("donor", "Transfer donor"),
         ("dotted", "Guide · pre-pass · bounds")]], gap=15.0)
    f.save("PhyloRecViewer-手稿正文-图6.svg")
    return f


if __name__ == "__main__":
    for draw in (fig1, fig3, fig4, fig5, fig6):
        f = draw()
        # the same rectangle check_figures.py measures on the delivered PDF, run
        # here on the source so a colliding layout stops this script, not the
        # shipment
        overlap_report(f, f.name)
        emit_alt(f)
    combined = "\n\n".join(ALT_BLOCKS)
    try:
        os.makedirs(ALT_DIR, exist_ok=True)
        agg = st.confine_to_repo(os.path.join(ALT_DIR, "main-figures-alt-text.md"))
        with open(agg, "w", encoding="utf-8") as fh:
            fh.write(combined + "\n")
        print("\nalt-text skeleton written to %s" % agg)
    except OSError as exc:
        print("  (combined alt-text report not written: %s)" % exc)
    try:
        print("alt-text skeletons merged into %s" % merge_alt_md(
            ALT_MD, ALT_SECTION,
            "## Main figures (Figs. 1, 3-6)\n\n" + combined))
    except OSError as exc:                 # never fail a figure over a report
        print("  (shared alt-text report not written: %s)" % exc)
