import { z } from 'zod';

/**
 * The **`SeedSpec`** — a complete, server-independent description of a plan to create (ADR-0066).
 *
 * This is the single source of truth for every tier of the seed catalogue: the torture fixture, the
 * small per-capability plans, the pairwise crossings, the generated scale plans and the hostile cases
 * all reduce to one of these. It is **pure**: it describes a plan and knows nothing about HTTP, Prisma
 * or the API's DTOs, which is what lets the same spec feed both the seeder and the differential.
 *
 * ## Why this is its own model and not `@repo/interchange`'s `ImportGraph`
 *
 * The two look similar and answer different questions. `ImportGraph` is shaped by **what an
 * interchange format can carry** — it deliberately stops where XER and MSPDI stop. A `SeedSpec` is
 * shaped by **what the application supports**, which is strictly more: duration types, external
 * inter-project instants, the per-relationship lag calendar, resource capacity and cost rates,
 * assignment curves and rates, expenses, weighted steps and every plan-level scheduling option. Those
 * are precisely the ~17 capabilities no XER can express, and they are the reason this package exists.
 *
 * Extending `ImportGraph` instead would push seed-only fields into the interchange model, where they
 * would read as "an import could produce this" when no format can. Two independent models with the
 * same conventions (keys not ids, working-**minutes**, `YYYY-MM-DD` site-local dates) is the honest
 * shape, and it keeps `@repo/seed` free of a parser dependency.
 *
 * ## The invariant this model must hold
 *
 * **Every enum member the application supports must be representable here.** The way this package
 * rots is a new `ActivityType` or `ConstraintType` landing in Prisma that a spec cannot express — the
 * capability then becomes quietly unseedable and drops out of the catalogue without anything failing.
 * `spec.structural.spec.ts` asserts the full enum sets, so that becomes a build failure rather than a
 * silent hole.
 */

/** A `YYYY-MM-DD` calendar date — site-local, no timezone (ADR-0023). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a "YYYY-MM-DD" date');

/** A `YYYY-MM-DDTHH:mm` local instant, for the fields the engine reads at minute granularity. */
const isoInstantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'expected a "YYYY-MM-DDTHH:mm" instant');

// ---------------------------------------------------------------------------
// Vocabulary — mirrors the Prisma enums exactly. Duplicated deliberately: this
// package must not depend on @prisma/client (it is pure and browser-safe), so
// the structural test is what keeps the two in step.
// ---------------------------------------------------------------------------

/**
 * `HAMMOCK` is included even though no engine code consumes it: the enum member exists, so a spec
 * must be able to express it, and the catalogue's job is to reveal that the app accepts a type it
 * cannot schedule. Excluding it here would hide the gap rather than measure it.
 */
export const SEED_ACTIVITY_TYPES = [
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'HAMMOCK',
  'LEVEL_OF_EFFORT',
  'WBS_SUMMARY',
  'RESOURCE_DEPENDENT',
] as const;
export const seedActivityTypeSchema = z.enum(SEED_ACTIVITY_TYPES);
export type SeedActivityType = z.infer<typeof seedActivityTypeSchema>;

export const SEED_CONSTRAINT_TYPES = [
  'SNET',
  'SNLT',
  'FNET',
  'FNLT',
  'MSO',
  'MFO',
  'MANDATORY_START',
  'MANDATORY_FINISH',
] as const;
export const seedConstraintTypeSchema = z.enum(SEED_CONSTRAINT_TYPES);
export type SeedConstraintType = z.infer<typeof seedConstraintTypeSchema>;

export const SEED_DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export const seedDependencyTypeSchema = z.enum(SEED_DEPENDENCY_TYPES);
export type SeedDependencyType = z.infer<typeof seedDependencyTypeSchema>;

export const SEED_LAG_CALENDAR_SOURCES = [
  'PREDECESSOR',
  'SUCCESSOR',
  'TWENTY_FOUR_HOUR',
  'PROJECT_DEFAULT',
] as const;
export const seedLagCalendarSourceSchema = z.enum(SEED_LAG_CALENDAR_SOURCES);
export type SeedLagCalendarSource = z.infer<typeof seedLagCalendarSourceSchema>;

/** `GROUP` is a non-assignable grouping node (ADR-0053 §3), not a schedulable kind. */
export const SEED_RESOURCE_KINDS = ['LABOUR', 'EQUIPMENT', 'MATERIAL', 'GROUP'] as const;
export const seedResourceKindSchema = z.enum(SEED_RESOURCE_KINDS);
export type SeedResourceKind = z.infer<typeof seedResourceKindSchema>;

export const SEED_DURATION_TYPES = [
  'FIXED_DURATION_AND_UNITS_TIME',
  'FIXED_DURATION_AND_UNITS',
  'FIXED_UNITS',
  'FIXED_UNITS_TIME',
] as const;
export const seedDurationTypeSchema = z.enum(SEED_DURATION_TYPES);
export type SeedDurationType = z.infer<typeof seedDurationTypeSchema>;

export const SEED_ACTIVITY_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] as const;
export const seedActivityStatusSchema = z.enum(SEED_ACTIVITY_STATUSES);
export type SeedActivityStatus = z.infer<typeof seedActivityStatusSchema>;

export const SEED_PERCENT_COMPLETE_TYPES = ['DURATION', 'UNITS', 'PHYSICAL'] as const;
export const seedPercentCompleteTypeSchema = z.enum(SEED_PERCENT_COMPLETE_TYPES);
export type SeedPercentCompleteType = z.infer<typeof seedPercentCompleteTypeSchema>;

export const SEED_ACCRUAL_TYPES = ['START', 'UNIFORM', 'END'] as const;
export const seedAccrualTypeSchema = z.enum(SEED_ACCRUAL_TYPES);
export type SeedAccrualType = z.infer<typeof seedAccrualTypeSchema>;

export const SEED_RESOURCE_CURVE_TYPES = [
  'UNIFORM',
  'BELL',
  'FRONT_LOADED',
  'BACK_LOADED',
  'DOUBLE_PEAK',
] as const;
export const seedResourceCurveTypeSchema = z.enum(SEED_RESOURCE_CURVE_TYPES);
export type SeedResourceCurveType = z.infer<typeof seedResourceCurveTypeSchema>;

export const SEED_CALENDAR_SCOPES = ['ORG', 'PROJECT'] as const;
export const seedCalendarScopeSchema = z.enum(SEED_CALENDAR_SCOPES);
export type SeedCalendarScope = z.infer<typeof seedCalendarScopeSchema>;

export const SEED_SCHEDULING_MODES = ['EARLY', 'VISUAL'] as const;
export const SEED_PROGRESS_RECALC_MODES = [
  'RETAINED_LOGIC',
  'PROGRESS_OVERRIDE',
  'ACTUAL_DATES',
] as const;
export const SEED_CRITICAL_PATH_DEFINITIONS = ['TOTAL_FLOAT', 'LONGEST_PATH'] as const;
export const SEED_TOTAL_FLOAT_MODES = ['START', 'FINISH', 'SMALLEST'] as const;
export const SEED_EAC_METHODS = ['CPI', 'REMAINING_AT_BUDGET', 'CPI_TIMES_SPI'] as const;

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

/**
 * One `[startMinute, endMinute)` working window, minutes from local midnight in `[0, 1440]`
 * (1440 = 24:00). `start < end` — a midnight-crossing night shift is two adjacent-day windows, never
 * a wrap (ADR-0036).
 */
export const seedWorkWindowSchema = z
  .object({
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .strict()
  .refine((w) => w.startMinute < w.endMinute, 'a work window must start before it ends');
export type SeedWorkWindow = z.infer<typeof seedWorkWindowSchema>;

/** A weekday's shift pattern. `weekday` is 0 = Sunday … 6 = Saturday; no windows = a rest day. */
export const seedCalendarDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    windows: z.array(seedWorkWindowSchema),
  })
  .strict();
export type SeedCalendarDay = z.infer<typeof seedCalendarDaySchema>;

/** A dated override. No windows = a non-working exception; windows present = a worked exception. */
export const seedCalendarExceptionSchema = z
  .object({
    date: isoDateSchema,
    windows: z.array(seedWorkWindowSchema),
    label: z.string().min(1).nullable(),
  })
  .strict();
export type SeedCalendarException = z.infer<typeof seedCalendarExceptionSchema>;

export const seedCalendarSchema = z
  .object({
    /** Stable within one spec; every reference is by key, so nothing needs a database id. */
    key: z.string().min(1),
    name: z.string().min(1).max(120),
    /** ADR-0053 §1. A `PROJECT` calendar is pinned to the seed's target project. */
    scope: seedCalendarScopeSchema,
    /**
     * The standard working day in HOURS (ADR-0068) — P6's `day_hr_cnt`, the day↔minute factor for
     * every day-denominated field measured on this calendar. `null` means "let the API derive it
     * from the week below", which is right for every calendar that does not deliberately disagree
     * with its own hours; a plan proving the factor sets it explicitly.
     */
    hoursPerDay: z.number().positive().max(24).nullable(),
    days: z.array(seedCalendarDaySchema),
    exceptions: z.array(seedCalendarExceptionSchema),
  })
  .strict();
export type SeedCalendar = z.infer<typeof seedCalendarSchema>;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export const seedResourceSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1).max(200),
    code: z.string().min(1).max(32).nullable(),
    kind: seedResourceKindSchema,
    /** A resource may hold only an ORG calendar (ADR-0053 §2); the seeder re-asserts it. */
    calendarKey: z.string().min(1).nullable(),
    /** The levelling capacity ceiling (ADR-0041). **No XER column** — seed-only. */
    maxUnitsPerHour: z.number().nonnegative().nullable(),
    /** The EV cost rate, minor units per unit (ADR-0042). **No XER column** — seed-only. */
    costPerUnit: z.number().int().nonnegative().nullable(),
    /** An adjacency-list parent; only a `GROUP` may be one (ADR-0053 §3). */
    parentKey: z.string().min(1).nullable(),
    /** Orthogonal to soft delete: an archived resource still schedules (ADR-0053 §4). */
    archived: z.boolean(),
  })
  .strict();
export type SeedResource = z.infer<typeof seedResourceSchema>;

export const seedAssignmentSchema = z
  .object({
    activityKey: z.string().min(1),
    resourceKey: z.string().min(1),
    budgetedUnits: z.number().nonnegative(),
    /** The ADR-0040 triad rate. NULL = the triad is inert. **No XER column** — seed-only. */
    unitsPerHour: z.number().nonnegative().nullable(),
    isDriving: z.boolean(),
    actualUnits: z.number().nonnegative().nullable(),
    /** The ADR-0044 loading profile. **No XER column** — seed-only. */
    curveType: seedResourceCurveTypeSchema,
  })
  .strict();
export type SeedAssignment = z.infer<typeof seedAssignmentSchema>;

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

/** A weighted step rolling up to the PHYSICAL measure (ADR-0044 F2). **No XER table** — seed-only. */
export const seedStepSchema = z
  .object({
    name: z.string().min(1),
    weight: z.number().positive(),
    percentComplete: z.number().int().min(0).max(100),
  })
  .strict();
export type SeedStep = z.infer<typeof seedStepSchema>;

/** Progress, written verbatim. Absent leaves the column defaults (NOT_STARTED / 0 / nulls). */
export const seedProgressSchema = z
  .object({
    status: seedActivityStatusSchema,
    percentComplete: z.number().int().min(0).max(100),
    percentCompleteType: seedPercentCompleteTypeSchema,
    /** The value that earns EV and moves no date (ADR-0042). */
    physicalPercentComplete: z.number().int().min(0).max(100).nullable(),
    actualStart: isoInstantSchema.nullable(),
    actualFinish: isoInstantSchema.nullable(),
    remainingDurationMinutes: z.number().int().min(0).nullable(),
    suspendDate: isoInstantSchema.nullable(),
    resumeDate: isoInstantSchema.nullable(),
    /** Needs the plan's `useExpectedFinishDates` on to have any effect (ADR-0035 §9). */
    expectedFinish: isoInstantSchema.nullable(),
  })
  .strict();
export type SeedProgress = z.infer<typeof seedProgressSchema>;

export const seedActivitySchema = z
  .object({
    key: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    type: seedActivityTypeSchema,
    /** Working minutes (ADR-0036). A milestone or summary is 0. */
    durationMinutes: z.number().int().min(0),
    /** The activity's own calendar (ADR-0037); null inherits the plan's. */
    calendarKey: z.string().min(1).nullable(),
    /** The WBS parent (ADR-0038): another in-spec activity, which must be a `WBS_SUMMARY`. */
    parentKey: z.string().min(1).nullable(),
    constraintType: seedConstraintTypeSchema.nullable(),
    constraintDate: isoDateSchema.nullable(),
    secondaryConstraintType: seedConstraintTypeSchema.nullable(),
    secondaryConstraintDate: isoDateSchema.nullable(),
    scheduleAsLateAsPossible: z.boolean(),
    /** The ADR-0040 duration type. **No XER column** — seed-only. */
    durationType: seedDurationTypeSchema,
    /** ADR-0043 imported instants. **No XER column** — seed-only. */
    externalEarlyStart: isoInstantSchema.nullable(),
    externalLateFinish: isoInstantSchema.nullable(),
    /** The levelling tie-break (ADR-0041). */
    levelingPriority: z.number().int().nullable(),
    /** Cost accrual shaping the EV read's PV curve (ADR-0044 F1). **No XER column** — seed-only. */
    accrualType: seedAccrualTypeSchema,
    /** Activity-level expense in minor units (ADR-0042). **No XER table** — seed-only. */
    budgetedExpense: z.number().int().nonnegative().nullable(),
    actualExpense: z.number().int().nonnegative().nullable(),
    /** Weighted steps. **No XER table** — seed-only. */
    steps: z.array(seedStepSchema),
    progress: seedProgressSchema.nullable(),
    /** The advisory hand-placement read in VISUAL mode (ADR-0033). */
    visualStart: isoDateSchema.nullable(),
    /**
     * The conformance `test_tags` this activity carries, so a coverage report can say which of the
     * fixture's 117 capability keys a seeded plan actually reaches. Empty for hand-authored plans
     * that claim nothing.
     */
    testTags: z.array(z.string().min(1)),
  })
  .strict();
export type SeedActivity = z.infer<typeof seedActivitySchema>;

export const seedDependencySchema = z
  .object({
    predecessorKey: z.string().min(1),
    successorKey: z.string().min(1),
    type: seedDependencyTypeSchema,
    /** Working minutes; negative is a lead (ADR-0036). */
    lagMinutes: z.number().int(),
    /** Which calendar the lag walks on (ADR-0053 §2 — an enum, not an FK). **No XER column.** */
    lagCalendarSource: seedLagCalendarSourceSchema,
  })
  .strict();
export type SeedDependency = z.infer<typeof seedDependencySchema>;

// ---------------------------------------------------------------------------
// The plan and its scheduling options
// ---------------------------------------------------------------------------

/**
 * Every plan-level scheduling switch, in one place. These are what the fixture's 13 scenarios vary,
 * and they are the plan-scope half of the pairwise dimension table (spec §4).
 */
export const seedPlanOptionsSchema = z
  .object({
    schedulingMode: z.enum(SEED_SCHEDULING_MODES),
    progressRecalcMode: z.enum(SEED_PROGRESS_RECALC_MODES),
    useExpectedFinishDates: z.boolean(),
    criticalPathDefinition: z.enum(SEED_CRITICAL_PATH_DEFINITIONS),
    criticalFloatThresholdMinutes: z.number().int(),
    totalFloatMode: z.enum(SEED_TOTAL_FLOAT_MODES),
    makeOpenEndsCritical: z.boolean(),
    levelResources: z.boolean(),
    levelWithinFloatOnly: z.boolean(),
    ignoreExternalRelationships: z.boolean(),
  })
  .strict();
export type SeedPlanOptions = z.infer<typeof seedPlanOptionsSchema>;

/** The application's own defaults, so a spec states only what it deliberately varies. */
export const DEFAULT_SEED_PLAN_OPTIONS: SeedPlanOptions = {
  schedulingMode: 'EARLY',
  progressRecalcMode: 'RETAINED_LOGIC',
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThresholdMinutes: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  ignoreExternalRelationships: false,
};

export const seedPlanSchema = z
  .object({
    name: z.string().min(1),
    /**
     * Shown in the app. For a capability plan this states the expected outcome in one sentence, so
     * the plan itself carries the assertion a reader checks it against — the playbook's claim and
     * the plan cannot then drift apart, because they are the same string.
     */
    description: z.string().min(1).nullable(),
    /** The mandatory CPM data date (ADR-0033). */
    dataDate: isoDateSchema,
    defaultCalendarKey: z.string().min(1).nullable(),
    currencyCode: z.string().length(3).nullable(),
    options: seedPlanOptionsSchema,
  })
  .strict();
export type SeedPlan = z.infer<typeof seedPlanSchema>;

/**
 * A source object the spec could not represent, with the reason. The fixture's roles, activity-code
 * types and UDF definitions land here: the application has no schema for them, so they are
 * **reported, never dropped silently** — the ADR-0050 discipline applied to seeding. A reader of the
 * seed report can tell "the app cannot hold this" apart from "the seeder forgot".
 */
export const seedUnplaceableSchema = z
  .object({
    entity: z.string().min(1),
    sourceRef: z.string().min(1).nullable(),
    reason: z.string().min(1),
  })
  .strict();
export type SeedUnplaceable = z.infer<typeof seedUnplaceableSchema>;

export const seedSpecSchema = z
  .object({
    /** Stable identity for this seed, used to detect a re-run rather than duplicating. */
    seedName: z.string().min(1),
    /** Which tier produced it — for the report and the playbook's grouping. */
    tier: z.enum(['fixture', 'capability', 'pairwise', 'scale', 'negative']),
    plan: seedPlanSchema,
    calendars: z.array(seedCalendarSchema),
    resources: z.array(seedResourceSchema),
    activities: z.array(seedActivitySchema),
    dependencies: z.array(seedDependencySchema),
    assignments: z.array(seedAssignmentSchema),
    unplaceable: z.array(seedUnplaceableSchema),
  })
  .strict();
export type SeedSpec = z.infer<typeof seedSpecSchema>;
