import { exportGraphSchema, type ExportGraph } from './export-graph.js';
import { mapExportGraphToCanonical } from './export-mapper.js';
import { MAX_ACTIVITIES, MAX_ASSIGNMENTS, MAX_DEPENDENCIES, MAX_RESOURCES } from './import-xer.js';
import type { InterchangeReport, ReportFinding } from './report.js';
import { emitXerFromCanonical, EXPORT_XER_VERSION } from './xer-emit.js';
import { serialiseXer } from './xer-serialiser.js';

/**
 * The top-level **`exportXer` orchestrator** (ADR-0050 M4, Task 4a.4) — the mirror of {@link importXer}. It
 * runs the whole pure export pipeline over a SchedulePoint {@link ExportGraph} — **validate → limit →
 * map → emit → serialise → report** — and returns the `.xer` bytes plus a fully-populated
 * {@link InterchangeReport} that names every best-effort coercion/drop, or a typed rejection. The thin,
 * read-only `interchange` module reads a plan into the export graph and calls this.
 *
 * Hard rejection ({ ok: false }) is reserved for a graph that is not a consistent SchedulePoint graph
 * (a defensive schema check) or one past the shared graph-size ceiling. Everything the M4a core-network
 * scope cannot yet serialise (WBS / constraints / progress / resources — all M4c) is **dropped and
 * reported**, never a silent omission. Pure + deterministic: no I/O, clock or randomness. The CPM engine
 * and its recalc parity golden suite are untouched (export never invokes the engine).
 */

export interface ExportXerInput {
  /** The SchedulePoint plan to export, already assembled into the domain-shaped export graph. */
  readonly graph: ExportGraph;
}

/** A typed, user-safe export rejection. `stage` says where it failed; `code`/`message` never leak internals. */
export interface ExportError {
  readonly stage: 'validate' | 'limit';
  readonly code: string;
  readonly message: string;
}

export type ExportXerResult =
  { ok: true; bytes: Uint8Array; report: InterchangeReport } | { ok: false; error: ExportError };

/** Split a flat findings list into the report's three buckets, preserving order (mirrors importXer). */
function bucketFindings(findings: readonly ReportFinding[]): {
  approximations: ReportFinding[];
  repairs: ReportFinding[];
  drops: ReportFinding[];
} {
  const approximations: ReportFinding[] = [];
  const repairs: ReportFinding[] = [];
  const drops: ReportFinding[] = [];
  for (const finding of findings) {
    if (finding.kind === 'approximation') approximations.push(finding);
    else if (finding.kind === 'repair') repairs.push(finding);
    else drops.push(finding);
  }
  return { approximations, repairs, drops };
}

export function exportXer(input: ExportXerInput): ExportXerResult {
  // 1. Defensive schema check: the graph must be a consistent SchedulePoint graph before we serialise it.
  //    The API layer builds this from trusted domain rows, so a failure here is an internal invariant
  //    breach, surfaced as a typed reject rather than a malformed file.
  const parsed = exportGraphSchema.safeParse(input.graph);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        stage: 'validate',
        code: 'INCONSISTENT_GRAPH',
        message:
          'The plan could not be assembled into a consistent SchedulePoint graph for export.',
      },
    };
  }
  const graph = parsed.data;

  // 2. Shared graph-size ceiling (mirrors importXer): never build a pathologically large file.
  if (graph.activities.length > MAX_ACTIVITIES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_ACTIVITIES',
        message: `This plan has ${graph.activities.length} activities, above the ${MAX_ACTIVITIES}-activity export limit.`,
      },
    };
  }
  if (graph.dependencies.length > MAX_DEPENDENCIES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_DEPENDENCIES',
        message: `This plan has ${graph.dependencies.length} relationships, above the ${MAX_DEPENDENCIES}-relationship export limit.`,
      },
    };
  }
  if (graph.resources.length > MAX_RESOURCES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_RESOURCES',
        message: `This plan has ${graph.resources.length} resources, above the ${MAX_RESOURCES}-resource export limit.`,
      },
    };
  }
  if (graph.assignments.length > MAX_ASSIGNMENTS) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_ASSIGNMENTS',
        message: `This plan has ${graph.assignments.length} resource assignments, above the ${MAX_ASSIGNMENTS}-assignment export limit.`,
      },
    };
  }

  // 3. Map export graph → canonical model.
  const mapped = mapExportGraphToCanonical(graph);

  // 4. Emit the canonical model → XER tables (PROJECT/CALENDAR/TASK/TASKPRED).
  const emitted = emitXerFromCanonical(mapped.model);

  // 5. Serialise the tables → `.xer` bytes (UTF-8, re-parseable by parseXer).
  const bytes = serialiseXer({
    version: EXPORT_XER_VERSION,
    exportDate: mapped.model.project.dataDate,
    tables: emitted.tables,
  });

  // 6. Build the report from the union of every stage's findings + the exported counts.
  const { approximations, repairs, drops } = bucketFindings([
    ...mapped.findings,
    ...emitted.findings,
  ]);

  const exportedActivities = graph.activities.filter((a) => a.type !== 'WBS_SUMMARY').length;
  const report: InterchangeReport = {
    detectedFormat: 'XER',
    sourceVersion: EXPORT_XER_VERSION,
    sourceFilename: null,
    mapped: {
      activities: exportedActivities,
      relationships: graph.dependencies.length,
      calendars: graph.calendars.length,
    },
    approximations,
    repairs,
    drops,
  };

  return { ok: true, bytes, report };
}
