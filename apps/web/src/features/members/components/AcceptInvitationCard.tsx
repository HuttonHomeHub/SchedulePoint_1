import { Link, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAcceptInvitation, useInvitationPreview } from '../api/use-invitations';
import { ROLE_LABELS } from '../schemas/invite-schemas';

import { InviteExitLinks } from './InviteExitLinks';
import { InviteShell } from './InviteShell';

import { useAnnounce } from '@/components/ui/announcer';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerError } from '@/components/ui/server-error';
import { Spinner } from '@/components/ui/spinner';
import { ResendVerificationButton, useSession, useSignOut } from '@/features/auth';

/**
 * The one-sentence summary of how an invitation resolved, or `null` while it is still resolving.
 *
 * Kept beside the component and derived from the same two queries the render branches on, so the
 * announcement and the screen cannot disagree about which state this is.
 */
function resolvedOutcome(
  preview: ReturnType<typeof useInvitationPreview>,
  session: ReturnType<typeof useSession>,
): string | null {
  if (preview.isPending || session.isPending) return null;
  if (preview.isError || !preview.data) return 'Invitation not found.';
  const invite = preview.data;
  if (invite.status !== 'PENDING') return 'This invitation is no longer valid.';
  const user = session.data?.user;
  if (!user) return `Sign in as ${invite.email} to accept this invitation.`;
  if (invite.requiresEmailVerification && !user.emailVerified) {
    return 'Confirm your email address before joining.';
  }
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return `This invitation is for ${invite.email}, not ${user.email}.`;
  }
  return `You have been invited to join ${invite.organizationName}.`;
}

/** Invitee-facing accept flow: preview the invite, then accept as the right user. */
export function AcceptInvitationCard({ token }: { token: string }): React.ReactElement {
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const session = useSession();
  const accept = useAcceptInvitation();
  const signOut = useSignOut();
  const announce = useAnnounce();

  // The invitation resolves asynchronously into one of five terminal states, and **which one it is
  // IS the page**. `InviteShell` used to carry an `aria-live` on its own `main` for exactly this;
  // the ADR-0074 M2-T1 convergence moved to the shared announcer and did not re-establish the
  // announcement, so the resolution went silent — a regression the convergence's own "no
  // behavioural difference" claim did not cover (M5-T1, UX review).
  //
  // Derived here, once, from the same conditions the branches below read, rather than announced
  // inside each branch: a sixth state added later would otherwise be silent again, which is
  // precisely how this one was lost.
  const outcome = resolvedOutcome(preview, session);
  useEffect(() => {
    if (outcome !== null) announce(outcome);
  }, [outcome, announce]);

  if (preview.isPending || session.isPending) {
    return (
      <InviteShell busy>
        <CardContent className="flex justify-center p-10">
          <Spinner label="Loading invitation…" />
        </CardContent>
      </InviteShell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Invitation not found</CardTitle>
          <CardDescription>
            This invitation link is invalid or has already been used.
          </CardDescription>
        </CardHeader>
        <InviteExitLinks />
      </InviteShell>
    );
  }

  const invite = preview.data;
  const roleLabel = ROLE_LABELS[invite.role];
  // Expiry is enforced server-side (accept returns 410); here we only gate on the
  // stored status so the render stays pure.
  if (invite.status !== 'PENDING') {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>This invitation is no longer valid</CardTitle>
          <CardDescription>
            It may have expired or already been used. Ask for a new one.
          </CardDescription>
        </CardHeader>
        <InviteExitLinks />
      </InviteShell>
    );
  }

  const user = session.data?.user;

  if (!user) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Join {invite.organizationName}</CardTitle>
          <CardDescription>
            You&rsquo;ve been invited as {roleLabel}. Sign in or create an account as{' '}
            <strong>{invite.email}</strong> to accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link
            to="/sign-in"
            search={{ redirect: `/accept-invite?token=${token}` }}
            className={buttonVariants()}
          >
            Sign in
          </Link>
          <Link to="/sign-up" className={buttonVariants({ variant: 'outline' })}>
            Create an account
          </Link>
        </CardContent>
      </InviteShell>
    );
  }

  // The fourth first-class refusal, alongside not-found / not-pending / wrong-account (ADR-0074
  // M2-T6). The card has always held `emailVerified` and never read it, so when the server's
  // matching 403 fires (`invitations.service.ts:218-220`) it lands in the generic error paragraph
  // below with no way forward. Checking it here turns a dead end into an instruction — and the 403
  // remains as the server's authoritative second word if the two ever disagree.
  //
  // **Both halves of the condition are load-bearing, and shipping only the second one was a live
  // defect** (ADR-0074 M5). This first read `!user.emailVerified` alone, under a comment claiming
  // it was "not reachable today, because the server guard is gated on `requireEmailVerification`"
  // — which describes the *server's* condition, not the one written here. With enforcement OFF
  // **every** account is unverified, so the card refused **every invitee**, telling them to confirm
  // an address the server did not care about and hiding the Accept behind it. The base journey
  // caught it; no unit test could, because they all supply a verified fixture user.
  //
  // `requiresEmailVerification` comes from the preview response — the server reporting its own
  // setting — because that is the only runtime evidence available. Inferring it client-side is what
  // ADR-0074 exists to forbid, and this is that rule broken by the ADR that states it.
  if (invite.requiresEmailVerification && !user.emailVerified) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Confirm your email address first</CardTitle>
          <CardDescription>
            Before you can join {invite.organizationName}, open the link we emailed to{' '}
            <strong>{user.email}</strong>. Come back to this page afterwards — the invitation is
            still waiting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResendVerificationButton email={user.email} />
        </CardContent>
      </InviteShell>
    );
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Wrong account</CardTitle>
          {/* "Sign out and come back to this page as {email}" overclaimed (ADR-0077 M6-T2, UX
              review): signing out returns to *this* invitation in its signed-out branch, where the
              reader still has to choose Sign in or Create an account and type that address in
              themselves. Nothing resumes "as" anybody. */}
          <CardDescription>
            You&rsquo;re signed in as {user.email}, but this invitation is for {invite.email}. Sign
            out, then sign in as {invite.email} to accept it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The instruction above used to be the whole screen: "sign out" with nothing to sign out
              with, on a page reached from an email (ADR-0077 M1-T2). Signing out drops every cached
              query except the seeded `null` session, so the invitation preview refetches and this
              card re-renders in its signed-out branch — the reader stays on the invitation rather
              than being sent anywhere.

              It is the **only** action on this screen, so it takes the primary treatment — it
              shipped as `variant="outline"` while every other single-action terminal state in this
              epic used the solid button, which read as "here is the secondary option" with no
              primary anywhere (ADR-0077 M6-T2, UX review). */}
          <Button
            aria-disabled={signOut.isPending}
            aria-busy={signOut.isPending}
            onClick={() => {
              if (signOut.isPending) return;
              signOut.mutate();
            }}
          >
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </CardContent>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <CardHeader>
        <CardTitle>Join {invite.organizationName}</CardTitle>
        <CardDescription>You&rsquo;ve been invited as {roleLabel}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ServerError message={accept.isError ? accept.error.message : null} />
        {/* `aria-disabled`, not `disabled`: a native disabled control blurs to `<body>` the moment
            the request starts and flips back when it settles, so a keyboard user loses their place
            twice per action (WCAG 2.4.3). **The `onClick` guard is what prevents the double
            submit** — this is the same correction made in `SignInForm.tsx`, `ScopeSaveBar`
            (ADR-0060 M6) and the WBS Assign button (ADR-0063 M6); it was simply never applied
            here. */}
        <Button
          aria-disabled={accept.isPending}
          aria-busy={accept.isPending}
          onClick={() => {
            if (accept.isPending) return;
            accept.mutate(token, {
              onSuccess: (organization) => {
                void router.navigate({
                  to: '/orgs/$orgSlug',
                  params: { orgSlug: organization.slug },
                });
              },
            });
          }}
        >
          {accept.isPending ? 'Joining…' : `Accept and join`}
        </Button>
      </CardContent>
    </InviteShell>
  );
}
