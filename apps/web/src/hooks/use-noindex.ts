import { useEffect } from 'react';

/**
 * Keep a `<meta name="robots" content="noindex, nofollow">` in the head while this component is
 * mounted, and remove it on unmount.
 *
 * For surfaces a crawler must never index: the public guest view (ADR-0051 §2) and the
 * password-reset screens (ADR-0074 M4). Belt-and-braces beside the server's `X-Robots-Tag` — the
 * server header is the real control; this covers a client-side navigation the server never sees.
 *
 * **Removed on unmount, and that is the part worth keeping.** These are all SPA routes, so without
 * the cleanup a reader who follows a reset link and then navigates into the app carries `noindex`
 * onto every authenticated screen for the rest of the session.
 *
 * Extracted from `routes/share.tsx` when the second caller arrived rather than copied: two copies
 * of a mount/unmount pair drift on exactly the cleanup, and nothing on screen would ever show it
 * (the ADR-0062 shape).
 */
export function useNoindex(): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}
