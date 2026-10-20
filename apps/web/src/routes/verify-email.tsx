import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AuthShell } from '@/components/layout/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { textLinkVariants } from '@/components/ui/text-link';
import {
  confirmEmailFailure,
  ResendVerificationButton,
  useConfirmEmail,
  useSession,
} from '@/features/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useNoindex } from '@/hooks/use-noindex';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

/**
 * The address-verification landing screen (ADR-0074 M2-T3).
 *
 * **The emailed link opens this page and verifies nothing; pressing Confirm does** (TECH_DEBT #88).
 * The link is `{web}/verify-email#token=…`. Better Auth's own `GET /verify-email` verifies on
 * arrival (`email-verification.mjs:126-127`), so a mail scanner that fetched the old link verified
 * the address on the recipient's behalf; a fetch of this page's URL requests the shell and nothing
 * else, because a fragment is never sent to a server. The press `POST`s the token to
 * `/api/v1/email-verification/confirm`.
 *
 * **The token is captured once into state and stripped from the address bar**, as `/reset-password`
 * does, so it does not persist in history. The page never decodes it: expiry, validity and "already
 * verified" are known only from the press's answer — decoding here would duplicate Better Auth's
 * rules and read a credential this screen should not reason about.
 *
 * **Registered unconditionally.** Three unflagged surfaces send people here (sign-up with no
 * session, the sign-in `EMAIL_NOT_VERIFIED` state, and the invitation-accept refusal), and every
 * one of them is a runtime branch on what the server did — so a conditionally-registered route
 * would be a link to nothing exactly when an operator turns enforcement on.
 *
 * The arrivals it serves:
 *
 * - **`#token=…`** — the emailed link. Offer Confirm; on success say so (an already-verified address
 *   takes the library's success branch, `email-verification.mjs:287-288`, so "confirmed" is true
 *   either way and there is no separate "already used" state); on expiry or a bad token, offer a
 *   fresh link.
 * - **`?verified=1`** — kept for bookmarks: nothing redirects here with it any more, since the
 *   emailed link no longer goes through Better Auth's handler. Say it worked and offer the way in.
 * - **`?error=…`** — an old-shape link that carried no usable token. Cause-agnostic copy, matching
 *   `/reset-password`'s: every reason is fixed by asking for a fresh link.
 * - **none of these** — the account exists and is waiting (this is also where a reload lands after the
 *   token was stripped). With `?email=` we can offer the resend
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

/**
 * The `token` in the URL fragment (`#token=…`), or `''`. A fragment, not a query, so the token never
 * reaches a server log or a `Referer` (the share link's precedent). Read from `window.location`
 * rather than the router because the router's `useSearch` does not carry it.
 */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

const FAILED_COPY =
  'Verification links expire, and a copied one is easy to truncate. Send yourself a fresh one — it replaces any earlier link.';
const EXPIRED_COPY =
  'Confirmation links work for an hour. Send yourself a new one — it replaces any earlier link.';

/** The way on from a link that cannot be used: a fresh one, or the sign-in page if it already worked. */
function FreshLinkActions({ email }: { email?: string | undefined }): React.ReactElement {
  return (
    <>
      <ResendVerificationButton email={email} />
      <p className="text-muted-foreground text-sm">
        Already confirmed?{' '}
        <Link to="/sign-in" className={textLinkVariants()}>
          Sign in
        </Link>
      </p>
    </>
  );
}

/**
 * The emailed link's arrival: a button, and nothing else happens until it is pressed.
 *
 * Split from {@link VerifyEmailScreen} so the session read (`useSession`) happens only on this
 * arrival — the other states are reachable by someone with no session and have never needed one.
 */
function ConfirmEmailScreen({ token }: { token: string }): React.ReactElement {
  const confirm = useConfirmEmail();
  const session = useSession();
  const outcomeRef = useOutcomeFocus<HTMLDivElement>(confirm.isSuccess);
  // One ref for whichever error alert is showing: they are never rendered together, and in every
  // case the control the reader pressed is either gone or has just finished, so the alert is where
  // the new information is.
  const errorRef = useOutcomeFocus<HTMLDivElement>(confirm.isError);
  const failure = confirm.isError ? confirmEmailFailure(confirm.error) : null;
  const signedInAs = session.data?.user.email;

  if (confirm.isSuccess) {
    return (
      <AuthShell title="Email address confirmed">
        <div className="flex flex-col gap-4">
          <Alert purpose="event" tone="success" tabIndex={-1} ref={outcomeRef}>
            Your email address is confirmed. You can sign in now.
          </Alert>
          {signedInAs === undefined ? (
            <Link to="/sign-in" className={buttonVariants()}>
              Sign in
            </Link>
          ) : (
            <Link to="/" className={buttonVariants()}>
              Continue
            </Link>
          )}
        </div>
      </AuthShell>
    );
  }

  if (failure === 'expired' || failure === 'invalid') {
    return (
      <AuthShell title={failure === 'expired' ? 'That link has expired' : 'That link did not work'}>
        <Alert purpose="event" tone="error" tabIndex={-1} ref={errorRef}>
          {failure === 'expired' ? EXPIRED_COPY : FAILED_COPY}
        </Alert>
        <FreshLinkActions />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirm your email address"
      description="Press the button to finish setting up your SchedulePoint account."
    >
      {signedInAs === undefined ? null : (
        <p className="text-muted-foreground text-sm">
          You&apos;re signed in as {signedInAs}. Confirming this link won&apos;t change who is
          signed in.
        </p>
      )}
      {failure === null ? null : (
        <Alert purpose="event" tone="error" tabIndex={-1} ref={errorRef}>
          {failure === 'rate-limited'
            ? 'Too many attempts. Wait a minute, then try again.'
            : "We couldn't confirm your address just now. Try again in a moment."}
        </Alert>
      )}
      <Button
        type="button"
        className="aria-disabled:pointer-events-none"
        aria-disabled={confirm.isPending}
        aria-busy={confirm.isPending}
        onClick={() => {
          if (!confirm.isPending) confirm.mutate(token);
        }}
      >
        {confirm.isPending ? 'Confirming…' : 'Confirm my email address'}
      </Button>
    </AuthShell>
  );
}

export function VerifyEmailScreen(): React.ReactElement {
  useNoindex();
  useDocumentTitle('Verify your email');
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const email = 'email' in search && typeof search.email === 'string' ? search.email : undefined;
  const verified = 'verified' in search && search.verified === '1';
  const failed = 'error' in search && typeof search.error === 'string';

  // Captured on the first render, before the effect below removes it from the URL (see
  // `/reset-password`, whose reasoning this repeats): an effect would run after a render in which the
  // fragment is already gone.
  const [token, setToken] = useState(tokenFromHash);

  // A link pasted into the tab already showing this page changes only the fragment, which the
  // browser treats as same-document: nothing remounts, so the initial read above never sees it.
  useEffect(() => {
    function onHashChange(): void {
      const next = tokenFromHash();
      if (next !== '') setToken(next);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (token === '') return;
    void navigate({ to: '/verify-email', search: {}, replace: true });
  }, [token, navigate]);

  // Keyed so a second link replaces the first outright, including a failure it left behind.
  if (token !== '') return <ConfirmEmailScreen key={token} token={token} />;

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
      description={failed ? FAILED_COPY : pendingDescription(email)}
    >
      <FreshLinkActions email={email} />
    </AuthShell>
  );
}
