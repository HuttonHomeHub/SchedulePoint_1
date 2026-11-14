import type { OrganizationSummary } from '@repo/types';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth';
import {
  MyInvitationsOffer,
  MyInvitationsOfferLoading,
  useMyInvitations,
} from '@/features/members';
import { CreateOrganizationForm } from '@/features/organizations';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { setLastActiveOrg } from '@/lib/active-org';

/**
 * First-run screen: accept an invitation waiting for the confirmed address, or create your first
 * organisation, then enter it.
 */
export function OnboardingScreen(): React.ReactElement {
  useDocumentTitle('Create your organisation');
  const router = useRouter();
  // The active-org hint is per user (`docs/TECH_DEBT.md` #171). This screen sits inside `_authed`,
  // so the session is already resolved; the guard is for the type, not for a real absent case.
  const session = useSession().data;
  const invitations = useMyInvitations();
  const announce = useAnnounce();
  const announced = useRef(false);

  const waiting = invitations.data?.length ?? 0;
  // Once: accepting refetches the list, and a second sentence would talk over the navigation.
  useEffect(() => {
    if (waiting === 0 || announced.current) return;
    announced.current = true;
    announce(`You have ${waiting} ${waiting === 1 ? 'invitation' : 'invitations'} waiting.`);
  }, [waiting, announce]);

  const enter = (organization: OrganizationSummary): void => {
    if (session) setLastActiveOrg(session.user.id, organization.slug);
    void router.navigate({ to: '/orgs/$orgSlug', params: { orgSlug: organization.slug } });
  };

  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-6 p-6">
      {invitations.isPending ? (
        <MyInvitationsOfferLoading />
      ) : (
        <>
          {waiting > 0 && invitations.data ? (
            <MyInvitationsOffer
              invitations={invitations.data}
              onJoined={(organization) => {
                // Focus lands on `<body>` after the navigation, as everywhere else, so the join is
                // said aloud once here.
                announce(`Joined ${organization.name}.`);
                enter(organization);
              }}
            />
          ) : null}
          <Card>
            <CardHeader>
              {/* The offer's heading is the page's `h1` when it is showing. */}
              <CardTitle level={waiting > 0 ? 2 : 1}>Create your organisation</CardTitle>
              <CardDescription>
                Organisations hold your clients, projects, and schedules. You&rsquo;ll be its admin
                and can invite your team afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateOrganizationForm onCreated={enter} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
