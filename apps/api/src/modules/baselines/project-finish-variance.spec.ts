import { describe, expect, it } from 'vitest';

import { allMinutesWorkCalendar, buildWorkingTimeCalendar, fullDayWeek } from '../schedule/engine';

import { computeProjectFinishVariance } from './variance';

describe('computeProjectFinishVariance', () => {
  it('reads the latest finish on each side and their difference (later is positive)', () => {
    expect(
      computeProjectFinishVariance(
        ['2026-01-05', '2026-01-09'],
        ['2026-01-08', '2026-01-12'],
        allMinutesWorkCalendar,
      ),
    ).toEqual({
      baselineProjectFinish: '2026-01-09',
      currentProjectFinish: '2026-01-12',
      projectFinishVarianceDays: 3,
    });
  });

  it('is negative when the plan finishes earlier and 0 when it is unmoved', () => {
    expect(
      computeProjectFinishVariance(['2026-01-12'], ['2026-01-09'], allMinutesWorkCalendar)
        .projectFinishVarianceDays,
    ).toBe(-3);
    expect(
      computeProjectFinishVariance(['2026-01-09'], ['2026-01-09'], allMinutesWorkCalendar)
        .projectFinishVarianceDays,
    ).toBe(0);
  });

  it('counts working days on the plan calendar, skipping a holiday', () => {
    const monToFri = fullDayWeek([0, 1, 2, 3, 4]);
    const plain = buildWorkingTimeCalendar(monToFri, []);
    const withHoliday = buildWorkingTimeCalendar(monToFri, [
      { startDate: '2026-01-12', endDate: '2026-01-12', windows: [] },
    ]);
    // Fri 9 Jan to Tue 13 Jan: Mon and Tue are two working days, one once Monday is a holiday.
    expect(
      computeProjectFinishVariance(['2026-01-09'], ['2026-01-13'], plain).projectFinishVarianceDays,
    ).toBe(2);
    expect(
      computeProjectFinishVariance(['2026-01-09'], ['2026-01-13'], withHoliday)
        .projectFinishVarianceDays,
    ).toBe(1);
  });

  it('rounds a slip shorter than half a baseline working day to 0, not to a missing answer', () => {
    // An eight-hour calendar read on a 24-hour frozen day: one working day is a third of a day.
    const eightHours = buildWorkingTimeCalendar(
      [0, 1, 2, 3, 4, 5, 6].map(() => [{ startMinute: 480, endMinute: 960 }]),
      [],
    );
    expect(
      computeProjectFinishVariance(['2026-01-09'], ['2026-01-10'], eightHours, 1440),
    ).toMatchObject({ projectFinishVarianceDays: 0 });
  });

  it('is null on a side with no finish, and says which side', () => {
    expect(
      computeProjectFinishVariance(['2026-01-09'], [null, null], allMinutesWorkCalendar),
    ).toEqual({
      baselineProjectFinish: '2026-01-09',
      currentProjectFinish: null,
      projectFinishVarianceDays: null,
    });
    expect(computeProjectFinishVariance([], ['2026-01-09'], allMinutesWorkCalendar)).toEqual({
      baselineProjectFinish: null,
      currentProjectFinish: '2026-01-09',
      projectFinishVarianceDays: null,
    });
  });

  it('sees an activity added after capture that extends the finish, which no matched row does', () => {
    // The baseline held one activity ending 9 Jan; a new one now ends 14 Jan.
    expect(
      computeProjectFinishVariance(
        ['2026-01-09'],
        ['2026-01-09', '2026-01-14'],
        allMinutesWorkCalendar,
      ).projectFinishVarianceDays,
    ).toBe(5);
  });

  it('keeps the removed last activity in the baseline side, so the plan reads earlier', () => {
    expect(
      computeProjectFinishVariance(
        ['2026-01-09', '2026-01-14'],
        ['2026-01-09'],
        allMinutesWorkCalendar,
      ).projectFinishVarianceDays,
    ).toBe(-5);
  });

  it('reads a sub-day slip earlier than baseline as 0, never -0', () => {
    const eightHours = buildWorkingTimeCalendar(
      [0, 1, 2, 3, 4, 5, 6].map(() => [{ startMinute: 480, endMinute: 960 }]),
      [],
    );
    const { projectFinishVarianceDays } = computeProjectFinishVariance(
      ['2026-01-10'],
      ['2026-01-09'],
      eightHours,
      1440,
    );
    expect(Object.is(projectFinishVarianceDays, 0)).toBe(true);
  });
});
