#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""phylorec_style.py — single source of truth for the manuscript figures.

This module and every script that uses it live in `figures/` inside the software
repository, so the code that generates the article's figures is released with the
software it depicts rather than held back as an editorial artefact.

Shared by the hand-authored SVG figures (PhyloRecViewer-手稿正文-图1-6.py),
the Fig. 2 composition (PhyloRecViewer-手稿正文-图2.py) and Supplementary
Fig. S1 (PhyloRecViewer-手稿附件-附图1.py): page width, type floor, line
weights, colour tokens and the TIFF master, so the figures cannot drift apart
and cannot ship a carrier nobody can move.

The colour tokens and the two mapping functions at the bottom of this file
mirror the values the application itself draws with: the family/event colours
are `src/render/theme.ts` (`OKABE_ITO[0]` plus `eventLight`), the gene-tree
glyphs are filled with the FAMILY colour and separated by RADIUS only
(`src/render/Scene.tsx:819-823`), the copy-number heat ramp is
`lerpHex(speciesFill, event.duplication, t)` (`Scene.tsx:391-399`), and the
transfer-network encodings are `networkEdgeWidth`
(`src/render/geometry.ts:127-129`) and `nodeR = 4 + 8*weight/maxWeight`
(`src/app/RightPanel.tsx:815,879`).  Nothing here is measured off a delivered
figure: the module is the forward source, and the figures are re-generated from
it.

`apply_style()` resets matplotlib to `matplotlibrc` defaults (and clears any
style sheet a third-party package pushed) BEFORE it applies this module's
rcParams, so the ambient environment cannot restyle a published figure.  1 SVG
unit = PRINT_MM / 1440 mm = 0.3267 pt.
"""
import os

# Importing this module must happen BEFORE matplotlib is imported by the
# caller: clear any ambient MPLSTYLE so a user-wide style sheet is not even
# read.  This is belt-and-braces only: apply_style() is what actually isolates
# the figures from a style a third-party package registers at import time
# (pyrolite installs a prop_cycle and its own rc sheet on this machine).
os.environ.pop("MPLSTYLE", None)

# --------------------------------------------------- repository confinement --
# Every carrier these scripts write is repository content.  confine_to_repo()
# turns that invariant into an enforced one: a stray PR_FIG_OUT / PR_ALT_DIR /
# PR_BUILD_DIR override, or a caller-supplied path, cannot land a file outside
# the project.  The figure scripts resolve every write through it.
_REPO_ROOT = os.path.realpath(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def confine_to_repo(path):
    """resolve `path`; raise ValueError unless it stays inside the repository.

    Returns the resolved path, so callers should write through the return value
    rather than the original argument.
    """
    resolved = os.path.realpath(os.path.abspath(path))
    if resolved != _REPO_ROOT and not resolved.startswith(_REPO_ROOT + os.sep):
        raise ValueError("refusing to write outside the repository: %s" % (path,))
    return resolved


# --------------------------------------------------------------- page setup --
PRINT_MM = 166.0                    # the article's text block, MBE single column
PRINT_IN = PRINT_MM / 25.4          # 6.5354 in
PAGE_MARGIN_IN = 0.0833             # 6 pt inner margin inside the figure edge
DPI = 1200                          # line-art raster resolution (MBE)

# ------------------------------------------------------------ type ladder ----
# All sizes are points.  The two export paths are unified on ONE ladder so the
# article has a single "uniform lettering" floor: the SVG figures set type on a
# whole-unit grid, so their smallest rung (u(7.19) = 22 u) prints at 7.188 pt and
# the panel letter (u(9.15) = 28 u) at 9.15 pt; the matplotlib figures are now
# authored at those same measured values rather than the round 7.00 / 9.00, so
# both paths deliver 7.19 pt body and 9.15 pt letters (F-04-14).
MIN_TEXT = 7.19       # subtitles, legends, secondary labels (floor)
LABEL_TEXT = 7.5      # primary labels (species names, node names)
PANEL_TITLE = 8.0     # panel heading text
PANEL_LETTER = 9.15   # bold "(a)" panel letter (matches the SVG unit ladder)
TICK_TEXT = 7.5       # matplotlib axis tick labels (Fig. S1)
FONT_FAMILY = ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"]

# ------------------------------------------------------------ line weights ---
# In the SVG figures these are user units (clamped to SW_MIN by the drawing
# primitives); in the matplotlib figures the same numbers are points.
SW_MIN = 1.7          # smallest stroke that survives a 400 lpi screen (units)
LW_TUBE = 1.7         # species-tube outline
LW_GENE = 2.4         # gene-tree edge
LW_GUIDE = 1.2        # guides / grids (SVG paths clamp to SW_MIN)

# Application-to-print stroke factor.  The interface draws transfer edges in
# CSS pixels (1 px = 0.75 pt) and one figure unit is 0.3267 pt, so a px value
# becomes px * 0.75 / 0.3267 = 2.2 units at the article's text block.  Every
# figure that mirrors an interface line weight uses this one number.
PRINT_FACTOR = 2.2


def sw():
    """smallest stroke width the SVG primitives will emit, in user units."""
    return SW_MIN


# ----------------------------------------------------------------- colours ---
# Ink ramp.
INK = "#141A21"       # primary text / keylines
INK2 = "#3C4653"      # secondary text
HAIR = "#E1E5EA"      # hairlines, panel separators
GUIDE = "#AEB6C0"     # guides, gridlines, muted structure
CANVAS = "#FFFFFF"

# Species tube (the application's theme species fill/stroke at print weight;
# this pair is also the print override declared in the Fig. 2 legend).
TUBE_F = "#E9E9EE"
TUBE_EDGE = "#D9D9E0"
CARD_FILL = "#FFFFFF"  # statistics card ground (Fig. 2)

# Application colours (src/render/theme.ts, read at print weight).
# APP_GENE is the family colour OKABE_ITO[0]; the application fills both
# speciation and leaf glyphs with it, so in these figures the two differ by
# RADIUS ONLY (Scene.tsx:819-823) and no second blue is introduced.
APP_GENE = "#0072B2"   # gene-tree edge / family colour (OKABE_ITO[0])
APP_LEAF = "#0072B2"   # leaf discs: same hue as APP_GENE, larger radius
APP_DUP = "#F97316"    # duplication  (theme.event.duplication)
APP_DUP_L = "#FBEAD9"  # disagreement highlight fill
APP_DONOR = "#7C3AED"  # transfer donor ring / transfer arcs
                     # (theme.event.branchingOut, .transferBack)
APP_LOSS = "#9CA3AF"   # loss cross     (theme.event.loss)
APP_BIFURC = "#10B981"  # bifurcation-out diamond (theme.event.bifurcationOut)
APP_AMBER = "#D97706"  # warm accent (lane ramp legend)
APP_PINK = "#C2417E"   # state-store accent (Fig. 5)
APP_SLATE = "#64748B"  # platform-bar accent (Fig. 5)
ARROW = "#C2410C"      # inset / region markers (Fig. 2)

# The lane-count heat ramp itself is derived below, next to lerp_hex(), from
# the two tokens above; index 0 is padding and index i carries i lanes.
HEAT_N = 6

# Fig. S1 measurement series (the three scaling stages, in the family colours
# above: parse = gene-tree blue, layout = duplication orange, scene = green).
C_GENE = APP_GENE
C_DUP = APP_DUP
C_GREEN = APP_BIFURC


def _rgb_hex(value, name):
    """parse one #RRGGBB colour, with an error that names what it got."""
    if not isinstance(value, str):
        raise ValueError(
            f"phylorec_style: {name} must be a '#RRGGBB' string, got "
            f"{type(value).__name__} {value!r} (matplotlib named colours such "
            f"as 'white' are not accepted here)")
    s = value.strip()
    if not (s.startswith("#") and len(s) in (4, 7)):
        raise ValueError(
            f"phylorec_style: {name} must be a '#RRGGBB' (or '#RGB') string, "
            f"got {value!r} — pass '#FFFFFF' rather than a named colour")
    digits = s[1:] * (1 if len(s) == 7 else 2)
    try:
        return [int(digits[i:i + 2], 16) for i in (0, 2, 4)]
    except ValueError:
        raise ValueError(
            f"phylorec_style: {name} has non-hex digits: {value!r}") from None


def lerp_hex(c1, c2, t):
    """linear blend between two #RRGGBB colours, t in [0, 1]."""
    a, b = _rgb_hex(c1, "c1"), _rgb_hex(c2, "c2")
    if not 0.0 <= float(t) <= 1.0:
        raise ValueError(f"phylorec_style: lerp_hex t must be in [0, 1], got {t!r}")
    m = [round(a[i] + (b[i] - a[i]) * t) for i in range(3)]
    return "#%02X%02X%02X" % tuple(m)


def heat_ramp(n=HEAT_N):
    """the copy-number ramp as #RRGGBB strings: index 0 unused, index i = i lanes.

    Derived the way the application derives a tube shade — `lerpHex(speciesFill,
    event.duplication, t)` with t = (lane-1)/(maxLane-1), Scene.tsx:391-399 — so
    the ramp is a function of TUBE_F and APP_DUP rather than a hand-tuned
    palette.  The application normalises by the busiest species in the current
    drawing; a printed legend needs an absolute key, so the denominator here is
    fixed at the ramp length and index 1 is the unshaded tube.
    """
    return tuple([TUBE_F] + [lerp_hex(TUBE_F, APP_DUP, (i - 1) / (n - 2.0))
                             for i in range(1, n)])


HEAT = heat_ramp()


def heat_shade(lane, max_lane):
    """the tube shade the interface gives a species carrying `lane` copies.

    Same expression as Scene.tsx:397 — `lerpHex(speciesFill, event.duplication,
    t)` with t = (lane-1)/(maxLane-1) — so the busiest species in a drawing
    takes the full duplication colour and a single-copy species stays unshaded.
    """
    t = 0.0 if max_lane <= 1 else (lane - 1) / (max_lane - 1.0)
    return lerp_hex(TUBE_F, APP_DUP, t)


# ------------------------------------------------- application encodings ----
def network_edge_width(count):
    """the application's transfer-edge step function (geometry.ts:127-129).

    Deliberately not normalised by the busiest pair, so the count is readable
    off the drawing: 1 transfer -> 1 px, 6 or more saturate at 6 px.
    """
    return 1 + min(5, max(0, round(count) - 1))


def network_edge_units(count, scale=1.0):
    """network_edge_width() expressed in figure user units at print scale."""
    return network_edge_width(count) * PRINT_FACTOR * scale


def network_node_radius(weight, max_weight):
    """the application's network-node disc radius (RightPanel.tsx:815)."""
    return 4.0 + 8.0 * ((weight or 0) / max(1.0, max_weight))


# -------------------------------------------------------- matplotlib glue ----
def apply_style():
    """rcParams for the matplotlib-carried figures (Figs. 2 and S1).

    Call once after importing matplotlib and before building any axes.  The
    SVG figures never touch matplotlib; they read the constants above.

    The reset is the point: a package that installs a matplotlib style on this
    machine (pyrolite registers a prop_cycle and an rc sheet) otherwise paints
    over this module, and the figure would be drawn with the environment's
    colours rather than the article's.  rc_file_defaults() restores the
    matplotlibrc values — keeping the already-selected backend — and any style
    stack a legacy matplotlib left behind is cleared, before the module's own
    rcParams are applied.
    """
    import matplotlib
    matplotlib.rc_file_defaults()
    try:  # matplotlib < 3.x kept a public-ish stack; harmless if absent
        import matplotlib.style as _mstyle
        for _name in ("stack", "_stack"):
            _stack = getattr(_mstyle, _name, None)
            if isinstance(_stack, list):
                _stack.clear()
    except Exception:  # pragma: no cover - version-dependent internals
        pass
    from cycler import cycler
    matplotlib.rcParams.update({
        "font.family": FONT_FAMILY,
        "font.size": MIN_TEXT,
        # vector text stays text: Type42/Type0 in the PDF (never Type3) and
        # real <text> nodes in SVG, so the 7 pt floor is checkable for every
        # label the figure carries, including the annotated ones.
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "svg.fonttype": "none",
        # the module, not the environment, owns the colour cycle.
        "axes.prop_cycle": cycler(color=[APP_GENE, APP_DUP, APP_BIFURC,
                                         APP_DONOR, APP_LOSS, APP_AMBER]),
        "axes.edgecolor": GUIDE,
        "axes.linewidth": LW_GUIDE,
        "axes.labelcolor": INK,
        "text.color": INK,
        "xtick.color": INK2,
        "ytick.color": INK2,
        "figure.facecolor": CANVAS,
        "savefig.facecolor": CANVAS,
    })


def glyph_handle(kind, label):
    """a legend handle drawn in the application's glyph grammar (Fig. 2 key)."""
    from matplotlib.lines import Line2D
    styles = {
        "tube": dict(color=TUBE_F, marker="s", ms=9, mec=TUBE_EDGE, mew=0.9,
                     ls="-", lw=LW_TUBE),
        "gene-edge": dict(color=APP_GENE, lw=LW_GENE, ls="-"),
        # speciation and leaf share APP_GENE and differ by radius only.
        "spec": dict(color=APP_GENE, marker="o", ms=5.5, ls="none"),
        "leaf": dict(color=APP_GENE, marker="o", ms=8, ls="none"),
        "dup": dict(color=APP_DUP, marker="s", ms=7, ls="none"),
        "loss": dict(color=APP_LOSS, marker="x", ms=7, mew=1.6, ls="none"),
        "donor": dict(color=APP_DONOR, marker="o", ms=6.5, mfc="none",
                      mew=1.4, ls="none"),
        "network-node": dict(color=APP_GENE, marker="o", ms=7, ls="none"),
        "self-transfer": dict(color=APP_DONOR, marker="o", ms=7, mfc="none",
                              mew=1.4, ls="none"),
    }
    return Line2D([], [], label=label, **styles[kind])


LEGEND_KW = dict(frameon=False, fontsize=MIN_TEXT, handlelength=1.6,
                 handletextpad=0.5, columnspacing=1.1, borderaxespad=0.0)


def stroke():
    """white halo path-effect for labels drawn over data ink (Fig. S1 star).

    Use this for chrome that sits on top of data only.  Never use it on
    annotated data labels: a path effect turns the glyphs into a filled
    outline, so the text stops being selectable and drops out of the 7 pt
    type audit that is run over selectable text.
    """
    import matplotlib.patheffects as pe
    return [pe.withStroke(linewidth=1.6, foreground=CANVAS)]


def save(fig, source, outdir=None):
    """write a matplotlib figure's carriers: 1200-dpi PNG + PDF + TIFF.

    `source` is normally `__file__`; the carriers are named after it and land in
    `outdir`, which defaults to `PR_FIG_OUT` and otherwise to the directory of
    the script itself — inside `figures/`, i.e. inside the repository.  No
    sibling-directory assumption is made.

    The PDF is authored at exactly PRINT_IN wide, the article's text block,
    so a label's size on the page is its size in the article; the PNG carries
    the same resolution in its pHYs chunk.  A third, 1200-dpi TIFF is written
    because MBE's accepted bitmap list is .tif/.eps/.ppt/.xls/.doc/.pdf/.gif/.jpg
    and does NOT include PNG, so the raster master must also exist as a TIFF
    (F-04-13).  The TIFF is losslessly recompressed by `png_to_tiff()` below.
    """
    import os
    base = os.path.splitext(os.path.basename(source))[0]
    outdir = os.path.abspath(outdir or os.environ.get("PR_FIG_OUT")
                             or os.path.dirname(os.path.abspath(source)))
    outdir = confine_to_repo(outdir)
    os.makedirs(outdir, exist_ok=True)
    png = os.path.join(outdir, base + ".png")
    pdf = os.path.join(outdir, base + ".pdf")
    tiff = os.path.join(outdir, base + ".tif")
    fig.savefig(png, dpi=DPI)
    fig.savefig(pdf)
    _png_to_tiff(png, tiff, DPI)
    return png, pdf, tiff


# Lossless TIFF codecs PIL can write, in the order a press is most comfortable
# with.  Both Deflate variants and LZW are declared lossless in the TIFF
# registry, and the baseline tags a press rasteriser reads are untouched — only
# the per-strip compression changes.
TIFF_CODECS = ("tiff_deflate", "tiff_adobe_deflate", "tiff_lzw")


def _tiff_bytes(arr, dpi, compression):
    """one TIFF encoding of an RGB array, as bytes, with the dpi written in."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="TIFF", compression=compression,
                              dpi=(round(dpi[0]), round(dpi[1])), resolutionunit=2)
    return buf.getvalue()


def _pixels_and_dpi(path_or_buffer):
    """(RGB array, recorded dpi pair) of an image file or in-memory image."""
    import numpy as np
    from PIL import Image
    with Image.open(path_or_buffer) as im:
        return np.asarray(im.convert("RGB")), im.info.get("dpi")


def _dpi_pair(dpi):
    """normalise a dpi argument to a float pair."""
    if isinstance(dpi, (tuple, list)):
        return (float(dpi[0]), float(dpi[1]))
    return (float(dpi), float(dpi))


def _best_lossless_tiff(arr, dpi):
    """(bytes, codec) for the smallest lossless TIFF encoding of `arr`.

    A candidate is accepted only if decoding it reproduces `arr` exactly and its
    recorded dpi survives the round trip; otherwise it is discarded.  Returns
    (None, None) when no codec qualifies.
    """
    import io
    import numpy as np
    dpi_pair = _dpi_pair(dpi)
    best = None
    for codec in TIFF_CODECS:
        try:
            blob = _tiff_bytes(np.ascontiguousarray(arr), dpi_pair, codec)
            back, recorded = _pixels_and_dpi(io.BytesIO(blob))
        except Exception:                       # codec absent from this PIL build
            continue
        if back.shape != arr.shape or not bool((back == arr).all()):
            continue                            # not pixel-exact: reject the codec
        if not recorded or abs(_dpi_pair(recorded)[0] - dpi_pair[0]) > 1:
            continue                            # the dpi did not survive: reject it
        if best is None or len(blob) < len(best[0]):
            best = (blob, codec)
    return best if best else (None, None)


def png_to_tiff(png_path, tiff_path, dpi=DPI):
    """write the TIFF master: 1200-dpi RGB, losslessly compressed, verified.

    A stored-uncompressed 1200-dpi RGB TIFF of a 6.5 in figure is 95-260 MB,
    which is not a carrier anyone can ship or download.  Flat tube-map line art
    collapses by two orders of magnitude under Deflate/LZW, so each lossless
    codec is tried and the smallest one whose decoded pixels are EXACTLY equal
    to the source array — and whose recorded dpi survives the round trip — is
    written.  Verification is not optional: if no codec reproduces the pixels
    byte-for-byte, the uncompressed TIFF is written instead of a lossy one, and
    the figure is still delivered.  Returns the codec actually used.
    """
    arr, _ = _pixels_and_dpi(png_path)
    tiff_path = confine_to_repo(tiff_path)
    blob, codec = _best_lossless_tiff(arr, dpi)
    if blob is None:
        from PIL import Image
        with Image.open(png_path) as im:
            im.convert("RGB").save(tiff_path, format="TIFF", dpi=_dpi_pair(dpi),
                                   compression="none")
        return "none (no lossless codec round-tripped)"
    with open(tiff_path, "wb") as fh:
        fh.write(blob)
    return codec


def _png_to_tiff(png_path, tiff_path, dpi):
    """the TIFF master for a figure script: see png_to_tiff()."""
    return png_to_tiff(png_path, tiff_path, dpi)


def compress_tiff_in_place(tiff_path, limit=25 * 1024 * 1024):
    """recompress a delivered TIFF losslessly, from its own pixels; reports.

    Carriers written by an older revision (stored uncompressed) are rewritten
    without re-rendering anything.  Files at or under `limit` bytes are left
    alone.  `compress_carriers.py` is the command-line front for this.
    """
    import os
    tiff_path = confine_to_repo(tiff_path)
    raw_size = os.path.getsize(tiff_path)
    name = os.path.basename(tiff_path)
    if raw_size <= limit:
        return f"{name}: {raw_size / 1e6:.1f} MB, already small enough — left as is"
    arr, recorded = _pixels_and_dpi(tiff_path)
    blob, codec = _best_lossless_tiff(arr, recorded or DPI)
    if blob is None:
        return f"{name}: {raw_size / 1e6:.1f} MB, NO lossless codec reproduced the pixels — untouched"
    after, _ = _pixels_and_dpi(__import__("io").BytesIO(blob))
    if after.shape != arr.shape or not bool((after == arr).all()):
        return f"{name}: {raw_size / 1e6:.1f} MB, verification failed — untouched"
    with open(tiff_path, "wb") as fh:
        fh.write(blob)
    return (f"{name}: {raw_size / 1e6:.1f} MB -> {os.path.getsize(tiff_path) / 1e6:.1f} MB "
            f"({codec}, {100.0 * os.path.getsize(tiff_path) / raw_size:.1f} % of original, "
            f"pixels identical)")
