import type { ApiError, ApiResponse } from '@repo/types';

import { API_BASE_URL } from '@/config/env';

/**
 * Error thrown by {@link apiFetch} for any non-2xx response. Carries the HTTP
 * status and the parsed {@link ApiError} envelope so callers can branch on
 * `status` (e.g. treat 401 as "unauthenticated") and surface `error.message`.
 */
export class ApiFetchError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError['error'],
  ) {
    super(error.message);
    this.name = 'ApiFetchError';
  }
}

/**
 * Thin typed wrapper over `fetch` for the JSON API (docs/FRONTEND_ARCHITECTURE.md
 * → Data fetching). Sends cookies, sets JSON headers, unwraps the standard
 * `{ data }` envelope, and maps errors to {@link ApiFetchError}. UI imports
 * feature hooks, not this directly.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (body as ApiError | undefined)?.error ?? {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
    };
    throw new ApiFetchError(response.status, error);
  }

  return (body as ApiResponse<T>).data;
}
