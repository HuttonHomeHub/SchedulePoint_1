import type { ActivityType } from '@prisma/client';

/**
 * **The revision delta** — what entered and left the critical path between two computed schedules,
 * and how far the completion moved. One pure function over two projections.
 *
 * **It never says why.** The response carries no field naming a cause, and that is a decision
 * rather than an omission: attributing a path change to one edit requires a sequential replay whose
 * per-change attribution was measured to be order-dependent (30, 18, 2 or 0 working days for the
 * same change depending only on its position), while the TOTAL is order-free. The epic's Tier 3 was
 * withdrawn on that measurement. A structural gate over this file bans causal field names, so the
 * next contributor's "helpful" `cause` field fails rather than ships.
 *
 * No engine, no I/O, no dates parsed twice. `computeSchedule` is not imported here and the ADR-0034
 * recalculation parity gate is untouched by construction.
 */

/**
 * One activity as either side projects it. **Both sides project to this same shape**, which is what
 * makes baseline-vs-baseline free: the function cannot tell which side came from `baseline_activities`
 * and which from `activities`, so it cannot treat them differently.
 *
 * Dates are `YYYY-MM-DD`, matching what both tables persist. `totalFloatDays` is nullable and the
 * null is meaningful — see `floatMovementDays`.
 */
export interface RevisionRow {
  /** The correlation key. On the frozen side this is `source_activity_id`, on the live side `id`. */
  readonly activityId: string;
  readonly code: string | null;
  readonly name: string;
  readonly type: ActivityType;
  readonly isCritical: boolean;
  /** Working days, in the activity's own calendar. NULL means unknown, never zero. */
  readonly totalFloatDays: number | null;
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
}

/** A row that changed criticality, with both sides' numbers so the reader need not ask again. */
export interface RevisionMovedRow {
  readonly activityId: string;
  readonly code: string | null;
  readonly name: string;
  readonly fromTotalFloatDays: number | null;
  readonly toTotalFloatDays: number | null;
  /** `to - from`, or **null** if either side is unknown. Absence and zero are different facts. */
  readonly floatMovementDays: number | null;
  readonly fromEarlyStart: string | null;
  readonly toEarlyStart: string | null;
  readonly fromEarlyFinish: string | null;
  readonly toEarlyFinish: string | null;
}

/** An activity present on only one side. Appearing is not entering. */
export interface RevisionPresenceRow {
  readonly activityId: string;
  readonly code: string | null;
  readonly name: string;
  readonly isCritical: boolean;
}

export type CompletionReason = 'CARRIER_REMOVED' | 'PLAN_NOT_SCHEDULED';

export interface RevisionCompletion {
  readonly assessable: boolean;
  /** Present iff `assessable`. */
  readonly reason?: CompletionReason;
  readonly carrierActivityId?: string;
  readonly carrierName?: string;
  readonly fromFinish?: string | null;
  readonly toFinish?: string | null;
  /** Positive = later. Calendar days between the two ISO dates; see `daysBetweenIso`. */
  readonly movementDays?: number | null;
  /**
   * True when the NEW side's own latest-finishing non-summary activity is a different activity.
   * A fact a planner wants, and not a cause.
   */
  readonly carrierChanged?: boolean;
  readonly newSideCarrierActivityId?: string;
  readonly newSideCarrierName?: string;
}

export interface RevisionDelta {
  readonly entered: readonly RevisionMovedRow[];
  readonly left: readonly RevisionMovedRow[];
  readonly enteredTotal: number;
  readonly leftTotal: number;
  readonly remainedCriticalCount: number;
  readonly remainedNonCriticalCount: number;
  readonly added: readonly RevisionPresenceRow[];
  readonly removed: readonly RevisionPresenceRow[];
  readonly completion: RevisionCompletion;
  /** Reused from ADR-0116 M6 rather than reinvented: neither side has a critical activity. */
  readonly noCriticalPath: boolean;
}

/**
 * A `WBS_SUMMARY` is excluded from `entered`/`left` and from carrier selection. Its dates are a
 * rollup over its children (`engine/compute.ts:544-553`), so it is never critical, never driving and
 * never the thing that finished last in any sense a planner means. Reporting one would be noise.
 */
function isSummary(row: RevisionRow): boolean {
  return row.type === 'WBS_SUMMARY';
}

/** Whole days between two `YYYY-MM-DD` dates, positive when `to` is later. */
export function daysBetweenIso(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * The completion carrier over DATE-denominated rows: the latest-finishing non-summary activity,
 * ties broken by id ascending.
 *
 * **This is `selectCompletionCarrier`'s rule, and deliberately not its code.** That function takes
 * `EngineResult[]` and sorts on `earlyFinishOffset`, which is **minutes**; these rows carry a
 * persisted `YYYY-MM-DD`, so there is no signature under which one function serves both without one
 * caller inventing a precision it does not have.
 *
 * The consequence is measured and must be reported rather than hidden: **under a same-day tie the
 * two can pick different activities**, because minutes separate what a date does not. M0's F2 limb
 * exercised exactly that and recorded it as a residual. The panel therefore NAMES the carrier and
 * states the tie-break; it does not present the movement as if the choice were unique. Do not
 * "reconcile" the two by pretending a date carries minutes.
 */
export function selectCarrierFromRows(rows: readonly RevisionRow[]): RevisionRow | undefined {
  return rows
    .filter((r) => !isSummary(r) && r.earlyFinish !== null)
    .sort(
      (x, y) =>
        (x.earlyFinish! < y.earlyFinish! ? 1 : x.earlyFinish! > y.earlyFinish! ? -1 : 0) ||
        x.activityId.localeCompare(y.activityId),
    )[0];
}

/** `to - from`, or null when either side is unknown. Absence and zero are different facts. */
function floatMovement(from: number | null, to: number | null): number | null {
  return from === null || to === null ? null : to - from;
}

function moved(from: RevisionRow, to: RevisionRow): RevisionMovedRow {
  return {
    activityId: to.activityId,
    code: to.code,
    name: to.name,
    fromTotalFloatDays: from.totalFloatDays,
    toTotalFloatDays: to.totalFloatDays,
    floatMovementDays: floatMovement(from.totalFloatDays, to.totalFloatDays),
    fromEarlyStart: from.earlyStart,
    toEarlyStart: to.earlyStart,
    fromEarlyFinish: from.earlyFinish,
    toEarlyFinish: to.earlyFinish,
  };
}

function presence(row: RevisionRow): RevisionPresenceRow {
  return { activityId: row.activityId, code: row.code, name: row.name, isCritical: row.isCritical };
}

/**
 * Ordering: float movement descending, ties by `code` then `activityId`.
 *
 * **It is an ordering, not a ranking of blame.** The row at the top moved the most float; it is not
 * "the cause". The panel says so in words, and this comment exists so the next reader does not
 * quietly relabel the column.
 */
function byMovementThenCodeThenId(a: RevisionMovedRow, b: RevisionMovedRow): number {
  const am = a.floatMovementDays;
  const bm = b.floatMovementDays;
  // Nulls sort last: an unknown movement is not a large one.
  if (am !== bm) {
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return bm - am;
  }
  return (a.code ?? '').localeCompare(b.code ?? '') || a.activityId.localeCompare(b.activityId);
}

/**
 * The delta. `cap` bounds `entered`/`left`; the TRUE totals are returned alongside, because
 * "showing 50 of 412" is never a client's own number (ADR-0116 D4).
 */
export function computeRevisionDelta(
  fromRows: readonly RevisionRow[],
  toRows: readonly RevisionRow[],
  cap: number,
): RevisionDelta {
  const fromById = new Map(fromRows.map((r) => [r.activityId, r]));
  const toById = new Map(toRows.map((r) => [r.activityId, r]));

  const entered: RevisionMovedRow[] = [];
  const left: RevisionMovedRow[] = [];
  const added: RevisionPresenceRow[] = [];
  const removed: RevisionPresenceRow[] = [];
  let remainedCriticalCount = 0;
  let remainedNonCriticalCount = 0;

  for (const to of toRows) {
    const from = fromById.get(to.activityId);
    if (!from) {
      // **Appearing is not entering**, even when the new row is critical on arrival. It did not
      // enter a path it was never off. The tempting implementation reports both; a case asserts
      // that this one does not.
      added.push(presence(to));
      continue;
    }
    // A summary is excluded from the criticality sets but is NOT dropped from the union: it is
    // present on both sides and is counted as having remained, so the four sets still total.
    if (isSummary(to) || isSummary(from)) {
      if (to.isCritical && from.isCritical) remainedCriticalCount += 1;
      else if (!to.isCritical && !from.isCritical) remainedNonCriticalCount += 1;
      else remainedNonCriticalCount += 1;
      continue;
    }
    if (to.isCritical && !from.isCritical) entered.push(moved(from, to));
    else if (!to.isCritical && from.isCritical) left.push(moved(from, to));
    else if (to.isCritical) remainedCriticalCount += 1;
    else remainedNonCriticalCount += 1;
  }

  for (const from of fromRows) {
    if (!toById.has(from.activityId)) removed.push(presence(from));
  }

  entered.sort(byMovementThenCodeThenId);
  left.sort(byMovementThenCodeThenId);

  const fromCarrier = selectCarrierFromRows(fromRows);
  const toCarrier = selectCarrierFromRows(toRows);
  const completion = ((): RevisionCompletion => {
    if (!fromCarrier || !toCarrier) return { assessable: false, reason: 'PLAN_NOT_SCHEDULED' };
    const sameActivityOnNewSide = toById.get(fromCarrier.activityId);
    if (!sameActivityOnNewSide || sameActivityOnNewSide.earlyFinish === null) {
      // The old side's carrier is gone. The completion movement is not assessable — and the
      // criticality delta above is still returned, which is the point of separating them.
      return {
        assessable: false,
        reason: 'CARRIER_REMOVED',
        carrierActivityId: fromCarrier.activityId,
        carrierName: fromCarrier.name,
      };
    }
    const carrierChanged = toCarrier.activityId !== fromCarrier.activityId;
    return {
      assessable: true,
      carrierActivityId: fromCarrier.activityId,
      carrierName: fromCarrier.name,
      fromFinish: fromCarrier.earlyFinish,
      toFinish: sameActivityOnNewSide.earlyFinish,
      movementDays:
        fromCarrier.earlyFinish === null
          ? null
          : daysBetweenIso(fromCarrier.earlyFinish, sameActivityOnNewSide.earlyFinish),
      carrierChanged,
      ...(carrierChanged
        ? { newSideCarrierActivityId: toCarrier.activityId, newSideCarrierName: toCarrier.name }
        : {}),
    };
  })();

  return {
    entered: entered.slice(0, cap),
    left: left.slice(0, cap),
    enteredTotal: entered.length,
    leftTotal: left.length,
    remainedCriticalCount,
    remainedNonCriticalCount,
    added,
    removed,
    completion,
    noCriticalPath:
      !fromRows.some((r) => r.isCritical && !isSummary(r)) &&
      !toRows.some((r) => r.isCritical && !isSummary(r)),
  };
}
