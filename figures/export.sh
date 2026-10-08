#!/bin/bash
# export.sh — render each SVG-carried manuscript figure to its delivery
# carriers from ONE vector source:
#
#   1. a 1,200-dpi PNG whose resolution is recorded in the file
#      (rsvg-convert, librsvg),
#   2. a 1,200-dpi TIFF derived from that PNG (MBE's accepted bitmap list is
#      .tif/.eps/.ppt/.xls/.doc/.pdf/.gif/.jpg and does NOT include PNG, so the
#      raster master must also exist as a TIFF).  It is written by
#      phylorec_style.png_to_tiff(), which picks the smallest lossless TIFF
#      codec — Deflate or LZW — and only accepts one whose decoded pixels are
#      exactly the source pixels.  A stored-uncompressed master of a 6.5 in
#      page at 1,200 dpi is 95-260 MB, which is not a shippable carrier; flat
#      tube-map line art collapses to single-digit MB losslessly, so a clean
#      clone produces shippable carriers by default.  Pass --no-tiff to skip it.
#   3. a vector PDF whose page width is exactly 166 mm, the article's text
#      block (CairoSVG), so no placement scaling is applied and a label's
#      size on the page is its size in the article.
#
# The PNG and TIFF are pictures of the same vector source as the PDF, which is
# what keeps the carriers of one figure in agreement.
#
# Usage: ./export.sh [--no-tiff] [figure-base ...]
#   With no figure arguments, all five SVG-carried main figures are rendered.
#   (Fig. 2 and Supplementary Fig. S1 are matplotlib-carried: their PNG, PDF
#   and TIFF are written next to their scripts by st.save(), which uses the same
#   lossless TIFF master as this script does.)
#
# Carrier inventory, stated here because the audit asked whether Fig. 2 is
# missing an SVG (ISSUE-150).  It is not: a figure has an SVG carrier only when
# an SVG is what the PDF and PNG are pictures OF, and for Fig. 2 nothing of the
# kind is authored.  The delivered set for Fig. 2 is PDF + PNG + TIFF, written
# by PhyloRecViewer-手稿正文-图2.py via phylorec_style.save(); its vector input,
# figures/_build/figure2-app-print.svg, is the application's own scene render of
# the reference case, which that script rasterizes and crops and which is
# therefore a build intermediate, not a carrier of the composed figure.  Figs. 1
# and 3-6 deliver SVG + PDF + PNG + TIFF from this script, and Supplementary
# Fig. S1 delivers PDF + PNG + TIFF.  Supplementary Note S6 of the article says
# the same thing ("Figs. 1, 3, 4, 5 and 6 are emitted as SVG ...; Fig. 2 is
# produced in two stages"), and no text in the article, the supplement or the
# letter offers a Fig. 2 SVG.  Emitting one would put a carrier on the delivery
# list that the reproducibility note does not describe and that no downstream
# step consumes.
#
# Everything is resolved relative to THIS script's directory, so the pipeline
# runs from any working directory and never reads or writes outside the
# repository.  PR_FIG_OUT relocates the carriers for a scratch run; PYTHON picks
# the interpreter (default: the first python3 on PATH that has Pillow +
# CairoSVG, falling back to /opt/homebrew/bin/python3).
set -euo pipefail
cd "$(dirname "$0")"
HERE="$PWD"
OUT="${PR_FIG_OUT:-$HERE}"

# --- pick an interpreter that can actually do the work -----------------------
PROBE='import PIL, cairosvg'
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for cand in python3 /opt/homebrew/bin/python3 /usr/bin/python3; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "$PROBE" >/dev/null 2>&1; then
      PY="$cand"; break
    fi
  done
fi
[ -n "$PY" ] || { echo "export.sh: no python3 with Pillow and CairoSVG found; set PYTHON=..." >&2; exit 1; }
command -v rsvg-convert >/dev/null 2>&1 || {
  echo "export.sh: rsvg-convert (Librsvg) is required; install it with \`brew install librsvg\`." >&2
  exit 1; }

DPI=1200
SKIP_TIFF=0
if [ "${1:-}" = "--no-tiff" ]; then SKIP_TIFF=1; shift; fi

DEFAULT_FIGS=(
  "PhyloRecViewer-手稿正文-图1"
  "PhyloRecViewer-手稿正文-图3"
  "PhyloRecViewer-手稿正文-图4"
  "PhyloRecViewer-手稿正文-图5"
  "PhyloRecViewer-手稿正文-图6"
)

figs=("$@")
[ "${#figs[@]}" -eq 0 ] && figs=("${DEFAULT_FIGS[@]}")

mkdir -p "$OUT"
for base in "${figs[@]}"; do
  svg="$HERE/$base.svg"
  [ -f "$svg" ] || { echo "export.sh: missing $svg" >&2; exit 1; }
  rsvg-convert -d "$DPI" -p "$DPI" -o "$OUT/$base.png" "$svg"
  # rsvg-convert rasterizes at the requested density but does not record it;
  # write the resolution into the PNG (pHYs) so the file carries it.
  "$PY" - "$OUT/$base.png" "$DPI" <<'PYEOF'
import sys
from PIL import Image
path, dpi = sys.argv[1], int(sys.argv[2])
im = Image.open(path)
im.save(path, dpi=(dpi, dpi))
PYEOF
  # 1,200 dpi TIFF master, losslessly recompressed and pixel-verified by
  # phylorec_style.png_to_tiff() — the same code path st.save() uses.
  codec="skipped (--no-tiff)"
  if [ "$SKIP_TIFF" -eq 0 ]; then
    codec="$("$PY" - "$HERE" "$OUT/$base.png" "$OUT/$base.tif" "$DPI" <<'PYEOF'
import sys, os
sys.path.insert(0, os.path.abspath(sys.argv[1]))   # the figures/ module directory
import phylorec_style as st
print(st.png_to_tiff(sys.argv[2], sys.argv[3], int(sys.argv[4])))
PYEOF
)"
  fi
  "$PY" - "$svg" "$OUT/$base.pdf" <<'PYEOF'
import sys
import cairosvg
cairosvg.svg2pdf(url=sys.argv[1], write_to=sys.argv[2])
PYEOF
  echo "export.sh: $base.png ($DPI dpi) + $base.tif ($DPI dpi, TIFF codec: $codec) + $base.pdf (166 mm) <- $svg"
done
