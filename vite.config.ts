import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app can be opened offline / packaged by Tauri.
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
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Sets IS_REACT_ACT_ENVIRONMENT so React's act() stops warning on every
    // state update in component tests.
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Keep coverage reports scoped to first-party source; without this the
    // default report also sweeps in unrelated generated .js assets.
    // `npm run coverage` is the entry point (see package.json) — the reporters
    // give a console summary for local runs plus html/lcov for CI artifacts.
    // Everything under coverage/ is a build artifact and stays uncommitted;
    // `json-summary` is what the CI step reads to publish the coverage report.
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
