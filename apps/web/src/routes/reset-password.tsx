import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AuthShell } from '@/components/layout/auth-shell';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { ResetPasswordForm, useResetPassword } from '@/features/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useNoindex } from '@/hooks/use-noindex';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

/**
 * The `token` in the URL fragment (`#token=…`), or `''`. A fragment, not a query, so the token is never
 * sent to a server and never rides in a `Referer` (TECH_DEBT #537; `/verify-email` is the precedent).
 * Read from `window.location` rather than the router because the router's `useSearch` does not carry it.
 */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

/**
 * Better Auth's codes for a token the server will not accept (`password.mjs:150`, and the two
 * checks after it in the same handler): spent or expired, or its user gone. Both mean "ask for a
 * new link".
 */
const UNUSABLE_LINK_CODES: ReadonlySet<string> = new Set(['INVALID_TOKEN', 'USER_NOT_FOUND']);

/**
 * Set a new password from an emailed link (`/reset-password`, ADR-0074 M4) — behind
 * `VITE_PASSWORD_RESET`.
 *
 * **The emailed link is `/reset-password#token=…`, and the token is captured once into component
 * state and stripped from the URL immediately.** A fragment is never sent to any server, so no
 * proxy or API log holds it (TECH_DEBT #537). Left in the address bar it would still sit in browser
 * history and ride along in the referrer of a later navigation; `replace: true` also keeps Back from
 * restoring it. Links emailed before that change point at Better Auth's `GET /reset-password/:token`,
 * which the API answers with a redirect to this same fragment form, so there is one shape here.
 *
 * **Whether the token is still good is learned on submit, not on arrival.** The page no longer asks
 * the server about a token it has not been asked to use, so a spent or expired link shows the form
 * and is reported when the password is sent — as the same "no longer valid" screen, never as a
 * generic error under a form that cannot work.
 *
 * **A hand-edited URL, a truncated paste, a mail client that mangles the link** — none of those may
 * crash the screen. No token (and `?error=INVALID_TOKEN`, which the API's redirect for an unusable
 * legacy link produces) is the same state as a refused one, and both offer the way out rather than
 * a form that cannot work.
 */
export function ResetPasswordScreen(): React.ReactElement {
  useNoindex();
  useDocumentTitle('Choose a new password');
  const navigate = useNavigate();
  // Owned here, not in the form (ADR-0077 M2-T3): this screen used to keep the heading "Choose a
  // new password" over a body that already said the password had been changed.
  const reset = useResetPassword();
  const linkRejected = reset.isError && UNUSABLE_LINK_CODES.has(reset.error.code ?? '');
  const outcomeRef = useOutcomeFocus<HTMLDivElement>(reset.isSuccess);
  const rejectedRef = useOutcomeFocus<HTMLDivElement>(linkRejected);

  // Captured on the first render, before the effect below removes it from the URL. A `useState`
  // initialiser rather than an effect: an effect would run after a render in which the token is
  // already gone from the URL, and there would be nothing left to capture.
  const [token, setToken] = useState(tokenFromHash);
  const { reset: clearAttempt } = reset;

  // A link pasted into the tab already showing this page changes only the fragment, which the
  // browser treats as same-document: nothing remounts, so the initial read above never sees it.
  useEffect(() => {
    function onHashChange(): void {
      const next = tokenFromHash();
      if (next === '') return;
      setToken(next);
      // The new link starts clean: a rejection of the old one must not outlive it.
      clearAttempt();
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [clearAttempt]);

  useEffect(() => {
    if (token === '') return;
    void navigate({ to: '/reset-password', search: {}, replace: true });
  }, [token, navigate]);

  if (token === '' || linkRejected) {
    // One state for "the link was spent or expired" and for "there is no token here at all". The
    // difference is not actionable — both are fixed by asking for a fresh link — and a screen that
    // distinguished them would be reporting on a token it should not be reasoning about.
    return (
      <AuthShell
        title="That link is no longer valid"
        description="Reset links work once and expire after an hour. Ask for a new one and it will replace any earlier link."
      >
        <div className="flex flex-col gap-4">
          {linkRejected ? (
            // Arriving here from the form unmounts the submit button the reader just pressed, so
            // focus would fall to `<body>`; the outcome takes it instead (WCAG 2.4.3).
            <Alert purpose="event" tone="error" tabIndex={-1} ref={rejectedRef}>
              That link has already been used or has expired, so your password has not been changed.
            </Alert>
          ) : null}
          <Link to="/forgot-password" className={buttonVariants()}>
            Send a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell title="Password changed">
        {/* **The sentence carries the outcome, not just its consequence** (ADR-0077 M6-T2, UX
            review). The heading says "Password changed" and the body used to say only "Every other
            session has been signed out." — but focus moves *into this region*, and a screen reader
            announces the focused element, not a sibling `<h1>` that happened to change at the same
            moment with no navigation event to trigger it. So the single most important fact on the
            screen was sighted-only, while a secondary detail was what got spoken. Leading with it
            here fixes that without a visually-hidden duplicate of the heading, which would then be
            read twice by anyone who navigates by headings. */}
        <div className="flex flex-col gap-4">
          {/* `success`, unlike its `/forgot-password` sibling: this one reports something the
              server actually did and confirmed, so the tone can commit where the request-a-link
              screen's cannot. The action stays OUTSIDE the alert — an alert reports, a button
              acts, and burying the only way forward inside a coloured block makes it read as part
              of the message rather than the next step (ADR-0077 §9). */}
          <Alert purpose="event" tone="success" tabIndex={-1} ref={outcomeRef}>
            Your password has been changed, and every other session has been signed out.
          </Alert>
          <Link to="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" description="Then sign in with it.">
      <ResetPasswordForm token={token} reset={reset} />
    </AuthShell>
  );
}
