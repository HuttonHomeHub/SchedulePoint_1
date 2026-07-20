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
 */

/** Recognised source file formats. `.mpp` is deliberately excluded (ADR-0050); MSPDI lands at M3. */
export const INTERCHANGE_FORMATS = ['XER', 'MSPDI'] as const;
export const interchangeFormatSchema = z.enum(INTERCHANGE_FORMATS);
export type InterchangeFormat = z.infer<typeof interchangeFormatSchema>;

/**
 * Canonical activity types for the M1 network scope. `WBS_SUMMARY`, `LEVEL_OF_EFFORT` and
 * `RESOURCE_DEPENDENT` are intentionally absent until their milestones (ADR-0038/0039/0040).
 */
export const CANONICAL_ACTIVITY_TYPES = ['TASK', 'START_MILESTONE', 'FINISH_MILESTONE'] as const;
export const canonicalActivityTypeSchema = z.enum(CANONICAL_ACTIVITY_TYPES);
export type CanonicalActivityType = z.infer<typeof canonicalActivityTypeSchema>;

/** The four PDM relationship kinds (ADR-0021). */
export const CANONICAL_RELATIONSHIP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export const canonicalRelationshipTypeSchema = z.enum(CANONICAL_RELATIONSHIP_TYPES);
export type CanonicalRelationshipType = z.infer<typeof canonicalRelationshipTypeSchema>;

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
 * A canonical activity. M1 carries the network essentials only — no source dates (the CPM engine
 * computes them post-import); progress is M2. `durationMinutes` is already in working-minutes.
 */
export const canonicalActivitySchema = z
  .object({
    /** Source-local identifier, unique within the file (the parser's stable row key). */
    id: z.string().min(1),
    /** The planner-facing activity code (may collide; the validate step de-duplicates + reports). */
    code: z.string().min(1),
    name: z.string().min(1),
    type: canonicalActivityTypeSchema,
    /** Working-minutes (ADR-0036); a milestone is 0. Non-negative. */
    durationMinutes: z.number().int().min(0),
    /** Source-local calendar id (see `CanonicalCalendar.id`); null = the project/plan default. */
    calendarId: z.string().min(1).nullable(),
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
 * The whole format-agnostic graph a parser produces for one source project (M1 network scope).
 * Multi-project sources yield one `CanonicalModel` per imported project (never a silent partial).
 */
export const canonicalModelSchema = z
  .object({
    source: canonicalSourceMetaSchema,
    project: canonicalProjectSchema,
    calendars: z.array(canonicalCalendarSchema),
    activities: z.array(canonicalActivitySchema),
    relationships: z.array(canonicalRelationshipSchema),
  })
  .strict();
export type CanonicalModel = z.infer<typeof canonicalModelSchema>;
