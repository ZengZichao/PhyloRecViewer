"""Rasterise an SVG through `rsvg-convert` and read it back as a NumPy array.

Used by the Fig. 2 assembly to (a) measure where the application actually drew
its gene tree, so the inset windows are fitted to real content rather than to
hard-coded coordinates, and (b) re-render a crop of the SAME vector source at
the inset's pixel size, so an inset is a magnification of the vector drawing and
not an enlargement of a bitmap.

`box` is given in SVG user units, matching the source's own viewBox.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

RSVG = shutil.which("rsvg-convert")

_VIEWBOX = re.compile(r'viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"')
_ROOT = re.compile(r"<svg\b[^>]*>")
_ATTR = re.compile(r'\b(width|height)="[\d.]+(px)?"')


def _resize_root(svg_text: str, w: float, h: float) -> str:
    """Set the root <svg> intrinsic width/height to the crop size (w x h units).

    The app's own render carries width="<canvas>" height="<canvas>" alongside a
    matching viewBox; when we shrink the viewBox to a window we must shrink the
    intrinsic size too, or `rsvg-convert` letter-boxes the crop (see rsvg_render).
    If the root has no width/height they are inserted so the viewport still
    equals the viewBox and the map stays 1:1.
    """
    m = _ROOT.search(svg_text)
    if not m:
        raise SystemExit("crop: no <svg> root found to re-size")
    head = m.group(0)
    new_head, n = _ATTR.subn(lambda mm: f'{mm.group(1)}="{w:g}"'
                             if mm.group(1) == "width"
                             else f'height="{h:g}"', head, count=2)
    if n < 2:  # intrinsic size absent: append it so viewport == viewBox
        if 'width="' not in head:
            new_head = new_head[:-1] + f' width="{w:g}">'
        if 'height="' not in head:
            new_head = new_head[:-1] + f' height="{h:g}">'
    return svg_text[:m.start()] + new_head + svg_text[m.end():]


def _require() -> str:
    if not RSVG:
        raise SystemExit(
            "rsvg-convert (Librsvg) is required to assemble Fig. 2; install it "
            "with `brew install librsvg` and re-run."
        )
    return RSVG


def viewBox(svg_path: str | Path) -> tuple[float, float, float, float]:
    """The source SVG's own user-unit canvas."""
    m = _VIEWBOX.search(Path(svg_path).read_text(encoding="utf-8"))
    if not m:
        raise SystemExit(f"{svg_path}: no viewBox=\"0 0 W H\" found")
    return tuple(float(g) for g in m.groups())  # type: ignore[return-value]


def _render(svg_text: str, px: int, ratio: float) -> np.ndarray:
    exe = _require()
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "in.svg"
        dst = Path(td) / "out.png"
        src.write_text(svg_text, encoding="utf-8")
        subprocess.run(
            [exe, "-f", "png", "-w", str(int(px)), "-h", str(int(px * ratio)),
             "--background-color", "white", str(src), "-o", str(dst)],
            check=True,
        )
        with Image.open(dst) as im:
            return np.asarray(im.convert("RGB"))


def rsvg_render(svg_path: str | Path, px: int,
                box: tuple[float, float, float, float] | None = None) -> np.ndarray:
    """Render `svg_path` `px` wide (or the `box` crop `px` wide) as an RGB array.

    A crop rewrites the `viewBox` AND the `width`/`height` attributes together.
    Leaving the root `width`/`height` at the full canvas while shrinking the
    `viewBox` to the window makes `rsvg-convert` letter-box the crop through the
    default `preserveAspectRatio="xMidYMid meet"`, so the window is not what is
    actually magnified and the delivered raster packs far more columns (and a
    squashed, anisotropic one) than the crop claims — measured in Fig. 2: an
    inset window of 690 units rendered 28 species columns at 2.7 pt instead of
    the 11 columns at 7 pt its own guard computed.  Setting width/height to the
    crop size makes the viewBox map 1:1 to the viewport, so `-w`/`-h` is a pure
    isotropic scale of exactly the requested window.
    """
    text = Path(svg_path).read_text(encoding="utf-8")
    if box is None:
        _, _, w, h = viewBox(svg_path)
        return _render(text, px, h / w)
    x, y, w, h = box
    if w <= 0 or h <= 0:
        raise SystemExit(f"degenerate crop box {box!r}")
    crop = _VIEWBOX.sub(f'viewBox="{x:g} {y:g} {w:g} {h:g}"', text, count=1)
    if crop == text:
        raise SystemExit(f"{svg_path}: cannot rewrite viewBox for a crop")
    # Re-tune the intrinsic width/height to the crop so the viewBox maps 1:1.
    crop = _resize_root(crop, w, h)
    return _render(crop, px, h / w)


def colour_mask(rgb: np.ndarray, colour: tuple[int, int, int], tol: int = 40) -> np.ndarray:
    """Pixels within `tol` (Chebyshev distance) of `colour`, i.e. one drawn hue."""
    target = np.array(colour, dtype=np.int16)
    return np.abs(rgb.astype(np.int16) - target).max(axis=2) <= tol
