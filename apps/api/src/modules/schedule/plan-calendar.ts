import { ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  EmptyWorkingTimeCalendarError,
  WorkingTimeHorizonExceededError,
  type ShiftWindow,
  type TimeException,
  type WorkingTimeCalendar,
} from './engine';

/**
 * The machine-readable reason on the rejection above. Declared here beside the only thing that
 * raises it — `SCHEDULE_ERROR` re-exports it so callers keep one import for schedule reasons.
 */
export const CALENDAR_HAS_NO_WORKING_TIME = 'CALENDAR_HAS_NO_WORKING_TIME';

/** One weekday shift window as loaded from the `calendar_shifts` table (minute-granular). */
export interface PlanCalendarShift {
  /** Monday = 0 … Sunday = 6. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** One dated exception as loaded from `calendar_exceptions` + its replacement `windows`. */
export interface PlanCalendarException {
  startDate: Date;
  endDate: Date;
  windows: readonly { startMinute: number; endMinute: number }[];
}

/** A plan's stored calendar (the real shift/window rows) as the engine port needs it. */
export interface PlanCalendarInput {
  shifts: readonly PlanCalendarShift[];
  exceptions: readonly PlanCalendarException[];
}

/**
 * Build the engine's minute-granular working-time calendar (ADR-0036 §2) DIRECTLY
 * from a plan calendar's stored shift + exception-window rows. A null calendar (no
 * `calendarId`, or a missing/soft-deleted calendar) falls back to the all-minutes
 * calendar, so the null path stays byte-identical to the working-day engine and the
 * golden suite holds.
 *
 * The weekly pattern is a 7-element array (index `w` = weekday `w`'s sorted windows);
 * each exception becomes a `TimeException` over its inclusive `[startDate, endDate]`
 * range with its sorted replacement windows (zero windows = a holiday).
 */
export function buildPlanCalendar(calendar: PlanCalendarInput | null): WorkingTimeCalendar {
  if (!calendar) return allMinutesWorkCalendar;

  const weekly: ShiftWindow[][] = Array.from({ length: 7 }, () => []);
  for (const shift of [...calendar.shifts].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  )) {
    weekly[shift.weekday]?.push({ startMinute: shift.startMinute, endMinute: shift.endMinute });
  }

  const exceptions: TimeException[] = calendar.exceptions.map((exception) => ({
    startDate: formatCalendarDate(exception.startDate),
    endDate: formatCalendarDate(exception.endDate),
    windows: [...exception.windows]
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute })),
  }));

  return buildWorkingTimeCalendar(weekly, exceptions);
}

/**
 * {@link buildPlanCalendar}, with the engine's "no working time at all" condition mapped to a 422
 * that names the calendar — the shape every service seam wants, stated once.
 *
 * Both seams that build a calendar port reach this state identically (recalculation and baseline
 * variance), so the mapping lives here rather than being caught twice: a second copy would be free
 * to drift, and the half that drifted would be the one nobody exercises. That is the same argument
 * as `shiftRowsFor`/`exceptionWindowRowsFor` in the calendar repository, one layer up.
 *
 * Reachable from ordinary input since the window-only base week was accepted at the DTO
 * (TECH_DEBT #79): an empty week is legitimate the moment a working exception gives it hours, and
 * nothing but a mistake until then. It answered an opaque 500 — a user-caused, user-fixable state
 * reported as a server fault.
 */
export function buildPlanCalendarOrReject(
  calendar: (PlanCalendarInput & { name?: string }) | null,
  calendarId: string | null,
): WorkingTimeCalendar {
  try {
    return buildPlanCalendar(calendar);
  } catch (error) {
    if (error instanceof EmptyWorkingTimeCalendarError) {
      throw new ValidationError(
        `The calendar “${calendar?.name ?? 'assigned to this plan'}” has no working time: its ` +
          'weekly pattern is empty and it has no working exception, so nothing can be scheduled ' +
          'on it. Add working days to the week, or a dated exception with hours.',
        { reason: CALENDAR_HAS_NO_WORKING_TIME, calendarId },
      );
    }
    throw error;
  }
}

/**
 * The machine-readable reason for the WALK-time sibling of the rejection above
 * (`docs/TECH_DEBT.md` #205(b)): a calendar that HAS working time, placed where the schedule
 * cannot reach it within the engine's horizon.
 */
export const CALENDAR_WORKING_TIME_UNREACHABLE = 'CALENDAR_WORKING_TIME_UNREACHABLE';

/**
 * Map the engine's walk-time horizon guard to a 422 (`docs/TECH_DEBT.md` #205(b), the ADR-0071
 * rule: the engine's own guard is a typed error and a 422, not a 500). A no-op for every other
 * error — the caller rethrows.
 *
 * Unlike {@link buildPlanCalendarOrReject} this fires DURING `computeSchedule`, where the engine
 * cannot say which calendar failed — an activity schedules on its own resolved port (ADR-0037).
 * So the calendar is named only when the plan has exactly one in play (`activityCalendarCount`
 * is 0 and the plan carries a calendar); otherwise the sentence points at the plan's calendars
 * without inventing a culprit (ADR-0076: never claim what is not known).
 *
 * **Every service seam that reaches the engine's working-time walk must call this** — five today:
 * `recalculate`, the critical-path test, `float-paths` (via `computeFloatPaths` →
 * `computeSchedule`), `earned-value` and `resource-histogram` (both via per-assignment lag
 * phasing, ADR-0071 §1). The first fix mapped two and left three answering a raw 500 — one
 * correct pattern applied to a seam and not its neighbours, found by the 2026-08-28
 * reconciliation pass's api review. The enumeration is now COMPUTED, not remembered:
 * `horizon-seams.structural.spec.ts` scans the service for walk-entry calls and fails on any
 * method missing this mapper, so the sixth seam is caught the day it is written.
 */
export function rejectIfWorkingTimeHorizonExceeded(
  error: unknown,
  context: { planCalendarId: string | null; activityCalendarCount: number },
): void {
  if (!(error instanceof WorkingTimeHorizonExceededError)) return;
  const single = context.activityCalendarCount === 0 && context.planCalendarId !== null;
  throw new ValidationError(
    'The schedule walked past the engine\u2019s working-time horizon without finding a working ' +
      'minute. ' +
      (single
        ? 'The plan\u2019s calendar has working time the schedule cannot reach'
        : 'A calendar used by this plan has working time the schedule cannot reach') +
      ' \u2014 for example a dated blackout longer than the horizon, or a window-only calendar ' +
      'whose working exception sits far from the plan\u2019s dates. Check the calendar\u2019s ' +
      'exceptions against the plan\u2019s data date.',
    {
      reason: CALENDAR_WORKING_TIME_UNREACHABLE,
      calendarId: single ? context.planCalendarId : null,
    },
  );
}
