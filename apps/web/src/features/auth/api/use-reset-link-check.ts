import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

/**
 * Ask the server, on arrival, whether an emailed reset link still works (spec
 * `docs/specs/reset-link-check/`, amending ADR-0074).
 *
 * A `POST` read: the token has to travel in a body, never a URL (TECH_DEBT #537), and the check
 * changes nothing server-side, so it is a query rather than a mutation. The token is in the key so
 * a link pasted into the open tab is checked afresh and a result for the old token can never decide
 * the new one. It lives only in memory — there is no query persister.
 *
 * `enabled` waits for a token; `retry` is off and failure is left as an error because the screen
 * treats a failed check as "show the form": the reader is never blocked by the check, and the
 * reset itself still rejects a bad token. `gcTime: 0` drops the token from the cache on unmount.
 */
export function useResetLinkCheck(token: string) {
  return useQuery({
    queryKey: ['password-reset-check', token],
    queryFn: () =>
      apiFetch<{ usable: boolean }>('/password-reset/check', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
