/**
 * URL of the offline-cache service worker, resolved against the app's own base.
 *
 * The build uses a relative base (`vite.config.ts`) so the same bundle works
 * inside the Tauri shell, and the web build is served from a project-page
 * sub-path (`/PhyloRecViewer/`). A hardcoded `/sw.js` resolves against the
 * domain root there and 404s — which the registration's `.catch` swallowed, so
 * the offline cache silently never installed. Resolve it from the app base
 * (Vite's `BASE_URL` in production) instead, which is correct at both a root
 * and a sub-path deploy.
 *
 * `base` is a parameter only so the resolution can be pinned in tests; the
 * default is what the bundle actually uses.
 */
export function swRegisterUrl(base: string = import.meta.env.BASE_URL): string {
  return base.endsWith("/") ? `${base}sw.js` : `${base}/sw.js`;
}
