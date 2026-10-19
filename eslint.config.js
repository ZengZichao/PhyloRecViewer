import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Everything in .gitignore that can contain generated JavaScript, plus the
  // non-source directories the repo carries for docs/builds.
  { ignores: ["dist", "dist-ssr", "node_modules", "src-tauri", "coverage", "_build"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Type-aware safety: catch unhandled promises and async handlers passed
      // where a void callback is expected (the class of bug behind the earlier
      // "silent save failure" and unhandled-rejection findings).
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    // Test files are excluded from tsconfig, so skip type-aware linting there.
    files: ["**/*.test.{ts,tsx}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
