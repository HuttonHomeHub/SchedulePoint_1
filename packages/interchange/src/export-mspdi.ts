import { exportGraphSchema, type ExportGraph } from './export-graph.js';
import { mapExportGraphToCanonical } from './export-mapper.js';
import type { ExportError } from './export-xer.js';
import { MAX_ACTIVITIES, MAX_ASSIGNMENTS, MAX_DEPENDENCIES, MAX_RESOURCES } from './import-xer.js';
import { emitMspdiFromCanonical, EXPORT_MSPDI_VERSION } from './mspdi-emit.js';
import { serialiseMspdi } from './mspdi-serialiser.js';
import type { InterchangeReport, ReportFinding } from './report.js';

/**
 * The top-level **`exportMspdi` orchestrator** (ADR-0050 M4b, Task 4b.4) — the MSPDI sibling of
 * {@link exportXer}. It runs the whole pure export pipeline over a SchedulePoint {@link ExportGraph} —
 * **validate → limit → map → emit → serialise → report** — and returns the `.xml` bytes plus a
 * fully-populated {@link InterchangeReport}, or a typed rejection. It reuses the format-agnostic
 * {@link mapExportGraphToCanonical} and the shared graph-size ceilings unchanged: only the emit + serialise
 * steps differ from the XER path, which is exactly ADR-0050's claim that a format is a serialiser, not a
 * second pipeline.
 *
 * Hard rejection ({ ok: false }) is reserved for a graph that is not a consistent SchedulePoint graph (a
 * defensive schema check) or one past the shared graph-size ceiling. The emitter serialises the **full
 * plan** (M4c: core network + WBS + constraints + progress + resources + assignments); where Microsoft
 * Project cannot represent a SchedulePoint concept exactly (a secondary/mandatory constraint, suspend/resume/
 * expected-finish progress, a driving flag / production rate) it emits the nearest form and reports an
 * **approximation**, never a silent omission. Pure + deterministic: no I/O, clock or randomness. The CPM
 * engine and its recalc parity golden suite are untouched (export never invokes the engine).
 */

export interface ExportMspdiInput {
  /** The SchedulePoint plan to export, already assembled into the domain-shaped export graph. */
  readonly graph: ExportGraph;
}

export type ExportMspdiResult =
  { ok: true; bytes: Uint8Array; report: InterchangeReport } | { ok: false; error: ExportError };

/** Split a flat findings list into the report's three buckets, preserving order (mirrors exportXer). */
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

export function exportMspdi(input: ExportMspdiInput): ExportMspdiResult {
  // 1. Defensive schema check: the graph must be a consistent SchedulePoint graph before we serialise it.
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

  // 2. Shared graph-size ceiling (mirrors exportXer / importXer): never build a pathologically large file.
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

  // 3. Map export graph → canonical model (the same format-agnostic mapper the XER path uses).
  const mapped = mapExportGraphToCanonical(graph);

  // 4. Emit the canonical model → the MSPDI <Project> element tree.
  const emitted = emitMspdiFromCanonical(mapped.model);

  // 5. Serialise the tree → `.xml` bytes (UTF-8, escaped, re-parseable by parseMspdi).
  const bytes = serialiseMspdi({ root: emitted.root });

  // 6. Build the report from the union of every stage's findings + the exported counts.
  const { approximations, repairs, drops } = bucketFindings([
    ...mapped.findings,
    ...emitted.findings,
  ]);

  const wbsSummaries = graph.activities.filter((a) => a.type === 'WBS_SUMMARY').length;
  const exportedActivities = graph.activities.length - wbsSummaries;
  const constraints = graph.activities.reduce(
    (n, a) =>
      n + (a.constraintType !== null ? 1 : 0) + (a.secondaryConstraintType !== null ? 1 : 0),
    0,
  );
  const report: InterchangeReport = {
    detectedFormat: 'MSPDI',
    sourceVersion: EXPORT_MSPDI_VERSION,
    sourceFilename: null,
    mapped: {
      activities: exportedActivities,
      relationships: graph.dependencies.length,
      calendars: graph.calendars.length,
      ...(wbsSummaries > 0 ? { wbsSummaries } : {}),
      ...(constraints > 0 ? { constraints } : {}),
      ...(graph.resources.length > 0 ? { resources: graph.resources.length } : {}),
      ...(graph.assignments.length > 0 ? { assignments: graph.assignments.length } : {}),
    },
    approximations,
    repairs,
    drops,
  };

  return { ok: true, bytes, report };
}
