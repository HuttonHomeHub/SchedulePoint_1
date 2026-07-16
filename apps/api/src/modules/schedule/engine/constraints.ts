import type { ActivityType, ConstraintType } from '@repo/types';

import { formatCalendarDate, parseCalendarDate } from '../../../common/validation/calendar-date';

import { advanceWorking, rollBackwardToWorking, rollForwardToWorking } from './instants';
import type { EngineActivity } from './types';
import { instantToAbsMinutes, type WorkingTimeCalendar } from './working-time-calendar';

/**
 * The six constraint kinds the engine applies as date-clamp arithmetic. `MANDATORY_START` /
 * `MANDATORY_FINISH` share MSO/MFO's **pin** arithmetic (a Must-Start-On/Must-Finish-On hard pin in
 * both passes), but M4 **un-parks** them: unlike a plain MSO/MFO the mandatory pin is allowed to
 * override a stronger logic bound and, when it does, the engine **produces the (possibly impossible)
 * schedule and flags it** (`constraintViolated`, ADR-0035 §7) — it never repairs it.
 */
type ModerateConstraint = 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';

/**
 * Map a stored constraint kind to the clamp arithmetic the engine applies. Mandatory pins reuse the
 * MSO/MFO pin math; whether a pin *violated* logic is decided separately (see {@link isMandatory} and
 * the forward-pass check in `compute`), so the produce-and-flag distinction is orthogonal to the
 * arithmetic here.
 */
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

/**
 * True for the two **mandatory** kinds (`MANDATORY_START` / `MANDATORY_FINISH`) — the ones that pin
 * their date and may legally break logic (ADR-0035 §7). When a mandatory pin forces the start earlier
 * than the network-earliest (a stronger logic bound), the activity is flagged `constraintViolated`.
 */
export function isMandatory(type: ConstraintType | null | undefined): boolean {
  return type === 'MANDATORY_START' || type === 'MANDATORY_FINISH';
}

/**
 * A milestone **type** — a point-in-time event that *occupies* its start instant (ADR-0035 §22), as
 * distinct from a zero-duration `TASK`. Milestone-**semantic** branches (e.g. the project-finish
 * tie-break, where a finish milestone must beat a task ending at the same instant) key off this, not
 * `duration === 0`; `duration === 0` stays only where it is a pure arithmetic shortcut (finish =
 * start when there is no work), which is correct for a milestone and a zero-duration task alike. So a
 * zero-duration task keeps a genuine start + finish and is never coerced to a milestone.
 */
export function isMilestone(type: ActivityType): boolean {
  return type === 'START_MILESTONE' || type === 'FINISH_MILESTONE';
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

function resolvePair(
  constraintType: ConstraintType | null | undefined,
  constraintDate: string | null | undefined,
  durationMinutes: number,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): ResolvedConstraint | null {
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

/** The activity's **primary** constraint (drives the forward pass), or null when none is set. */
function resolve(
  activity: EngineActivity,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): ResolvedConstraint | null {
  return resolvePair(
    activity.constraintType,
    activity.constraintDate,
    activity.durationMinutes,
    calendar,
    dataDateAbs,
  );
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
  return backwardClamp(
    resolve(activity, calendar, dataDateAbs),
    logicLateFinish,
    activity.durationMinutes,
    calendar,
  );
}

/**
 * Clamp the late finish for an activity's **secondary** constraint (ADR-0035 §10, M4-F3). The
 * secondary drives the **backward** pass only, applied on top of the primary's backward clamp
 * (`min` for the upper-bound kinds). A secondary of a forward-only kind (`SNET`/`FNET`) is a no-op
 * here — matching the clamp table — and no secondary at all returns `logicLateFinish` unchanged, so
 * the single-constraint golden path stays byte-identical.
 */
export function clampSecondaryBackwardFinish(
  activity: EngineActivity,
  logicLateFinish: number,
  calendar: WorkingTimeCalendar,
  dataDateAbs: number,
): number {
  const constraint = resolvePair(
    activity.secondaryConstraintType,
    activity.secondaryConstraintDate,
    activity.durationMinutes,
    calendar,
    dataDateAbs,
  );
  return backwardClamp(constraint, logicLateFinish, activity.durationMinutes, calendar);
}

/** The backward-pass clamp switch, shared by the primary and secondary constraints. */
function backwardClamp(
  constraint: ResolvedConstraint | null,
  logicLateFinish: number,
  duration: number,
  calendar: WorkingTimeCalendar,
): number {
  if (!constraint) return logicLateFinish;
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
