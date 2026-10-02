import { describe, expect, it } from 'vitest';

import { barGeometry, chartAnchor } from './bar-geometry';
import {
  columnsMoved,
  dateAtChartX,
  finishEdgePlacement,
  previewBarSpan,
  spanToPlacement,
  startDayAtChartX,
  startEdgePlacement,
} from './drag-day';

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

/** A Mon–Fri predicate over day offsets: day 0 is a Monday, offsets 5 and 6 (mod 7) are off. */
const MON_FRI = (dayOffset: number): boolean => ((dayOffset % 7) + 7) % 7 < 5;
/** A Monday, so `PLAN_MONDAY` offsets and `MON_FRI` agree. */
const PLAN_MONDAY = '2026-03-02';

describe('spanToPlacement', () => {
  it('counts WORKING days across a weekend, not the calendar days the bar covers', () => {
    // Fri (4) → Tue (8) is five columns and three working days. Writing five made the engine lay
    // out five working days, and the bar came back two days longer than it was drawn.
    expect(spanToPlacement({ startDay: 4, endDay: 8, isWorkingDay: MON_FRI })).toEqual({
      startDay: 4,
      durationDays: 3,
    });
  });

  it('rolls a non-working start FORWARD to the next working day', () => {
    // Saturday (5) → Wednesday (9): the bar starts Monday (7), so Mon, Tue, Wed.
    expect(spanToPlacement({ startDay: 5, endDay: 9, isWorkingDay: MON_FRI })).toEqual({
      startDay: 7,
      durationDays: 3,
    });
  });

  it('honours a holiday exception, which a weekday mask alone would miss', () => {
    // Wednesday (2) is a shutdown day: Mon–Fri is four working days, not five.
    const withHoliday = (d: number): boolean => d !== 2 && MON_FRI(d);
    expect(
      spanToPlacement({ startDay: 0, endDay: 4, isWorkingDay: withHoliday }).durationDays,
    ).toBe(4);
  });

  it('returns the calendar span with no predicate — the plan calendar has not loaded', () => {
    expect(spanToPlacement({ startDay: 4, endDay: 8, isWorkingDay: null })).toEqual({
      startDay: 4,
      durationDays: 5,
    });
  });

  it('floors at one working day, so a drag cannot turn a task into a milestone', () => {
    // A span drawn inside a weekend has no working day in it. Zero is a milestone.
    expect(spanToPlacement({ startDay: 5, endDay: 6, isWorkingDay: MON_FRI }).durationDays).toBe(1);
  });
});

describe('columnsMoved', () => {
  it('rounds to the nearest column, and never returns -0', () => {
    expect(columnsMoved(14, 10)).toBe(1);
    expect(columnsMoved(-14, 10)).toBe(-1);
    expect(Object.is(columnsMoved(-4, 10), 0)).toBe(true);
  });

  it('is zero for a scale that cannot be divided by', () => {
    expect(columnsMoved(50, 0)).toBe(0);
  });

  it('rounds an exact half column UP — one column to the right, none to the left', () => {
    // `Math.round` ties toward +Infinity, so the two directions are asymmetric. Pinned because
    // nothing else would notice the day somebody swaps the rounding.
    expect(columnsMoved(5, 10)).toBe(1);
    expect(columnsMoved(-5, 10)).toBe(0);
    expect(columnsMoved(15, 10)).toBe(2);
    expect(columnsMoved(-15, 10)).toBe(-1);
  });
});

describe('previewBarSpan', () => {
  const bar = { x: 100, width: 50, pxPerDay: 10 };

  it('is the bar unchanged, and not resizing, with no drag', () => {
    expect(previewBarSpan({ ...bar, finishDeltaX: null, startDeltaX: null })).toEqual({
      x: 100,
      width: 50,
      resizing: false,
    });
  });

  it('moves only the right edge for a finish drag, at whole columns', () => {
    expect(previewBarSpan({ ...bar, finishDeltaX: 24, startDeltaX: null })).toEqual({
      x: 100,
      width: 70,
      resizing: true,
    });
  });

  it('moves the left edge and shrinks the width by the same amount for a start drag', () => {
    expect(previewBarSpan({ ...bar, finishDeltaX: null, startDeltaX: 26 })).toEqual({
      x: 130,
      width: 20,
      resizing: true,
    });
  });

  it('stops one column short of the opposite edge, so the bar never inverts', () => {
    expect(previewBarSpan({ ...bar, finishDeltaX: -500, startDeltaX: null }).width).toBe(10);
    expect(previewBarSpan({ ...bar, finishDeltaX: null, startDeltaX: 500 })).toMatchObject({
      x: 140,
      width: 10,
    });
  });
});

describe('finishEdgePlacement', () => {
  const base = { plannedStartIso: PLAN_MONDAY, isWorkingDay: MON_FRI };

  it('keeps a Mon–Fri task five days long when its finish is dragged a weekend out and back', () => {
    // Mon 2 → Fri 6 is five working days. Drag the finish seven columns (to Fri 13) and it is ten.
    // Calendar arithmetic would have said 12.
    expect(
      finishEdgePlacement({ ...base, startIso: '2026-03-02', finishIso: '2026-03-06', columns: 7 })
        .durationDays,
    ).toBe(10);
  });

  it('writes the duration the pointer drew across a weekend', () => {
    // Fri 6 → Tue 10 drawn: three working days.
    expect(
      finishEdgePlacement({ ...base, startIso: '2026-03-06', finishIso: '2026-03-06', columns: 4 })
        .durationDays,
    ).toBe(3);
  });

  it('never lets the finish pass the start', () => {
    expect(
      finishEdgePlacement({
        ...base,
        startIso: '2026-03-04',
        finishIso: '2026-03-06',
        columns: -9,
      }),
    ).toEqual({ startDay: 2, durationDays: 1 });
  });
});

describe('startEdgePlacement', () => {
  const base = { plannedStartIso: PLAN_MONDAY, isWorkingDay: MON_FRI };

  it('holds the finish: a start dragged back over a weekend adds working days, not calendar ones', () => {
    // Task Tue 10 → Thu 12; the start is dragged three columns left, to Sat 7, and rolls forward to
    // Mon 9. The finish (day 10) stays, so Mon–Thu: four working days.
    expect(
      startEdgePlacement({ ...base, startIso: '2026-03-10', finishIso: '2026-03-12', columns: -3 }),
    ).toEqual({ startDay: 7, durationDays: 4 });
  });

  it('clamps at the finish day, so the bar never inverts', () => {
    expect(
      startEdgePlacement({ ...base, startIso: '2026-03-03', finishIso: '2026-03-05', columns: 9 }),
    ).toEqual({ startDay: 3, durationDays: 1 });
  });

  it('counts back across a weekend: Mon 9 → Fri 13 dragged to the previous Thursday', () => {
    // Start Mon 9 (day 7) dragged 4 left is Thu 5 (day 3); finish Fri 13 (day 11): Thu, Fri, then Mon–Fri.
    expect(
      startEdgePlacement({ ...base, startIso: '2026-03-09', finishIso: '2026-03-13', columns: -4 }),
    ).toEqual({ startDay: 3, durationDays: 7 });
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

describe('the edge placements round-trip against the geometry the bar is drawn with', () => {
  it('holds at every zoom preset scale', () => {
    // Draw the bar, "drag" its finish by whole columns taken from a pixel delta at that scale, and
    // the days written must not depend on the scale — a conversion that only holds at 10 px/day
    // holds by coincidence.
    for (const pxPerDay of [1, 2.5, 6, 10, 24, 60]) {
      const activity = anActivity({ earlyStart: '2026-03-02', earlyFinish: '2026-03-06' });
      const geometry = barGeometry(activity, ANCHOR, pxPerDay);
      expect(geometry).not.toBeNull();
      const columns = columnsMoved(7 * pxPerDay, pxPerDay);
      expect(
        finishEdgePlacement({
          plannedStartIso: PLAN_MONDAY,
          startIso: '2026-03-02',
          finishIso: '2026-03-06',
          columns,
          isWorkingDay: MON_FRI,
        }).durationDays,
        `at ${String(pxPerDay)}px/day`,
      ).toBe(10);
    }
  });
});
