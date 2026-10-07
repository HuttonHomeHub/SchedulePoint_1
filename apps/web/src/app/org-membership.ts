import type { OrganizationSummary } from '@repo/types';
import type { QueryClient } from '@tanstack/react-query';
import { notFound, rootRouteId } from '@tanstack/react-router';

import { organizationsQueryOptions } from '@/features/organizations';

/**
 * The organisation `orgSlug` names **in the caller's own list**, or `undefined`.
 *
 * The decision reads `GET /api/v1/organizations` — the organisations the caller belongs to — and
 * never sends the slug anywhere, so asking it cannot tell anyone whether an organisation exists
 * (`docs/specs/in-shell-not-found/feature-spec.md` §4.4). A slug the caller is not a member of and a
 * slug nobody holds both come back `undefined`, by construction.
 */
export async function loadMemberOrganization(
  queryClient: QueryClient,
  orgSlug: string,
): Promise<OrganizationSummary | undefined> {
  const organizations = await queryClient.ensureQueryData(organizationsQueryOptions);
  return organizations.find((o) => o.slug === orgSlug);
}

/**
 * `beforeLoad` of the `/orgs/$orgSlug/$` splat — an address under an organisation that no route
 * claims.
 *
 * A member passes through, and the route renders the in-shell "Page not found". Anyone else gets
 * the **root** not-found, named explicitly with `routeId: rootRouteId` so the outcome does not
 * depend on the router's `notFoundMode`. It deliberately does **not** record the slug as the active
 * organisation: a mistype is not a visit.
 */
export async function orgNotFoundBeforeLoad(
  queryClient: QueryClient,
  orgSlug: string,
): Promise<void> {
  const organization = await loadMemberOrganization(queryClient, orgSlug);
  if (!organization) {
    // The router signals not-found by throwing, as it does for a redirect.
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- router notFound
    throw notFound({ routeId: rootRouteId });
  }
}
