import type { ConstraintType } from '@repo/types';

import type { WorkingDayCalendar } from './calendar';
import type { EngineActivity } from './types';

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

/**
 * The active constraint on an activity, resolved to continuous working-day
 * offsets (ADR-0023). A constraint is active only when both `constraintType` and
 * `constraintDate` are present. `startOffset` is the constraint date as a start
 * offset (`start = DD + offset`); `finishOffset` is the same date as a
 * continuous **finish** offset — a task's inclusive finish `c` maps to `EF = c +
 * 1` (the boundary after the last working day), while a zero-duration milestone's
 * finish equals its start (no `+1`).
 */
interface ResolvedConstraint {
  kind: ModerateConstraint;
  startOffset: number;
  finishOffset: number;
}

function resolve(
  activity: EngineActivity,
  calendar: WorkingDayCalendar,
  dataDate: string,
): ResolvedConstraint | null {
  const { constraintType, constraintDate, durationDays } = activity;
  if (!constraintType || !constraintDate) return null;
  const startOffset = calendar.workingDaysBetween(dataDate, constraintDate);
  const finishOffset = durationDays === 0 ? startOffset : startOffset + 1;
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
  calendar: WorkingDayCalendar,
  dataDate: string,
): number {
  const constraint = resolve(activity, calendar, dataDate);
  if (!constraint) return logicEarlyStart;
  const duration = activity.durationDays;
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
  calendar: WorkingDayCalendar,
  dataDate: string,
): number {
  const constraint = resolve(activity, calendar, dataDate);
  if (!constraint) return logicLateFinish;
  const duration = activity.durationDays;
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
