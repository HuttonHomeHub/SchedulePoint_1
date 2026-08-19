import type { OrganisationOverview } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export const overviewKeys = {
  all: ['overview'] as const,
  /**
   * The remembered ids are part of the key, because they are part of the request. Leaving them out
   * would serve a cached payload whose `recentPlans` answered a different question — most visibly
   * right after opening a plan, which is exactly when the reader looks for it.
   */
  detail: (orgSlug: string, recentPlanIds: readonly string[] = []) =>
    [...overviewKeys.all, orgSlug, recentPlanIds.join(',')] as const,
};

/**
 * The organisation overview — one request for the whole screen.
 *
 * **One endpoint, not one per section**, because all three sections resolve the same organisation,
 * check the same permission and read the same database in the same request. Partial failure is not
 * a real mode here, so per-section error isolation buys nothing and costs a second round trip on
 * the coldest path in the product. The section skeletons come from this single query's pending
 * state.
 */
export function overviewQueryOptions(orgSlug: string, recentPlanIds: readonly string[] = []) {
  // The remembered ids ride on the request the screen is already making — the constraint that
  // made "Jump back in" acceptable on the coldest path in the product (ADR-0098 §4.9). A second
  // request for it would be an extra round trip on the first screen after every sign-in.
  const query = recentPlanIds.map((id) => `recentPlanIds=${encodeURIComponent(id)}`).join('&');
  return queryOptions({
    queryKey: overviewKeys.detail(orgSlug, recentPlanIds),
    queryFn: () =>
      apiFetch<OrganisationOverview>(
        `/organizations/${orgSlug}/overview${query ? `?${query}` : ''}`,
      ),
    retry: false,
  });
}

export function useOrgOverview(
  orgSlug: string,
  recentPlanIds: readonly string[] = [],
): UseQueryResult<OrganisationOverview> {
  return useQuery({
    ...overviewQueryOptions(orgSlug, recentPlanIds),
    enabled: orgSlug.length > 0,
  });
}
