import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import { rollBackwardToWorking, rollForwardToWorking } from './instants';
import type { EngineActivity } from './types';
import { instantToAbsMinutes, type WorkingTimeCalendar } from './working-time-calendar';

/**
 * Progress classification for the CPM engine (M2, ADR-0035 §1–§2). An activity is scheduled from
 * its **actuals** once it has any: a completed activity is **frozen** on its actual start/finish
 * (logic and the data date never move it); an in-progress activity keeps its frozen actual start
 * while its **remaining** work is rescheduled forward, floored at the data date (§2). An activity
 * with no actuals is the ordinary planned case — the byte-identical unprogressed path.
 *
 * Actuals are calendar days resolved to absolute working-instants on the activity's **own**
 * calendar with the same start/finish conventions the constraint resolver uses (a start is the
 * day's first working instant; a finish is the exclusive end of the day's working time), so a
 * progressed activity on a distinct calendar (ADR-0037) freezes on that calendar.
 */
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';

/**
 * The out-of-sequence recalc mode (ADR-0035 §1). Governs whether an **in-progress** activity's
 * REMAINING work still waits on its predecessors: **Retained Logic** (default) keeps every
 * predecessor tie; **Progress Override** drops the tie from *incomplete* predecessors (a complete
 * one still bounds via its actual finish); **Actual Dates** drops them all — the started activity's
 * remaining simply runs from the data date. The three coincide on an unprogressed network.
 */
export type ProgressMode = 'RETAINED_LOGIC' | 'PROGRESS_OVERRIDE' | 'ACTUAL_DATES';

/**
 * Whether an in-progress activity's remaining-work start still honours a predecessor bound under
 * `mode` (ADR-0035 §1). Applies only to a started activity's remaining work; a not-started activity
 * always follows full logic. See {@link ProgressMode}.
 */
export function remainingHonoursPredecessor(
  mode: ProgressMode,
  predecessor: ProgressStatus,
): boolean {
  switch (mode) {
    case 'RETAINED_LOGIC':
      return true;
    case 'PROGRESS_OVERRIDE':
      return predecessor === 'COMPLETE';
    case 'ACTUAL_DATES':
      return false;
  }
}

export interface ResolvedProgress {
  status: ProgressStatus;
  /** Frozen actual **start** instant (the day's first working instant); null when not started. */
  actualStartInst: number | null;
  /** Frozen actual **finish** instant (working end boundary); null unless complete. */
  actualFinishInst: number | null;
  /**
   * Remaining working minutes for an IN_PROGRESS activity (0 when complete or a milestone). The
   * service resolves this (explicit `remainingDurationMinutes`, else derived from
   * `percentComplete × durationMinutes`) and passes it as `EngineActivity.remainingMinutes`; absent,
   * it falls back to the full `durationMinutes` (an activity started but with no reported progress).
   */
  remainingMinutes: number;
}

/** The calendar day after `date` (`YYYY-MM-DD`), at 00:00 — the exclusive end of that day. */
function nextCalendarDay(date: string): string {
  const d = parseCalendarDate(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatCalendarDate(d);
}

/**
 * Classify an activity's progress and resolve its actuals to instants on its own `calendar`.
 * `dataDateAbs` anchors the finish roll-back (mirrors the constraint resolver). Completeness is
 * keyed on a present `actualFinish`; a started-but-unfinished activity is in progress.
 */
export function resolveProgress(
  activity: EngineActivity,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): ResolvedProgress {
  const { actualStart, actualFinish, durationMinutes, remainingMinutes } = activity;
  const started = actualStart != null;
  const finished = actualFinish != null;
  const status: ProgressStatus = finished ? 'COMPLETE' : started ? 'IN_PROGRESS' : 'NOT_STARTED';

  const actualStartInst = started
    ? rollForwardToWorking(calendar, instantToAbsMinutes(actualStart))
    : null;
  const actualFinishInst = finished
    ? rollBackwardToWorking(
        calendar,
        dataDateAbs,
        instantToAbsMinutes(nextCalendarDay(actualFinish)),
      )
    : null;

  // Remaining work only matters for the in-progress branch: complete/milestone ⇒ 0; else the
  // service-resolved remaining, falling back to the full duration when none was reported.
  const remaining =
    status !== 'IN_PROGRESS' || durationMinutes === 0 ? 0 : (remainingMinutes ?? durationMinutes);

  return { status, actualStartInst, actualFinishInst, remainingMinutes: remaining };
}
