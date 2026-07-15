import type { ConstraintType } from '@repo/types';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import type { EngineActivity } from './types';
import type { WorkingTimeCalendar } from './working-time-calendar';

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
 * The active constraint on an activity, resolved to continuous working-**minute**
 * offsets (ADR-0036). A constraint is active only when both `constraintType` and
 * `constraintDate` are present. `startOffset` is the constraint date as a start
 * offset (the first working minute of that day). `finishOffset` is the exclusive
 * boundary after the constraint day (its last working minute + 1) — the working
 * minutes from the data date through the end of day `c`; for a zero-duration
 * milestone the finish equals the start.
 */
interface ResolvedConstraint {
  kind: ModerateConstraint;
  startOffset: number;
  finishOffset: number;
}

function resolve(
  activity: EngineActivity,
  calendar: WorkingTimeCalendar,
  dataDate: string,
): ResolvedConstraint | null {
  const { constraintType, constraintDate, durationMinutes } = activity;
  if (!constraintType || !constraintDate) return null;
  const startOffset = calendar.workingTimeBetween(dataDate, constraintDate);
  const finishOffset =
    durationMinutes === 0
      ? startOffset
      : calendar.workingTimeBetween(dataDate, nextCalendarDay(constraintDate));
  return { kind: normaliseConstraint(constraintType), startOffset, finishOffset };
}

/**
 * Clamp an activity's logic-driven **early start** for its constraint (forward
 * pass). `SNET`/`FNET` are lower bounds (take the max with logic); `MSO`/`MFO`
 * **pin** the start regardless of logic — a conflict then surfaces as negative
 * float on a predecessor, never a dropped edge. `SNLT`/`FNLT` are backward-only.
 */
export function clampForwardStart(
  activity: EngineActivity,
  logicEarlyStart: number,
  calendar: WorkingTimeCalendar,
  dataDate: string,
): number {
  const constraint = resolve(activity, calendar, dataDate);
  if (!constraint) return logicEarlyStart;
  const duration = activity.durationMinutes;
  switch (constraint.kind) {
    case 'SNET':
      return Math.max(logicEarlyStart, constraint.startOffset);
    case 'FNET':
      return Math.max(logicEarlyStart, constraint.finishOffset - duration);
    case 'MSO':
      return constraint.startOffset;
    case 'MFO':
      return constraint.finishOffset - duration;
    case 'SNLT':
    case 'FNLT':
      return logicEarlyStart;
  }
}

/**
 * Clamp an activity's logic-driven **late finish** for its constraint (backward
 * pass). `SNLT`/`FNLT` are upper bounds (take the min with logic); `MSO`/`MFO`
 * pin the finish. `SNET`/`FNET` are forward-only.
 */
export function clampBackwardFinish(
  activity: EngineActivity,
  logicLateFinish: number,
  calendar: WorkingTimeCalendar,
  dataDate: string,
): number {
  const constraint = resolve(activity, calendar, dataDate);
  if (!constraint) return logicLateFinish;
  const duration = activity.durationMinutes;
  switch (constraint.kind) {
    case 'SNLT':
      return Math.min(logicLateFinish, constraint.startOffset + duration);
    case 'FNLT':
      return Math.min(logicLateFinish, constraint.finishOffset);
    case 'MSO':
      return constraint.startOffset + duration;
    case 'MFO':
      return constraint.finishOffset;
    case 'SNET':
    case 'FNET':
      return logicLateFinish;
  }
}
