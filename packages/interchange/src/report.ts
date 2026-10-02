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

/**
 * **Two modes, one field list (ADR-0162 D9; closes `docs/TECH_DEBT.md` #387).** The report is written
 * in one place and read in another, and the two are released independently: the web and API images are
 * recreated separately (ADR-0047), so a browser tab loaded from one release routinely reads a report
 * written by the next. Until D9 every object here was `.strict()`, so one new nested count made the
 * dry-run fail with "Something went wrong" in every tab a release behind. ADR-0156 avoided that only by
 * shipping each reader a release before its producer, a convention nothing enforced.
 *
 * - **`strip`** is what a **reader** uses. An unknown key is dropped at **every** object level: the top
 *   level, `mapped`, each finding, each resource collision and its `existing` row. #387's one recorded
 *   instance was a nested count, so a top-level-only fix would not have avoided it. Known keys are
 *   validated exactly as before: an unknown finding kind or a negative count is still refused.
 *   Tolerance is for keys, never for values.
 * - **`strict`** is what the **producer's own tests** use, so an undeclared key a producer emits still
 *   fails where the producer lives. That keeps the drift-catching job `.strict()` did.
 *
 * Both come from {@link buildReportSchemas} over the same shapes, so the two modes cannot disagree about
 * which fields exist.
 */
export type ReportSchemaMode = 'strip' | 'strict';

function objectIn<S extends z.ZodRawShape>(mode: ReportSchemaMode, shape: S) {
  return mode === 'strict' ? z.strictObject(shape) : z.object(shape);
}

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

/**
 * The closed vocabulary of **import advisories** (ADR-0162 D1/D2). An advisory is not a finding: the
 * three finding kinds each describe something the import did to the data (coerced, repaired, left
 * out), and an advisory describes something it imported **faithfully** that the planner probably
 * wants to change afterwards. Filing one as a finding would make it read as a loss the import caused.
 *
 * - `ZERO_DURATION_TASK` — a task that arrived with no duration. A zero-length event is usually a
 *   milestone, and the two are dated by different conventions (ADR-0155, ADR-0162), so the planner is
 *   told which activities they are and left to convert them.
 */
export const IMPORT_ADVISORY_CODES = ['ZERO_DURATION_TASK'] as const;
export const importAdvisoryCodeSchema = z.enum(IMPORT_ADVISORY_CODES);
export type ImportAdvisoryCode = z.infer<typeof importAdvisoryCodeSchema>;

/**
 * **Ceilings for the report's free text (closes `docs/TECH_DEBT.md` #399).** Every string here is
 * echoed from an uploaded file or interpolated from one, so none had a bound but the upload size.
 *
 * - {@link REPORT_LABEL_MAX_LENGTH} (512) — an identifier or name a finding points at: `entity`,
 *   `sourceRef`, a resource's `name`/`code`/`resourceKey`, the `existing` row, `sourceVersion`,
 *   `sourceFilename`. The widest value the product itself stores for such a thing is 200 (activity and
 *   resource names, `CreateActivityDto`), and a relationship's `sourceRef` joins two of them
 *   (`A→B`), so 512 clears 2 × 200 plus the separator with room, and no value the product accepts can
 *   reach it.
 * - {@link REPORT_SENTENCE_MAX_LENGTH} (2000) — a sentence: `detail` and `reason`. A detail quotes up to
 *   two 200-character names inside a sentence, so ~600 is the longest the importer writes today;
 *   2000 matches the longest free-text field the activities API takes (`description`).
 *
 * Both are reached only by a file whose own strings are longer than anything the product can store.
 */
export const REPORT_LABEL_MAX_LENGTH = 512;
export const REPORT_SENTENCE_MAX_LENGTH = 2000;

/** Builds every report schema in one mode. The only place the report's fields are declared. */
export function buildReportSchemas(mode: ReportSchemaMode) {
  /** One line in the report. Open `entity` string keeps the shape stable as the domain grows (M2+). */
  const finding = objectIn(mode, {
    kind: reportFindingKindSchema,
    /** The affected entity kind, e.g. `"activity"`, `"relationship"`, `"calendar"`, `"project"`. */
    entity: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH),
    /** Source-local id/code of the affected item, for traceability; null when not attributable to one. */
    sourceRef: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
    /** Human-readable summary, e.g. `'lag "3d" → 4320min'` or `'edge A→B dropped: unknown successor'`. */
    detail: z.string().min(1).max(REPORT_SENTENCE_MAX_LENGTH),
    /** Why the finding occurred (the mapping-contract reason); optional when `detail` is self-explanatory. */
    reason: z.string().min(1).max(REPORT_SENTENCE_MAX_LENGTH).optional(),
  });

  /**
   * Counts of successfully mapped entities. The M1 network keys (`activities` counts real activities,
   * i.e. excluding WBS summaries; `relationships`; `calendars`) are always present. M2 adds
   * `wbsSummaries`, `constraints`, `resources` and `assignments`, **omitted when zero**, so consumers
   * must treat a missing key as 0. Extended additively per milestone.
   */
  const counts = objectIn(mode, {
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
    /**
     * Hand-placed starts restored from SchedulePoint's own XER (layout-interchange); absent = 0, which
     * is every foreign file and every import with the layout switched off.
     */
    placements: z.number().int().min(0).optional(),
    /** Activities whose row was restored from SchedulePoint's own XER; absent = 0. */
    lanes: z.number().int().min(0).optional(),
  });

  /** One advisory line: which activity, by its source code, and a sentence saying what to do. */
  const advisory = objectIn(mode, {
    code: importAdvisoryCodeSchema,
    /** The affected entity kind; every advisory so far is about an activity. */
    entity: z.literal('activity'),
    /** The activity's source code, the identifier the planner knows it by; null when it has none. */
    sourceRef: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
    /** Human-readable sentence, e.g. "imported as a task with no duration; …". */
    detail: z.string().min(1).max(REPORT_SENTENCE_MAX_LENGTH),
  });

  const collision = objectIn(mode, {
    /** The import graph's key for the incoming resource — what a resolution is keyed by. */
    resourceKey: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH),
    /** The incoming resource's name: the value that collided. */
    name: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH),
    /** The incoming resource's code, when the source file carries one. */
    code: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
    /** The library row it collides with, named so a planner can tell whether it is the same crew. */
    existing: objectIn(mode, {
      id: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH),
      name: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH),
      code: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
      /** Archived rows still collide — archive is orthogonal to delete (ADR-0053 §4). */
      archived: z.boolean(),
    }),
  });

  /** The full pre-commit / post-commit interchange report shown in the dry-run review dialog. */
  const report = objectIn(mode, {
    detectedFormat: interchangeFormatSchema,
    /** The source schema/tool version if detectable (XER `ERMHDR`, MSPDI `SaveVersion`); null otherwise. */
    sourceVersion: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
    /** Original upload filename (display only); null when not supplied. */
    sourceFilename: z.string().min(1).max(REPORT_LABEL_MAX_LENGTH).nullable(),
    mapped: counts,
    approximations: z.array(finding),
    repairs: z.array(finding),
    drops: z.array(finding),
    /**
     * Resource-name collisions the planner must resolve before the commit will run. **Optional, and
     * absent means none**: the same additive idiom the `mapped` sub-counts use. Only the API populates
     * it: detecting a collision needs the org library, which the pure package deliberately cannot see.
     */
    resourceCollisions: z.array(collision).optional(),
    /**
     * What the import brought in faithfully that the planner probably wants to change (ADR-0162).
     * **Optional, and absent means none**: a report with nothing to advise carries no key at all, so a
     * file with no such activity produces a report byte-identical to one written before the field
     * existed. Never an empty array.
     */
    advisories: z.array(advisory).optional(),
  });

  return { finding, counts, advisory, collision, report };
}

const readerSchemas = buildReportSchemas('strip');

/** A report finding, read tolerantly (see {@link ReportSchemaMode}). */
export const reportFindingSchema = readerSchemas.finding;
export type ReportFinding = z.infer<typeof reportFindingSchema>;

/** The mapped counts, read tolerantly. */
export const interchangeCountsSchema = readerSchemas.counts;
export type InterchangeCounts = z.infer<typeof interchangeCountsSchema>;

/** An import advisory, read tolerantly. */
export const importAdvisorySchema = readerSchemas.advisory;
export type ImportAdvisory = z.infer<typeof importAdvisorySchema>;

/** A resource-name collision, read tolerantly. */
export const resourceCollisionSchema = readerSchemas.collision;
export type ResourceCollision = z.infer<typeof resourceCollisionSchema>;

/**
 * The report as a **reader** parses it: unknown keys stripped at every level, known keys validated
 * strictly. Every web parse site uses this.
 */
export const interchangeReportSchema = readerSchemas.report;
export type InterchangeReport = z.infer<typeof interchangeReportSchema>;

/**
 * The same report, refusing any key it does not declare. For the **producer's** tests only: a reader
 * that used it would break the next time the report gained a field.
 */
export const interchangeReportStrictSchema = buildReportSchemas('strict').report;

/** Cut `value` to `max` UTF-16 units ending in an ellipsis, never splitting a surrogate pair. */
function clampText(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = max - 1;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}…`;
}

function clampFinding(f: ReportFinding): ReportFinding {
  return {
    ...f,
    entity: clampText(f.entity, REPORT_LABEL_MAX_LENGTH),
    sourceRef: f.sourceRef === null ? null : clampText(f.sourceRef, REPORT_LABEL_MAX_LENGTH),
    detail: clampText(f.detail, REPORT_SENTENCE_MAX_LENGTH),
    ...(f.reason === undefined ? {} : { reason: clampText(f.reason, REPORT_SENTENCE_MAX_LENGTH) }),
  };
}

/**
 * **Bound the report's free text by truncating it, not by refusing it (#399).** The schema's `max()`
 * is what a reader enforces, and a reader that refuses an over-long string fails the whole dry-run
 * dialog over one cosmetic field — turning a valid import into an unreadable one. Truncating where
 * the report is built cannot do that: the full value is still in the imported data, and the report
 * only ever described it. Applied by the importers and by the API's response mapper, the last place
 * the API adds findings of its own.
 */
export function boundReport(report: InterchangeReport): InterchangeReport {
  return {
    ...report,
    sourceVersion:
      report.sourceVersion === null
        ? null
        : clampText(report.sourceVersion, REPORT_LABEL_MAX_LENGTH),
    sourceFilename:
      report.sourceFilename === null
        ? null
        : clampText(report.sourceFilename, REPORT_LABEL_MAX_LENGTH),
    approximations: report.approximations.map(clampFinding),
    repairs: report.repairs.map(clampFinding),
    drops: report.drops.map(clampFinding),
    ...(report.resourceCollisions === undefined
      ? {}
      : {
          resourceCollisions: report.resourceCollisions.map((c) => ({
            ...c,
            resourceKey: clampText(c.resourceKey, REPORT_LABEL_MAX_LENGTH),
            name: clampText(c.name, REPORT_LABEL_MAX_LENGTH),
            code: c.code === null ? null : clampText(c.code, REPORT_LABEL_MAX_LENGTH),
            existing: {
              ...c.existing,
              id: clampText(c.existing.id, REPORT_LABEL_MAX_LENGTH),
              name: clampText(c.existing.name, REPORT_LABEL_MAX_LENGTH),
              code:
                c.existing.code === null
                  ? null
                  : clampText(c.existing.code, REPORT_LABEL_MAX_LENGTH),
            },
          })),
        }),
    ...(report.advisories === undefined
      ? {}
      : {
          advisories: report.advisories.map((a) => ({
            ...a,
            sourceRef:
              a.sourceRef === null ? null : clampText(a.sourceRef, REPORT_LABEL_MAX_LENGTH),
            detail: clampText(a.detail, REPORT_SENTENCE_MAX_LENGTH),
          })),
        }),
  };
}
