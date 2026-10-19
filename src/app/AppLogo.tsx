/**
 * Inline SVG app logo — a simplified version of the app-icon.svg used on the
 * new-tab / empty-state screen. Renders at the requested pixel size and
 * adapts to the current theme via CSS custom properties.
 */
export function AppLogo({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PhyloRecViewer"
    >
      {/* Rounded background */}
      <rect width="1024" height="1024" rx="224" fill="var(--accent)" />
      {/* Species tree: thick, semi-transparent tubes */}
      <g
        fill="none"
        stroke="var(--accent-text)"
        strokeOpacity="0.22"
        strokeWidth="120"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M512 260 L512 400 M512 400 L330 560 L330 760 M512 400 L694 560 L694 760" />
      </g>
      {/* Gene lineage: thin, solid paths */}
      <g
        fill="none"
        stroke="var(--accent-text)"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M512 280 L512 400 L330 560 L330 760" />
        <path d="M512 400 L694 560 L694 760" />
      </g>
      {/* Transfer arc: dashed */}
      <path
        d="M350 480 Q512 590 674 480"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="16"
        strokeDasharray="8 22"
        strokeLinecap="round"
      />
      {/* Speciation node */}
      <circle cx="512" cy="400" r="18" fill="var(--accent-text)" />
      {/* Duplication node */}
      <rect x="321" y="551" width="18" height="18" rx="3" fill="var(--accent-text)" fillOpacity="0.6" />
    </svg>
  );
}
