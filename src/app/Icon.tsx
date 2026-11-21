/**
 * The application's only icon set. Every glyph in the chrome is drawn here on
 * one 24-unit grid with a constant stroke, so buttons, menus and panel headers
 * read as one family. Text symbols (the old ⤢ ↶ ✎ ◧ ▾ ✓ ✕ ⇔ ⇕ ◎ ◉ › ‹ and
 * the theme emoji) came from different fonts at different optical weights and
 * are gone: an interface that mixes an emoji sun with a stroked chevron has no
 * single visual voice.
 */
export type IconName =
  | "minus"
  | "plus"
  | "fit"
  | "undo"
  | "redo"
  | "pencil"
  | "panel"
  | "chevron"
  | "chevronLeft"
  | "chevronDown"
  | "search"
  | "close"
  | "pin"
  | "check"
  | "sun"
  | "moon"
  | "monitor"
  | "splitColumns"
  | "splitRows"
  | "eye"
  | "eyeOff"
  | "dotsH"
  | "dotsV"
  | "arrowRight"
  | "flag";

const PATHS: Record<IconName, JSX.Element> = {
  minus: <path d="M5 12h14" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  fit: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5A1.5 1.5 0 0 1 18.5 20H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4-4" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  pin: (
    <>
      <path d="M12 16v6" />
      <path d="M5 16h14l-4.5-7V3H6.5v6z" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  splitColumns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M12 4v16" />
    </>
  ),
  splitRows: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 12h18" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3 3.8" />
      <path d="M6.6 6.7A16.9 16.9 0 0 0 2.5 12S6 18 12 18a9.7 9.7 0 0 0 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  dotsH: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  dotsV: (
    <>
      <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 3.5L16 11H5" />
    </>
  ),
};

export function Icon({
  name,
  size = 14,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Two icons occupying the same box, cross-faded with a slight scale and blur.
 * A state toggle (show/hide the diff highlights, expand/collapse a split)
 * changes meaning without hard-swapping one glyph for another: the outgoing
 * shape fades while the incoming one settles, so the control keeps its
 * identity across the change. Both layers use transitions, so a second click
 * mid-swap turns the cross-fade around instead of restarting it.
 */
export function IconSwap({
  from,
  to,
  swapped,
  size = 14,
}: {
  from: IconName;
  to: IconName;
  swapped: boolean;
  size?: number;
}) {
  return (
    <span
      className="icon-swap"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={`icon-swap-layer${swapped ? "" : " on"}`}>
        <Icon name={from} size={size} />
      </span>
      <span className={`icon-swap-layer${swapped ? " on" : ""}`}>
        <Icon name={to} size={size} />
      </span>
    </span>
  );
}