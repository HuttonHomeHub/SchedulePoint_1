import type { ActivityType } from '@prisma/client';

import { formatCalendarDate } from '../../common/validation/calendar-date';

/**
 * **A type change across the finish-milestone date convention keeps a zero-duration activity's
 * instant** (ADR-0162 decision 3, `docs/specs/zero-duration-task/` M2-T1).
 *
 * A `FINISH_MILESTONE` reads every date given for it as the END of that day (ADR-0155 decision 3,
 * `engine/instants.ts` `finishMilestoneDateInstant`); every other type reads a date as the START of its
 * day. So the same stored date means two different instants depending on the type, and before this
 * rule a `PATCH {type}` that touched no date moved the activity: M0-T3 measured a successor moving
 * from Mon 12 to Tue 13 January (`test/zero-duration-type-change.e2e-spec.ts`).
 *
 * The rule re-expresses each **stored, unsent** date field one **calendar** day: earlier when the
 * activity enters `FINISH_MILESTONE`, later when it leaves. On any calendar,
 * `finishMilestoneDateInstant(cal, D − 1 day)` is the start of D rolled forward to working time, so
 * the instant is unchanged (spec E17; M0-T2's 60 cases). It is calendar-free, which is also why it is
 * not a working-day shift: a working-day shift keeps the instant too whenever D is a working day, and
 * differs only in the stored value (a Monday goes to Sunday here, Friday there) and in a round trip
 * from a non-working day (a Sunday comes back as Sunday here, Monday there). The unit suite pins both.
 *
 * **It keys on the STORED duration**, not the post-patch one: `PATCH {type: 'TASK', durationDays: 5}`
 * on a finish milestone still re-expresses, so the new five-day task starts at the milestone's
 * instant. **A sent field is never moved**, an explicit `null` included: a date the caller sends is
 * read in the new type's convention, because the caller typed it for the new type.
 *
 * `expectedFinish` is deliberately not in the list: it is inert at zero duration. The engine's reads
 * of the five fields in the finish-milestone convention are pinned by
 * `zero-duration-reexpression.structural.spec.ts`, so a sixth input that starts being read at the end
 * of its day fails there rather than silently escaping this rule.
 */

/** How a type reads a date given for it. A property of `FINISH_MILESTONE` alone (spec D3). */
export type DateConvention = 'START_OF_DAY' | 'END_OF_DAY';

export function dateConvention(type: ActivityType): DateConvention {
  return type === 'FINISH_MILESTONE' ? 'END_OF_DAY' : 'START_OF_DAY';
}

/** The five date inputs the engine reads in the finish-milestone convention. */
export const REEXPRESSED_DATE_FIELDS = [
  'visualStart',
  'constraintDate',
  'secondaryConstraintDate',
  'externalEarlyStart',
  'externalLateFinish',
] as const;

export type ReexpressedDateField = (typeof REEXPRESSED_DATE_FIELDS)[number];

/** The stored row, as far as the rule reads it. */
export type ReexpressionSubject = {
  readonly type: ActivityType;
  readonly durationMinutes: number;
} & { readonly [K in ReexpressedDateField]: Date | null };

/** The request, as far as the rule reads it: `undefined` is "not sent", `null` is sent. */
export type ReexpressionRequest = {
  readonly type?: ActivityType;
} & { readonly [K in ReexpressedDateField]?: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The re-expressed values, as `YYYY-MM-DD`, for each stored and unsent field; an empty object when the
 * rule does not apply. The caller merges them into the patch and resolves N26 on the result.
 */
export function reexpressZeroDurationDates(
  existing: ReexpressionSubject,
  dto: ReexpressionRequest,
): Partial<Record<ReexpressedDateField, string>> {
  if (dto.type === undefined || dto.type === existing.type) return {};
  if (existing.durationMinutes !== 0) return {};
  const from = dateConvention(existing.type);
  const to = dateConvention(dto.type);
  if (from === to) return {};
  const shiftMs = to === 'END_OF_DAY' ? -DAY_MS : DAY_MS;

  const out: Partial<Record<ReexpressedDateField, string>> = {};
  for (const field of REEXPRESSED_DATE_FIELDS) {
    if (dto[field] !== undefined) continue;
    const stored = existing[field];
    if (stored === null) continue;
    out[field] = formatCalendarDate(new Date(stored.getTime() + shiftMs));
  }
  return out;
}
