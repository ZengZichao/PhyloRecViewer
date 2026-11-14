/** A pan/zoom transform, enough to compare two viewports numerically. */
export interface ViewBox {
  k: number;
  x: number;
  y: number;
}

/** Sub-pixel tolerance: two transforms this close are the same viewport. */
const EPS = 1e-6;

export function sameView(a: ViewBox, b: ViewBox, eps = EPS): boolean {
  return (
    Math.abs(a.k - b.k) < eps &&
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps
  );
}

/**
 * A linked pane publishes only transforms the user produced on it.
 *
 * Echoing a transform that arrived from the peer is what made "Link views"
 * shake: pane A moves, pane B applies A's frame, B publishes that same frame
 * back, A applies it (rolling its gesture back by one frame) and publishes
 * again, and the two viewports keep stepping on each other. The peer already
 * holds the value it sent, so there is nothing to echo.
 */
export function shouldPublish(view: ViewBox, lastSynced: ViewBox | null): boolean {
  return lastSynced === null || !sameView(view, lastSynced);
}

/**
 * Ordering token for linked-view publications. A pane only accepts a peer
 * transform that is newer than the last transform it broadcast itself, so two
 * panes that refit in the same commit (orientation toggle, window resize,
 * settings change) converge on the later fit instead of trading places, and a
 * stale value can never pull a pane backwards.
 */
let stamp = 0;

export function nextStamp(): number {
  stamp += 1;
  return stamp;
}
