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

/**
 * Organisation-scoped roles, least → most privileged (ADR-0016). The API's
 * runtime `OrganizationRole` enum (apps/api/src/common/auth/principal.ts) is the
 * source of truth for values; this union is the cross-boundary contract the web
 * agrees on. Keep the two in step.
 */
export type OrganizationRole = 'VIEWER' | 'CONTRIBUTOR' | 'PLANNER' | 'ORG_ADMIN';

/** The authenticated user's public profile (never includes credentials). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
}

/** One of the current user's organisation memberships, with resolved permissions. */
export interface OrganizationMembershipSummary {
  organizationId: string;
  role: OrganizationRole;
  permissions: string[];
}

/** Response body of `GET /api/v1/me`: who I am and where I belong. */
export interface MeResponse {
  user: SessionUser;
  memberships: OrganizationMembershipSummary[];
}

export {};
