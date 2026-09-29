# Contributing to PhyloRecViewer

**English** | [中文](./CONTRIBUTING.zh-CN.md)

Thank you for your interest in contributing to PhyloRecViewer! This document describes the development workflow, code standards, and project structure.

## Prerequisites

- **Node.js** 20+ and npm 9+ (`engines` in `package.json`; CI pins Node 20). The
  lockfile is `lockfileVersion: 3` and `packageManager` pins the npm 10 line that
  maintains it — with Corepack enabled (`corepack enable`) you get that version
  automatically; any npm 9+ also reads the lockfile fine.
- **Rust** toolchain 1.77+ (for the Tauri desktop shell)
- **macOS**: Xcode Command Line Tools
- **Linux**: `libwebkit2gtk-4.1-dev` (WebKitGTK 4.1) and the other Tauri system libraries (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
- **Windows**: Microsoft C++ Build Tools

## What CI Runs

`.github/workflows/ci.yml` is the gate every pull request has to pass, on
Ubuntu 22.04, macOS and Windows:

| Job | What it does |
|---|---|
| `web` (3-OS matrix) | `npm ci` → `check:tracked` → `lint` (`--max-warnings 0`) → `typecheck` → `test` → `build` on all three systems; `coverage` and `npm run measure` on Linux only; the `npm run preview` smoke test on Linux and macOS (`windows-latest` is excluded there) |
| `tracked-only-build` | re-exports **only the files git tracks** from the commit into a clean directory, links `node_modules` into it, and runs `npm run build`, `npm run typecheck`, `npm test` there — so "tracked file imports an untracked file" cannot pass CI |
| `rust` (Ubuntu + macOS) | `cargo fmt --all -- --check`, `cargo check --all-targets`, `cargo test --all-targets`, `cargo clippy --all-targets -- -D warnings` for the Tauri shell, on Ubuntu and macOS |

Release packaging (installers for all three platforms) is a separate workflow —
see [Releasing a version](#releasing-a-version).

## Getting Started

```bash
git clone <repository-url>
cd PhyloRecViewer
npm install
npm run tauri dev   # start the desktop app in dev mode
```

For web-only development (no Tauri):

```bash
npm run dev         # http://localhost:5173
npm run build       # production bundle -> dist/
npm run preview     # serve dist/ over http://localhost:4173
```

`npm run preview` is the only supported way to look at the production bundle in a
browser: the bundle loads `type="module"` scripts, and opening `dist/index.html`
straight from the filesystem is blocked by the browser's CORS rules for module
scripts (you get a blank window with a console error).

npm version: `package.json` pins `packageManager` (npm 10 line, matching
`lockfileVersion: 3`). With Corepack enabled (`corepack enable`) the pinned
version is used automatically. Always install with `npm ci` when you only need
the locked dependency set — that is what CI does — and use `npm install` only
when you deliberately change a dependency, so `package-lock.json` is updated in
the same commit. Never hand-edit the lockfile.

## Project Structure

```
src/
├── app/           # React components (App, Canvas, Sidebar, RightPanel, …)
├── render/        # Pure-function SVG renderer (Scene, geometry, theme)
├── layout/        # Six-pass layout pipeline (species/gene/transfers/…)
├── model/         | Immutable reconciliation model (Reconciliation, GeneNode, …)
├── parser/        # recPhyloXML / NHX / Newick parsers
├── analysis/      | Focus matches, stats, consistency checks, diff
├── export/        | SVG / PNG / PDF / HTML / NHX exporters
├── state/         | Zustand store, autosave, session, prefs
├── platform/      | Tauri desktop bridge (file open/save, fs)
├── samples/       # Bundled example reconciliations (four menu entries)
├── i18n.ts        # zh/en dictionary (compile-time type-checked)
├── session.ts     # Session file serialization (current schema version lives here)
└── styles.css     # Global CSS (TRAE Minimalist design system)
src-tauri/
└── src/           # Rust shell (file association, dialogs, atomic save)
scripts/
├── measure.ts                  # parse / layout / render benchmarks -> _build/*.csv
├── aggregate-measurements.py   # folds repeated runs -> data/*.csv + MANIFEST.json
└── check-tracked-files.mjs     # repo self-consistency guard (npm run check:tracked)
.github/workflows/
├── ci.yml         # lint / typecheck / test / build on Ubuntu + macOS + Windows
└── release.yml    # installers: draft release on a v* tag, artifacts on a manual run
tsconfig.json      # solution file (references app / node / test projects)
tsconfig.app.json  # src/ for the browser build
tsconfig.node.json # vite.config.ts + scripts/ (also what `tsc -b` checks the scripts with)
tsconfig.test.json # *.test.ts(x) and src/test/
tsconfig.scripts.json  # jsx/types for `npm run measure`
vite.config.ts     # build + vitest (incl. coverage) configuration
.githooks/pre-commit            # optional local guard: npm run hooks:install
```

## Development Workflow

### Code Quality

Before submitting a pull request, all of these must pass:

```bash
npm run typecheck     # tsc -b, TypeScript strict — must report 0 errors
npm run lint          # eslint . --max-warnings 0 — 0 errors AND 0 warnings
npm run lint:fix      # same rules, auto-fixing what ESLint can fix
npm test              # vitest run (the suite grows; CI prints the real counts)
npm run coverage      # same tests plus a text/html/lcov report under coverage/
npm run check:tracked # no tracked file may import an untracked one (see below)
npm run build         # tsc -b && vite build
```

and, when the desktop shell is touched:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo check --all-targets
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
```

There is **no separate code formatter** in this project: ESLint (with
`typescript-eslint` and the React hooks/refresh plugins) is the only style tool,
so `npm run lint:fix` is the auto-fix path. Please do not reformat unrelated
files — style churn makes a diff impossible to review.

`cargo test --all-targets` is deliberate: a bare `cargo test` also builds
doctests, which fails on machines where the `rustdoc` component is not installed.

### Keeping the repository self-consistent

A file that is *not* in git but is imported by a file that *is* in git is a
special kind of trap: `tsc -b`, `vite build` and `vitest` all pass locally — the
file is sitting in the working tree — and every fresh clone (including CI) fails.
Worse, an untracked test file does not fail anything: it just quietly shrinks the
suite, so CI reports green while testing less than the repository appears to.

`npm run check:tracked` (`scripts/check-tracked-files.mjs`) catches that whole
class: it resolves every relative import in tracked source, checks the
test/source files git reports as untracked, and verifies relative links inside
tracked Markdown. CI runs it in every job, and also **builds a
tracked-files-only export of the commit** so a regression cannot slip through.

To get the same check locally before you commit:

```bash
npm run hooks:install                       # once per clone: git config core.hooksPath .githooks
git config --unset core.hooksPath           # undo it
```

The hook is a convenience, not the gate — `git commit --no-verify` skips it, and
CI remains authoritative.

When you add a file, stage it in the same commit as the code that imports it:

```bash
git add -- src/model/newthing.ts src/samples/new-sample.recphyloxml
```

### Benchmark reproduction scripts

The published benchmark tables under `data/` come from the application's own
parser → layout → renderer path, so they are runnable from a clean clone:

```bash
npm run measure            # -> _build/benchmarks-datasets.csv, benchmarks.csv
npm run measure:aggregate  # fold repeated runs -> data/*.csv + data/MANIFEST.json
```

`npm run measure` goes through `tsx --tsconfig tsconfig.scripts.json`. That extra
config exists because the root `tsconfig.json` is solution-style (`files: []`, no
`compilerOptions`): without it tsx falls back to the *classic* JSX transform and
every `.tsx` module in the graph dies with `ReferenceError: React is not defined`.
`tsconfig.scripts.json` therefore sets `"jsx": "react-jsx"` and must keep `src/**`
in its `include` — tsx only applies a config to files the config covers.
`_build/` is generated output and is git-ignored; regenerate it rather than
committing it. The committed CSVs under `data/` are the published benchmark
tables. CI runs the script so it cannot rot silently.

### Figures and figure scripts are not repository content

Figures, the scripts that draw them, and the rendered PNG/PDF/SVG all live
outside this repository — including the helper script that pushes a bundled
sample through `Scene` at print-legible label sizes. Two reasons:

- a figure is an editorial artifact: its label size, line weights and tube tone
  are tuned to one page width, and revising them is not a change to the software;
- a clone then contains only code that is under test, and the repository's CI
  never depends on a drawing script.

The dependency points one way only: those scripts read `data/*.csv`,
`src/samples/` and `src/parser/__fixtures__/` from this repository. When a figure
needs something that is not here, what is missing is *data*, and committing that
is a repository change — not a reason to move a drawing script into the repo.

### Testing

Tests are written with [Vitest](https://vitest.dev/) and run under jsdom:

```bash
npm test            # run all tests once
npm run test:watch  # watch mode
npm run coverage    # + coverage report (console summary, html, lcov)
```

Do not quote a test count in documentation or commit messages: it goes stale
within a day. Run `npm test` and read the summary Vitest prints.

When adding a new feature, add corresponding tests. Priority areas:
- Parser edge cases (malformed XML, deep trees, empty files, attribute-vs-element
  spellings that the recPhyloXML XSD allows)
- State transitions (load/unload, undo/redo, tab switching)
- Session round-trip (serialize → parse → restore)
- Anything the benchmark tables measure: a number in `data/` needs a test, not a
  one-off script run

### Documentation

Every document in this repository ships in two languages: the English file is the
primary one, and the sibling `.zh-CN.md` file is its translation —
`README.md` / `README.zh-CN.md`, `docs/USER_MANUAL.md` / `docs/USER_MANUAL.zh-CN.md`,
`CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`, `SECURITY.md` / `SECURITY.zh-CN.md`,
and `CODE_OF_CONDUCT.md` / `CODE_OF_CONDUCT.zh-CN.md`. The pairs are **translations
of each other**: every prose change lands in both, in the same order, with the same
tables. GitHub detects the English files as the repository's community documents, so
new files keep the `.zh-CN.md` suffix convention rather than moving into `docs/`.

Three files deliberately stay single-language: `LICENSE` ships the MIT text
verbatim, because a translation would not carry the same legal wording;
`CITATION.cff` is a machine-readable record rather than prose; and the GitHub forms
under `.github/` (`PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/*`) have a single
English source, because GitHub parses one file per form.

Manuals describe the code, so verify against the source before writing. Prefer
behaviour over magic numbers where a number is likely to move (e.g. "the panel
lists every structural check it runs" rather than "six checks"): counts that must
be exact — session schema version, DPI presets — belong in `src/` and are quoted
from there.

### Code Standards

- **TypeScript strict mode**: every file is type-checked; `noUnusedLocals` is on.
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are **not** enabled:
  switching either on currently reports dozens of new diagnostics across `src/`,
  so they are a deliberate, separate piece of work rather than a config edit. Do
  not describe the codebase as "fully strict" in documentation.
- **Immutable model**: `Reconciliation`, `Positions`, and `LayoutResult` are never mutated. New state produces new objects.
- **No hardcoded UI strings in components**: all user-facing text in `src/app/`, `src/state/` and `src/export/` goes through `src/i18n.ts`, and the `Dict` interface enforces compile-time completeness for both `zh` and `en`. Two exceptions are known: the bundled sample titles in `src/samples/index.ts` are Chinese constants that reach the menu and the export file names, and the parse-failure text in `friendlyParseError` is English-only.
- **Single store**: all application state lives in one Zustand store (`src/state/store.ts`). The store layer should not import from `app/` or contain i18n strings.
- **Session file trust boundary**: all options read from session files or prefs must pass through `sanitizeLayoutOptions` / `sanitizeRenderOptions` before reaching the layout/render engine.
- **Session schema version**: `CURRENT_SESSION_VERSION` in `src/session.ts` is the
  single source of truth. Bump it only when the persisted shape changes, and keep
  the "what a session contains" list and the version note in both user manuals in
  sync with the code (the manuals quote the value; nothing else defines it).

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for branched phyloXML events
fix: prevent nested layer from persisting after document switch
docs: update README installation instructions
refactor: extract slider component into shared controls
```

### Pull Requests

1. Fork the repository and create a feature branch from `main`.
2. Make your changes following the code standards above.
3. Ensure all checks pass (`typecheck`, `lint`, `test`, `check:tracked`, `build`;
   `cargo fmt/check/test/clippy` when the Rust shell changed).
4. Fill in `.github/PULL_REQUEST_TEMPLATE.md` — it is the checklist CI cannot run
   for you (documentation parity across both languages, format-compliance
   reasoning).
5. If adding a new rendering/layout option, document it in the `Dict` interface,
   the sidebar controls, and both user manuals.

## Releasing a version

Releases are built by CI; nothing has to be compiled or uploaded by hand.

1. Land the change on `main` with the version set consistently in
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   `CITATION.cff` and the version line in both manuals.
2. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m "PhyloRecViewer vX.Y.Z"
   git push origin vX.Y.Z
   ```
3. `.github/workflows/release.yml` builds macOS / Windows / Linux installers and
   creates a **draft** GitHub Release with the bundles attached. Installers are
   unsigned: macOS users must allow the app once (right-click → Open), and the
   Linux `.AppImage` needs `chmod +x`.
4. Check the draft — open each installer on the platform it targets, load a
   sample and a real file, export PNG/SVG/PDF/HTML/NHX, save and reload a session —
   then publish it.

To validate packaging work *without* a tag, run
**Actions → Release → Run workflow** on the branch: the same three platforms build
and are uploaded as workflow artifacts, and no release is created.

### Citation

`CITATION.cff` is the machine-readable citation record for the software. Its
`version` and `date-released` describe the release being tagged and are set in
the same commit as the version bump in `package.json`, `tauri.conf.json` and
`Cargo.toml`; the citation blocks in `README.md` and `README.zh-CN.md` quote the
same title and author. Fill in a `doi` only once a registry has actually issued
one for a published release — never invent it.

### Dependabot

`.github/dependabot.yml` opens weekly update PRs for npm, Cargo (`src-tauri`) and
GitHub Actions. Dependency bumps are reviewed like any other PR: CI must be green,
and for runtime dependencies someone should run `npm run tauri dev` plus the
export paths before merging (a parsing or rendering regression is invisible to the
test suite). Merge one ecosystem at a time so a regression has a single cause.

## Adding a New File Format Parser

1. Implement the parser in `src/parser/`.
2. Register it in `src/parser/formats.ts` (`parseReconciliation` or `parseMerged`).
3. Add test cases covering well-formed, malformed, and edge-case input.
4. Update `friendlyParseError` in `store.ts` to mention the new format.

## Adding a New Layout/Render Option

1. Add the field to `LayoutOptions` or `RenderOptions` with a sensible default.
2. Wire it into the layout pipeline (`src/layout/`) or the renderer (`src/render/`).
3. Add a UI control in `Sidebar.tsx` (use the existing `Slider` / `Switch` / `Select` components).
4. Add the field to `sanitizeLayoutOptions` / `sanitizeRenderOptions` in `session.ts`.
5. Add it to `SessionData` and `SavedTab` interfaces.
6. Add i18n keys for the label and tooltip in `src/i18n.ts`.

## License & community

By contributing, you agree that your contributions will be licensed under the MIT
License (see [LICENSE](./LICENSE)). Participation is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md); please report security problems as
described in [SECURITY.md](./SECURITY.md) rather than in a public issue.
