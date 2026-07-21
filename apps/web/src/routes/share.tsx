import { useEffect, useState } from 'react';

import { GuestPlanView, GuestUnavailable } from '@/features/share';

/**
 * The PUBLIC External-Guest read-only plan view route (`/share`, ADR-0051 F-M4 Task 2).
 *
 * It is a sibling of the authenticated shell — deliberately NOT under `_authed`: there is **no**
 * `beforeLoad` session guard, no session query, and no app-shell chrome (top bar / navigator). The
 * bearer token rides in the URL **fragment** (`/share#sp_share_…`), which is never sent to any server
 * (not in the request line, not in `Referer`), so it never lands in access logs (ADR-0051 §2). We read
 * it from `window.location.hash` and hand it to {@link GuestPlanView}, which calls the F-M3 endpoints
 * with a Bearer header and no cookies. No token ⇒ the uniform "no longer available" message (no oracle).
 *
 * The view is served `noindex` (a `<meta name="robots">` set on mount, matching the ADR §2 requirement
 * that the guest surface is never crawled) in addition to the server's `X-Robots-Tag` header.
 */
export function ShareGuestScreen(): React.ReactElement {
  // Read the token from the fragment ONCE on mount (the fragment never triggers navigation). Never log it.
  const [token] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '').trim(),
  );

  // Belt-and-braces `noindex` on the client (the server also sends `X-Robots-Tag`); removed on unmount so
  // it never leaks onto the authenticated app if the user navigates away within the SPA.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  if (token === '') return <GuestUnavailable />;
  return <GuestPlanView token={token} />;
}
