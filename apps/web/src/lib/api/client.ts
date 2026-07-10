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
  return (await apiFetchEnvelope<T>(path, init)).data;
}

/**
 * As {@link apiFetch}, but returns the full `{ data, meta }` envelope. Use when a
 * caller needs the `meta` roll-up too — e.g. the baseline variance read, whose meta
 * is the plan variance summary (ADR-0025). For a 204 the data is `undefined` and meta
 * is absent.
 */
export async function apiFetchEnvelope<T, M = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: M }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (body as ApiError | undefined)?.error ?? {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
    };
    throw new ApiFetchError(response.status, error);
  }

  const envelope = body as ApiResponse<T> & { meta?: M };
  return envelope.meta !== undefined
    ? { data: envelope.data, meta: envelope.meta }
    : { data: envelope.data };
}
