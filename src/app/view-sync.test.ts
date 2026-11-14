import { describe, expect, it } from "vitest";
import { nextStamp, sameView, shouldPublish, type ViewBox } from "./view-sync";

const A: ViewBox = { k: 0.63, x: 236.738, y: 15.36 };
const B: ViewBox = { k: 0.63, x: 236.738, y: 15.36 };

describe("sameView", () => {
  it("treats sub-pixel differences as the same viewport", () => {
    expect(sameView(A, B)).toBe(true);
    expect(sameView(A, { ...B, x: B.x + 1e-9 })).toBe(true);
    expect(sameView(A, { ...B, k: B.k * 1.000001 })).toBe(true);
  });

  it("separates real moves", () => {
    expect(sameView(A, { ...B, x: B.x + 1 })).toBe(false);
    expect(sameView(A, { ...B, k: 1.5 })).toBe(false);
    expect(sameView(A, { ...B, y: 0 })).toBe(false);
  });
});

describe("shouldPublish", () => {
  it("publishes a view the user produced", () => {
    expect(shouldPublish(A, null)).toBe(true);
    expect(shouldPublish(A, { k: 0.63, x: 100, y: 15.36 })).toBe(true);
  });

  it("never echoes a view that came from the linked pane", () => {
    // The whole point: pane B applied A's transform, so B must stay silent.
    // Broadcasting it again is what rolled the two viewports back and forth.
    expect(shouldPublish(A, { ...A })).toBe(false);
    expect(shouldPublish(A, { ...A, x: A.x + 1e-9 })).toBe(false);
  });
});

/**
 * Minimal two-pane model of the linked-view protocol: a pane publishes the
 * transforms it produced itself (once per local change) and applies only
 * transforms newer than the last one it broadcast. This model is where the
 * simultaneous-refit case lives (orientation change, settings tweak, window
 * resize): both panes fit in the same commit, and the pair must converge on
 * one viewport instead of trading places.
 */
interface Pane {
  view: ViewBox;
  lastSynced: ViewBox | null;
  lastPublished: number;
  /** A local change waiting for its publish effect to run. */
  dirty: boolean;
}

interface Publication extends ViewBox {
  stamp: number;
}

function makePane(view: ViewBox): Pane {
  return { view, lastSynced: null, lastPublished: 0, dirty: false };
}

function movePane(pane: Pane, view: ViewBox): void {
  pane.view = view;
  pane.dirty = true;
}

function publish(pane: Pane): Publication | null {
  if (!pane.dirty) return null;
  pane.dirty = false;
  if (!shouldPublish(pane.view, pane.lastSynced)) return null;
  pane.lastPublished = nextStamp();
  pane.lastSynced = null;
  return { ...pane.view, stamp: pane.lastPublished };
}

function apply(pane: Pane, incoming: Publication): boolean {
  if (incoming.stamp <= pane.lastPublished) return false;
  if (sameView(pane.view, incoming)) return false;
  pane.view = { k: incoming.k, x: incoming.x, y: incoming.y };
  pane.lastSynced = { ...pane.view };
  pane.dirty = true; // the publish effect re-runs, and finds nothing to say
  return true;
}

/** Run both panes to quiescence; returns the number of viewport changes. */
function settle(a: Pane, b: Pane, maxRounds = 50): number {
  let changes = 0;
  for (let i = 0; i < maxRounds; i += 1) {
    const pubA = publish(a); // both publish effects run before either receives
    const pubB = publish(b);
    let moved = false;
    if (pubA && apply(b, pubA)) {
      changes += 1;
      moved = true;
    }
    if (pubB && apply(a, pubB)) {
      changes += 1;
      moved = true;
    }
    if (!moved) return changes;
  }
  return maxRounds;
}

describe("linked views", () => {
  it("follows the moving pane without echoing back", () => {
    const paneA = makePane(A);
    const paneB = makePane(A);
    movePane(paneA, { ...A, k: 0.8, x: 200, y: 0 }); // the user wheels on A
    settle(paneA, paneB);
    expect(sameView(paneA.view, paneB.view)).toBe(true);
    expect(paneB.lastPublished).toBe(0); // B took the value, B did not echo
  });

  it("converges when both panes refit in the same commit", () => {
    const paneA = makePane({ k: 0.63, x: 236.738, y: 15.36 });
    const paneB = makePane({ k: 0.63, x: 236.738, y: 15.5 });
    movePane(paneA, { k: 0.7, x: 210, y: 10 });
    movePane(paneB, { k: 0.72, x: 228, y: 12 });
    settle(paneA, paneB);
    expect(sameView(paneA.view, paneB.view)).toBe(true);
    // One broadcast each, then silence: no trade-places loop.
    expect(paneB.lastPublished - paneA.lastPublished).toBe(1);
  });

  it("keeps a pane that only receives from publishing", () => {
    const paneA = makePane(A);
    const paneB = makePane(A);
    for (const x of [10, 40, 90, 140]) {
      movePane(paneA, { ...A, x });
      const pub = publish(paneA);
      expect(pub).not.toBeNull();
      if (pub) expect(apply(paneB, pub)).toBe(true);
      expect(publish(paneB)).toBeNull();
    }
    expect(paneB.lastPublished).toBe(0);
    expect(sameView(paneA.view, paneB.view)).toBe(true);
  });

  it("does not re-apply a transform the pane already sits on", () => {
    // Re-applying an equal value is harmless only because applying is skipped;
    // treating it as a change is what used to nudge the sender mid-gesture.
    const paneB = makePane(A);
    expect(apply(paneB, { ...A, stamp: nextStamp() })).toBe(false);
  });

  it("stamps publications in increasing order", () => {
    expect(nextStamp()).toBeLessThan(nextStamp());
  });
});
