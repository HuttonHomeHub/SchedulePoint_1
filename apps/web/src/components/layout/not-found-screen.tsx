import { useEffect, useRef, useState } from 'react';

import { AuthShell } from './auth-shell';

import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { textLinkVariants } from '@/components/ui/text-link';
import { useSession } from '@/features/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * The one "Page not found" — what every address that is not a page renders, signed in or out
 * (`docs/TECH_DEBT.md` #459, `docs/specs/estate-polish-oct/`).
 *
 * **It takes no props, and that is the design.** A prop is a way for two callers to diverge, and
 * divergence is exactly the tell this screen exists to remove: ADR-0086 wants a non-staff member's
 * `/staff` to be indistinguishable from an address that was never a page, and a screen that two
 * callers can word differently is a screen where one of them eventually does. The router's
 * `defaultNotFoundComponent` and the staff console's non-staff branch both render it bare.
 *
 * It stands outside the shell (`notFoundMode: 'root'`, `app/router.tsx`) on {@link AuthShell}, which
 * supplies the single `<main>`; the card header is its own so the `<h1>` can take focus on mount, as
 * `RouteErrorScreen` does — a client-side arrival replaces whatever the reader was on, and focus would
 * otherwise be left on a node that no longer exists.
 *
 * **The link is session-aware, and its text is frozen once it has focus.** Signed out the way on is
 * **Sign in**; signed in — or while the session is still resolving — it is **Go to the home page**
 * (`/`, which sends the reader to their organisation or onboarding). The session can resolve after
 * first paint, so a keyboard user who tabs to the link could otherwise have its name and target
 * change under them. The first focus therefore latches the label and href that were on screen; a
 * pointer user who never focuses it simply sees the label settle. Resolving is treated as signed in
 * so the common case (a signed-in reader, whose `/me` is usually cached) never flickers.
 *
 * It is a plain `<a>`: a full load of `/` or `/sign-in` is the right recovery from an address the
 * router could not place, and it keeps this screen free of router context.
 */
export function NotFoundScreen(): React.ReactElement {
  useDocumentTitle('Page not found');
  // `CardTitle` takes no ref (adding one would widen a shared primitive's contract for one caller),
  // so the focus target is found through the element that wraps it.
  const header = useRef<HTMLDivElement>(null);
  useEffect(() => header.current?.querySelector('h1')?.focus(), []);

  const session = useSession();
  const signedOut = session.isSuccess && session.data === null;
  const live = signedOut
    ? { label: 'Sign in', href: '/sign-in' }
    : { label: 'Go to the home page', href: '/' };
  const [latched, setLatched] = useState<typeof live | null>(null);
  const shown = latched ?? live;

  return (
    <AuthShell>
      <div ref={header}>
        <CardHeader className="text-center">
          <CardTitle tabIndex={-1} className="outline-none">
            Page not found
          </CardTitle>
          <CardDescription>There is nothing at this address.</CardDescription>
        </CardHeader>
      </div>
      <CardContent className="text-center">
        <a
          className={textLinkVariants({ size: 'sm' })}
          href={shown.href}
          onFocus={() => {
            setLatched((current) => current ?? live);
          }}
        >
          {shown.label}
        </a>
      </CardContent>
    </AuthShell>
  );
}
