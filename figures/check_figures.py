#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_figures.py — gate every delivered figure against the article's
production constraints.  Run after export.sh (or after any figure script);
a figure that fails an assertion here is not accepted into the shipment.

Asserts, per figure:
  framing   PDF page width == 166 mm, the article's text block (+-0.3 mm);
  raster    the PNG carries a recorded 1,200 dpi resolution;
  agreement the PNG and the PDF are two carriers of one vector source, so
            their aspect ratios agree within 1 % (an earlier pipeline that
            exported them separately drifted by up to 5.6 %);
  fonts     every embedded font program is a subsetted TrueType (a
            "AAAAAA+Name" subset tag), none is Type3, all are HelveticaNeue;
  embed     every font resource carries a /FontFile, /FontFile2 or
            /FontFile3 stream somewhere in its object graph (DescendantFonts
            and FontDescriptor followed) — a non-embedded font fails;
  type3     no /Subtype /Type3 appears anywhere in the PDF, neither in an
            object dictionary nor in a decompressed content or glyph stream;
  trim      the closest text line box to any page edge clears the inner
            margin phylorec_style.PAGE_MARGIN_IN (6 pt) declares; the
            measured distance is printed for every figure either way;
  placed    every raster placed inside the PDF resolves to >= 1,100 dpi at
            its placed size (pixels / placed inches), not merely at the
            resolution the sibling PNG claims for itself;
  colour    no DeviceCMYK colour space is used anywhere in the PDF;
  type      the smallest text the audit can measure is >= 7 pt.

Two known, documented exemptions, both stated in the article itself:
  - Fig. 2 panel (a)'s species names are rasterized by the application, so
    no PDF text audit can measure them; their printed size (5.18 pt on a
    5.66 pt pitch) follows from the canvas geometry and is quoted in the
    figure legend, with the legible detail carried by the two x1.35 insets.
  - The SVG-carried figures (1, 3-6) set type on a whole-unit ladder, so
    their floor label measures 7.19 pt in the PDF, not exactly 7.00.

The trim and placed-dpi assertions are measurements of the delivered PDF,
not of the scripts that made it: a threshold that a figure misses is a fact
about that figure and is reported as a failure, never relaxed here.
"""
import glob
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import phylorec_style as st          # one source of truth for the margin

DPI = 1200
PAGE_W_MM = 166.0
TYPE_FLOOR_PT = 7.0
INNER_MARGIN_PT = st.PAGE_MARGIN_IN * 72.0    # 6.0 pt, as declared by the module
RASTER_FLOOR_DPI = 1100.0                     # MBE minimum for a placed raster

MAIN = sorted(glob.glob(os.path.join(HERE, "PhyloRecViewer-手稿正文-图[1-6].pdf")))
# Supplementary Fig. S1 is delivered beside the main figures now that the whole
# figure pipeline is repository content under `figures/` (ISSUE-062): the check
# set is unchanged — six main figures plus one supplementary — only its location
# moved from a sibling directory outside the repo to this one inside it.
SUPP = sorted(glob.glob(os.path.join(HERE, "PhyloRecViewer-手稿附件-附图*.pdf")))
PDFS = MAIN + SUPP
FAILURES = []


def check(cond, msg):
    tag = "ok " if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        FAILURES.append(msg)


def png_dpi(path):
    with open(path, "rb") as f:
        f.read(8)
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                return None
            length, ctype = struct.unpack(">I4s", hdr)
            if ctype == b"pHYs":
                x, _y, unit = struct.unpack(">IIB", f.read(9))
                return x * 0.0254 if unit == 1 else None
            f.seek(length + 4, 1)


def pdf_text(path):
    """the PDF as one latin-1 string: file bytes, every object dictionary and
    every decompressed stream.  Font and colour-space markers live in object
    dictionaries and in glyph streams, so a check that only reads the page
    content stream would miss both a Type3 resource and a CMYK colour space."""
    import fitz  # PyMuPDF
    with open(path, "rb") as fh:
        parts = [fh.read()]
    doc = fitz.open(path)
    for xref in range(1, doc.xref_length()):
        try:
            stream = doc.xref_stream(xref)
            if stream:
                parts.append(stream)
        except Exception:                 # non-stream object: dictionary only
            pass
        try:
            parts.append(doc.xref_object(xref, compressed=True)
                         .encode("latin-1", "ignore"))
        except Exception:
            pass
    doc.close()
    return b"\n".join(parts).decode("latin-1", "ignore")


def font_programs(path):
    """{base name: (subtype, embedded, font-file key)} for every font resource.

    `embedded` follows the font object through /DescendantFonts (a Type0 font
    delegates its glyph data to the CIDFont below it) and /FontDescriptor, and
    accepts any of /FontFile (Type1), /FontFile2 (TrueType) or /FontFile3
    (OpenType/CFF) as proof that the glyph program ships inside the PDF.
    """
    import fitz
    doc = fitz.open(path)
    out = {}
    for page in doc:
        for f in page.get_fonts(full=True):
            xref, _ext, subtype, base = f[0], f[1], f[2], f[3]
            out[base] = (subtype, False, "", xref)
    for base, (subtype, _e, _k, xref) in list(out.items()):
        seen, stack = set(), [(xref, 0)]
        key = ""
        while stack:
            x, depth = stack.pop()
            if x in seen or depth > 4:
                continue
            seen.add(x)
            try:
                obj = doc.xref_object(x, compressed=True)
            except Exception:
                continue
            for k in ("/FontFile2", "/FontFile3", "/FontFile"):
                if re.search(re.escape(k) + r"(?![23])", obj):
                    key = k
            for m in re.finditer(
                    r"/(?:FontDescriptor|DescendantFonts)\s*\[?\s*(\d+) \d+ R",
                    obj):
                stack.append((int(m.group(1)), depth + 1))
        out[base] = (subtype, bool(key), key, len(seen))
    doc.close()
    return out


def trim_clearance(path):
    """(min distance in pt, text sitting there) from any line of type to the
    nearest page edge, over all pages.

    The span box PyMuPDF reports is the font's line box (ascent + descent), so
    this is deliberately stricter than visible ink: it cannot report a label as
    safely inside the margin when its ink is closer than the box says.
    """
    import fitz
    doc = fitz.open(path)
    worst, who = float("inf"), ""
    for page in doc:
        rect = page.rect
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    d = min(x0, y0, rect.width - x1, rect.height - y1)
                    if d < worst:
                        worst, who = d, span["text"][:38]
    doc.close()
    return worst, who


def placed_rasters(path):
    """[(pixels wide, placed inches, effective dpi)] for every raster the PDF
    actually places — the dpi a press sees, which the sibling PNG's pHYs chunk
    says nothing about."""
    import fitz
    doc = fitz.open(path)
    out = []
    for page in doc:
        for info in page.get_image_info(xrefs=True):
            w_px = info["width"]
            placed_in = (info["bbox"][2] - info["bbox"][0]) / 72.0
            if placed_in <= 0:
                continue
            out.append((w_px, placed_in, w_px / placed_in))
    doc.close()
    return out


def pdf_fonts_and_colors(path):
    """(fonts, sizes, cmyk, npages) via PyMuPDF.

    `cmyk` is decided over pdf_text(), i.e. the whole file plus every
    decompressed stream: a /DeviceCMYK colour space can be declared in a
    shared XObject or colour-space dictionary rather than in the page content.
    """
    import fitz  # PyMuPDF
    doc = fitz.open(path)
    fonts = {}
    sizes = []
    for page in doc:
        for f in page.get_fonts(full=True):
            fonts[f[3]] = f[2]
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    sizes.append(span["size"])
    cmyk = "/DeviceCMYK" in pdf_text(path)
    n = doc.page_count
    doc.close()
    return fonts, sizes, cmyk, n


# ---------------------------------------------------------------------------
# New regression gates added after the figure audit (F-04-1/2/3/10/11/13):
# these catch defect classes the original ten checks could not see, because
# every one of them was measured off the SELECTABLE PDF text or the sibling PNG
# — none looked at glyph coverage inside an embedded font, at the labels that
# live inside a rasterised panel, or at two text objects sharing the same ink.
# ---------------------------------------------------------------------------
GLYPH_FLOOR_PT = 7.0                 # floor every delivered label must clear
MAX_TEXT_OVERLAP_PT2 = 1.0           # two drawn-text cap bands may not overlap more
INSET_RASTER_MAX_IN = 3.0            # a placed raster this narrow is an inset
NAME_COLOURS = ((0, 114, 178), (63, 63, 70))   # family blue, tip-name grey


def _ttf_cmap(buffer):
    """the set of unicode codepoints one embedded font program really has glyphs for."""
    from io import BytesIO
    from fontTools.ttLib import TTFont
    cps = set()
    tt = TTFont(BytesIO(buffer), lazy=True)
    if "cmap" in tt:
        for table in tt["cmap"].tables:
            try:
                cps.update(table.cmap.keys())
            except Exception:
                continue
    best = tt.getBestCmap()
    if best:
        cps.update(best.keys())
    return {c for c in cps if isinstance(c, int)}


def embedded_codepoints(doc):
    """(union of every embedded font's cmaps, number of programs read).

    A glyph the delivered PDF draws as a blank box (the U+2192 arrow was in the
    ToUnicode CMap but not in the HelveticaNeue subset, so CairoSVG wrote notdef)
    is still reported by PyMuPDF as text; only a cmap cross-check sees it.
    """
    cps, n_read, seen = set(), 0, set()
    for page in doc:
        for f in page.get_fonts(full=True):
            xref = f[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                buf = doc.extract_font(xref)[3]
            except Exception:
                buf = None
            if not buf:
                continue
            try:
                cps |= _ttf_cmap(buf)
                n_read += 1
            except Exception:
                continue        # Type1/CFF/base-14: no TrueType cmap to read
    return cps, n_read


def glyph_coverage(path):
    """(missing-char set, counts dict) over every drawn span vs the embedded cmaps."""
    import fitz
    doc = fitz.open(path)
    cps, n_read = embedded_codepoints(doc)
    missing, checked = {}, 0
    if n_read:
        for page in doc:
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        for ch in span["text"]:
                            if ch.isspace():
                                continue
                            checked += 1
                            if ord(ch) not in cps:
                                missing[ch] = missing.get(ch, 0) + 1
    doc.close()
    return set(missing), dict(n_read=n_read, checked=checked, miss=missing)


def text_overlaps(path):
    """worst (overlap_pt2, a, b) over pairs of drawn-text cap bands (see docstring)."""
    import fitz
    doc = fitz.open(path)
    boxes = []
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    boxes.append((x0, y0 + 0.15 * (y1 - y0), x1,
                                  y0 + 0.80 * (y1 - y0), span["text"][:34]))
    doc.close()
    worst, wa, wb = 0.0, "", ""
    for i in range(len(boxes)):
        ax0, ay0, ax1, ay1, at = boxes[i]
        for j in range(i + 1, len(boxes)):
            bx0, by0, bx1, by1, bt = boxes[j]
            ox = min(ax1, bx1) - max(ax0, bx0)
            oy = min(ay1, by1) - max(ay0, by0)
            if ox > 0.5 and oy > 0.5 and ox * oy > worst:
                worst, wa, wb = ox * oy, at, bt
    return worst, wa, wb


def _name_columns(arr):
    """(column count, median run-width px) of neutral dark tip-name ink in a raster."""
    import numpy as np
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    def near(c):
        return (np.abs(r - c[0]) < 45) & (np.abs(g - c[1]) < 45) & (np.abs(b - c[2]) < 55)
    mask = near(NAME_COLOURS[1]) | near(NAME_COLOURS[0])
    prof = mask.sum(axis=0) > 0
    runs, s, last = [], None, None
    for i, v in enumerate(prof):
        if v and s is None:
            s = last = i
        elif v:
            last = i
        elif s is not None and i - last > 4:
            if last - s >= 15:
                runs.append(last - s + 1)
            s = None
    if s is not None and last - s >= 15:
        runs.append(last - s + 1)
    return len(runs), (float(np.median(runs)) if runs else 0.0)


def rasterised_label_floor(path):
    """measure the smallest rasterised label class straight off the embedded pixels.

    For every placed raster this narrow (a Fig. 2 inset, magnified from the app's
    own vector source) extract the stored image, measure the species-name ink
    height and convert to page points with the raster's OWN placed dpi — the
    check the audit asked for: assert the floor on a measurement of the carrier,
    not on a script variable.  Wide rasters (panel a, the disclosed exception)
    are returned separately and reported, never asserted.
    """
    import io
    import fitz
    import numpy as np
    from PIL import Image
    doc = fitz.open(path)
    page = doc[0]
    insets, wide = [], []
    for info in page.get_image_info(xrefs=True):
        placed_in = (info["bbox"][2] - info["bbox"][0]) / 72.0
        if placed_in <= 0:
            continue
        try:
            img = doc.extract_image(info["xref"])["image"]
            arr = np.asarray(Image.open(io.BytesIO(img)).convert("RGB")).astype(int)
        except Exception:
            continue
        dpi_eff = info["width"] / placed_in
        ncols, med_px = _name_columns(arr)
        if med_px <= 0:
            continue
        rec = (placed_in, dpi_eff, ncols, med_px / dpi_eff * 72.0)
        (insets if placed_in <= INSET_RASTER_MAX_IN else wide).append(rec)
    doc.close()
    return insets, wide


def tiff_carrier(path):
    """(exists, dpi recorded, photometric) for the uncompressed TIFF master."""
    if not os.path.exists(path):
        return False, None, None
    from PIL import Image
    with Image.open(path) as im:
        tv = getattr(im, "tag_v2", None) or im.tag
        photo = dict(tv).get(262)
        dpiinfo = im.info.get("dpi", (None, None))
    return True, dpiinfo, photo


for pdf in PDFS:
    base = os.path.splitext(pdf)[0]
    name = os.path.basename(base)
    png = base + ".png"
    svg = base + ".svg"
    print(f"== {name}")

    import fitz
    doc = fitz.open(pdf)
    w_mm = doc[0].rect.width / 72.0 * 25.4
    check(abs(w_mm - PAGE_W_MM) <= 0.3,
          f"framing: page {w_mm:.1f} mm wide (target {PAGE_W_MM:.0f} mm)")
    check(os.path.exists(png), f"raster: {os.path.basename(png)} exists")
    if os.path.exists(png):
        dpi = png_dpi(png)
        check(dpi is not None and abs(dpi - DPI) < 1,
              f"raster: PNG records {dpi and round(dpi) or '?'} dpi (target {DPI})")
        # carrier agreement: PNG pixel aspect vs PDF page aspect
        with open(png, "rb") as f:
            f.seek(16)
            pw, ph = struct.unpack(">II", f.read(8))
        pr = doc[0].rect
        ar_pdf = pr.width / pr.height
        ar_png = pw / ph
        check(abs(ar_pdf / ar_png - 1) < 0.01,
              f"agreement: PNG/PDF aspect ratio within 1 % "
              f"({ar_png:.4f} vs {ar_pdf:.4f})")

    fonts, sizes, cmyk, _n = pdf_fonts_and_colors(pdf)
    check(all(k.split("+", 1)[-1].startswith("HelveticaNeue") for k in fonts),
          f"fonts: all HelveticaNeue ({len(fonts)} program(s))")
    check(all("+" in k for k in fonts),
          "fonts: every program is a subsetted TrueType (tag+name)")
    check(not cmyk, "colour: no DeviceCMYK colour space anywhere in the PDF")

    # (a) Type3 is the font program a press cannot rasterise consistently, and
    # matplotlib emits it silently the moment a text gets a path effect.
    programs = font_programs(pdf)
    whole = pdf_text(pdf)
    n_type3 = len(re.findall(r"/Subtype\s*/?\s*Type3(?![\w.])", whole))
    check(not any(str(sub).startswith("Type3") for sub, *_r in programs.values())
          and n_type3 == 0,
          f"type3: no Type3 font resource (every object and every decompressed "
          f"stream scanned, {n_type3} hit(s))")

    # (b) a font that is merely *named* HelveticaNeue may still be a base-14
    # reference with no glyph program shipped — follow the object graph.
    missing = sorted(b for b, (_s, emb, _k, _n2) in programs.items() if not emb)
    check(not missing,
          "embed: every font resource carries a /FontFile* stream"
          + (f" — NON-EMBEDDED: {missing}" if missing else
             f" ({len(programs)} program(s), "
             + ", ".join(sorted({k.split("+", 1)[1] for k in programs})) + ")"))

    # (c) type must stay off the trim by the margin the shared module declares
    dist, who = trim_clearance(pdf)
    if not math.isinf(dist):
        check(dist >= INNER_MARGIN_PT - 1e-6,
              f"trim: closest text {dist:.2f} pt ({who!r}) from a page edge vs "
              f"the declared {INNER_MARGIN_PT:.1f} pt inner margin "
              f"(phylorec_style.PAGE_MARGIN_IN = {st.PAGE_MARGIN_IN} in)")
    else:                       # nothing selectable in the PDF at all
        check(False, "trim: no selectable text in the PDF, so no page-edge "
                     "clearance can be measured")

    # (d) a 1,200 dpi PNG beside a PDF that places its pixels at 200 dpi is
    # still a 200 dpi figure on the press
    rasters = placed_rasters(pdf)
    if rasters:
        worst = min(r[2] for r in rasters)
        check(worst >= RASTER_FLOOR_DPI,
              f"placed: {len(rasters)} raster(s), lowest effective "
              f"{worst:.1f} dpi ("
              + ", ".join(f"{px} px at {pl:.2f} in = {dpi:.0f} dpi"
                          for px, pl, dpi in rasters)
              + f") >= {RASTER_FLOOR_DPI:.0f} dpi")
    else:
        print("  [ok ] placed: no raster placed inside the PDF (pure vector)")

    # type floor: only text the audit can actually see
    if name.endswith("图2"):
        # panel (a) species names are rasterized by the application and
        # exempt by design (legend discloses 5.18 pt at 5.66 pt pitch)
        check(min(sizes) >= TYPE_FLOOR_PT - 1e-6,
              f"type: smallest measured text {min(sizes):.2f} pt >= floor "
              f"(rasterized species names exempt)")
    elif svg and os.path.exists(svg) and os.path.join(HERE) in os.path.abspath(svg):
        # SVG-carried figures: floor label measures 7.19 pt (unit ladder)
        check(min(sizes) >= TYPE_FLOOR_PT + 0.1 - 1e-6,
              f"type: smallest measured text {min(sizes):.2f} pt "
              f"(unit ladder, floor is 7.19 pt)")
    else:
        check(min(sizes) >= TYPE_FLOOR_PT - 1e-6,
              f"type: smallest measured text {min(sizes):.2f} pt >= floor")

    # ---- (a) glyph coverage: no drawn char may be missing from an embedded
    #      font's own cmap (the U+2192 arrow shipped as a blank notdef box). ----
    missing, cov = glyph_coverage(pdf)
    if cov["n_read"]:
        check(not missing,
              "glyph-coverage: every drawn char is in an embedded font cmap "
              f"({cov['n_read']} program(s) read, {cov['checked']} chars checked"
              + (f"; MISSING {sorted(cov['miss'])}" if missing else ")"))
    else:
        print("  [ok ] glyph-coverage: no TrueType cmap to read (all base-14/CFF)")

    # ---- (d) outline-convertibility: a font with a glyph program can be turned
    #      into outlines; a named-but-unembedded font cannot. ----
    nonoutline = sorted(b for b, (_s, emb, _k, _n) in programs.items()
                        if not emb or str(_s).lower() in ("type3",))
    check(not nonoutline,
          "outline: every font ships a glyph program (FontFile2/3), so labels "
          "are convertible to outlines"
          + (f" — NOT OUTLINE-CONVERTIBLE: {nonoutline}" if nonoutline else
             f" ({len(programs)} program(s), "
             + "/".join(sorted({p.split('+', 1)[1] for p in programs})) + ")"))

    # ---- (c) no two drawn-text cap bands overprint. ----
    ov_area, oa, ob = text_overlaps(pdf)
    check(ov_area <= MAX_TEXT_OVERLAP_PT2,
          f"overlap: worst two-text-box intersection {ov_area:.2f} pt^2 "
          f"{'(%r x %r)' % (oa, ob) if ov_area > 1e-6 else '(none)'} "
          f"<= {MAX_TEXT_OVERLAP_PT2:.1f} pt^2")

    # ---- (b) rasterised labels: measure the inset species names off the
    #      embedded pixels and assert the floor (the F-04-1 intent-vs-carrier gap). ----
    insets, wide = rasterised_label_floor(pdf)
    for pl, dpi, ncols, cap in insets:
        check(cap >= GLYPH_FLOOR_PT - 0.01,
              f"raster-label: inset {ncols}-column species names measure "
              f"{cap:.2f} pt ink at {dpi:.0f} placed dpi >= {GLYPH_FLOOR_PT} pt floor")
    for pl, dpi, ncols, cap in wide:
        print(f"  [ok ] raster-label: wide raster (panel a / full view) {ncols} "
              f"columns measure {cap:.2f} pt ink at {dpi:.0f} dpi — disclosed "
              f"sub-floor exception, reported not asserted")

    # ---- (e) every carrier's dpi + colour space: PNG, PDF colourspace and the
    #      1,200 dpi TIFF master MBE's bitmap list actually accepts.  The master
    #      is losslessly recompressed (Deflate/LZW) by phylorec_style.png_to_tiff
    #      and pixel-verified there; what is asserted here is that it decodes as
    #      plain RGB with the resolution recorded — a separated/CMYK TIFF fails.
    tif = base + ".tif"
    ok, dpi_t, photo = tiff_carrier(tif)
    check(ok, f"tiff: {os.path.basename(tif)} exists (MBE bitmap list has no PNG)")
    if ok:
        check(dpi_t is not None and abs(dpi_t[0] - DPI) < 1 and abs(dpi_t[1] - DPI) < 1,
              f"tiff: records {dpi_t and tuple(round(v) for v in dpi_t) or '?'} dpi (target {DPI})")
        check(photo in (2, 1, 0),
              f"tiff: photometric {photo} (2=RGB; 5=separated/CMYK would fail)")

print()
if FAILURES:
    print(f"check_figures.py: {len(FAILURES)} assertion(s) failed:")
    for f in FAILURES:
        print(f"  - {f}")
    sys.exit(1)
print("check_figures.py: all figures pass")
