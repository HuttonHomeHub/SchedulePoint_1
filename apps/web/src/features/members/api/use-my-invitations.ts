import type { MyInvitation, OrganizationSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { sessionKeys } from '@/features/auth';
import { organizationKeys } from '@/features/organizations';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

export const myInvitationKeys = {
  all: ['my-invitations'] as const,
};

/**
 * The invitations sent to the address the signed-in person has confirmed (ADR-0221).
 *
 * **A failed read settles as "none" rather than throwing**: this feeds an offer on the first screen,
 * and the emailed link still works whatever this says, so an error must not take the screen's real
 * job (creating an organisation) away. It is logged, not swallowed. `retry: false` because the
 * screen holds a loading shape until this settles, and a retry loop would hold it for seconds.
 *
 * Every page, as `useInvitations` does: a hidden invitation could not be accepted.
 */
export function myInvitationsQueryOptions() {
  return queryOptions({
    queryKey: myInvitationKeys.all,
    retry: false,
    queryFn: async (): Promise<MyInvitation[]> => {
      try {
        return await apiFetchAllPages<MyInvitation>('/me/invitations');
      } catch (error) {
        console.error('Could not read the invitations sent to this address', error);
        return [];
      }
    },
  });
}

export function useMyInvitations(): UseQueryResult<MyInvitation[]> {
  return useQuery(myInvitationsQueryOptions());
}

/**
 * Accept one of them by id, with no token. Joins the organisation, so the session and the
 * organisation list are refreshed exactly as the link door's accept does, and the list is too.
 */
export function useAcceptMyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<OrganizationSummary>(`/me/invitations/${invitationId}/accept`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.session }),
        queryClient.invalidateQueries({ queryKey: myInvitationKeys.all }),
      ]);
    },
  });
}
