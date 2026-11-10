import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app can be opened offline / packaged by Tauri.
  // It is also correct for the GitHub Pages deployment under the /PhyloRecViewer/
  // sub-path: Vite emits `./assets/...` in index.html (resolved against the page
  // URL) and rewrites chunk specifiers to paths relative to the importing chunk's
  // own URL, so nothing needs to know the mount point. An absolute "/PhyloRecViewer/"
  // base would break the Tauri bundle for the same reason it works here.
  base: "./",
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // Do not watch the Rust build output or the in-workspace Cargo cache
      // created during `tauri build`; otherwise Vite drowns in crate sources.
      ignored: [
        "**/.cargo/**",
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
        "**/dist/**",
      ],
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    // No production source maps: they were shipping inside the .app bundle and
    // let anyone reconstruct the original source. Use "hidden" if you need maps
    // for local crash symbolication without bundling them.
    sourcemap: false,
    // The entry chunk is ~1.01 MB / ~327 kB gzip by design, because jsPDF is
    // statically imported into it (see the note at the top of
    // src/export/exporters.ts). Raising the limit rather than silencing it: the
    // default message tells you to "use dynamic import() to code-split", which is
    // exactly the change that made PDF export fail in issue #11 - a lazily-fetched
    // chunk is renamed by every build, so a cached entry can ask for a hash the
    // server no longer has. The cost of the static import is ~129 kB gzip, and it
    // is what lets the raster fallback write a PDF with no network request at all.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Resolve svg2pdf.js to the same browser ESM entry that Vite bundles, so the
    // tests exercise the path users actually get. Node-style resolution would pick
    // the package `main` (the UMD bundle), which expects a `window.jspdf` global that
    // a bundler-fed app never sets; loadVectorConverter() would then reject on
    // module evaluation rather than on a chunk fetch, and the vector PDF path would
    // go untested. This is test-only: `build` still resolves through `browser`.
    alias: { "svg2pdf.js": "svg2pdf.js/dist/svg2pdf.es.min.js" },
    // Sets IS_REACT_ACT_ENVIRONMENT so React's act() stops warning on every
    // state update in component tests.
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Keep coverage reports scoped to first-party source; without this the
    // default report also sweeps in unrelated generated .js assets.
    // `npm run coverage` is the entry point (see package.json) — the reporters
    // give a console summary for local runs plus html/lcov for CI artifacts.
    // The generated coverage/ directory is git-ignored; the frozen summary the
    // manuscript cites lives under docs/coverage-v0.1.2.json. CI uploads
    // coverage/ as a build artifact.
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: [
        "src/**/*.test.*",
        "src/samples/**",
        "src/vite-env.d.ts",
        "src/types/**",
      ],
    },
  },
});
