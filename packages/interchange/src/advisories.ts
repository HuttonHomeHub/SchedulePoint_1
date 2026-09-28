import type { ImportGraph } from './import-graph.js';
import type { ImportAdvisory } from './report.js';

/** The sentence every zero-duration advisory carries (ADR-0162 decision 2, spec US-2). */
export const ZERO_DURATION_ADVISORY_DETAIL =
  'imported as a task with no duration; a zero-length event is usually a milestone — convert it after import';

/**
 * **One advisory per activity that arrived as a zero-duration task** (ADR-0162 D1/D2, M5-T1).
 *
 * Read over the FINAL import graph, after validate/repair, so it names exactly the activities the
 * commit will create. An advisory is never a finding: the task was imported faithfully, and filing
 * it as an approximation, repair or drop would say the import lost something it did not (spec E12).
 *
 * The predicate restates `isZeroDurationTask` (`@repo/types`) — `type === 'TASK'` and no duration —
 * because this pure package deliberately depends on nothing of the application's. That the two agree
 * over every activity type is asserted in `apps/api` (`zero-duration-predicate.spec.ts`), which
 * imports both. A milestone, a level of effort, a WBS summary and a resource-dependent activity are
 * dated by their own rules, so none of them produces an advisory.
 *
 * Returns `[]` rather than `undefined`; the orchestrators attach the key only when it is non-empty,
 * so a file with no such activity produces a report byte-identical to one written before the field
 * existed (FC-5 (a)).
 */
export function zeroDurationAdvisories(graph: Pick<ImportGraph, 'activities'>): ImportAdvisory[] {
  return graph.activities
    .filter((a) => isZeroDurationImportTask(a.type, a.durationMinutes))
    .map((a) => ({
      code: 'ZERO_DURATION_TASK' as const,
      entity: 'activity' as const,
      sourceRef: a.code,
      detail: ZERO_DURATION_ADVISORY_DETAIL,
    }));
}

/** `isZeroDurationTask`, restated for this package (see {@link zeroDurationAdvisories}). */
export function isZeroDurationImportTask(type: string, durationMinutes: number): boolean {
  return type === 'TASK' && durationMinutes === 0;
}
