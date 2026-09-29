import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TipState {
  text: string;
  rect: DOMRect;
}

/**
 * TooltipProvider — renders an instant monochrome tooltip for any element that
 * carries a `data-tooltip` attribute. It is rendered through a portal attached
 * to <body>, so it can never be clipped by the overflow:auto panels it floats
 * above (toolbar, tab bar, sidebar). The bubble sits above the element, or
 * below it when the element is near the top edge of the window. Both mouse
 * hover and keyboard focus are supported; screen readers keep the elements'
 * aria-labels.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    const hostFor = (t: EventTarget | null): HTMLElement | null => {
      if (!(t instanceof HTMLElement)) return null;
      return t.closest("[data-tooltip]");
    };
    const show = (e: Event) => {
      const host = hostFor(e.target);
      const text = host?.getAttribute("data-tooltip");
      if (!host || !text) {
        setTip(null);
        return;
      }
      setTip({ text, rect: host.getBoundingClientRect() });
    };
    const hide = (e: Event) => {
      // Moving between elements inside the same host keeps the tip visible.
      const from = hostFor(e.target);
      const to = hostFor(
        (e as MouseEvent).relatedTarget ?? (e as FocusEvent).relatedTarget ?? null,
      );
      if (from && from === to) return;
      setTip(null);
    };
    document.addEventListener("mouseover", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusin", show as EventListener);
    document.addEventListener("focusout", hide);
    return () => {
      document.removeEventListener("mouseover", show);
      document.removeEventListener("mouseout", hide);
      document.removeEventListener("focusin", show as EventListener);
      document.removeEventListener("focusout", hide);
    };
  }, []);

  return (
    <>
      {children}
      {tip &&
        createPortal(
          <div
            className="tip-pop"
            role="tooltip"
            data-edge={tip.rect.top < 44 ? "bottom" : "top"}
            style={{
              left: tip.rect.left + tip.rect.width / 2,
              top: tip.rect.top < 44 ? tip.rect.bottom : tip.rect.top,
            }}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </>
  );
}
