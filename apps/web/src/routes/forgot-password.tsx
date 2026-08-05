import { Link, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { RequestPasswordResetForm, useSession } from '@/features/auth';
import { useNoindex } from '@/hooks/use-noindex';

/**
 * Ask for a password-reset link (`/forgot-password`, ADR-0074 M4) — behind `VITE_PASSWORD_RESET`.
 *
 * `noindex`, like its sibling: neither reset screen should ever be crawled, and this one is the
 * entry point somebody could otherwise find in a search result rather than in their own inbox.
 *
 * A signed-in reader is pointed at `/account` instead of being offered the emailed round trip —
 * they already have a session, so changing the password in place is both quicker and the only
 * route that verifies the current one.
 */
export function ForgotPasswordScreen(): React.ReactElement {
  useNoindex();
  const search = useSearch({ strict: false });
  const email = 'email' in search && typeof search.email === 'string' ? search.email : undefined;
  const session = useSession();

  if (session.data?.user) {
    return (
      <AuthShell
        title="You are already signed in"
        description="You can change your password from your account, without the emailed link."
      >
        <Link
          to="/account"
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Go to your account
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" description="We'll email you a link to set a new one.">
      <RequestPasswordResetForm email={email} />
      <p className="text-muted-foreground text-sm">
        Remembered it?{' '}
        <Link to="/sign-in" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
