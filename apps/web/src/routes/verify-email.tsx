import { Link, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { buttonVariants } from '@/components/ui/button';
import { textLinkVariants } from '@/components/ui/text-link';
import { ResendVerificationButton } from '@/features/auth';
import { useNoindex } from '@/hooks/use-noindex';

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
 * - **`?error=…`** — Better Auth redirects here when it could not act on the token. **The
 *   reachable reasons are expiry, a malformed token and an unknown user** — *not* "already used":
 *   the token is a stateless JWT, and a second visit to an address that is already verified takes
 *   the library's **success** branch and arrives with `?verified=1`
 *   (`email-verification.mjs:285-286`). An earlier version of this screen said "That link has been
 *   used", which named the one cause that cannot produce this state. The copy is now
 *   cause-agnostic, matching `/reset-password`'s — the distinction is not actionable anyway, since
 *   every reason is fixed by asking for a fresh link.
 *
 *   (The scanner hazard is real but is the *opposite* shape here: a scanner following a
 *   verification link **verifies the address on the recipient's behalf** rather than burning the
 *   link. That is TECH_DEBT #88's own subject; burning is the reset link's problem.)
 * - **neither** — the account exists and is waiting. With `?email=` we can offer the resend
 *   directly; without one we have to ask, because a signed-out arrival has no session to read.
 */
/**
 * The waiting state's copy (ADR-0075 M2). It said **"We sent you a link to confirm your address"**,
 * which is a claim about delivery this application cannot make: a send failure never reaches the
 * request (`runInBackgroundOrAwait` swallows it), so this screen renders identically whether the
 * message went out or the relay refused it. Somebody staring at an empty inbox was being told, flatly,
 * that it had been sent.
 *
 * It now asserts **intent** — what should happen — and names the third step. That last part is the
 * one worth keeping: if the transport is down, **Resend does not help either**, and a screen offering
 * only Resend sends the reader round a loop that cannot terminate. Naming a human is the only exit
 * from a total mail outage, and it costs nothing in the ordinary case where the mail simply landed
 * in spam.
 *
 * Showing the address is not decoration: the commonest cause of a missing message is a typo at
 * sign-up, and it is not otherwise visible anywhere on this screen.
 */
export function pendingDescription(email: string | undefined): string {
  const target = email ?? 'your address';
  return `A link to confirm ${target} should arrive in the next few minutes. Open it to finish setting up your account. If nothing arrives, check your spam folder and send a new link. If that does not work either, the problem is probably at our end rather than yours — try again shortly.`;
}

export function VerifyEmailScreen(): React.ReactElement {
  useNoindex();
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
      title={failed ? 'That link did not work' : 'Verify your email'}
      description={
        failed
          ? 'Verification links expire, and a copied one is easy to truncate. Send yourself a fresh one — it replaces any earlier link.'
          : pendingDescription(email)
      }
    >
      <ResendVerificationButton email={email} />
      <p className="text-muted-foreground text-sm">
        Already confirmed?{' '}
        <Link to="/sign-in" className={textLinkVariants()}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
