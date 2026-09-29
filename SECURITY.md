# Security Policy

**English** | [中文](./SECURITY.zh-CN.md)

## What PhyloRecViewer is, and what that implies

PhyloRecViewer is an **offline** desktop viewer (Tauri v2) and web build for
gene–species reconciliation files (recPhyloXML, NHX / Newick). It has no server,
no accounts, no telemetry, and makes no network requests at runtime; the Content
Security Policy in `src-tauri/tauri.conf.json` restricts `connect-src` to the
local IPC endpoint. The security surface is therefore concentrated in three
places:

1. **Parsing untrusted input.** A malformed or hostile `.recphyloxml` / `.xml` /
   `.nhx` / `.nwk` / `.newick` file, or a hostile `.rpvsession.json` session file,
   is attacker-controlled data that reaches the parsers, the layout pipeline and
   `localStorage`.
2. **Exporting.** Exported interactive HTML and SVG documents are opened elsewhere
   (browser, image viewer, editorial software), so file names, gene / species
   labels and annotations from an input document must not become executable
   content in an output document.
3. **The native bridge.** The webview is deliberately granted **no** `fs:*`
   capability; file reads and writes go through the app's own Rust commands in
   `src-tauri/src/lib.rs`, where path validation lives. Anything that weakens the
   boundary between "path the user chose in a native dialog" and "path supplied
   by web content" is a security bug.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (current) | ✅ |

The project is maintained by a single maintainer rather than by a company, so
fixes are published as ordinary releases. There is no back-port guarantee once
a version is superseded.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

1. Prefer GitHub's **private vulnerability reporting**:
   [Report a vulnerability](https://github.com/ZengZichao/PhyloRecViewer/security/advisories/new).
   This requires the repository owner to have enabled
   **Settings → Security → Code security and analysis → Private vulnerability reporting**.
2. If that form is unavailable, open a normal issue whose **title is only**
   `security report` (no details), then stop; a maintainer will reply and move the
   conversation to a private channel.
3. Include: the app version and platform, whether you used the desktop bundle or
   the web build, and — most useful of all — the input file (or a reduced version
   of it) that triggers the problem.

### What we can and cannot promise

* First response: as soon as possible, typically within 14 days. This is an
  academic project without a contractual SLA.
* We will not ask you to disclose publicly before a fix or mitigation exists, and
  we will credit reporters who want credit.
* A fix may land as a patch release; we may also publish a GitHub security
  advisory so that dependabot and users are notified.

## Scope

**In scope**

* Remote or local code execution through a crafted reconciliation, session or
  autosave file.
* Script injection through an exported HTML / SVG / PDF / NHX document.
* Reading or writing files the user never chose (native dialog / IPC path
  handling, drag & drop, OS file association).
* Credential or key leakage from a release artifact, including the CI and release
  workflows.

**Out of scope**

* Denial of service by loading an extremely large but well-formed file: PhyloRecViewer
  is a desktop viewer for the user's own data, and "the machine slows down while
  you feed it a huge tree" is a performance report, not a vulnerability. (A
  *crash that loses an unsaved session* is still worth reporting.)
* Attacks that require physical access to the machine, or that read the user's
  `localStorage` / session files from an already-compromised browser profile.
* Vulnerabilities in upstream libraries (`fast-xml-parser`, `jspdf`,
  `svg2pdf.js`, Tauri, …) — report them upstream and in a normal issue so this
  project can pin a fixed version; Tauri itself has its own
  [security policy](https://www.tauri.app).
* Findings produced by automated scanners without a concrete reproducible case.

## Hardening already in place (for reference)

* No `fs:*` capability granted to the webview; dialogs are handled on the Rust side.
* A strict CSP, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`.
* No production source maps in the packaged bundle.
* Atomic save (write to a temporary file, then rename) so an interrupted export
  cannot leave a half-written file in place.
* Session / autosave input is clamped and sanitised before options reach the
  layout and render engines (`sanitizeLayoutOptions`, `sanitizeRenderOptions`).
