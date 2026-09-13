import { QueryClient } from '@tanstack/react-query';

import { isRetryableStatus, readErrorStatus } from '@/lib/api/retryable-status';

/**
 * Create the app's TanStack Query client with sensible defaults
 * (docs/FRONTEND_ARCHITECTURE.md → Data fetching & caching). Retries transient errors with backoff.
 *
 * **Which failures are transient is NOT decided here** (`docs/TECH_DEBT.md` #314). This file used to
 * answer it inline — `status >= 400 && status < 500 → false`, under a docblock reading "client
 * errors are not transient" — and that parenthesis is true of every 4xx but three. The exception
 * that matters is **429**, which exists precisely to say _this would have worked, come back in a
 * moment_. `lib/api/retryable-status.ts` holds the statuses and the reasoning; it is imported rather
 * than restated so the app cannot hold two answers, which is exactly what it held until now.
 *
 * **Why it was worth fixing rather than tidying.** Both queries on the `_authed` critical path
 * inherit this default and neither overrides `retry`: `sessionQueryOptions` maps only 401 to `null`
 * and rethrows the rest, and `_authed.beforeLoad` awaits it — so a 429 on `GET /me` was not an
 * unauthenticated answer but a rejection, landing the reader on `defaultErrorComponent`. That
 * screen now offers a way out too; the two halves of #314 ship together because neither alone is
 * enough for a bucket that stays exhausted longer than the backoff.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (!isRetryableStatus(readErrorStatus(error))) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Unchanged, and deliberately not routed through the shared rule: a mutation is not
        // idempotent, so "the same body could succeed" is not the question — re-sending it may
        // succeed TWICE. The shared rule answers a read's question only.
        retry: false,
      },
    },
  });
}
