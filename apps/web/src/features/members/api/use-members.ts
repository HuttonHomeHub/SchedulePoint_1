import type { OrganizationRole, OrgMemberSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export const memberKeys = {
  all: (orgSlug: string) => ['members', orgSlug] as const,
  list: (orgSlug: string) => [...memberKeys.all(orgSlug), 'list'] as const,
};

export function membersQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: memberKeys.list(orgSlug),
    queryFn: () => apiFetch<OrgMemberSummary[]>(`/organizations/${orgSlug}/members`),
  });
}

export function useMembers(orgSlug: string): UseQueryResult<OrgMemberSummary[]> {
  return useQuery(membersQueryOptions(orgSlug));
}

export function useChangeMemberRole(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: string; role: OrganizationRole; version: number }) =>
      apiFetch<OrgMemberSummary>(`/organizations/${orgSlug}/members/${input.memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: input.role, version: input.version }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.list(orgSlug) }),
  });
}

export function useRemoveMember(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.list(orgSlug) }),
  });
}
