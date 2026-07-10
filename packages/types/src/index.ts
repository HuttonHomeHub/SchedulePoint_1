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
 * source of truth for values; this const is the cross-boundary contract the web
 * and OpenAPI annotations agree on (avoids hardcoding the values in several
 * places). Keep the two in step.
 */
export const ORGANIZATION_ROLES = ['VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN'] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

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

/** An organisation as seen by a member, including the caller's role in it. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  /** The requesting user's role in this organisation. */
  role: OrganizationRole;
  createdAt: string;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

/** A pending (or historical) invitation to join an organisation. */
export interface InvitationSummary {
  id: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** The create-invitation response: the summary plus the one-time accept URL. */
export interface CreatedInvitation extends InvitationSummary {
  /** Absolute accept URL — returned once so onboarding works without email. */
  acceptUrl: string;
}

/** What an invitee sees before accepting (token-gated, minimal). */
export interface InvitationPreview {
  organizationName: string;
  role: OrganizationRole;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
}

/** A member of an organisation, with their public profile and role. */
export interface OrgMemberSummary {
  /** The membership id (not the user id). */
  id: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  role: OrganizationRole;
  joinedAt: string;
  /** Optimistic-locking version — echo it back when changing the role. */
  version: number;
}

/** Lifecycle state of a Plan. Mirrors the API's Prisma `PlanStatus` enum. */
export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/** A client (top level of the Org → Client → Project → Plan hierarchy). */
export interface ClientSummary {
  id: string;
  name: string;
  description: string | null;
  /** Optimistic-locking version — echo it back when updating or deleting. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A project, scoped to a client. */
export interface ProjectSummary {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A plan, scoped to a project — the future host of activities and the TSLD. */
export interface PlanSummary {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  /** Calendar day (`YYYY-MM-DD`), date-only — no time/timezone. */
  plannedStart: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Activity enums. Mirror the API's Prisma `ActivityType`/`ActivityStatus`/
 * `ConstraintType` enums (kept in lock-step). Modelled as string unions like
 * `PlanStatus`; consumers that need an iterable list define a local const array
 * (as the web does for plan statuses) to avoid importing runtime values here.
 */
export type ActivityType =
  'TASK' | 'START_MILESTONE' | 'FINISH_MILESTONE' | 'HAMMOCK' | 'LEVEL_OF_EFFORT';
export type ActivityStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
export type ConstraintType =
  'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO' | 'MANDATORY_START' | 'MANDATORY_FINISH';

/**
 * An activity — the leaf of the Org → Client → Project → Plan → Activity
 * hierarchy and the atomic unit of a schedule. The CPM output fields
 * (early/late dates, total float, critical flags) are **engine-owned**: null/false
 * until the CPM engine slice computes them. Calendar-day fields are `YYYY-MM-DD`.
 */
export interface ActivitySummary {
  id: string;
  planId: string;
  code: string | null;
  name: string;
  description: string | null;
  type: ActivityType;
  /** Working days (milestones are 0). */
  durationDays: number;
  constraintType: ConstraintType | null;
  constraintDate: string | null;
  /** Graphical y-lane for the TSLD canvas. */
  laneIndex: number;
  status: ActivityStatus;
  /** 0–100. */
  percentComplete: number;
  actualStart: string | null;
  actualFinish: string | null;
  // CPM output — engine-owned, null/false until computed by the CPM engine slice.
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  isCritical: boolean;
  isNearCritical: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dependency (logic-tie) types, in the CPM/GPM tradition (FS finish-to-start,
 * SS start-to-start, FF finish-to-finish, SF start-to-finish). Const-array
 * source-of-truth (like {@link ORGANIZATION_ROLES}) kept in lock-step with the
 * API's Prisma `DependencyType` enum; consumers that need an iterable list use
 * this directly.
 */
export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** The minimal shape of a dependency's endpoint activity (for list rendering). */
export interface DependencyEndpoint {
  id: string;
  code: string | null;
  name: string;
}

/**
 * A dependency — a directed, typed, lagged edge from a predecessor activity to a
 * successor activity within one plan. Together with activities it forms the
 * plan's schedule network (a DAG). The endpoints are embedded as light summaries
 * so a predecessors/successors list needs no extra fetch. `lagDays` is a signed
 * count of working days (lead = negative).
 */
export interface DependencySummary {
  id: string;
  planId: string;
  type: DependencyType;
  lagDays: number;
  predecessor: DependencyEndpoint;
  successor: DependencyEndpoint;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A soft-deleted hierarchy row surfaced in the "recently deleted" list. `kind`
 * discriminates which entity it is; `canRestore` is false when an ancestor is
 * still deleted (restore the parent first — the top-down invariant).
 */
export interface DeletedHierarchyItem {
  kind: 'client' | 'project' | 'plan';
  id: string;
  name: string;
  deletedAt: string;
  canRestore: boolean;
}

/**
 * A plan's computed CPM schedule roll-up — the result of a recalculation and the
 * shape of the read summary (they return the identical type). `dataDate` is the
 * plan's start (`plannedStart`); it is null when the plan has no start date yet.
 * `projectFinish` is the latest computed finish across the plan (the max inclusive
 * `earlyFinish`); it is null until the plan has been calculated (or when empty).
 * `parkedConstraintCount` is how many mandatory constraints were treated as their
 * moderate equivalents (MSO/MFO). All dates are calendar days (`YYYY-MM-DD`).
 */
export interface PlanScheduleSummary {
  dataDate: string | null;
  projectFinish: string | null;
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  parkedConstraintCount: number;
}

export {};
