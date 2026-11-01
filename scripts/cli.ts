/**
 * Headless command-line interface for reproducible figure and data export.
 *
 * Run from the project root:  npm run cli -- <command> [options]
 *
 * The session file (.rpvsession.json) is the single input of every command: it
 * stores the source document text(s) plus the complete view state (layout /
 * render options, theme, swaps, collapses, colors), so each artifact is
 * rebuilt deterministically from the same bytes and can be regenerated months
 * later with identical output.
 *
 * Commands:
 *   stats   Reconciliation statistics as CSV (stdout when --out is omitted).
 *   check   Structural consistency checks + parser warnings as a JSON report;
 *           exit code 1 when an error-level issue or a warning exists.
 *   export  A standalone SVG, an interactive HTML page, a recPhyloXML
 *           document or an NHX gene tree, following the --out extension.
 *
 * The SVG/HTML exporters serialize through the DOM (DOMParser/XMLSerializer),
 * so a jsdom window is installed as the global DOM before the exporters module
 * is imported. No command touches the network and nothing is collected: the
 * CLI runs fully offline, like the application itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { computeStats, statsToCsv } from "../src/analysis/stats";
import { checkConsistency, type ConsistencyIssue } from "../src/analysis/validate";
import { reconToNhx } from "../src/export/newickExport";
import { reconToRecPhyloXml } from "../src/export/recPhyloXmlExport";
import type { ExportDoc } from "../src/export/exporters";
import { layout, type LayoutResult } from "../src/layout";
import type { Reconciliation } from "../src/model/types";
import { parseMerged, parseReconciliation } from "../src/parser/formats";
import type { Theme } from "../src/render/theme";
import { themes } from "../src/render/theme";
import { parseSession, type SessionData } from "../src/session";
import { APP_NAME, APP_VERSION } from "../src/version";

/**
 * jsdom ships no TypeScript types and @types/jsdom is not a dependency, so its
 * CommonJS entry is loaded through createRequire with the narrow shape this
 * script uses: a window typed like the DOM globals it will stand in for.
 */
const requireCjs = createRequire(import.meta.url);
const { JSDOM } = requireCjs("jsdom") as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
};

// ---------------------------------------------------------------------------
// usage + argument parsing
// ---------------------------------------------------------------------------

const USAGE = `PhyloRecViewer CLI (headless, offline)

Usage:
  npm run cli -- <command> [options]

Commands:
  stats --session <file.rpvsession.json> [--out <file.csv>]
      Write reconciliation statistics (families, transfer matrix, species
      density, nodes) as CSV; stdout when --out is omitted.

  check --session <file.rpvsession.json> [--out <file.json>]
      Run the structural consistency checks and collect the parser warnings
      into a JSON report; stdout when --out is omitted. Exit code 1 when the
      report contains an error-level issue or any parser warning, else 0.

  export --session <file.rpvsession.json> --out <file.svg|file.html|file.recphyloxml|file.nhx>
      Rebuild the session's drawing and export it; the format follows the
      --out extension:
        .svg          standalone SVG with a <metadata> provenance block
        .html         self-contained interactive page (pan/zoom)
        .recphyloxml  the reconciliation as recPhyloXML
        .nhx          the reconciliation as NHX

Options:
  --session <file>  session file to load (required by every command)
  --out <file>      output path (required by export)
  --help            show this help

Exit codes: 0 success; 1 check found problems (or a runtime error); 2 usage error.
`;

/** An argument or command-level error: reported with exit code 2. */
class UsageError extends Error {}

interface ParsedArgs {
  command: string | null;
  session: string | null;
  out: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { command: null, session: null, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") {
      args.help = true;
    } else if (a === "--session" || a === "--out") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`option ${a} requires a value`);
      }
      if (a === "--session") args.session = value;
      else args.out = value;
      i++;
    } else if (a.startsWith("--")) {
      throw new UsageError(`unknown option: ${a}`);
    } else if (args.command === null) {
      args.command = a;
    } else {
      throw new UsageError(`unexpected argument: ${a}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// session loading (shared by every command)
// ---------------------------------------------------------------------------

function loadSession(path: string): SessionData {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read session file ${path}: ${(e as Error).message}`);
  }
  return parseSession(text);
}

/** Parse the session's active document the same way the app restores a tab. */
function loadRecon(session: SessionData): Reconciliation {
  if (session.sourceFiles && session.sourceFiles.length > 1) {
    return parseMerged(session.sourceFiles);
  }
  return parseReconciliation(session.xml, session.fileName ?? undefined);
}

/** Write to --out, or dump to stdout when no path was given. */
function writeOrStdout(out: string | null, text: string): void {
  const data = text.endsWith("\n") ? text : text + "\n";
  if (out === null) {
    process.stdout.write(data);
  } else {
    writeFileSync(out, data, "utf8");
    console.error(`wrote ${out}`);
  }
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

function cmdStats(sessionPath: string, out: string | null): void {
  const session = loadSession(sessionPath);
  const recon = loadRecon(session);
  const csv = statsToCsv(computeStats(recon), {
    sourceFile: session.fileName,
    generatedBy: `${APP_NAME} ${APP_VERSION}`,
    generatedAt: new Date().toISOString(),
  });
  writeOrStdout(out, csv);
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

function cmdCheck(sessionPath: string, out: string | null): void {
  const session = loadSession(sessionPath);
  const recon = loadRecon(session);
  const issues: ConsistencyIssue[] = checkConsistency(recon);
  const report = {
    file: session.fileName ?? sessionPath,
    warnings: recon.warnings,
    issues,
  };
  writeOrStdout(out, JSON.stringify(report, null, 2) + "\n");
  const total = issues.reduce((n, i) => n + i.count, 0);
  const errors = issues.filter((i) => i.level === "error").reduce((n, i) => n + i.count, 0);
  console.error(
    `${report.file}: ${total} issue(s) across ${issues.length} code(s) ` +
      `(${errors} error-level), ${recon.warnings.length} parser warning(s)`,
  );
  if (errors > 0 || recon.warnings.length > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

/** "system" has no media query headless; the light theme is the fallback. */
function sessionTheme(session: SessionData): Theme {
  return themes[session.themeId === "dark" ? "dark" : "light"];
}

/** Re-run the layout pass exactly as the on-screen viewer does. */
function buildResult(session: SessionData, recon: Reconciliation): LayoutResult {
  return layout(
    recon,
    session.layoutOptions,
    new Set(session.swapped),
    new Set(session.collapsed),
    session.renderOptions.curved,
  );
}

function buildExportDoc(session: SessionData, recon: Reconciliation): ExportDoc {
  return {
    theme: sessionTheme(session),
    legend: null,
    panes: [
      {
        result: buildResult(session, recon),
        options: session.renderOptions,
        geneColors: session.geneColors,
        annotations: session.annotations,
        labelOverrides: session.labelOverrides,
        legend: null,
      },
    ],
  };
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Insert a `<metadata>` provenance block right after the opening `<svg ...>`
 * tag, so the exported figure carries its own reproduction recipe. Done by
 * string surgery here rather than by touching the exporters.
 */
function insertSvgProvenance(svg: string, session: SessionData): string {
  const openStart = svg.indexOf("<svg");
  if (openStart < 0) throw new Error("exported SVG has no <svg> root element");
  const openEnd = svg.indexOf(">", openStart);
  if (openEnd < 0) throw new Error("exported SVG root element is malformed");
  const metadata =
    `\n  <metadata id="${APP_NAME}-provenance">\n` +
    `    <app>${escXml(`${APP_NAME} ${APP_VERSION}`)}</app>\n` +
    `    <sourceFile>${escXml(session.fileName ?? "")}</sourceFile>\n` +
    `    <generatedAt>${new Date().toISOString()}</generatedAt>\n` +
    `    <layoutOptions>${escXml(JSON.stringify(session.layoutOptions))}</layoutOptions>\n` +
    `  </metadata>`;
  if (svg[openEnd - 1] === "/") {
    // Self-closing root (the export always has children, so this is a guard).
    return svg.slice(0, openEnd - 1) + ">" + metadata + "</svg>" + svg.slice(openEnd + 1);
  }
  return svg.slice(0, openEnd + 1) + metadata + svg.slice(openEnd + 1);
}

function installDom(): void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;
  global.SVGSVGElement = dom.window.SVGSVGElement;
}

/** Title for the interactive HTML page: the document's base name. */
function docTitle(session: SessionData, sessionPath: string): string {
  return (session.fileName ?? sessionPath).replace(/\.[^.]+$/, "") || "reconciliation";
}

async function exportSvg(session: SessionData, recon: Reconciliation): Promise<string> {
  installDom();
  // Dynamic import on purpose: static imports hoist, which would load the
  // exporters (and their DOM usage) before the jsdom globals exist.
  const exporters = await import("../src/export/exporters");
  const { svg } = exporters.buildDocSvg(buildExportDoc(session, recon));
  return insertSvgProvenance(svg, session);
}

async function exportHtml(
  session: SessionData,
  recon: Reconciliation,
  sessionPath: string,
): Promise<string> {
  installDom();
  const exporters = await import("../src/export/exporters");
  return exporters.sceneToInteractiveHtml(
    buildExportDoc(session, recon),
    docTitle(session, sessionPath),
  );
}

function cmdExport(sessionPath: string, out: string | null): Promise<void> {
  if (out === null) {
    throw new UsageError("export: missing required option --out <file>");
  }
  const session = loadSession(sessionPath);
  const recon = loadRecon(session);
  const lower = out.toLowerCase();
  if (lower.endsWith(".svg")) {
    return exportSvg(session, recon).then((svg) => writeOrStdout(out, svg));
  }
  if (lower.endsWith(".html")) {
    return exportHtml(session, recon, sessionPath).then((html) => writeOrStdout(out, html));
  }
  if (lower.endsWith(".recphyloxml")) {
    writeOrStdout(out, reconToRecPhyloXml(recon));
    return Promise.resolve();
  }
  if (lower.endsWith(".nhx")) {
    writeOrStdout(out, reconToNhx(recon));
    return Promise.resolve();
  }
  return Promise.reject(
    new UsageError(
      `export: unsupported output file "${out}" - use .svg, .html, .recphyloxml or .nhx`,
    ),
  );
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.command === null) {
    throw new UsageError("missing command (run with --help for usage)");
  }
  const needSession = (where: string): string => {
    if (args.session === null) {
      throw new UsageError(`${where}: missing required option --session <file>`);
    }
    return args.session;
  };
  switch (args.command) {
    case "stats":
      cmdStats(needSession("stats"), args.out);
      return;
    case "check":
      cmdCheck(needSession("check"), args.out);
      return;
    case "export":
      await cmdExport(needSession("export"), args.out);
      return;
    default:
      throw new UsageError(`unknown command: ${args.command} (run with --help for usage)`);
  }
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`${APP_NAME} cli: ${message}`);
  process.exitCode = e instanceof UsageError ? 2 : 1;
});
