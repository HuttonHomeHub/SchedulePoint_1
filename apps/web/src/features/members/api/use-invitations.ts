import type {
  CreatedInvitation,
  InvitationPreview,
  OrganizationRole,
  OrganizationSummary,
} from '@repo/types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { sessionKeys } from '@/features/auth';
import { organizationKeys } from '@/features/organizations';
import { apiFetch } from '@/lib/api/client';

export const invitationKeys = {
  all: (orgSlug: string) => ['invitations', orgSlug] as const,
};

/** Invite someone to the organisation (Org Admin). Returns the accept URL. */
export function useCreateInvitation(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: OrganizationRole }) =>
      apiFetch<CreatedInvitation>(`/organizations/${orgSlug}/invitations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationKeys.all(orgSlug) }),
  });
}

/** Preview an invitation by token (public). `null` token disables the query. */
export function useInvitationPreview(token: string | null): UseQueryResult<InvitationPreview> {
  return useQuery({
    queryKey: ['invitation-preview', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: () =>
      apiFetch<InvitationPreview>('/invitations/preview', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  });
}

/** Accept an invitation; joins the organisation and refreshes org/session caches. */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<OrganizationSummary>('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.session }),
      ]);
    },
  });
}
