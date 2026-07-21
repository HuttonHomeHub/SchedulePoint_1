import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

/** Query key for the API build-version read (a single app-wide constant). */
export const apiVersionKeys = {
  version: () => ['system', 'api-version'] as const,
};

/**
 * The API's build version, read once from the public `GET /api/v1/version`.
 *
 * The version can't change within a session, so it's cached with `staleTime: Infinity`
 * (never refetched). Purely informational chrome: a failure or the loading state returns
 * `null` rather than surfacing any error UI — the caller simply omits the API version.
 */
export function useApiVersion(): string | null {
  const query = useQuery({
    queryKey: apiVersionKeys.version(),
    queryFn: () => apiFetch<{ version: string }>('/version'),
    staleTime: Infinity,
    // Build metadata is non-critical; don't retry or spam the log on a transient failure.
    retry: false,
  });
  return query.data?.version ?? null;
}
