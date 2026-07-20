import { z } from 'zod';

import {
  canonicalActivityTypeSchema,
  canonicalRelationshipTypeSchema,
  type CanonicalActivityType,
  type CanonicalRelationshipType,
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
 * Scope is M1's **core network** (plan + calendars + activities + dependencies); WBS, constraints,
 * progress and resources are M2 and extend this schema additively (never a rewrite). Types are inferred
 * from the Zod schemas so the schema is the single source of truth (the canonical-model convention).
 */

/** A `YYYY-MM-DD` calendar date (site-local, no timezone — ADR-0023). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a "YYYY-MM-DD" date');

/**
 * The activity types an M1 import can produce. Identical to the canonical set — a strict subset of the
 * domain `ActivityType` (LEVEL_OF_EFFORT / WBS_SUMMARY / HAMMOCK / RESOURCE_DEPENDENT are out of M1
 * scope; the adapter coerces them to `TASK` + reports). Re-exported here so import-graph consumers do
 * not reach back into the canonical vocabulary.
 */
export const importActivityTypeSchema = canonicalActivityTypeSchema;
export type ImportActivityType = CanonicalActivityType;

/** The four PDM dependency kinds — the exact domain `DependencyType` values (FS/SS/FF/SF). */
export const importDependencyTypeSchema = canonicalRelationshipTypeSchema;
export type ImportDependencyType = CanonicalRelationshipType;

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

/** An activity → a SchedulePoint `Activity`. `durationMinutes` is working-minutes (ADR-0036); a milestone is 0. */
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
  })
  .strict();
export type ImportActivity = z.infer<typeof importActivitySchema>;

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
 * The whole SchedulePoint import graph for one source project (M1 network scope): the plan to create,
 * its calendars, activities and dependencies. Guaranteed post-validation: activity codes are unique,
 * every dependency endpoint resolves, `(predecessorKey, successorKey, type)` is unique, and the
 * dependency graph is **acyclic** (ADR-0021).
 */
export const importGraphSchema = z
  .object({
    plan: importPlanSchema,
    calendars: z.array(importCalendarSchema),
    activities: z.array(importActivitySchema),
    dependencies: z.array(importDependencySchema),
  })
  .strict();
export type ImportGraph = z.infer<typeof importGraphSchema>;
