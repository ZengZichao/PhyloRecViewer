import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { installPreloadRecovery } from "./preloadRecovery";

/** Fire the event Vite dispatches when a lazily-imported chunk cannot be fetched. */
function dispatchPreloadError(): Event {
  const ev = new Event("vite:preloadError", { cancelable: true });
  Object.defineProperty(ev, "payload", { value: new Error("Failed to fetch dynamically imported module") });
  window.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// The recovery listener is on `window`, not on a node, so it outlives a test
// unless each one that installs it disposes it.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("stale-build chunk recovery", () => {
  it("reloads once so the browser lands on one consistent build", () => {
    const reload = vi.fn();
    const dispose = installPreloadRecovery(reload);
    try {
      const ev = dispatchPreloadError();
      expect(reload).toHaveBeenCalledTimes(1);
      // Vite rethrows unless the event is canceled, and that throw is what the
      // user used to see as 导出失败: Failed to fetch dynamically imported module.
      expect(ev.defaultPrevented).toBe(true);
    } finally {
      dispose();
    }
  });

  it("does not loop when the new build is itself missing the chunk", () => {
    const reload = vi.fn();
    const dispose = installPreloadRecovery(reload);
    try {
      dispatchPreloadError();
      dispatchPreloadError();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
    }
  });

  it("leaves the caller's fallback in charge when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const reload = vi.fn();
    const dispose = installPreloadRecovery(reload);
    try {
      const ev = dispatchPreloadError();
      expect(reload).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(true);
    } finally {
      dispose();
    }
  });

  it("stops listening once disposed, so a remount cannot stack handlers", () => {
    const reload = vi.fn();
    installPreloadRecovery(reload)();
    dispatchPreloadError();
    expect(reload).not.toHaveBeenCalled();
  });
});
