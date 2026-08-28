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
 * The recycle bin's page metadata: pagination, plus the retention period in force (ADR-0096).
 *
 * **The period is served, never assumed.** It is an operator override
 * (`RETENTION_HIERARCHY_DAYS`), so a client constant would make every "expires in N days" on the
 * screen wrong on any host that changed it — wrong silently, with nothing able to detect the drift.
 * Carrying it here costs one integer per page and makes the sentence true by construction.
 */
export interface DeletedItemsMeta extends PageMeta {
  /** Days a soft-deleted row is kept before it is permanently removed. */
  retentionDays: number;
  /** Whether the sweep is actually deleting yet — false while the countdown ships ahead of it. */
  retentionActive: boolean;
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
  /**
   * Whether **this server** will refuse an accept from an account whose address is unverified —
   * i.e. `AUTH_REQUIRE_EMAIL_VERIFICATION` (ADR-0074 M2/M5).
   *
   * **It is here because the client has no other way to know, and guessing broke the flow.** The
   * accept card first shipped refusing on `!user.emailVerified` alone; with enforcement **off**
   * every account is unverified, so the card told every invitee to confirm an address the server
   * did not care about and hid the Accept button behind it. That is ADR-0074's own rule broken by
   * ADR-0074: `emailVerified === false` is a client-side inference, not evidence of what the server
   * would do. Only the server knows, so the server says.
   *
   * Not a secret: it is a deployment policy the same server already discloses to anyone who
   * attempts a sign-in, and the reader holding this token is being asked to act on it.
   */
  requiresEmailVerification: boolean;
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

/**
 * How the CPM engine decides which activities are **critical** (M6, ADR-0035 §17–§20). `TOTAL_FLOAT`
 * (the P6 default) marks an activity critical when its total float ≤ the plan's `criticalFloatThresholdMinutes`;
 * `LONGEST_PATH` marks the contiguous chain of driving ties back from the latest-finishing activities.
 * Mirrors the API's Prisma `CriticalPathDefinition` enum (kept in lock-step).
 */
export type CriticalPathDefinition = 'TOTAL_FLOAT' | 'LONGEST_PATH';

/**
 * How the CPM engine measures total float (M6, ADR-0035 §18). `FINISH` (the P6 default) is late−early
 * finish; `START` is late−early start; `SMALLEST` is the lesser. They diverge only when an activity
 * runs on a different calendar from its neighbours or is progressed. Mirrors the API's Prisma
 * `TotalFloatMode` enum (kept in lock-step).
 */
export type TotalFloatMode = 'START' | 'FINISH' | 'SMALLEST';

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
   * Critical-path definition (M6, ADR-0035 §17): `TOTAL_FLOAT` (float ≤ threshold, default) or
   * `LONGEST_PATH` (the driving chain). Behaviour-preserving default `TOTAL_FLOAT`.
   */
  criticalPathDefinition: CriticalPathDefinition;
  /**
   * Total-float threshold in whole working days (M6, ADR-0035 §17): at/below this an activity is
   * critical under the `TOTAL_FLOAT` definition. Default 0 (P6/behaviour-preserving).
   */
  criticalFloatThresholdMinutes: number;
  /**
   * How total float is measured (M6, ADR-0035 §18): `FINISH` (default), `START`, or `SMALLEST`.
   * Behaviour-preserving default `FINISH`.
   */
  totalFloatMode: TotalFloatMode;
  /**
   * Make open-ended activities critical (M6, ADR-0035 §20): when true, every activity with no
   * predecessors or no successors is flagged critical, OR-ed with the definition. Default `false`.
   */
  makeOpenEndsCritical: boolean;
  /**
   * Resource-levelling opt-in switch (ADR-0041 §7). When true (and the plan has assignments), the
   * recalc runs the opt-in second levelling pass that resolves over-allocation into the engine-owned
   * `leveled_*` overlay. Default `false` is the PARITY gate: off ⇒ the pass never runs and the recalc
   * is byte-identical to today. Consumed by the L2 engine pass; dark in this L1 slice.
   */
  levelResources: boolean;
  /**
   * Level-within-float-only option (ADR-0041 §4, matching P6's off-by-default "level only within
   * float"). When true, levelling may delay an activity only WITHIN its total float (preserving the
   * project finish) and never extends the schedule; residual over-allocation is flagged, not resolved.
   * Default `false` (behaviour-preserving; only relevant when `levelResources` is on).
   */
  levelWithinFloatOnly: boolean;
  /**
   * Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4, M1). When true, the recalc
   * DROPS every activity's external early-start and late-finish bounds (relationships to/from other
   * projects), scheduling the plan on its own internal logic; internal constraints and logic are
   * untouched. Default `false` is the byte-parity path (a plan with no external data schedules identically
   * either way). Client-settable plan option, mirroring the other scheduling-option booleans.
   */
  ignoreExternalRelationships: boolean;
  /**
   * The Earned-Value EAC forecast method (EV1, ADR-0042, Q3). Client-settable plan option; default
   * `CPI` (P6's headline EAC = BAC / CPI). Read by the EV2 read module (a query param may override
   * per-request); dark in EV1 — nothing computes EV yet. Kept in lock-step with the Prisma `EacMethod`.
   */
  eacMethod: EacMethod;
  /**
   * The plan's ISO-4217 currency code (`AAA`, three upper-case letters) for all money columns (EV1,
   * ADR-0042, Q6). Client-settable; `null` = unset (inherit the org default at read time). Single
   * currency per plan (multi-currency/FX is out of scope). Money reads as minor units + this code.
   */
  currencyCode: string | null;
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
  | 'TASK'
  | 'START_MILESTONE'
  | 'FINISH_MILESTONE'
  | 'HAMMOCK'
  | 'LEVEL_OF_EFFORT'
  | 'WBS_SUMMARY'
  | 'RESOURCE_DEPENDENT';
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
  /**
   * Working days **on this activity's own calendar** (ADR-0068) — an eight-hour calendar counts 480
   * working minutes to the day, not 1440 — rounded from the stored minutes. Milestones are 0, and so
   * is anything shorter than half a day: read {@link ActivitySummary.durationMinutes} for the exact
   * value.
   */
  durationDays: number;
  /**
   * Working **minutes** — what is stored and what the CPM engine schedules on (ADR-0036). Exposed so
   * a sub-day duration can be read back exactly; without it a four-hour activity is only ever
   * visible as `durationDays: 0` (TECH_DEBT #78). The unit the authoring surface writes in
   * (ADR-0070).
   */
  durationMinutes: number;
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
   * External / inter-project dates (ADR-0043 / ADR-0035 §30, M1): imported commitments from ANOTHER
   * project, each a calendar day (`YYYY-MM-DD`) or null. `externalEarlyStart` is an SNET-shaped forward
   * LOWER bound (the earliest an upstream project hands this activity over); `externalLateFinish` an
   * FNLT-shaped backward UPPER bound (the latest a downstream project allows it to finish). Client-settable
   * definition fields (NOT engine-owned); either, both, or neither may be set. Soft bounds, never mandatory
   * pins — the engine clamps early start UP to / late finish DOWN to them, gated on the plan's
   * `ignoreExternalRelationships`, never setting `constraintViolated`. Null = no external bound (parity).
   */
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
  /**
   * The P6 duration type (ADR-0040, M7 rung 4): which of {Duration, Units, Units/Time} recomputes vs
   * holds when the planner edits another, keeping `Units = Duration × Units/Time` true. Client-settable
   * definition field (default `FIXED_DURATION_AND_UNITS_TIME`); the recompute is resolved server-side at
   * write time — the CPM engine reads the resulting duration.
   */
  durationType: DurationType;
  /**
   * The activity's own working-time calendar (ADR-0037, M5), or `null` to **inherit** the plan
   * default (resolution: activity → plan → all-days-work). When set, the activity's duration is
   * measured, its float counted, and its dates derived on this calendar — so e.g. a 24/7 crew
   * activity inside a 5-day plan works across weekends.
   */
  calendarId: string | null;
  /**
   * WBS parent (ADR-0038, M5-epic §24): the `id` of the `WBS_SUMMARY` activity this one rolls up into,
   * or null for a top-level activity. The parent tree is an adjacency list, kept acyclic and same-plan by
   * the service; it is orthogonal to the dependency DAG (ADR-0021). A `WBS_SUMMARY` activity's dates roll
   * up from its branch (engine work, F6).
   */
  parentId: string | null;
  /** Graphical y-lane for the TSLD canvas. */
  laneIndex: number;
  /**
   * Schedule As-Late-As-Possible (ADR-0035 §11): a display-only placement preference. When set, the
   * activity renders at its late-based position; it never changes early/late/float. False by default.
   */
  scheduleAsLateAsPossible: boolean;
  /**
   * Resource-levelling tie-break (ADR-0041 §1). LOWER = HIGHER priority: when two activities contend
   * for a capacity-constrained resource, the levelling pass places the lower `levelingPriority` first.
   * Client-settable Planner input (NOT engine-owned). `null` = unset (no expressed preference),
   * distinct from an explicit 0. Levelling-read only when the plan opts in; dark until L2.
   */
  levelingPriority: number | null;
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
   * The stored truth behind {@link ActivitySummary.remainingDurationDays}: explicit remaining work
   * in working **minutes** (ADR-0036), the unit the engine consumes. Read this rather than the day
   * field for a sub-day remainder — four hours reads back as `remainingDurationDays: 0`, which on an
   * incomplete activity is also the value meaning "no work left" (surface audit F3).
   */
  remainingDurationMinutes: number | null;
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
  /**
   * The %-complete measure that feeds Earned Value (EV1, ADR-0042). Client-settable definition field
   * (default `DURATION`, behaviour-preserving); selects which measure drives EV performance % —
   * `DURATION`, `UNITS`, or `PHYSICAL`. It NEVER changes a CPM date. Dark until the EV2 read reads it.
   */
  percentCompleteType: PercentCompleteType;
  /**
   * Hand-entered physical % complete (EV1, ADR-0042), used only when `percentCompleteType` is
   * `PHYSICAL`. Contributor progress input, integer 0–100, or `null` = unset (distinct from 0).
   */
  physicalPercentComplete: number | null;
  /**
   * How the activity's cost accrues across its span in the Earned-Value / cost read-model (M7 rung 5,
   * ADR-0044 / ADR-0035 §32). Client-settable definition field (default `UNIFORM`, byte-identical to
   * the pre-ADR-0044 PV time-phasing); `START` recognises the whole lump-sum at the start, `END` at the
   * finish, `UNIFORM` spreads it linearly. It changes only WHEN cost / Planned Value is recognised — it
   * NEVER changes a CPM date. A plain definition echo (not money) — always readable.
   */
  accrualType: AccrualType;
  /**
   * Activity-level expense amounts in minor currency units (EV1/EV4a, ADR-0042): the lump-sum
   * budgeted / actual cost carried directly on the activity (independent of resource-derived cost).
   * **Conditionally included (EV4a):** a real value is returned only when the caller holds `cost:read`
   * (Planner + Org Admin) in the activity's organisation; for every other caller (Viewer/Contributor)
   * these are `null` (fail-closed). A `null` therefore means EITHER unset OR caller-not-permitted — a
   * cost-reader distinguishes the two by role, an un-permitted caller never sees the amount at all.
   */
  budgetedExpense: number | null;
  actualExpense: number | null;
  // CPM output — engine-owned, null/false until computed by the CPM engine slice.
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  /**
   * Free float in working days (engine-owned, ADR-0035 §17–§20, M6-F1): how far the activity can slip
   * without delaying the early start of any successor. An open end (no successors) carries its total
   * float. Always ≤ `totalFloat`. Null until the plan is first calculated.
   */
  freeFloat: number | null;
  isCritical: boolean;
  isNearCritical: boolean;
  /**
   * Engine-owned (ADR-0035 §7): true when a mandatory pin (MANDATORY_START/FINISH) drove this
   * activity's start earlier than its logic-earliest — produced as pinned and flagged, never
   * repaired. False for every non-mandatory or non-conflicting activity.
   */
  constraintViolated: boolean;
  /**
   * Engine-owned (ADR-0043 M1 / ADR-0035 §30.3): true when an imported external bound drove this
   * activity's schedule this recalc — its external early-start was the binding forward bound, or its
   * external late-finish the binding backward bound. The per-activity companion to the plan-level
   * `externalDrivenCount`; the soft-bound analogue of `constraintViolated`, surfaced as an "External"
   * row badge. False for every activity with no binding external bound (and on the no-external path).
   */
  externalDriven: boolean;
  /**
   * Engine-owned (ADR-0035 §21, M5-epic): true when this Level-of-Effort activity has no resolvable
   * span — it is missing an SS predecessor or an FF successor — so the engine placed it at a defined
   * fallback and flagged it (N12 produce-and-flag), never rejecting. False for every non-LOE activity
   * and for an LOE with a complete span.
   */
  loeNoSpan: boolean;
  /**
   * Engine-owned (ADR-0035 §23 / ADR-0039, M7): true when this `RESOURCE_DEPENDENT` activity has no
   * driving resource assignment, so its driving calendar could not be resolved — the engine still
   * scheduled it (on the fallback calendar) and flagged it (produce-and-flag). False for every
   * non-resource-dependent activity and for a resource-dependent one with a driver.
   */
  resourceDriverMissing: boolean;
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
  // Resource-levelling overlay — engine-owned (ADR-0041 §3/§6 / Q2). The opt-in second levelling pass
  // (plan `levelResources`) runs AFTER the pure CPM network pass and produces these additive positions;
  // the pure early/late/float/critical are NOT recomputed on the leveled dates (network float stays
  // authoritative). Response-echo only — NEVER accepted from a create/update DTO. All null/false until
  // the plan opts in AND is first levelled.
  /** Engine-owned (ADR-0041 §3): the delayed start the levelling pass placed this activity at, or null. */
  leveledStart: string | null;
  /** Engine-owned (ADR-0041 §3): the delayed finish the levelling pass placed this activity at, or null. */
  leveledFinish: string | null;
  /** Engine-owned (ADR-0041 §3): the applied delay in whole working days (leveledStart − earlyStart), or null. */
  levelingDelayDays: number | null;
  /**
   * Engine-owned produce-and-flag (ADR-0041 §6, Q1): true when serialising pushed this activity PAST a
   * resource's availability window (the engine extends and flags, never hangs). False until levelled.
   */
  levelingWindowExceeded: boolean;
  /**
   * Engine-owned produce-and-flag (ADR-0041 §2): true when this activity's OWN single-activity demand
   * exceeds the resource capacity — a delay cannot fix it (reported, never resolved). False until levelled.
   */
  selfOverAllocated: boolean;
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
  SUMMARY_NO_LOGIC: 'A WBS summary carries no logic — it cannot be linked by a dependency.',
} as const;

/**
 * Canonical cross-plan-dependency conflict messages (inter-project M2, ADR-0045 §6, N31/N30/N33),
 * shared so the same rejection reads identically wherever it surfaces — the API throws them, and the
 * web cross-plan link editor shows them locally before the write. One voice (the sibling of
 * {@link DEPENDENCY_CONFLICT_MESSAGES} for the cross-plan edge).
 */
export const CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES = {
  SAME_PLAN:
    'A cross-plan link must join activities in two different plans — use a dependency for same-plan logic.',
  CYCLE: 'This cross-plan link would create a cycle between plans.',
  DUPLICATE: 'A cross-plan link of this type already exists between these activities.',
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
  /**
   * Signed working days on this edge's **lag calendar** (a lead is negative), rounded from the
   * stored minutes. A sub-day lag reads back as 0 here — read {@link DependencySummary.lagMinutes}
   * for the exact value.
   */
  lagDays: number;
  /**
   * Signed working **minutes** — what is stored and what the engine applies (ADR-0036). Exposed so a
   * sub-day lag (a two-hour cure before a follow-on trade) can be read back exactly, and the unit
   * the authoring surface writes in (ADR-0070).
   */
  lagMinutes: number;
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
 * A cross-plan dependency — a LIVE inter-project logic edge whose predecessor and successor
 * activities live in DIFFERENT plans of the SAME organisation (inter-project M2, ADR-0045 §1).
 * It mirrors {@link DependencySummary} but carries BOTH plan ids (denormalised) instead of a
 * single `planId`, and deliberately OMITS `isDriving`: the CPM engine never consumes cross-plan
 * edges (they are DERIVED above it — parity by construction), so there is no per-edge driving flag.
 * `lagDays` is a signed count of working days (a lead is negative).
 */
export interface CrossPlanDependencySummary {
  id: string;
  /** The plan the predecessor activity belongs to (the upstream plan). */
  predecessorPlanId: string;
  /** The plan the successor activity belongs to (the downstream plan — the edge's home, ADR-0045 CQ-2). */
  successorPlanId: string;
  type: DependencyType;
  lagDays: number;
  /** The calendar the lag is measured on (ADR-0036 §6) — identical semantics to a dependency's. */
  lagCalendar: LagCalendarSource;
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
  /**
   * The deletion this row was part of (ADR-0096). A cascade stamps ONE id on every row it touches
   * and `restoreBatch` keys the whole restore on that value, so rows sharing this id come back
   * together and are shown as one entry rather than as separate, separately-actionable rows.
   *
   * Null only for a row soft-deleted before the batch id existed.
   */
  deleteBatchId: string | null;
  /**
   * The still-deleted ancestor blocking this row's restore, or null when nothing blocks it.
   *
   * **Per row, not per group.** A descendant deleted in the SAME cascade also carries a blocker —
   * its own batch's root — because this is computed from the row's immediate parent. Reading it
   * per row rather than per group root re-creates exactly the "Restore its parent first" noise
   * ADR-0096 exists to remove: the group's root is the only row whose blocker is a real obstacle.
   *
   * `kind` is never `'plan'`: a plan has no hierarchy descendants, so it can block nothing.
   */
  blockedBy: DeletedItemBlocker | null;
}

/** The ancestor standing between a deleted row and its restore. See {@link DeletedHierarchyItem}. */
export interface DeletedItemBlocker {
  kind: 'client' | 'project';
  id: string;
  name: string;
  /** The blocker's OWN deletion, which is what a reader must restore — not this row's. */
  deleteBatchId: string | null;
}

/**
 * A plan's computed CPM schedule roll-up — the result of a recalculation and the
 * shape of the read summary (they return the identical type). `dataDate` is the
 * plan's start (`plannedStart`); it is null when the plan has no start date yet.
 * `projectFinish` is the latest computed finish across the plan (the max inclusive
 * `earlyFinish`); it is null until the plan has been calculated (or when empty).
 * `constraintViolationCount` is how many activities a mandatory pin drove into a broken relationship
 * (produce-and-flag, ADR-0035 §7); `constraintWarningCount` counts soft constraint warnings (today
 * the N15 case: a SNET dated before the data date); `loeNoSpanCount` counts Level-of-Effort activities
 * with no resolvable span (N12 produce-and-flag, ADR-0035 §21). All dates are calendar days
 * (`YYYY-MM-DD`).
 */
export interface PlanScheduleSummary {
  dataDate: string | null;
  projectFinish: string | null;
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  constraintViolationCount: number;
  constraintWarningCount: number;
  loeNoSpanCount: number;
  /**
   * How many `RESOURCE_DEPENDENT` activities had no driving resource assignment this run (ADR-0035 §23 /
   * ADR-0039) — produce-and-flag: they still schedule (on the fallback calendar) but are flagged. Zero
   * unless the plan has a resource-dependent activity with no driver.
   */
  resourceDriverMissingCount: number;
  /**
   * How many activities an external / inter-project bound DROVE this run (ADR-0043 / ADR-0035 §30) — its
   * external early start raised the early start above pure logic, or its external late finish clamped the
   * late finish below what logic could achieve. Observability only (mirrors `constraintViolationCount`);
   * an external bound is soft and never an error. **Engine-derived: only a recalculation populates it**
   * (M1 does not persist a per-activity external-driven flag), so the read summary reports 0. Zero when
   * the plan carries no external data or `ignoreExternalRelationships` is on.
   */
  externalDrivenCount: number;
  /**
   * Resource-levelling roll-up (ADR-0041 / ADR-0035 §28). `leveledActivityCount` is how many activities
   * the opt-in levelling pass delayed (`levelingDelay > 0`); `levelingWindowExceededCount` how many were
   * pushed past a resource's availability window (produce-and-flag, §6); `selfOverAllocatedCount` how many
   * carry an unfixable single-activity over-allocation (§2). All **0** when the plan does not level
   * (`levelResources` off) — the parity path never populates a leveled overlay.
   */
  leveledActivityCount: number;
  levelingWindowExceededCount: number;
  selfOverAllocatedCount: number;
  /**
   * The inclusive leveled project finish (`YYYY-MM-DD`) — the latest finish under levelling — or **null**
   * when the plan does not level (ADR-0041). Independent of `projectFinish`, which stays the pure-network
   * finish (the network layer is never recomputed, Q2).
   */
  leveledProjectFinish: string | null;
  /**
   * Cross-plan staleness (inter-project M2, ADR-0045 §5 / ADR-0035 §30.7). `true` iff any plan in this
   * plan's UPSTREAM cross-plan closure was recalculated more recently than this plan — its persisted
   * dates were derived against an older upstream schedule, so a **programme recalculate** is due.
   * **Computed on read** (pull; there is no background push job in M2). **Present ONLY for a plan with at
   * least one cross-plan edge; ABSENT (undefined) otherwise**, so an ordinary single-plan summary is
   * byte-identical to before M2.
   */
  scheduleStale?: boolean;
  /**
   * The ids of the upstream plans whose `schedule_computed_at` is newer than this plan's — the cross-plan
   * links driving {@link scheduleStale}. Empty when the plan has cross-plan edges but none is stale.
   * **Present ONLY for a plan with at least one cross-plan edge; ABSENT (undefined) otherwise** (paired
   * with {@link scheduleStale}).
   */
  staleUpstreamPlanIds?: string[];
}

/**
 * One plan's slot in a **programme recalculation** result (inter-project M2, ADR-0045 §4) — the plan id
 * paired with the single-plan {@link PlanScheduleSummary} the existing ADR-0022 recalc produced for it.
 * The `plans` array is ordered **upstream-first** (the target plan last), the same order the plans were
 * recalculated in.
 */
export interface ProgrammeSchedulePlanResult {
  planId: string;
  summary: PlanScheduleSummary;
}

/**
 * The result of a **programme recalculation** (`POST …/schedule/recalculate-programme`, ADR-0045 §4) — a
 * synchronous solve that recalculated the target plan's upstream cross-plan **closure** in topological
 * order (upstream-first) so the target's derived inter-project bounds (ADR-0045 §2) are fresh.
 *
 * `plans` carries one {@link ProgrammeSchedulePlanResult} per plan in the closure, in recalculation order
 * (the target is last). `programme` rolls the run up: `planCount` is the closure size (1 for a plan with no
 * cross-plan edges — a plain single-plan recalc); `crossPlanUpstreamMissingCount` sums the N32 warnings
 * across the closure (edges whose upstream had never been calculated, so they contributed no derived
 * bound — never an error, ADR-0035 §30.5 / N32).
 */
export interface ProgrammeScheduleResult {
  plans: ProgrammeSchedulePlanResult[];
  programme: {
    planCount: number;
    crossPlanUpstreamMissingCount: number;
  };
}

/**
 * The `details` payload on the **423 Locked** a programme recalculation raises when one or more plans in
 * the target's closure are held by another editor (ADR-0045 §4, Critical Question 3 — fail-fast, write
 * nothing). `reason` is stable; `blockedPlanIds` lists every closure plan whose pen is held (collected in
 * a single pre-flight pass, not one at a time), so the UI can offer to request/override the pen on each.
 */
export interface ProgrammeScheduleLockedDetails {
  reason: 'PROGRAMME_PLANS_LOCKED';
  blockedPlanIds: string[];
}

/**
 * One **float path** into a target activity (M6-F6, ADR-0035 §19): a maximal contiguous chain of
 * activities linked by logic, ranked by how much float it carries above the driving path. `index` 0
 * is the driving path (relative float 0); higher indices are increasingly floaty. `activityIds` are
 * **target-first** (the target … the chain's driving root). Relative float is the entry activity's
 * total float minus the target's; it can be **negative** when a branch is more critical than a
 * floating target (a real signal, not an error).
 *
 * The float figure is `relativeFloatMinutes`, and it is the only one. A day-denominated
 * `relativeFloat` sat beside it briefly, converted at a flat 1440 and marked deprecated; it was
 * **removed** rather than carried, because a field that returns a plausible wrong number is worse
 * than an absent one — `0` where the answer is one working day on an eight-hour calendar reads as
 * "on the driving path", which is a different claim entirely. Deprecation only helps a reader who
 * looks; deletion is checked by the compiler.
 */
export interface PlanFloatPath {
  index: number;
  /**
   * Working **minutes** of total float above the driving path — the engine's own figure, carried
   * through with no conversion. Path 0 is always 0; branch paths are non-decreasing. Convert for
   * display against the calendar you are presenting on (the target activity's, per the F4 decision),
   * never against a flat 1440.
   */
  relativeFloatMinutes: number;
  activityIds: string[];
}

/**
 * The ranked contiguous float paths into a target activity — a read-only CPM analysis over the
 * live-computed schedule (P6 "multiple float paths"). `targetActivityId` echoes the requested target;
 * `paths` is ordered by non-decreasing relative float, path 0 being the target's own driving chain,
 * bounded by the requested `maxPaths`.
 */
export interface PlanFloatPaths {
  targetActivityId: string;
  paths: PlanFloatPath[];
  /**
   * `true` when the analysis found more paths than `maxPaths` returned — so a reader can say "showing
   * the first N" honestly rather than implying the list is the whole network. Derived by asking the
   * engine for one more path than the caller wanted and checking whether it came back; the engine's
   * own return shape is unchanged.
   */
  hasMorePaths: boolean;
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
/**
 * Inclusive valid range of a mask: 0–127.
 *
 * There is **no database constraint behind this** and there is no `calendars.working_weekdays`
 * column either — ADR-0036's `calendar_shift_model` migration dropped both and moved the weekly
 * pattern into `calendar_shifts` rows. The mask is an API-layer convenience: materialised into
 * full-day shift rows on write, derived back from them on read. (The previous version of this
 * comment said "matches the DB CHECK", which sent the first reader looking for a migration to
 * write. Verify the claim; do not trust the document — ADR-0058.)
 *
 * **Zero is valid**, and that is not a relaxation — ADR-0036 §2 made a *window-only base week* (all
 * weekdays empty, all working time arriving from dated exception windows) a supported shape, and
 * said in as many words that the old "mask must be non-zero" guard was replaced by the engine's
 * `buildWorkingTimeCalendar` check. That check is strictly stronger: it counts the exceptions too,
 * so it can tell a turnaround calendar apart from a calendar on which nothing can ever happen,
 * which a mask alone cannot. The bound here stayed at 1 for a year after the rework said otherwise
 * (TECH_DEBT #79) — a leftover, not a decision.
 */
export const MIN_WORKING_WEEKDAYS_MASK = 0;
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
  /** True when `mask` is a valid pattern: an integer in [0, 127] (0 = window-only, ≤ 7 bits). */
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
  /**
   * The full-day `[0, 1440)` windows a mask is shorthand for — the ONE statement of what a
   * weekday mask means in the storage form the engine actually schedules on.
   *
   * Shared rather than restated: the API materialises a mask into shift rows on write and derives
   * it back on read, and the client needs the same mapping to show a mask-authored calendar beside
   * a shift-authored one. Two copies of this rule would disagree about a boundary exactly once,
   * in a calendar nobody looks at twice.
   */
  toFullDayShifts(mask: number): CalendarShift[] {
    return WorkingWeekdays.toIndices(mask).map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: MINUTES_PER_CALENDAR_DAY,
    }));
  },
} as const;

/** Minutes in a calendar day; `1440` is 24:00 — the exclusive end of a full-day window. */
export const MINUTES_PER_CALENDAR_DAY = 1440;

/**
 * The day↔minute factor a calendar carries when nobody has said otherwise (ADR-0068).
 *
 * `1440` is not a placeholder: it is the constant every service multiplied `durationDays` by
 * before the column existed, so a calendar left at this value behaves exactly as it always has.
 */
export const DEFAULT_HOURS_PER_DAY_MINUTES = MINUTES_PER_CALENDAR_DAY;

/**
 * A sensible standard working day for a weekly pattern — the **default** a calendar takes when its
 * shifts are written and no explicit hours-per-day is supplied (ADR-0068 §1).
 *
 * The rule is the **modal** daily working-minutes among days that work at all, ties broken toward
 * the **longest**. A 9h Mon–Thu with a 5h Friday derives 9h, which is what a P6 user would type.
 *
 * It is deliberately a default applied **once, at the write**, not a standing derivation: were it
 * evaluated on read, shortening one Friday would silently reinterpret the stored duration of every
 * activity on the calendar. And it has no answer for a **window-only** calendar (no shifts at all,
 * work coming only from positive exceptions) — every candidate rule yields 0, and `durationDays × 0`
 * zeroes the activity — so that case returns {@link DEFAULT_HOURS_PER_DAY_MINUTES} rather than a
 * number the data cannot support.
 */
export function deriveHoursPerDayMinutes(shifts: readonly CalendarShift[]): number {
  const perWeekday = new Map<number, number>();
  for (const shift of shifts) {
    const worked = shift.endMinute - shift.startMinute;
    if (worked <= 0) continue;
    perWeekday.set(shift.weekday, (perWeekday.get(shift.weekday) ?? 0) + worked);
  }
  if (perWeekday.size === 0) return DEFAULT_HOURS_PER_DAY_MINUTES;

  const counts = new Map<number, number>();
  for (const minutes of perWeekday.values()) {
    counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [minutes, count] of counts) {
    if (count > bestCount || (count === bestCount && minutes > best)) {
      best = minutes;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The tiers a calendar can belong to (ADR-0053 §1). `ORG` is the shared organisation
 * library — the only tier before ADR-0053, and still the default; `PROJECT` is local to
 * one project (listed and selectable only within it), so a one-off shutdown calendar
 * never pollutes shared tenant state. MUST stay in lock-step with the API's Prisma
 * `CalendarScope` enum (the house rule); the DB pins the pairing with `project_id` via
 * the fail-closed `ck_calendars_scope_parent` CHECK.
 */
export const CALENDAR_SCOPES = ['ORG', 'PROJECT'] as const;

/** Which tier a calendar belongs to — see {@link CALENDAR_SCOPES}. */
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

/**
 * How a library list treats **archived** rows (ADR-0053 §4) — shared by the calendar and
 * resource libraries so "Show archived" means one thing everywhere. `exclude` is the default
 * on every list and every picker, so today's result set (nothing is archived) is preserved
 * byte-for-byte. Like the calendar `scope` filter this is a **usability** control, never an
 * authorisation boundary: the security control is the write-time reject.
 */
export const ARCHIVED_FILTERS = ['exclude', 'include', 'only'] as const;

/** How a library list treats archived rows — see {@link ARCHIVED_FILTERS}. */
export type ArchivedFilter = (typeof ARCHIVED_FILTERS)[number];

/**
 * Maximum length of a library search term (`?q=`, ADR-0053 §4 / US-8). Bounds the
 * case-insensitive `contains` predicate the server runs against `name` (and `code` for
 * resources) so a pathological term cannot turn a bounded scan into an expensive one.
 */
export const LIBRARY_SEARCH_MAX_LENGTH = 100;

/**
 * One working window inside a day (ADR-0036 §2) — minutes from local midnight, `[start, end)`.
 * `1440` is 24:00 (a window running to midnight), never a wrap: a night shift crossing midnight
 * is **two adjacent-day windows**, so 20:00–06:00 is `1200–1440` on one day plus `0–360` on the
 * next.
 */
export interface CalendarWindow {
  startMinute: number;
  endMinute: number;
}

/** One window of the weekly pattern — a {@link CalendarWindow} on a weekday (0 = Monday). */
export interface CalendarShift extends CalendarWindow {
  weekday: number;
}

/**
 * A working-day calendar (M5, ADR-0024) — a reusable library entry: a weekly working
 * pattern (a {@link WorkingWeekdays} bitmask) plus dated exceptions. Since ADR-0053 a
 * calendar sits in one of two tiers ({@link CalendarScope}): the shared organisation
 * library, or one project. The list shape mirrors the other `*Summary` types; the
 * embedded exceptions live on {@link CalendarDetail} (the single-calendar read).
 */
export interface CalendarSummary {
  id: string;
  name: string;
  description: string | null;
  /**
   * 7-bit weekly pattern (bit 0 = Monday … bit 6 = Sunday); see {@link WorkingWeekdays}.
   * **Derived** from {@link CalendarSummary.shifts} — it can only say whether a weekday works
   * at all, so a split shift or a half-day Friday is visible only in `shifts`.
   */
  workingWeekdays: number;
  /** The weekly pattern as stored: explicit intraday windows (ADR-0036 §2). */
  shifts: CalendarShift[];
  /**
   * This calendar's **standard working day**, in hours (P6 `day_hr_cnt`; ADR-0068). It is the
   * day↔minute factor for every day-denominated field measured on this calendar — a
   * `durationDays` of 1 is `hoursPerDay × 60` working minutes, not always 1440.
   *
   * May be fractional (7.5). Read {@link CalendarSummary.hoursPerDayMinutes} for the stored value:
   * this one is derived from it and can round, exactly as `durationDays` does beside
   * `durationMinutes`.
   */
  hoursPerDay: number;
  /** The stored truth behind {@link CalendarSummary.hoursPerDay}. `1440` is a 24-hour day. */
  hoursPerDayMinutes: number;
  /** Which tier this calendar belongs to (ADR-0053 §1). */
  scope: CalendarScope;
  /** The owning project when `scope` is `PROJECT`; `null` for an `ORG` calendar. */
  projectId: string | null;
  /**
   * When this calendar was **archived** (ADR-0053 §4) — retired from pickers while every
   * existing plan/activity/resource binding stays live and keeps scheduling exactly as before.
   * `null` = active. Orthogonal to soft delete: archiving is deliberately **not** blocked by
   * use, which is the only way to retire a calendar `CALENDAR_IN_USE` correctly refuses to
   * delete. **Never read by the CPM engine.**
   */
  archivedAt: string | null;
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
  /** First calendar day of the exception (`YYYY-MM-DD`). */
  date: string;
  /**
   * Last calendar day, inclusive. Storage has always held a range (ADR-0036 §2) and both write
   * paths now author one, so a shutdown or a Christmas fortnight is **one** exception rather than
   * fourteen (surface audit F2). Equals {@link CalendarExceptionSummary.date} for a single day.
   */
  endDate: string;
  /**
   * `false` = holiday, `true` = worked. **Derived** from {@link CalendarExceptionSummary.windows}
   * — a day works iff it has any window — so it can only say whether the day works at all. A
   * half-day is visible only in `windows`.
   */
  isWorking: boolean;
  /** The hours this day actually works, as stored. Empty for a holiday. */
  windows: CalendarWindow[];
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
 * Human messages for the calendar-scope rejections (ADR-0053 §2), shared client↔server like
 * {@link RESOURCE_ERROR} so the same rejection reads identically wherever it surfaces. The key
 * is the machine-readable reason carried in a domain error's `details.reason`; the value is the
 * human message. A cross-org / deleted / unknown calendar id is deliberately NOT here — it stays
 * an ordinary 404 "Calendar not found." so the tier never becomes a cross-tenant existence oracle.
 */
export const CALENDAR_ERROR = {
  /** A PROJECT-scoped calendar was assigned outside its owning project (→ 422). */
  CALENDAR_WRONG_SCOPE: 'This calendar belongs to another project and can’t be used here.',
  /**
   * A PROJECT-scoped calendar was assigned to a RESOURCE (→ 422). The resource pool is
   * org-global (ADR-0039), so an org-global resource may only hold an org-global calendar.
   */
  RESOURCE_REQUIRES_ORG_CALENDAR: 'A resource can only use an organisation-wide calendar.',
  /**
   * Narrowing an ORG calendar to one project while active plans/activities outside that project
   * — or any active resource — still reference it (→ 409). Widening is always safe and never
   * blocked; the per-class counts ride in `details`.
   */
  CALENDAR_SCOPE_NARROWING_BLOCKED:
    'This calendar is still used outside the project you are narrowing it to.',
  /** `scope: PROJECT` needs a `projectId`, and `scope: ORG` forbids one (→ 422). */
  CALENDAR_SCOPE_PROJECT_MISMATCH:
    'A project calendar must name the project it belongs to, and an organisation calendar must not name one.',
  /**
   * An **archived** calendar was bound to a plan, an activity or a resource (→ 422, ADR-0053 §4).
   * Archiving retires a calendar from pickers; every EXISTING binding stays live and keeps
   * scheduling, so only a **new** binding is refused. Unarchive it to use it again.
   */
  CALENDAR_ARCHIVED: 'This calendar is archived. Unarchive it to use it again.',
} as const;

/** A machine-readable calendar-scope error reason (a key of {@link CALENDAR_ERROR}). */
export type CalendarErrorReason = keyof typeof CALENDAR_ERROR;

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

/**
 * The kind of a resource (M7.1, ADR-0039). LABOUR = a crew / trade; EQUIPMENT =
 * plant / machinery (the conformance fixture's NONLABOUR maps here); MATERIAL = a
 * consumable quantity (concrete m³, steel te). Kept in lock-step with the API's
 * Prisma `ResourceKind` enum. A MATERIAL resource may be assigned to an activity but
 * may NEVER be the driving resource of its dates (see {@link RESOURCE_ERROR}).
 *
 * `GROUP` (ADR-0053 §3, library-scoping M3) is the odd one out: it is **not a resource** but a
 * non-assignable **grouping node** in the resource tree ({@link ResourceSummary.parentId}). It
 * carries no calendar, no capacity ceiling and no cost rate (a same-row DB CHECK enforces that),
 * and may never be assigned to an activity — which is exactly why the levelling pass, the
 * histogram and the Earned-Value read-model cannot see it: they all start from *assignments*.
 * Use {@link ASSIGNABLE_RESOURCE_KINDS} wherever a picker offers "a resource to assign".
 */
export const RESOURCE_KINDS = ['LABOUR', 'EQUIPMENT', 'MATERIAL', 'GROUP'] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * The resource kinds that may actually be assigned to an activity (ADR-0053 §3) — every kind
 * except the `GROUP` grouping node. Exported so a picker filters on the invariant rather than
 * re-spelling `kind !== 'GROUP'` in each surface (the API rejects a GROUP assignment with 422
 * `GROUP_NOT_ASSIGNABLE` regardless — this is the usability half).
 */
export const ASSIGNABLE_RESOURCE_KINDS = RESOURCE_KINDS.filter(
  (kind): kind is Exclude<ResourceKind, 'GROUP'> => kind !== 'GROUP',
);

/** A resource kind that can be assigned to an activity — see {@link ASSIGNABLE_RESOURCE_KINDS}. */
export type AssignableResourceKind = Exclude<ResourceKind, 'GROUP'>;

/**
 * The maximum depth of the resource tree (ADR-0053 §3): a resource may sit at most this many
 * `parentId` hops below a top-level node. Bounds the service's ancestor walk and keeps a picker
 * legible; exceeding it is a 422 `RESOURCE_TREE_TOO_DEEP`. Shared so the web can warn before the
 * round-trip rather than duplicating the number.
 */
export const RESOURCE_TREE_MAX_DEPTH = 10;

/**
 * The P6 duration type of an activity (M7 rung 4, ADR-0040). It names which of the triad
 * {Duration, Units, Units/Time} is **recomputed** (and which held) when a planner edits
 * another, keeping the identity `Units = Duration × Units/Time` true: with
 * `FIXED_DURATION_AND_UNITS_TIME` (the **default**) duration & rate are held and units
 * absorb; `FIXED_DURATION_AND_UNITS` holds duration & units and rate absorbs; `FIXED_UNITS`
 * holds units so **duration derives** on a rate edit; `FIXED_UNITS_TIME` holds rate so
 * **duration derives** on a units edit. Const-array source-of-truth (like
 * {@link RESOURCE_KINDS}) kept in lock-step with the API's Prisma `DurationType` enum; the
 * recompute is a service-boundary concern, the CPM engine reads the resolved duration.
 */
export const DURATION_TYPES = [
  'FIXED_DURATION_AND_UNITS_TIME',
  'FIXED_DURATION_AND_UNITS',
  'FIXED_UNITS',
  'FIXED_UNITS_TIME',
] as const;

export type DurationType = (typeof DURATION_TYPES)[number];

/**
 * Which quantity of the `Units = Duration × Units/Time` triad a planner edited (M7 rung 4,
 * ADR-0040). The write path names the edited field so the service holds it and recomputes the
 * dependent per the activity's {@link DurationType}: `DURATION` (activity duration edit), `UNITS`
 * (a driving assignment's `budgetedUnits`), or `UNITS_PER_HOUR` (its rate). Shared so the API DTOs
 * and the client-side recompute preview agree on one vocabulary.
 */
export const EDITED_FIELDS = ['DURATION', 'UNITS', 'UNITS_PER_HOUR'] as const;

export type EditedField = (typeof EDITED_FIELDS)[number];

/**
 * The %-complete measure that feeds Earned Value for an activity (EV1, ADR-0042 / ADR-0035 §29).
 * `DURATION` (default, behaviour-preserving — today's `percentComplete` is duration-based) derives EV
 * performance % from elapsed vs total working time; `UNITS` from actual vs budgeted work
 * (`actualUnits / budgetedUnits`); `PHYSICAL` from the hand-entered `physicalPercentComplete`. It
 * selects the EV performance measure ONLY — it NEVER changes a CPM date. Const-array source-of-truth
 * (like {@link DURATION_TYPES}) kept in lock-step with the API's Prisma `PercentCompleteType` enum.
 */
export const PERCENT_COMPLETE_TYPES = ['DURATION', 'UNITS', 'PHYSICAL'] as const;

export type PercentCompleteType = (typeof PERCENT_COMPLETE_TYPES)[number];

/**
 * The Estimate-at-Completion forecast method a plan's EV read uses (EV1, ADR-0042 / ADR-0035 §29, Q3).
 * `CPI` (default, P6's "typical/performance-factor" EAC = BAC / CPI); `REMAINING_AT_BUDGET` (the
 * "atypical" EAC = AC + (BAC − EV)); `CPI_TIMES_SPI` (schedule-and-cost adjusted EAC = AC + (BAC − EV) /
 * (CPI × SPI)). Read by the EV2 read module; dark in EV1. Const-array source-of-truth kept in lock-step
 * with the API's Prisma `EacMethod` enum.
 */
export const EAC_METHODS = ['CPI', 'REMAINING_AT_BUDGET', 'CPI_TIMES_SPI'] as const;

export type EacMethod = (typeof EAC_METHODS)[number];

/**
 * How an activity's cost **accrues** across its span in the Earned-Value / cost read-model (M7 rung 5,
 * ADR-0044 / ADR-0035 §32). It changes only **when** cost/Planned Value is recognised — never a CPM
 * date. `START` recognises the whole lump-sum at the activity start (e.g. a mobilisation charge);
 * `END` at the finish (e.g. retention); `UNIFORM` (default) spreads it linearly across the working
 * span — exactly today's PV time-phasing, so `UNIFORM` is byte-identical to the pre-ADR-0044 read.
 * Const-array source-of-truth kept in lock-step with the API's Prisma `AccrualType` enum.
 */
export const ACCRUAL_TYPES = ['START', 'UNIFORM', 'END'] as const;

export type AccrualType = (typeof ACCRUAL_TYPES)[number];

/**
 * The named P6 resource **loading curve** a resource assignment's `budgetedUnits` is distributed by
 * across the activity's span in the resource-histogram read-model (M7 rung 5, ADR-0044 §3 / ADR-0035
 * §31). It shapes only the units-over-time **histogram** — it moves no CPM date, owns no engine column,
 * and does NOT feed the levelling pass this rung (Q2). `UNIFORM` (default) is a **flat** load — exactly
 * a flat-rate distribution, so an assignment with no curve reads byte-identically; `BELL` peaks mid-span;
 * `FRONT_LOADED`/`BACK_LOADED` weight the early/late span; `DOUBLE_PEAK` has two humps. The 21-point
 * profile constants live in the API's pure `resource-histogram.ts` read-model, not here. Const-array
 * source-of-truth kept in lock-step with the API's Prisma `ResourceCurveType` enum.
 */
export const RESOURCE_CURVE_TYPES = [
  'UNIFORM',
  'BELL',
  'FRONT_LOADED',
  'BACK_LOADED',
  'DOUBLE_PEAK',
] as const;

export type ResourceCurveType = (typeof RESOURCE_CURVE_TYPES)[number];

/**
 * The P6 Earned-Value metric set for one level of the read-model (EV2, ADR-0042 / ADR-0035 §29) —
 * an activity, a WBS summary, or the plan total. Money fields are **integer minor units** in the
 * plan's {@link PlanEarnedValue.currencyCode}; the index ratios (`spi`/`cpi`/`tcpi`) are 4-dp floats,
 * `null` when their divisor is zero (the divide-by-zero sentinel — never `Infinity`). `eac` is always
 * defined (its guards fall back to the atypical `AC + (BAC − EV)` forecast). Kept in lock-step with the
 * API's pure `earned-value.ts` compute module (`EvMetrics`).
 */
export interface EarnedValueMetrics {
  /** Budget at Completion (minor units). */
  bac: number;
  /** Planned Value / BCWS (minor units), time-phased to the data date. */
  pv: number;
  /** Earned Value / BCWP (minor units) = `BAC × performance %`. */
  ev: number;
  /** Actual Cost / ACWP (minor units). */
  ac: number;
  /** Schedule Variance `EV − PV` (minor units). */
  sv: number;
  /** Cost Variance `EV − AC` (minor units). */
  cv: number;
  /** Schedule Performance Index `EV / PV`; `null` when PV = 0. */
  spi: number | null;
  /** Cost Performance Index `EV / AC`; `null` when AC = 0. */
  cpi: number | null;
  /** Estimate at Completion (minor units), per the plan's {@link PlanEarnedValue.eacMethod}. */
  eac: number;
  /** Estimate to Complete `EAC − AC` (minor units). */
  etc: number;
  /** To-Complete Performance Index `(BAC − EV) / (BAC − AC)`; `null` when `BAC = AC`. */
  tcpi: number | null;
  /** Variance at Completion `BAC − EAC` (minor units). */
  vac: number;
}

/**
 * One activity's Earned-Value row (EV2, ADR-0042): the {@link EarnedValueMetrics} set plus its id and
 * the performance % that earned its EV (a leaf's schedule/units/physical measure; a WBS summary's
 * rolled `EV / BAC × 100`). Every non-deleted activity — including WBS summaries — appears in
 * {@link PlanEarnedValue.activities}.
 */
export interface EarnedValueActivity extends EarnedValueMetrics {
  activityId: string;
  /** The performance % (0–100) that earned this row's EV. */
  performancePercent: number;
}

/**
 * Upper bound for **integer minor-unit money** DTO fields (activity `budgetedExpense`/`actualExpense`,
 * assignment `budgetedCost`/`actualCost`; ADR-0042). Stored as `BIGINT` but read across the wire via
 * `Number(bigint)`, so the binding ceiling is `Number.MAX_SAFE_INTEGER` (2⁵³−1) — the point below which
 * that conversion is lossless. A value above it is rejected 422 rather than silently losing precision
 * (TECH_DEBT #40a). Well under the `BIGINT` overflow point.
 */
export const MONEY_MINOR_UNITS_MAX = Number.MAX_SAFE_INTEGER;

/**
 * Upper bound for **`Decimal(18,4)`** numeric DTO fields (resource `costPerUnit`/`maxUnitsPerHour`,
 * assignment `budgetedUnits`/`unitsPerHour`/`actualUnits`; ADR-0039/0040/0042). The column holds 14
 * integer digits, so a larger value overflows the column (an opaque 500) — this ceiling rejects it 422
 * first (TECH_DEBT #40a). Conservative: the whole-number column capacity, exactly representable as a
 * JS number (excludes only the top fractional `.9999`).
 */
export const DECIMAL_18_4_MAX = 99_999_999_999_999;

/**
 * Upper bound for the **per-assignment lag** in working minutes (`ResourceAssignmentSummary.lagMinutes`,
 * ADR-0071 §1). ≈ 10 years — deliberately the same magnitude as the dependency-lag and critical-float
 * ceilings, so the contract gives ONE answer to "how large may a working-minute quantity be" rather
 * than three. The DTO's `@Min(0)`/`@Max` is the primary reject (N34); the DB CHECK is defence in depth.
 */
export const ASSIGNMENT_LAG_MINUTES_MAX = 5_256_000;

/**
 * The plan's Earned-Value analysis read-model (EV2, ADR-0042 §2) — the wire shape the
 * `GET …/schedule/earned-value` endpoint returns (a later rung wires it). A pure read over the live
 * schedule + cost/%-complete inputs as of `dataDate`; it schedules nothing and persists nothing.
 * `costBaselineMissing` flags that PV fell back to the live budget (no active cost baseline). Money is
 * integer minor units in `currencyCode` (null = inherit the org default).
 */
export interface PlanEarnedValue {
  /** The EV status date (`YYYY-MM-DD`); null when the plan has no data date. */
  dataDate: string | null;
  /** The EAC forecast method used for every level. */
  eacMethod: EacMethod;
  /** The plan's ISO-4217 currency code; null = inherit the org default. */
  currencyCode: string | null;
  /** True when any leaf activity lacked a cost-baseline budget (PV used the live-budget fallback). */
  costBaselineMissing: boolean;
  /**
   * The count of leaf activities showing booked actual cost/units while apparently not started
   * (ADR-0035 §29, N24) — a read-time data-quality WARNING, never a reject.
   */
  costWarningCount: number;
  /**
   * Leaf activities whose PV was time-phased **per cost component** because at least one assignment
   * joins late (ADR-0071 §1). `0` on every plan with no lag — and that is the parity signal: a
   * non-zero count is the only way the component sum was reached at all, since the zero-lag path takes
   * the previous single-window expression verbatim.
   */
  costPhasingLaggedCount: number;
  /**
   * Of those, the leaf activities whose component split was **approximated from the live budget mix**
   * because the plan's active cost baseline was captured before ADR-0025's second amendment froze
   * per-assignment cost — and cannot be back-filled, since a breakdown that was never recorded is not
   * recoverable from a total (ADR-0071 CQ-1). Always `≤ costPhasingLaggedCount`; `0` when there is no
   * cost baseline (a live-budget PV has nothing to approximate) and when every baseline in play
   * carries its own components. Re-capturing the baseline is what clears it.
   */
  costPhasingApproximatedCount: number;
  /**
   * The count of leaf activities whose progress steps are all zero-weight (M7 rung 5, ADR-0044 §33,
   * N27) — so the weighted-mean rollup fell back to the manual `physicalPercentComplete`. A read-time
   * data-quality WARNING, never a reject (the resolver never divides by zero); mirrors
   * {@link costWarningCount}.
   */
  stepWeightZeroCount: number;
  /** Per-activity rows (incl. WBS summaries), in plan order. */
  activities: EarnedValueActivity[];
  /** The plan-total metric set (the sum over top-level rows). */
  total: EarnedValueMetrics;
}

/**
 * The time-bucket granularity a resource histogram is aggregated at (M7 rung 5, ADR-0044 §3 /
 * ADR-0035 §31). Buckets are calendar-date periods spanning the plan's assignment date range; each
 * assignment's curve-shaped units are distributed into them by working-time overlap on the activity's
 * own calendar (ADR-0037).
 */
export const HISTOGRAM_GRANULARITIES = ['DAY', 'WEEK', 'MONTH'] as const;

export type HistogramGranularity = (typeof HISTOGRAM_GRANULARITIES)[number];

/**
 * One time bucket on the shared histogram axis (M7 rung 5, ADR-0044 §3). `start` is inclusive, `end`
 * exclusive (`= the next bucket's start`), both `YYYY-MM-DD`. Every {@link ResourceHistogramSeries}
 * aligns its `values` index-for-index to this axis.
 */
export interface ResourceHistogramBucket {
  start: string;
  end: string;
}

/**
 * One resource's units-over-time series (M7 rung 5, ADR-0044 §3 / ADR-0035 §31): `values[i]` is the
 * curve-shaped `budgetedUnits` this resource is loaded with in bucket `i` (exact quantity, `>= 0`),
 * aligned to {@link ResourceHistogram.buckets}. `total` is the resource's whole distributed load
 * (`Σ values`, equal to the sum of its assignments' `budgetedUnits` — units are conserved).
 */
export interface ResourceHistogramSeries {
  resourceId: string;
  values: number[];
  total: number;
}

/**
 * A plan's **resource loading histogram** (M7 rung 5, ADR-0044 §3 / ADR-0035 §31) — the shape the
 * `schedule:read`-gated `GET …/schedule/resource-histogram` endpoint returns as its `data`. A pure
 * read-model over the persisted CPM dates + each assignment's `curveType`; it schedules nothing, moves
 * no date, is NOT cost data (so it is `schedule:read`, not `cost:read`, Q5), and does not feed the
 * levelling pass (Q2). `buckets` is the shared time axis; `series` carries one units-over-time row per
 * loaded resource. `curveNormalisedCount` (also mirrored into the response `meta`) counts assignments
 * whose curve profile did not sum to 100 and was normalised to conserve units (N29).
 */
export interface ResourceHistogram {
  granularity: HistogramGranularity;
  buckets: ResourceHistogramBucket[];
  series: ResourceHistogramSeries[];
  curveNormalisedCount: number;
}

/**
 * A resource in the org-scoped resource library (M7.1, ADR-0039) — a reusable
 * sibling of the calendar library. The list/detail shape mirrors the other
 * `*Summary` types. `code` is an optional natural-key handle (unique per org among
 * active rows). `calendarId` is the resource's own working-time calendar — null
 * inherits the plan calendar at schedule time.
 */
export interface ResourceSummary {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  kind: ResourceKind;
  /**
   * The parent `GROUP` in the resource tree (adjacency list, ADR-0053 §3 — the ADR-0038 WBS
   * precedent). `null` = a top-level node. Only a `GROUP` may be a parent, and the tree is
   * acyclic, same-org and at most {@link RESOURCE_TREE_MAX_DEPTH} deep — service invariants, so
   * a client may nest the flat list safely. **Never read by the CPM engine, the levelling pass
   * or the EV read-model** — the pool stays one flat org-global pool for scheduling purposes.
   */
  parentId: string | null;
  calendarId: string | null;
  /**
   * Capacity ceiling — the maximum units of this resource available per working hour (ADR-0041 §2).
   * Client-settable Planner input; `null` = uncapped (no ceiling). Read by the L2 levelling pass when
   * the plan opts in; dark until L2.
   */
  maxUnitsPerHour: number | null;
  /**
   * The resource's cost rate — money per unit of work, in minor currency units (EV1/EV4a, ADR-0042).
   * **Conditionally included (EV4a):** a real value is returned only when the caller holds `cost:read`
   * (Planner + Org Admin) in the resource's organisation; for every other caller (Viewer/Contributor)
   * this is `null` (fail-closed). A `null` therefore means EITHER unset (no cost rate) OR
   * caller-not-permitted.
   */
  costPerUnit: number | null;
  /**
   * When this resource was **archived** (ADR-0053 §4) — retired from pickers while every
   * existing assignment stays live and keeps scheduling, levelling, loading the histogram and
   * earning value **exactly as before**. `null` = active. Orthogonal to soft delete: a
   * soft-deleted resource cannot be referenced by an active assignment (`RESOURCE_IN_USE`),
   * which is precisely what archive must allow. Only **new** assignments are rejected (422
   * `RESOURCE_ARCHIVED`). **Never read by the CPM engine, the levelling pass or the EV
   * read-model.**
   */
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A resource assignment tying an activity to a resource with a budgeted quantity
 * (M7.1, ADR-0039). `budgetedUnits` is an exact quantity carried as a `number` in the
 * API (the DB stores `DECIMAL(18,4)`; `>= 0`, N14). `isDriving` designates THE driving
 * resource of a RESOURCE_DEPENDENT activity — at most one per activity, and a MATERIAL
 * resource may never drive. `unitsPerHour` (M7 rung 4, ADR-0040) is the planned **rate**
 * (units of work per working hour) — the `Units/Time` term of the triad
 * `Units = Duration × Units/Time`; a `number` in the API (`DECIMAL(18,4)`; `>= 0`, N19),
 * or `null` when no rate is set (the triad is inert — parity). Only the driving assignment
 * participates in the triad.
 */
export interface ResourceAssignmentSummary {
  id: string;
  activityId: string;
  resourceId: string;
  budgetedUnits: number;
  unitsPerHour: number | null;
  isDriving: boolean;
  /**
   * The named P6 loading **curve** (M7 rung 5, ADR-0044 §3 / ADR-0035 §31) the resource-histogram
   * read-model distributes this assignment's `budgetedUnits` by across the activity span. `UNIFORM`
   * (default) is a flat load; it shapes only the histogram — no CPM date, no levelling. Always present.
   */
  curveType: ResourceCurveType;
  /**
   * The delay in working **minutes** between the activity starting and THIS resource joining it
   * (ADR-0071 §1, ADR-0035 §34). Measured on the **activity's own** calendar (ADR-0037) — the lag eats
   * INTO the activity: the activity's dates do not move, the resource joins late and works a shorter
   * window. Unsigned (a resource cannot join before the work starts, so a lead has no meaning here —
   * deliberately unlike a dependency's signed lag). `0` (the default) means the resource joins with the
   * activity, which is every existing assignment. **Always present, never cost-gated** — a lag is a
   * scheduling fact, not money, so a Viewer reads a real value while `budgetedCost`/`actualCost` are null.
   */
  lagMinutes: number;
  /**
   * Quantity of work actually done (EV1, ADR-0042), feeding the UNITS performance %. An exact quantity
   * carried as a `number` (`DECIMAL(18,4)`; `>= 0`, N14). Defaults to 0. Dark until the EV2 read reads it.
   */
  actualUnits: number;
  /**
   * The assignment's budgeted / actual cost in minor currency units (EV1/EV4a, ADR-0042):
   * `budgetedCost` may be `null` when unset (cost is then derived from `budgetedUnits × costPerUnit`
   * at EV read time), `actualCost` defaults to 0.
   * **Conditionally included (EV4a):** a real value is returned only when the caller holds `cost:read`
   * (Planner + Org Admin) in the assignment's organisation; for every other caller
   * (Viewer/Contributor) BOTH are `null` (fail-closed). A `null` therefore means EITHER unset OR
   * caller-not-permitted.
   */
  budgetedCost: number | null;
  actualCost: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One weighted **activity step** (M7 rung 5, ADR-0044 §2 / ADR-0035 §33) — a row of the per-activity
 * progress checklist. `weight` is the step's relative importance in the weighted-mean physical %
 * (an exact quantity carried as a `number`; the DB stores `DECIMAL(18,4)`, `>= 0`); `percentComplete`
 * is the step's own completion (integer 0–100, N28). `seq` is the server-assigned contiguous 1-based
 * ordering within the activity. When an activity has steps, its PHYSICAL %-complete rolls up as the
 * weighted mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)` and **wins** over the manual `physicalPercentComplete`; all-zero
 * weights fall back to the manual field (N27). Kept in lock-step with the API's Prisma `ActivityStep`.
 */
export interface ActivityStep {
  id: string;
  activityId: string;
  seq: number;
  name: string;
  weight: number;
  percentComplete: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One step in a bulk-replace request body (M7 rung 5, ADR-0044 §2, Q3). The client sends the desired
 * ordered list of steps; the server assigns `seq` contiguously, so only the mutable fields appear here.
 * `weight` must be `>= 0`; `percentComplete` an integer 0–100 (N28 boundary reject —
 * `STEP_PERCENT_OUT_OF_RANGE`, 422 — mirrors the ADR-0042 physical-% N23 reject).
 */
export interface ActivityStepInput {
  name: string;
  weight: number;
  percentComplete: number;
}

/**
 * The bulk-replace request for an activity's steps (M7 rung 5, ADR-0044 §2, Q3) —
 * `PUT …/activities/:activityId/steps`. `version` is the parent activity's optimistic-lock version
 * (the whole replace bumps it); `steps` is the full desired ordered list (an empty array clears them).
 */
export interface ReplaceActivityStepsRequest {
  version: number;
  steps: ActivityStepInput[];
}

/**
 * Canonical resource-module conflict / validation reasons + messages (M7.1, ADR-0039),
 * shared like {@link DEPENDENCY_CONFLICT_MESSAGES} so the same rejection reads
 * identically wherever it surfaces. The key is the machine-readable reason carried in a
 * domain error's `details.reason`; the value is the human message.
 */
export const RESOURCE_ERROR = {
  /** A resource name or code collides with an active resource in the same org (→ 409). */
  DUPLICATE_RESOURCE: 'A resource with this name or code already exists.',
  /** Deleting a resource still assigned to an active activity (→ 409). */
  RESOURCE_IN_USE: 'This resource is assigned to one or more active activities.',
  /** The (activity, resource) pair already has an active assignment (→ 409). */
  DUPLICATE_ASSIGNMENT: 'This resource is already assigned to this activity.',
  /** A MATERIAL resource cannot be the driving resource of an activity (→ 422). */
  MATERIAL_CANNOT_DRIVE: 'A material resource cannot drive an activity’s dates.',
  /**
   * A `unitsPerHour` of 0 on a units-driven recompute (`Duration := Units ÷ Units/Time`) would
   * divide by zero (N20, M7 rung 4 / ADR-0040 §5). Rejected before any division so the pure
   * `resolveTriad` never yields Infinity/NaN (→ 422).
   */
  UNITS_PER_HOUR_ZERO:
    'The rate (units/time) must be greater than zero to drive an activity’s duration.',
  /** A `GROUP` is a grouping node, not a resource — it can never be assigned or drive (→ 422). */
  GROUP_NOT_ASSIGNABLE: 'A group can’t be assigned to an activity.',
  /**
   * A **new** assignment was made to an archived resource (→ 422, ADR-0053 §4). Archiving retires
   * a resource from pickers; every EXISTING assignment stays live and keeps scheduling, levelling
   * and earning value, and may still be edited (maintaining history is not new exposure). Only
   * the new assignment is refused.
   */
  RESOURCE_ARCHIVED: 'This resource is archived. Unarchive it to assign it.',
  /** A proposed `parentId` is an in-org resource that is not a `GROUP` (→ 422). */
  RESOURCE_PARENT_NOT_GROUP: 'Only a group can contain resources.',
  /**
   * A proposed `parentId` is in-org but cannot be used as a parent — today, a resource trying to
   * parent itself (→ 422). A parent in ANOTHER organisation (or deleted/unknown) is deliberately a
   * plain 404 instead, so the tree never becomes a cross-tenant existence oracle.
   */
  RESOURCE_PARENT_WRONG_SCOPE: 'That group can’t be used here. Choose a different group.',
  /** The proposed parent is the resource itself or one of its descendants (→ 409). */
  RESOURCE_PARENT_CYCLE: 'That would nest a resource inside itself.',
  /** The move would push the subtree past {@link RESOURCE_TREE_MAX_DEPTH} (→ 422). */
  RESOURCE_TREE_TOO_DEEP:
    'Resource groups can be nested up to 10 levels deep. Choose a group nearer the top.',
  /**
   * A `GROUP` was given a calendar, a capacity ceiling or a cost rate (→ 422). A grouping node
   * has none of those by definition — which is what makes it invisible to scheduling, levelling
   * and Earned Value. Backed by the same-row CHECK `ck_resources_group_no_scheduling_fields`.
   */
  GROUP_HAS_NO_SCHEDULING_FIELDS:
    'A group has no calendar, capacity or cost — clear those to make this a group.',
  /**
   * A `GROUP` was being changed into an ordinary resource while it still contains children (→ 409).
   * Reparent them first; the ADR-0038 type-change precedent (a WBS summary with descendants).
   */
  RESOURCE_GROUP_HAS_CHILDREN: 'Move the resources out of this group first.',
  /** The referenced resource does not exist in this organisation (→ 404). */
  RESOURCE_NOT_FOUND: 'Resource not found.',
  /** The referenced assignment does not exist in this organisation (→ 404). */
  ASSIGNMENT_NOT_FOUND: 'Assignment not found.',
  /** The resource's `calendarId` is not an active calendar in the same org (→ 404). */
  RESOURCE_CALENDAR_NOT_FOUND: 'Calendar not found.',
} as const;

/** A machine-readable resource-module error reason (a key of {@link RESOURCE_ERROR}). */
export type ResourceErrorReason = keyof typeof RESOURCE_ERROR;

// ---------------------------------------------------------------------------
// Notes (the Notes feature, ADR-0046) — attributed, time-ordered note threads
// attached to an entity. Plans and activities in v1; client/project reserved.
// ---------------------------------------------------------------------------

/** The entity kinds a note can attach to (v1: plan, activity; client/project reserved). */
export const NOTE_ENTITY_TYPES = ['PLAN', 'ACTIVITY'] as const;

/** Which entity a note is attached to — the polymorphic discriminator (ADR-0046). */
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number];

/**
 * One note in an entity's thread — an attributed, timestamped free-text entry (ADR-0046). A note is
 * NOT a schedule input (no dates/logic); it records the *why* behind the plan. `authorId` is the
 * opaque user id that created it (the note's owner — only the author may edit/delete it, enforced in
 * the service); `authorName` is that user's display name resolved server-side, or null if unresolved.
 * `edited` is true once the author has revised the body since posting. `planId` is always present (an
 * activity note carries its activity's plan id, the denormalised cascade key); `activityId` is set iff
 * `entityType` is `ACTIVITY`. Timestamps are ISO instants.
 */
export interface NoteSummary {
  id: string;
  entityType: NoteEntityType;
  /** The owning plan (a PLAN note's parent, or an ACTIVITY note's plan). Always present in v1. */
  planId: string;
  /** The owning activity — present iff `entityType` is `ACTIVITY`, else null. */
  activityId: string | null;
  /** The note text (plain, 1–5000 chars; no markdown). */
  body: string;
  /** The opaque id of the user who wrote the note (its owner), or null if unattributed. */
  authorId: string | null;
  /** The author's display name resolved server-side, or null if it can't be resolved. */
  authorName: string | null;
  /** True once the author has edited the body since it was first posted (`updatedAt` > `createdAt`). */
  edited: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * How many (non-deleted) notes an activity has — the payload of the batch note-counts read used to
 * badge rows without an N+1. Only activities with ≥1 note are returned; an absent id means zero.
 */
export interface ActivityNoteCount {
  activityId: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Audit log (ADR-0072, TECH_DEBT #14)
// ---------------------------------------------------------------------------

/**
 * Every action the audit log can record. **A `const` union, deliberately not a Postgres enum.**
 *
 * The vocabulary gains members on every coverage rung, and Postgres needs TWO migrations to add a
 * label and then use it (ADR-0053 M3 paid that toll). It is also versioned data: a row written
 * under an old label must stay readable for the table's whole life, which a DB enum makes
 * impractical. Closed-ness is bought here instead — free, compiler-enforced, and reversible — with
 * `ck_audit_events_action_format` as the database's backstop against a malformed value.
 *
 * Naming is `subject.past_tense_verb`, lower-case, dot-namespaced, ≤ 64 chars. Past tense because
 * an audit row records something that **happened**; an action named in the imperative reads like a
 * command and invites someone to log intent rather than outcome.
 */
export const AUDIT_ACTIONS = [
  // — Membership, invitations and the organisation itself.
  //   The permission changes an audit trail exists for (TECH_DEBT #14 a2).
  'member.joined',
  'member.removed',
  'member.role_changed',
  'invitation.created',
  'invitation.revoked',
  'invitation.accepted',
  'organization.created',
  // — Guest share links (ADR-0051). Minting one authorises data egress **outside** the tenant
  //   boundary to someone holding a bearer token and no account, which is a permission change in
  //   every sense that matters — and the one whose subject cannot be asked what happened, because
  //   a guest has no identity to attribute a read to.
  'share.created',
  'share.revoked',
  // — Authentication (TECH_DEBT #14 a). Captured in Better Auth's own hook chain rather than a
  //   Nest service, because the auth handler is mounted as a raw Node handler outside Nest's DI.
  //   These rows carry NO organisation: authentication happens before one is known.
  'auth.signed_up',
  'auth.signed_in',
  'auth.sign_in_failed',
  'auth.signed_out',
  'auth.email_verified',
  // — Credential changes (ADR-0074). Same family and the same blast-radius test as the five above:
  //   a password change is the same class of fact as a sign-in. `password_reset_requested` is
  //   recorded even though nothing changed yet, because an unrequested one is the signal an
  //   account holder gets that somebody is probing their address — so it takes the ADR-0073 C2.2
  //   attribution shape and is readable ONLY by the account it named.
  //
  //   Note what does NOT gate these: the route census structurally cannot see Better Auth's
  //   routes (`audit-coverage.structural.spec.ts:45-47`), so nothing would have failed a PR that
  //   omitted them. They are here because the tests say they belong, not because a gate insisted.
  'auth.password_changed',
  'auth.password_reset_requested',
  'auth.password_reset_completed',
  // — Hierarchy soft deletes and restores. Not named in #14, but "who deleted this plan, and
  //   when" is the question users actually ask. Deletes only: creates and updates are a far
  //   larger surface and wait on the M3 growth measurement.
  'client.deleted',
  'client.restored',
  'project.deleted',
  'project.restored',
  'plan.deleted',
  'plan.restored',
  /**
   * A soft-deleted subtree passed its retention period and was PERMANENTLY removed (ADR-0096 D8).
   *
   * Passes both ADR-0073 tests and then some: the deletion is durable in the strongest sense — the
   * rows are gone and no restore exists — and its blast radius is a whole subtree. It is also the
   * only event in the catalogue with no human actor, which is precisely why it needs recording: a
   * planner who finds their work missing has no other way to learn what happened to it.
   *
   * ONE row per batch carrying scalar counts, never one per swept row.
   */
  'hierarchy.expired',
  // — Destructive and structural acts inside a plan (ADR-0073 family D). One row per **user
  //   action**, never per swept row: deleting a WBS summary with forty-one descendants is one
  //   thing a person did, and forty-one rows would bury the fact rather than record it. The
  //   counts ride the payload as flattened scalars instead.
  //
  //   `activity.created` is deliberately absent and stays absent (spec CQ-D): it fails BOTH tests
  //   — `created_by`/`created_at` on the row is already a durable, permanent record of the act
  //   (Test 1), and a new activity changes nothing outside itself until it is linked (Test 2).
  //   `dependency.created` is here for exactly that second reason: a link re-dates everything
  //   downstream of it, which is somebody else's work. The honest cost of the asymmetry — an
  //   ADR-0048 undo of a delete is a re-create, so the log shows a deletion with no matching
  //   restore — is `docs/TECH_DEBT.md` #92, not a reason to widen the catalogue.
  'activity.deleted',
  'activity.restored',
  'activity.dissolved',
  'activity.reparented',
  'dependency.created',
  'dependency.deleted',
  // — The rules other people's work is judged by (ADR-0073 family E). These are UPDATES, and they
  //   earn their row on the second test rather than the first: a plan's data date or a shared
  //   calendar's working time re-dates work that other people own, so `updated_by` on the row
  //   being edited records who typed it and nothing at all about the blast radius.
  //
  //   `plan.settings_changed` is emitted only when a **governance** field actually changed value;
  //   a PATCH that touches only the name or description writes nothing, because a rename changes
  //   how nothing computes.
  'plan.settings_changed',
  'calendar.working_time_changed',
  //   A baseline is the committed programme every later variance is measured against, so capturing
  //   or activating one changes what "late" means for the whole plan.
  'baseline.captured',
  'baseline.activated',
  'baseline.deleted',
  // — Library governance (ADR-0073 family F, over ADR-0053). A calendar or resource in the shared
  //   library is used by work its owner does not own, so retiring one, moving its tier, or
  //   deleting it changes what other people can build with. Archive is the sharp case: an
  //   archived row keeps scheduling identically and refuses only NEW usages, so nothing visibly
  //   breaks and nobody is told — which is exactly when a log earns its place.
  'calendar.deleted',
  'calendar.archived',
  'calendar.unarchived',
  'calendar.scope_changed',
  'resource.deleted',
  'resource.archived',
  'resource.unarchived',
  // — Provenance (ADR-0073 family G). The catalogue's only import. A plan created by hand is a
  //   sequence of choices somebody made and can account for; a plan created by an import arrived
  //   whole, from a file, with hundreds of activities and possibly rows added to the shared
  //   libraries. "Where did this programme come from, and which file was it?" is a question the
  //   product otherwise cannot answer at all once the upload is gone.
  'interchange.imported',
  // — Staff (ADR-0086). SchedulePoint staff operating the INSTALLATION, never a customer's data.
  //   These are READS, and they are recorded anyway — the one place the durability test is
  //   deliberately inverted, because on the staff console the read IS the privileged act. Today
  //   every one of these operations happens over `psql` on the host and leaves no record at all,
  //   so this narrows the unaudited surface rather than widening the audited one.
  'staff.session_started',
  'staff.panel_read',
  //   And the refusals. This one is not a read at all: it is an authenticated caller who is NOT
  //   staff reaching a staff route, and it is the only row in the vocabulary whose actor is
  //   deliberately `USER` rather than `STAFF` — recording a prober as staff would be a lie, and it
  //   would put them in the console's own "what staff have done" panel.
  'staff.access_denied',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Who performed an audited action. Mirrors the app's real principal kinds. */
export const AUDIT_ACTOR_TYPES = ['USER', 'GUEST', 'SYSTEM', 'ANONYMOUS', 'STAFF'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/**
 * How the action ended. `DENIED` is distinct from `FAILURE` on purpose: a refused permission is
 * a security-relevant event worth counting, while a failure is an error worth debugging, and
 * collapsing them would hide a probing attempt inside ordinary noise.
 */
export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILURE'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Which of the two audit reads a question is being asked of. Named once here rather than spelled
 * out at each use: the two functions below and the web's filter model all branch on it, and a
 * union repeated in four places is a union that can be repeated wrongly in a fifth.
 */
export const AUDIT_SURFACES = ['organization', 'self'] as const;
export type AuditSurface = (typeof AUDIT_SURFACES)[number];

/**
 * The groups a reader filters by (ADR-0073 C1).
 *
 * A category is a **question somebody asks**, not a tidy-up of the action list: "who changed
 * access?", "what was deleted?", "who has been signing in?". A filter offering twenty machine
 * names would make the reader translate their question into our vocabulary before they could ask
 * it, which is the same tax the unfiltered stream already charges.
 *
 * **Categories are a reading aid and never travel on the wire.** The API takes actions only — the
 * client expands a chosen category into its action list before building the request. That keeps
 * one vocabulary on the boundary, so a category renamed for legibility is a copy change rather
 * than a breaking API change, and a category regrouped later cannot silently alter what a saved
 * URL means to the server.
 */
export const AUDIT_CATEGORIES = [
  'access',
  'deletions',
  'plan-structure',
  'settings',
  'sign-ins',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Which category each action belongs to — **exhaustively keyed**, so adding an action without
 * deciding which question it answers is a compile error. The fourth map in the system with that
 * discipline (the redactor's allow-list, the census, and the web's copy map are the others), and
 * for the same reason: a silent default here would put a new event in a group nobody chose.
 */
export const AUDIT_ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  // Who can do what, and who was let in or out.
  'member.joined': 'access',
  'member.removed': 'access',
  'member.role_changed': 'access',
  'invitation.created': 'access',
  'invitation.revoked': 'access',
  'invitation.accepted': 'access',
  'organization.created': 'access',
  // A share link authorises a read by somebody with no account, which is an access change in
  // every sense that matters — so it belongs here rather than in a category of its own.
  'share.created': 'access',
  'share.revoked': 'access',
  // Authentication. These rows carry no organisation, which is why the category is withheld from
  // the organisation surface rather than merely returning nothing there.
  'auth.signed_up': 'sign-ins',
  'auth.signed_in': 'sign-ins',
  'auth.sign_in_failed': 'sign-ins',
  'auth.signed_out': 'sign-ins',
  'auth.email_verified': 'sign-ins',
  'auth.password_changed': 'sign-ins',
  'auth.password_reset_requested': 'sign-ins',
  'auth.password_reset_completed': 'sign-ins',
  // What disappeared, and what came back. A restore sits beside its delete deliberately: a reader
  // asking "what happened to the Northgate job?" wants both halves in one answer.
  'client.deleted': 'deletions',
  'client.restored': 'deletions',
  'project.deleted': 'deletions',
  'project.restored': 'deletions',
  'plan.deleted': 'deletions',
  'plan.restored': 'deletions',
  'hierarchy.expired': 'deletions',
  'activity.deleted': 'deletions',
  'activity.restored': 'deletions',
  'dependency.deleted': 'deletions',
  // Not a deletion — a rearrangement. `activity.dissolved` removes a summary but PROMOTES its
  // children rather than deleting them, so filing it under "what disappeared" would tell a reader
  // looking for lost work that forty activities went away. Its subject is the shape of the plan.
  'activity.dissolved': 'plan-structure',
  'activity.reparented': 'plan-structure',
  'dependency.created': 'plan-structure',
  // The rules the work is judged by. A baseline CAPTURE or ACTIVATION belongs here rather than in
  // deletions for the same reason a data-date move does: it changes the standard, not the content.
  'plan.settings_changed': 'settings',
  'calendar.working_time_changed': 'settings',
  'baseline.captured': 'settings',
  'baseline.activated': 'settings',
  // …and its DELETE belongs with the other deletions, because that is the question a reader asks
  // about it ("where did the December baseline go?"), not "what changed about the rules".
  'baseline.deleted': 'deletions',
  'calendar.deleted': 'deletions',
  'resource.deleted': 'deletions',
  // Archiving is deliberately NOT a deletion (ADR-0053 §4) — the row stays valid and every
  // existing reference keeps working — so filing it under "what disappeared" would answer the
  // wrong question. A tier move is the same class of fact: who may use this, from now on.
  'staff.session_started': 'access',
  'staff.panel_read': 'access',
  'staff.access_denied': 'access',
  'calendar.archived': 'settings',
  'calendar.unarchived': 'settings',
  'calendar.scope_changed': 'settings',
  'resource.archived': 'settings',
  'resource.unarchived': 'settings',
  // An import is the one CREATE that is also a structural fact: it is how a whole plan's shape
  // arrived. It sits with the other answers to "why does this plan look like this?" rather than
  // with settings, which are about the rules a plan is judged by.
  'interchange.imported': 'plan-structure',
};

/**
 * The categories a surface may offer.
 *
 * The organisation log **cannot** offer `sign-ins`: an `auth.*` row carries no `organizationId`
 * and that read filters on exactly that column, so the choice could only ever return nothing.
 * Offering it would be the defect ADR-0072 met on its first day wearing a filter's clothes —
 * absence a reader cannot distinguish from silence — and the API refuses those actions on that
 * route for the same reason (plus a measured one: a filter that matches nothing is also the most
 * expensive query the table accepts).
 *
 * **A category with nothing in it yet is also withheld**, and that is not a detail. Offering a chip
 * that can only ever answer "no events" is the precise defect this filter exists to fix, in the
 * control meant to fix it. `plan-structure` and `settings` were both declared-but-empty when C1
 * shipped, for the compile-error discipline above; `plan-structure` gained its first actions with
 * C3.1 and `settings` with C3.2, each appearing **without anyone editing this function** — which is
 * the point of deriving the offering rather than listing it. Every declared category now holds at
 * least one action; the rule stays because the next one declared will not.
 *
 * Both rules are **derived** from {@link AUDIT_ACTION_CATEGORY} rather than listed, so neither
 * needs anyone to remember this function: the offering is a property of the vocabulary.
 */
export function auditCategoriesForSurface(surface: AuditSurface): readonly AuditCategory[] {
  return AUDIT_CATEGORIES.filter(
    (category) => auditActionsForCategories([category], surface).length > 0,
  );
}

/** Every action in a category, in vocabulary order. */
export function auditActionsInCategory(category: AuditCategory): readonly AuditAction[] {
  return AUDIT_ACTIONS.filter((action) => AUDIT_ACTION_CATEGORY[action] === category);
}

/**
 * Expand chosen categories into the `action` list to send — **for a given surface**.
 *
 * The surface argument is not decoration. Withholding the `sign-ins` chip from the organisation
 * screen stops a reader picking an unanswerable filter, but it would not stop a category that
 * merely *contained* an `auth.*` action from smuggling one into the request, which the API refuses
 * with a 422. Filtering at the point of expansion makes that unreachable by construction rather
 * than by the two lists happening to agree — and they are maintained in different places.
 *
 * An empty selection returns an empty list, which the caller sends as no `action` parameter at
 * all: "no category chosen" means every action, not none.
 */
export function auditActionsForCategories(
  categories: readonly AuditCategory[],
  surface: AuditSurface,
): readonly AuditAction[] {
  const actions = categories.flatMap((category) => [...auditActionsInCategory(category)]);
  return surface === 'self' ? actions : actions.filter((action) => !action.startsWith('auth.'));
}

/** One recorded event, as the read endpoints return it. */
export interface AuditEvent {
  id: string;
  occurredAt: string;
  organizationId: string | null;
  action: AuditAction;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId: string | null;
  /** The actor's name/email **as it was**, so renaming an account cannot rewrite history. */
  actorLabel: string | null;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  /** Allow-listed, redacted, size-capped `{ before, after }` — or null where nothing changed. */
  changes: AuditChanges | null;
  correlationId: string | null;
}

/**
 * The before/after payload. Both sides are present even when a field only appears on one, so a
 * reader can tell "set from nothing" from "unchanged" without consulting the action's semantics.
 */
export interface AuditChanges {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** True when the service had to drop fields to stay inside the 8 KB column bound. */
  truncated?: boolean;
}

// ---------------------------------------------------------------------------
// The organisation overview (ADR-0098) — the screen every sign-in lands on.
// ---------------------------------------------------------------------------

/**
 * Who made a change.
 *
 * **A discriminated union, not a nullable name.** "Sarah", "somebody who has left this
 * organisation" and "we do not know" are three different facts, and a nullable string collapses the
 * last two into an absence a reader cannot tell from a defect.
 */
export type OverviewActor =
  { kind: 'MEMBER'; name: string } | { kind: 'FORMER_MEMBER' } | { kind: 'UNKNOWN' };

export interface RecentlyChangedPlan {
  planId: string;
  planName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  /**
   * The latest of the plan row, its newest activity and its newest dependency — NOT
   * `plans.updated_at`, which does not move when an activity is edited.
   */
  changedAt: string;
  changedBy: OverviewActor;
}

export interface OverviewHeldLock {
  planId: string;
  planName: string;
  /** The peer waiting for this pen, or null when nobody has asked. */
  requestedBy: OverviewActor | null;
}

/**
 * The things waiting on this reader.
 *
 * **The two counts are OMITTED for readers who may not see them, never sent as `0`.** A zero is a
 * fact about the organisation; an absence is a fact about the reader.
 */
export interface OverviewAttention {
  heldLocks: OverviewHeldLock[];
  pendingInvitationCount?: number;
  expiringDeletedCount?: number;
}

/**
 * One plan this browser remembers the reader opening, resolved to its **current** name.
 *
 * The browser stores ids only, so every name here comes from the server on the load that renders
 * it — which is what makes a rename correct itself and a plan the reader has lost access to
 * disappear rather than 404 on click.
 */
export interface RecentPlan {
  planId: string;
  planName: string;
  projectName: string;
  clientName: string;
}

export interface OrganisationOverview {
  organisationName: string;
  /** No active clients — the organisation has not been set up yet. */
  isNewOrganisation: boolean;
  /** Any active, non-archived plan exists. */
  hasPlans: boolean;
  recentlyChanged: RecentlyChangedPlan[];
  /**
   * The subset of the requested `recentPlanIds` the caller may read, in the order they were sent.
   * Absent ids are absent for indistinguishable reasons — there is no `reason` field by design.
   */
  recentPlans: RecentPlan[];
  attention: OverviewAttention;
}

export {};

// ---------------------------------------------------------------------------
// Schedule health check (DCMA 14-point) — the report contract (health M1).
// ---------------------------------------------------------------------------

/**
 * The fourteen DCMA metrics, in report (ordinal) order. A closed tuple so the report array can be
 * asserted **total**: the M1 totality test checks `report.metrics` has exactly one row per member,
 * in this order — the ADR-0094 `ConflictKey` move (an open `string` id lets a result set silently
 * miss a metric).
 */
export const HEALTH_METRIC_IDS = [
  'MISSING_LOGIC',
  'LEADS',
  'LAGS',
  'RELATIONSHIP_TYPES',
  'HARD_CONSTRAINTS',
  'HIGH_FLOAT',
  'NEGATIVE_FLOAT',
  'HIGH_DURATION',
  'INVALID_DATES',
  'RESOURCES',
  'MISSED_ACTIVITIES',
  'CRITICAL_PATH_TEST',
  'CPLI',
  'BEI',
] as const;

export type HealthMetricId = (typeof HEALTH_METRIC_IDS)[number];

/** Tuple, not a bare union: the API DTO derives its OpenAPI `enum:` from this same value, so the
 * two cannot disagree about membership (the `HEALTH_METRIC_IDS` rule, applied to the other three
 * closed sets — an M5 api-review finding). */
export const HEALTH_VERDICTS = ['PASS', 'FAIL', 'NOT_ASSESSABLE', 'INFORMATIONAL'] as const;

export type HealthVerdict = (typeof HEALTH_VERDICTS)[number];

/**
 * Why a metric could not be assessed. Redundant with `verdict === 'NOT_ASSESSABLE'` **deliberately**
 * (defence in depth for the printed document — its renderer prints the sentence `reason` names and
 * structurally cannot print one for a passing row).
 *
 * `NO_INCOMPLETE_ACTIVITIES` and `NOTHING_REMAINING` were added at M1: the spec's §3.1 table names
 * both states ("no incomplete activities" for metric 8; a plan whose finish is not after the data
 * date for metric 13's divisor) but its reason list omitted them — an inconsistency found by
 * implementing the table, resolved toward the table.
 */
export const HEALTH_NOT_ASSESSABLE_REASONS = [
  'EMPTY_PLAN',
  'NO_RELATIONSHIPS',
  'PLAN_NOT_SCHEDULED',
  'NO_ACTIVE_BASELINE',
  'NO_TARGET_FINISH',
  'NOTHING_DUE',
  'NO_INCOMPLETE_ACTIVITIES',
  'NOTHING_REMAINING',
  'REQUIRES_WHAT_IF_ANALYSIS',
  // M6: the what-if route found no incomplete critical work-carrying activity to perturb — a
  // scheduled plan CAN legitimately have no critical activity (a late hard finish bound can leave
  // every path positive float), and that is a fact to state, not a crash (M6-T1).
  'NO_CRITICAL_PATH',
] as const;

export type HealthNotAssessableReason = (typeof HEALTH_NOT_ASSESSABLE_REASONS)[number];

/**
 * How a threshold judges its measurement. A **closed** union so the client needs no default case —
 * a new kind is a typecheck failure, never an unrendered row. There is deliberately no `NONE`:
 * metric 10 (informational) and metric 12 carry `threshold: null`, because a threshold object on
 * screen reads as a real threshold and "judged against: none" is worse than nothing.
 */
export const HEALTH_THRESHOLD_KINDS = [
  'MAX_PERCENT',
  'MAX_COUNT',
  'MIN_PERCENT',
  'MIN_RATIO',
] as const;

export type HealthThresholdKind = (typeof HEALTH_THRESHOLD_KINDS)[number];

export interface HealthThreshold {
  kind: HealthThresholdKind;
  /** The number judged against — the ONLY place it is stated (the G3 rule: no client literal). */
  value: number;
}

/**
 * What a metric measured. All four fields always present; the ones a metric does not use are
 * `null` (a percent metric fills count/denominator/percent; a count metric fills count alone; the
 * two index metrics fill ratio). On a `NOT_ASSESSABLE` row the whole object is `null`, never a
 * zero-filled shape — `{count: 0}` is indistinguishable from a real (degenerate) measurement.
 */
export interface HealthMeasured {
  count: number | null;
  denominator: number | null;
  /** 1-dp percentage of `count / denominator`; null when the metric is not percent-shaped. */
  percent: number | null;
  /** 4-dp index ratio (metrics 13/14); null elsewhere. */
  ratio: number | null;
}

/**
 * One offending row, capped per metric ({@link ScheduleHealthReport.offenderCap}) with the true
 * total always in `offenderCount`. `activityId` is the id the **jump seam** selects (M3): the
 * activity itself for an `ACTIVITY` offender, the successor for a `RELATIONSHIP` one — carried here
 * so the panel never re-derives which endpoint a relationship finding "belongs" to.
 */
export interface HealthOffender {
  kind: 'ACTIVITY' | 'RELATIONSHIP';
  /** The offending row's own id (activity id, or dependency id for a RELATIONSHIP). */
  id: string;
  code: string | null;
  name: string;
  /** The one-line why — "no predecessor", "lead of −120 min (SS)", "float 61 d". */
  note: string;
  /** The activity the jump-to-offender seam selects. */
  activityId: string;
}

/**
 * One metric row. The shape is a **documented discriminator on `verdict`** (spec §4.5's table):
 * `NOT_ASSESSABLE` ⇒ `measured: null`, `detail: null`, `offenders: []`, `offenderCount: 0`,
 * `offendersTruncated: false`, `reason` non-null (threshold kept where one exists — the reader is
 * owed "this would have been judged against ≥ 0.95"); `INFORMATIONAL` ⇒ `threshold: null`;
 * `PASS` ⇒ empty offenders. Asserted row by row by the M1 totality test, never left to each
 * evaluator to answer differently.
 */
export interface HealthMetricResult {
  id: HealthMetricId;
  /** 1-based DCMA ordinal; the array is always sorted by it. */
  ordinal: number;
  name: string;
  verdict: HealthVerdict;
  reason: HealthNotAssessableReason | null;
  measured: HealthMeasured | null;
  threshold: HealthThreshold | null;
  /** Per-metric extra facts (exclusion rules, sub-counts, narrowings); null when there are none. */
  detail: Record<string, unknown> | null;
  /** The TRUE total of offenders, never the capped length. */
  offenderCount: number;
  offendersTruncated: boolean;
  offenders: HealthOffender[];
}

export interface HealthBaselineRef {
  id: string;
  name: string;
  capturedAt: string;
}

export interface HealthSummary {
  passed: number;
  failed: number;
  notAssessable: number;
  informational: number;
}

/**
 * The whole report — always exactly 14 metric rows, one per {@link HealthMetricId}, in ordinal
 * order, never sparse. A metric that could not be computed is PRESENT with
 * `verdict: NOT_ASSESSABLE` and a `reason`; it is never omitted. `offenderCap` travels in the
 * payload for the same reason thresholds do (G3): a client hard-coding 50 to render
 * "showing 50 of 412" is a second source for a number the server owns.
 */
export interface ScheduleHealthReport {
  planId: string;
  planName: string;
  /** The data date (`plans.planned_start`, `YYYY-MM-DD`) — NOT NULL since ADR-0033 M1. */
  dataDate: string;
  /** When the persisted schedule was computed; null = never calculated. */
  computedAt: string | null;
  schedulingMode: 'EARLY' | 'VISUAL';
  /** Active non-summary activities — the §3.1 denominator convention, made visible. */
  activityCount: number;
  relationshipCount: number;
  baseline: HealthBaselineRef | null;
  summary: HealthSummary;
  offenderCap: number;
  metrics: HealthMetricResult[];
}
