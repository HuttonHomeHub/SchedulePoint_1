import type { MyInvitation, OrganizationSummary } from '@repo/types';
import { useId } from 'react';

import { useAcceptMyInvitation } from '../api/use-my-invitations';
import { ROLE_LABELS } from '../schemas/invite-schemas';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingShape, Skeleton } from '@/components/ui/page';
import { ServerError } from '@/components/ui/server-error';
import { isRateLimited, throttledMessage } from '@/features/auth';

/**
 * What the first screen holds while the invitations are being read. Shaped like the create-an-
 * organisation card the screen settles into when there are none, so the common case does not move,
 * and held for the whole screen rather than for the offer alone: a section arriving late above a
 * vertically centred card would shift the form under the reader's pointer (ADR-0202).
 */
export function MyInvitationsOfferLoading(): React.ReactElement {
  return (
    <LoadingShape label="Loading your invitations…">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-(--control-h) w-full" />
          <Skeleton className="h-(--control-h) w-full" />
        </CardContent>
      </Card>
    </LoadingShape>
  );
}

function InvitationCard({
  invitation,
  onJoined,
}: {
  invitation: MyInvitation;
  onJoined: (organization: OrganizationSummary) => void;
}): React.ReactElement {
  const accept = useAcceptMyInvitation();
  const errorId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>Join {invitation.organizationName}</CardTitle>
        <CardDescription>
          You&rsquo;ve been invited as {ROLE_LABELS[invitation.role]}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The server's own sentence is shown (410 "This invitation has expired…", 409 already a
            member), as the link's card does; only the rate limit is translated. */}
        {/* The wrapper carries the id the button points at, so a re-focused button reads the reason
            as well as its name (`ServerError` takes no id and is not changed for one caller). */}
        <div id={errorId}>
          <ServerError
            message={
              accept.isError
                ? isRateLimited(accept.error)
                  ? throttledMessage()
                  : accept.error.message
                : null
            }
          />
        </div>
        {/* `aria-disabled` with a guarded `onClick`, not `disabled`, so focus is not lost to
            `<body>` while the request runs (see `AcceptInvitationCard`). The accessible name carries
            the organisation so two invitations are not two identical buttons. */}
        <Button
          aria-label={
            accept.isPending
              ? `Joining ${invitation.organizationName}…`
              : `Accept and join ${invitation.organizationName}`
          }
          aria-describedby={accept.isError ? errorId : undefined}
          aria-disabled={accept.isPending}
          aria-busy={accept.isPending}
          onClick={() => {
            if (accept.isPending) return;
            accept.mutate(invitation.id, { onSuccess: onJoined });
          }}
        >
          {accept.isPending ? 'Joining…' : 'Accept and join'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Invitations sent to the address the signed-in person has confirmed (ADR-0221), offered above the
 * create-an-organisation card. The caller renders nothing for an empty list.
 */
export function MyInvitationsOffer({
  invitations,
  onJoined,
}: {
  invitations: MyInvitation[];
  onJoined: (organization: OrganizationSummary) => void;
}): React.ReactElement {
  return (
    <section aria-labelledby="my-invitations-heading" className="flex flex-col gap-4">
      <h1 id="my-invitations-heading" className="text-xl font-semibold tracking-tight">
        You&rsquo;ve been invited
      </h1>
      {invitations.map((invitation) => (
        <InvitationCard key={invitation.id} invitation={invitation} onJoined={onJoined} />
      ))}
    </section>
  );
}
