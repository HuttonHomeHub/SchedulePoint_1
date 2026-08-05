import { Link, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { buttonVariants } from '@/components/ui/button';
import { ResendVerificationButton } from '@/features/auth';

/**
 * The address-verification landing screen (ADR-0074 M2-T3).
 *
 * **It is a landing screen, not a token-consuming one.** The emailed link points at Better Auth's
 * own `GET /verify-email` handler, which verifies the token server-side and then redirects here
 * with `?verified=1`. Nothing on this screen holds or spends a token — which is what lets it be
 * safe to reload, bookmark and share.
 *
 * **Registered unconditionally.** Three unflagged surfaces send people here (sign-up with no
 * session, the sign-in `EMAIL_NOT_VERIFIED` state, and the invitation-accept refusal), and every
 * one of them is a runtime branch on what the server did — so a conditionally-registered route
 * would be a link to nothing exactly when an operator turns enforcement on.
 *
 * The arrivals it serves:
 *
 * - **`?verified=1`** — it worked. Say so and offer the way in.
 * - **`?error=…`** — Better Auth redirects here with a reason when the token is invalid or spent.
 *   A mail scanner following links can burn the token before the human clicks it (TECH_DEBT #88),
 *   so this is framed as "that link has been used — here is a fresh one", never as a failure.
 * - **neither** — the account exists and is waiting. With `?email=` we can offer the resend
 *   directly; without one we have to ask, because a signed-out arrival has no session to read.
 */
export function VerifyEmailScreen(): React.ReactElement {
  const search = useSearch({ strict: false });
  const email = 'email' in search && typeof search.email === 'string' ? search.email : undefined;
  const verified = 'verified' in search && search.verified === '1';
  const failed = 'error' in search && typeof search.error === 'string';

  if (verified) {
    return (
      <AuthShell
        title="Email verified"
        description="Your address is confirmed. You can sign in now."
      >
        <Link to="/sign-in" className={buttonVariants()}>
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={failed ? 'That link has been used' : 'Verify your email'}
      description={
        failed
          ? 'Verification links can only be used once, and they expire. Send yourself a fresh one.'
          : 'We sent you a link to confirm your address. Open it to finish setting up your account.'
      }
    >
      <ResendVerificationButton email={email} />
      <p className="text-muted-foreground text-sm">
        Already confirmed?{' '}
        <Link to="/sign-in" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
