/**
 * **The #385 parity matrix: its axes and its fixture geometry** (`docs/specs/cross-plan-day-boundary/`,
 * implementation plan M0-T1).
 *
 * Pure data, and deliberately engine-free. Two modules read it and neither may read the other:
 *
 * - `cross-plan-prediction.ts` writes down, per cell, what today's code is expected to get wrong. It
 *   is committed BEFORE the matrix is ever run (spec FC-2, the ADR-0128 ordering), so it cannot be
 *   tuned to the output.
 * - `cross-plan-twin.ts` builds the two-plan programme and its single-plan twin from the same
 *   geometry, runs both through the real engine, and reports what actually happens.
 *
 * The geometry lives here rather than in either consumer so the two cannot disagree about which
 * fixture a cell describes. A prediction about one fixture compared with a run of another would be
 * a comparison that agrees or disagrees for no reason at all.
 */

/** The four relationship kinds a cross-plan edge carries (Prisma's `DependencyType`). */
export type MatrixLinkType = 'FS' | 'SS' | 'FF' | 'SF';

/** Which bound the cell measures. Forward: the successor's early start. Backward: the predecessor's late finish. */
export type MatrixDirection = 'forward' | 'backward';

/** The activity in the plan being recalculated (forward: the successor; backward: the predecessor). */
export type MatrixLocalType = 'TASK' | 'FINISH_MILESTONE' | 'START_MILESTONE';

/** The activity in the OTHER plan, whose persisted dates the derivation reads. */
export type MatrixRemoteType = 'TASK' | 'FINISH_MILESTONE';

/**
 * The three calendars of the matrix. Both plans, and every activity in them, run on the cell's one
 * calendar: the matrix varies the calendar, not a mix of them (plan M0-T1 "calendar" axis).
 *
 * - `twentyFourHour`: every minute of every day works.
 * - `standard`: full days (00:00–24:00), Monday to Friday. The organisation stock calendar (E16).
 * - `eightHour`: Monday to Friday, 08:00–16:00, so hours-per-day is 480 (FC-4).
 */
export type MatrixCalendarName = 'twentyFourHour' | 'standard' | 'eightHour';

/** The lag calendar a link is measured on (Prisma's `LagCalendarSource`). */
export type MatrixLagCalendar =
  'PROJECT_DEFAULT' | 'PREDECESSOR' | 'SUCCESSOR' | 'TWENTY_FOUR_HOUR';

/** One cell of the matrix. `lagDays` is what a planner types: whole working days, signed. */
export interface CrossPlanMatrixCell {
  direction: MatrixDirection;
  linkType: MatrixLinkType;
  localType: MatrixLocalType;
  remoteType: MatrixRemoteType;
  calendar: MatrixCalendarName;
  lagDays: number;
  lagCalendar: MatrixLagCalendar;
}

export const MATRIX_DIRECTIONS: readonly MatrixDirection[] = ['forward', 'backward'];
export const MATRIX_LINK_TYPES: readonly MatrixLinkType[] = ['FS', 'SS', 'FF', 'SF'];
export const MATRIX_LOCAL_TYPES: readonly MatrixLocalType[] = [
  'TASK',
  'FINISH_MILESTONE',
  'START_MILESTONE',
];
export const MATRIX_REMOTE_TYPES: readonly MatrixRemoteType[] = ['TASK', 'FINISH_MILESTONE'];
export const MATRIX_CALENDARS: readonly MatrixCalendarName[] = [
  'twentyFourHour',
  'standard',
  'eightHour',
];
export const MATRIX_LAGS: readonly number[] = [-2, 0, 2];
export const MATRIX_LAG_CALENDARS: readonly MatrixLagCalendar[] = [
  'PROJECT_DEFAULT',
  'PREDECESSOR',
  'SUCCESSOR',
  'TWENTY_FOUR_HOUR',
];

/** The matrix's calendars as shift facts: which weekdays work (Monday = 0) and the one daily window. */
export const MATRIX_CALENDAR_SHAPES: Readonly<
  Record<MatrixCalendarName, { workingWeekdays: readonly number[]; open: number; close: number }>
> = {
  twentyFourHour: { workingWeekdays: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 1440 },
  standard: { workingWeekdays: [0, 1, 2, 3, 4], open: 0, close: 1440 },
  eightHour: { workingWeekdays: [0, 1, 2, 3, 4], open: 480, close: 960 },
};

/**
 * The fixture every cell is built on. Whole-day durations, nothing placed, nothing progressed: the
 * parity domain the spec states (§1, "What the decision does not settle").
 *
 * **Forward** (the downstream plan is recalculated):
 * - upstream plan: an anchor task `A` of {@link FORWARD_ANCHOR_DAYS} from the data date, then the
 *   remote predecessor `P` linked `A → P` FS lag 0. The anchor exists so that `P` does not sit on
 *   the data date. A finish milestone on the data date reports the data date itself
 *   (`finishMilestoneDisplayIndex` floors at 0), which is a separate edge case, not this matrix's.
 * - downstream plan: the local successor `S` and nothing else.
 *
 * **Backward** (the upstream plan is recalculated):
 * - upstream plan: the local predecessor `P` from the data date, plus an unlinked task `L` of
 *   {@link LONG_TASK_DAYS}, so the plan's own project finish is later than any bound and the
 *   predecessor's late finish is set by the link alone (the M0-T1 risk note: compare the bound, not
 *   a late finish that also carries the project finish).
 * - downstream plan: the remote successor `S`, pinned `FNLT` {@link BACKWARD_SUCCESSOR_FNLT}, plus a
 *   second long task so that plan's project finish does not bind `S` either. `S`'s late dates are
 *   then the pin's, identically in both worlds.
 *
 * The dates are chosen so no cell reaches the data-date floor (N25), so every lead and every
 * subtracted duration shows, and so the Standard and eight-hour calendars cross weekends in several
 * cells: the anchor ends on a Wednesday, `P` runs Thursday to Monday, and `S`'s pinned finish is a
 * Wednesday whose late start is the Monday.
 */
export const MATRIX_DATA_DATE = '2026-01-05'; // a Monday
export const FORWARD_ANCHOR_DAYS = 8;
/** Every task in the matrix (`P` and `S`) is this many working days long. */
export const MATRIX_TASK_DAYS = 3;
export const LONG_TASK_DAYS = 60;
export const BACKWARD_SUCCESSOR_FNLT = '2026-02-11'; // a Wednesday

/** Every cell, in a fixed order (direction, link type, local, remote, calendar, lag, lag calendar). */
export function enumerateMatrix(): CrossPlanMatrixCell[] {
  const cells: CrossPlanMatrixCell[] = [];
  for (const direction of MATRIX_DIRECTIONS)
    for (const linkType of MATRIX_LINK_TYPES)
      for (const localType of MATRIX_LOCAL_TYPES)
        for (const remoteType of MATRIX_REMOTE_TYPES)
          for (const calendar of MATRIX_CALENDARS)
            for (const lagDays of MATRIX_LAGS)
              for (const lagCalendar of MATRIX_LAG_CALENDARS)
                cells.push({
                  direction,
                  linkType,
                  localType,
                  remoteType,
                  calendar,
                  lagDays,
                  lagCalendar,
                });
  return cells;
}

/** A cell's name states every axis, so a failure names its cell without a lookup (plan M2-T6 risk). */
export function cellName(cell: CrossPlanMatrixCell): string {
  const lag = cell.lagDays > 0 ? `+${cell.lagDays}` : String(cell.lagDays);
  return [
    cell.direction,
    cell.linkType,
    `local=${cell.localType}`,
    `remote=${cell.remoteType}`,
    cell.calendar,
    `lag=${lag}`,
    cell.lagCalendar,
  ].join(' ');
}
