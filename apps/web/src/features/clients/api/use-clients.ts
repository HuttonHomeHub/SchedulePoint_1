import type { ClientSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { ClientFormValues } from '../schemas/client-schemas';

import { apiFetch } from '@/lib/api/client';
import { clientKeys } from '@/lib/query/hierarchy-keys';
import { clientsQueryOptions } from '@/lib/query/hierarchy-queries';

// The list read-query lives in `lib` (shared) so the navigator rail can consume it
// without a feature → feature import; re-exported here so existing call sites are
// unchanged.
export { clientKeys, clientsQueryOptions };

/** Normalise a form's optional description: a blank field is sent as absent. */
function descriptionField(description?: string): string | undefined {
  const trimmed = description?.trim();
  return trimmed ? trimmed : undefined;
}

export function useClients(orgSlug: string): UseQueryResult<ClientSummary[]> {
  return useQuery(clientsQueryOptions(orgSlug));
}

export function clientQueryOptions(orgSlug: string, clientId: string) {
  return queryOptions({
    queryKey: clientKeys.detail(orgSlug, clientId),
    queryFn: () => apiFetch<ClientSummary>(`/organizations/${orgSlug}/clients/${clientId}`),
    retry: false,
  });
}

/** A single client — used by the client-detail screen (handles deep-links / 404). */
export function useClient(orgSlug: string, clientId: string): UseQueryResult<ClientSummary> {
  return useQuery(clientQueryOptions(orgSlug, clientId));
}

export function useCreateClient(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientFormValues) =>
      apiFetch<ClientSummary>(`/organizations/${orgSlug}/clients`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: descriptionField(input.description),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.list(orgSlug) }),
  });
}

export function useUpdateClient(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientId: string; version: number } & ClientFormValues) =>
      apiFetch<ClientSummary>(`/organizations/${orgSlug}/clients/${input.clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: input.name,
          description: descriptionField(input.description) ?? null,
          version: input.version,
        }),
      }),
    // Refetch on settle (not just success) so a 409 conflict refreshes the
    // cached row's version — the retry then carries the current version.
    onSettled: () => queryClient.invalidateQueries({ queryKey: clientKeys.list(orgSlug) }),
  });
}

export function useDeleteClient(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/clients/${clientId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: clientKeys.list(orgSlug) }),
  });
}
