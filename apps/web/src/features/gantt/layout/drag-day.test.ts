import { describe, expect, it } from 'vitest';

import { barGeometry, chartAnchor } from './bar-geometry';
import { dateAtChartX, durationDaysForFinishAtX, startDayAtChartX } from './drag-day';

import { anActivity } from '@/test/activity-fixture';

/**
 * **M3-T1 — the two date origins, and the round trip that proves they meet.**
 *
 * The interesting assertion is the last group: a bar drawn at x by `barGeometry` must convert BACK
 * to its own start. That is the property the drag actually rests on — a planner drops a bar where
 * it appears, and what is stored has to be what they saw. Testing the two directions separately
 * would let both be wrong by the same offset and pass.
 */

const PX_PER_DAY = 10;
/** A plan whose earliest activity is 10 Feb, so the chart anchor is a padding day BEFORE it. */
const SPAN = { start: '2026-02-10' };
const ANCHOR = chartAnchor(SPAN);
/** Deliberately different from the anchor — that difference is the bug this module exists to avoid. */
const PLANNED_START = '2026-01-01';

describe('dateAtChartX', () => {
  it('reads x = 0 as the anchor date itself', () => {
    expect(dateAtChartX(ANCHOR, PX_PER_DAY, 0)).toBe(ANCHOR);
  });

  it('floors within a day, so anywhere inside a column is that column day', () => {
    // A drop at 9.9 px with a 10 px day is still day 0. Rounding would make the right-hand tenth of
    // every column belong to the next day, which reads as a bar jumping on release.
    expect(dateAtChartX(ANCHOR, PX_PER_DAY, 9)).toBe(ANCHOR);
    expect(dateAtChartX(ANCHOR, PX_PER_DAY, 10)).toBe('2026-02-10');
  });

  it('crosses a month boundary correctly', () => {
    // 2026 is not a leap year; 28 Feb is the last day.
    expect(dateAtChartX('2026-02-27', PX_PER_DAY, 20)).toBe('2026-03-01');
  });

  it('guards a zero or negative scale rather than producing a date centuries away', () => {
    expect(dateAtChartX(ANCHOR, 0, 500)).toBe(ANCHOR);
    expect(dateAtChartX(ANCHOR, -5, 500)).toBe(ANCHOR);
  });
});

describe('startDayAtChartX', () => {
  it('counts from plannedStart, NOT from the chart anchor', () => {
    // The defect this module exists to prevent. The anchor is 9 Feb (one padding day before the
    // 10th) and plannedStart is 1 Jan, so a drop at x = 0 is day 39, not day 0. Passing the
    // chart-relative day straight through would land every bar 39 days early — consistently, which
    // is what makes it look like a painter bug rather than an origin bug.
    const day = startDayAtChartX({
      anchorIso: ANCHOR,
      plannedStartIso: PLANNED_START,
      pxPerDay: PX_PER_DAY,
      x: 0,
    });
    expect(ANCHOR).toBe('2026-02-09');
    expect(day).toBe(39);
  });

  it('goes negative for a drop before the plan started, rather than clamping', () => {
    // A planner may legitimately drag a bar before `plannedStart`; the API decides what that means.
    // Clamping here would silently move the drop somewhere they did not put it.
    expect(
      startDayAtChartX({
        anchorIso: '2026-01-05',
        plannedStartIso: '2026-01-10',
        pxPerDay: PX_PER_DAY,
        x: 0,
      }),
    ).toBe(-5);
  });
});

describe('durationDaysForFinishAtX', () => {
  it('counts inclusively — the 1st to the 5th is five days', () => {
    expect(
      durationDaysForFinishAtX({
        startIso: '2026-02-01',
        anchorIso: '2026-02-01',
        pxPerDay: PX_PER_DAY,
        x: 40,
      }),
    ).toBe(5);
  });

  it('floors at one day, so a drag cannot turn a task into a milestone', () => {
    // A zero-duration activity IS a milestone. Changing an activity's type is not something a
    // careless drag should be able to do, and there is no way to say "I meant that" afterwards.
    expect(
      durationDaysForFinishAtX({
        startIso: '2026-02-10',
        anchorIso: '2026-02-01',
        pxPerDay: PX_PER_DAY,
        x: 0,
      }),
    ).toBe(1);
  });
});

describe('the round trip a drag actually depends on', () => {
  it('converts a drawn bar back to its own start date', () => {
    // Two separate assertions could both be wrong by the same offset and pass. This one cannot:
    // it draws with the real geometry and reads back with the real conversion.
    for (const startIso of ['2026-02-10', '2026-02-11', '2026-03-01', '2026-12-31']) {
      const activity = anActivity({ earlyStart: startIso, earlyFinish: startIso });
      const geometry = barGeometry(activity, ANCHOR, PX_PER_DAY);
      expect(geometry, `no geometry for ${startIso}`).not.toBeNull();
      expect(dateAtChartX(ANCHOR, PX_PER_DAY, geometry!.x)).toBe(startIso);
    }
  });

  it('holds at every zoom preset scale, not just a convenient one', () => {
    // A conversion that only works at 10 px/day is a conversion that works by coincidence.
    for (const pxPerDay of [1, 2.5, 6, 10, 24, 60]) {
      const activity = anActivity({ earlyStart: '2026-03-17', earlyFinish: '2026-03-20' });
      const geometry = barGeometry(activity, ANCHOR, pxPerDay);
      expect(dateAtChartX(ANCHOR, pxPerDay, geometry!.x), `at ${pxPerDay}px/day`).toBe(
        '2026-03-17',
      );
    }
  });
});
