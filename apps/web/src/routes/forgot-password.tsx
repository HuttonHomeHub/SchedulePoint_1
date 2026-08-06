import { Link, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { textLinkVariants } from '@/components/ui/text-link';
import { RequestPasswordResetForm, useRequestPasswordReset, useSession } from '@/features/auth';
import { useNoindex } from '@/hooks/use-noindex';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

/**
 * Ask for a password-reset link (`/forgot-password`, ADR-0074 M4) — behind `VITE_PASSWORD_RESET`.
 *
 * `noindex`, like its sibling: neither reset screen should ever be crawled, and this one is the
 * entry point somebody could otherwise find in a search result rather than in their own inbox.
 *
 * A signed-in reader is pointed at `/account` instead of being offered the emailed round trip —
 * they already have a session, so changing the password in place is both quicker and the only
 * route that verifies the current one.
 *
 * **The route owns the mutation and every terminal state** (ADR-0077 M2-T3). The heading is part of
 * the state, so a form that swaps its own body leaves the heading describing a task that is over.
 */
export function ForgotPasswordScreen(): React.ReactElement {
  useNoindex();
  const search = useSearch({ strict: false });
  const email = 'email' in search && typeof search.email === 'string' ? search.email : undefined;
  const session = useSession();
  const request = useRequestPasswordReset();
  const outcomeRef = useOutcomeFocus<HTMLParagraphElement>(request.isSuccess);

  // State #11 (spec §2.2). Without this the signed-out form paints first and is replaced a moment
  // later by the signed-in screen — a flash of the wrong screen, and on a slow connection long
  // enough to type into.
  if (session.isPending) {
    return (
      <AuthShell title="Reset your password" busy>
        <div className="flex justify-center py-4">
          <Spinner label="Checking whether you are signed in…" />
        </div>
      </AuthShell>
    );
  }

  if (session.data?.user) {
    return (
      <AuthShell
        title="You are already signed in"
        description="You can change your password from your account, without the emailed link."
      >
        {/* The primary action on a screen is a button, never a text link (ADR-0077 M2-T4). */}
        <Link to="/account" className={buttonVariants()}>
          Go to your account
        </Link>
      </AuthShell>
    );
  }

  if (request.isSuccess) {
    return (
      <AuthShell title="Check your email">
        {/* The sentence is enumeration-safe and is pinned by a string-equality test. It says "if",
            because the endpoint answers identically for a known and an unknown address and a UI
            that distinguished them would hand back the oracle the library closed. It also does not
            claim delivery, which would be false wherever SMTP is unconfigured. */}
        <p role="status" tabIndex={-1} ref={outcomeRef} className="text-muted-foreground text-sm">
          If that address has an account, a reset link is on its way. The link works once and
          expires in an hour.
        </p>
        <p className="text-muted-foreground text-sm">
          Remembered it?{' '}
          <Link to="/sign-in" className={textLinkVariants()}>
            Sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" description="We'll email you a link to set a new one.">
      <RequestPasswordResetForm email={email} request={request} />
      <p className="text-muted-foreground text-sm">
        Remembered it?{' '}
        <Link to="/sign-in" className={textLinkVariants()}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
