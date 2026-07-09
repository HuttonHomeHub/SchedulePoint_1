import { QueryClient } from '@tanstack/react-query';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Create the app's TanStack Query client with sensible defaults
 * (docs/FRONTEND_ARCHITECTURE.md → Data fetching & caching). Retries transient
 * errors with backoff but never retries 4xx (client errors are not transient).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiFetchError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
