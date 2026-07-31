import { z } from 'zod';

import { interchangeFormatSchema } from './canonical.js';

/**
 * The **`InterchangeReport`** — the runtime instance of ADR-0050's mapping contract and the realisation
 * of the ADR-0035 **reject / repair / report** rule: every source entity is either mapped (counted) or
 * named here as approximated, repaired, or dropped, with a reason. Nothing changes silently.
 *
 * The shape is deliberately **extensible**: `entity` is an open string and the three finding arrays
 * accept any entity kind, so M2 (WBS/constraints/progress/resources) adds report entries — not a schema
 * change. This model is validated with Zod and its schemas are shared with the web review dialog
 * (spec §2); it is engine-free and never touches the CPM parity gate.
 */

/**
 * The class of a report finding:
 * - `approximation` — a value was coerced to the nearest supported form (e.g. an unsupported constraint
 *   kind → the nearest supported type; hours/days → working-minutes).
 * - `repair` — a structural fix that kept the graph valid (dangling edge dropped, duplicate
 *   `(pred,succ,type)` de-duplicated, a cycle broken at a chosen edge, a duplicate code suffixed).
 * - `drop` — an out-of-scope source concept that was not imported at all (UDFs, roles, expenses, …).
 */
export const REPORT_FINDING_KINDS = ['approximation', 'repair', 'drop'] as const;
export const reportFindingKindSchema = z.enum(REPORT_FINDING_KINDS);
export type ReportFindingKind = z.infer<typeof reportFindingKindSchema>;

/** One line in the report. Open `entity` string keeps the shape stable as the domain grows (M2+). */
export const reportFindingSchema = z
  .object({
    kind: reportFindingKindSchema,
    /** The affected entity kind, e.g. `"activity"`, `"relationship"`, `"calendar"`, `"project"`. */
    entity: z.string().min(1),
    /** Source-local id/code of the affected item, for traceability; null when not attributable to one. */
    sourceRef: z.string().min(1).nullable(),
    /** Human-readable summary, e.g. `'lag "3d" → 4320min'` or `'edge A→B dropped: unknown successor'`. */
    detail: z.string().min(1),
    /** Why the finding occurred (the mapping-contract reason); optional when `detail` is self-explanatory. */
    reason: z.string().min(1).optional(),
  })
  .strict();
export type ReportFinding = z.infer<typeof reportFindingSchema>;

/**
 * Counts of successfully mapped entities. The M1 network keys (`activities` counts real activities, i.e.
 * excluding WBS summaries; `relationships`; `calendars`) are always present. M2 adds `wbsSummaries`,
 * `constraints`, `resources` and `assignments` — **omitted when zero**, so consumers must treat a missing
 * key as 0. Extended additively per milestone; the schema stays `.strict()`.
 */
export const interchangeCountsSchema = z
  .object({
    activities: z.number().int().min(0),
    relationships: z.number().int().min(0),
    calendars: z.number().int().min(0),
    /** WBS-summary activities (ADR-0038); absent = 0. */
    wbsSummaries: z.number().int().min(0).optional(),
    /** Activity constraints (primary + secondary, ADR-0035 §7); absent = 0. */
    constraints: z.number().int().min(0).optional(),
    /** Resources in the imported library (ADR-0039); absent = 0. */
    resources: z.number().int().min(0).optional(),
    /** Resource assignments (ADR-0039); absent = 0. */
    assignments: z.number().int().min(0).optional(),
  })
  .strict();
export type InterchangeCounts = z.infer<typeof interchangeCountsSchema>;

/**
 * What to do about an imported resource whose **name** is already taken in the target organisation.
 *
 * This is deliberately **not** a `ReportFinding`. The three finding kinds all describe something the
 * import already decided; a collision is a question it cannot answer alone. A resource library is
 * org-global and levelling, over-allocation and Earned Value all read from one pool, so guessing has
 * consequences a report line cannot undo: reuse the wrong row and the file's rates and calendar are
 * silently discarded, duplicate it and one crew's demand is split across two rows that each look
 * half-loaded.
 *
 * Calendars take the opposite route on purpose (`IMPORTED_NAME_SUFFIX`) — a duplicated calendar is
 * inert until something is scheduled on it, so suffixing is safe there and merely noisy.
 */
export const RESOURCE_COLLISION_RESOLUTIONS = ['REUSE_EXISTING', 'CREATE_COPY'] as const;
export const resourceCollisionResolutionSchema = z.enum(RESOURCE_COLLISION_RESOLUTIONS);
export type ResourceCollisionResolution = z.infer<typeof resourceCollisionResolutionSchema>;

export const resourceCollisionSchema = z
  .object({
    /** The import graph's key for the incoming resource — what a resolution is keyed by. */
    resourceKey: z.string().min(1),
    /** The incoming resource's name: the value that collided. */
    name: z.string().min(1),
    /** The incoming resource's code, when the source file carries one. */
    code: z.string().min(1).nullable(),
    /** The library row it collides with, named so a planner can tell whether it is the same crew. */
    existing: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        code: z.string().min(1).nullable(),
        /** Archived rows still collide — archive is orthogonal to delete (ADR-0053 §4). */
        archived: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ResourceCollision = z.infer<typeof resourceCollisionSchema>;

/** The full pre-commit / post-commit interchange report shown in the dry-run review dialog. */
export const interchangeReportSchema = z
  .object({
    detectedFormat: interchangeFormatSchema,
    /** The source schema/tool version if detectable (XER `ERMHDR`, MSPDI `SaveVersion`); null otherwise. */
    sourceVersion: z.string().min(1).nullable(),
    /** Original upload filename (display only); null when not supplied. */
    sourceFilename: z.string().min(1).nullable(),
    mapped: interchangeCountsSchema,
    approximations: z.array(reportFindingSchema),
    repairs: z.array(reportFindingSchema),
    drops: z.array(reportFindingSchema),
    /**
     * Resource-name collisions the planner must resolve before the commit will run. **Optional, and
     * absent means none** — the same additive idiom the `mapped` sub-counts use, so every consumer
     * predating this field keeps working. Only the API populates it: detecting a collision needs the
     * org library, which the pure package deliberately cannot see.
     */
    resourceCollisions: z.array(resourceCollisionSchema).optional(),
  })
  .strict();
export type InterchangeReport = z.infer<typeof interchangeReportSchema>;
