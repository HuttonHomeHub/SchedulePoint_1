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
 * `RESOURCE_DEPENDENT` (ADR-0039). LEVEL_OF_EFFORT / HAMMOCK stay out of scope (the adapter coerces them
 * to `TASK` + reports). Re-exported here so import-graph consumers do not reach back into the canonical
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

/** A working calendar → a SchedulePoint `Calendar` (+ its shifts + exceptions). */
export const importCalendarSchema = z
  .object({
    /** Stable source-derived import key; `ImportActivity.calendarKey` / `ImportPlan.defaultCalendarKey` resolve to it. */
    key: z.string().min(1),
    name: z.string().min(1),
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
  })
  .strict();
export type ImportActivity = z.infer<typeof importActivitySchema>;

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
  })
  .strict();
export type ImportAssignment = z.infer<typeof importAssignmentSchema>;

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
  })
  .strict();
export type ImportGraph = z.infer<typeof importGraphSchema>;
