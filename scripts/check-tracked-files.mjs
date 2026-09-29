/**
 * scripts/check-tracked-files.mjs
 *
 * Repository self-consistency guard. Run it with `npm run check:tracked`
 * (or let `.githooks/pre-commit` / CI run it). It answers one question:
 *
 *     "If I clone this commit, does the project still build and test?"
 *
 * Why: a file can be imported by tracked source while itself being untracked.
 * `tsc -b`, `vite build` and `vitest` then pass locally (the file is sitting in
 * the working tree) and fail for everyone else — a fresh clone cannot build.
 * Vitest has the quieter variant: an untracked test file under src/ silently
 * shrinks the suite, so CI reports a green run that tests less than the
 * repository appears to.
 *
 * Checks
 *   1. every relative import in tracked source resolves to a *tracked* file;
 *   2. every file `git ls-files --others --exclude-standard` reports under the
 *      source/test globs is reported (it would be invisible to a fresh clone);
 *   3. relative links in tracked Markdown point at files that exist and are
 *      tracked (dead "see the detailed manual" links are the doc counterpart
 *      of check 1).
 *
 * Exit status: 0 = clean, 1 = problems found. No third-party dependencies.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import process from "node:process";

/** True only for existing *files* — a directory must not shadow `dir/index.ts`. */
function isFile(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** NUL-separated git file lists, normalised to repo-relative posix paths. */
function gitFiles(args) {
  const out = execFileSync("git", args, { encoding: "buffer", maxBuffer: 64 << 20 });
  return out
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\\/g, "/"));
}

const tracked = gitFiles(["ls-files", "-z"]);
const trackedSet = new Set(tracked);
const untracked = gitFiles(["ls-files", "-z", "--others", "--exclude-standard"]);
const untrackedSet = new Set(untracked);

/** Files whose *relative imports* must resolve to tracked files. */
const SOURCE_RE = /^(src|scripts)\/.*\.(ts|tsx|mts|cts)$/;
/** Source-ish files that CI/builds load by glob rather than by import. */
const TEST_RE = /^src\/.*\.(test|spec)\.(ts|tsx)$|^src\/test\//;
const MARKDOWN_RE = /^.*\.md$/i;

/** Strip Vite-style resource queries/suffixes: "./a.xml?raw" -> "./a.xml". */
function stripQuery(spec) {
  return spec.split(/[?#]/)[0];
}

/**
 * Repo-relative paths in git's own vocabulary. `path.join` emits backslashes on
 * Windows while `git ls-files` always reports forward slashes, so every joined
 * candidate has to be normalised before it is compared against (or printed
 * alongside) the tracked set — otherwise a clean Windows checkout reports every
 * import and doc link as missing.
 */
function toPosix(p) {
  return p.replace(/\\/g, "/");
}

/** Import specifiers: static, side-effect, dynamic import(), require(). */
function relativeImports(source) {
  const re =
    /(?:^|[\s;}])(?:import|export)[\s\S]{0,200}?from\s*["']([^"']+)["']|(?:^|[\s;=})(])(?:import|require)\s*\(\s*["']([^"']+)["']|(?:^|[\s;}])import\s+["']([^"']+)["']/g;
  const found = new Set();
  let m;
  while ((m = re.exec(source))) {
    const spec = m[1] || m[2] || m[3];
    if (spec && spec.startsWith(".")) found.add(spec);
  }
  return [...found];
}

/** Resolve a relative specifier the way bundler-style resolution does. */
function resolveSpecifier(fromFile, spec) {
  const base = dirname(fromFile);
  const target = toPosix(join(base, stripQuery(spec))).replace(/^\.\//, "");
  const abs = resolvePath(REPO, target);
  const exts = [
    "",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".scss",
  ];
  const candidates = [];
  for (const ext of exts) candidates.push(target + ext);
  for (const ext of exts) candidates.push(toPosix(join(target, `index${ext}`)));
  for (const cand of candidates) {
    if (isFile(resolvePath(REPO, cand))) return cand;
    if (trackedSet.has(cand) || untrackedSet.has(cand)) return cand;
  }
  // Nothing anywhere: report the path without an added extension, e.g. the
  // `?raw` asset itself, so the message names what the author wrote.
  return target;
}

const problems = [];

// -- 1. tracked source must not import untracked files ----------------------
for (const file of tracked) {
  if (!SOURCE_RE.test(file)) continue;
  const abs = resolvePath(REPO, file);
  if (!existsSync(abs)) {
    problems.push({
      kind: "deleted",
      detail: `${file} is tracked but missing from the working tree (stage the deletion or restore it)`,
    });
    continue;
  }
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue; // binary / unreadable: nothing to resolve
  }
  for (const spec of relativeImports(text)) {
    const resolved = resolveSpecifier(file, spec);
    if (trackedSet.has(resolved)) continue;
    if (untrackedSet.has(resolved)) {
      problems.push({
        kind: "untracked-import",
        detail: `${file} imports "${spec}" -> ${resolved}, which is NOT tracked by git`,
        add: [resolved],
      });
    } else {
      problems.push({
        kind: "missing-import",
        detail: `${file} imports "${spec}" -> ${resolved}, which does not exist`,
      });
    }
  }
}

// -- 2. untracked tests / sources that CI would silently skip --------------
for (const file of untracked) {
  const isTest = TEST_RE.test(file);
  if (isTest || SOURCE_RE.test(file)) {
    problems.push({
      kind: "untracked-source",
      detail: isTest
        ? `${file} is an untracked test file: a fresh clone loses it and CI quietly runs a smaller suite than the repository appears to have`
        : `${file} is untracked source: a fresh clone loses it and the build breaks wherever it is imported`,
      add: [file],
    });
  }
}

// -- 3. relative Markdown links -------------------------------------------
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
for (const file of tracked) {
  if (!MARKDOWN_RE.test(file) || file.startsWith("node_modules/")) continue;
  const abs = resolvePath(REPO, file);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, "utf8");
  let m;
  while ((m = LINK_RE.exec(text))) {
    const href = m[1].trim();
    if (/^(https?:|mailto:|#|data:)/i.test(href)) continue;
    const target = stripQuery(decodeURIComponent(href.split("#")[0]));
    if (!target) continue;
    const resolved = dirname(file) === "." ? target : toPosix(join(dirname(file), target));
    const clean = resolved.replace(/^\.\//, "");
    if (!existsSync(resolvePath(REPO, clean))) {
      problems.push({
        kind: "dead-link",
        detail: `${file} links to ${href}, which does not exist in the repo`,
        add: untrackedSet.has(clean) ? [clean] : [],
      });
    } else if (!trackedSet.has(clean)) {
      problems.push({
        kind: "dead-link",
        detail: `${file} links to ${href}, which exists but is NOT tracked by git`,
        add: [clean],
      });
    }
  }
}

// -- report ----------------------------------------------------------------
const toAdd = [...new Set(problems.flatMap((p) => p.add || []))].sort();

if (problems.length === 0) {
  console.log(
    `check-tracked-files: OK — ${tracked.length} tracked files, all relative imports and Markdown links resolve to tracked files.`,
  );
  process.exit(0);
}

console.error(`check-tracked-files: ${problems.length} problem(s) found\n`);
for (const p of problems) console.error(`  [${p.kind}] ${p.detail}`);
if (toAdd.length) {
  console.error("\nA fresh clone of this commit cannot build/test without these files.");
  console.error("Stage them with:\n");
  console.error(`  git add -- ${toAdd.join(" ")}`);
}
process.exit(1);
