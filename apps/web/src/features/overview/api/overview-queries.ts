import type { OrganisationOverview } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export const overviewKeys = {
  all: ['overview'] as const,
  detail: (orgSlug: string) => [...overviewKeys.all, orgSlug] as const,
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
export function overviewQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: overviewKeys.detail(orgSlug),
    queryFn: () => apiFetch<OrganisationOverview>(`/organizations/${orgSlug}/overview`),
    retry: false,
  });
}

export function useOrgOverview(orgSlug: string): UseQueryResult<OrganisationOverview> {
  return useQuery({ ...overviewQueryOptions(orgSlug), enabled: orgSlug.length > 0 });
}
