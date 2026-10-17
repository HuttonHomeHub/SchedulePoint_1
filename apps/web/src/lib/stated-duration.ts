import { formatWorkingMinutesNoDays } from './duration-text';

/**
 * **The duration an activity states — one rule, for every surface that prints one** (ADR-0197).
 *
 * A task's duration is the stored input. A WBS summary's and a Level-of-Effort's is not: both store
 * `0` (a creation input the engine ignores) and their real length is the working time of the span
 * the engine derived, which it writes on each recalculation. So for those two types the stated
 * duration is the derived figure, and where the engine has written none — an empty summary, an LOE
 * with no resolvable span, a plan not recalculated since the field shipped — there is no stated
 * duration at all, which every surface reads as "none", never as the stored `0`.
 *
 * It lives in `lib/` because the activities table, the Gantt, the canvas and the spoken sentence
 * all ask it, and a module several features import belongs to none of them (the `bar-dates.ts`
 * argument). The two types are named here rather than read from a schema module for the reason
 * `formatDurationCell` records: `activity-schemas` imports the duration field, and the reverse
 * import would be a cycle.
 */

/** `1 working day`, `3 working days` — the one pluraliser the spoken sentence and the editor share. */
export function workingDays(n: number): string {
  return `${String(n)} working ${n === 1 ? 'day' : 'days'}`;
}

/**
 * A derived span as it is SPOKEN or written in prose: whole working days, or — where the span is
 * shorter than the half day that rounds to zero — its hours and minutes, which need no calendar to
 * mean something (`formatWorkingMinutesNoDays`). So a four-hour span is said rather than omitted or
 * rounded into "0 working days". `null` where there is nothing to say.
 */
export function spokenWorkingTime(stated: {
  durationDays: number;
  durationMinutes: number;
}): string | null {
  if (stated.durationDays > 0) return workingDays(stated.durationDays);
  if (stated.durationMinutes > 0) {
    return `${formatWorkingMinutesNoDays(stated.durationMinutes)} of working time`;
  }
  return null;
}

/** The fields this reads. The derived pair is optional so a hand-built partial still type-checks. */
export interface DurationSource {
  type: string;
  durationDays: number;
  durationMinutes: number;
  derivedDurationMinutes?: number | null | undefined;
  derivedDurationDays?: number | null | undefined;
}

/** True for the two types whose length is derived from a span rather than stored. */
export function isDerivedSpanType(type: string): boolean {
  return type === 'WBS_SUMMARY' || type === 'LEVEL_OF_EFFORT';
}

/**
 * The stated duration, or `null` where there is none to state. A milestone is a different case (it
 * has no duration at all) and is the caller's to decide; this answers for the other five types.
 */
export function statedDuration(
  activity: DurationSource,
): { durationDays: number; durationMinutes: number } | null {
  if (!isDerivedSpanType(activity.type)) {
    return { durationDays: activity.durationDays, durationMinutes: activity.durationMinutes };
  }
  if (activity.derivedDurationMinutes == null) return null;
  return {
    durationDays: activity.derivedDurationDays ?? 0,
    durationMinutes: activity.derivedDurationMinutes,
  };
}
