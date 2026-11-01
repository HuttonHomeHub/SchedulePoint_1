import { describe, expect, it } from 'vitest';

import { WEEKDAY_CAL, WEEKEND_CAL } from './compute.cross-calendar.fixture';
import { clampExternalForwardStart, externalStartInstant } from './constraints';
import type { EngineActivity } from './types';
import { instantToAbsMinutes } from './working-time-calendar';

/**
 * **A zero-span activity reads a timed external early start as the instant it names** (`docs/TECH_DEBT.md`
 * #565, ADR-0207 D1, ADR-0161). The cross-plan derivation hands the engine `YYYY-MM-DDTHH:MM`, and the
 * forward clamp rolled it onto the activity's own calendar. For a start milestone on a weekend calendar
 * the Monday 00:00 where weekend work ended became the next Saturday, and the weekday work after it
 * started a week late. One plan keeps the instant, so a link between two plans has to as well.
 *
 * Red first: with `externalStartInstant` reading every type through `startDateInstant`, the milestone
 * and zero-duration cases below return Saturday 2027-07-03 07:00, and
 * `cross-plan-milestone-fixture.spec.ts` "a start milestone on the weekend calendar, cut at W->M" fails.
 */

const DATA_DATE_ABS = instantToAbsMinutes('2027-06-14');
const MONDAY_MIDNIGHT = instantToAbsMinutes('2027-06-28T00:00');

const activity = (
  fields: Pick<EngineActivity, 'type' | 'durationMinutes'> & Partial<EngineActivity>,
): EngineActivity => ({ id: 'X', ...fields });

describe('externalStartInstant', () => {
  it.each(['START_MILESTONE', 'TASK'] as const)(
    'keeps a timed value for a zero-duration %s on a calendar that is closed at that instant',
    (type) => {
      expect(
        externalStartInstant({ type, durationMinutes: 0 }, WEEKEND_CAL, '2027-06-28T00:00'),
      ).toBe(MONDAY_MIDNIGHT);
    },
  );

  it('rolls the same timed value for an activity with duration, which starts on a working minute', () => {
    const rolled = externalStartInstant(
      { type: 'TASK', durationMinutes: 480 },
      WEEKEND_CAL,
      '2027-06-28T00:00',
    );
    expect(rolled).toBe(instantToAbsMinutes('2027-07-03T07:00'));
  });

  it('still rolls a bare date for a zero-duration activity, so a hand-entered column is unchanged', () => {
    expect(
      externalStartInstant(
        { type: 'START_MILESTONE', durationMinutes: 0 },
        WEEKEND_CAL,
        '2027-06-28',
      ),
    ).toBe(instantToAbsMinutes('2027-07-03T07:00'));
  });

  it('does not treat a Level-of-Effort or summary as zero-span', () => {
    expect(
      externalStartInstant(
        { type: 'LEVEL_OF_EFFORT', durationMinutes: 0 },
        WEEKDAY_CAL,
        '2027-06-26T00:00',
      ),
    ).toBe(instantToAbsMinutes('2027-06-28T08:00'));
  });
});

describe('clampExternalForwardStart for a zero-span activity', () => {
  it('lifts the logic start to the timed instant without rolling it', () => {
    const milestone = activity({
      type: 'START_MILESTONE',
      durationMinutes: 0,
      externalEarlyStart: '2027-06-28T00:00',
    });
    expect(
      clampExternalForwardStart(milestone, DATA_DATE_ABS, WEEKEND_CAL, DATA_DATE_ABS, false),
    ).toBe(MONDAY_MIDNIGHT);
  });
});
