import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import { clientsQueryOptions } from '@/features/clients';
import { WelcomeEmptyState } from '@/routes/welcome-empty-state';

/**
 * The organisation home screen (`/orgs/$orgSlug`) — the "no plan selected" landing.
 *
 * **It carried a second screen until `VITE_NAV_TREE` retired (2026-08-18).** That branch rendered a
 * card reading "The schedule editor arrives in an upcoming update", roughly a year after the editor
 * shipped — and nobody had ever seen it, because a `VITE_` constant is inlined at build time and no
 * published image passes one (ADR-0088). An unreachable screen does not go stale harmlessly: it
 * goes stale invisibly, and the next person to design this route reads a screen that does not
 * exist. Deleted with the flag rather than corrected.
 */
export function OrgHomeScreen(): React.ReactElement | null {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;

  // Owned here (the route tier) so WelcomeEmptyState stays presentational.
  const { data: clients } = useQuery({
    ...clientsQueryOptions(orgSlug ?? ''),
    enabled: Boolean(orgSlug),
  });

  if (orgSlug === undefined) return null;
  return <WelcomeEmptyState orgSlug={orgSlug} isNewOrg={clients?.length === 0} />;
}
