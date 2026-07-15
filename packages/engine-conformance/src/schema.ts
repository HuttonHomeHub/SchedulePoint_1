import { z } from 'zod';

/**
 * Zod schema for the P6-class conformance fixture (`fixtures/p6_torture_test_v1.json`) and the
 * hostile inputs (`fixtures/negative_cases.json`), pinned to `schema_version` (ADR-0034).
 *
 * The schema exists to make **fixture drift a reviewed change**: the generator (`fixtures/tools/`)
 * can be re-run, but a shape change that isn't reflected here fails the loader tests. Every key
 * present in the current fixture is modelled, so a faithful round-trip holds; scheduling-semantic
 * enums (activity type, relationship type, status, constraints) are validated strictly, while
 * descriptive free-text catalogues stay permissive to avoid brittleness.
 *
 * These are the fixture's own field names (P6 vocabulary), deliberately NOT SchedulePoint's domain
 * types — the adapter (M0-B) is the only place the two are mapped.
 */

const isoDateTime = z.string(); // ISO-8601 local, no timezone (site-local); or a plain YYYY-MM-DD.

export const ACTIVITY_TYPES = [
  'TASK_DEPENDENT',
  'RESOURCE_DEPENDENT',
  'LEVEL_OF_EFFORT',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'WBS_SUMMARY',
] as const;

export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;

export const ACTIVITY_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export const DURATION_TYPES = [
  'FIXED_DURATION_AND_UNITS_TIME',
  'FIXED_DURATION_AND_UNITS',
  'FIXED_UNITS',
  'FIXED_UNITS_TIME',
] as const;

export const PERCENT_COMPLETE_TYPES = ['DURATION', 'PHYSICAL', 'UNITS'] as const;

export const CONSTRAINT_TYPES = [
  'START_ON',
  'START_ON_OR_AFTER',
  'START_ON_OR_BEFORE',
  'FINISH_ON',
  'FINISH_ON_OR_AFTER',
  'FINISH_ON_OR_BEFORE',
  'AS_LATE_AS_POSSIBLE',
  'MANDATORY_START',
  'MANDATORY_FINISH',
] as const;

const constraintSchema = z.object({
  type: z.enum(CONSTRAINT_TYPES),
  date: isoDateTime.nullable(),
});

/** A work window `[start, end]` as `"HH:MM"` strings (end may be `"24:00"`). */
const workWindow = z.tuple([z.string(), z.string()]);

const calendarExceptionSchema = z.object({
  date: z.string().optional(),
  date_range: z.tuple([z.string(), z.string()]).optional(),
  work: z.array(workWindow),
  note: z.string().optional(),
});

const workweekSchema = z.object({
  MON: z.array(workWindow),
  TUE: z.array(workWindow),
  WED: z.array(workWindow),
  THU: z.array(workWindow),
  FRI: z.array(workWindow),
  SAT: z.array(workWindow),
  SUN: z.array(workWindow),
});

export const calendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  is_default: z.boolean().optional(),
  hours_per_day: z.number(),
  hours_per_week: z.number(),
  hours_per_month: z.number().optional(),
  hours_per_year: z.number().optional(),
  workweek: workweekSchema,
  exceptions: z.array(calendarExceptionSchema),
  test_tags: z.array(z.string()).optional(),
});

export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
  wbs: z.string(),
  activity_type: z.enum(ACTIVITY_TYPES),
  calendar: z.string(),
  original_duration_h: z.number(),
  original_duration_days_display: z.number(),
  remaining_duration_h: z.number(),
  duration_type: z.enum(DURATION_TYPES),
  percent_complete_type: z.enum(PERCENT_COMPLETE_TYPES),
  status: z.enum(ACTIVITY_STATUSES),
  actual_start: isoDateTime.nullable(),
  actual_finish: isoDateTime.nullable(),
  suspend_date: isoDateTime.nullable(),
  resume_date: isoDateTime.nullable(),
  duration_percent_complete: z.number(),
  physical_percent_complete: z.number(),
  units_percent_complete: z.number(),
  primary_constraint: constraintSchema.nullable(),
  secondary_constraint: constraintSchema.nullable(),
  expected_finish: isoDateTime.nullable(),
  external_early_start: isoDateTime.nullable(),
  external_late_finish: isoDateTime.nullable(),
  activity_codes: z.record(z.string(), z.string()),
  udfs: z.record(z.string(), z.unknown()),
  test_tags: z.array(z.string()),
  note: z.string().nullable(),
});

export const relationshipSchema = z.object({
  id: z.string(),
  predecessor: z.string(),
  successor: z.string(),
  type: z.enum(DEPENDENCY_TYPES),
  lag_h: z.number(),
  lag_calendar: z.string().nullable(),
  test_tags: z.array(z.string()),
  note: z.string().nullable(),
});

export const resourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  max_units_per_hour: z.number().nullable(),
  price_per_unit: z.number(),
  unit_of_measure: z.string(),
  calendar: z.string(),
});

export const assignmentSchema = z.object({
  id: z.string(),
  activity: z.string(),
  resource: z.string(),
  role: z.string().nullable(),
  units_per_hour: z.number(),
  budgeted_units: z.number(),
  actual_units: z.number(),
  remaining_units: z.number(),
  at_completion_units: z.number(),
  curve: z.string(),
  assignment_lag_h: z.number(),
  test_tags: z.array(z.string()),
  note: z.string().nullable(),
});

export const stepSchema = z.object({
  activity: z.string(),
  seq: z.number(),
  name: z.string(),
  weight: z.number(),
  percent_complete: z.number(),
});

export const expenseSchema = z.object({
  id: z.string(),
  activity: z.string(),
  name: z.string(),
  cost_account: z.string(),
  budgeted_cost: z.number(),
  actual_cost: z.number(),
  accrual_type: z.string(),
  test_tags: z.array(z.string()),
});

export const resourceCurveSchema = z.object({
  id: z.string(),
  name: z.string(),
  points: z.array(z.number()),
  test_tags: z.array(z.string()),
});

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  resources: z.array(z.string()),
});

export const wbsSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  name: z.string(),
});

export const activityCodeTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.string(),
  values: z.array(z.string()),
});

export const udfDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  type: z.string(),
});

export const scenarioSchema = z.object({
  id: z.string(),
  description: z.string(),
  overrides: z.record(z.string(), z.unknown()),
  assertions: z.array(z.string()),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  planned_start: isoDateTime,
  data_date: isoDateTime,
  must_finish_by: isoDateTime,
  default_calendar: z.string(),
  scheduling_options: z.record(z.string(), z.unknown()),
});

export const fixtureMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  duration_unit: z.string(),
  currency: z.string(),
  datetime_format: z.string(),
});

export const fixtureSchema = z.object({
  schema_version: z.string(),
  fixture: fixtureMetaSchema,
  project: projectSchema,
  calendars: z.array(calendarSchema),
  wbs: z.array(wbsSchema),
  activity_code_types: z.array(activityCodeTypeSchema),
  udf_definitions: z.array(udfDefinitionSchema),
  resource_curves: z.array(resourceCurveSchema),
  roles: z.array(roleSchema),
  resources: z.array(resourceSchema),
  activities: z.array(activitySchema),
  relationships: z.array(relationshipSchema),
  assignments: z.array(assignmentSchema),
  steps: z.array(stepSchema),
  expenses: z.array(expenseSchema),
  scenarios: z.array(scenarioSchema),
  coverage_index: z.record(z.string(), z.array(z.string())),
});

/**
 * The hostile-input file (`negative_cases.json`). Each case carries only the sub-objects it needs
 * to be invalid, so activities/relationships/etc. are loose partials — the point is to load them
 * one at a time and assert the engine rejects/repairs/reports, never that they are well-formed.
 */
export const negativeCaseSchema = z.object({
  id: z.string(),
  expect: z.string(),
  description: z.string().optional(),
  assertion: z.string().optional(),
  activities: z.array(z.record(z.string(), z.unknown())).optional(),
  relationships: z.array(z.record(z.string(), z.unknown())).optional(),
  calendars: z.array(z.record(z.string(), z.unknown())).optional(),
  assignments: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const negativeCasesSchema = z.object({
  schema_version: z.string(),
  purpose: z.string(),
  cases: z.array(negativeCaseSchema),
});

export type ConformanceFixture = z.infer<typeof fixtureSchema>;
export type FixtureActivity = z.infer<typeof activitySchema>;
export type FixtureRelationship = z.infer<typeof relationshipSchema>;
export type FixtureCalendar = z.infer<typeof calendarSchema>;
export type FixtureResource = z.infer<typeof resourceSchema>;
export type FixtureAssignment = z.infer<typeof assignmentSchema>;
export type FixtureScenario = z.infer<typeof scenarioSchema>;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];
export type NegativeCases = z.infer<typeof negativeCasesSchema>;
export type NegativeCase = z.infer<typeof negativeCaseSchema>;

/** The `schema_version` this loader is written against; a mismatch is a reviewed change (ADR-0034). */
export const SUPPORTED_SCHEMA_VERSION = '1.0';
