import type {
  CreatedInvitation,
  InvitationPreview,
  InvitationSummary,
  OrganizationRole,
  OrganizationSummary,
} from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { sessionKeys } from '@/features/auth';
import { organizationKeys } from '@/features/organizations';
import { overviewKeys } from '@/features/overview';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

export const invitationKeys = {
  all: (orgSlug: string) => ['invitations', orgSlug] as const,
  list: (orgSlug: string) => [...invitationKeys.all(orgSlug), 'list'] as const,
};

/**
 * The organisation's pending invitations.
 *
 * **`invitationKeys.all` has had a writer and no reader since it was written.** `GET
 * …/organizations/:slug/invitations` and `DELETE …/invitations/:id` have both shipped since
 * ADR-0016, and nothing in `apps/web` has ever called either — so the landing could say "1
 * invitation is still pending" and link to a Members page with no way to show it. That is
 * ADR-0081's shape with the missing half on the API side: a route with no entry point.
 *
 * **Every page, not the endpoint's default 20**, for `useMembers`' reason one list along: an
 * organisation with more than twenty outstanding invitations would silently hide the rest, and the
 * hidden ones could not be revoked.
 */
export function invitationsQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: invitationKeys.list(orgSlug),
    queryFn: () => apiFetchAllPages<InvitationSummary>(`/organizations/${orgSlug}/invitations`),
  });
}

export function useInvitations(orgSlug: string): UseQueryResult<InvitationSummary[]> {
  return useQuery(invitationsQueryOptions(orgSlug));
}

/**
 * Revoke a pending invitation.
 *
 * **It invalidates the overview as well as the list**, because the landing's two counts are
 * derived from the same rows: revoking one and leaving the landing saying it is still pending
 * recreates, in the cache, exactly the disagreement this milestone removed from the query.
 */
export function useRevokeInvitation(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invitationKeys.all(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
  });
}

/** Invite someone to the organisation (Org Admin). Returns the accept URL. */
export function useCreateInvitation(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: OrganizationRole }) =>
      apiFetch<CreatedInvitation>(`/organizations/${orgSlug}/invitations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    // The landing's counts come from the same rows, so a new invitation must refresh both or the
    // count the reader just changed stays stale behind them.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invitationKeys.all(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
      ]);
    },
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
