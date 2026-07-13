import { Link, useRouter } from '@tanstack/react-router';

import { useAcceptInvitation, useInvitationPreview } from '../api/use-invitations';
import { ROLE_LABELS } from '../schemas/invite-schemas';

import { InviteShell } from './InviteShell';

import { Button, buttonVariants } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/features/auth';

/** Invitee-facing accept flow: preview the invite, then accept as the right user. */
export function AcceptInvitationCard({ token }: { token: string }): React.ReactElement {
  const router = useRouter();
  const preview = useInvitationPreview(token);
  const session = useSession();
  const accept = useAcceptInvitation();

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
