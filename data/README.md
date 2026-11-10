# Frozen benchmark data

These four tables are the frozen aggregate the manuscript cites. They were
produced from the measurements recorded in `MANIFEST.json` and are not
regenerated in place by normal development. The manifest records
`source_ref: v0.1.0` and `source_commit: a65c8f3`; that initial commit is
preserved by the `archive/initial-commit` tag. The tables were measured before
the v0.1.0 tag existed and are shipped unchanged with later releases; run
`npm run measure` for timings of the current working tree.

- `benchmarks-datasets-median.csv`, `benchmarks-datasets-runs.csv` — reference
  datasets, across-run median and all ten runs.
- `benchmarks-sweep-median.csv`, `benchmarks-sweep-runs.csv` — synthetic
  scaling sweep, across-run median and all ten runs.
- `MANIFEST.json` — inputs, SHA-256 values, host block, run protocol and the
  fitted exponents.

To reproduce a fold without touching the frozen tables:

```bash
npm run measure                       # writes _build/benchmarks*.csv
python3 scripts/aggregate-measurements.py --from-runs --check
```

`--from-runs` reads the committed `*-runs.csv` inputs, `--check` recomputes in a
temporary directory and compares, and writes nothing. Without `--check` the fold
is written to `_build/aggregates/`. Use `--in-place` only when deliberately
creating a new frozen set.
