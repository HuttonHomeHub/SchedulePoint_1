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
  })
  .strict();
export type InterchangeReport = z.infer<typeof interchangeReportSchema>;
