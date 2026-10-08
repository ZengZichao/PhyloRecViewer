# Third-party notices

**English** | [中文](./THIRD-PARTY-NOTICES.zh-CN.md)

What this file covers, and what the MIT [LICENSE](./LICENSE) does *not* cover:

1. one third-party **data** file that is redistributed inside the source archive,
   whose upstream repository declares no licence (§1);
2. the third-party **code** the application links, and why "released under the MIT
   license" is not a complete description of an installer (§2);
3. the bundled data that is the authors' own, so it is visibly not at issue (§3);
4. two open items that a reader or an editor should see stated rather than infer
   (§4).

Everything below is reproducible with the commands given. Hashes and byte sizes are
quoted rather than asserted: they are the anchor an editor or a reviewer can check
without asking anyone's permission.

---

## 1. `src/parser/__fixtures__/9999.nhx.xml` — third-party demonstration data, permission pending

### 1.1 What it is, and why the repository carries it

A real NHX/PhyloXML reconciliation for 63 extant species, produced by NOTUNG. The
application uses it twice: as a parser/analysis test
fixture, and as the reference case behind manuscript Fig. 2 (the statistics card in
that figure is this file's `computeStats()` output). It is the only non-author-made
**data** file we have identified in the source tree, and it is the reason this file
exists. One provenance question stays open and is the authors' to close: the icon set
in `src-tauri/icons/` entered the repository in `a65c8f3` together with the Tauri
scaffold, so nothing in the history distinguishes author-made artwork from the
scaffold's placeholder icons; if they are the scaffold defaults, their own licence
terms apply and belong in this file too.

### 1.2 Provenance, with anchors a third party can fix

| Item | Value |
|---|---|
| Upstream repository | <https://github.com/WandrilleD/recPhyloXML> (Duchemin et al. 2018, the recPhyloXML project) |
| Upstream path | `testFiles/9999.nhx.xml` |
| Upstream commit anchor (default branch `master` HEAD) | `8c6b2849e219923b9e5da21df4483466724b09c2` — authored 2021-01-08T08:27:44Z, *"python converter from NOTUNG to xml : proper handling of events following a transferBack"*; repository `pushed_at` 2021-01-08T08:28:09Z |
| Upstream git blob id | `93e85800837ccd02277421090efc668110e629fb` |
| Upstream file | **22,307 bytes**, SHA-256 `972579ea48696152c8b0d2ca7b49ab0c707bbef73b9924b8271b1051fe2063a8` |
| Copy deposited here | **22,321 bytes**, SHA-256 `fd7ebfc5190268d45cda867440c31d4ca6fdd8f40d672cb186f8d0d8d9ecde34` |
| Copied / last touched in this repository | 2026-09-25 |
| Re-verified against the GitHub API | 2026-10-08 (blob id, size and commit anchor unchanged; upstream has had no commit since 2021-01-08) |

Re-check the anchors yourself (read-only, no credentials needed beyond a public API
request):

```bash
shasum -a 256 src/parser/__fixtures__/9999.nhx.xml            # fd7ebfc5…de34, 22,321 B
git hash-object src/parser/__fixtures__/9999.nhx.xml          # ≠ upstream blob: one edit, see 1.3
gh api repos/WandrilleD/recPhyloXML/contents/testFiles/9999.nhx.xml \
   --jq '{sha, size}'                                        # 93e85800…, 22307
gh api repos/WandrilleD/recPhyloXML/branches/master \
   --jq '.commit.sha, .commit.commit.author.date'             # 8c6b2849…, 2021-01-08T08:27:44Z
gh api repos/WandrilleD/recPhyloXML --jq .license             # null  → see 1.4
```

Content facts of the deposited copy, recomputed with `xml.etree.ElementTree`: 125
species clades of which 63 are species leaves; one `<recGeneTree>` (one gene
family); 23 gene nodes of which 12 are leaves; recorded events: 7 `speciation`, 4
`duplication`, 6 `loss`, 6 `leaf`, and no transfer event — a duplication/loss-only
reconciliation.

### 1.3 The single modification: 14 bytes, and why

The deposited copy differs from upstream in exactly one line, on the `<phylogeny>`
element that opens the species tree:

```diff
     <recPhylo>
       <spTree>
-        <phylogeny>
+        <phylogeny rooted="true">
```

`diff` reports one changed line (`grep -c '^[<>]'` → 2, i.e. one removed and one
added); nothing else in the file differs. The arithmetic of the size difference is
one leading space plus the 13 bytes `rooted="true"`:
`22,307 + 14 = 22,321`.

Why the edit is needed: the file has **two** `<phylogeny>` elements — the species
tree under `<spTree>` and the gene tree under `<recGeneTree>` — and upstream already
carries `rooted="true"` on the gene-tree one but not on the species-tree one. Both
schemas declare the attribute mandatory
(`xsd/recSpeciesTreeXML.xsd:47` and `xsd/recGeneTreeXML.xsd:46`,
`<xsd:attribute name="rooted" type="xsd:boolean" use="required"/>`, with the comment
that a species tree associated with a reconciled tree is always rooted), so the
untouched upstream file is not schema-valid and the application's own data checks
would reject the very file used to demonstrate them. The added attribute states a
fact about the data that the upstream author's own gene-tree element already states;
it changes no topology, no name, no annotation and no event.

The deposited copy is deliberately **not** annotated in place: its byte size and
SHA-256 are quoted in the article, so adding a header comment to the XML would break
the numbers a reviewer is asked to verify. Provenance therefore lives here, and
`docs/USER_MANUAL.md` §15 points to this file.

### 1.4 Licence status, and the two ways it will be closed out

* The upstream repository **declares no licence at all**: the GitHub API returns
  `license: null`, and the repository root at the commit above contains
  `README.md cpp python python3 recPhyloXML-Bioinformatics.pdf testFiles xsd` —
  no `LICENSE`, `COPYING` or equivalent. The recPhyloXML article and the project
  pages distribute these test files, but distributing them is not the same as
  licensing their redistribution.
* **Permission is being requested** from the rights holders (Wandrille Duchemin and
  the recPhyloXML project authors) for redistribution of this file under the MIT
  licence of this repository, with attribution. Until that permission is on file
  with the editorial office, this repository's MIT licence does not cover §1's
  file, and any statement that *all* material underlying the article is freely
  available under a licence would overstate the position. This file is the place
  that gap is recorded.
* **Fallback plan**, if permission is not granted: replace the fixture with a
  licence-clear equivalent — either a synthetic NHX/PhyloXML reconciliation generated
  by the authors (the recipe already exists in `scripts/measure.ts`, which emits
  deterministic synthetic reconciliations from a fixed seed), or a file from a
  source that does declare a data licence. The replacement must preserve the
  quantities the article quotes for this file (63 species leaves, 125 species
  clades, one gene family, 23 gene nodes, 12 gene leaves, no transfer events) and
  reproduce the Fig. 2 statistics card, and the new size, SHA-256 and provenance
  would then replace §1.2 here.
* **One thing the fallback cannot undo**: the version DOI
  `10.5281/zenodo.23053318` archives commit `a65c8f3` (tag `v0.1.0`), and that
  immutable snapshot already contains this 22,321-byte copy. A replacement can only
  appear in a *later* version under the concept DOI `10.5281/zenodo.23053317`; the
  archived v0.1.0 deposit cannot be amended.

---

## 2. Third-party code, and what an installer is made of

The application's own code is written under the MIT licence, but a built binary is
not only this repository's code: it statically links a dependency tree whose
licence is Apache-2.0 or ISC in several places. "Released under the MIT license"
therefore describes the *source*, not the contents of a `.dmg` / `.msi` / `.AppImage`.

The runtime tree that ships, counted from the committed `package-lock.json` with
`npm ls --prod --all --parseable`, is **49 packages**. The direct dependencies, read
out of the installed tree at the versions the lockfile resolves to:

| Package | Resolved version | Licence |
|---|---|---|
| `react`, `react-dom` | 18.3.1 | MIT |
| `zustand` | 4.5.7 | MIT |
| `fast-xml-parser` (and its `strnum`) | 4.5.7 | MIT |
| `jspdf` | 2.5.2 | MIT |
| `svg2pdf.js` | 2.7.0 | MIT |
| `d3-selection`, `d3-zoom` (and the `d3-*` closure) | 3.0.0 | ISC |
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.7.2 | MIT OR Apache-2.0 |

Two packages in that closure carry a **dual** licence, and the option taken is
recorded here rather than left to the reader:

* `dompurify@2.5.9` (via `jspdf`) — `(MPL-2.0 OR Apache-2.0)`, taken under the
  **Apache-2.0** option, so no MPL file-level terms attach to the bundle;
* `rgbcolor@1.0.1` (via `canvg` ← `jspdf`) — `MIT OR SEE LICENSE IN FEEL-FREE.md`,
  taken under the **MIT** option.

The rest of the closure is MIT, with `@babel/runtime` and `core-js` under
Apache-2.0 and `cssesc` under ISC. Scanning the licence field of every installed
`package.json` (360 packages, `node_modules/**/package.json`) turns up **no
GPL / AGPL / LGPL / SSPL / EPL / CPOL / non-commercial term**; the two terms worth
naming are build-time only and never enter the bundle — `caniuse-lite@1.0.30001806`
(CC-BY-4.0, via `browserslist`) and `argparse@2.0.1` (Python-2.0). Re-run either
scan with:

```bash
npm ls --prod --all --parseable | sed 's#.*/node_modules/##' | sort -u   # the shipped closure
npx --yes license-checker --production --summary                          # same, with licence strings
```

**Not verified here, and tracked as an open item:** the Rust side. `src-tauri/Cargo.lock`
pins 433 `[[package]]` entries, but a Cargo lockfile records no licence field, so a
crate-licence report needs the crates.io index and cannot be produced offline from
what is committed. Generate it before distribution with
`cargo install cargo-about` and `cargo about generate <template.hbs>`; Tauri's own
build output can embed the resulting notice file.

On Linux the desktop bundle also links the system WebKitGTK / GTK / GLib stack.
Those are the distribution's own packages (GNU LGPL and BSD/MIT-style terms), are
not redistributed by this repository, and are why the documented Linux prerequisite
is "WebKitGTK 4.1+" rather than a bundled runtime.

---

## 3. Bundled data that is the authors' own

No third-party claim attaches to any of these; they are written by the authors and
are covered by the MIT licence with the rest of the repository:

* the six demonstration reconciliations in `src/samples/`
  (`showcase`, `all-events`, the two `nested-*` levels of the 3-level demo, and the
  `compare-tool-a` / `compare-tool-b` pair);
* `src/parser/__fixtures__/conformant-minimal.recphyloxml` (2,380 bytes), whose own
  header comment records that it is a hand-written minimal schema-conformant
  document pinning how the parser reads the conformant dialect.

---

## 4. Open items

| # | Item | Status | Where it is tracked |
|---|---|---|---|
| 1 | Written permission to redistribute `9999.nhx.xml` (§1.4) | requested, not yet on file | this file; the article's Data availability section |
| 2 | Replace the fixture with a licence-clear equivalent if permission is refused | plan recorded, not started | §1.4 |
| 3 | The manuscript figures embed subsetted TrueType font programs (HelveticaNeue, an Apple/Monotype-licensed face) in their delivered PDFs — 25 across the seven PDFs as measured on 2026-10-08 and quoted in the article's Supplementary Note S6.2; redistribution of those carriers needs either a licence-clear face (e.g. Arimo / Liberation Sans) or the publisher's font handling | open, and the figure pipeline is not yet inside this repository; the count follows a rebuild that is still in progress | `figures/README.md`, `docs/FIGURE_REPRODUCTION.md` |
| 4 | Importing the figure scripts into `figures/` so the "all material produced by the authors is version-controlled" statement is true of the figures too | pending (in progress elsewhere in the revision) | `figures/README.md` |
| 5 | A generated crate-by-crate licence report for the 433 entries in `src-tauri/Cargo.lock` (§2) — not derivable offline | open; needed before binaries are distributed | §2 |

*Last reviewed 2026-10-08 for the manuscript revision of that date.*
