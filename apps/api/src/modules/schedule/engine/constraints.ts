import type { ConstraintType } from '@repo/types';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import { advanceWorking, rollBackwardToWorking, rollForwardToWorking } from './instants';
import type { EngineActivity } from './types';
import { instantToAbsMinutes, type WorkingTimeCalendar } from './working-time-calendar';

/**
 * The six **moderate** constraint kinds the engine honours in this slice (ADR-0023
 * §6). `MANDATORY_START` / `MANDATORY_FINISH` are **parked** as their moderate
 * equivalents here (`MSO` / `MFO`) and counted in the summary's
 * `parkedConstraintCount` — hard-mandatory semantics are a documented follow-up.
 */
type ModerateConstraint = 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';

/** Map a stored constraint kind to the moderate kind the engine applies. */
export function normaliseConstraint(type: ConstraintType): ModerateConstraint {
  switch (type) {
    case 'MANDATORY_START':
      return 'MSO';
    case 'MANDATORY_FINISH':
      return 'MFO';
    default:
      return type;
  }
}

/** True for the two kinds parked as their moderate equivalents (for the count). */
export function isParkedMandatory(type: ConstraintType | null | undefined): boolean {
  return type === 'MANDATORY_START' || type === 'MANDATORY_FINISH';
}

/** The calendar day after `date` (a `YYYY-MM-DD`), at 00:00 — the exclusive end of the day. */
function nextCalendarDay(date: string): string {
  const d = parseCalendarDate(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatCalendarDate(d);
}

/**
 * The active constraint on an activity, resolved to **absolute working-instants** on the
 * activity's own calendar (ADR-0037). A constraint is active only when both `constraintType`
 * and `constraintDate` are present. `startAbs` is the constraint day's first working instant;
 * `finishAbs` is the exclusive end of the constraint day's working time (its last working
 * minute + 1) — measured on the activity's calendar so an activity constraint rolls to the
 * activity's own next/previous working instant. For a zero-duration milestone finish = start.
 */
interface ResolvedConstraint {
  kind: ModerateConstraint;
  startAbs: number;
  finishAbs: number;
}

function resolve(
  activity: EngineActivity,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): ResolvedConstraint | null {
  const { constraintType, constraintDate, durationMinutes } = activity;
  if (!constraintType || !constraintDate) return null;
  const startAbs = rollForwardToWorking(calendar, instantToAbsMinutes(constraintDate));
  const finishAbs =
    durationMinutes === 0
      ? startAbs
      : rollBackwardToWorking(
          calendar,
          dataDateAbs,
          instantToAbsMinutes(nextCalendarDay(constraintDate)),
        );
  return { kind: normaliseConstraint(constraintType), startAbs, finishAbs };
}

/**
 * Clamp an activity's logic-driven **early start** for its constraint (forward
 * pass), in absolute working-instants on the activity's calendar. `SNET`/`FNET` are
 * lower bounds (take the max with logic); `MSO`/`MFO` **pin** the start regardless
 * of logic — a conflict then surfaces as negative float on a predecessor, never a
 * dropped edge. `SNLT`/`FNLT` are backward-only.
 */
export function clampForwardStart(
  activity: EngineActivity,
  logicEarlyStart: number,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): number {
  const constraint = resolve(activity, calendar, dataDateAbs);
  if (!constraint) return logicEarlyStart;
  const duration = activity.durationMinutes;
  switch (constraint.kind) {
    case 'SNET':
      return Math.max(logicEarlyStart, constraint.startAbs);
    case 'FNET':
      return Math.max(logicEarlyStart, advanceWorking(calendar, constraint.finishAbs, -duration));
    case 'MSO':
      return constraint.startAbs;
    case 'MFO':
      return advanceWorking(calendar, constraint.finishAbs, -duration);
    case 'SNLT':
    case 'FNLT':
      return logicEarlyStart;
  }
}

/**
 * Clamp an activity's logic-driven **late finish** for its constraint (backward
 * pass), in absolute working-instants on the activity's calendar. `SNLT`/`FNLT` are
 * upper bounds (take the min with logic); `MSO`/`MFO` pin the finish. `SNET`/`FNET`
 * are forward-only.
 */
export function clampBackwardFinish(
  activity: EngineActivity,
  logicLateFinish: number,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): number {
  const constraint = resolve(activity, calendar, dataDateAbs);
  if (!constraint) return logicLateFinish;
  const duration = activity.durationMinutes;
  switch (constraint.kind) {
    case 'SNLT':
      return Math.min(logicLateFinish, advanceWorking(calendar, constraint.startAbs, duration));
    case 'FNLT':
      return Math.min(logicLateFinish, constraint.finishAbs);
    case 'MSO':
      return advanceWorking(calendar, constraint.startAbs, duration);
    case 'MFO':
      return constraint.finishAbs;
    case 'SNET':
    case 'FNET':
      return logicLateFinish;
  }
}
