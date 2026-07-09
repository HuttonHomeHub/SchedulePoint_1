import { Link, useParams } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
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
            Organise your work as clients, projects, and plans. The schedule editor arrives in an
            upcoming update.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {orgSlug ? (
            <Link
              to="/orgs/$orgSlug/clients"
              params={{ orgSlug }}
              className={buttonVariants({ className: 'self-start' })}
            >
              Go to clients
            </Link>
          ) : null}
          <p className="text-muted-foreground">
            Use the organisation switcher in the header to move between your organisations.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
