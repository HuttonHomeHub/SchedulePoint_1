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

/**
 * A plan's **scheduling mode** (ADR-0033). `EARLY` renders each activity at its
 * computed earliest dates (classic CPM). `VISUAL` honours the planner's hand-placed
 * `Activity.visualStart` (bars stay where dropped; the engine pushes unplaced
 * successors and flags conflicts). Mirrors the API's Prisma `SchedulingMode` enum.
 */
export type SchedulingMode = 'EARLY' | 'VISUAL';

/**
 * A plan's **out-of-sequence recalc mode** (M2, ADR-0035 §1). Governs how an in-progress activity's
 * remaining work treats predecessor logic: `RETAINED_LOGIC` (the P6 default — remaining waits for
 * incomplete predecessors), `PROGRESS_OVERRIDE` (remaining runs from the data date, ignoring
 * incomplete predecessors), or `ACTUAL_DATES` (remaining floored at the actual start). Mirrors the
 * API's Prisma `ProgressRecalcMode` enum.
 */
export type ProgressRecalcMode = 'RETAINED_LOGIC' | 'PROGRESS_OVERRIDE' | 'ACTUAL_DATES';

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
  /**
   * The scheduling mode (ADR-0033): `EARLY` (computed-earliest) or `VISUAL` (hand-placed).
   * Defaults to `EARLY` (behaviour-preserving).
   */
  schedulingMode: SchedulingMode;
  /**
   * The out-of-sequence recalc mode (M2, ADR-0035 §1). Defaults to `RETAINED_LOGIC` (the P6 default,
   * behaviour-preserving); governs how a progressed activity's remaining work treats predecessor logic.
   */
  progressRecalcMode: ProgressRecalcMode;
  /**
   * Expected-finish scheduling option (M4, ADR-0035 §9). When true, the engine's forward pass resizes
   * an incomplete activity's remaining work so its early finish lands on its `expectedFinish`. Default
   * `false` (behaviour-preserving); the engine ignores expected finishes when off.
   */
  useExpectedFinishDates: boolean;
  /**
   * Calendar day (`YYYY-MM-DD`), date-only — no time/timezone. The mandatory CPM data date
   * (ADR-0033 M1): every saved plan has one. Modelled as `string | null` only for pre-M1
   * historical/transitional reads; live plans always carry a value.
   */
  plannedStart: string | null;
  /**
   * The plan's default working-day calendar (M5, ADR-0024), or null for
   * all-days-work (the M6 back-compat behaviour). New plans default to the org's
   * seeded {@link STANDARD_CALENDAR_NAME} calendar.
   */
  calendarId: string | null;
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
 * The **six** constraint kinds the CPM engine honours exactly as labelled — its
 * `ModerateConstraint` set. Keep in lock-step with the engine's `normaliseConstraint`
 * (`apps/api/src/modules/schedule/engine/constraints.ts`): those there map 1:1 to a
 * moderate kind, whereas the two `MANDATORY_*` kinds are **parked** (silently applied
 * as `MSO`/`MFO`, ADR-0023 §6). The web form offers only these for a new/changed
 * constraint, so it never sets a type that behaves differently than it reads
 * (`MANDATORY_*` stay valid enum values — imports/other tools may set them — but are
 * not newly selectable).
 */
export const SELECTABLE_CONSTRAINT_TYPES = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'] as const;

/** The two constraint kinds the engine parks as their moderate equivalents (ADR-0023 §6). */
export const PARKED_CONSTRAINT_TYPES = ['MANDATORY_START', 'MANDATORY_FINISH'] as const;

/** True for a constraint kind the engine parks (applies as `MSO`/`MFO`, not as labelled). */
export function isParkedConstraintType(
  type: ConstraintType,
): type is (typeof PARKED_CONSTRAINT_TYPES)[number] {
  return type === 'MANDATORY_START' || type === 'MANDATORY_FINISH';
}

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
  /**
   * Optional secondary schedule constraint (ADR-0035 §10). The primary drives the forward pass
   * (early dates); the secondary drives the backward pass (late dates) — e.g. an SNET primary + an
   * FNLT secondary. Both null when no secondary is set; paired (both-or-neither) like the primary.
   */
  secondaryConstraintType: ConstraintType | null;
  secondaryConstraintDate: string | null;
  /**
   * The activity's own working-time calendar (ADR-0037, M5), or `null` to **inherit** the plan
   * default (resolution: activity → plan → all-days-work). When set, the activity's duration is
   * measured, its float counted, and its dates derived on this calendar — so e.g. a 24/7 crew
   * activity inside a 5-day plan works across weekends.
   */
  calendarId: string | null;
  /** Graphical y-lane for the TSLD canvas. */
  laneIndex: number;
  /**
   * Schedule As-Late-As-Possible (ADR-0035 §11): a display-only placement preference. When set, the
   * activity renders at its late-based position; it never changes early/late/float. False by default.
   */
  scheduleAsLateAsPossible: boolean;
  status: ActivityStatus;
  /** 0–100. */
  percentComplete: number;
  actualStart: string | null;
  actualFinish: string | null;
  /**
   * Explicit remaining work in whole days for an in-progress activity (M2, ADR-0035 §2), or null to
   * derive it from `percentComplete`. The engine schedules this remaining from the data date (never
   * before it).
   */
  remainingDurationDays: number | null;
  /**
   * Suspend / resume calendar days (`YYYY-MM-DD`) for a paused in-progress activity (M2, ADR-0035 §4),
   * or null. A resume after the data date floors the remaining work at the resume day; a resume on or
   * before the data date is a no-op (the data-date floor governs).
   */
  suspendDate: string | null;
  resumeDate: string | null;
  /**
   * Expected-finish target (ADR-0035 §9, M4): when the plan's `useExpectedFinishDates` is on, an
   * incomplete activity's remaining work is resized so its early finish lands on this calendar day
   * (`YYYY-MM-DD`). Null = no target. Ignored when the option is off, the activity is complete, or it
   * has no duration (a milestone).
   */
  expectedFinish: string | null;
  // CPM output — engine-owned, null/false until computed by the CPM engine slice.
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  isCritical: boolean;
  isNearCritical: boolean;
  /**
   * Engine-owned (ADR-0035 §7): true when a mandatory pin (MANDATORY_START/FINISH) drove this
   * activity's start earlier than its logic-earliest — produced as pinned and flagged, never
   * repaired. False for every non-mandatory or non-conflicting activity.
   */
  constraintViolated: boolean;
  /**
   * Visual-Planning placement input (ADR-0033): the calendar day (`YYYY-MM-DD`) the planner
   * hand-placed this activity's start at, or null if unplaced. Feeds only the engine's
   * effective-Visual pass; ignored by the pure-network (early/late/float) pass.
   */
  visualStart: string | null;
  /**
   * Engine-owned effective-Visual output (ADR-0033): where the bar actually renders in `VISUAL`
   * mode — the placement if set, else the effective earliest after upstream pushes. `YYYY-MM-DD`,
   * null until first calculated.
   */
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
  /** Engine-owned (ADR-0033): true when the placement is earlier than the logic-earliest feasible start. */
  visualConflict: boolean;
  /** Engine-owned (ADR-0033): working-day offset of the placement from the early start (signed), or null. */
  visualDriftDays: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A repair the progress endpoint applied to keep a progress report self-consistent (M2, ADR-0035 §6).
 * The write still succeeds and the returned resource reflects the corrected value; this is the
 * machine-readable signal — surfaced in the response `meta.warnings` — that a field the caller sent
 * (or left implied) was overridden, so a client can tell "did exactly what you asked" from "we
 * adjusted one of your fields". `COMPLETE_WITHOUT_FINISH` → the finish was set to the data date;
 * `REMAINING_ON_COMPLETE` → the remaining duration was forced to zero.
 */
export type ProgressWarningCode = 'COMPLETE_WITHOUT_FINISH' | 'REMAINING_ON_COMPLETE';

export interface ProgressWarning {
  code: ProgressWarningCode;
  message: string;
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

/**
 * The calendar a relationship's lag is measured on (ADR-0036 §6) — the per-relationship
 * override of the P6 "calendar for scheduling relationship lag" setting. Kept in lock-step
 * with the API's Prisma `LagCalendarSource` enum. M1 lands the seam (default
 * `PROJECT_DEFAULT`, behaviour-preserving); M3 wires resolution + the 24-hour override.
 */
export const LAG_CALENDAR_SOURCES = [
  'PREDECESSOR',
  'SUCCESSOR',
  'TWENTY_FOUR_HOUR',
  'PROJECT_DEFAULT',
] as const;

export type LagCalendarSource = (typeof LAG_CALENDAR_SOURCES)[number];

/**
 * Canonical dependency-conflict messages (ADR-0021), shared so the same rejection reads
 * identically wherever it surfaces: the API throws them, and the web TSLD link-draw pre-check
 * shows them locally before the write. One voice — the client pre-check and the server 409/422
 * fallback are verbatim identical (UX_STANDARDS copy & tone).
 */
export const DEPENDENCY_CONFLICT_MESSAGES = {
  SELF: 'A dependency cannot link an activity to itself.',
  CYCLE: 'This dependency would create a cycle in the schedule.',
  DUPLICATE: 'A dependency of this type already exists between these activities.',
} as const;

/**
 * One entry in a batch lane-position write (TSLD M4): move activity `id` to `laneIndex`,
 * carrying the `version` it was read at for optimistic locking. The batch is all-or-nothing.
 */
export interface ActivityPositionInput {
  id: string;
  laneIndex: number;
  version: number;
}

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
  /**
   * The calendar the lag is measured on (ADR-0036 §6, M3). `PROJECT_DEFAULT` (the default)
   * and `PREDECESSOR`/`SUCCESSOR` all schedule the lag on the plan calendar today — the last
   * two are forward-wired for per-activity calendars (M5); only `TWENTY_FOUR_HOUR` is
   * distinct now, measuring the lag as **elapsed** time (e.g. concrete cure's 168h = 7 days).
   */
  lagCalendar: LagCalendarSource;
  predecessor: DependencyEndpoint;
  successor: DependencyEndpoint;
  /**
   * Engine-owned (ADR-0022): true when this edge is **driving** — its timing sets its
   * successor's early start, so it's the binding logic tie the TSLD highlights. Recomputed
   * on every recalculate; false until the plan is first calculated (or if the edge has slack).
   */
  isDriving: boolean;
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
 * `constraintViolationCount` is how many activities a mandatory pin drove into a broken relationship
 * (produce-and-flag, ADR-0035 §7); `constraintWarningCount` counts soft constraint warnings (today
 * the N15 case: a SNET dated before the data date). All dates are calendar days (`YYYY-MM-DD`).
 */
export interface PlanScheduleSummary {
  dataDate: string | null;
  projectFinish: string | null;
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  constraintViolationCount: number;
  constraintWarningCount: number;
}

/**
 * Working-day calendar weekly pattern as a 7-bit mask (M5, ADR-0024): bit 0 =
 * Monday … bit 6 = Sunday, a set bit meaning that weekday is worked. This is the
 * single cross-boundary source of truth for the mask semantics — the web weekday
 * toggle group binds to it and the API DTO validates against it. It mirrors the
 * engine's own constants in `apps/api/src/modules/schedule/engine/calendar.ts`
 * (the pure factory), which are kept in lock-step with the values here.
 */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** All seven weekdays worked — a 7-day calendar (equivalent to all-days-work). */
export const ALL_WEEKDAYS_MASK = 0b1111111; // 127
/** Monday–Friday — the seeded "Standard" pattern new plans default to. */
export const STANDARD_WEEKDAYS_MASK = 0b0011111; // 31
/** Inclusive valid range of a mask: ≥ 1 working weekday, ≤ 7 bits (matches the DB CHECK). */
export const MIN_WORKING_WEEKDAYS_MASK = 1;
export const MAX_WORKING_WEEKDAYS_MASK = 127;

/**
 * The name of the Mon–Fri calendar seeded once per organisation (on org create and
 * by the M5 backfill migration) and used as the default for new plans (ADR-0024).
 * The single source of truth shared by the seeder and the plan-create default.
 */
export const STANDARD_CALENDAR_NAME = 'Standard';

/**
 * Pure helpers for the {@link WEEKDAYS} bitmask. No runtime deps — safe to share
 * between web and api. Indices are 0 = Monday … 6 = Sunday, matching the bit order.
 */
export const WorkingWeekdays = {
  /** True when `mask` is a valid pattern: an integer in [1, 127] (≥ 1 day, ≤ 7 bits). */
  isValid(mask: number): boolean {
    return (
      Number.isInteger(mask) &&
      mask >= MIN_WORKING_WEEKDAYS_MASK &&
      mask <= MAX_WORKING_WEEKDAYS_MASK
    );
  },
  /** True when weekday `index` (0 = Monday … 6 = Sunday) is worked in `mask`. */
  has(mask: number, index: number): boolean {
    return ((mask >> index) & 1) === 1;
  },
  /** `mask` with weekday `index` flipped (kept within the 7-bit week). */
  toggle(mask: number, index: number): number {
    return (mask ^ (1 << index)) & ALL_WEEKDAYS_MASK;
  },
  /** The worked weekday indices (0 = Monday … 6 = Sunday), ascending. */
  toIndices(mask: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      if (((mask >> i) & 1) === 1) indices.push(i);
    }
    return indices;
  },
  /** Build a mask from weekday indices (0 = Monday … 6 = Sunday); out-of-range ignored. */
  fromIndices(indices: readonly number[]): number {
    let mask = 0;
    for (const i of indices) {
      if (i >= 0 && i < 7) mask |= 1 << i;
    }
    return mask;
  },
} as const;

/**
 * A working-day calendar (M5, ADR-0024) — an org-scoped, reusable library entry: a
 * weekly working pattern (a {@link WorkingWeekdays} bitmask) plus dated exceptions.
 * The list shape mirrors the other `*Summary` types; the embedded exceptions live
 * on {@link CalendarDetail} (the single-calendar read).
 */
export interface CalendarSummary {
  id: string;
  name: string;
  description: string | null;
  /** 7-bit weekly pattern (bit 0 = Monday … bit 6 = Sunday); see {@link WorkingWeekdays}. */
  workingWeekdays: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A dated override of a calendar's weekly default (M5, ADR-0024). `isWorking: false`
 * is a holiday (a normally-working day made non-working); `isWorking: true` a worked
 * exception (e.g. a worked Saturday). `date` is a calendar day (`YYYY-MM-DD`); the
 * optional `label` names it (e.g. "Christmas Day").
 */
export interface CalendarExceptionSummary {
  id: string;
  date: string;
  isWorking: boolean;
  label: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A calendar with its active exceptions embedded — the single-calendar (GET one) shape. */
export interface CalendarDetail extends CalendarSummary {
  exceptions: CalendarExceptionSummary[];
}

/**
 * A baseline — a named, frozen snapshot of a plan's schedule, the "plan of record"
 * a planner compares the live schedule against (M7, ADR-0025). At most one baseline
 * per plan is `isActive` (the comparison baseline). The denormalised fields
 * (`capturedAt`, `dataDate`, `capturedProjectFinish`, `activityCount`) let the list
 * panel render without loading the frozen activity rows. All dates are calendar days
 * (`YYYY-MM-DD`) except `capturedAt` (an ISO instant).
 */
export interface BaselineSummary {
  id: string;
  planId: string;
  name: string;
  /** Whether this is the plan's active comparison baseline (at most one per plan). */
  isActive: boolean;
  /** ISO instant the snapshot was frozen. */
  capturedAt: string;
  /** The plan's `plannedStart` at capture (`YYYY-MM-DD`), or null if it had none. */
  dataDate: string | null;
  /** The plan's latest inclusive finish at capture (`YYYY-MM-DD`), or null. */
  capturedProjectFinish: string | null;
  /** How many activity snapshots the baseline froze. */
  activityCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One activity's frozen snapshot inside a baseline (M7, ADR-0025) — a self-contained
 * copy of the activity's identity and captured CPM dates. `sourceActivityId` is the
 * id of the activity it was captured from (a plain correlation id — the live activity
 * may since have been edited or deleted). `baselineStart`/`baselineFinish` are the
 * captured early start/finish. All schedule dates are calendar days (`YYYY-MM-DD`).
 */
export interface BaselineActivitySnapshot {
  sourceActivityId: string;
  code: string | null;
  name: string;
  type: ActivityType;
  durationDays: number;
  baselineStart: string | null;
  baselineFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  isCritical: boolean;
}

/** A baseline with its frozen activity snapshots embedded — the single-baseline (GET one) shape. */
export interface BaselineDetail extends BaselineSummary {
  activities: BaselineActivitySnapshot[];
}

/**
 * One row of a plan's variance read model (M7, ADR-0025): a live activity compared to
 * its snapshot in the plan's **active** baseline, or a baselined activity that has
 * since been removed. Variance is in **working days** on the plan's calendar
 * (consistent with float/lag, ADR-0024), signed so that **positive = current later
 * than baseline (behind schedule)**; `floatVarianceDays` is `current − baseline`
 * total float (positive = more float now). `inBaseline` is false for an activity added
 * after capture (variance fields null); `removed` is true for a baselined activity no
 * longer present live (current fields null). All dates are calendar days (`YYYY-MM-DD`).
 */
export interface BaselineVarianceRow {
  /** The activity id — the live activity's id, or the baselined `sourceActivityId` for a removed row. */
  activityId: string;
  code: string | null;
  name: string;
  /** True when the activity existed in the active baseline. */
  inBaseline: boolean;
  /** True when a baselined activity is no longer a live activity (current fields null). */
  removed: boolean;
  currentStart: string | null;
  currentFinish: string | null;
  currentTotalFloat: number | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  baselineTotalFloat: number | null;
  /** Working-day variance (positive = later/behind); null when not comparable. */
  startVarianceDays: number | null;
  finishVarianceDays: number | null;
  /** `current − baseline` total float in days (positive = more float now); null when not comparable. */
  floatVarianceDays: number | null;
}

/**
 * The plan-level roll-up returned in the `meta` of the variance read (M7). `baselineId`
 * is null when the plan has no active baseline (the UI hides variance). `worstFinishSlipDays`
 * is the largest positive `finishVarianceDays` across comparable activities (null when
 * none is behind). Counts: activities finishing behind the baseline, added since capture,
 * and removed since capture.
 */
export interface PlanVarianceSummary {
  baselineId: string | null;
  baselineName: string | null;
  capturedAt: string | null;
  worstFinishSlipDays: number | null;
  behindCount: number;
  addedCount: number;
  removedCount: number;
}

/**
 * Plan edit-lock (ADR-0028) — the single-editor "pen". A plan is either free
 * (no active lease) or held by one user; `state` discriminates. The two
 * concurrency layers below it (optimistic `version` 409, plan advisory lock) are
 * unchanged — this is the human-facing coordination layer.
 */
export type PlanEditLockState =
  /** No active lease — the plan is editable by any Planner (`Start editing`). */
  | 'FREE'
  /** A live lease held by the caller (this user, possibly across tabs). */
  | 'HELD_BY_ME'
  /** A live lease held by another user. */
  | 'HELD_BY_OTHER'
  /** A lease exists but has expired (past its TTL) — reclaimable like FREE. */
  | 'EXPIRED';

/** The public profile of a lock holder / requester (never includes credentials). */
export interface PlanEditLockActor {
  id: string;
  name: string;
  email: string;
}

/**
 * A plan's edit-lock status — the shape returned by the lock endpoints and read
 * by the web to decide who holds the pen. Capability flags are resolved
 * server-side from the caller's permissions **and** the current lock state, so
 * the client never re-derives policy. `holder`/`requestedBy` are null when absent.
 * `graceEndsAt`/`expiresAt`/`heartbeatAt` are ISO instants; the client's
 * countdowns are advisory — the server is authoritative.
 */
export interface PlanEditLockStatus {
  planId: string;
  state: PlanEditLockState;
  /** The current lease holder, or null when FREE. */
  holder: PlanEditLockActor | null;
  /** When the current lease expires (ISO instant), or null when FREE. */
  expiresAt: string | null;
  /** The holder's last heartbeat (ISO instant), or null when FREE. */
  heartbeatAt: string | null;
  /** A pending peer request-control actor (Q-A), or null when none. */
  requestedBy: PlanEditLockActor | null;
  /** When a pending request's grace window elapses (ISO instant), or null. */
  graceEndsAt: string | null;
  /** The caller may acquire now (state FREE/EXPIRED and holds `plan:acquire_lock`). */
  canAcquire: boolean;
  /** The caller may request control of a live lock held by another (Q-A). */
  canRequest: boolean;
  /** The caller may take over *right now* (grace elapsed / holder inactive, or admin override). */
  canTakeOver: boolean;
  /** The caller may override immediately, skipping the grace handshake (`plan:override_lock`). */
  canOverride: boolean;
}

/**
 * Machine-readable reason on a **423 Locked** (`code: 'LOCKED'`) error (ADR-0028),
 * carried in the error `details`. Distinct from a 409 optimistic conflict.
 * - `PLAN_EDIT_LOCK_REQUIRED` — a structural write attempted without holding the pen.
 * - `PLAN_EDIT_LOCK_HELD` — acquire/take-over refused: another holds a live lease,
 *   or the peer grace window has not yet elapsed and the holder is still active.
 * - `PLAN_EDIT_LOCK_LOST` — the caller's lease was taken over or expired (heartbeat
 *   or write rejected); the client drops to read-only.
 */
export const PLAN_EDIT_LOCK_REASONS = [
  'PLAN_EDIT_LOCK_REQUIRED',
  'PLAN_EDIT_LOCK_HELD',
  'PLAN_EDIT_LOCK_LOST',
] as const;

export type PlanEditLockReason = (typeof PLAN_EDIT_LOCK_REASONS)[number];

/** The `details` payload on a 423 `LOCKED` error — the reason plus optional holder. */
export interface PlanEditLockErrorDetails {
  reason: PlanEditLockReason;
  /** Who currently holds the pen, when known (helps the UI say "Jane is editing"). */
  holder?: PlanEditLockActor | null;
}

export {};
