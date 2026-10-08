#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PhyloRecViewer-手稿正文-图2.py — Manuscript Fig. 2, assembled from REAL
application output.

Source of truth
---------------
`_build/figure2-app-print.svg` is the bundled 9999.nhx.xml reference
reconciliation (63 species, 23 gene nodes in one family) pushed through the
application's own parser -> layout -> Scene -> renderToStaticMarkup path by
`PhyloRecViewer-手稿正文-图2.ts`, which sits in this directory. Both files are
repository content (`figures/`), and the render script reads the software's
sources and fixture from the repository root, one level up (ISSUE-053/058/062):

    cd PhyloRecViewer-项目代码 && \\
      PR_OUT=figure2-app-print.svg PR_GENE_THICKNESS=9 PR_SYMBOL_SIZE=18 \\
      PR_SPECIES_FILL='#e9e9ee' PR_SPECIES_STROKE='#d9d9e0' \\
      node node_modules/vite-node/vite-node.mjs \\
        figures/PhyloRecViewer-手稿正文-图2.ts

(`node_modules` is the repository's own: `figures/` sits inside the project, so
Node walks up from here to the install made by `npm install` and the render uses
the application's own react/react-dom — no out-of-repo symlink is involved.)

Those are the app's own presentation sliders (src/render/options.ts), not
hand-edited graphics: geometry, topology and colour identities are exactly what
the application produces. They are raised for print because the interactive
defaults (geneThickness 3.6, symbolSize 7) reduce to ~0.4 pt on a 5 in panel —
the reconciliation, which is the subject of the figure, vanished against the
34-unit species tubes. The tube tone moves #f4f4f5 -> #e9e9ee for the same
reason: at 0.96 reflectance the species tree drops out of a reproduced page.
That replaces the previous whole-image gamma lift, which greyed the white
background along with the tubes.

Panels
------
(a) the full render, with the two inset windows marked on it;
(b) a speciation chain carrying two losses, run down to the species names;
(c) the four-square duplication stack with its sibling loss, likewise run down
    to the species names.
The right column ends in a card reporting the application's own computeStats()
output; the glyph key runs along the bottom.

How an inset is chosen (and why it is never chosen by eye)
----------------------------------------------------------
An inset heading is a CLAIM about what the crop shows, so the crop is built
from the claim, not fitted to it afterwards:

1. every event glyph and every species name is read back out of the render's
   own elements, in canvas units (`svg_glyphs`, `svg_tip_labels`);
2. the vertical foot of every crop is the MEASURED bottom of the name ink
   (`label_ink_band`, read off a colour mask of the render), so a crop that
   promises the tip-label row contains that row whole rather than sliced
   through the middle of the binomial;
3. the crop's head is the deepest glyph of the titular kind that still
   satisfies the claim, so the window is as short as its title allows;
4. the two windows are then placed as far apart in x as their claims allow, so
   neither is a sub-crop of the other and panel (a)'s two markers stay legible;
5. the magnification is not a free number: it is fixed by requiring the inset's
   species names to print at the manuscript's own 7 pt floor, and both windows
   are given the same width, so both insets magnify identically;
6. the window's x placement is read off the name row too.  That row is a comb —
   at the inset's own magnification one rotated binomial is ~7.6 pt of ink with
   ~1.1 pt of blank between neighbours — so a window whose frames fall anywhere
   other than that blank prints a truncated binomial, and a truncated species
   name reads as an error rather than as evidence.  `name_ink_comb()` therefore
   measures every name's ink column, the window is snapped to a WHOLE number of
   species pitches (so both frames share one phase of the comb and one gap
   choice satisfies both), and x is placed where both frames land in a gap.

Nothing in that chain is a hand-tuned fraction, and nothing is left unchecked:
`check_insets()` re-reads the FINAL windows against the claims and aborts the
build naming the kind that is missing.  The earlier version of this file picked
windows by fractions of the canvas, content-fitted them inside that seed, then
clamped the result, which silently threw away the very glyphs the seed had been
chosen for: panel (b) shipped titled "Speciation chain" holding no speciation
dot, no loss cross and no species name (measured: 0 circles, 0 names in a 550 x
554-unit window against a render carrying 13 circles and 63 names).  It also
shipped outermost species names sliced by the frame: measured off the delivered
carrier, its leftmost column carried 3.8 pt and its rightmost 2.6 pt of a 7.4 pt
name, i.e. two truncated binomials per inset, because a 605.05-unit window spans
10.084 pitches and cannot have both its frames in the ~8-unit gap between names
at once.

Two rules drive the layout. Inset windows are MEASURED from a colour mask of
this very SVG (dilated, so a glyph's arms count as content): the vertical foot
sits below the whole name row, both frames sit in the blank between two names,
and no window is padded out with empty canvas. And each inset is rasterized from
the vector source through a cropped viewBox rather than upscaled from the panel
(a) bitmap, so magnification costs no resolution.  The card keyline is drawn to
BOUND the crop, not to overprint it, for the same reason: at 1.7 pt it is wider
than the blank between two rotated names, so a keyline centred on the crop edge
covers 0.85 pt of whatever name sits nearest it — and a vector line that
overprints a raster has no registration tolerance on a press either way.

Known limitation carried by the data, not by this script: 63 rotated tip names
must share one species pitch, so their printed size in panel (a) is capped at
72 * panel_width_in / 63 = 5.9 pt on a 5.15 in panel, under the 7 pt journal
floor. Widening panel (a) and enlarging the labels trade against each other and
neither reaches 7 pt; panels (b) and (c) carry the legible detail instead, at or
above the floor (measured off the delivered crop, and re-measured by
`check_insets()` on every build), and the legend says so (item V-11). Because the
crops have to span from an event down to the name row — some 2,100 canvas units,
since the gene tree sits high above a 63-column tube-map — the insets are tall
portrait strips and the figure is taller than it was: the right column, not
panel (a), now sets the page height.

Style: the shared phylorec_style tokens (one Helvetica Neue family across the
seven figures), 1200-dpi PNG with the resolution recorded, Type3-free vector
PDF at the article's 166 mm text block. Deterministic.
"""

import json
import os
import re

# phylorec_style first: it clears MPLSTYLE before matplotlib is imported, so a
# user-wide style sheet cannot restyle a published figure.
import phylorec_style as st
import svg_raster as sr

import matplotlib
import matplotlib.figure

st.apply_style()
matplotlib.use("Agg")

import numpy as np                                       # noqa: E402
from PIL import Image                                    # noqa: E402
from scipy import ndimage                                # noqa: E402
from matplotlib.backends.backend_agg import FigureCanvasAgg   # noqa: E402
from matplotlib.lines import Line2D                      # noqa: E402
from matplotlib.patches import Circle, FancyBboxPatch     # noqa: E402

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Where the measured Fig. 2 inputs are read from.  `figures/_build/` is the
# directory the render script in THIS directory writes to, so one command
# (`node node_modules/vite-node/vite-node.mjs figures/…图2.ts`, run from the
# repository root) creates it from a clean clone; the second candidate is the
# repository root's own `_build/`, which `npm run build`-style tooling may leave.
# PR_BUILD_DIR overrides both.  Nothing here reaches outside the repository.
BUILD_CANDIDATES = [os.environ.get("PR_BUILD_DIR") or os.path.join(SCRIPT_DIR, "_build"),
                    os.path.join(SCRIPT_DIR, os.pardir, "_build")]
BUILD = next((p for p in BUILD_CANDIDATES
              if os.path.exists(os.path.join(p, "figure2-stats.json"))),
             BUILD_CANDIDATES[0])
SVG = os.path.join(BUILD, "figure2-app-print.svg")
if not os.path.exists(SVG):
    raise SystemExit(
        f"{SVG} not found — nor {os.path.join(BUILD_CANDIDATES[1], 'figure2-app-print.svg')}.\n"
        f"Generate it from a clean clone with:\n"
        f"    cd <repository root> && \\\n"
        f"      PR_OUT=figure2-app-print.svg PR_GENE_THICKNESS=9 PR_SYMBOL_SIZE=18 \\\n"
        f"      PR_SPECIES_FILL='#e9e9ee' PR_SPECIES_STROKE='#d9d9e0' \\\n"
        f"      node node_modules/vite-node/vite-node.mjs \\\n"
        f"        figures/PhyloRecViewer-手稿正文-图2.ts\n"
        f"(the command is also recorded in this file's docstring and in figures/README.md)")

with open(os.path.join(BUILD, "figure2-stats.json")) as fh:
    stats = json.load(fh)

_svg = open(SVG, encoding="utf-8").read()
_m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', _svg)
CW, CH = float(_m.group(1)), float(_m.group(2))      # render canvas, SVG units
# Everything the legend has to state about the tip labels is read from the
# render itself: the label size in SVG units and how many of them there are.
LABEL_UNITS = max(float(x) for x in re.findall(r'font-size="([\d.]+)"', _svg))
N_LABELS = _svg.count('font-size="%s"' % ("%g" % LABEL_UNITS))


# ---------------------------------------------------------------------------
# What the render actually contains, per glyph, in canvas units
# ---------------------------------------------------------------------------
# The four ink colours of the render, as RGB triples: the family/speciation
# blue (theme OKABE_ITO[0]), the duplication orange, the loss grey and the
# near-black the species names are set in.  Both the pixel mask and the element
# parse below use these same triples, so the two independent readings of the
# render cannot disagree about what a colour is.
C_BLUE, C_ORANGE, C_LOSS = (0, 114, 178), (249, 115, 22), (156, 163, 175)
C_NAME = (63, 63, 70)         # lightTheme.text = #3f3f46, the tip names

# The Scene emits each event type as its own primitive, and the shapes are not
# interchangeable (src/render/Scene.tsx:776-823): a duplication is a filled
# <rect> in theme.event.duplication, a loss is a <g> of two crossing <line>s in
# theme.event.loss, a speciation is a <circle> in the family colour at
# opacity 0.85, a leaf the same circle without the opacity.  Reading the
# elements back is exact where the colour mask can only say "some blue ink".
#
# react-dom's renderToStaticMarkup does NOT self-close: it writes
# `<circle ...></circle>`, so an opening-tag pattern is used here rather than a
# `/>` pattern.  Matching on `/>` silently returns nothing against a React
# render, which is how a build that looked guarded shipped an empty inset.
def _attrs(chunk):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', chunk))


def _num(d, k):
    return float(d[k]) if k in d and re.fullmatch(r"-?[\d.]+", d[k]) else None


def _is_colour(value, rgb):
    """does a CSS colour attribute denote rgb(...) as a #rrggbb string?"""
    if not value:
        return False
    v = value.strip().lower()
    if v.startswith("#"):
        if len(v) == 4:
            v = "#" + "".join(c * 2 for c in v[1:])
        return v == "#%02x%02x%02x" % rgb
    m = re.match(r"rgba?\(([^)]+)\)", v)
    if m:
        parts = [float(p) for p in re.split(r"[,\s/]+", m.group(1)) if p][:3]
        return len(parts) == 3 and all(abs(a - b) < 1.5
                                       for a, b in zip(parts, rgb))
    return False


def svg_glyphs(svg_text):
    """[(kind, x, y)] for every event glyph the application drew, in units."""
    out = []
    for chunk in re.findall(r"<circle\b[^>]*>", svg_text):
        a = _attrs(chunk)
        x, y = _num(a, "cx"), _num(a, "cy")
        if x is None or y is None or not _is_colour(a.get("fill"), C_BLUE):
            continue
        # a speciation is the family circle at opacity 0.85, a leaf the same
        # circle without the opacity (Scene.tsx:820-823): radius alone is the
        # application's own distinction, so no other cue is invented here.
        out.append(("speciation" if a.get("opacity") == "0.85" else "leaf",
                    x, y))
    for chunk in re.findall(r"<rect\b[^>]*>", svg_text):
        a = _attrs(chunk)
        if not _is_colour(a.get("fill"), C_ORANGE):
            continue
        x0, y0 = _num(a, "x"), _num(a, "y")
        w, h = _num(a, "width"), _num(a, "height")
        if None in (x0, y0, w, h):
            continue
        out.append(("duplication", x0 + w / 2.0, y0 + h / 2.0))
    for chunk in re.findall(r"<g\b[^>]*>.*?</g>", svg_text, flags=re.S):
        if not _is_colour(_attrs(chunk).get("stroke"), C_LOSS):
            continue
        lines = [_attrs(c) for c in re.findall(r"<line\b[^>]*>", chunk)]
        if len(lines) != 2:                 # a loss is exactly two crossed arms
            continue
        ends = []
        for ln in lines:
            ends.append((_num(ln, "x1"), _num(ln, "y1")))
            ends.append((_num(ln, "x2"), _num(ln, "y2")))
        if any(v is None for xy in ends for v in xy):
            continue
        out.append(("loss", sum(xy[0] for xy in ends) / 4.0,
                    sum(xy[1] for xy in ends) / 4.0))
    return out


def svg_tip_labels(svg_text, label_units):
    """(x, y) anchors of the rotated species names the Scene drew.

    These are the <text> elements at the render's own label size; an inset that
    claims legible species names has to contain some of them, so their position
    is read rather than assumed.  transform="translate(..) .." is folded into
    the anchor so a label moved by a group transform is still placed correctly.
    """
    out = []
    for chunk in re.findall(r"<text\b([^>]*)>", svg_text):
        a = _attrs(chunk)
        size = _num(a, "font-size")
        if size is None or abs(size - label_units) > 0.01:
            continue
        x, y = _num(a, "x") or 0.0, _num(a, "y") or 0.0
        for t in re.finditer(r"translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)",
                             a.get("transform", "")):
            x += float(t.group(1))
            y += float(t.group(2))
        out.append((x, y))
    return out


GLYPHS = svg_glyphs(_svg)
TIPS = svg_tip_labels(_svg, LABEL_UNITS)
KIND_COUNT = {k: sum(1 for g in GLYPHS if g[0] == k)
              for k in ("speciation", "leaf", "duplication", "loss")}
if not KIND_COUNT["speciation"] or not KIND_COUNT["duplication"] \
        or not KIND_COUNT["loss"] or not TIPS:
    raise SystemExit(
        f"could not read the render's event glyphs back out of {SVG} "
        f"(parsed {KIND_COUNT}, {len(TIPS)} tip labels). The inset titles are "
        f"checked against these counts, so an unparsable render fails the build "
        f"instead of shipping an inset that shows nothing of its title.")

# ---------------------------------------------------------------------------
# Layout, in inches
# ---------------------------------------------------------------------------
# Declared before the insets are solved, because an inset's magnification is
# defined by the width its column is given: the window may not be fitted first
# and squeezed into a column afterwards, which is what let a 1x "magnification"
# pass as an inset once the column was narrower than the crop.
FIG_W = st.PRINT_IN        # authored at the article's text block, not scaled afterwards
MARGIN = st.PAGE_MARGIN_IN
CONTENT_W = FIG_W - 2 * MARGIN
TOP_IN, BOT_IN = 0.10, 0.12
TITLE_H = 0.20            # panel-heading band above an image
GAP = 0.18

MAIN_W = 4.95
COL_X = MARGIN + MAIN_W + 0.22
COL_W = CONTENT_W - MAIN_W - 0.22
# Half a card keyline, in inches.  The inset keyline is drawn this far OUTSIDE
# the crop rather than centred on its edge: the 1.7 pt rule is wider than the
# ~1.1 pt of blank between two rotated species names, so a rule centred on the
# crop covers 0.85 pt of the outermost name whatever the window is doing, and a
# name shaved by a rule is the defect the window placement exists to avoid.  The
# dashed region markers inside panel (a) stay centred on their windows: they are
# annotations laid over the art, not the border of a card.
KEY_PAD = st.LW_TUBE / 2.0 / 72.0

# ---------------------------------------------------------------------------
# The render read as pixels: the name row's foot, and what a crop is filled with
# ---------------------------------------------------------------------------
MASK_PX = 1400            # raster the canvas is measured at, ~0.37 units per px


def _masks(px=MASK_PX):
    """(gene/event ink, species-name ink) as boolean maps of this very SVG."""
    prev = sr.rsvg_render(SVG, px)
    gene = (sr.colour_mask(prev, C_BLUE, 46)
            | sr.colour_mask(prev, C_ORANGE, 46)
            | sr.colour_mask(prev, C_LOSS, 30))
    # A loss is two 1.8-unit arms and a glyph is only 18 units across: without
    # dilation the mask under-reports how far the drawn ink really reaches.
    gene = ndimage.binary_dilation(gene, iterations=3)
    return gene, sr.colour_mask(prev, C_NAME, 70), prev.shape[:2]


GENE_MASK, NAME_MASK, (MASK_H, MASK_W) = _masks()
SX, SY = MASK_W / CW, MASK_H / CH


def label_ink_band():
    """(top, bottom) canvas unit of the printed species-name ink.

    The names are rotated -90 deg about an anchor that sits at the middle of the
    string, so the anchor row is NOT the bottom of the row of names: the ink runs
    some 350 units below it.  A crop that promises "the row of species tip
    labels" has to end below that ink, or it cuts every binomial in half.
    """
    rows = np.where(NAME_MASK.any(axis=1))[0]
    if len(rows) == 0:
        raise SystemExit("no species-name ink found in the render, so the "
                         "inset crops cannot be anchored on the tip-label row")
    return rows[0] / SY, (rows[-1] + 1) / SY


NAME_BAND = label_ink_band()

# ---------------------------------------------------------------------------
# The name row read back as a comb: where each rotated species name starts/stops
# ---------------------------------------------------------------------------
# An inset that promises the row of species names has to print whole names, so
# the ink columns of that row are measured rather than assumed: a frame that
# falls inside one of them truncates a binomial, and a truncated binomial is the
# thing a reader is using the inset to read.  The comb is read at a finer pitch
# than MASK_PX because MASK_PX is ~2.8 canvas units per pixel while the blank
# between two names is ~8 units wide; rasterising just the name row costs a
# fraction of the full canvas and resolves it to ~0.5 units.
COMB_PX = 7600              # px across the canvas for the comb read
COMB_MIN_U = 8.0            # a column narrower than this is antialiasing, not a name


def name_ink_comb(px=COMB_PX):
    """[(left, right)] canvas units of every printed species-name ink column."""
    box = (0.0, NAME_BAND[0] - 4.0, CW, (NAME_BAND[1] - NAME_BAND[0]) + 8.0)
    prof = sr.colour_mask(sr.rsvg_render(SVG, px, box=box), C_NAME, 70).any(axis=0)
    u = CW / px
    out, s = [], None
    for i, v in enumerate(prof):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s * u, (i - 1) * u))
            s = None
    if s is not None:
        out.append((s * u, (len(prof) - 1) * u))
    return [(a, b) for a, b in out if b - a >= COMB_MIN_U]


NAME_COMB = name_ink_comb()
if len(NAME_COMB) != len(TIPS):
    raise SystemExit(
        f"the tip-label row read back as {len(NAME_COMB)} ink columns, but the "
        f"render draws {len(TIPS)} names; the inset frames are placed from this "
        f"comb, so an incomplete comb has to abort the build rather than crop "
        f"through a name unnoticed")
COMB_EDGE = np.concatenate(([a for a, _b in NAME_COMB],
                            [b for _a, b in NAME_COMB]))
COMB_LO = np.array([a for a, _b in NAME_COMB])
COMB_HI = np.array([b for _a, b in NAME_COMB])
COMB_GAP = float(np.median(COMB_LO[1:] - COMB_HI[:-1]))   # blank between names


# ---------------------------------------------------------------------------
# Panel (a) is printed at the full render canvas; its dead space is measured
# ---------------------------------------------------------------------------
# Panel (a) keeps the whole canvas height on purpose.  The figure height is set
# by the RIGHT COLUMN (two portrait inset strips plus the statistics card), not
# by panel (a): an inset that reaches from a gene event down to the species-name
# row is a tall strip, and its printed height (window content height x em /
# label units) does not depend on how wide the column is.  Cropping panel (a)'s
# raster to its ink bbox therefore cannot shorten the page (F-04-15's "13% too
# tall" held for the old letter-boxed build, where panel a was taller than the
# column); it would only leave a short panel (a) floating above a large blank
# band.  So panel (a) is drawn at MAIN_W x MAIN_H over the full canvas and the
# blank head/foot are only REPORTED (the genuinely-wrong part of F-04-15, the
# dashed zoom rectangles punching through the species names, is fixed with a
# white knock-out under-stroke in the placement below).
_ink_rows = np.where((GENE_MASK | NAME_MASK).any(axis=1))[0]
INK_V0_U = max(0.0, _ink_rows[0] / SY)                 # top of drawn ink (units)
INK_V1_U = min(CH, (_ink_rows[-1] + 1) / SY)           # foot of drawn ink (units)
BLANK_HEAD_U = INK_V0_U                                # empty canvas above the ink
BLANK_FOOT_U = CH - INK_V1_U                           # empty canvas below it
U_IN = MAIN_W / CW                                     # in per canvas unit (isotropic)
MAIN_H = CH * U_IN                                     # full canvas, isotropic
LABEL_PT = LABEL_UNITS * U_IN * 72                     # em of a tip name, pt
# the tip pitch is a MEASUREMENT off the render's own label anchors, not
# MAIN_W / N_LABELS (which assumes the names span the full canvas): (F-04-16)
_anchor_x = sorted(x for x, _y in TIPS)
TIP_PITCH_U = (_anchor_x[-1] - _anchor_x[0]) / (len(_anchor_x) - 1.0)
TIP_PITCH_PT = TIP_PITCH_U * U_IN * 72


def crop_fill(window):
    """(inked area fraction, fraction of crop rows carrying ink) of a window."""
    x, y, w, h = window
    r0, r1 = int(y * SY), int((y + h) * SY)
    c0, c1 = int(x * SX), int((x + w) * SX)
    sub = (GENE_MASK | NAME_MASK)[r0:r1, c0:c1]
    if sub.size == 0:
        return 0.0, 0.0
    return float(sub.mean()), float(sub.any(axis=1).mean())


# ---------------------------------------------------------------------------
# Inset windows, built from what each panel's title promises
# ---------------------------------------------------------------------------
# A crop is specified by (i) the glyph kinds its heading names, with counts,
# (ii) whether it must carry the species-name row, and (iii) the width its
# column gives it.  The seeds the previous version of this file used are gone:
# a seed fraction, a content fit inside that seed, and a clamp afterwards is
# exactly the sequence that discards the glyphs a title depends on.
INSET_CLAIMS = {
    # (b) "a chain of speciation dots joined by gene-tree edges and threaded
    # with loss crosses, reaching the row of species tip labels"
    "1": dict(title="Speciation chain",
              need=(("speciation", 3), ("loss", 2)), tip_row=True),
    # (c) "the duplication cluster, its duplication squares and the sibling
    # loss cross, likewise reaching the tip-label row"
    "2": dict(title="Duplication stack",
              need=(("duplication", 4), ("loss", 1)), tip_row=True),
}
LABELS = {k: c["title"] for k, c in INSET_CLAIMS.items()}
PRIMARY = {"1": "speciation", "2": "duplication"}
MIN_TIP_LABELS = 3        # a "row" of names means more than one or two
HEAD_PAD_U = 46.0         # breathing room above the topmost titular glyph
FOOT_PAD_U = 30.0         # ... and below the measured name ink
GLYPH_HALF_U = 12.0       # half a symbol's box (symbolSize 18), so a glyph the
#                          title names is never sliced by the crop's frame
STRIDE_U = 20.0           # x positions tried, in canvas units
# The magnification is a consequence, not a choice: an inset exists to make the
# names readable, so the crop is widened until those names print at the
# manuscript's own floor.  The floor is asserted on the MEASURED ink height
# (check_figures.py measures the delivered raster's cap-to-baseline extent, not
# the font em), and a rotated binomial's ink runs ~0.90-0.94 em, so the target
# em is set above the floor by that ratio and the guard below then measures the
# crop and aborts if the ink it produced is still short.  Both windows get the
# same width, so both insets magnify identically.
INSET_TIP_PT = st.MIN_TEXT
INSET_INK_EM_RATIO = 0.90        # conservative ink/em for ascender+descender names
INSET_EM_TARGET = INSET_TIP_PT / INSET_INK_EM_RATIO
MAG_TARGET = INSET_EM_TARGET / LABEL_PT
WIN_W = COL_W * CW / (MAG_TARGET * MAIN_W)
# ... and then snapped to a WHOLE number of species pitches.  A window 10.084
# pitches wide cannot have both its frames in the ~8-unit blank between names
# whatever x it is given — the two frames sit at different phases of the comb, so
# one of them always falls inside a name and prints a truncated binomial.  At a
# whole number of pitches both frames share one phase and a single gap choice
# satisfies them both.  The snap moves the width by under 1% and only ever towards
# a larger magnification here, and the em floor is re-checked against the delivered
# crop below, so the magnification is still measured, not assumed.
INSET_PITCHES = int(round(WIN_W / TIP_PITCH_U))
WIN_W = INSET_PITCHES * TIP_PITCH_U
MIN_INK_AREA = 0.08       # a crop is at least a tenth drawn ink, not blank tube
MIN_INK_ROWS = 0.90       # ... and carries ink in every band of its height
MAX_INSET_SLOTS = 11.5    # the window may not pack more species columns than this
# The blank a frame must keep from species-name ink, in PRINTED points: more than
# an antialiasing halo and more than the rounding of the comb read, so that the
# outermost binomial is visibly a whole name rather than a stub at the rule.
# `check_insets()` re-measures it off the delivered crop and aborts below this.
INSET_EDGE_CLEAR_PT = 0.35
INSET_EDGE_CLEAR_U = INSET_EDGE_CLEAR_PT * WIN_W / (COL_W * 72.0)
FINE_STRIDE_U = 0.25      # x positions tried inside a claim-earned neighbourhood
assert set(INSET_CLAIMS) == set(PRIMARY)


def _glyph_pts(kind):
    return np.array([(g[1], g[2]) for g in GLYPHS if g[0] == kind],
                    dtype=float).reshape(-1, 2)


TIP_PTS = np.array(TIPS, dtype=float).reshape(-1, 2)


def inventory(window):
    """what the render really puts inside (x, y, w, h): glyphs and tip names."""
    x, y, w, h = window
    inv = dict.fromkeys(("speciation", "leaf", "duplication", "loss"), 0)
    inv["tips"] = 0
    for kind, gx, gy in GLYPHS:
        if x <= gx <= x + w and y <= gy <= y + h:
            inv[kind] += 1
    for tx, ty in TIPS:
        if x <= tx <= x + w and y <= ty <= y + h:
            inv["tips"] += 1
    return inv


def claim_gap(key, inv):
    """the ways this crop fails its own title ([] means it does not)."""
    c = INSET_CLAIMS[key]
    gap = []
    for kind, need in c["need"]:
        if inv[kind] < need:
            gap.append("%s: %d %s glyph(s), the title requires >= %d"
                       % (c["title"], inv[kind], kind, need))
    if c["tip_row"] and inv["tips"] < MIN_TIP_LABELS:
        gap.append("%s: %d tip label(s), the legend claims legible species "
                   "names (>= %d)" % (c["title"], inv["tips"], MIN_TIP_LABELS))
    return gap


def _holds(key, x0, y0, y1, whole_box=True):
    """does window [x0, x0+WIN_W] x [y0, y1] satisfy the claim's counts?

    `whole_box` asks for each titular glyph's full 18-unit symbol inside the
    crop: a speciation dot or duplication square cut in half by the frame is
    not the evidence the heading claims.
    """
    c = INSET_CLAIMS[key]
    pad = GLYPH_HALF_U if whole_box else 0.0
    for kind, need in c["need"]:
        pts = _glyph_pts(kind)
        got = int(((pts[:, 0] >= x0 + pad) & (pts[:, 0] <= x0 + WIN_W - pad)
                   & (pts[:, 1] >= y0 + pad) & (pts[:, 1] <= y1 - pad)).sum())
        if got < need:
            return False
    if c["tip_row"]:
        got = int(((TIP_PTS[:, 0] >= x0) & (TIP_PTS[:, 0] <= x0 + WIN_W)
                   & (TIP_PTS[:, 1] >= y0) & (TIP_PTS[:, 1] <= y1)).sum())
        if got < MIN_TIP_LABELS:
            return False
    return True


def valid_x_positions(key, y0, y1):
    """every x0 for which the fixed-width crop at this height earns its title."""
    out = []
    x0 = 0.0
    while x0 <= CW - WIN_W + 1e-9:
        if _holds(key, x0, y0, y1):
            out.append(round(x0, 3))
        x0 += STRIDE_U
    return out


def frame_ink_clearance(x0, w=None):
    """blank canvas units between BOTH frames of [x0, x0+w] and the nearest name ink.

    Negative means a frame falls inside a name's ink column, i.e. the delivered
    crop prints a truncated binomial.  The neighbour the crop *excludes* counts
    too, so a frame has to sit in the middle of a blank rather than kiss one name
    while shaving the next.
    """
    w = WIN_W if w is None else w
    out = []
    for f in (x0, x0 + w):
        if np.any((COMB_LO < f) & (COMB_HI > f)):
            return -float(np.min(np.abs(COMB_EDGE - f)))
        out.append(float(np.min(np.abs(COMB_EDGE - f))))
    return min(out)


def gap_places(key, y0, y1):
    """[(x0, clearance)] for the crops that earn their title AND print whole names.

    The title is earned on the coarse STRIDE_U grid; every x that earns it is then
    refined over FINE_STRIDE_U, because landing in the blank between two rotated
    names is a band a fraction of the stride wide.  Refining only around positions
    the claim already earned keeps the separation chosen below honest.
    """
    found = {}
    for x in valid_x_positions(key, y0, y1):
        lo = max(0.0, x - STRIDE_U)
        hi = min(CW - WIN_W, x + STRIDE_U)
        x0 = lo
        while x0 <= hi + 1e-9:
            c = frame_ink_clearance(x0)
            if c >= INSET_EDGE_CLEAR_U and _holds(key, x0, y0, y1):
                found[round(x0, 3)] = c
            x0 += FINE_STRIDE_U
    return sorted(found.items())


def gap_band_best(places):
    """the widest-daylight x of each contiguous band of placements.

    A band is one gap of the comb: any x in it puts both frames in the same blank,
    so the band's best member centres them in it.  The bands themselves stay far
    apart, which is what keeps the two insets different crops.
    """
    bands, cur = [], [places[0]]
    for p in places[1:]:
        if p[0] - cur[-1][0] > FINE_STRIDE_U * 2.0:
            bands.append(cur)
            cur = [p]
        else:
            cur.append(p)
    bands.append(cur)
    return [max(b, key=lambda t: t[1]) for b in bands]


def solve_window(key):
    """the shortest crop, ending on the name row, that contains its title.

    The head of the window is the deepest possible top: candidate heads are the
    y values of the titular kind, tried from the bottom of the canvas upward,
    and the first that still satisfies the claim wins.  That keeps the strip as
    short as its title allows, which matters because the crop's printed height
    is what the page is made of.
    """
    prim = PRIMARY[key]
    y_foot = min(CH, NAME_BAND[1] + FOOT_PAD_U)
    earned = False
    for head in sorted({round(g[2], 3) for g in GLYPHS
                        if g[0] == prim}, reverse=True):
        y0 = head - HEAD_PAD_U
        if y0 < 0.0 or y_foot - y0 < WIN_W / 4.0:
            continue
        xs = gap_places(key, y0, y_foot)
        if xs:
            subject = np.mean([g[1] for g in GLYPHS
                               if g[0] == prim and abs(g[2] - head) < 1e-6])
            return dict(x_options=xs, y0=y0, y1=y_foot, head=head,
                        subject_x=float(subject))
        if valid_x_positions(key, y0, y_foot):
            earned = True
    if earned:
        raise SystemExit(
            f"inset {key}: every x that holds the glyphs its title names puts a "
            f"frame inside a species name, so the crop would print a truncated "
            f"binomial; widen the column or lower the label size instead of "
            f"shipping a cropped name")
    raise SystemExit(
        f"no window of this figure's column width can hold the glyphs the "
        f"title of inset {key} promises; widen the column or retitle the panel")


_solved = {k: solve_window(k) for k in INSET_CLAIMS}

# Where two claims can be satisfied by many crops of the same width, the x
# placement is chosen so the insets differ: both the speciation chain and the
# duplication stack live in the same narrow column of this reconciliation, so
# centring each crop on its own subject would make panel (c) a sub-crop of panel
# (b), print panel (a)'s two markers on top of one another, and force the
# leaders to cross.  The crop that starts higher on the canvas takes the leftmost
# position its claim allows, the lower one the rightmost — and within the gap of
# the name comb each of them has picked, the x that centres both frames in that
# gap, so neither outermost binomial is cropped by the frame.
_keys = sorted(INSET_CLAIMS)
_high, _low = sorted(_keys, key=lambda k: (_solved[k]["y0"], k))
_bands = {k: gap_band_best(_solved[k]["x_options"]) for k in _keys}
pick = {_high: _bands[_high][0][0], _low: _bands[_low][-1][0]}

windows = {k: (pick[k], _solved[k]["y0"], WIN_W, _solved[k]["y1"] - _solved[k]["y0"])
           for k in INSET_CLAIMS}
# the blank the final windows actually got, printed in points for the report
edge_clear_pt = {k: frame_ink_clearance(windows[k][0], windows[k][2])
                 * COL_W * 72.0 / WIN_W for k in INSET_CLAIMS}

# ---------------------------------------------------------------------------
# The hard build-time guard: a titled inset must contain what its title names
# ---------------------------------------------------------------------------
# Not the render-parse check above, which only proves the SVG was readable:
# this one is evaluated on the FINAL windows, after the solver, the equal
# magnification and the x separation have had their way, and it names the glyph
# kind that is missing.  A future edit that moves a seed, a pad or a clamp can
# only ship an inset that has already been counted.  It also checks the two
# frames of every final window against the measured name comb, because a window
# that cuts a binomial still holds all its glyphs and all its label anchors: the
# truncation only shows up in the ink, which is what the reader is there to read.
def check_insets(win=None):
    win = windows if win is None else win
    bad = []
    for key in sorted(INSET_CLAIMS):
        c, inv = INSET_CLAIMS[key], inventory(win[key])
        for kind, need in c["need"]:
            if inv[kind] < need:
                bad.append("inset (%s) titled %r holds %d %s glyph(s) but its "
                           "title promises at least %d"
                           % ("bc"[int(key) - 1], c["title"], inv[kind], kind,
                              need))
        if c["tip_row"] and inv["tips"] < MIN_TIP_LABELS:
            bad.append("inset (%s) titled %r holds %d species-name tip glyph(s) "
                       "but the legend claims a readable row of them (>= %d)"
                       % ("bc"[int(key) - 1], c["title"], inv["tips"],
                          MIN_TIP_LABELS))
        area, rows = crop_fill(win[key])
        if area < MIN_INK_AREA or rows < MIN_INK_ROWS:
            bad.append("inset (%s) titled %r is padded out with empty canvas: "
                       "%.3f of its area inked, %.3f of its rows"
                       % ("bc"[int(key) - 1], c["title"], area, rows))
        clr_u = frame_ink_clearance(win[key][0], win[key][2])
        if clr_u < INSET_EDGE_CLEAR_U:
            bad.append(
                "inset (%s) titled %r crops a species name: its frames keep only "
                "%.2f pt of blank from name ink (%.2f pt needed), so a binomial "
                "sits under the keyline or ends at the window edge — re-place the "
                "window in a gap of the name comb"
                % ("bc"[int(key) - 1], c["title"],
                   clr_u * COL_W * 72.0 / win[key][2], INSET_EDGE_CLEAR_PT))
    if bad:
        raise SystemExit("inset guard: " + " | ".join(bad))


for _key in sorted(INSET_CLAIMS):
    _inv = inventory(windows[_key])
    for _kind, _need in INSET_CLAIMS[_key]["need"]:
        if _inv[_kind] < _need:
            raise SystemExit(f"inset guard: ({'bc'[int(_key) - 1]}) {INSET_CLAIMS[_key]['title']!r} holds {_inv[_kind]} {_kind} glyphs, its title requires >= {_need}")
    if INSET_CLAIMS[_key]["tip_row"] and _inv["tips"] < MIN_TIP_LABELS:
        raise SystemExit(f"inset guard: ({'bc'[int(_key) - 1]}) {INSET_CLAIMS[_key]['title']!r} holds {_inv['tips']} tip-name glyphs, its title requires a readable row (>= {MIN_TIP_LABELS})")
check_insets()

# ---------------------------------------------------------------------------
# Magnification: one number for both insets, and it must be a magnification
# ---------------------------------------------------------------------------
# The guard does not trust the window width: it rasterises the delivered crop
# exactly as the figure will place it (COL_W wide at DPI) and MEASURES the
# species-name ink off those pixels.  This is the check the old script lacked —
# it computed the magnification from windows[k][2] (a ~11-slot intent) while the
# crop rsvg actually delivered packed 27 slots at 2.7 pt, because a shrunk
# viewBox against an unshrunk width/height letter-boxed the render (F-04-1).


def measure_inset_carrier(window):
    """what the delivered crop really prints, measured off its own pixels.

    Rendered at the inset's placed size, so this is a measurement of the carrier,
    not of the window arithmetic.  Species-name ink is the neutral near-black the
    Scene sets tip names in (#3f3f46); the family blue, duplication orange and
    loss grey are all masked out.  Returns the name-column count, the median ink
    width and tip pitch in printed points, the blank the outermost columns keep
    from the crop's own edge (the card keyline bounds that edge, so this is also
    the distance to the drawn rule), and the outermost column's width relative to
    the interior ones — a cropped name is a NARROW column, which is exactly what
    the eye reads as truncation.
    """
    wx, wy, ww, wh = window
    A = sr.rsvg_render(SVG, int(round(COL_W * st.DPI)),
                       box=(wx, wy, ww, wh)).astype(int)
    r, g, b = A[..., 0], A[..., 1], A[..., 2]
    name = (r < 120) & (g < 120) & (b < 140) & (np.abs(r - g) < 35) & (b >= g)
    prof = name.sum(axis=0) > 0
    runs, s, last = [], None, None
    for i, v in enumerate(prof):
        if v and s is None:
            s = last = i
        elif v:
            last = i
        elif s is not None and i - last > 4:
            if last - s >= 2:
                runs.append((s, last))
            s = None
    if s is not None and last - s >= 2:
        runs.append((s, last))
    # a rotated binomial's ink width is its horizontal run width; drop the
    # one-pixel anti-alias slivers that are not a name column.
    sig = [run for run in runs if run[1] - run[0] + 1 >= 20]
    zero = dict(columns=0, ink_pt=0.0, pitch_pt=0.0, edge_pt=0.0, ratio=0.0)
    if not sig:
        return zero
    widths = [e - s0 + 1 for s0, e in sig]
    med = float(np.median(widths))
    return dict(
        columns=len(sig),
        ink_pt=med / st.DPI * 72.0,
        pitch_pt=float(np.median([sig[i + 1][0] - sig[i][0]
                                 for i in range(len(sig) - 1)] or [0])
                       ) / st.DPI * 72.0,
        edge_pt=min(sig[0][0], A.shape[1] - 1 - sig[-1][1]) / st.DPI * 72.0,
        ratio=min(widths[0], widths[-1]) / med if med else 0.0)


MAG = {k: (COL_W / windows[k][2]) / (MAIN_W / CW) for k in windows}
_MAG = {(COL_W / windows[k][2]) / (MAIN_W / CW) for k in windows}
if len(_MAG) != 1:
    raise SystemExit(f"insets magnify unevenly ({sorted(round(m, 2) for m in _MAG)}); "
                     f"they would each need their own label")
MAGURATION = _MAG.pop()
# The delivered name columns may not differ in width or spacing from each other
# by more than this: one narrow outer column is a truncated binomial, and unequal
# pitch between the two insets would mean they do not magnify identically.
INSET_COL_RATIO = 0.92
INSET_PITCH_TOL_PT = 0.06
_carrier = {}
for _k, _m in MAG.items():
    _letter = 'bc'[int(_k) - 1]
    if _m <= 1.0:
        raise SystemExit(
            f"inset {_k} magnifies only {_m:.2f}x over panel (a); widen the "
            f"column or tighten its window - an inset at 1x adds nothing")
    # the em the window arithmetic predicts and the slots it must really hold
    _em = LABEL_PT * _m
    if _em < INSET_EM_TARGET - 1e-6:
        raise SystemExit(
            f"inset ({_letter}) carries the tip labels at {_em:.2f} pt em, "
            f"below the {INSET_EM_TARGET:.2f} pt em the inset floor needs")
    # and now MEASURE the delivered crop, closing the intent-vs-carrier gap
    _car = measure_inset_carrier(windows[_k])
    _carrier[_letter] = _car
    if _car["columns"] > MAX_INSET_SLOTS:
        raise SystemExit(
            f"inset ({_letter}) delivers {_car['columns']} species columns in its "
            f"{windows[_k][2]:.0f}-unit window, above the {MAX_INSET_SLOTS} "
            f"the magnification was solved for - the crop is not what the "
            f"window claims (rasteriser letter-boxing?)")
    if _car["ink_pt"] < INSET_TIP_PT - 1e-6:
        raise SystemExit(
            f"inset ({_letter}) measures {_car['ink_pt']:.2f} pt species-name ink "
            f"on the delivered crop, below the {INSET_TIP_PT:.2f} pt floor the "
            f"insets are the figure's answer to; tighten the window")
    if _car["edge_pt"] < INSET_EDGE_CLEAR_PT - 0.10:
        raise SystemExit(
            f"inset ({_letter}) prints its outermost species name only "
            f"{_car['edge_pt']:.2f} pt inside the crop frame (the card keyline "
            f"bounds that edge), below the {INSET_EDGE_CLEAR_PT:.2f} pt the name "
            f"comb is placed to keep: the outer binomial reads as cropped at the "
            f"frame; re-place the window in a gap of the comb")
    if _car["ratio"] < INSET_COL_RATIO:
        raise SystemExit(
            f"inset ({_letter}) prints an outermost name column only "
            f"{100 * _car['ratio']:.0f}% as wide as its neighbours "
            f"({_car['ink_pt']:.2f} pt median): a truncated binomial; re-place "
            f"the window in a gap of the name comb")
_pitches = {k: v["pitch_pt"] for k, v in _carrier.items()}
if _pitches and max(_pitches.values()) - min(_pitches.values()) > INSET_PITCH_TOL_PT:
    raise SystemExit(
        f"the two insets deliver different tip pitches "
        f"({', '.join('%s %.2f pt' % (k, v) for k, v in sorted(_pitches.items()))}), "
        f"so they do not magnify identically and would each need their own label")

ins_h = {k: COL_W * windows[k][3] / windows[k][2] for k in windows}
main_top = TOP_IN + TITLE_H
LEG_H = 0.34

# ---------------------------------------------------------------------------
# Panel headings, measured so that no line of type can sit inside the trim
# ---------------------------------------------------------------------------
# phylorec_style.PAGE_MARGIN_IN declares a 6 pt inner margin and check_figures
# measures the delivered PDF against it; the inset headings are the only text
# whose right edge runs toward the page edge, because they sit in a 1.2 in
# column at the far right of the figure.  "Duplication stack" at 8.2 pt overran
# it (measured 4.01 pt from the page edge in the delivered PDF), so the heading
# is now laid out against the width it actually occupies: the largest size from
# the ladder that fits inside the margin, and only if even the 7 pt floor does
# not fit is the title wrapped onto a second line.
_MEAS_FIG = matplotlib.figure.Figure(figsize=(2, 2), dpi=72)
FigureCanvasAgg(_MEAS_FIG)        # a real Agg canvas: extents are measurable


def text_width_in(s, size, weight="bold"):
    """inches this string occupies, measured with the figure's own font."""
    ax = _MEAS_FIG.add_axes([0, 0, 1, 1])
    t = ax.text(0.5, 0.5, s, fontsize=size, fontweight=weight,
                ha="center", va="center")
    w = t.get_window_extent(renderer=_MEAS_FIG.canvas.get_renderer()).width
    ax.remove()
    return w / _MEAS_FIG.dpi


def plan_heading(x_left, letter, title, right_limit, size0=st.PANEL_TITLE):
    """(lines, size, letter width) for a heading that clears the page edge."""
    letter_w = text_width_in("(%s)" % letter, st.PANEL_LETTER)
    lead = min(0.28, letter_w + 0.06)          # gap from "(b)" to its title
    avail = right_limit - (x_left + lead)
    ladder = [s for s in (size0, round(size0 - 0.4, 2), st.MIN_TEXT)
              if s >= st.MIN_TEXT]
    for size in ladder:
        if text_width_in(title, size) <= avail:
            return [title], size, letter_w, lead
    words = title.split(" ")
    best = None
    for cut in range(1, len(words)):
        lines = [" ".join(words[:cut]), " ".join(words[cut:])]
        for size in ladder:
            wide = max(text_width_in(s, size) for s in lines)
            if wide <= avail and (best is None or wide < best[2]):
                best = (lines, size, wide)
    if best is None:
        raise SystemExit(
            f"heading {title!r} does not fit inside the declared "
            f"{MARGIN * 72:.1f} pt inner margin at the {st.MIN_TEXT} pt glyph "
            f"floor; widen its column rather than shrink the type")
    return list(best[0]), best[1], letter_w, lead


HEAD_RIGHT = FIG_W - MARGIN                  # nothing may cross this line
head_plan = {}
for _k, _letter in (("1", "b"), ("2", "c")):
    _lines, _size, _lw, _lead = plan_heading(COL_X, _letter, LABELS[_k],
                                             HEAD_RIGHT)
    _w = max(text_width_in(s, _size) for s in _lines)
    assert COL_X + _lead + _w <= HEAD_RIGHT + 1e-9, \
        f"inset heading {_lines!r} would sit inside the trim"
    head_plan[_k] = dict(lines=_lines, size=_size, lead=_lead,
                         h=TITLE_H if len(_lines) == 1
                         else TITLE_H / 2 + 0.10 * len(_lines))

# ---------------------------------------------------------------------------
# Page geometry: the inset column, not panel (a), now sets the height
# ---------------------------------------------------------------------------
# Each crop has to reach from an event down to the name row, which is some 2,100
# canvas units, and the 7 pt label floor fixes how wide the crop may be, so the
# printed height of a crop follows from its content alone: no arrangement of
# this figure makes the column shorter than it is.  Panel (a) therefore keeps
# its size and the glyph key moves under it, so the column's extra height reads
# as the figure's shape rather than as a hole left beside a footer.
col_used = sum(head_plan[k]["h"] + ins_h[k] for k in windows) + GAP
card_h = max(MAIN_H - col_used - 0.20, 1.30)
col_total = col_used + card_h
key_top = main_top + MAIN_H + 0.20
FIG_H = main_top + max(MAIN_H + 0.20 + LEG_H, col_total) + BOT_IN


fig = matplotlib.figure.Figure(figsize=(FIG_W, FIG_H), dpi=72)
fig.patch.set_facecolor(st.CANVAS)

# One overlay axes carries every piece of chrome, in inches, so a rounded
# corner is round and a radius means what it says.
ov = fig.add_axes([0, 0, 1, 1], zorder=50)
ov.set_xlim(0, FIG_W)
ov.set_ylim(0, FIG_H)
ov.set_aspect("equal")
ov.set_axis_off()


def img_axes(x, y_top, w, h, z=1):
    # The chrome axes paints the cards' opaque fills at zorder 52, so anything
    # that must sit inside a card has to be drawn above it.
    ax = fig.add_axes([x / FIG_W, (FIG_H - y_top - h) / FIG_H,
                       w / FIG_W, h / FIG_H], zorder=z)
    ax.set_axis_off()
    return ax


def frame(x, y_top, w, h, r=0.05, ec=None, lw=st.LW_TUBE, dashed=False,
          fc="none", z=52, knockout=0.0):
    if knockout:
        # A white under-stroke knocks the coloured dashed frame out of the
        # species names it crosses in panel (a), so the box border no longer
        # prints through the glyph ink (F-04-15).
        ov.add_patch(FancyBboxPatch(
            (x + r, FIG_H - y_top - h + r), w - 2 * r, h - 2 * r,
            boxstyle=f"round,pad={r}", facecolor="none", edgecolor=st.CANVAS,
            linewidth=lw + knockout, zorder=z - 1))
    ov.add_patch(FancyBboxPatch(
        (x + r, FIG_H - y_top - h + r), w - 2 * r, h - 2 * r,
        boxstyle=f"round,pad={r}", facecolor=fc, edgecolor=ec or st.INK,
        linewidth=lw, zorder=z,
        linestyle=(0, (4.2, 3.0)) if dashed else "solid"))


def heading(x, y_top, letter, title, size=st.PANEL_TITLE, plan=None):
    """(letter) + title, top-aligned on the band that starts at y_top.

    One line sits centred in the standard TITLE_H band; a wrapped title gets a
    band tall enough to hold its lines, so a heading is never squeezed into
    type below the floor just to keep a fixed band height.
    """
    lines, size, lead = (([title], size, 0.28) if plan is None else
                         (plan["lines"], plan["size"], plan["lead"]))
    ov.text(x, FIG_H - y_top - TITLE_H / 2, f"({letter})",
            fontsize=st.PANEL_LETTER, fontweight="bold", va="center",
            ha="left", color=st.INK)
    step = 0.10                                   # inches between wrapped lines
    top_line = FIG_H - y_top - TITLE_H / 2        # first line where a single
    for i, ln in enumerate(lines):                # line would have sat
        ov.text(x + lead, top_line - step * i, ln, fontsize=size,
                fontweight="bold", va="center", ha="left", color=st.INK)
    return y_top + (TITLE_H if len(lines) == 1
                    else TITLE_H / 2 + step * len(lines))



# ---------------------------------------------------------------------------
# (a) full application render (isotropic; see the note above on why uncropped)
# ---------------------------------------------------------------------------
ax_main = img_axes(MARGIN, main_top, MAIN_W, MAIN_H)
ax_main.imshow(sr.rsvg_render(SVG, MAIN_W * st.DPI),
               interpolation="none", aspect="auto")
heading(MARGIN, TOP_IN, "a", "Full view")
ov.text(COL_X, FIG_H - TOP_IN - TITLE_H / 2,
        f"Insets \u00d7{MAGURATION:.2f} over (a)",
        fontsize=st.PANEL_TITLE, fontweight="bold", va="center", ha="left",
        color=st.INK, zorder=56)

MARK = st.ARROW
box_geom = {}
for key in ("1", "2"):
    wx, wy, ww, wh = windows[key]
    # canvas units -> page inches, isotropically (1 canvas unit = U_IN inches)
    mx, my = MARGIN + wx * U_IN, main_top + wy * U_IN
    mw, mh = ww * U_IN, wh * U_IN
    box_geom[key] = (mx, my, mw, mh)
    frame(mx, my, mw, mh, r=0.05, ec=MARK, lw=st.LW_GENE, dashed=True,
          z=51, knockout=2.2)
    ov.add_patch(Circle((mx, FIG_H - my), 0.105, facecolor=st.CANVAS,
                        edgecolor=MARK, linewidth=st.LW_GENE + 0.3, zorder=54))
    ov.text(mx, FIG_H - my, key, fontsize=st.PANEL_TITLE, fontweight="bold",
            ha="center", va="center", color=MARK, zorder=55)

# ---------------------------------------------------------------------------
# (b)/(c) claim-fitted, vector-magnified insets in the right column
# ---------------------------------------------------------------------------
y_cursor = main_top
for _row, (key, letter) in enumerate((("1", "b"), ("2", "c"))):
    wx, wy, ww, wh = windows[key]
    h = ins_h[key]
    y_cursor += head_plan[key]["h"]
    ax = img_axes(COL_X, y_cursor, COL_W, h)
    ax.imshow(sr.rsvg_render(SVG, COL_W * st.DPI, box=(wx, wy, ww, wh)),
              interpolation="none", aspect="auto")
    frame(COL_X - KEY_PAD, y_cursor - KEY_PAD, COL_W + 2 * KEY_PAD,
          h + 2 * KEY_PAD, r=0.04, ec=st.INK, lw=st.LW_TUBE)

    # One leader per inset, from the box corner nearest the inset's own end of
    # the column: the upper inset is tied by the boxes' top corners and the
    # lower by their bottom corners, which keeps the two lines monotone in y and
    # therefore unable to cross even though these crops overlap on the canvas.
    mx, my, mw, mh = box_geom[key]
    if _row == 0:
        src, dst = (mx + mw, my), (COL_X, y_cursor)
    else:
        src, dst = (mx + mw, my + mh), (COL_X, y_cursor + h)
    ov.add_line(Line2D([src[0], dst[0]], [FIG_H - src[1], FIG_H - dst[1]],
                       color=st.GUIDE, linewidth=st.LW_GUIDE,
                       linestyle=(0, (1.8, 2.0)), zorder=51))

    heading(COL_X, y_cursor - head_plan[key]["h"], letter, LABELS[key],
            plan=head_plan[key])
    y_cursor += h + GAP

# ---------------------------------------------------------------------------
# statistics card, closing the right column
# ---------------------------------------------------------------------------
card_top = main_top + col_total - card_h
frame(COL_X, card_top, COL_W, card_h, r=0.055, ec=st.TUBE_EDGE, fc=st.CARD_FILL)
ax_sb = img_axes(COL_X, card_top, COL_W, card_h, z=53)
ax_sb.set_xlim(0, 1)
ax_sb.set_ylim(0, 1)

events = [("Speciation", stats["speciation"]),
          ("Duplication", stats["duplication"]),
          ("Leaf", stats["leaf"]),
          ("Loss", stats["loss"]),
          ("Transfer", stats["transfer"])]
scope = [("Species", stats["species"]),
         ("Families", stats["families"]),
         ("Xfer pairs", stats["transferPairs"])]

# Vertical budget in points, down from the card's top edge. The heading gets
# real air — CLR to the border above it and CLR to its rule below; half a row
# pitch leaves an 8.8 pt heading all but touching both. The eight rows then
# share what is left at one pitch each, and the group rule sits midway between
# the two blocks, three quarters of a pitch off either.
H_pt = card_h * 72.0
half_head = 0.56 * (st.MIN_TEXT + 0.8)    # half the heading's line box, pt
half_row = 0.56 * st.MIN_TEXT             # half a row's line box, pt
CLR = 3.5                                 # pt of air at the border and the rules
band = CLR + 2 * half_head + CLR          # border -> heading -> heading rule
pitch = (H_pt - band - half_row - CLR) / 8.0
lh = pitch / H_pt
X0, X1 = 0.075, 0.925

ax_sb.text(X0, 1 - (CLR + half_head) / H_pt, f"Events (n = {stats['geneNodes']})",
           fontsize=st.MIN_TEXT + 0.8, fontweight="bold", va="center",
           ha="left", color=st.INK)
ax_sb.plot([X0, X1], [1 - band / H_pt] * 2, color=st.GUIDE,
           linewidth=st.LW_GUIDE)


def card_row(step, name, count):
    yy = 1 - band / H_pt - step * lh
    ax_sb.text(X0, yy, name, fontsize=st.MIN_TEXT, va="center", ha="left",
               color=st.INK)
    ax_sb.text(X1, yy, str(count), fontsize=st.MIN_TEXT, va="center",
               ha="right", color=st.INK)


for k, (name, count) in enumerate(events):
    card_row(0.5 + k, name, count)
ax_sb.plot([X0, X1], [1 - band / H_pt - 5.25 * lh] * 2, color=st.GUIDE,
           linewidth=st.LW_GUIDE)
for k, (name, count) in enumerate(scope):
    card_row(6.0 + k, name, count)

# ---------------------------------------------------------------------------
# glyph key along the bottom
# ---------------------------------------------------------------------------
handles = [st.glyph_handle("tube", "Species tube"),
           st.glyph_handle("gene-edge", "Gene-tree edge"),
           st.glyph_handle("spec", "Speciation"),
           st.glyph_handle("leaf", "Leaf"),
           st.glyph_handle("dup", "Duplication"),
           st.glyph_handle("loss", "Loss")]
ax_leg = fig.add_axes([MARGIN / FIG_W, (FIG_H - key_top - LEG_H) / FIG_H,
                       MAIN_W / FIG_W, LEG_H / FIG_H], zorder=53)
ax_leg.set_axis_off()
ax_leg.legend(handles=handles, loc="center", bbox_to_anchor=(0.5, 0.5),
              ncol=6, **st.LEGEND_KW)

# ---------------------------------------------------------------------------
# Final self-check on the delivered page: no line of type inside the trim
# ---------------------------------------------------------------------------
_canvas = FigureCanvasAgg(fig)               # measure the page as it will print
_canvas.draw()                               # ... after the legends have placed
_r = _canvas.get_renderer()
_offenders = []


def _edge_clearance(t):
    """inches from this text's line box to the nearest edge of the page."""
    x0, y0, x1, y1 = np.asarray(t.get_window_extent(renderer=_r).extents) / fig.dpi
    return min(x0, y0, FIG_W - x1, FIG_H - y1)


def _all_texts():
    """every line of type on the page, including legend entries."""
    for t in ov.texts:
        yield t
    for _ax in fig.axes:
        for t in _ax.texts:
            yield t
        leg = _ax.get_legend()
        if leg is not None:
            for t in leg.get_texts():
                yield t


for _t in _all_texts():
    _d = _edge_clearance(_t)
    if _d < MARGIN - 1e-9:
        _offenders.append((_t.get_text(), _d * 72.0))
if _offenders:
    raise SystemExit(
        "type inside the trim: " + ", ".join(
            "%r at %.2f pt from a page edge (declared margin %.1f pt)"
            % (s, d, MARGIN * 72) for s, d in sorted(_offenders, key=lambda t: t[1])))

st.save(fig, __file__)
print(f"figure {FIG_W} x {FIG_H:.2f} in @ {st.DPI} dpi")
print(f"  (a) {MAIN_W:.2f} x {MAIN_H:.2f} in (full canvas; measured blank head "
      f"{BLANK_HEAD_U:.0f} u = {BLANK_HEAD_U*U_IN*72:.1f} pt, foot {BLANK_FOOT_U:.0f} u "
      f"— kept because the inset column, not (a), sets page height)   column {COL_W:.2f} in wide")
print(f"  canvas {CW:.0f} x {CH:.0f} u; {N_LABELS} tip labels of {LABEL_UNITS:g} u "
      f"print at {LABEL_PT:.2f} pt em on a MEASURED {TIP_PITCH_PT:.2f} pt pitch")
print(f"  name ink row measured at y {NAME_BAND[0]:.0f}-{NAME_BAND[1]:.0f} u; "
      f"{len(NAME_COMB)} ink columns on a {TIP_PITCH_U:.1f} u pitch with a "
      f"{COMB_GAP:.1f} u blank between them; window snapped to "
      f"{INSET_PITCHES} pitches = {WIN_W:.1f} u so both frames share one phase")
print(f"  insets magnify x{MAGURATION:.4f} (target em {INSET_EM_TARGET:.2f} pt), "
      f"so their names print at {LABEL_PT * MAGURATION:.2f} pt em")
for _letter, _c in sorted(_carrier.items()):
    print(f"  ({_letter}) DELIVERED crop: {_c['columns']} species columns, "
          f"measured ink {_c['ink_pt']:.2f} pt on a {_c['pitch_pt']:.2f} pt pitch "
          f">= floor {INSET_TIP_PT:.2f} pt; outermost column keeps "
          f"{_c['edge_pt']:.2f} pt of blank from the keyline and is "
          f"{100 * _c['ratio']:.0f}% as wide as its neighbours "
          f"(>= {100 * INSET_COL_RATIO:.0f}% required)")
# Recorded so the checker and the legend quote one measured source of truth.
with open(os.path.join(BUILD, "figure2-typography.json"), "w") as fh:
    json.dump({"canvas_units": [CW, CH], "panel_a_in": [MAIN_W, MAIN_H],
               "panel_a_ink_band_u": [INK_V0_U, INK_V1_U],
               "panel_a_blank_head_u": BLANK_HEAD_U, "panel_a_blank_foot_u": BLANK_FOOT_U,
               "figure_in": [FIG_W, FIG_H],
               "tip_labels": N_LABELS, "label_units": LABEL_UNITS,
               "label_pt_em": LABEL_PT, "tip_pitch_pt": TIP_PITCH_PT,
               "tip_pitch_u_measured": TIP_PITCH_U,
               "name_ink_band_u": list(NAME_BAND),
               "name_ink_comb": {"columns": len(NAME_COMB),
                                 "pitch_u": TIP_PITCH_U, "gap_u": COMB_GAP,
                                 "read_at_px": COMB_PX},
               "inset_window_u_units": WIN_W, "inset_pitches": INSET_PITCHES,
               "inset_floor_pt": INSET_TIP_PT, "inset_em_target_pt": INSET_EM_TARGET,
               "inset_edge_clear_pt": INSET_EDGE_CLEAR_PT,
               "inset_edge_clear_measured_pt": {
                   ("b" if k == "1" else "c"): edge_clear_pt[k] for k in windows},
               "inset_pt": {("b" if k == "1" else "c"): LABEL_PT * MAG[k]
                            for k in windows},
               "inset_magnification": {("b" if k == "1" else "c"): MAG[k]
                                       for k in windows},
               "inset_window_u": {("b" if k == "1" else "c"): list(windows[k])
                                  for k in windows},
               "inset_title": {("b" if k == "1" else "c"): LABELS[k]
                               for k in windows},
               "inset_carrier_measured": _carrier,
               "inset_inventory": {("b" if k == "1" else "c"):
                                   inventory(windows[k]) for k in windows}},
              fh, indent=1)
if LABEL_PT < st.MIN_TEXT:
    print(f"  NOTE tip labels in panel (a) are below the {st.MIN_TEXT} pt floor: {N_LABELS} "
          f"rotated names share a measured {TIP_PITCH_PT:.2f} pt pitch, so no label size "
          f"that fits the canvas reaches it. The legend must say so and point to the insets.")

print(f"data: {SVG}")
print(f"  render glyph counts, read off the elements: "
      + ", ".join("%s=%d" % (k, v) for k, v in KIND_COUNT.items())
      + f", tip labels={len(TIPS)}")
for k in ("1", "2"):
    wx, wy, ww, wh = windows[k]
    print(f"  ({'b' if k == '1' else 'c'}) viewBox {wx:.0f},{wy:.0f} "
          f"{ww:.0f}x{wh:.0f}  ar {ww / wh:.2f}  panel {COL_W:.2f}x{ins_h[k]:.2f} in"
          f"  x{(COL_W / ww) / (MAIN_W / CW):.2f}")
    print(f"      {LABELS[k]!r} proves it with "
          + ", ".join("%s=%d" % (n, v) for n, v in inventory(windows[k]).items())
          + f"   inked {100 * crop_fill(windows[k])[0]:.1f}% of its area")
