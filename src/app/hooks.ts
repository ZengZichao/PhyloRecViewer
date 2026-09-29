import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStore } from "../state/store";
import { focusMatches, focusIdSet } from "../analysis/focus";
import { computeStats } from "../analysis/stats";
import type { GeneNode, Reconciliation } from "../model/types";

// ---------------------------------------------------------------------------
// useCollapsible — shared localStorage-backed open/close state.
// The Sidebar sections and the RightPanel RpCollapsible groups both need it,
// so the persistence logic lives here once instead of in each component.
// ---------------------------------------------------------------------------

export function useCollapsible(storageKey: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      return s === null ? defaultOpen : s === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [storageKey, open]);
  return [open, setOpen] as const;
}

/**
 * usePinned — localStorage-backed "pin open" flag for sidebar sections.
 * A pinned section is forced open and its header click does not collapse it,
 * so users can keep their frequently used controls on screen. The flag is
 * stored under `<storageKey>.pin` and survives restarts.
 */
export function usePinned(storageKey: string) {
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(`${storageKey}.pin`);
      return s === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}.pin`, pinned ? "1" : "0");
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [storageKey, pinned]);
  return [pinned, setPinned] as const;
}

// ---------------------------------------------------------------------------
// useGlobalShortcuts — single keydown listener with unified input-field guard.
// Each component calls this with its own handler; the guard (INPUT / TEXTAREA /
// contentEditable) is applied consistently so no shortcut fires while typing.
// ---------------------------------------------------------------------------

/** True if the event originated inside a text input, textarea, or contenteditable. */
export function isTextInput(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/**
 * True while a modal surface is on screen. Every dialog in the app - help,
 * settings, the tour, the annotation editor, batch rename and the multi-open
 * chooser - is marked `role="dialog"` with `aria-modal`, so the DOM stays the
 * single source of truth and no extra store flag is needed.
 */
export function modalOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][aria-modal="true"], [role="alertdialog"]',
  );
}

/**
 * `allowInModals` opts a handler back in while a dialog is open - used for keys
 * that belong to the dialog itself (Escape), not to the drawing behind it.
 */
export function useGlobalShortcuts(
  handler: (e: KeyboardEvent) => void,
  opts?: { allowInModals?: boolean },
): void {
  const ref = useRef(handler);
  ref.current = handler;
  const allowInModals = opts?.allowInModals === true;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Shortcuts must not fire straight through an open dialog: starting the
      // tour and pressing F would otherwise zoom the canvas behind it, ⌘Z would
      // undo the document under the annotation editor, and so on.
      if (!allowInModals && modalOpen()) return;
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowInModals]);
}

// ---------------------------------------------------------------------------
// useFocusTrap — keyboard focus containment for modal dialogs.
// While `active`, Tab/Shift+Tab cycle inside the container and focus is pulled
// back if it escapes; on close, focus returns to the previously focused
// element. Complements the aria-modal attributes the dialogs already carry.
// ---------------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || document.activeElement === el,
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !container.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !container.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus();
    };
  }, [active, ref]);
}

// ---------------------------------------------------------------------------
// useFocusMatches — shared memoised search/filter match computation.
// App.tsx needs it for canvas dimming and RightPanel.tsx for the match list,
// so this hook centralises the code; each caller keeps its own memo, but the
// logic is shared and the input selectors are identical, guaranteeing
// consistent results.
// ---------------------------------------------------------------------------

/**
 * Re-express a family selection made against one document in the gene-tree
 * indices of another. `familyFilter` holds INDICES, which mean nothing in a
 * document with a different family list. Returns null (= no family
 * constraint) when nothing carries over, so a second-level pane is never
 * blanked by a selection that does not name any of its families.
 */
export function scopeFamilyFilter(
  familyFilter: Set<number> | null,
  from: Reconciliation | null | undefined,
  to: Reconciliation | null,
): Set<number> | null {
  if (!familyFilter || !from || !to) return familyFilter ?? null;
  const wanted = new Set(
    from.geneTrees
      .filter((t) => familyFilter.has(t.index))
      .map((t) => t.name)
      .filter((n): n is string => !!n),
  );
  if (wanted.size === 0) return null;
  const mapped = new Set<number>();
  for (const t of to.geneTrees) if (t.name && wanted.has(t.name)) mapped.add(t.index);
  return mapped.size > 0 ? mapped : null;
}

/** Focus matches for a specific reconciliation (used for nested recon).
 *
 * `familyScope` is the document the family checkboxes were read from (the
 * primary one). `familyFilter` holds gene-tree INDICES of that document, and
 * indices mean nothing in another document whose family list differs, so a
 * selection carried over unchanged would dim the wrong nodes in the nested
 * pane. The selection is therefore re-resolved by family NAME against `recon`;
 * a name that does not occur here constrains nothing rather than blanking the
 * pane.
 */
export function useFocusMatchesFor(
  recon: Reconciliation | null,
  familyScope?: Reconciliation | null,
): {
  matches: GeneNode[] | null;
  idSet: Set<string> | null;
} {
  const query = useStore((s) => s.searchQuery);
  const regex = useStore((s) => s.searchRegex);
  const eventFilter = useStore((s) => s.eventFilter);
  const familyFilter = useStore((s) => s.familyFilter);
  const confidenceMin = useStore((s) => s.confidenceMin);
  const confidenceMax = useStore((s) => s.confidenceMax);

  const families = useMemo(
    () => scopeFamilyFilter(familyFilter, familyScope, recon),
    [familyFilter, familyScope, recon],
  );

  const matches = useMemo(
    () =>
      recon
        ? focusMatches(recon, {
            query,
            regex,
            events: eventFilter,
            families,
            confidence: [confidenceMin, confidenceMax],
          })
        : null,
    [recon, query, regex, eventFilter, families, confidenceMin, confidenceMax],
  );

  const idSet = useMemo(() => focusIdSet(matches), [matches]);

  return { matches, idSet };
}

/** Focus matches for the primary reconciliation (reads recon from store). */
export function useFocusMatches(): {
  matches: GeneNode[] | null;
  idSet: Set<string> | null;
} {
  const recon = useStore((s) => s.recon);
  return useFocusMatchesFor(recon);
}

// ---------------------------------------------------------------------------
// useStats — shared memoised statistics computation.
// StatsTab and NetworkTab read the same numbers, so computeStats runs once
// per document here rather than in each tab.
// ---------------------------------------------------------------------------

export function useStats() {
  const recon = useStore((s) => s.recon);
  return useMemo(() => (recon ? computeStats(recon) : null), [recon]);
}
