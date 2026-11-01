const RECOVERED_FLAG = "rpv.preloadRecovered";

/**
 * Vite emits every lazily-imported dependency (the PDF vector converter, the
 * Tauri API modules) as its own content-hashed chunk, so each rebuild renames
 * it. A tab that was left open across a deploy - or reloaded inside GitHub
 * Pages' short asset cache window - is then running the *previous* build's
 * entry chunk and asks the server for a filename that no longer exists, so the
 * import rejects.
 *
 * Reloading makes the browser fetch `index.html` again and land on one
 * consistent build generation. The guard is session-scoped: a release whose
 * chunks are genuinely broken must not turn the app into a reload loop.
 *
 * This lives in the entry module rather than an inline `<script>` because the
 * desktop build's Content-Security-Policy has no `script-src 'unsafe-inline'`.
 */
export function installPreloadRecovery(
  reload: () => void = () => window.location.reload(),
): () => void {
  const onPreloadError = (event: Event) => {
    // Vite rethrows the original rejection unless the event is canceled, and
    // that lands in the global error handler as a scary recoverable-error
    // panel. We are handling it, so cancel it.
    event.preventDefault();
    console.error("PhyloRecViewer: lazy chunk failed to load", (event as { payload?: unknown }).payload);

    let alreadyRecovered = false;
    try {
      alreadyRecovered = sessionStorage.getItem(RECOVERED_FLAG) === "1";
      if (!alreadyRecovered) sessionStorage.setItem(RECOVERED_FLAG, "1");
    } catch {
      // Private mode / storage disabled: reloading would just repeat the
      // failure, so let the caller's own fallback handle it.
      return;
    }
    if (alreadyRecovered) return;
    // Autosave restores the workspace (annotations, layout, open documents),
    // so a reload costs the user the in-flight interaction, not the session.
    reload();
  };

  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
