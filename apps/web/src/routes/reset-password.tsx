import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AuthShell } from '@/components/layout/auth-shell';
import { buttonVariants } from '@/components/ui/button';
import { ResetPasswordForm, useResetPassword } from '@/features/auth';
import { useNoindex } from '@/hooks/use-noindex';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

/**
 * Set a new password from an emailed link (`/reset-password`, ADR-0074 M4) — behind
 * `VITE_PASSWORD_RESET`.
 *
 * **The token is captured once into component state and stripped from the URL immediately.** The
 * emailed link lands on Better Auth's `GET /reset-password/:token`, which checks the token and
 * redirects here with `?token=…` (valid) or `?error=INVALID_TOKEN` (spent or expired). Left in the
 * address bar, that live token would sit in browser history and ride along in the referrer of any
 * later navigation. `replace: true` also keeps Back from restoring it.
 *
 * **`validateSearch` is permissive** (see the route definition): a hand-edited URL, a truncated
 * paste, a mail client that mangles the query — none of those may crash the screen. Neither param
 * present is the same state as an explicit error, and both offer the way out rather than a form
 * that cannot work.
 */
export function ResetPasswordScreen(): React.ReactElement {
  useNoindex();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  // Owned here, not in the form (ADR-0077 M2-T3): this screen used to keep the heading "Choose a
  // new password" over a body that already said the password had been changed.
  const reset = useResetPassword();
  const outcomeRef = useOutcomeFocus<HTMLDivElement>(reset.isSuccess);

  // Captured on the first render, before the effect below removes it from the URL. A `useState`
  // initialiser rather than an effect: an effect would run after a render in which the token is
  // already gone from `search`, and there would be nothing left to capture.
  const [token] = useState(() =>
    'token' in search && typeof search.token === 'string' ? search.token : '',
  );

  useEffect(() => {
    if (token === '') return;
    void navigate({ to: '/reset-password', search: {}, replace: true });
  }, [token, navigate]);

  if (token === '') {
    // One state for "the link was spent or expired" and for "there is no token here at all". The
    // difference is not actionable — both are fixed by asking for a fresh link — and a screen that
    // distinguished them would be reporting on a token it should not be reasoning about.
    return (
      <AuthShell
        title="That link is no longer valid"
        description="Reset links work once and expire after an hour. Ask for a new one and it will replace any earlier link."
      >
        <Link to="/forgot-password" className={buttonVariants()}>
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell title="Password changed">
        {/* The revocation claim is the reader's confirmation that the lockout is over, so it is
            carried by the live region rather than by the heading alone. */}
        <div role="status" tabIndex={-1} ref={outcomeRef} className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">Every other session has been signed out.</p>
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
