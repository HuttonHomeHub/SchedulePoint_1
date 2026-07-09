import { useRouter } from '@tanstack/react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateOrganizationForm } from '@/features/organizations';
import { setLastActiveOrg } from '@/lib/active-org';

/** First-run screen: create your first organisation, then enter it. */
export function OnboardingScreen(): React.ReactElement {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-6">
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
              setLastActiveOrg(organization.slug);
              void router.navigate({
                to: '/orgs/$orgSlug',
                params: { orgSlug: organization.slug },
              });
            }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
