# PhyloRecViewer

**English** | [中文](./README.zh-CN.md)

Beautiful, offline, interactive **recPhyloXML / NHX** phylogenetic-reconciliation viewer. Built with Tauri v2 (Rust + React 18 / TypeScript strict) with a deterministic, pure-style SVG renderer.

## Features

- **Format support**: recPhyloXML and NHX/Newick parsing (probed by content; unknown input falls back to recPhyloXML), multi-file merge. NHX import reconstructs the species tree from `S=` annotations — reliable for self-contained files, but horizontal transfers that are unmarked in the input cannot be distinguished, so prefer recPhyloXML for results that contain HGT
- **Visualization**: species + gene-tree reconciliation drawing, four orientations, tidy/rectangular layouts
- **Nested view**: three-level nesting (gene → symbiont → host) and side-by-side compare
- **Analysis**: search / filter / statistics / consistency checks, transfer network
- **Export**: SVG / PNG / PDF / interactive HTML / NHX; session save & restore with workspace-wide autosave across all open tabs. NHX export is lossless when re-read by this app but uses an extended dialect — external Newick readers may drop losses and transfers, so use recPhyloXML for a fully lossless, self-describing round-trip
- **Platform**: bilingual (中文 / English), light & dark themes; runs fully offline
- **Open source**: MIT license; installers for macOS, Windows, and Linux

## Installation

### Pre-built binaries

Download the latest release from [GitHub Releases](https://github.com/ZengZichao/PhyloRecViewer/releases).

| Platform | File |
|---|---|
| macOS (Apple Silicon & Intel) | `PhyloRecViewer_<version>_universal.dmg` |
| Windows | `PhyloRecViewer_<version>_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `PhyloRecViewer_<version>_amd64.deb` |
| Linux (portable) | `PhyloRecViewer_<version>_amd64.AppImage` |

Installers are produced by the `release.yml` workflow on each `v*` tag and are
**not** code-signed or notarized: on macOS allow the app once via right-click →
Open, and `chmod +x` the `.AppImage`. See [SECURITY.md](./SECURITY.md) for the
threat model this implies.

### Build from source

```bash
# Prerequisites: Node.js 20+, npm 9+, Rust 1.77+ (desktop build only),
# Python 3 (the aggregation script), and on Linux WebKitGTK 4.1+ to run
# the desktop build
git clone <repository URL>
cd PhyloRecViewer
npm ci                # or npm install (keeps package-lock.json in sync)
npm run build         # production web build -> dist/
npm run tauri build   # native desktop bundle
```

For development:

```bash
npm run dev           # web dev server (Vite, http://localhost:5173)
npm run tauri dev     # desktop (Tauri) dev
npm run preview       # serve the built dist/ over http:// (the bundle uses
                      # ES-module scripts, so opening dist/index.html from the
                      # filesystem is blocked by CORS)
npm run typecheck     # tsc -b
npm run lint          # eslint . --max-warnings 0
npm test              # vitest
npm run coverage      # vitest with a coverage report
npm run check:tracked # every imported file is committed (see CONTRIBUTING.md)
```

The benchmark tables under `data/` are reproducible from this tree. Each
`npm run measure` writes to `_build/`, so a repeat has to be archived before the
next one overwrites it:

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  npm run measure
  mkdir -p "run$i" && cp _build/benchmarks.csv _build/benchmarks-datasets.csv "run$i/"
done
npm run measure:aggregate run1 run2 run3 run4 run5 run6 run7 run8 run9 run10
```

The same fold can be replayed from the committed data alone:

```bash
python3 scripts/aggregate-measurements.py --from-runs
```

`data/` holds the frozen measurements (medians, per-run values, input hashes).

## Usage

1. Launch PhyloRecViewer.
2. Open a `.recphyloxml`, `.recphylo`, `.xml`, `.phyloxml`, `.nhx`, `.nwk`, or
   `.newick` file via **File → Open**, drag & drop, or OS file association.
3. Use the left panel to adjust layout, style, and labels.
4. Use the right panel for search, statistics, transfer network, and consistency checks.
5. Export to SVG / PNG / PDF / HTML via the **Export** menu.

See the [full user manual (English)](./docs/USER_MANUAL.md) or [详细使用手册 (中文)](./docs/USER_MANUAL.zh-CN.md) for detailed instructions.

## Documentation & community

Every document ships in English and in Chinese. The English file is the primary
one; the `.zh-CN.md` file is its translation and is kept in step with it.

- [User manual](./docs/USER_MANUAL.md) · [使用手册](./docs/USER_MANUAL.zh-CN.md)
- [Contributing guide](./CONTRIBUTING.md) · [贡献指南](./CONTRIBUTING.zh-CN.md) — toolchain, checks, release process
- [Security policy](./SECURITY.md) · [安全策略](./SECURITY.zh-CN.md)
- [Code of conduct](./CODE_OF_CONDUCT.md) · [行为准则](./CODE_OF_CONDUCT.zh-CN.md)

## Architecture

```
src/
├── model/      # Normalized data model
├── parser/     # recPhyloXML + NHX parsers
├── layout/     # Six-pass layout pipeline
├── analysis/   # Statistics, comparison, validation
├── render/     # Pure SVG renderer
├── export/     # SVG/PNG/PDF/HTML/NHX export
├── state/      # Zustand store, undo/redo
├── app/        # React components
├── samples/    # Bundled sample reconciliations
└── platform/   # Tauri desktop integration
```

## Citation

If you use PhyloRecViewer in your research, please cite:

> Zeng Z. PhyloRecViewer: an interactive, cross-platform viewer for gene–species reconciliations.

The machine-readable form is [CITATION.cff](./CITATION.cff).

## License

MIT — see [LICENSE](./LICENSE).

