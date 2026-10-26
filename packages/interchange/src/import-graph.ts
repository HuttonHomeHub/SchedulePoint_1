import { z } from 'zod';

import {
  canonicalActivityTypeSchema,
  canonicalConstraintTypeSchema,
  canonicalProgressSchema,
  canonicalRelationshipTypeSchema,
  canonicalResourceKindSchema,
  type CanonicalActivityType,
  type CanonicalConstraintType,
  type CanonicalProgress,
  type CanonicalRelationshipType,
  type CanonicalResourceKind,
} from './canonical.js';
import { MAX_NOTES, NOTE_BODY_MAX } from './note-text.js';

/**
 * The **SchedulePoint import graph** (ADR-0050 mapper output).
 *
 * This is the package-local, SchedulePoint-shaped neutral graph the mapper produces from the
 * format-agnostic {@link CanonicalModel}. It is expressed in the **domain's own vocabulary** — the
 * `ActivityType` / `DependencyType` names, working-**minute** durations/lags, and calendars as
 * **weekday shift rows + dated exception windows** (the Prisma `CalendarShift` / `CalendarException` +
 * `CalendarExceptionWindow` shape) — but it deliberately does **NOT** import the API's persistence DTOs:
 * the thin NestJS `interchange` module (Task 1.5) adapts this graph to the real create-DTOs and hands
 * them to the existing hierarchy / activities / dependencies / calendars services. Keeping the graph
 * package-local keeps `@repo/interchange` pure, engine-free and free of an `apps/api` dependency.
 *
 * Every node carries a stable, source-derived **import key** (`key`); dependencies reference their
 * endpoints by that key (`predecessorKey` / `successorKey`) and calendars are referenced by key
 * (`calendarKey`), so the whole graph resolves without database ids. The API layer swaps keys for real
 * UUIDs as it creates rows.
 *
 * M1's **core network** (plan + calendars + activities + dependencies) is extended additively by M2 —
 * WBS parentage + `WBS_SUMMARY`, activity constraints + progress, and the resource library +
 * assignments — never a rewrite. Types are inferred from the Zod schemas so the schema is the single
 * source of truth (the canonical-model convention).
 */

/** A `YYYY-MM-DD` calendar date (site-local, no timezone — ADR-0023). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a "YYYY-MM-DD" date');

/**
 * The activity types an import can produce. Identical to the canonical set — the domain `ActivityType`
 * values SchedulePoint interchange supports: the M1 network kinds plus M2's `WBS_SUMMARY` (ADR-0038) and
 * `RESOURCE_DEPENDENT` (ADR-0039), and `LEVEL_OF_EFFORT` (ADR-0035 §21). `HAMMOCK` stays out of scope —
 * the `ActivityType` enum has the label but no engine code behind it, so the adapter coerces it to
 * `TASK` + reports. Re-exported here so import-graph consumers do not reach back into the canonical
 * vocabulary.
 */
export const importActivityTypeSchema = canonicalActivityTypeSchema;
export type ImportActivityType = CanonicalActivityType;

/** The four PDM dependency kinds — the exact domain `DependencyType` values (FS/SS/FF/SF). */
export const importDependencyTypeSchema = canonicalRelationshipTypeSchema;
export type ImportDependencyType = CanonicalRelationshipType;

/** The domain `ConstraintType` values (ADR-0035 §7); re-exported from the canonical vocabulary. */
export const importConstraintTypeSchema = canonicalConstraintTypeSchema;
export type ImportConstraintType = CanonicalConstraintType;

/** The domain `ResourceKind` values (ADR-0039); re-exported from the canonical vocabulary. */
export const importResourceKindSchema = canonicalResourceKindSchema;
export type ImportResourceKind = CanonicalResourceKind;

/**
 * An activity's progress → a SchedulePoint `Activity`'s progress columns. Structurally identical to the
 * canonical progress shape (the mapper is a lossless vocabulary translation), re-exported so import-graph
 * consumers stay within the domain vocabulary.
 */
export const importProgressSchema = canonicalProgressSchema;
export type ImportProgress = CanonicalProgress;

/**
 * One `[startMinute, endMinute)` working window (the Prisma `CalendarShift` / `CalendarExceptionWindow`
 * value shape). Minutes from local midnight, `[0, 1440]` (1440 = end-of-day 24:00). `start < end`
 * (midnight-crossing nights are two adjacent-day windows, never a wrap) is enforced by the mapper.
 */
export const importWorkWindowSchema = z
  .object({
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .strict();
export type ImportWorkWindow = z.infer<typeof importWorkWindowSchema>;

/** A weekly-pattern shift: a working window on one weekday (`weekday` 0 = Monday … 6 = Sunday). */
export const importCalendarShiftSchema = importWorkWindowSchema
  .extend({ weekday: z.number().int().min(0).max(6) })
  .strict();
export type ImportCalendarShift = z.infer<typeof importCalendarShiftSchema>;

/**
 * A dated calendar exception (the Prisma `CalendarException` shape): an inclusive `[startDate, endDate]`
 * range whose `windows` **replace** the weekly pattern. Zero windows = a holiday / non-working block;
 * one-or-more windows = an exceptional working period. The mapper emits single-day ranges
 * (`startDate == endDate`) since the canonical model carries one date per exception.
 */
export const importCalendarExceptionSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    label: z.string().min(1).nullable(),
    windows: z.array(importWorkWindowSchema),
  })
  .strict();
export type ImportCalendarException = z.infer<typeof importCalendarExceptionSchema>;

/**
 * The domain `CalendarScope` tiers (ADR-0053 §1): `ORG` = the shared organisation library, `PROJECT` =
 * local to one project. The mapper decides which tier each imported calendar lands at; the persisting
 * layer pins a `PROJECT` one to the **target project** of the import. MUST stay in lock-step with the
 * Prisma `CalendarScope` enum / the `CalendarScope` union in `@repo/types` — the import graph speaks the
 * domain's vocabulary, and this is the domain's.
 */
export const IMPORT_CALENDAR_SCOPES = ['ORG', 'PROJECT'] as const;
export const importCalendarScopeSchema = z.enum(IMPORT_CALENDAR_SCOPES);
export type ImportCalendarScope = z.infer<typeof importCalendarScopeSchema>;

/** A working calendar → a SchedulePoint `Calendar` (+ its shifts + exceptions). */
export const importCalendarSchema = z
  .object({
    /** Stable source-derived import key; `ImportActivity.calendarKey` / `ImportPlan.defaultCalendarKey` resolve to it. */
    key: z.string().min(1),
    name: z.string().min(1),
    /**
     * The tier to create this calendar at (ADR-0053 §5). `PROJECT` (the default an import lands at) is
     * pinned to the import's target project by the persisting layer; `ORG` joins the shared library and
     * is reserved for calendars an org-global holder must be able to hold — today, a **resource's** own
     * calendar — plus the explicit `globalCalendarScope: 'ORG'` opt-in for source *global* calendars.
     */
    scope: importCalendarScopeSchema,
    /**
     * The calendar's standard working day in hours — the target's `hoursPerDay` (ADR-0068), carried
     * straight from P6's `day_hr_cnt`. It is the day↔minute factor for every day-denominated field
     * measured on this calendar, so an import that drops it re-reads the file's own durations at
     * 24 h/day: a 5-day task on an 8 h calendar arrives as 40 working hours and reads back as 2 days.
     *
     * Absent = let the target derive it (MSPDI has no equivalent field), which is what an import has
     * always got.
     */
    hoursPerDay: z.number().positive().max(24).optional(),
    shifts: z.array(importCalendarShiftSchema),
    exceptions: z.array(importCalendarExceptionSchema),
  })
  .strict();
export type ImportCalendar = z.infer<typeof importCalendarSchema>;

/** An activity → a SchedulePoint `Activity`. `durationMinutes` is working-minutes (ADR-0036); a milestone/summary is 0. */
export const importActivitySchema = z
  .object({
    /** Stable source-derived import key (unique within the graph); dependencies reference it. */
    key: z.string().min(1),
    /** The planner-facing activity code, guaranteed unique within the graph (duplicates were suffixed + reported). */
    code: z.string().min(1),
    name: z.string().min(1),
    type: importActivityTypeSchema,
    durationMinutes: z.number().int().min(0),
    /** Import key of this activity's calendar (see {@link ImportCalendar}); null = inherit the plan default. */
    calendarKey: z.string().min(1).nullable(),
    /**
     * Import key of this activity's WBS-summary parent (a `WBS_SUMMARY` activity's key); null = a root.
     * Post-validation this resolves to an in-graph `WBS_SUMMARY` and the parent tree is acyclic (ADR-0038).
     */
    parentKey: z.string().min(1).nullable(),
    /** Primary schedule constraint (ADR-0035 §7); type + date are paired (both set, or both null). */
    constraintType: importConstraintTypeSchema.nullable(),
    constraintDate: isoDateSchema.nullable(),
    /** Secondary schedule constraint (ADR-0035 §12); type + date are paired. */
    secondaryConstraintType: importConstraintTypeSchema.nullable(),
    secondaryConstraintDate: isoDateSchema.nullable(),
    /** As-late-as-possible (ALAP) scheduling (ADR-0035 §12). */
    scheduleAsLateAsPossible: z.boolean().default(false),
    /** Progress, or null when the activity is un-progressed (NOT_STARTED with no actuals). */
    progress: importProgressSchema.nullable(),
    /**
     * The planner's **hand-placement** — where somebody dragged this bar (ADR-0148).
     *
     * **A foreign file never carries one**: P6 and MSPDI hold constraints and computed dates, never "a
     * human put it here". **SchedulePoint's own XER does** (layout-interchange, spec §0.1), in a user-
     * defined field only this application writes and reads (`xer-layout-fields.ts`), so on import it is
     * set exactly when the file came from SchedulePoint and the planner chose to restore its layout.
     *
     * On export it is how the exporter counts what a format will **not** carry, so the drop is reported
     * only when there is something to lose (`export-mapper.ts`, the one producer of that finding).
     */
    visualStart: isoDateSchema.nullish(),
    /**
     * The row this bar sits in (ADR-0069's `lane_index`), carried by SchedulePoint's own XER beside the
     * placement. Absent on a foreign import, where the commit's phase 3 packs every row; when present,
     * phase 3 keeps it and packs only the activities the file left without one (spec §4.7).
     */
    laneIndex: z.number().int().min(0).max(10_000).nullish(),
    /**
     * Import key of the swimlane this activity belongs to (an {@link ImportSwimlane}'s `key`), carried
     * by SchedulePoint's own XER (swimlanes M4-T4). Absent on a foreign import and for "No swimlane".
     */
    swimlaneKey: z.string().min(1).nullish(),
    /** The lane inside that swimlane, when the file carried one; phase 3 packs the rest. */
    swimlaneLane: z.number().int().min(0).max(10_000).nullish(),
    /**
     * The engine-derived duration of a `WBS_SUMMARY` or `LEVEL_OF_EFFORT` (ADR-0197), in working
     * minutes. **Export only**: no parser writes it, so on import it is always absent. It reaches the
     * graph so the pure mapper can hand it to the one format that states a summary's duration.
     */
    derivedDurationMinutes: z.number().int().min(0).nullish(),
  })
  .strict();
export type ImportActivity = z.infer<typeof importActivitySchema>;

/**
 * A hand-made swimlane to create (swimlanes M4-T4). The name is final — trimmed, within the database's
 * `ck_swimlanes_name_shape` and unique ignoring case — and the array order is the display order.
 */
export const importSwimlaneSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1).max(80),
  })
  .strict();
export type ImportSwimlane = z.infer<typeof importSwimlaneSchema>;

/** A resource → a SchedulePoint `Resource` (ADR-0039). `calendarKey` resolves to an {@link ImportCalendar}. */
export const importResourceSchema = z
  .object({
    /** Stable source-derived import key (unique within the graph); assignments reference it. */
    key: z.string().min(1),
    name: z.string().min(1),
    /** The planner-facing resource code; null when the source has none. */
    code: z.string().min(1).nullable(),
    kind: importResourceKindSchema,
    /** Import key of this resource's own calendar (see {@link ImportCalendar}); null = no own calendar. */
    calendarKey: z.string().min(1).nullable(),
    /** Reserved cost rate (ADR-0042); null = unset. */
    costPerUnit: z.number().nullable(),
    /** Reserved levelling capacity ceiling (ADR-0041); null = uncapped. */
    maxUnitsPerHour: z.number().nullable(),
  })
  .strict();
export type ImportResource = z.infer<typeof importResourceSchema>;

/**
 * A resource assignment → a SchedulePoint `ResourceAssignment` (ADR-0039/0040). Post-validation each
 * endpoint resolves, `(activityKey, resourceKey)` is unique, at most one assignment per activity is
 * `isDriving`, and no `MATERIAL` resource drives.
 */
export const importAssignmentSchema = z
  .object({
    /** Stable source-derived import key (unique within the graph). */
    key: z.string().min(1),
    activityKey: z.string().min(1),
    resourceKey: z.string().min(1),
    /** Budgeted units of work. Non-negative. */
    budgetedUnits: z.number().min(0),
    /** Units-per-hour rate (ADR-0040); null = the units triad is inert. Non-negative. */
    unitsPerHour: z.number().min(0).nullable(),
    isDriving: z.boolean(),
    /** Actual units of work performed. Non-negative; defaults to 0. */
    actualUnits: z.number().min(0).default(0),
    /**
     * Working minutes into the activity at which this resource joins it (ADR-0071 §1). Non-negative;
     * defaults to 0 = joins with the activity.
     *
     * On **import** no parser writes this — see `canonicalAssignmentSchema.lagMinutes` for why — so it
     * is always 0 and the import reports the capability as dropped. On **export** it is read from the
     * stored assignment, so the mapper can tell whether a real value is about to be lost and say so.
     */
    lagMinutes: z.number().int().min(0).default(0),
  })
  .strict();
export type ImportAssignment = z.infer<typeof importAssignmentSchema>;

/**
 * An activity note → a SchedulePoint `Note` (ADR-0046) on the activity named by `activityKey`. The body
 * is plain text of 1 to 5,000 characters, the shape `ck_notes_body_length` enforces; the persisting layer
 * writes it verbatim, in array order.
 */
export const importNoteSchema = z
  .object({
    activityKey: z.string().min(1),
    body: z.string().min(1).max(NOTE_BODY_MAX),
  })
  .strict();
export type ImportNote = z.infer<typeof importNoteSchema>;

/** A dependency → a SchedulePoint `ActivityDependency`. `lagMinutes` is signed working-minutes (lead = negative). */
export const importDependencySchema = z
  .object({
    /** Stable source-derived import key (unique within the graph). */
    key: z.string().min(1),
    predecessorKey: z.string().min(1),
    successorKey: z.string().min(1),
    type: importDependencyTypeSchema,
    lagMinutes: z.number().int(),
  })
  .strict();
export type ImportDependency = z.infer<typeof importDependencySchema>;

/** The plan to create → a SchedulePoint `Plan`. `dataDate` maps to `plannedStart` (the mandatory data date, ADR-0033). */
export const importPlanSchema = z
  .object({
    name: z.string().min(1),
    /** The project data date (`YYYY-MM-DD`, ADR-0023); the schedule's time anchor → `Plan.plannedStart`. */
    dataDate: isoDateSchema,
    /** Import key of the plan-default calendar (see {@link ImportCalendar}); null = all-days-work / no calendar. */
    defaultCalendarKey: z.string().min(1).nullable(),
    /**
     * Where the plan's swimlanes come from, restored from SchedulePoint's own XER (swimlanes M4-T4).
     * Absent on a foreign import, which leaves the plan at the database default (`NONE`).
     */
    swimlaneSource: z.enum(['NONE', 'MANUAL', 'WBS']).optional(),
    /** 1 to 3 when `swimlaneSource` is `WBS`, null otherwise (`ck_plans_swimlane_source_level`). */
    swimlaneWbsLevel: z.number().int().min(1).max(3).nullish(),
  })
  .strict();
export type ImportPlan = z.infer<typeof importPlanSchema>;

/**
 * The whole SchedulePoint import graph for one source project: the plan to create, its calendars,
 * activities and dependencies (M1 network), plus M2's resources and assignments. Guaranteed
 * post-validation: activity codes are unique, every dependency endpoint resolves,
 * `(predecessorKey, successorKey, type)` is unique, and the dependency graph is **acyclic** (ADR-0021);
 * WBS parents resolve to an in-graph `WBS_SUMMARY` with an acyclic tree, no dependency touches a summary
 * (ADR-0038), and every assignment endpoint resolves with the driving/material invariants held (ADR-0039).
 */
export const importGraphSchema = z
  .object({
    plan: importPlanSchema,
    calendars: z.array(importCalendarSchema),
    activities: z.array(importActivitySchema),
    dependencies: z.array(importDependencySchema),
    resources: z.array(importResourceSchema),
    assignments: z.array(importAssignmentSchema),
    /** The hand-made swimlanes to create, in display order; absent on a foreign import. */
    swimlanes: z.array(importSwimlaneSchema).max(100).optional(),
    /** Activity notes in source order; absent when the file carried none. */
    notes: z.array(importNoteSchema).max(MAX_NOTES).optional(),
  })
  .strict();
export type ImportGraph = z.infer<typeof importGraphSchema>;
