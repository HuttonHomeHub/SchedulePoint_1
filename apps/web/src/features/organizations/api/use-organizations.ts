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
