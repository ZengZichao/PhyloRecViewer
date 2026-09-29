#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
aggregate-measurements.py — fold repeated `npm run measure` runs into the one
frozen dataset published under data/.

Why this exists: a single measurement run is not reproducible enough to quote.
Ten runs of the same build put the per-point spread at 1.2-3.1x, and the
log-log exponent of the layout pass moved between 1.17 and 1.39 across runs.
The aggregates therefore carry, for every point, the median across runs plus
the observed min and max, and each scaling exponent is a median with its
across-run range rather than a single number.

    node_modules/.../vite-node ... scripts/measure.ts      # once per run
    python3 scripts/aggregate-measurements.py RUNDIR...
    python3 scripts/aggregate-measurements.py --from-runs   # fold the published tables

Reads <run>/benchmarks.csv and <run>/benchmarks-datasets.csv from every
positional directory and writes the frozen aggregates plus a manifest into
data/. The manifest carries the SHA-256 of every input, so a reader can check
which runs produced which numbers.

`--from-runs` folds the committed `*-runs.csv` tables instead of scratch run
directories, so the published aggregates can be re-derived from published data.
"""
import csv
import datetime as dt
import hashlib
import json
import math
import pathlib
import platform
import statistics
import subprocess
import sys

STAGE_COLS = ["parse", "layout", "svg"]
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data"


def src_col(stage: str, which: str) -> str:
    """Column name as emitted by measure.ts: `parse_med_ms` but `parse_q1`."""
    return f"{stage}_med_ms" if which == "med" else f"{stage}_{which}"


def _label(p: pathlib.Path) -> str:
    """Short stable label: <runDirName>/<file>, without absolute paths."""
    return f"{p.parent.name}/{p.name}"


def sha256(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def host_details() -> dict:
    """Everything a reader needs to judge the reported milliseconds.

    A quoted host spec — 'Apple M5, 32 GB RAM', a macOS product version — is
    only checkable when the manifest itself records it, so the CPU brand,
    memory size and OS versions are probed here rather than left to
    system/release/machine/python alone."""
    info = {
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "python": platform.python_version(),
    }
    probes = (
        ("cpu", ("sysctl", "-n", "machdep.cpu.brand_string")),
        ("mem_bytes", ("sysctl", "-n", "hw.memsize")),
        ("os_product_version", ("sw_vers", "-productVersion")),
        ("os_build_version", ("sw_vers", "-buildVersion")),
        ("node", ("node", "--version")),
    )
    for key, argv in probes:
        try:
            out = subprocess.run(argv, capture_output=True, text=True, timeout=10).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            out = ""
        if not out:
            continue
        if key == "mem_bytes" and out.isdigit():
            info["mem_gb"] = round(int(out) / 2**30, 1)
        else:
            info[key] = out
    return info


def runs_from_published(fname: str, run_col: str = "run"):
    """Rebuild the per-run tables from a committed `*-runs.csv`.

    Scratch run directories are not, and cannot be, part of what ships, so
    without this mode the published medians, exponents and manifest could not
    be re-derived from published data at all. Each committed run becomes a
    synthetic directory whose name is the run label; only the label is read
    back, never the path."""
    path = OUT / fname
    if not path.exists():
        sys.exit(f"{path} not found - pass run directories instead of --from-runs")
    groups: dict[str, list] = {}
    for row in csv.DictReader(path.open(encoding="utf-8")):
        groups.setdefault(row[run_col], []).append(row)
    if len(groups) < 3:
        sys.exit(f"{path} carries {len(groups)} run(s); need at least 3")
    # read_runs yields (<file>, rows) and the callers label a run by
    # `path.parent.name`, so the synthetic path needs a file inside the run dir.
    # Numeric suffixes sort naturally, keeping run1..run10 in file order.
    def natural(name: str):
        import re as _re
        return [int(t) if t.isdigit() else t for t in _re.split(r"(\d+)", name)]

    return [
        (OUT / "runs" / name / "measurements.csv", rows)
        for name, rows in sorted(groups.items(), key=lambda kv: natural(kv[0]))
    ]


def loglog_exponent(x, y):
    """Least-squares slope and R^2 of log(y) on log(x)."""
    lx, ly = [math.log(v) for v in x], [math.log(v) for v in y]
    n = len(lx)
    mx, my = sum(lx) / n, sum(ly) / n
    sxx = sum((a - mx) ** 2 for a in lx)
    if sxx == 0:
        return float("nan"), float("nan")
    slope = sum((a - mx) * (b - my) for a, b in zip(lx, ly)) / sxx
    pred = [my + slope * (a - mx) for a in lx]
    ssr = sum((p - b) ** 2 for p, b in zip(pred, ly))
    sst = sum((b - my) ** 2 for b in ly)
    return slope, (1 - ssr / sst if sst else float("nan"))


def read_runs(dirs, fname, key):
    runs = []
    for d in dirs:
        p = pathlib.Path(d) / fname
        if not p.exists():
            print(f"skip {d}: no {fname}", file=sys.stderr)
            continue
        rows = list(csv.DictReader(p.open(encoding="utf-8")))
        runs.append((p, rows))
    return runs


def aggregate_numeric(runs, key_field, stages):
    """-> {key: {stage: {'med','min','max','values'}}} preserving first-seen order."""
    order, acc = [], {}
    for _p, rows in runs:
        for r in rows:
            k = r[key_field]
            if k not in acc:
                order.append(k)
                acc[k] = {s: [] for s in stages}
                acc[k]["_n"] = r.get("nodes", "")
            for s in stages:
                acc[k][s].append(float(r[f"{s}_med_ms"]))
    out = {}
    for k in order:
        out[k] = {"nodes": acc[k]["_n"]}
        for s in stages:
            v = acc[k][s]
            out[k][s] = {"med": statistics.median(v), "min": min(v),
                         "max": max(v), "n": len(v)}
    return out


def write_csv(path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print("wrote", path)


def main(argv):
    from_published = "--from-runs" in argv
    directories = [a for a in argv if not a.startswith("--")]
    if not from_published and len(directories) < 3:
        sys.exit(
            "need at least 3 run directories for a dispersion estimate, or pass "
            "--from-runs to fold the committed *-runs.csv tables instead"
        )
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- synthetic sweep -------------------------------------------------
    sweep_runs = (
        runs_from_published("benchmarks-sweep-runs.csv")
        if from_published
        else read_runs(directories, "benchmarks.csv", "nodes")
    )
    if not sweep_runs:
        sys.exit("no benchmarks.csv found")
    nodes = [int(n) for n in sorted({r["nodes"] for _p, rows in sweep_runs for r in rows},
                                    key=int)]
    per_run_exp, per_run_r2 = {s: [] for s in STAGE_COLS}, {s: [] for s in STAGE_COLS}
    long_rows = []
    for p, rows in sweep_runs:
        by_node = {int(r["nodes"]): r for r in rows}
        for s in STAGE_COLS:
            e, r2 = loglog_exponent(nodes, [float(by_node[n][f"{s}_med_ms"]) for n in nodes])
            per_run_exp[s].append(e)
            per_run_r2[s].append(r2)
        for n in nodes:
            r = by_node[n]
            long_rows.append([p.parent.name, n]
                             + [r[src_col(s, q)] for s in STAGE_COLS
                                for q in ("med", "q1", "q3")])
    agg = aggregate_numeric(sweep_runs, "nodes", STAGE_COLS)
    write_csv(
        OUT / "benchmarks-sweep-median.csv",
        ["nodes"] + [f"{s}_{q}_ms" for s in STAGE_COLS for q in ("med", "min", "max")]
        + ["n_runs"],
        [[n] + [round(agg[str(n)][s][q], 2) for s in STAGE_COLS for q in ("med", "min", "max")]
         + [agg[str(n)]["svg"]["n"]] for n in nodes])
    write_csv(
        OUT / "benchmarks-sweep-runs.csv",
        ["run", "nodes"] + [f"{s}_{'med_ms' if q == 'med' else q}"
                            for s in STAGE_COLS for q in ("med", "q1", "q3")],
        long_rows)

    # ---- bundled datasets -------------------------------------------------
    ds_runs = (
        runs_from_published("benchmarks-datasets-runs.csv")
        if from_published
        else read_runs(directories, "benchmarks-datasets.csv", "dataset")
    )
    ds = aggregate_numeric(ds_runs, "dataset", STAGE_COLS)
    published_median_ols = {
        s: loglog_exponent(nodes, [agg[str(n)][s]["med"] for n in nodes]) for s in STAGE_COLS
    }
    ds_order = [r["dataset"] for _p, rows in ds_runs for r in rows]
    seen, ordered = set(), []
    for k in ds_order:
        if k not in seen:
            seen.add(k)
            ordered.append(k)
    write_csv(
        OUT / "benchmarks-datasets-median.csv",
        ["dataset", "nodes"] + [f"{s}_{q}_ms" for s in STAGE_COLS for q in ("med", "min", "max")]
        + ["total_med_ms", "n_runs"],
        [[k, ds[k]["nodes"]]
         + [round(ds[k][s][q], 2) for s in STAGE_COLS for q in ("med", "min", "max")]
         + [round(sum(ds[k][s]["med"] for s in STAGE_COLS), 2), ds[k]["svg"]["n"]]
         for k in ordered])
    write_csv(
        OUT / "benchmarks-datasets-runs.csv",
        ["run", "dataset", "nodes"] + [f"{s}_{'med_ms' if q == 'med' else q}"
                                       for s in STAGE_COLS for q in ("med", "q1", "q3")],
        [[p.parent.name, r["dataset"], r["nodes"]]
         + [r[f"{s}_{'med_ms' if q == 'med' else q}"]
            for s in STAGE_COLS for q in ("med", "q1", "q3")]
         for p, rows in ds_runs for r in rows])

    # ---- manifest ---------------------------------------------------------
    top = nodes[-1]
    by_node_last = {}
    for p, rows in sweep_runs:
        for r in rows:
            if int(r["nodes"]) == top:
                by_node_last.setdefault("x", []).append(r)
    manifest = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "command": "npm run measure (scripts/measure.ts) once per run, then "
                   "python3 scripts/aggregate-measurements.py <run dirs>",
        "n_runs": len(sweep_runs),
        "host": host_details(),
        "inputs": (
            {"published/benchmarks-sweep-runs.csv": sha256(OUT / "benchmarks-sweep-runs.csv"),
             "published/benchmarks-datasets-runs.csv": sha256(OUT / "benchmarks-datasets-runs.csv")}
            if from_published
            else {_label(p): sha256(p) for p, _r in sweep_runs + ds_runs}
        ),
        # The four tables under data/ that the reported numbers are read from,
        # hashed so a reader can tell whether the copy they hold is the copy
        # that was folded.
        "published_sha256": {
            p.name: sha256(p)
            for p in (
                OUT / "benchmarks-sweep-median.csv",
                OUT / "benchmarks-sweep-runs.csv",
                OUT / "benchmarks-datasets-median.csv",
                OUT / "benchmarks-datasets-runs.csv",
            )
            if p.exists()
        },
        # Two estimators, both recorded: the per-run fits give the across-run
        # spread, the median-table fit gives one number for the median curve.
        "exponent_estimator_note": (
            "sweep_exponent_loglog = median of the per-run log-log least-squares "
            "fits; sweep_exponent_median_table_ols = one log-log least-squares fit "
            "through the across-run median curve, which is the estimator behind "
            "the documented 0.96 / 1.31 / 1.00 figures."
        ),
        "sweep_exponent_median_table_ols": {
            s: {"slope": round(published_median_ols[s][0], 3),
                "r2": round(published_median_ols[s][1], 4)}
            for s in STAGE_COLS
        },
        "sweep_exponent_loglog": {
            s: {"median": round(statistics.median(per_run_exp[s]), 3),
                "min": round(min(per_run_exp[s]), 3),
                "max": round(max(per_run_exp[s]), 3),
                "r2_median": round(statistics.median(per_run_r2[s]), 4)}
            for s in STAGE_COLS},
        "sweep_top_size_ms": {
            s: {"median": round(statistics.median([float(r[f"{s}_med_ms"])
                 for _p, rows in sweep_runs for r in rows if int(r["nodes"]) == top]), 1),
                "min": round(min(float(r[f"{s}_med_ms"])
                      for _p, rows in sweep_runs for r in rows if int(r["nodes"]) == top), 1),
                "max": round(max(float(r[f"{s}_med_ms"])
                      for _p, rows in sweep_runs for r in rows if int(r["nodes"]) == top), 1)}
            for s in STAGE_COLS},
        "sweep_nodes": nodes,
        "datasets_total_med_ms": {k: round(sum(ds[k][s]["med"] for s in STAGE_COLS), 2)
                                  for k in ordered},
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=1) + "\n",
                                       encoding="utf-8")
    print("wrote", OUT / "MANIFEST.json")
    print("\nexponent: per-run median [min-max] | median-table OLS (R2):")
    for s in STAGE_COLS:
        print(
            f"  {s:7s} {statistics.median(per_run_exp[s]):.3f} "
            f"[{min(per_run_exp[s]):.3f},{max(per_run_exp[s]):.3f}] | "
            f"{published_median_ols[s][0]:.3f} (R2 {published_median_ols[s][1]:.4f})"
        )


if __name__ == "__main__":
    main(sys.argv[1:])
