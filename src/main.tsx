import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { restoreAutosave, startAutosave } from "./state/autosave";
import { friendlyParseError, useStore } from "./state/store";
import { loadPrefs } from "./state/prefs";
import { isTauri } from "./platform/desktop";
import { themes } from "./render/theme";
import "./styles.css";

// Mark the document root when running inside the Tauri desktop shell, and
// record the OS so CSS can reserve space for the native window controls
// (macOS traffic lights on the left, Windows caption buttons on the right).
if (isTauri()) {
  document.documentElement.dataset.tauri = "true";
  const ua = navigator.userAgent.toLowerCase();
  const isMac = ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad");
  document.documentElement.dataset.tauriPlatform = isMac ? "macos" : "other";
}

// Apply the persisted preferences (theme / language) before the first paint, so
// the UI never shows the OS default and then jumps: the DOM attributes are set
// synchronously, ahead of the first frame, not in a useEffect that runs after
// paint. The "default view" is applied here as well, so the initial
// layout/render options match the user's saved defaults; loadXml/loadMany
// re-apply it to every document opened afterwards, while a session/autosave
// restore calls applyViewState to override those defaults with the options the
// session itself carries.
const prefs = loadPrefs();
if (prefs.themeId) useStore.getState().setTheme(prefs.themeId);
if (prefs.locale) useStore.getState().setLocale(prefs.locale);
if (prefs.pngDpi) useStore.getState().setPngDpi(prefs.pngDpi);
if (prefs.showLegend !== undefined) useStore.setState({ showLegend: prefs.showLegend });
if (prefs.minimap !== undefined) useStore.setState({ minimap: prefs.minimap });

// Write the DOM theme attributes before the first paint, so a dark-mode user
// never sees a white flash: the useEffect in App.tsx runs only after paint,
// and these synchronous writes are what make the browser composite the
// right background from the very first frame.
const resolved = useStore.getState().resolvedThemeId;
document.documentElement.dataset.theme = resolved;
document.documentElement.lang = useStore.getState().locale === "zh" ? "zh-CN" : "en";
document.body.style.background = themes[resolved].background;

if (prefs.defaultView?.layoutOptions || prefs.defaultView?.renderOptions) {
  useStore.getState().applyViewState({
    layoutOptions: prefs.defaultView.layoutOptions,
    renderOptions: prefs.defaultView.renderOptions,
  });
}

// Restore the last autosaved document when there is one; otherwise the empty
// state (the new-tab page) lets the user pick a sample or open a file.
// Autosaving keeps running, so an unexpected quit never loses unsaved work.
restoreAutosave();
startAutosave();

// Async failures never reach the ErrorBoundary: React catches only throws from
// rendering and lifecycle methods, while a rejection out of runHeavy, a file
// read or a session restore goes to window.onerror. Left unhandled, the user
// stares at a blank window and the reason stays in the devtools console, so
// both are funneled into the recoverable error panel the app already renders.
const reportAsyncError = (e: unknown): void => {
  console.error("PhyloRecViewer: unhandled error", e);
  if (useStore.getState().error) return; // only the first, most relevant cause is shown
  useStore.setState({ error: friendlyParseError(e) });
};
window.addEventListener("error", (ev) => {
  if (ev.error) reportAsyncError(ev.error);
  else if (ev.message) reportAsyncError(new Error(ev.message));
});
window.addEventListener("unhandledrejection", (ev) => reportAsyncError(ev.reason));

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
