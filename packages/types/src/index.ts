/**
 * @repo/types — shared contracts between the `web` and `api` workspaces.
 *
 * This package is intentionally free of runtime dependencies: it should
 * contain only types, interfaces, enums, and small pure helpers that both
 * the frontend and backend need to agree on (DTO shapes, API response
 * envelopes, shared enums).
 *
 * Application domain models are NOT defined yet — this repository is at the
 * foundation stage. Add contracts here as features are designed, and keep
 * them the single source of truth for cross-boundary shapes.
 */

/** Standard envelope for successful API responses. */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard envelope for API errors (see docs/API.md). */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Cursor-based pagination metadata. */
export interface PageMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export {};
