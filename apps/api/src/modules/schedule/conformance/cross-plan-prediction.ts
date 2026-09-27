import {
  BACKWARD_SUCCESSOR_FNLT,
  FORWARD_ANCHOR_DAYS,
  LONG_TASK_DAYS,
  MATRIX_CALENDAR_SHAPES,
  MATRIX_DATA_DATE,
  MATRIX_TASK_DAYS,
  type CrossPlanMatrixCell,
  type MatrixCalendarName,
} from './cross-plan-matrix';

/**
 * **The written prediction for every cell of the #385 parity matrix** (spec FC-2; plan M0-T1 step 1).
 *
 * Committed on its own, before the matrix is run against today's code, so the red run can disagree
 * with it. A cell with no prediction cannot "agree", so this covers every cell rather than the base
 * case §4.2 tabulates.
 *
 * **What it is and is not.** It imports neither the engine nor the derivation, and it was written
 * without running either. It is a hand model of two worlds, each rule cited to the spec row that
 * states it:
 *
 * - **One plan (the in-plan engine, E3).** A finish is the exclusive end boundary after its last
 *   working minute; a start is the beginning of its first working minute. FS/SS take the
 *   predecessor's finish/start plus the lag, walked in working minutes on the lag calendar; FF/SF
 *   then walk the successor's duration back on its own calendar; the backward bounds mirror that.
 *   The lag is `lagDays × factor`, the factor being the lag calendar's hours-per-day (1440 for
 *   `TWENTY_FOUR_HOUR`; E6's "in-plan write").
 * - **Two plans, today (E1, E2, E5–E9).** The upstream activity's persisted dates are whole days
 *   (E15). A task's start date is its first working day and its finish date its last; a finish
 *   milestone's dates are the day it closes (ADR-0155, the spec's edge-case table row 1). The
 *   derivation adds whole calendar days (E1, E5). The stored lag is `lagDays × 1440` whatever the
 *   calendar and is read back ÷ 1440 (E6), so today it is `lagDays` calendar days. The lag
 *   calendar is ignored (E7). A duration is `round(minutes ÷ 1440)` calendar days (E8). The engine
 *   then reads the bare date: forward, as the start of that day, or the end of it for a finish
 *   milestone (E2); backward, as the end of that day, the start of it for a zero-duration activity,
 *   or the end of it for a finish milestone (E9, E11).
 *
 * **The disagreement** is the two-plan answer minus the one-plan answer, in working days on the
 * cell's calendar: forward, the successor's early start; backward, the predecessor's late finish.
 * Negative forward is "early" (an optimistic start); positive backward is "loose" (overstated
 * float). The §4.2 table is the base case of this model (24-hour calendar, lag 0, a task at the
 * remote end), and `cross-plan-prediction.spec.ts` asserts that the model reproduces it cell for
 * cell, so the model and the spec's table cannot silently disagree.
 *
 * **Where §4.2 is silent, the rule used is stated.** §4.2 does not say which remote type it assumes;
 * the model reads it as a task. For a finish-milestone remote the persisted date means the end of
 * that day at both ends (ADR-0155 D3), so the start-anchored rows (forward SS/SF) and the
 * start-anchored backward rows (FS/SS) shift by one day from §4.2's. The weekend (E5), unit (E6),
 * lag-calendar (E7) and duration (E8) errors are not added as fixed day counts, because how many
 * working days a calendar-day walk loses depends on where the weekend falls. The model walks the
 * cell's actual dates instead, which is the composition §4.2's closing paragraph describes.
 *
 * Its calendar arithmetic is its own, deliberately not the engine's `WorkingTimeCalendar`: a
 * prediction that shared the engine's walker would agree with the engine about the walker for no
 * reason.
 */

const MINUTES_PER_DAY = 1440;

/** The prediction for one cell: the two worlds agree, or today's cross-plan answer is off by `days`. */
export type CellPrediction = 'equal' | { days: number; sign: 'early' | 'late' | 'loose' | 'tight' };

/** A calendar as the model sees it: which days work, and the one daily window. */
interface ModelCalendar {
  hoursPerDayMinutes: number;
  open: number;
  close: number;
  works(day: number): boolean;
}

/** Epoch day index of a `YYYY-MM-DD` date (UTC). */
export function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d) / 86_400_000);
}

/** `YYYY-MM-DD` of an epoch day index (UTC). */
export function dateOfDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6. Epoch day 0, 1970-01-01, was a Thursday. */
function weekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

function modelCalendar(name: MatrixCalendarName): ModelCalendar {
  const shape = MATRIX_CALENDAR_SHAPES[name];
  const workingWeekdays = new Set(shape.workingWeekdays);
  return {
    hoursPerDayMinutes: shape.close - shape.open,
    open: shape.open,
    close: shape.close,
    works: (day) => workingWeekdays.has(weekday(day)),
  };
}

function dayOf(abs: number): number {
  return Math.floor(abs / MINUTES_PER_DAY);
}

function nextWorkingDay(cal: ModelCalendar, day: number): number {
  let d = day + 1;
  while (!cal.works(d)) d += 1;
  return d;
}

function previousWorkingDay(cal: ModelCalendar, day: number): number {
  let d = day - 1;
  while (!cal.works(d)) d -= 1;
  return d;
}

/** The first working-minute START at or after `abs`. */
function rollForward(cal: ModelCalendar, abs: number): number {
  const day = dayOf(abs);
  const minute = abs - day * MINUTES_PER_DAY;
  if (cal.works(day) && minute < cal.close)
    return day * MINUTES_PER_DAY + Math.max(minute, cal.open);
  return nextWorkingDay(cal, day) * MINUTES_PER_DAY + cal.open;
}

/** The latest working-minute END boundary at or before `abs`. */
function rollBackward(cal: ModelCalendar, abs: number): number {
  const day = dayOf(abs);
  const minute = abs - day * MINUTES_PER_DAY;
  if (cal.works(day) && minute > cal.open)
    return day * MINUTES_PER_DAY + Math.min(minute, cal.close);
  return previousWorkingDay(cal, day) * MINUTES_PER_DAY + cal.close;
}

/**
 * Walk `minutes` working minutes from `abs`. Forward lands on the END boundary of the last minute
 * walked; backward on the START of the last minute walked. Zero returns `abs` unmoved, which is
 * what a zero lag does in one plan (FS lag 0 is the predecessor's finish itself).
 */
function advance(cal: ModelCalendar, abs: number, minutes: number): number {
  if (minutes === 0) return abs;
  if (minutes > 0) {
    let remaining = minutes;
    let cursor = rollForward(cal, abs);
    for (;;) {
      const day = dayOf(cursor);
      const available = day * MINUTES_PER_DAY + cal.close - cursor;
      if (remaining <= available) return cursor + remaining;
      remaining -= available;
      cursor = nextWorkingDay(cal, day) * MINUTES_PER_DAY + cal.open;
    }
  }
  let remaining = -minutes;
  let cursor = rollBackward(cal, abs);
  for (;;) {
    const day = dayOf(cursor - 1);
    const available = cursor - (day * MINUTES_PER_DAY + cal.open);
    if (remaining <= available) return cursor - remaining;
    remaining -= available;
    cursor = previousWorkingDay(cal, day) * MINUTES_PER_DAY + cal.close;
  }
}

/** Signed working minutes from `a` to `b` (positive when `b` is later). */
function workingBetween(cal: ModelCalendar, a: number, b: number): number {
  if (a === b) return 0;
  const [lo, hi, sign] = a < b ? [a, b, 1] : [b, a, -1];
  let total = 0;
  for (let day = dayOf(lo); day <= dayOf(hi); day += 1) {
    if (!cal.works(day)) continue;
    const from = Math.max(lo, day * MINUTES_PER_DAY + cal.open);
    const to = Math.min(hi, day * MINUTES_PER_DAY + cal.close);
    if (to > from) total += to - from;
  }
  return sign * total;
}

/** The day whose working time closes at `abs`: how a finish, or a finish milestone, is reported. */
function closingDay(cal: ModelCalendar, abs: number): number {
  return dayOf(rollBackward(cal, abs) - 1);
}

/** Both worlds' answers for one cell, as instants. Exposed so the red run can print them. */
export interface CellModel {
  /** The one-plan answer (forward: successor early start; backward: predecessor late finish). */
  inPlan: number;
  /** Today's two-plan answer, as the engine would read the derived bare date. */
  crossPlan: number;
  /** The bare `YYYY-MM-DD` today's derivation hands the engine. */
  derivedDate: string;
  /** `crossPlan − inPlan` in working days on the cell's calendar. */
  disagreementDays: number;
}

/** The hand model for one cell. See the module docblock for every rule and where it comes from. */
export function modelCell(cell: CrossPlanMatrixCell): CellModel {
  const cal = modelCalendar(cell.calendar);
  const hpd = cal.hoursPerDayMinutes;
  const lagCal = cell.lagCalendar === 'TWENTY_FOUR_HOUR' ? modelCalendar('twentyFourHour') : cal;
  // One plan: the lag is stored on its lag calendar's hours-per-day. Every activity and both plans
  // run on the cell's calendar, so PREDECESSOR and SUCCESSOR resolve to it as PROJECT_DEFAULT does.
  const lagFactor = cell.lagCalendar === 'TWENTY_FOUR_HOUR' ? MINUTES_PER_DAY : hpd;
  const lagMinutes = cell.lagDays * lagFactor;
  const applyLag = (anchor: number, minutes: number) => advance(lagCal, anchor, minutes);
  const taskMinutes = MATRIX_TASK_DAYS * hpd;
  const data = dayIndex(MATRIX_DATA_DATE) * MINUTES_PER_DAY;
  // Today: stored as lagDays × 1440 whatever the calendar, read back ÷ 1440, added as calendar
  // days (E1, E5, E6); the lag calendar is never read (E7).
  const lagDaysToday = Math.round((cell.lagDays * MINUTES_PER_DAY) / MINUTES_PER_DAY);
  const daysToday = (minutes: number) => Math.round(minutes / MINUTES_PER_DAY); // E8

  if (cell.direction === 'forward') {
    // Upstream: anchor A from the data date, then P after it (FS lag 0).
    const anchorFinish = advance(cal, rollForward(cal, data), FORWARD_ANCHOR_DAYS * hpd);
    const pStart = rollForward(cal, Math.max(data, anchorFinish));
    const pDuration = cell.remoteType === 'TASK' ? taskMinutes : 0;
    const pFinish = advance(cal, pStart, pDuration);
    const sDuration = cell.localType === 'TASK' ? taskMinutes : 0;

    // One plan (E3).
    const bound = (() => {
      switch (cell.linkType) {
        case 'FS':
          return applyLag(pFinish, lagMinutes);
        case 'SS':
          return applyLag(pStart, lagMinutes);
        case 'FF':
          return advance(cal, applyLag(pFinish, lagMinutes), -sDuration);
        case 'SF':
          return advance(cal, applyLag(pStart, lagMinutes), -sDuration);
      }
    })();
    const inPlan = rollForward(cal, Math.max(data, bound));

    // Two plans, today. The persisted dates (a finish milestone reports the day it closes).
    const pStartDay = cell.remoteType === 'TASK' ? dayOf(pStart) : closingDay(cal, pStart);
    const pFinishDay = closingDay(cal, pFinish);
    const sDaysToday = daysToday(sDuration);
    const derivedDay = (() => {
      switch (cell.linkType) {
        case 'FS':
          return pFinishDay + lagDaysToday;
        case 'SS':
          return pStartDay + lagDaysToday;
        case 'FF':
          return pFinishDay + lagDaysToday - sDaysToday;
        case 'SF':
          return pStartDay + lagDaysToday - sDaysToday;
      }
    })();
    // E2: the start of that day, or the end of it for a finish milestone; floored at the data date.
    const external =
      cell.localType === 'FINISH_MILESTONE'
        ? rollForward(cal, (derivedDay + 1) * MINUTES_PER_DAY)
        : rollForward(cal, derivedDay * MINUTES_PER_DAY);
    const crossPlan = rollForward(cal, Math.max(data, external));
    assertClearOfFloor(cell, data, bound, external);
    return {
      inPlan,
      crossPlan,
      derivedDate: dateOfDay(derivedDay),
      disagreementDays: workingBetween(cal, inPlan, crossPlan) / hpd,
    };
  }

  // Backward. Downstream: S pinned FNLT; its late dates are the pin's in both worlds.
  const fnlt = dayIndex(BACKWARD_SUCCESSOR_FNLT);
  const sDuration = cell.remoteType === 'TASK' ? taskMinutes : 0;
  const sPin =
    cell.remoteType === 'FINISH_MILESTONE'
      ? rollForward(cal, (fnlt + 1) * MINUTES_PER_DAY) // ADR-0155: the end of that day
      : rollBackward(cal, (fnlt + 1) * MINUTES_PER_DAY);
  const sLateFinish = rollBackward(cal, sPin);
  const sLateStart = advance(cal, sLateFinish, -sDuration);
  const pDuration = cell.localType === 'TASK' ? taskMinutes : 0;
  const projectFinish = advance(cal, rollForward(cal, data), LONG_TASK_DAYS * hpd);

  // One plan (E3, mirrored).
  const bound = (() => {
    switch (cell.linkType) {
      case 'FS':
        return applyLag(sLateStart, -lagMinutes);
      case 'SS':
        return advance(cal, applyLag(sLateStart, -lagMinutes), pDuration);
      case 'FF':
        return applyLag(sLateFinish, -lagMinutes);
      case 'SF':
        return advance(cal, applyLag(sLateFinish, -lagMinutes), pDuration);
    }
  })();
  const inPlan = rollBackward(cal, Math.min(projectFinish, bound));

  // Two plans, today. S's persisted late dates: a task's late start is its first working day and its
  // late finish its last; a finish milestone reports the day it closes at both ends.
  const sLateStartDay =
    cell.remoteType === 'TASK' ? dayOf(sLateStart) : closingDay(cal, sLateFinish);
  const sLateFinishDay = closingDay(cal, sLateFinish);
  const pDaysToday = daysToday(pDuration);
  const derivedDay = (() => {
    switch (cell.linkType) {
      case 'FS':
        return sLateStartDay - lagDaysToday;
      case 'SS':
        return sLateStartDay - lagDaysToday + pDaysToday;
      case 'FF':
        return sLateFinishDay - lagDaysToday;
      case 'SF':
        return sLateFinishDay - lagDaysToday + pDaysToday;
    }
  })();
  // E9/E11: the end of that day; the start of it for a zero-duration activity; the end of it for a
  // finish milestone (ADR-0155).
  const external =
    cell.localType === 'FINISH_MILESTONE'
      ? rollForward(cal, (derivedDay + 1) * MINUTES_PER_DAY)
      : pDuration === 0
        ? rollForward(cal, derivedDay * MINUTES_PER_DAY)
        : rollBackward(cal, (derivedDay + 1) * MINUTES_PER_DAY);
  const crossPlan = rollBackward(cal, Math.min(projectFinish, external));
  if (bound >= projectFinish || external >= projectFinish) {
    throw new Error(`the project finish binds in ${JSON.stringify(cell)}; the fixture is wrong`);
  }
  return {
    inPlan,
    crossPlan,
    derivedDate: dateOfDay(derivedDay),
    disagreementDays: workingBetween(cal, inPlan, crossPlan) / hpd,
  };
}

/**
 * A cell whose bound reaches the data date would compare two floors, not two bounds, and agree for
 * no reason. The geometry is chosen so none does; this says so if it ever stops being true.
 */
function assertClearOfFloor(
  cell: CrossPlanMatrixCell,
  data: number,
  bound: number,
  external: number,
): void {
  if (bound <= data || external <= data) {
    throw new Error(`the data date floors ${JSON.stringify(cell)}; the fixture is wrong`);
  }
}

/** The prediction for one cell, in the shape FC-2 compares: `'equal'`, or the size and direction. */
export function predictDisagreement(cell: CrossPlanMatrixCell): CellPrediction {
  const { disagreementDays } = modelCell(cell);
  if (disagreementDays === 0) return 'equal';
  const days = Math.abs(disagreementDays);
  if (cell.direction === 'forward') return { days, sign: disagreementDays < 0 ? 'early' : 'late' };
  return { days, sign: disagreementDays > 0 ? 'loose' : 'tight' };
}
