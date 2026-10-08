/**
 * A laptop beside a tablet held sideways — the two shapes the layout is designed for.
 *
 * Drawn in `currentColor` and token classes rather than a file: nothing to load (the CSP allows
 * `img-src 'self' blob:` and this needs no request at all), it follows the surface it sits on, and
 * under forced colours it becomes system-colour strokes without a second asset. `aria-hidden`
 * because the heading and the tips say the same thing in words.
 */
export function DevicesPictogram({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 56"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The laptop: lid, then the base that overhangs it. */}
      <rect x="6" y="6" width="58" height="36" rx="3" />
      <path d="M2 48h66" />
      {/* The tablet, sideways, with a home bar so it reads as a device and not a card. */}
      <rect x="76" y="16" width="42" height="30" rx="4" />
      <path d="M92 41h10" />
    </svg>
  );
}
