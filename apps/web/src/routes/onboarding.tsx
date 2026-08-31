import { useRouter } from '@tanstack/react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth';
import { CreateOrganizationForm } from '@/features/organizations';
import { setLastActiveOrg } from '@/lib/active-org';

/** First-run screen: create your first organisation, then enter it. */
export function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  // The active-org hint is per user (`docs/TECH_DEBT.md` #171). This screen sits inside `_authed`,
  // so the session is already resolved; the guard is for the type, not for a real absent case.
  const session = useSession().data;

  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your organisation</CardTitle>
          <CardDescription>
            Organisations hold your clients, projects, and schedules. You&rsquo;ll be its admin and
            can invite your team afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm
            onCreated={(organization) => {
              if (session) setLastActiveOrg(session.user.id, organization.slug);
              void router.navigate({
                to: '/orgs/$orgSlug',
                params: { orgSlug: organization.slug },
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
