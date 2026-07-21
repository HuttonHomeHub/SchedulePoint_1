import { z } from 'zod';

/**
 * The **format-agnostic canonical interchange model** (ADR-0050).
 *
 * Both parsers (XER now, MSPDI at M3) produce this one shared, format-neutral graph; the mapper and
 * the validate/repair/report step speak only this vocabulary, so adding a format adds a parser — not a
 * second pipeline. This is deliberately scoped to **M1's core network** (project, activity,
 * relationship, calendar): WBS, constraints, progress and resources are M2 and MUST be added as new,
 * additive schemas rather than by over-designing these ones now.
 *
 * These are SchedulePoint-neutral interchange shapes, NOT the domain's Prisma/DTO types: the mapper
 * (Task 1.3) is the only place the canonical model is translated to a SchedulePoint import-DTO graph.
 * Durations and lags are already normalised to **working-minutes** (ADR-0036); dates use the ADR-0023
 * convention. Types are inferred from the Zod schemas so the schema is the single source of truth.
 *
 * M2 extends this model additively — WBS parentage + `WBS_SUMMARY` (ADR-0038), activity constraints and
 * progress (ADR-0035 §6–§12), and the resource library + assignments (ADR-0039/0040) — without reshaping
 * the M1 network fields.
 */

/** Recognised source file formats. `.mpp` is deliberately excluded (ADR-0050); MSPDI lands at M3. */
export const INTERCHANGE_FORMATS = ['XER', 'MSPDI'] as const;
export const interchangeFormatSchema = z.enum(INTERCHANGE_FORMATS);
export type InterchangeFormat = z.infer<typeof interchangeFormatSchema>;

/**
 * Canonical activity types. M1's network scope carried only `TASK` / `START_MILESTONE` /
 * `FINISH_MILESTONE`; M2 adds `WBS_SUMMARY` (the WBS-hierarchy summary node, ADR-0038) and
 * `RESOURCE_DEPENDENT` (an activity that schedules on its driving resource's calendar, ADR-0039).
 * `LEVEL_OF_EFFORT` / `HAMMOCK` remain out of scope (coerced to `TASK` + reported).
 */
export const CANONICAL_ACTIVITY_TYPES = [
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'WBS_SUMMARY',
  'RESOURCE_DEPENDENT',
] as const;
export const canonicalActivityTypeSchema = z.enum(CANONICAL_ACTIVITY_TYPES);
export type CanonicalActivityType = z.infer<typeof canonicalActivityTypeSchema>;

/** The four PDM relationship kinds (ADR-0021). */
export const CANONICAL_RELATIONSHIP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export const canonicalRelationshipTypeSchema = z.enum(CANONICAL_RELATIONSHIP_TYPES);
export type CanonicalRelationshipType = z.infer<typeof canonicalRelationshipTypeSchema>;

/**
 * SchedulePoint `ConstraintType` values (ADR-0035 §7). An activity carries a **primary** and an optional
 * **secondary** constraint slot; each is a type paired with a date (the validate step enforces the pair).
 */
export const CANONICAL_CONSTRAINT_TYPES = [
  'SNET',
  'SNLT',
  'FNET',
  'FNLT',
  'MSO',
  'MFO',
  'MANDATORY_START',
  'MANDATORY_FINISH',
] as const;
export const canonicalConstraintTypeSchema = z.enum(CANONICAL_CONSTRAINT_TYPES);
export type CanonicalConstraintType = z.infer<typeof canonicalConstraintTypeSchema>;

/** An activity's schedule progress status (ADR-0035 §6); the validate step derives it from the actuals. */
export const CANONICAL_ACTIVITY_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] as const;
export const canonicalActivityStatusSchema = z.enum(CANONICAL_ACTIVITY_STATUSES);
export type CanonicalActivityStatus = z.infer<typeof canonicalActivityStatusSchema>;

/** How an activity's %-complete is measured (ADR-0042). Defaults to `DURATION`. */
export const CANONICAL_PERCENT_COMPLETE_TYPES = ['DURATION', 'UNITS', 'PHYSICAL'] as const;
export const canonicalPercentCompleteTypeSchema = z.enum(CANONICAL_PERCENT_COMPLETE_TYPES);
export type CanonicalPercentCompleteType = z.infer<typeof canonicalPercentCompleteTypeSchema>;

/** SchedulePoint `ResourceKind` values (ADR-0039). A `MATERIAL` resource can never drive an activity. */
export const CANONICAL_RESOURCE_KINDS = ['LABOUR', 'EQUIPMENT', 'MATERIAL'] as const;
export const canonicalResourceKindSchema = z.enum(CANONICAL_RESOURCE_KINDS);
export type CanonicalResourceKind = z.infer<typeof canonicalResourceKindSchema>;

/** A `"HH:MM"` clock time (24-hour; `"24:00"` allowed as an exclusive end-of-day). */
const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]|24):[0-5]\d$/, 'expected an "HH:MM" 24-hour time (or "24:00")');

/** A `YYYY-MM-DD` calendar date (site-local, no timezone — ADR-0023). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a "YYYY-MM-DD" date');

/** A working window `[start, end)` within a day, as `"HH:MM"` clock times. */
export const canonicalShiftSchema = z
  .object({
    start: clockTimeSchema,
    end: clockTimeSchema,
  })
  .strict();
export type CanonicalShift = z.infer<typeof canonicalShiftSchema>;

/**
 * The base working week: the shifts worked on each weekday (an empty array = a non-working day).
 * Kept explicit per-day rather than a bitmask so window-only weekdays (ADR-0036) survive the round trip.
 */
export const canonicalWorkWeekSchema = z
  .object({
    monday: z.array(canonicalShiftSchema),
    tuesday: z.array(canonicalShiftSchema),
    wednesday: z.array(canonicalShiftSchema),
    thursday: z.array(canonicalShiftSchema),
    friday: z.array(canonicalShiftSchema),
    saturday: z.array(canonicalShiftSchema),
    sunday: z.array(canonicalShiftSchema),
  })
  .strict();
export type CanonicalWorkWeek = z.infer<typeof canonicalWorkWeekSchema>;

/**
 * A dated exception overriding the base week for one day: `working: false` = a holiday/non-working
 * exception (shifts empty); `working: true` = an exceptional working day with its own shifts.
 */
export const canonicalCalendarExceptionSchema = z
  .object({
    date: isoDateSchema,
    working: z.boolean(),
    shifts: z.array(canonicalShiftSchema),
  })
  .strict();
export type CanonicalCalendarException = z.infer<typeof canonicalCalendarExceptionSchema>;

/** A working calendar: a base week + dated exceptions (ADR-0036). */
export const canonicalCalendarSchema = z
  .object({
    /** Source-local identifier, unique within the file; the mapper resolves this to a SchedulePoint id. */
    id: z.string().min(1),
    name: z.string().min(1),
    workWeek: canonicalWorkWeekSchema,
    exceptions: z.array(canonicalCalendarExceptionSchema),
  })
  .strict();
export type CanonicalCalendar = z.infer<typeof canonicalCalendarSchema>;

/**
 * An activity's progress (ADR-0035 §6, ADR-0042 M2). The **schedule** %-complete (`percentComplete`)
 * drives the CPM remaining; the **physical** %-complete earns value and moves no date. `status` is
 * ultimately **derived from the actuals** by the validate step, not trusted from the source. All dates
 * follow the ADR-0023 convention; `remainingDurationMinutes` is working-minutes (ADR-0036).
 */
export const canonicalProgressSchema = z
  .object({
    status: canonicalActivityStatusSchema,
    /** Schedule %-complete, `[0, 100]`; drives the engine's remaining duration. */
    percentComplete: z.number().int().min(0).max(100),
    percentCompleteType: canonicalPercentCompleteTypeSchema.default('DURATION'),
    /** Hand-entered physical %-complete, `[0, 100]`; earns value only. Null = unset. */
    physicalPercentComplete: z.number().int().min(0).max(100).nullable(),
    actualStart: isoDateSchema.nullable(),
    actualFinish: isoDateSchema.nullable(),
    /** Remaining working-minutes (ADR-0036); null = the engine derives it. Non-negative. */
    remainingDurationMinutes: z.number().int().min(0).nullable(),
    suspendDate: isoDateSchema.nullable(),
    /** A resume date; the validate step guarantees `resumeDate >= suspendDate`. */
    resumeDate: isoDateSchema.nullable(),
    expectedFinish: isoDateSchema.nullable(),
  })
  .strict();
export type CanonicalProgress = z.infer<typeof canonicalProgressSchema>;

/**
 * A canonical activity. M1 carries the network essentials (id/code/name/type/duration/calendar); M2 adds
 * the WBS `parentId` (ADR-0038), the primary/secondary constraint slots + ALAP flag (ADR-0035 §7–§12),
 * and the nested `progress` (ADR-0035 §6). No source *scheduled* dates — the CPM engine computes them
 * post-import. `durationMinutes` is already in working-minutes.
 */
export const canonicalActivitySchema = z
  .object({
    /** Source-local identifier, unique within the file (the parser's stable row key). */
    id: z.string().min(1),
    /** The planner-facing activity code (may collide; the validate step de-duplicates + reports). */
    code: z.string().min(1),
    name: z.string().min(1),
    type: canonicalActivityTypeSchema,
    /** Working-minutes (ADR-0036); a milestone or WBS summary is 0. Non-negative. */
    durationMinutes: z.number().int().min(0),
    /** Source-local calendar id (see `CanonicalCalendar.id`); null = the project/plan default. */
    calendarId: z.string().min(1).nullable(),
    /**
     * Source-local id of this activity's WBS-summary parent (a `WBS_SUMMARY` activity's id); null = a
     * root. The validate step guarantees the target exists, is a `WBS_SUMMARY`, and that the tree is
     * acyclic (ADR-0038).
     */
    parentId: z.string().min(1).nullable(),
    /** Primary schedule constraint (ADR-0035 §7); type + date are paired (both set, or both null). */
    constraintType: canonicalConstraintTypeSchema.nullable(),
    constraintDate: isoDateSchema.nullable(),
    /** Secondary schedule constraint (ADR-0035 §12); type + date are paired. */
    secondaryConstraintType: canonicalConstraintTypeSchema.nullable(),
    secondaryConstraintDate: isoDateSchema.nullable(),
    /** As-late-as-possible (ALAP) scheduling (P6 `CS_ALAP`); replaces a type/date constraint. */
    scheduleAsLateAsPossible: z.boolean().default(false),
    /** Progress, or null when the activity is un-progressed (NOT_STARTED with no actuals). */
    progress: canonicalProgressSchema.nullable(),
  })
  .strict();
export type CanonicalActivity = z.infer<typeof canonicalActivitySchema>;

/** A canonical relationship (typed, lagged edge). Lag is in working-minutes and may be negative. */
export const canonicalRelationshipSchema = z
  .object({
    /** Source-local identifier, unique within the file. */
    id: z.string().min(1),
    predecessorId: z.string().min(1),
    successorId: z.string().min(1),
    type: canonicalRelationshipTypeSchema,
    lagMinutes: z.number().int(),
  })
  .strict();
export type CanonicalRelationship = z.infer<typeof canonicalRelationshipSchema>;

/**
 * A canonical resource → an org-scoped SchedulePoint `Resource` (ADR-0039). `cost`/`max-units` columns
 * are reserved (nullable) and unset by the M2 XER mapping; `calendarId` references a `CanonicalCalendar`.
 */
export const canonicalResourceSchema = z
  .object({
    /** Source-local identifier, unique within the file (the mapper's stable key). */
    id: z.string().min(1),
    name: z.string().min(1),
    /** The planner-facing resource code; null when the source has none. */
    code: z.string().min(1).nullable(),
    kind: canonicalResourceKindSchema,
    /** Source-local calendar id (see `CanonicalCalendar.id`); null = no own calendar. */
    calendarId: z.string().min(1).nullable(),
    /** Reserved cost rate (ADR-0042); null = unset. */
    costPerUnit: z.number().nullable(),
    /** Reserved levelling capacity ceiling (ADR-0041); null = uncapped. */
    maxUnitsPerHour: z.number().nullable(),
  })
  .strict();
export type CanonicalResource = z.infer<typeof canonicalResourceSchema>;

/**
 * A canonical resource assignment → a SchedulePoint `ResourceAssignment` join (ADR-0039/0040). At most
 * one assignment per activity may be `isDriving` and a `MATERIAL` resource may never drive — both are
 * enforced by the validate step.
 */
export const canonicalAssignmentSchema = z
  .object({
    /** Source-local identifier, unique within the file. */
    id: z.string().min(1),
    /** Source-local id of the assigned activity (see `CanonicalActivity.id`). */
    activityId: z.string().min(1),
    /** Source-local id of the assigned resource (see `CanonicalResource.id`). */
    resourceId: z.string().min(1),
    /** Budgeted units of work. Non-negative. */
    budgetedUnits: z.number().min(0),
    /** Units-per-hour rate (ADR-0040); null = the units triad is inert. Non-negative. */
    unitsPerHour: z.number().min(0).nullable(),
    isDriving: z.boolean(),
    /** Actual units of work performed (progress). Non-negative; defaults to 0. */
    actualUnits: z.number().min(0).default(0),
  })
  .strict();
export type CanonicalAssignment = z.infer<typeof canonicalAssignmentSchema>;

/** The source project → a new SchedulePoint plan. `dataDate` maps to `plannedStart` (ADR-0050 table). */
export const canonicalProjectSchema = z
  .object({
    /** Source-local project identifier. */
    id: z.string().min(1),
    name: z.string().min(1),
    /** The project data date (`YYYY-MM-DD`, ADR-0023); the schedule's time anchor. */
    dataDate: isoDateSchema,
    /** Source-local id of the plan-default calendar (see `CanonicalCalendar.id`); null = first calendar. */
    defaultCalendarId: z.string().min(1).nullable(),
  })
  .strict();
export type CanonicalProject = z.infer<typeof canonicalProjectSchema>;

/** Provenance of a parsed model — echoed into the `InterchangeReport`. */
export const canonicalSourceMetaSchema = z
  .object({
    format: interchangeFormatSchema,
    /** The source schema/tool version if the parser could read one (XER `ERMHDR`, MSPDI `SaveVersion`). */
    version: z.string().min(1).nullable(),
    /** Original upload filename, for the report only — never used as a filesystem path. */
    filename: z.string().min(1).nullable(),
  })
  .strict();
export type CanonicalSourceMeta = z.infer<typeof canonicalSourceMetaSchema>;

/**
 * The whole format-agnostic graph a parser produces for one source project. M1's core network (project,
 * calendars, activities, relationships) plus M2's org-scoped resource library + assignments (ADR-0039).
 * Multi-project sources yield one `CanonicalModel` per imported project (never a silent partial).
 */
export const canonicalModelSchema = z
  .object({
    source: canonicalSourceMetaSchema,
    project: canonicalProjectSchema,
    calendars: z.array(canonicalCalendarSchema),
    activities: z.array(canonicalActivitySchema),
    relationships: z.array(canonicalRelationshipSchema),
    resources: z.array(canonicalResourceSchema),
    assignments: z.array(canonicalAssignmentSchema),
  })
  .strict();
export type CanonicalModel = z.infer<typeof canonicalModelSchema>;
