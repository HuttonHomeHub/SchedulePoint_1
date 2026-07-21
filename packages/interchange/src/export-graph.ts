import {
  importActivitySchema,
  importAssignmentSchema,
  importCalendarSchema,
  importDependencySchema,
  importGraphSchema,
  importPlanSchema,
  importResourceSchema,
  type ImportActivity,
  type ImportAssignment,
  type ImportCalendar,
  type ImportDependency,
  type ImportGraph,
  type ImportPlan,
  type ImportResource,
} from './import-graph.js';

/**
 * The **SchedulePoint export graph** (ADR-0050 M4) — the package-local, domain-shaped input to the pure
 * exporter, the mirror image of {@link ImportGraph}. The thin, read-only `interchange` module reads a
 * plan's core network (plan + calendars + activities + FS/SS/FF/SF dependencies, plus M4c's WBS /
 * constraints / progress / resources) via existing repositories, assembles it into this graph, and hands
 * it to `exportXer` / `exportMspdi` — keeping `@repo/interchange` pure, engine-free and free of any
 * `apps/api` dependency, exactly as the import direction keeps the graph package-local.
 *
 * **Why this reuses the import-graph shape rather than duplicating it.** Import and export target the
 * *identical* SchedulePoint domain shape — the same `ActivityType` / `DependencyType` vocabulary, the same
 * working-**minute** durations/lags, and calendars as weekday **minute** shift rows + dated exception
 * windows. Defining a byte-for-byte-identical second Zod surface would only invite the two to drift and
 * would make the round-trip equivalence (export graph vs. re-imported graph, Task 4a.4) compare two
 * nominally-different types for no gain. So the export graph **is** the domain graph shape, re-exported
 * here under export-oriented names (a deliberate, documented refinement of the plan's "share only enums":
 * the domain shape is one thing, read one way and written the other). Keys are stable domain identifiers
 * (an activity's id/code); the exporter resolves the graph by key without any database access.
 */

/** A calendar to export → its P6 `CALENDAR` / MSPDI `<Calendar>` row (shifts + dated exceptions). */
export const exportCalendarSchema = importCalendarSchema;
export type ExportCalendar = ImportCalendar;

/** An activity to export → a P6 `TASK` / MSPDI `<Task>` row. `durationMinutes` is working-minutes (ADR-0036). */
export const exportActivitySchema = importActivitySchema;
export type ExportActivity = ImportActivity;

/** A dependency to export → a P6 `TASKPRED` / MSPDI `<PredecessorLink>`. `lagMinutes` is signed working-minutes. */
export const exportDependencySchema = importDependencySchema;
export type ExportDependency = ImportDependency;

/** A resource to export → a P6 `RSRC` / MSPDI `<Resource>` (M4c). */
export const exportResourceSchema = importResourceSchema;
export type ExportResource = ImportResource;

/** A resource assignment to export → a P6 `TASKRSRC` / MSPDI `<Assignment>` (M4c). */
export const exportAssignmentSchema = importAssignmentSchema;
export type ExportAssignment = ImportAssignment;

/** The plan being exported → the P6 `PROJECT` / MSPDI `<Project>` header. `dataDate` is the mandatory data date. */
export const exportPlanSchema = importPlanSchema;
export type ExportPlan = ImportPlan;

/**
 * The whole SchedulePoint export graph for one plan: the plan header, its calendars, activities and
 * dependencies (the M4a core network), plus M4c's resources and assignments. It is read from **already
 * valid** domain data, so — unlike the import graph, which is the mapper's pre-validation output — an
 * export graph is assumed consistent (unique codes, resolvable endpoints, an acyclic DAG); the exporter
 * still defends with the strict schema before serialising (Task 4a.4).
 */
export const exportGraphSchema = importGraphSchema;
export type ExportGraph = ImportGraph;
