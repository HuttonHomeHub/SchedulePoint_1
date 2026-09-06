import {
  REVISION_FREE_CHANGE_CLASSES,
  REVISION_PAID_CHANGE_CLASSES,
  type RevisionChangeClass,
  type RevisionChangeReport,
  type RevisionChangeRow,
  type RevisionClassAssessment,
  type RevisionFreeChangeClass,
  type RevisionNotAssessableReason,
  type RevisionPaidChangeClass,
} from '@repo/types';

import type { RevisionRow } from './revision-delta';

/**
 * **The change list** — what was added, removed, renamed, re-coded, re-typed, re-durationed,
 * re-dated, and what happened to float and criticality, between two of a plan's revisions.
 *
 * One pure function over the same two projections the delta reads. No engine, no I/O.
 * `computeSchedule` is not imported here and the ADR-0034 recalculation parity gate is untouched by
 * construction — the structural gate over this file's family asserts it rather than trusting this
 * sentence.
 *
 * ## It says WHAT moved, never WHY
 *
 * The same refusal the delta carries, and it matters more here. A change list puts
 * "Piling 20 d → 35 d" on screen next to a completion that moved nineteen days, and a reader will
 * join them — so will a contributor, in code. Attribution was measured to be order-dependent (the
 * same change scoring 30, 18, 2 or 0 working days by position alone) while the total is order-free,
 * and Tier 3 was withdrawn on that measurement rather than deferred. So rows are ordered by **time,
 * never by magnitude**: a list sorted by "biggest change first" is a ranking, and a ranking of
 * changes beside a slipped date is a causal claim wearing a table's clothes.
 *
 * ## Eight classes here, six deliberately absent
 *
 * A baseline freezes the engine's **output** and almost none of its **input**. Everything below
 * falls out of columns `BaselineActivity` already holds, so this whole module needs **no migration**
 * — which is why it ships first. Logic, constraints, calendar, WBS parent, lane and progress are
 * *inputs*, are not frozen, and arrive with the snapshot extension. Until then a comparison reports
 * them as **not assessable with a reason**, never as "no change": see {@link RevisionChangeReport}.
 */

/**
 * **The vocabulary lives in `@repo/types`, not here.** These are re-exported under the names this
 * module and its tests already use, so there is ONE definition of what a change class is — a
 * second copy beside the DTO would drift, and the drift would surface as a class the API can
 * return and the client cannot name.
 */
export const FREE_CHANGE_CLASSES = REVISION_FREE_CHANGE_CLASSES;
export const PAID_CHANGE_CLASSES = REVISION_PAID_CHANGE_CLASSES;
export type FreeChangeClass = RevisionFreeChangeClass;
export type PaidChangeClass = RevisionPaidChangeClass;
export type ChangeClass = RevisionChangeClass;
export type NotAssessableReason = RevisionNotAssessableReason;
export type ChangeRow = RevisionChangeRow;
export type ClassAssessment = RevisionClassAssessment;
export type { RevisionChangeReport };

/** Formats a duration for display without asserting a day factor the caller has not supplied. */
function minutesLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${String(minutes)} min`;
}

function labelOf(row: RevisionRow, changeClass: FreeChangeClass): string | null {
  switch (changeClass) {
    case 'RENAMED':
      return row.name;
    case 'RECODED':
      return row.code;
    case 'RETYPED':
      return row.type;
    case 'REDURATIONED':
      return minutesLabel(row.durationMinutes);
    case 'REDATED':
      return row.earlyStart === null || row.earlyFinish === null
        ? null
        : `${row.earlyStart} → ${row.earlyFinish}`;
    case 'CRITICALITY':
      return row.isCritical ? 'critical' : `float ${String(row.totalFloatDays ?? '?')} d`;
    case 'ADDED':
    case 'REMOVED':
      return row.name;
  }
}

function changed(from: RevisionRow, to: RevisionRow, changeClass: FreeChangeClass): boolean {
  switch (changeClass) {
    case 'RENAMED':
      return from.name !== to.name;
    case 'RECODED':
      return from.code !== to.code;
    case 'RETYPED':
      return from.type !== to.type;
    case 'REDURATIONED':
      // **Minutes, never days.** `hours_per_day_minutes` is frozen per capture, so two baselines of
      // one plan can carry different day-to-minute factors — comparing days would report a pure
      // calendar edit as a duration change (ADR-0068).
      return from.durationMinutes !== to.durationMinutes;
    case 'REDATED':
      return from.earlyStart !== to.earlyStart || from.earlyFinish !== to.earlyFinish;
    case 'CRITICALITY':
      return from.isCritical !== to.isCritical || from.totalFloatDays !== to.totalFloatDays;
    case 'ADDED':
    case 'REMOVED':
      return false;
  }
}

function orderKeyOf(from: RevisionRow | null, to: RevisionRow | null): string | null {
  const candidates = [from?.earlyStart, to?.earlyStart].filter(
    (d): d is string => typeof d === 'string',
  );
  if (candidates.length === 0) return null;
  return candidates.sort()[0] ?? null;
}

/** Programme order, with a stable tie-break so two runs cannot disagree. A null date sorts last. */
function byTime(a: ChangeRow, b: ChangeRow): number {
  if (a.orderKey !== b.orderKey) {
    if (a.orderKey === null) return 1;
    if (b.orderKey === null) return -1;
    return a.orderKey < b.orderKey ? -1 : 1;
  }
  return a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0;
}

export interface ClassifyOptions {
  /** Whether each side has a computed schedule. A side without one cannot be compared on dates. */
  readonly fromScheduled: boolean;
  readonly toScheduled: boolean;
  /**
   * Whether both sides recorded the paid classes. False for any baseline captured before the
   * snapshot extension — which is permanent for those rows, because writing today's logic into a
   * historic snapshot would state as history a graph that baseline never saw.
   */
  readonly bothSnapshotted: boolean;
  /** Whether the caller asked for the progress class (opt-in — it changes on nearly every row). */
  readonly includeProgress: boolean;
  readonly cap: number;
}

/**
 * Classify the differences between two revisions of one plan.
 *
 * `from` and `to` are the same projection the delta uses, so this cannot tell which side came from
 * `baseline_activities` and which from `activities` — which is what makes baseline-vs-baseline free.
 */
export function classifyRevisionChanges(
  fromRows: readonly RevisionRow[],
  toRows: readonly RevisionRow[],
  options: ClassifyOptions,
): RevisionChangeReport {
  const { fromScheduled, toScheduled, bothSnapshotted, includeProgress, cap } = options;
  const fromById = new Map(fromRows.map((r) => [r.activityId, r]));
  const toById = new Map(toRows.map((r) => [r.activityId, r]));

  const bucket = new Map<FreeChangeClass, ChangeRow[]>();
  for (const c of FREE_CHANGE_CLASSES) bucket.set(c, []);

  for (const to of toRows) {
    const from = fromById.get(to.activityId);
    if (!from) {
      bucket.get('ADDED')?.push({
        activityId: to.activityId,
        changeClass: 'ADDED',
        code: to.code,
        name: to.name,
        from: null,
        to: labelOf(to, 'ADDED'),
        orderKey: orderKeyOf(null, to),
      });
      continue;
    }
    for (const c of FREE_CHANGE_CLASSES) {
      if (c === 'ADDED' || c === 'REMOVED') continue;
      if (!changed(from, to, c)) continue;
      bucket.get(c)?.push({
        activityId: to.activityId,
        changeClass: c,
        code: to.code,
        name: to.name,
        from: labelOf(from, c),
        to: labelOf(to, c),
        orderKey: orderKeyOf(from, to),
      });
    }
  }

  for (const from of fromRows) {
    if (toById.has(from.activityId)) continue;
    bucket.get('REMOVED')?.push({
      activityId: from.activityId,
      changeClass: 'REMOVED',
      code: from.code,
      name: from.name,
      from: labelOf(from, 'REMOVED'),
      to: null,
      orderKey: orderKeyOf(from, null),
    });
  }

  // **A date-bearing class is not assessable when either side has no computed schedule.** Reporting
  // it as "nothing changed" would be a lie whose shape a reader cannot detect: an unscheduled side
  // has NO dates, so every row would look unmoved.
  const datesUnavailable = !fromScheduled || !toScheduled;
  const dateBearing = new Set<FreeChangeClass>(['REDATED', 'CRITICALITY']);

  const classes: ClassAssessment[] = FREE_CHANGE_CLASSES.map((changeClass) => {
    if (datesUnavailable && dateBearing.has(changeClass)) {
      return { changeClass, notAssessableReason: 'SIDE_NOT_SCHEDULED', rows: [], total: 0 };
    }
    const rows = (bucket.get(changeClass) ?? []).sort(byTime);
    return { changeClass, notAssessableReason: null, rows: rows.slice(0, cap), total: rows.length };
  });

  for (const changeClass of PAID_CHANGE_CLASSES) {
    if (changeClass === 'PROGRESSED' && !includeProgress) continue;
    classes.push({
      changeClass,
      // Reported, never omitted. `bothSnapshotted` false is permanent for the rows involved.
      notAssessableReason: bothSnapshotted ? null : 'NOT_SNAPSHOTTED',
      rows: [],
      total: 0,
    });
  }

  return { classes, cap };
}
