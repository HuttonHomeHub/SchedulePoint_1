import type { ActivityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { parseCalendarDate } from '../../common/validation/calendar-date';

import {
  dateConvention,
  REEXPRESSED_DATE_FIELDS,
  reexpressZeroDurationDates,
  type ReexpressedDateField,
  type ReexpressionRequest,
  type ReexpressionSubject,
} from './zero-duration-reexpression';

/**
 * ADR-0162 decision 3 (`docs/specs/zero-duration-task/` M2-T1). Each case is its own row, as the plan
 * asks, so a failure names the one rule that broke. Red runs are recorded in
 * `docs/specs/zero-duration-task/m2-record.md`.
 */

const ALL_TYPES: readonly ActivityType[] = [
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'HAMMOCK',
  'LEVEL_OF_EFFORT',
  'WBS_SUMMARY',
  'RESOURCE_DEPENDENT',
];

/** Wed 14 Jan 2026: an interior weekday, so D−1 and D+1 are both calendar and working neighbours. */
const MID = '2026-01-14';

function subject(
  type: ActivityType,
  dates: Partial<Record<ReexpressedDateField, string>> = {},
  durationMinutes = 0,
): ReexpressionSubject {
  const d = (f: ReexpressedDateField): Date | null =>
    dates[f] === undefined ? null : parseCalendarDate(dates[f]);
  return {
    type,
    durationMinutes,
    visualStart: d('visualStart'),
    constraintDate: d('constraintDate'),
    secondaryConstraintDate: d('secondaryConstraintDate'),
    externalEarlyStart: d('externalEarlyStart'),
    externalLateFinish: d('externalLateFinish'),
  };
}

function allAt(date: string): Record<ReexpressedDateField, string> {
  return Object.fromEntries(REEXPRESSED_DATE_FIELDS.map((f) => [f, date])) as Record<
    ReexpressedDateField,
    string
  >;
}

describe('dateConvention', () => {
  it('is END_OF_DAY for FINISH_MILESTONE and START_OF_DAY for every other type', () => {
    for (const t of ALL_TYPES) {
      expect(dateConvention(t)).toBe(t === 'FINISH_MILESTONE' ? 'END_OF_DAY' : 'START_OF_DAY');
    }
  });
});

describe('reexpressZeroDurationDates: every field × direction × sent/unsent', () => {
  for (const field of REEXPRESSED_DATE_FIELDS) {
    it(`${field}, unsent, into FINISH_MILESTONE: one calendar day earlier`, () => {
      const out = reexpressZeroDurationDates(subject('TASK', { [field]: MID }), {
        type: 'FINISH_MILESTONE',
      });
      expect(out).toEqual({ [field]: '2026-01-13' });
    });
    it(`${field}, unsent, out of FINISH_MILESTONE: one calendar day later`, () => {
      const out = reexpressZeroDurationDates(subject('FINISH_MILESTONE', { [field]: MID }), {
        type: 'TASK',
      });
      expect(out).toEqual({ [field]: '2026-01-15' });
    });
    it(`${field}, sent with a value, into FINISH_MILESTONE: untouched`, () => {
      const dto: ReexpressionRequest = { type: 'FINISH_MILESTONE', [field]: '2026-02-02' };
      expect(reexpressZeroDurationDates(subject('TASK', { [field]: MID }), dto)).toEqual({});
    });
    it(`${field}, sent with a value, out of FINISH_MILESTONE: untouched`, () => {
      const dto: ReexpressionRequest = { type: 'TASK', [field]: '2026-02-02' };
      expect(
        reexpressZeroDurationDates(subject('FINISH_MILESTONE', { [field]: MID }), dto),
      ).toEqual({});
    });
  }

  it('re-expresses every stored field in one request, and only the unsent ones', () => {
    const out = reexpressZeroDurationDates(subject('TASK', allAt(MID)), {
      type: 'FINISH_MILESTONE',
      constraintDate: '2026-03-01',
    });
    expect(out).toEqual({
      visualStart: '2026-01-13',
      secondaryConstraintDate: '2026-01-13',
      externalEarlyStart: '2026-01-13',
      externalLateFinish: '2026-01-13',
    });
  });
});

describe('reexpressZeroDurationDates: a null stored field is a no-op', () => {
  for (const field of REEXPRESSED_DATE_FIELDS) {
    it(`${field} stored null stays absent from the result`, () => {
      const others = Object.fromEntries(
        REEXPRESSED_DATE_FIELDS.filter((f) => f !== field).map((f) => [f, MID]),
      );
      const out = reexpressZeroDurationDates(subject('TASK', others), {
        type: 'FINISH_MILESTONE',
      });
      expect(field in out).toBe(false);
      expect(Object.keys(out)).toHaveLength(REEXPRESSED_DATE_FIELDS.length - 1);
    });
  }
});

describe('reexpressZeroDurationDates: an explicit null is sent', () => {
  for (const field of REEXPRESSED_DATE_FIELDS) {
    it(`${field} sent as null clears it and is not re-expressed`, () => {
      const dto: ReexpressionRequest = { type: 'FINISH_MILESTONE', [field]: null };
      const out = reexpressZeroDurationDates(subject('TASK', { [field]: MID }), dto);
      expect(out).toEqual({});
    });
  }
});

describe('reexpressZeroDurationDates: when it does not apply', () => {
  it('a non-zero stored duration is a no-op', () => {
    expect(
      reexpressZeroDurationDates(subject('TASK', allAt(MID), 2400), { type: 'FINISH_MILESTONE' }),
    ).toEqual({});
  });
  it('TASK → START_MILESTONE is the same convention: a no-op', () => {
    expect(
      reexpressZeroDurationDates(subject('TASK', allAt(MID)), { type: 'START_MILESTONE' }),
    ).toEqual({});
  });
  it('START_MILESTONE → TASK is the same convention: a no-op', () => {
    expect(
      reexpressZeroDurationDates(subject('START_MILESTONE', allAt(MID)), { type: 'TASK' }),
    ).toEqual({});
  });
  it('type not sent: a no-op', () => {
    expect(reexpressZeroDurationDates(subject('TASK', allAt(MID)), {})).toEqual({});
  });
  it('type sent equal to the stored type: a no-op', () => {
    expect(
      reexpressZeroDurationDates(subject('FINISH_MILESTONE', allAt(MID)), {
        type: 'FINISH_MILESTONE',
      }),
    ).toEqual({});
  });
});

describe('reexpressZeroDurationDates: calendar days, never working days (spec E34, FC-3)', () => {
  // Both verified red against a working-day shift (m2-record.md), which passes every instant-based
  // and every working-day round-trip case: a Monday goes to Friday and back to Monday under it.
  it('Monday − 1 is the Sunday, never the Friday', () => {
    const out = reexpressZeroDurationDates(subject('TASK', { visualStart: '2026-01-12' }), {
      type: 'FINISH_MILESTONE',
    });
    expect(out).toEqual({ visualStart: '2026-01-11' });
  });
  it('a stored Sunday round-trips to the Sunday, not the Monday', () => {
    const into = reexpressZeroDurationDates(subject('TASK', { visualStart: '2026-01-11' }), {
      type: 'FINISH_MILESTONE',
    });
    expect(into).toEqual({ visualStart: '2026-01-10' });
    const back = reexpressZeroDurationDates(
      subject('FINISH_MILESTONE', { visualStart: into.visualStart ?? '' }),
      { type: 'TASK' },
    );
    expect(back).toEqual({ visualStart: '2026-01-11' });
  });
  it('crosses a month and a year boundary by calendar arithmetic', () => {
    expect(
      reexpressZeroDurationDates(subject('TASK', { constraintDate: '2026-01-01' }), {
        type: 'FINISH_MILESTONE',
      }),
    ).toEqual({ constraintDate: '2025-12-31' });
    expect(
      reexpressZeroDurationDates(subject('FINISH_MILESTONE', { constraintDate: '2028-02-28' }), {
        type: 'TASK',
      }),
    ).toEqual({ constraintDate: '2028-02-29' });
  });
});

describe('reexpressZeroDurationDates: keys on the STORED duration', () => {
  // `PATCH {type: 'TASK', durationDays: 5}` on a stored finish milestone: the request's duration is
  // not an input at all, so the rule cannot mistake the post-patch duration for the stored one.
  // Verified red against a check on the post-patch duration (m2-record.md).
  it('a same-request duration change still re-expresses', () => {
    const dto = { type: 'TASK' as const, durationDays: 5 };
    const out = reexpressZeroDurationDates(
      subject('FINISH_MILESTONE', { visualStart: '2026-01-09' }),
      dto,
    );
    expect(out).toEqual({ visualStart: '2026-01-10' });
  });
});

describe('reexpressZeroDurationDates: type coverage (spec D3 table)', () => {
  // FC-2's schedule guarantee is claimed for TASK, START_MILESTONE and HAMMOCK only. The rule still
  // applies to the other three, whose position is derived from a span, a branch or a resource's
  // calendar; these cases pin that the dates are re-expressed, not that the activity stays put.
  const cases: readonly { type: ActivityType; claim: string }[] = [
    { type: 'HAMMOCK', claim: 'FC-2 claimed' },
    { type: 'RESOURCE_DEPENDENT', claim: 'the accepted exception: FC-2 not claimed' },
    { type: 'LEVEL_OF_EFFORT', claim: 'FC-2 not claimed' },
    { type: 'WBS_SUMMARY', claim: 'FC-2 not claimed' },
  ];
  for (const { type, claim } of cases) {
    it(`zero-duration ${type} → FINISH_MILESTONE re-expresses (${claim})`, () => {
      expect(
        reexpressZeroDurationDates(subject(type, { visualStart: MID }), {
          type: 'FINISH_MILESTONE',
        }),
      ).toEqual({ visualStart: '2026-01-13' });
    });
    it(`FINISH_MILESTONE → ${type} re-expresses (${claim})`, () => {
      expect(
        reexpressZeroDurationDates(subject('FINISH_MILESTONE', { visualStart: MID }), { type }),
      ).toEqual({ visualStart: '2026-01-15' });
    });
  }
  it('START_MILESTONE → FINISH_MILESTONE re-expresses', () => {
    expect(
      reexpressZeroDurationDates(subject('START_MILESTONE', { constraintDate: MID }), {
        type: 'FINISH_MILESTONE',
      }),
    ).toEqual({ constraintDate: '2026-01-13' });
  });
});
