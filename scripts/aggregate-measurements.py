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

    npm run measure                          # once per run:
                                             # tsx --tsconfig tsconfig.scripts.json scripts/measure.ts
    python3 scripts/aggregate-measurements.py RUNDIR...   # fold scratch run dirs
    python3 scripts/aggregate-measurements.py --from-runs # fold the published tables

WHAT GETS WRITTEN WHERE — read this before running the fold:

data/ is the frozen artefact the article cites. A replay of the fold recomputes
`generated_utc` and the whole `host` block from the machine it runs on, so a fold
that wrote into data/ by default would silently overwrite the host record the
manuscript quotes (macOS 27.0 build 26A428, Python 3.14.6). Nothing is written to
data/ unless the operator asks for it explicitly:

    --check        recompute into a temporary directory and compare with data/;
                   write NOTHING. Use this to reproduce the fold.
    (default)     write the aggregates and MANIFEST to _build/aggregates/.
    --out DIR     write there instead; DIR must stay inside the repository.
    --in-place    legacy behaviour: overwrite data/. Only for producing a NEW
                   frozen set, i.e. when a re-measurement is the point.
    --dry-run     compute and report, write nothing.

Reads <run>/benchmarks.csv and <run>/benchmarks-datasets.csv from every
positional directory (or, with `--from-runs`, the committed `*-runs.csv` tables
under data/) and writes the aggregates plus a manifest to the output directory.
The manifest carries the SHA-256 of every input, keyed by the path a reader finds
in this repository, so a reader can check which runs produced which numbers.
"""
import csv
import datetime as dt
import hashlib
import json
import math
import pathlib
import platform
import re
import shutil
import statistics
import subprocess
import sys
import tempfile

STAGE_COLS = ["parse", "layout", "svg"]
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"                          # the frozen tables: read from here
REPLAY = ROOT / "_build" / "aggregates"       # default destination of a replay
FROZEN_TABLES = [
    "benchmarks-sweep-median.csv",
    "benchmarks-sweep-runs.csv",
    "benchmarks-datasets-median.csv",
    "benchmarks-datasets-runs.csv",
]
# Fields that describe where a fold was *replayed*, not what was *measured*; they
# legitimately differ on another machine, so --check reports them separately.
REPLAY_ONLY_MANIFEST_FIELDS = (
    "generated_utc", "host", "source_commit", "source_ref", "source_commit_note",
)


TIMING_PROTOCOL = (
    "10 independent runs of `npm run measure` "
    "(tsx --tsconfig tsconfig.scripts.json scripts/measure.ts) against one code "
    "revision. Inside each run, every bundled dataset and every synthetic sweep "
    "size is timed 5 times after 1 discarded warm-up: `bench(label, text, runs = 5)` "
    "loops `i = 0..runs` and samples only `i > 0` (scripts/measure.ts:65-91), so each "
    "table cell is the median [q1-q3] of those 5 samples. The 10 runs are then folded "
    "by this script, which writes the across-run median plus the observed min and max "
    "for every point, and a median with its across-run range for every log-log "
    "exponent. A timed unit is wall-clock performance.now() across parse -> layout -> "
    "renderToStaticMarkup(Scene, detail: 'full'), the same path the in-app SVG export "
    "uses. No process isolation, CPU pinning or thread pinning: the across-run spread "
    "is reported instead of hidden."
)


def git_revision() -> tuple[str, str]:
    """HEAD commit and (if HEAD is tagged) the tag naming it, for provenance."""
    def run(argv):
        try:
            return subprocess.run(argv, capture_output=True, text=True,
                                  timeout=10).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    sha = run(("git", "rev-parse", "HEAD"))
    ref = run(("git", "describe", "--tags", "--exact-match")) if sha else ""
    return sha, ref


def timing_repeat_counts() -> tuple[int | None, int | None]:
    """Read the per-run repeat count and warm-up out of scripts/measure.ts.

    These two numbers are what makes the reported medians interpretable (a cell is
    a median of 5, not of 1), and they live in `bench()`'s signature and loop, not
    in this script. Reading them keeps the manifest honest about the code it ships
    with; if the source ever stops matching the expected shape the fields go null
    rather than asserting a protocol that no longer holds."""
    script = ROOT / "scripts" / "measure.ts"
    try:
        src = script.read_text(encoding="utf-8")
    except OSError:
        return None, None
    repeats = re.search(r"function\s+bench\s*\([^)]*?\bruns\s*=\s*(\d+)", src)
    loop = re.search(r"for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<=\s*runs", src)
    skipped = re.search(r"if\s*\(\s*i\s*>\s*0\s*\)", src)
    n_repeats = int(repeats.group(1)) if repeats else None
    warm_up = 1 if (loop and skipped) else None
    return n_repeats, warm_up


def src_col(stage: str, which: str) -> str:
    """Column name as emitted by measure.ts: `parse_med_ms` but `parse_q1`."""
    return f"{stage}_med_ms" if which == "med" else f"{stage}_{which}"


def _label(p: pathlib.Path) -> str:
    """Short stable label: <runDirName>/<file>, without absolute paths."""
    return f"{p.parent.name}/{p.name}"


def _manifest_key(p: pathlib.Path) -> str:
    """The key a reader uses to find `p`: its path inside this repository.

    These keys used to be hard-coded as `published/<name>`. No `published/`
    directory exists in the tree or in the archived snapshot — the four frozen
    tables have always lived under `data/` — so the manifest could not resolve
    its own input hashes and a reader following them hit a 404. Deriving the key
    from the real path makes the manifest self-referential again, and keeps the
    documented `--from-runs` replay identical to what is committed.
    """
    try:
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        return _label(p)


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
    path = DATA / fname
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
        return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]

    return [
        (DATA / "runs" / name / "measurements.csv", rows)
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


def write_csv(path, header, rows, emit=True):
    if not emit:
        print("would write", path)
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print("wrote", path)


def fold(directories, from_published, dest, emit=True):
    """Fold the runs into the aggregates and the manifest.

    `dest` receives every file; `data/` is only ever read here. With `emit=False`
    nothing is written and the manifest's hashes describe the committed tables, so
    a dry run can report what it *would* claim without touching a frozen artefact.
    """
    if emit:
        dest.mkdir(parents=True, exist_ok=True)
    beside = dest if emit else DATA   # tables the manifest travels next to

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
        dest / "benchmarks-sweep-median.csv",
        ["nodes"] + [f"{s}_{q}_ms" for s in STAGE_COLS for q in ("med", "min", "max")]
        + ["n_runs"],
        [[n] + [round(agg[str(n)][s][q], 2) for s in STAGE_COLS for q in ("med", "min", "max")]
         + [agg[str(n)]["svg"]["n"]] for n in nodes],
        emit=emit)
    write_csv(
        dest / "benchmarks-sweep-runs.csv",
        ["run", "nodes"] + [f"{s}_{'med_ms' if q == 'med' else q}"
                            for s in STAGE_COLS for q in ("med", "q1", "q3")],
        long_rows, emit=emit)

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
        dest / "benchmarks-datasets-median.csv",
        ["dataset", "nodes"] + [f"{s}_{q}_ms" for s in STAGE_COLS for q in ("med", "min", "max")]
        + ["total_med_ms", "n_runs"],
        [[k, ds[k]["nodes"]]
         + [round(ds[k][s][q], 2) for s in STAGE_COLS for q in ("med", "min", "max")]
         + [round(sum(ds[k][s]["med"] for s in STAGE_COLS), 2), ds[k]["svg"]["n"]]
         for k in ordered], emit=emit)
    write_csv(
        dest / "benchmarks-datasets-runs.csv",
        ["run", "dataset", "nodes"] + [f"{s}_{'med_ms' if q == 'med' else q}"
                                       for s in STAGE_COLS for q in ("med", "q1", "q3")],
        [[p.parent.name, r["dataset"], r["nodes"]]
         + [r[f"{s}_{'med_ms' if q == 'med' else q}"]
            for s in STAGE_COLS for q in ("med", "q1", "q3")]
         for p, rows in ds_runs for r in rows], emit=emit)

    # ---- manifest ---------------------------------------------------------
    top = nodes[-1]
    n_repeats, warm_up = timing_repeat_counts()
    source_commit, source_ref = git_revision()
    manifest = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "command": "npm run measure (scripts/measure.ts) once per run, then "
                   "python3 scripts/aggregate-measurements.py <run dirs>",
        "n_runs": len(sweep_runs),
        # The fields below are the provenance a reader would otherwise have to
        # recover by reading scripts/measure.ts: how many runs were folded, how
        # many timed repeats each run contains, whether one warm-up was discarded,
        # and which revision the tables are distributed with.
        "n_repeats": n_repeats,
        "warm_up": warm_up,
        "source_commit": source_commit or None,
        "source_ref": source_ref or None,
        "source_commit_note": (
            "source_commit is the revision `git rev-parse HEAD` reported where this "
            "fold ran, and source_ref the tag naming it when there is one. Provenance "
            "fields (generated_utc, host, source_commit, source_ref, "
            "source_commit_note) describe WHERE a fold was replayed, not what was "
            "measured, so they are expected to differ on any reader's machine; the "
            "four tables and the two `inputs` hashes are the frozen part."
        ),
        "protocol": TIMING_PROTOCOL,
        "host": host_details(),
        "inputs": (
            {_manifest_key(DATA / "benchmarks-sweep-runs.csv"):
                 sha256(DATA / "benchmarks-sweep-runs.csv"),
             _manifest_key(DATA / "benchmarks-datasets-runs.csv"):
                 sha256(DATA / "benchmarks-datasets-runs.csv")}
            if from_published
            else {_label(p): sha256(p) for p, _r in sweep_runs + ds_runs}
        ),
        # The four tables the reported numbers are read from, hashed so a reader
        # can tell whether the copy they hold is the copy that was folded.
        "published_sha256": {
            name: sha256(beside / name)
            for name in FROZEN_TABLES
            if (beside / name).exists()
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
    manifest_text = json.dumps(manifest, indent=1) + "\n"
    if emit:
        (dest / "MANIFEST.json").write_text(manifest_text, encoding="utf-8")
        print("wrote", dest / "MANIFEST.json")
    else:
        print("would write", dest / "MANIFEST.json")
    print("\nexponent: per-run median [min-max] | median-table OLS (R2):")
    for s in STAGE_COLS:
        print(
            f"  {s:7s} {statistics.median(per_run_exp[s]):.3f} "
            f"[{min(per_run_exp[s]):.3f},{max(per_run_exp[s]):.3f}] | "
            f"{published_median_ols[s][0]:.3f} (R2 {published_median_ols[s][1]:.4f})"
        )
    return manifest


def check(folded, replay_dir) -> int:
    """Compare a freshly folded result against the frozen `data/` tables.

    Three separate questions, because they fail for different reasons:
      1. do the four tables reproduce byte-for-byte from the published run tables?
      2. do the hashes the committed MANIFEST declares resolve, and match?
      3. do the derived quantities (exponents, top-size medians, node ladder) agree?
    Provenance fields are never treated as a failure: they record the machine the
    fold ran on, which on a reader's machine is not the measurement host.
    """
    failures = []
    # 1. byte-for-byte tables
    for name in FROZEN_TABLES:
        tmp, committed = replay_dir / name, DATA / name
        if not tmp.exists() or not committed.exists():
            failures.append(f"cannot compare {name}: present in only one place")
        elif tmp.read_bytes() != committed.read_bytes():
            failures.append(f"{_manifest_key(committed)} does NOT reproduce byte-for-byte")
        else:
            print(f"  table reproduces byte-for-byte: {_manifest_key(committed)}")
    # 2. the committed manifest's own claims
    committed_path = DATA / "MANIFEST.json"
    if not committed_path.exists():
        print("  MISMATCH: data/MANIFEST.json is missing", file=sys.stderr)
        return 1
    committed = json.loads(committed_path.read_text(encoding="utf-8"))
    declared = list(committed.get("inputs", {}).items()) + [
        (_manifest_key(DATA / n), h) for n, h in committed.get("published_sha256", {}).items()
    ]
    for key, digest in declared:
        path = ROOT / key
        if not path.exists():
            failures.append(f"committed MANIFEST names {key}, which does not exist")
        elif sha256(path) != digest:
            failures.append(f"{key}: declared sha256 does not match the file")
        else:
            print(f"  declared sha256 matches: {key}")
    # 3. derived quantities, excluding the replay-specific provenance fields
    for field, value in folded.items():
        if field in REPLAY_ONLY_MANIFEST_FIELDS:
            continue
        if field not in committed:
            failures.append(f"committed MANIFEST has no `{field}` field")
        elif committed[field] != value:
            failures.append(f"MANIFEST `{field}` differs: committed {committed[field]!r} "
                            f"vs replayed {value!r}")
    if not failures:
        print(f"  every MANIFEST field except provenance "
              f"({', '.join(REPLAY_ONLY_MANIFEST_FIELDS)}) reproduces exactly")
    for f in failures:
        print("  MISMATCH:", f, file=sys.stderr)
    return 1 if failures else 0


USAGE = (
    "usage: python3 scripts/aggregate-measurements.py "
    "[--from-runs | RUNDIR RUNDIR RUNDIR...] [--out DIR | --in-place] "
    "[--check | --dry-run]\n"
    "  --check     replay the fold into a temporary directory and compare it with "
    "data/; writes nothing (this is the reproduction command).\n"
    "  (default)   write the fold to _build/aggregates/; data/ is never overwritten.\n"
    "  --out DIR   write the fold to DIR instead; DIR must stay inside the "
    "repository.\n"
    "  --in-place  write the fold into data/, replacing the frozen tables "
    "(only when a re-measurement is intended).\n"
    "  --dry-run   compute and report, write nothing.\n"
)


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    unknown = flags - {"--from-runs", "--out", "--in-place", "--dry-run", "--check",
                       "--help", "-h"}
    if unknown:
        sys.exit(f"unknown option(s): {', '.join(sorted(unknown))}\n\n" + USAGE)
    if "--help" in flags or "-h" in argv:
        print(__doc__.rstrip())
        print()
        print(USAGE)
        return

    from_published = "--from-runs" in flags
    in_place = "--in-place" in flags
    dry_run = "--dry-run" in flags
    verify = "--check" in flags
    directories = [a for a in argv if not a.startswith("--")]
    dest = None
    if "--out" in flags:
        i = argv.index("--out")
        if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
            sys.exit("--out needs a directory\n\n" + USAGE)
        dest = pathlib.Path(argv[i + 1]).resolve()
        directories = [d for d in directories if d != argv[i + 1]]
    if in_place and dest is not None:
        sys.exit("--in-place and --out are mutually exclusive\n\n" + USAGE)
    if in_place:
        dest = DATA
    elif dest is None:
        dest = REPLAY
    if not (dest == ROOT or ROOT in dest.parents):
        sys.exit(f"--out must stay inside the repository ({ROOT}); "
                 f"got {dest}\n\n" + USAGE)
    if not from_published and len(directories) < 3 and not verify:
        sys.exit(
            "need at least 3 run directories for a dispersion estimate, or pass "
            "--from-runs to fold the committed *-runs.csv tables instead\n\n" + USAGE
        )
    if not from_published and verify:
        sys.exit("--check replays the published fold; add --from-runs\n\n" + USAGE)

    if verify:
        replay = pathlib.Path(tempfile.mkdtemp(prefix="phylorec-aggregate-check-"))
        print("replaying the fold into a temporary directory and comparing with "
              "data/ — nothing under data/ is written:")
        try:
            folded = fold(directories, from_published, replay, emit=True)
            code = check(folded, replay)
        finally:
            shutil.rmtree(replay, ignore_errors=True)
        print("CHECK PASSED — the frozen tables reproduce and the committed "
              "manifest resolves against them" if code == 0
              else "CHECK FAILED — see the mismatches above")
        sys.exit(code)

    if dry_run:
        print("dry run: the fold is computed, no file is written\n")
        fold(directories, from_published, dest, emit=False)
        return

    if dest == DATA:
        print("WARNING: --in-place replaces the frozen tables AND the host record "
              "under data/. The article quotes the host block as written on "
              "2026-09-28; use --check to reproduce the fold without touching it.\n")
    else:
        print(f"folding into {dest} — data/ is left untouched "
              f"(--in-place opts into replacing it)\n")
    fold(directories, from_published, dest, emit=True)


if __name__ == "__main__":
    main(sys.argv[1:])


