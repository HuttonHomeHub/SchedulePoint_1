import { Link, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAcceptInvitation, useInvitationPreview } from '../api/use-invitations';
import { ROLE_LABELS } from '../schemas/invite-schemas';

import { InviteShell } from './InviteShell';

import { useAnnounce } from '@/components/ui/announcer';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ResendVerificationButton, useSession } from '@/features/auth';

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
  if (!user.emailVerified) return 'Confirm your email address before joining.';
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
  // **Not reachable today**: the server guard is itself gated on `requireEmailVerification`, which
  // is off by default. It is a latent dead end that arms itself the moment an operator sets the env
  // var, which is precisely why it is fixed unflagged rather than deferred.
  if (!user.emailVerified) {
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
          <CardDescription>
            You&rsquo;re signed in as {user.email}, but this invitation is for {invite.email}. Sign
            out and use the invited account.
          </CardDescription>
        </CardHeader>
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
        {accept.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {accept.error.message}
          </p>
        ) : null}
        <Button
          disabled={accept.isPending}
          aria-busy={accept.isPending}
          onClick={() =>
            accept.mutate(token, {
              onSuccess: (organization) => {
                void router.navigate({
                  to: '/orgs/$orgSlug',
                  params: { orgSlug: organization.slug },
                });
              },
            })
          }
        >
          {accept.isPending ? 'Joining…' : `Accept and join`}
        </Button>
      </CardContent>
    </InviteShell>
  );
}
