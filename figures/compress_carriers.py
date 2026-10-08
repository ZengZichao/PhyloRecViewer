#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""compress_carriers.py — make already-written TIFF carriers shippable.

`export.sh` and `phylorec_style.save()` now write the TIFF master through
`phylorec_style.png_to_tiff()`, which chooses the smallest lossless codec whose
decoded pixels are exactly the source pixels.  This command is the front for the
same routine when a carrier already exists on disk and must not be re-rendered:
it reads each `*.tif` in `figures/`, recompresses it from its own pixels, and
refuses to touch a file whose decoded pixels are not identical to the originals.

The 25 MB threshold below is a convenience, not a correctness rule: a file
already at or under it is reported and left alone.  Pass --force to recompress
regardless of size, and --dry-run to report without writing.

Usage:
    python3 figures/compress_carriers.py [--dry-run] [--force] [path ...]
With no paths, every `*.tif` beside this script is considered.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import phylorec_style as st                                     # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="*", help="TIFF files (default: *.tif here)")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would change without writing")
    ap.add_argument("--force", action="store_true",
                    help="recompress even small carriers")
    ap.add_argument("--limit", type=int, default=25 * 1024 * 1024,
                    help="size at or under which a carrier is left alone")
    a = ap.parse_args(argv)

    targets = [os.path.abspath(p) for p in a.paths] or sorted(
        os.path.join(HERE, f) for f in os.listdir(HERE) if f.endswith(".tif"))
    if not targets:
        print("compress_carriers.py: no TIFF carriers found in %s — run export.sh "
              "or a figure script first" % HERE)
        return 0

    limit = 0 if a.force else a.limit
    problems = 0
    for t in targets:
        if not os.path.exists(t):
            print("MISSING %s" % os.path.basename(t))
            problems += 1
            continue
        if a.dry_run:
            size = os.path.getsize(t)
            verdict = "would recompress" if size > limit else "left alone"
            print("%s: %.1f MB, %s" % (os.path.basename(t), size / 1e6, verdict))
            continue
        print(st.compress_tiff_in_place(t, limit=limit))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
