# PhyloRecViewer — Detailed User Manual

**English** | [中文](./USER_MANUAL.zh-CN.md)

> **Applicable version**: v0.2.0 (working tree; latest archived release is v0.1.2)
> **Purpose**: An offline, interactive desktop viewer for recPhyloXML / NHX gene–species reconciliations
> **Platforms**: macOS / Windows / Linux desktop (Tauri 2), plus a browser build (Web Build)
> **Application identifier**: `org.recphyloxml.viz`
> **Intended readers**: evolutionary biologists working on gene-family evolution, horizontal gene transfer (HGT), and host–symbiont cophylogeny

---

## Table of Contents

1. [Overview](#1-overview)
   - 1.1 Core capabilities
   - 1.2 Quick start
   - 1.3 Glossary
2. [Installation & Launch](#2-installation--launch)
3. [Interface at a Glance](#3-interface-at-a-glance)
4. [Working with Files](#4-working-with-files)
   - 4.1 Opening files
   - 4.2 Multi-file open: merge or separate tabs
   - 4.3 Drag & drop
   - 4.4 OS file association (double-click / "Open with")
   - 4.5 Loading bundled samples
   - 4.6 Nested level (3-level view)
   - 4.7 Compare view
   - 4.8 Document tabs
5. [Canvas Navigation & Interaction](#5-canvas-navigation--interaction)
   - 5.1 Canvas floating toolbar
   - 5.2 Zoom & pan
   - 5.3 Fit to view
   - 5.4 Minimap
   - 5.5 Gene-node interaction
   - 5.6 Species-branch interaction (mirror / swap)
   - 5.7 Collapse / expand
   - 5.8 Annotations
   - 5.9 Renaming labels on the canvas
6. [Left Controls Panel](#6-left-controls-panel)
   - 6.1 Layout Actions
   - 6.2 Layout Parameters
   - 6.3 Style
   - 6.4 Labels & batch rename
7. [Right Analysis Panel](#7-right-analysis-panel)
   - 7.1 Search & Filter
   - 7.2 Statistics
   - 7.3 Transfer Network
   - 7.4 Data checks
   - 7.5 Annotations
   - 7.6 Differences (compare mode)
8. [Legend](#8-legend)
9. [Exporting](#9-exporting)
10. [Session Save & Load](#10-session-save--load)
11. [Undo / Redo](#11-undo--redo)
12. [Menu Bar Reference](#12-menu-bar-reference)
13. [Preferences & Themes](#13-preferences--themes)
14. [Help & Onboarding](#14-help--onboarding)
15. [Supported File Formats](#15-supported-file-formats)
16. [Keyboard Shortcut Reference](#16-keyboard-shortcut-reference)
17. [Troubleshooting](#17-troubleshooting)
18. [Known limitations](#18-known-limitations)
19. [Appendix](#19-appendix)

---

## 1. Overview

PhyloRecViewer is an **interactive gene–species reconciliation viewer** for evolutionary biologists. It natively supports the **recPhyloXML** format and reads reconciled gene trees with `[&&NHX]` annotations directly — no pre-conversion scripts required. The app runs fully offline and lets you explore large-scale reconciliation events (speciation, duplication, loss, horizontal gene transfer) interactively, with search & filtering, statistics, a transfer network, consistency checks, and publication-grade export.

### 1.1 Core capabilities

- Fully offline desktop application — your data never leaves the machine
- Auto-detection of recPhyloXML and NHX / Newick formats
- 3-level nested reconciliation view (Gene → Symbiont → Host)
- Comparison view for two reconciliations — panes stack vertically by default with a side-by-side toggle; disagreeing nodes are highlighted automatically (event type, species mapping and transfer donor/recipient are compared)
- Rich, real-time layout & style parameters (4 orientations, compact layout, branch lengths, …)
- Node search (regex supported), event-type filtering, gene-family filtering, confidence-range filtering
- Statistics (with CSV export), transfer-network diagram, sixteen structural data-consistency checks (every check is listed in [Section 7.4](#74-data-checks))
- Batch label renaming and per-node annotations (with a dedicated annotations mode)
- Undo / redo (100 steps), session save/load, multiple document tabs
- One-click export to PNG (Screen 2× / 300 / 600 / 1200 / 2400 / 4800 DPI or custom) / SVG / PDF / interactive HTML / NHX; the headless CLI additionally exports a lossless recPhyloXML round-trip (see [Section 9.2](#92-data))
- Bilingual UI (中文 / English) with light / dark / system themes
- Three bundled samples: showcase reconciliation, nested gene/symbiont/host view, comparison demo (see [Section 4.5](#45-loading-bundled-samples))

### 1.2 Quick start

1. **Launch**: the app opens on an empty-state hub — **Open file**, **Load sample** (one of the three bundled samples), drag files into the window, or click **Shortcuts & help** to get oriented first.
2. **Open your data**: **File → Open file** (or `⌘O` / `Ctrl+O`) and pick a supported file — `.recphyloxml` / `.recphylo` / `.xml` / `.phyloxml` holding **recPhyloXML content**, or `.nhx` / `.nwk` / `.newick` gene trees (see [Section 4.1](#41-opening-files)) — or simply drag files into the window.
3. **Navigate**: scroll to zoom, drag empty space to pan, press `F` to fit the view.
4. **Interact**: click a gene node to highlight its lineage and open the node inspector; `Shift`-click to annotate; `Alt`/`Option`-click an internal node to collapse it; click a species branch to mirror (swap) it.
5. **Analyse**: click the **◧** button (top-left of the canvas) to open the right analysis panel — search & filter, statistics, transfer network, data checks (see [Section 7](#7-right-analysis-panel)).
6. **Export**: the **Export** menu offers publication-grade PNG / SVG / PDF / HTML, plus **NHX · Newick** data export; the headless CLI (`npm run cli`) additionally writes a lossless recPhyloXML round-trip (see [Section 9.2](#92-data)).

> The tips list at the bottom of the left panel and the shortcuts card under **Help** (press `?`) are always available.

### 1.3 Glossary

| Term | Meaning |
|------|---------|
| **Reconciliation** | The mapping between a gene tree and a species tree, inferring speciation / duplication / loss / transfer events |
| **recPhyloXML** | The app's native file format; root element `<recPhylo>` |
| **NHX** | An annotated gene-tree format (`[&&NHX]`) that can carry reconciliation events |
| **Mirror / swap** | Flipping a species subtree left–right to reduce transfer crossings; internally called `swap` |
| **Lineage** | The complete ancestor → descendant path of a gene node |
| **Species tube** | The thick band drawn for each species-tree branch |
| **Transfer arc** | The dashed arrow connecting a donor to a recipient (horizontal gene transfer) |
| **Event** | The evolutionary event type of a gene node — seven types in total (see [Section 8](#8-legend)) |

---

## 2. Installation & Launch

### 2.1 Desktop build (recommended)

1. Download the installer for your OS from the releases page (GitHub Releases).
2. Install and launch **PhyloRecViewer**.
3. The app opens on an empty-state hub: open a file, load a bundled sample, drag files in, or view the shortcuts & help card.

| Platform | Package |
|---|---|
| macOS (Apple Silicon / Intel) | `.dmg` |
| Windows | `.exe` installer (or `.msi`) |
| Linux | `.deb` (or `.AppImage`) |

The default window size is 1320×860 (minimum 900×600).

### 2.2 Browser build

The build output lives in `dist/`. Serve it over HTTP with `npm run preview` and open the printed `http://localhost:4173/` address: the bundle loads its JavaScript as ES modules, which browsers refuse to run from a `file://` page, so double-clicking `dist/index.html` shows a blank window. The browser build uses the browser's file picker and download flow; native file dialogs and OS file associations are **not** supported. Everything else (canvas, analysis, export-to-download) matches the desktop build.

### 2.3 Running from source (developers)

```bash
cd PhyloRecViewer
npm install
npm run dev        # browser dev server (Vite, http://localhost:5173)
npm run tauri dev  # desktop (Tauri) dev mode
npm run build      # production build -> dist/
npm test           # Vitest unit tests
npm run typecheck  # tsc -b type check
npm run lint       # ESLint
npm run cli -- --help   # headless CLI: stats / checks / SVG / HTML / recPhyloXML / NHX export
```

Prerequisites: Node.js 20+, npm 9+; desktop packaging additionally needs Rust 1.77+.

---

## 3. Interface at a Glance

Top to bottom, left to right:

```
┌──────────────── Menu bar (MenuBar): File | Export | View | Help ────────────────┐
│        (right side: warnings badge · filename info · draggable empty area)      │
├──────────────────── Tab bar (TabBar): document tabs + new tab ──────────────────┤
├─ Left panel ──┐ ┌──────────────────── Main canvas ─────────────────┐ ┌─ Right ─┐
│ Controls      │ │ Top-left: floating toolbar (zoom/fit/undo/       │ │ Analysis │
│  Layout       │ │           annotate/analysis toggle)              │ │  Search  │
│  Actions      │ │ Center: species tubes + gene skeleton + transfer │ │  Stats   │
│  Parameters   │ │         arcs + labels + annotations              │ │  Network │
│  Style        │ │ Bottom-left: legend · top-right: minimap         │ │  Checks  │
│  Labels       │ │                                                  │ │  Annot.  │
│  (Tips)       │ │                                                  │ │ (Diff)   │
└───────────────┘ └──────────────────────────────────────────────────┘ └──────────┘
```

- **Menu bar**: four dropdown menus — File, Export, View, Help (see [Section 12](#12-menu-bar-reference)). When parsing produces warnings, a warnings badge appears; hover it for the full list.
- **Tab bar**: multiple document tabs — new, switch, close (see 4.8).
- **Left panel (Controls)**: four collapsible sections (Layout Actions, Layout Parameters, Style, Labels) plus a tips list at the bottom (see [Section 6](#6-left-controls-panel)).
- **Main canvas**: the visualization area. Floating toolbar top-left (zoom, fit, undo/redo, annotate mode, analysis toggle); legend bottom-left; minimap top-right (see [Section 5](#5-canvas-navigation--interaction)).
- **Right panel (Analysis)**: five fixed tabs (Search & Filter, Statistics, Transfer Network, Data checks, Annotations); a sixth **Differences** tab appears in compare mode (see [Section 7](#7-right-analysis-panel)).

> Both side panels are resizable by dragging their dividers; the `‹` / `›` buttons collapse and re-expand them. Below 1000 px window width the analysis panel auto-collapses; below 820 px the left panel follows (both can be reopened manually).

---

## 4. Working with Files

### 4.1 Opening files

**File → Open file** (`⌘O` / `Ctrl+O`):

- **Desktop build**: native system file picker; multiple selection allowed.
- **Browser build**: browser file picker.

Accepted extensions: `.recphyloxml` `.recphylo` `.xml` `.phyloxml` — these are containers for **recPhyloXML content** (a plain PhyloXML tree is not a reconciliation and is refused) — plus `.nhx` `.nwk` `.newick` for NHX / Newick gene trees. The format is auto-detected — see [Section 15](#15-supported-file-formats).

A single file opens in the current tab if that tab is blank or only shows a bundled sample **you have not edited**; if the tab holds a modified document (or an edited sample), a new tab is created to preserve your work.

### 4.2 Multi-file open: merge or separate tabs

When **several files** are selected / dropped at once, a dialog asks **"Open N files as…"**:

- **Merge into one document**: all gene families are merged into one reconciliation against the first file's species tree; families are named after their source files and coloured distinctly. Species referenced by later files but missing from the first tree are reported as warnings.
- **One tab per file**: each file opens independently in its own tab.

After merging, a toast confirms "Merged N files into one reconciliation".

### 4.3 Drag & drop

Drag one or more files **anywhere onto the window**; a **"Drop to open"** overlay appears — release to open. Dropping multiple files asks merge-vs-tabs (see 4.2); a dropped single file reuses the current tab only when that tab is blank or shows an **unmodified** bundled sample — dropping onto a tab with a modified document opens a **new tab**, so your work is never overwritten.

### 4.4 OS file association (double-click / "Open with")

The desktop build registers file associations for `.recphyloxml` / `.recphylo` and `.xml` / `.phyloxml` (recPhyloXML), plus `.nhx` / `.nwk` / `.newick` (NHX / Newick). The associations only decide which app opens the file — the content must still be recPhyloXML or NHX/Newick (a plain PhyloXML tree is refused, see [Section 15](#15-supported-file-formats)). Because `.xml` is a generic extension, the app can become a candidate default for other XML documents after installation; drop the `.xml` association in your system settings if you do not want that. In your file manager:

- **Double-click** such a file, or **right-click → Open with → PhyloRecViewer**, to launch/wake the app with that file.
- Files opened while the app is running load as new tabs (macOS delivers them via the `open-file` event).

### 4.5 Loading bundled samples

**File → Samples** offers the bundled samples (each menu label describes the events the sample shows and follows the UI language):

| Sample | Description |
|--------|-------------|
| **Showcase** | General sample: speciation / duplication / loss / transfer |
| **Compare demo** | Two inferences of the same family (auto-enters compare view) |
| **Nested demo** | Gene / symbiont / host, three levels (auto-enters nested view) |

The empty-state hub shows the same set of buttons. Loading a sample marks the tab as a sample; opening a real file clears the marker. The parse-error panel also offers a **Load sample** shortcut.

### 4.6 Nested level (3-level view)

**File → + Nested level** loads a second reconciliation as the **Host** layer, entering the 3-level view:

- Left canvas: **Gene → Symbiont**
- Right canvas: **Symbiont → Host**

Once loaded the menu item becomes **"Nested: <filename> ✕"**; click it to remove the nested level. The nested canvas keeps its species-mirror (swap) state independently of the main canvas (internally two sets, `nestedSwapped` vs `swapped`), so identically named species never interfere.

> Note: loading a new primary file clears any nested level and comparison. If the nested file fails to parse, a yellow banner appears above the canvas ("Nested file error: …").

### 4.7 Compare view

**File → + Compare** loads an alternative reconciliation of the same family (e.g. from another tool or parameter set), entering compare view:

- Two canvases, titled by file name (A / B). Panes are **stacked vertically by default**; the ⇕ / ⇔ button in the compare status bar switches to **side-by-side**, and the choice is remembered.
- Gene nodes that **disagree** between the two are highlighted automatically. Comparison covers **three dimensions** — terminal event type, species mapping, and transfer donor/recipient — so a result that only moves a gene to another species no longer scores as full agreement. The legend gains a "nodes differing between files" chip.
- The **status bar** under the panes shows the breakdown: the agreement percentage (nodes agreeing on **all** dimensions, divided by the union of comparable nodes), the species-mapping agreement among matched nodes, and the counts of matched / only-in-A / only-in-B nodes — e.g. `71% agree · 80% species match · 7 matched · 1 only in A · 0 only in B`.
- The **Link views** checkbox keeps the two panes' zoom/pan in sync; when unchecked each pane can be navigated independently.
- The compare pane keeps its **own** mirror (swap), collapse and family-colour state, independent of the primary document — and the session file stores it too (see [Section 10](#10-session-save--load)).
- The ◎ / ◉ button in the status bar hides or restores the diff highlighting; the right panel gains a **Differences** tab (see 7.6).

Once loaded the menu item becomes **"Compare: <filename> ✕"**; click it to remove the comparison.

> Note: nesting and comparison are **mutually exclusive** — loading one clears the other.

### 4.8 Document tabs

- **＋** at the right end of the tab bar: new blank tab.
- Click a tab to switch; each tab independently stores its own file, swaps, collapses, family colours, annotations, renames, search criteria, and undo history.
- Hovering a tab reveals its **✕** close button. If the document holds unsaved edits (annotations, swaps, colours, renames, …), a confirmation appears before an unsaved document is closed; closing the last tab resets it to blank rather than quitting.
- Closing the active tab activates an adjacent tab.
- Keyboard support on the tab bar: `←` / `→` to move, `Home` / `End` for first/last, `Enter` / `Space` to activate.

---

## 5. Canvas Navigation & Interaction

### 5.1 Canvas floating toolbar

A floating button cluster sits at the **top-left** of the canvas (undo/redo and the analysis toggle appear on the primary pane only):

| Button | Action |
|--------|--------|
| `−` | Zoom out (1/1.2) |
| `100%` | Current zoom level (live) |
| `＋` | Zoom in (1.2×) |
| `⤢` | Fit to view (same as `F`) |
| `↶` / `↷` | Undo / redo (same as `⌘Z` / `⌘⇧Z`) |
| `✎` | **Annotate mode** toggle (see 5.8) |
| `◧` | Open / close the right analysis panel |

### 5.2 Zoom & pan

| Action | Effect |
|--------|--------|
| **Scroll wheel** | Zoom centred on the cursor |
| **Drag empty space** | Pan the canvas |
| **`⌘ +` / `⌘ =` (mac) or `Ctrl +` / `Ctrl =`** | Zoom in 1.2× |
| **`⌘ -` / `Ctrl -`** | Zoom out 1/1.2 |
| **`F`** or the `⤢` button | Fit to view |
| **Zoom readout** | Live percentage in the floating toolbar |

Zoom range is **3% – 1000%**. The zoom level drives a level-of-detail (LOD) switch: below **0.42×** the pure event glyphs (duplication squares, loss crosses, transfer and speciation markers) are dropped, while species labels, gene labels and the gene-edge halos are still drawn; below **0.16×** all labels and the halos go too. Collapsed wedges and leaf tips are drawn at every zoom level, so the tree structure always reads. For very large inputs a brief "Rendering…" indicator appears at the top-right of the window.

### 5.3 Fit to view

Press **F** or click `⤢` to zoom and centre the whole diagram. The view also refits when a new file loads, when you switch tabs, when the orientation changes, and when the drawing grows significantly (e.g. larger level height), so content never silently overflows the viewport.

### 5.4 Minimap

Toggle **Layout Parameters → Minimap** in the left panel to show the overview thumbnail (**top-right** of the canvas, 168×120):

- Miniature species skeleton with the current viewport (highlighted rectangle).
- **Drag** inside the minimap to pan the main canvas; wheel events are captured by the minimap and do not zoom the main canvas.
- **Keyboard**: the minimap is focusable — arrow keys pan the viewport step by step, and `Enter` / `Space` re-centres the view on the whole drawing.

### 5.5 Gene-node interaction

| Action | Effect |
|--------|--------|
| **Hover** | Tooltip: gene name / event type @ species |
| **Click** | Highlight the node's **lineage** (ancestor → descendant path) **and open the node inspector** (see below); other nodes dim. Click empty space to clear |
| **`Shift` + click** | Open the **annotation editor** (see 5.8) |
| **`Alt` / `Option` + click internal node** | Collapse / expand that subtree (see 5.7) |
| **Click empty space** | Clear the lineage highlight, returning to the search/filter dim state |

Highlight priority: manual click lineage > search/filter dimming.

**Node inspector**: a plain click (on a gene node or on a transfer arc) opens a dockable card with the scientific detail of that node — species, family, transfer donor/recipient, timeSlice, event confidence or clade support, branch length, parent/children counts and the user annotation — plus **Locate**, **Annotate** and **Copy details** actions. Node tooltips and transfer-arc tooltips (donor → recipient, timeSlice, confidence) stay available for a quick read without clicking.

### 5.6 Species-branch interaction (mirror / swap)

- **Click a species branch** (a species with children): **mirror that subtree** (toggle swap); click again to restore.
- Purpose: **reduce transfer crossings** by flipping a crossing-prone subtree to the other side. The **Reduce crossings** button in the left panel does this automatically.
- Swap state is part of the undo/redo history.
- In 3-level view the two canvases store swap state **independently**, so identically named species never interfere.

### 5.7 Collapse / expand

- **`Alt` / `Option` + click an internal gene node**: collapse / expand that subtree.
- A collapsed subtree is drawn as a **wedge** pointing toward the leaves, labelled with the leaf count, e.g. `Collapsed (12) leaves`.
- `Alt` / `Option` + click again to expand; collapse state is undoable; hovering a wedge shows "Alt-click to expand".

### 5.8 Annotations

Two ways to add / edit annotations:

- **`Shift` + click** a gene node to open the annotation editor directly; or
- click the floating-toolbar **✎ to enter annotate mode** (button highlights), then **click** any gene node to annotate. Click `✎` again to leave the mode.

In the editor: type text, pick a colour, then **Save** (or `⌘Enter`); the node is drawn with a **coloured ring + text**. You can also **Remove** or **Cancel** (`Esc`). Saved annotations are managed centrally in the right panel's **Annotations** tab (see 7.5) and stored in the session file (see [Section 10](#10-session-save--load)).

### 5.9 Renaming labels on the canvas

**Click** any name label on the canvas (species labels, or gene labels that have a name; the cursor turns into a pointer) to get an inline input: `Enter` commits, `Esc` cancels, blur commits. Renames are undoable, can be applied in batch, and can be reset from the **Labels** section of the left panel (see 6.4).

---

## 6. Left Controls Panel

The left panel is titled **Controls** and contains four collapsible sections (open/close state is remembered; a pin control keeps a section open); a **Tips** list at the bottom summarises the canvas gestures.

### 6.1 Layout Actions

| Button | Description |
|--------|-------------|
| **Reduce crossings** | Heuristically shortens transfer arcs by auto-mirroring subtrees (optimises both main and nested canvases). The objective is the summed donor→recipient leaf-order distance — a proxy for the crossing count, not a crossing count — and at most 8 sweeps over at most 256 candidate subtrees run, so a very large, transfer-rich species tree is only partly optimised |
| **Reset swaps** | Clear all mirrors |
| **Reset all** | Restore every layout & style option to its default |

### 6.2 Layout Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Legend** | on/off | Show the legend on the canvas and include it in exported images |
| **Minimap** | on/off | Show / hide the top-right minimap |
| **Orientation** | Root top / bottom / left / right | Four-way radio buttons |
| **Level height** | 40–220 | Distance between adjacent species layers |
| **Gene spacing** | 8–42 | Horizontal gap between adjacent gene trees |
| **Species spacing** | 8–70 | Gap between adjacent species leaf nodes |
| **Species width** | 12–80 | Thickness of the species tubes |
| **Gene tree thickness** | 1–5 (step 0.2) | Thickness of the gene skeleton lines |
| **Align tips** | on/off | Snap extant species tips to a common baseline (ultrametric look). Warning: with **Branch lengths** on, this flattens the tips' length-derived positions — switch it off to read true time proportions |
| **Branch lengths** | on/off | Lay out the **species tree** by branch length (vs. uniform depth); gene trees are unaffected. Missing lengths contribute 0 and negative lengths are clamped to 0 for drawing (both are reported by the data checks) |
| **Compact layout** | on/off | Pack sibling subtrees closer (contour packing) instead of fixed-width leaf slots |
| **Center duplications** | on/off | Place duplication nodes at the **midpoint** of their species branch (otherwise nearer the ancestor) |

### 6.3 Style

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Curved branches** | on/off | Rounded curves vs. elbow bends for species branches |
| **Symbol size** | 4–16 | Event glyph size |
| **Transfer curve** | 0–0.5 (step 0.02) | Bow (curvature) of transfer arcs |
| **Halo under genes** | on/off | Light outline behind gene lines for contrast against species tubes |
| **Event glyphs** | on/off | Show event glyphs (duplication square, loss cross, …) |
| **Support values** | on/off | Show event confidence **and** clade/node support values beside nodes (the terminal event's confidence first, otherwise the clade support; species clade names carry bootstrap/posterior values too). Values also appear in node tooltips and the node inspector |
| **Tube gradient** | on/off | Fill species tubes with a gradient |
| **Overlapping copies (lanes) heatmap** | on/off | Colour species tubes by the number of gene lanes laid out inside them (the layout engine's concurrent lanes). This is a layout quantity, not a gene copy number: the per-species gene count excluding losses is listed separately in the statistics panel as **Lineages (non-loss)** |

### 6.4 Labels & batch rename

Three label classes, each independently toggled and styled:

- **Species names**
- **Gene tip node names**
- **Internal gene node names**

Per-class style controls: **Angle** (−90°–90°, step 5°), **Size** (6–28), **Bold**, **Italic**, **Offset** (−40–140), **Align** (Auto / Left / Center / Right).

At the bottom of the section:

- **Rename Labels**: opens a dialog with **Find** / **Replace with** fields, regex supported, and a **Scope** selector (Species names / Gene names / All labels); click **Apply**.
- **Reset labels**: appears when renames exist; restores all original names in one click.
- **Click** a single label on the canvas to rename it in place (see 5.9).

---

## 7. Right Analysis Panel

Click the floating-toolbar **◧** button to open/close the panel (after closing it, `⌘F` jumps straight to the search tab). The panel has five fixed tabs plus a sixth in compare mode:

**Search & Filter / Statistics / Transfer Network / Data checks / Annotations / (Differences)**

> Keyboard: move between tabs with `←` / `→`, `Home` / `End`.

### 7.1 Search & Filter

- **Search box**: type a gene or species name; tick **Regex** for regular-expression search.
- `Enter` jumps to the next match, `Shift + Enter` to the previous; **Next / Prev** buttons do the same and **centre** the main canvas on each match. The count shows e.g. `12 matches`; "No matches" when none.
- **By event type**: tick Speciation / Duplication / Loss / Transfer to show only those event types.
- **By gene family**: with multiple gene trees, each family has a colour swatch; tick to toggle visibility.
- **Confidence range**: two sliders bound the support value range (0–1) to filter low-confidence nodes.
- **Show only matches**: when on, only matching nodes render (by default non-matching nodes dim to opacity 0.12).
- **Clear**: resets the query, regex toggle, event filter, family filter, and confidence range in one click.

### 7.2 Statistics

- **Totals**: total node count, extant (tip) nodes, internal event nodes, and the transfer-arrival count. Transfer arrivals are overlay events — excluded from the composition chart but counted in Totals (speciation / duplication / loss are broken down in the distribution chart and the per-family table).
- **Event distribution**: proportional view of speciation / duplication / loss / transfer donor / bifurcation out / extant.
- **By family** (multiple families): per-family event-count table.
- **Transfer matrix**: donor → recipient transfer counts (top 25 rows; Donor / Recipient / Count columns).
- **By species (top)**: per-species table of **Lineages (non-loss)** (gene lineages carried, excluding losses), speciation, duplication, loss, transfer donor (branching out), bifurcation out and extant-gene counts (top 25 species). Transfer **arrivals** per species are reported separately from these donor-side events — in the CSV export's `transfer_arrivals` column (see below).
- **Nodes**: full node detail table (No., Name, Type, Event, Species, Family). Nodes are classified **extant leaf / loss / internal** — losses are no longer folded into "internal" — and are listed extant tips first, then losses, then internal events. The table is capped at 500 rows with a "`X / Y gene nodes` · table truncated" note.
- **Export CSV**: writes the statistics to `<filename>-stats.csv` with **stable English column names** and a **UTF-8 BOM** (so Windows Excel opens species names correctly), plus a provenance header (source file, app version, timestamp). Sections: `families`, `transfer_matrix`, `species` — including a `transfer_arrivals` column and a `(no species)` row whenever nodes without a species assignment exist — and `nodes`, which adds `donors`, `recipients`, `time_slice`, `confidence` and `branch_length` columns. The CSV is never truncated.

### 7.3 Transfer Network

A **circular graph** of donor → recipient transfers:

- Nodes = species, sized by transfer count; arrows = transfer direction, thicker means more transfers.
- **Hover** a node to focus its related transfers; the rest dim.
- Self-transfers (donor = recipient) render as small rings.
- Shows "No transfers" when there are none.
- Caption: nodes = species, arrows = transfers (thicker = more); hover to focus.

### 7.4 Data checks

Sixteen structural checks run on the loaded data — the table below is the complete list, and the panel itself shows one row per check; each row carries its **name**, the problem description, and a count:

| Check (name) | Problem found |
|--------------|---------------|
| Species references resolve | A gene references a species absent from the species tree |
| Species names are unique | The species tree contains duplicate species names |
| Every gene has a species | A gene node has no species assigned |
| Extant genes on leaf species | An extant gene sits on an internal (non-leaf) species |
| Transfer donors are paired | A branching-out donor lacks a transfer-arrival child |
| Transfer arrivals have a donor | A transfer arrival has no parent lineage at all |
| Transfer arrivals sit under a donor | A transfer arrival's parent is not a branching/bifurcation donor |
| Bifurcation donors are paired | A bifurcation-out donor lacks a transfer-arrival child |
| Loss / extant events are leaves | A `loss`/`leaf` (terminal) node has children |
| Speciation / duplication are binary | A speciation/duplication node is not 2-way |
| Transfers move forward in time | A transfer arrives into an ancestor species (time-travelling) — flagged as an error; when timeSlices are present on both sides they are compared directly |
| Same-species transfer | A transfer arrives in the species it left — possible gene flow within one lineage; reported separately because it is a model question, not a time-direction error |
| Transfer time not assessable | No timeSlice on the donor or the arrival and the species are unrelated, so the time direction cannot be judged (topology depth is not time) — the check reports "not assessable" instead of silently passing |
| Confidence looks like 0-100 | A confidence/support value is above 1 and at most 100 — probably a percentage, while the confidence filter expects 0–1 |
| Negative / invalid branch length | A branch length is negative or not finite; it is clamped to 0 for drawing |
| Vertical edge between unrelated clades | A non-transfer gene edge jumps between unrelated species — impossible without a transfer; check the speciesLocation annotations |

When everything passes the panel reports **"All checks passed"**; otherwise "N with issues".

### 7.5 Annotations

Central management for the current document's annotations: each entry lists its node and text, with jump / edit / remove actions. When empty: "No annotations yet. Shift-click a gene node (or use the annotate mode) to add one."

### 7.6 Differences (compare mode)

Only visible in compare view (4.7):

- Lists the **nodes that differ between the two files** — on any compared dimension (event type, species mapping, or transfer donor/recipient) or present in only one file — as two clickable lists (A / B); clicking an entry locates the node on that pane's canvas.
- The compare **status bar** (4.7) carries the headline numbers: agreement %, species-mapping agreement %, and the matched / only-in-A / only-in-B counts; the ◎ / ◉ button there hides or restores the diff highlighting.
- Read together with the legend's "nodes differing between files" chip.

---

## 8. Legend

The legend overlays the bottom-left of the canvas (toggle **Layout Parameters → Legend**) and is included in exported images:

**Evolutionary events** (glyph — event):

| Glyph | Event |
|-------|-------|
| Filled dot | Speciation |
| Filled square | Duplication |
| Cross ✕ | Loss |
| Open ring | Transfer (donor) |
| Dashed arc arrow on the species tube | Transfer (arrival) |
| Filled diamond ◆ | Bifurcation out |
| Filled dot (family colour) | Extant gene (tip node) |

**Gene families**: one colour swatch + name per gene tree. Each swatch is a colour picker — click to **change that family's colour** (undoable).

A toggle button in the legend's corner switches between **vertical / horizontal layout**.

---

## 9. Exporting

The **Export** menu (disabled while empty; `⌘E` / `Ctrl+E` exports PNG directly):

### 9.1 Images / pages

| Format | Notes |
|--------|-------|
| **PNG** | Raster; resolution selectable in the menu: **Screen 2× (192) / 300 / 600 / 1200 / 2400 / 4800 DPI**, good for slides and documents. Oversized drawings are clamped to whichever platform canvas limit bites first — 16,384 px on the longest edge **and** 16,384²/4 ≈ 6.7×10⁷ px in total (for a near-square drawing the area limit binds first, at roughly 8,192 px per side). A toast reports the effective DPI actually used |
| **SVG** | Vector, infinitely scalable; good for further editing |
| **PDF** | Vector page; good for paper figures |
| **HTML** | Interactive HTML (keeps zoom / pan / tooltips); shareable offline |

- Nested / compare views export **multiple panes in one image / page**, arranged as on screen (stacked, or side by side when the pane toggle is set).
- The default file name is the source file name without extension (special characters replaced by `_`), e.g. `myfile.png`.
- While exporting, the menu shows "Export …"; a "Exported" toast confirms success, "Export failed" reports errors.

### 9.2 Data

- **NHX · Newick**: exports the current reconciliation as NHX-annotated gene trees (`<filename>.nhx`). NHX is an **extended dialect** of this app, not a universal exchange format: the export writes **all transfer arrivals** (`TB=`, further arrivals as `TB2=`…`TB9=`), `timeSlice` (`TS=`), event confidence (`CN=`), node support (`B=`), and the branch length both as the standard Newick `:length` and a redundant `BL=` tag; `S=` species tags are inferred for internal nodes from their ancestors. It still loses the **species tree itself** (NHX rebuilds it from `S=` tags), **species branch lengths**, **gene-tree names**, and **species never sampled by any gene tree**.
- **recPhyloXML — the lossless round-trip**: the headless CLI writes the reconciliation back as recPhyloXML with the species tree (including branch lengths), every event, multiple `transferBack` arrivals, timeSlice and confidence intact (`npm run cli -- export --session <file>.rpvsession.json --out <file>.recphyloxml`; the CLI also exports SVG / HTML / NHX and writes stats / checks reports — see [Section 18](#18-known-limitations) for what it does not export).

> Desktop builds use the native save dialog; the browser build downloads to the default downloads folder.

---

## 10. Session Save & Load

**File → Save session as…** (`⌘S` / `Ctrl+S`) writes the current session as `.rpvsession.json`; **File → Open session…** restores one.

The session is plain JSON (its schema marker is `CURRENT_SESSION_VERSION` — this build writes **schema v2**) and captures:

- the source file content (`xml`) plus the nested / comparison sources and their names
- for a merged document, the **full list of source files** (`sourceFiles`), so a merge can be rebuilt exactly — menu load and startup recovery share one restore path, so every merged gene family comes back
- all layout parameters, render parameters, theme — and, since schema v2, **each background tab keeps its own layout/style options**
- species-mirror sets (main, nested **and compare** canvases stored separately), collapse sets — including the compare pane's `compareSwapped` / `compareCollapsed` / `compareGeneColors`
- per-gene-tree colours, per-node annotations, and label renames — by label text **and by node id** (`labelOverridesById`), so one of several same-named labels can be renamed alone
- the current **search & filter criteria** (`searchQuery`, `searchRegex`, `eventFilter`, `familyFilter`, `confidenceMin` / `confidenceMax`, and the `onlyMatches` flag)
- **snapshots of every other open tab** (`tabs`) and which of them is active (`activeTabIndex`), so saving and reloading restores the whole workspace, not just the active document

**What is not saved**: the zoom/pan camera of each canvas is deliberately not part of the session (nor of the autosave) — restored views re-fit to the content, and only layout/style/mirror/collapse state is restored.

**Compatibility**: a session file that omits fields opens with those fields at their defaults; a session file whose schema marker is ahead of this build is refused — the app says "This session was created by a newer version of PhyloRecViewer (vN); please update to open it." A JSON file without the `xml` field is rejected with "Not a PhyloRecViewer session file".

**Autosave & startup restore**: the workspace autosaves about once per second (debounced; unchanged state is not rewritten), and a `beforeunload` / `pagehide` flush writes the final moments of edits, so closing the window does not lose them. On startup the app **asks** instead of silently restoring: **Restore last workspace** (the prompt shows when the snapshot was taken) or **Start blank** (discards the snapshot). If a snapshot cannot be restored — for example because it was written by a newer app version — it is **quarantined**: kept untouched and reported, rather than deleted, so its content can still be recovered from local storage.

> A session stores source content and view state, **not** exported images, so it stays small and archivable.

---

## 11. Undo / Redo

- **Undo**: `⌘Z` / `Ctrl+Z`, or the floating-toolbar `↶`
- **Redo**: `⌘⇧Z` / `Ctrl+Shift+Z` or `Ctrl+Y`, or `↷`

Undoable actions: species mirroring (swap), collapse/expand, gene-family colour changes, annotation add/edit/remove, label renames (single and batch), reduce crossings, reset swaps. History is capped at **100 steps**; consecutive drags of the same slider merge into one step.

> Shortcuts are ignored while a text input is focused, to avoid conflicting with text editing.

---

## 12. Menu Bar Reference

| Menu | Item | Description |
|------|------|-------------|
| **File** | New workspace | Open a fresh blank tab |
| | Open file `⌘O` | Open one or more files (multi-select) |
| | Paste tree from clipboard | Open a Newick/NHX tree pasted as text |
| | Samples | Three bundled samples (Showcase / Compare / Nested) |
| | Save session as… `⌘S` | Save session `.rpvsession.json` |
| | Open session… | Restore a session |
| | Close tab `⌘W` | Close the current tab |
| | Load species tree (Newick)… | Provide a standalone species tree for leaf-only S= NHX gene trees |
| | + Nested level / Nested: <name> ✕ | Add / remove the host layer of the 3-level view |
| | + Compare / Compare: <name> ✕ | Add / remove the comparison |
| **Export** | PNG / SVG / PDF / HTML | Export image / page |
| | Copy SVG / Copy PNG | Copy the current figure to the clipboard |
| | recPhyloXML (lossless round-trip) | Native export: species tree, branch lengths, all events (incl. multiple arrivals), timeSlice, confidence |
| | NHX (extended dialect)… | Shows a "what will be lost" list first; switch to recPhyloXML or export anyway |
| | PNG DPI | Screen 2× / 300 / 600 / 1200 / 2400 / 4800 / custom, with an output pixel estimate |
| | Background | Theme / white / transparent |
| **View** | Language: 中文 / English | Switch UI language |
| | Theme: Light ☀ / Dark 🌙 / System 🖥 | Three theme modes |
| | Preferences | Open the preferences dialog |
| **Help** | Shortcuts & help `?` | Open the shortcuts & interactions card |
| | View tutorial | Replay the five-step onboarding tour |

The menu bar also shows a **warnings badge** (e.g. `3 warnings`; hover for the full list). The empty area of the menu bar drags the window (desktop build).

---

## 13. Preferences & Themes

The **Preferences** button in the menu bar opens the preferences dialog:

- **Theme**: Light ☀ / Dark 🌙 / **System** 🖥 (follows the OS dark/light setting live). Default: system.
- **Language**: 中文 / English. Default: **English**, unless the operating-system locale starts with `zh` (in which case Chinese); switching applies instantly; data (gene and species names) is never translated.
- **PNG DPI**: Screen 2× / 300 / 600 / 1200 / 2400 / 4800 / custom, linked with the Export menu.
- **View tutorial**: replay the onboarding tour.
- **Default view**: **Use current view as default** — store the current layout/style as the initial state for every new document; **Clear default view** restores the built-in defaults.
- **Reset preferences**: factory reset (theme = system, PNG DPI = 300, default layout/style; the UI language is kept unchanged) and clears the default view.

Themes affect the UI and canvas only; exports always render in the current theme.

---

## 14. Help & Onboarding

- **Shortcuts & help card** (`?` or Help → Shortcuts & help): all keyboard shortcuts, on-canvas gestures, and mouse/touch hints, with a one-click tour replay at the bottom. Close with `Esc`, the backdrop, or ✕.
- **Onboarding tour**: **5 steps** (Controls → Analysis → Canvas → Nested & compare → Export) with a spotlight highlight; `←` / `→` to navigate, skippable. Play it any time from the **Help menu / Preferences / help card**.
- **Empty state**: a blank tab explains how to open a recPhyloXML file, offers a **Load sample** shortcut and a drag-and-drop hint.
- **Parse-error panel**: shows "Could not parse this file" with supported formats, plus three recovery actions — **Choose another file / Back to previous / Load a sample**.

---

## 15. Supported File Formats

The format is auto-detected; no manual selection needed:

| Format | Extensions | Notes |
|--------|------------|-------|
| **recPhyloXML** | `.recphyloxml` `.recphylo` `.xml` `.phyloxml` | Native format; root element `<recPhylo>`. The extensions are only containers — the file content must be recPhyloXML |
| **NHX** | `.nhx` `.nwk` `.newick` | Reconciled gene trees (with `[&&NHX]` annotations) |
| **Newick** | `.nwk` `.newick` | Phylogenetic tree (parsed via the NHX parser) |

> **Plain PhyloXML is not supported**: a `<phyloxml>` document without `<recPhylo>` content is not a reconciliation, and the parser refuses it ("No `<recPhylo>` root element was found"). Run a reconciliation tool (Ancestors, ALE, Ranger-DTL, GeneRax, …) first.

**Detection logic**: the first 8000 characters are inspected for `<recPhylo` or `[&&NHX]` / a Newick statement or a leading `(`; otherwise the file extension decides; the fallback is recPhyloXML.

**NHX tag dialect**: the reader interprets `S=` (the species a node lives in — `SP=` is accepted as an alias), `D=` (duplication), `L=` (loss), `BO=` / `BC=` (transfer donors), `TB=` (transfer arrival; the exporter writes further arrivals on the same node as `TB2=`…`TB9=`), `TS=` (timeSlice), `CN=` (event confidence), `B=` (clade support) and `BL=` (gene-tree branch length, redundant with the standard Newick `:length`). A node carrying no event tag falls back to leaf / speciation by structure; when several event tags compete on one node, the recPhyloXML precedence applies (duplication > loss > branching-out > bifurcation-out) and a warning names the conflict. Any other tag key stays in the file but is dropped from the model, and a warning lists the dropped key names, so the loss is never silent.

**Multi-file merge**: see 4.2 — gene families merge against the first file's species tree; missing species are reported as warnings.

**Desktop file association**: after installation, double-clicking `.recphyloxml` / `.recphylo` or `.nhx` / `.nwk` / `.newick` opens them in PhyloRecViewer (see 4.4).

---

## 16. Keyboard Shortcut Reference

| Shortcut | Action |
|----------|--------|
| `⌘O` / `Ctrl+O` | Open file |
| `⌘S` / `Ctrl+S` | Save session |
| `⌘E` / `Ctrl+E` | Export PNG |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `⌘F` / `Ctrl+F` | Jump to the search field in the analysis panel |
| `⌘+` / `⌘=` / `Ctrl+=` | Zoom in 1.2× |
| `⌘-` / `Ctrl-` | Zoom out 1/1.2 |
| `F` | Fit to view |
| `?` | Open the shortcuts & help card |
| `Esc` | Close dialogs / menus; cancel inline rename |
| `⌘Enter` / `Ctrl+Enter` | Save the annotation editor |

**Canvas mouse / touch**:

| Action | Effect |
|--------|--------|
| Scroll wheel | Zoom (centred on the cursor) |
| Drag empty space | Pan |
| Click a gene node | Highlight lineage |
| `Shift` + click a gene node | Add / edit annotation (or enter annotate mode with ✎, then click) |
| `Alt` / `Option` + click an internal gene node | Collapse / expand subtree |
| Click a species branch | Mirror (swap) subtree |
| Click a name label | Rename in place (Enter commits / Esc cancels) |
| Hover a node | Tooltip (name / event @ species) |
| Click empty space | Clear highlight |

> These shortcuts are suppressed while focus is inside a text field (the annotation editor and rename inputs have their own Enter / Esc semantics).

---

## 17. Troubleshooting

### Q1 "Could not parse this file" when opening

- Confirm the file is a **recPhyloXML** (root `<recPhylo>`) or **NHX** reconciliation result.
- Plain Newick / PhyloXML trees without reconciliation annotations cannot be visualised directly — run a reconciliation tool (Ancestors, ALE, Cogent, …) first.
- Check the file is valid UTF-8 and not truncated.
- The error panel offers **Back to previous** and **Load a sample** so you can keep working.

### Q2 Nested level or comparison fails to load

- Nesting and comparison are **mutually exclusive**: loading one clears the other — intentional.
- Loading a new primary file clears both the nested level and the comparison.
- The nested / comparison file is parsed independently; errors show as a yellow banner above the canvas ("Nested file error: …").

### Q3 Many transfer crossings; the drawing looks cluttered

- Use **Reduce crossings** in the left panel (also optimises the nested canvas).
- Manually **click species branches** to mirror them one by one.
- Enable **Compact layout** for tighter packing.
- Increase **Transfer curve** to make arc endpoints easier to trace.

### Q4 Exported image is blurry / too low resolution

- For publication figures prefer vector formats (**SVG / PDF**).
- For **PNG**, pick 300 / 600 / 1200 / 2400 / 4800 DPI or a custom value in **Export menu → PNG DPI** or in **Preferences**.

### Q5 Session file won't open

- Confirm it is a `.rpvsession.json` and valid JSON.
- If created by a newer version, older versions refuse it with "please update to open it" — update the app.
- A JSON file without the `xml` field is rejected ("Not a PhyloRecViewer session file").

### Q6 How to batch-import multiple gene families

- **Multi-select** several files in the picker (or drop several onto the window) and choose **Merge into one document**.
- The merge uses the first file's species tree; choosing **One tab per file** keeps them separate.

### Q7 Browser build vs. desktop build

| Feature | Desktop | Browser |
|---------|---------|---------|
| File dialog | Native system | Browser default |
| File-association open | Supported | Not supported |
| Save location | Chosen path | Downloads folder |
| Offline | Fully offline | Offline after first load |

### Q8 I closed a tab that had annotations — can I recover it?

Closing a tab with unsaved annotations / swaps / colours asks for confirmation ("Keep / Close anyway"). If you saved a session beforehand, restore it via **File → Open session…**. In addition, the workspace autosave snapshots **all open tabs** (not just the active one) about once per second and is flushed again when the window closes, so after an unexpected quit the next launch **offers to restore** every tab's document and view state (**Restore last workspace** / **Start blank**).

---

## 18. Known limitations

- **No XSD validation**: recPhyloXML files are parsed structurally, not validated against the official schema; the data checks (7.4) catch common mistakes but are not a schema validator.
- **Parser diagnostics are English canonical strings**: the UI translates the messages it knows through `i18nDiagnostics.ts`; a message without a translation is shown in English.
- **Zoom / pan camera is not saved**: neither sessions nor the autosave store each canvas's zoom/pan state; restored views re-fit to the content.
- **PDF font embedding depends on the environment**: the PDF is vector, with text embedded using the fonts available to the converter; the full-page raster fallback kicks in only when the converter errors.
- **The headless CLI (`npm run cli`) exports SVG / HTML / recPhyloXML / NHX and JSON stats + checks, but no PNG** (rasterization needs a browser canvas).
- **Compare "agreement" covers event type + species mapping + transfer donor/recipient — not topology or support values**: nodes are matched by gene/family name (unnamed clades by their leaf set), so renamed clades count as mismatches, and differing branch support is not compared.

---

## 19. Appendix

### A. Architecture (for developers)

- Frontend: React 18 + TypeScript (strict) + Vite + Zustand (state) + d3-zoom / d3-selection + SVG rendering
- Desktop shell: Tauri 2 (Rust) — native file dialogs, file association, `open-file` event
- Parsers: `fast-xml-parser` (recPhyloXML) + custom NHX / Newick parser
- Layout: six-pass pipeline (species placement → gene embedding → transfer arcs → optimisation)
- Export: `jspdf` + `svg2pdf.js` (PDF), native SVG / PNG serialisation, custom interactive HTML export
- Tests: Vitest (covers parsers, layout, statistics, checks, session, …)

### B. Event types

| Internal type | Chinese | English | Glyph |
|---------------|---------|---------|-------|
| speciation | 物种形成 | Speciation | Filled dot |
| duplication | 基因重复 | Duplication | Filled square |
| loss | 基因丢失 | Loss | Cross ✕ |
| branchingOut | 基因转移（供体） | Transfer (donor) | Open ring |
| transferBack | 基因转移（受体） | Transfer (arrival) | Arrow on the species tube |
| bifurcationOut | 树外分叉 | Bifurcation out | Filled diamond |
| leaf | 现存基因 | Extant gene | Filled dot |

### C. Session file fields

`version` (the session schema marker — v2 in this build), `fileName`, `xml`, `sourceFiles` (the full file list of a merged document), `nestedName` / `nestedXml`, `compareName` / `compareXml`, `layoutOptions`, `renderOptions`, `themeId`, `swapped`, `nestedSwapped`, `compareSwapped` / `compareCollapsed` / `compareGeneColors` (the compare pane's own state, v2), `collapsed`, `geneColors`, `annotations`, `labelOverrides`, `labelOverridesById` (renames keyed by node id, v2), `tabs` (a snapshot of every other open tab, each with its own `layoutOptions` / `renderOptions`, v2), `activeTabIndex`, and the search/filter criteria `searchQuery`, `searchRegex`, `onlyMatches` (v2), `eventFilter`, `familyFilter`, `confidenceMin`, `confidenceMax`. The per-canvas zoom/pan camera is not part of the file.

### D. Practical ceilings

These are hard limits in the code, not configuration suggestions; hitting one produces a readable error rather than a silent truncation.

| Limit | Value | Where it applies | Behaviour when exceeded |
|---|---:|---|---|
| Maximum file size opened | 64 MiB | native open dialog and OS-association open | the file is refused with a message naming the limit |
| Clade nesting depth | 1,000 | recPhyloXML, NHX and Newick readers | parse aborts with a "nested too deep" error instead of a stack overflow |
| Newick nodes per file | 2,000,000 | Newick reader | parse aborts with an error |
| Newick trees per file | 100,000 | Newick reader | parse aborts with an error |
| Remembered dialog paths | 256 | desktop shell | the oldest grant is dropped |
| Crossing-optimizer candidates | 256 per sweep | layout heuristic | only the 256 smallest transfer-involved subtrees are tried |
| Crossing-optimizer sweeps | 8 | layout heuristic | the search stops early if no improvement is found |
| Undo history | 100 steps | state store | the oldest step is discarded |
| PNG canvas | 16,384 px per edge **and** ≈6.7×10⁷ px total | export | scale is reduced and the effective DPI is reported |
| Statistics tables | top 25 rows; node table 500 rows | right panel | the per-species and transfer-matrix tables list the 25 largest entries; the node detail table caps at 500 rows with a truncation note; CSV export is not truncated |
| Viewport culling | above 1,500 gene nodes | canvas | gene elements outside the viewport are not drawn; species tubes, labels and transfer arcs always are |
| Level of detail | zoom < 0.42× and < 0.16× | canvas | independent of document size: pure event glyphs are dropped below 0.42×; all labels and gene-edge halos drop below 0.16× |

---

*The Chinese edition of this manual is [`docs/USER_MANUAL.zh-CN.md`](./USER_MANUAL.zh-CN.md).*
