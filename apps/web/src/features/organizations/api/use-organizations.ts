import type { OrganizationSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { CreateOrganizationValues } from '../schemas/organization-schemas';

import { sessionKeys } from '@/features/auth';
import { apiFetch } from '@/lib/api/client';

export const organizationKeys = {
  all: ['organizations'] as const,
  list: () => [...organizationKeys.all, 'list'] as const,
};

/** Query options for the caller's organisations — shared with the router loaders. */
export const organizationsQueryOptions = queryOptions({
  queryKey: organizationKeys.list(),
  queryFn: () => apiFetch<OrganizationSummary[]>('/organizations'),
});

export function useOrganizations(): UseQueryResult<OrganizationSummary[]> {
  return useQuery(organizationsQueryOptions);
}

/**
 * The clear-out configuration the delete confirmations word themselves from, or `undefined` while
 * the list is loading or the slug is not in it (the confirmation then makes no claim about a
 * deadline). Installation configuration, read off the organisation list because that is an
 * authenticated response every screen has already fetched (`docs/TECH_DEBT.md` #140).
 */
export function useDeleteRetention(
  orgSlug: string | undefined,
): { active: boolean; days: number } | undefined {
  const { data } = useQuery({
    ...organizationsQueryOptions,
    select: (organizations) => {
      const org = organizations.find((o) => o.slug === orgSlug);
      return org ? { active: org.retentionActive, days: org.retentionDays } : undefined;
    },
  });
  return data;
}

/** Create an organisation, then refresh the org list and the session (memberships). */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateOrganizationValues) =>
      apiFetch<OrganizationSummary>('/organizations', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.session }),
      ]);
    },
  });
}
