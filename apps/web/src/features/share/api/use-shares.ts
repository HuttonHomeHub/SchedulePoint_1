import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { shareKeys } from '@/lib/query/hierarchy-keys';

export { shareKeys };

/**
 * A single External-Guest share link as the management API returns it (ADR-0051 F-M2,
 * `ShareResponseDto`) — METADATA ONLY. The raw token / hash is NEVER here; the raw token
 * (in the guest URL fragment) is returned exactly once, on create, via {@link CreatedShare}.
 * `active` is derived server-side (not revoked and not past its expiry). Every date is an
 * ISO-8601 string (or null), matching the wire format.
 */
export interface ShareLink {
  id: string;
  planId: string;
  label: string | null;
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
}

/**
 * The create response (ADR-0051 F-M2, `CreatedShareDto`): the new link's metadata PLUS the
 * one-time guest `url` carrying the raw token in its fragment (`…/share#sp_share_…`). The URL is
 * returned ONCE and never again — only its hash is stored — so the UI must surface it for copy now.
 */
export interface CreatedShare {
  url: string;
  share: ShareLink;
}

/** The create request body (both fields optional — an unlabelled, non-expiring link is valid). */
export interface CreateShareInput {
  label?: string;
  /** ISO-8601 instant; omit for a link that never expires. Must be a future instant (server 422s a past one). */
  expiresAt?: string;
}

function sharesPath(orgSlug: string, planId: string): string {
  return `/organizations/${orgSlug}/plans/${planId}/shares`;
}

export function sharesQueryOptions(orgSlug: string, planId: string, enabled = true) {
  return queryOptions({
    queryKey: shareKeys.listByPlan(orgSlug, planId),
    queryFn: () => apiFetch<ShareLink[]>(sharesPath(orgSlug, planId)),
    // Gated so the list only fetches while the Share dialog is open — not on every plan mount.
    enabled,
  });
}

/**
 * A plan's share links, newest-first (management surface — never carries a token). `enabled` gates the
 * fetch on the dialog being open, so mounting the plan workspace (flag-on) does NOT fire this for every
 * role on every plan.
 */
export function useShares(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<ShareLink[]> {
  return useQuery(sharesQueryOptions(orgSlug, planId, enabled));
}

export function useCreateShare(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShareInput) =>
      apiFetch<CreatedShare>(sharesPath(orgSlug, planId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: shareKeys.listByPlan(orgSlug, planId) }),
  });
}

export function useRevokeShare(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) =>
      apiFetch<void>(`${sharesPath(orgSlug, planId)}/${shareId}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: shareKeys.listByPlan(orgSlug, planId) }),
  });
}
