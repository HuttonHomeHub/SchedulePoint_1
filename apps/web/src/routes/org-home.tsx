import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NAV_TREE_ENABLED } from '@/config/env';
import { clientsQueryOptions } from '@/features/clients';
import { useOrganizations } from '@/features/organizations';
import { WelcomeEmptyState } from '@/routes/welcome-empty-state';

/**
 * The organisation home screen (`/orgs/$orgSlug`). With the persistent shell on
 * (`VITE_NAV_TREE`), this is the "no plan selected" landing and renders the neutral
 * welcome empty-state. Flag-off keeps today's confirmation card.
 */
export function OrgHomeScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  const { data: organizations } = useOrganizations();
  const organization = organizations?.find((candidate) => candidate.slug === orgSlug);

  // Owned here (the route tier) so WelcomeEmptyState stays presentational. Gated on the
  // flag so the flag-off path fires no extra request (byte-for-byte today's behaviour).
  const { data: clients } = useQuery({
    ...clientsQueryOptions(orgSlug ?? ''),
    enabled: NAV_TREE_ENABLED && Boolean(orgSlug),
  });

  if (NAV_TREE_ENABLED && orgSlug) {
    return <WelcomeEmptyState orgSlug={orgSlug} isNewOrg={clients?.length === 0} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
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
    </div>
  );
}
