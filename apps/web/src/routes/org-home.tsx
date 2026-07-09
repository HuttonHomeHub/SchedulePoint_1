import { useParams } from '@tanstack/react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizations } from '@/features/organizations';

/**
 * The organisation home screen (`/orgs/$orgSlug`). For this slice it confirms the
 * active organisation and the user's role; clients, projects, plans, and member
 * management arrive in later slices.
 */
export function OrgHomeScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  const { data: organizations } = useOrganizations();
  const organization = organizations?.find((candidate) => candidate.slug === orgSlug);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {organization?.name ?? 'Organisation'}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">Your role: {organization?.role ?? '—'}</p>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">You&rsquo;re all set up</CardTitle>
          <CardDescription>
            Inviting teammates, and building clients, projects, and schedules, arrive in upcoming
            updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Use the organisation switcher in the header to move between your organisations.
        </CardContent>
      </Card>
    </main>
  );
}
