import type { ApiError, ApiResponse, PageMeta } from '@repo/types';

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

/** The largest page a cursor-paginated list endpoint serves (PaginationQueryDto `@Max(100)`). */
const MAX_PAGE_LIMIT = 100;

/**
 * Hard stop on the paging loop in {@link apiFetchAllPages} — a defensive backstop against a server
 * that never stops returning `hasMore`. At {@link MAX_PAGE_LIMIT} rows/page this bounds a single
 * fetch to 100k rows, comfortably above the product's ~2,000-activity plan ceiling (brief §17) while
 * never spinning forever.
 */
const MAX_PAGES = 1000;

/**
 * Fetch **every** page of a cursor-paginated list endpoint and return the concatenated rows. The
 * plan workspace (canvas + activities table + logic) needs the *whole* plan, not a single default
 * page: an edge only draws when both its endpoint bars are loaded, so a partial page silently drops
 * activities and their links. Loops `?limit=100&cursor=…` following `meta.nextCursor` until the
 * server reports no more, appending `limit`/`cursor` onto any query string the caller already set.
 * The list endpoints order deterministically by id, so the concatenation is stable across pages.
 */
export async function apiFetchAllPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  const separator = path.includes('?') ? '&' : '?';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const cursorParam: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const envelope: { data: T[]; meta?: PageMeta } = await apiFetchEnvelope<T[], PageMeta>(
      `${path}${separator}limit=${MAX_PAGE_LIMIT}${cursorParam}`,
    );
    if (envelope.data) rows.push(...envelope.data);
    const next = envelope.meta;
    if (!next?.hasMore || next.nextCursor === null) return rows;
    cursor = next.nextCursor;
  }
  return rows;
}
