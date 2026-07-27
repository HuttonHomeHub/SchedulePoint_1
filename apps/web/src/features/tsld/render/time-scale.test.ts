import { ALL_WEEKDAYS_MASK, STANDARD_WEEKDAYS_MASK } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  addCalendarDays,
  MAX_PX_PER_DAY,
  screenXOfDay,
  ZOOM_STOPS,
  ZOOM_TARGET_DAYS,
  type Size,
  type Viewport,
  type ZoomLevel,
} from './render-model';
import {
  calendarBoundaries,
  canZoom,
  isAtPreset,
  isWorkingDay,
  presetOf,
  pxPerDayForPreset,
  rulerTicks,
  stepZoom,
  zoomToPreset,
  ZOOM_LEVELS,
  type WorkingDayCalendar,
} from './time-scale';

const SIZE: Size = { width: 800, height: 400 };
const DATA_DATE = '2026-03-16';

describe('presetOf — flag-off (width-independent, ZOOM_STOPS)', () => {
  it('maps each stop to itself, regardless of the width passed in', () => {
    for (const width of [320, 800, 2560]) {
      expect(presetOf(ZOOM_STOPS.day, width, false)).toBe('day');
      expect(presetOf(ZOOM_STOPS.week, width, false)).toBe('week');
      expect(presetOf(ZOOM_STOPS.month, width, false)).toBe('month');
      expect(presetOf(ZOOM_STOPS.quarter, width, false)).toBe('quarter');
      expect(presetOf(ZOOM_STOPS.year, width, false)).toBe('year');
    }
  });

  it('picks the nearest stop for an in-between scale (log distance)', () => {
    expect(presetOf(30, SIZE.width, false)).toBe('day'); // between week(14) and day(40), closer to day
    expect(presetOf(1, SIZE.width, false)).toBe('year'); // between quarter(2) and year(0.7), closer to year
  });
});

describe('pxPerDayForPreset', () => {
  it('round-trips through presetOf for every preset × a range of widths (the F3 gate)', () => {
    for (const width of [800, 1280, 1366, 1440, 1600, 1920, 2560]) {
      for (const level of ZOOM_LEVELS) {
        const px = pxPerDayForPreset(level, width);
        expect(presetOf(px, width, true)).toBe(level);
      }
    }
  });

  it('frames within ±10% of the nominal target range at ordinary widths (800-2560px)', () => {
    for (const width of [800, 1280, 1600, 1920, 2560]) {
      for (const level of ZOOM_LEVELS) {
        const px = pxPerDayForPreset(level, width);
        // Only meaningful where the clamp doesn't bind — Year clamps below ~440px (documented
        // residual), and these widths are all above that.
        const visibleDays = width / px;
        expect(visibleDays).toBeGreaterThanOrEqual(ZOOM_TARGET_DAYS[level] * 0.9);
        expect(visibleDays).toBeLessThanOrEqual(ZOOM_TARGET_DAYS[level] * 1.1);
      }
    }
  });

  it('clamps at both ends rather than exceeding the legal scale bounds', () => {
    // Day (14d target) on a 2560px canvas would need ~183px/day — comfortably under the 200 cap.
    expect(pxPerDayForPreset('day', 2560)).toBeLessThanOrEqual(MAX_PX_PER_DAY);
    // Year (1095d target) on a narrow canvas clamps to MIN_PX_PER_DAY rather than going negative.
    expect(pxPerDayForPreset('year', 320)).toBeGreaterThanOrEqual(0.4);
  });

  it('documents the residual clamp below ~440px: Year frames less than its 3-year target', () => {
    const px = pxPerDayForPreset('year', 320);
    const visibleDays = 320 / px;
    expect(visibleDays).toBeLessThan(ZOOM_TARGET_DAYS.year);
  });
});

describe('presetOf — flag-on (range-anchored, width-aware)', () => {
  it('maps pxPerDayForPreset(level, width) back to that level, at a narrow and a wide canvas', () => {
    for (const width of [1600, 2560]) {
      for (const level of ZOOM_LEVELS) {
        expect(presetOf(pxPerDayForPreset(level, width), width, true)).toBe(level);
      }
    }
  });

  it('reports a different preset than flag-off would for the same pxPerDay at a real width', () => {
    // At 1600px, Week's range-anchored scale (1600/30 ≈ 53.3 px/day) is far from ZOOM_STOPS.week
    // (14) — proving `presetOf` actually branches on `rangeAnchored` rather than ignoring it.
    const level: ZoomLevel = 'week';
    const px = pxPerDayForPreset(level, 1600);
    expect(presetOf(px, 1600, true)).toBe('week');
    expect(presetOf(px, 1600, false)).not.toBe('week');
  });
});

describe('zoomToPreset', () => {
  it('flag-off: sets the scale to ZOOM_STOPS and keeps the centre day centred', () => {
    const view: Viewport = { pxPerDay: 12, originX: 100, originY: 0 };
    const dayAtCentre = (SIZE.width / 2 - view.originX) / view.pxPerDay;
    const next = zoomToPreset(view, SIZE, 'day', false);
    expect(next.pxPerDay).toBe(ZOOM_STOPS.day);
    // The day that was under the viewport centre is still under the centre after the reframe.
    expect(screenXOfDay(dayAtCentre, next)).toBeCloseTo(SIZE.width / 2);
  });

  it('flag-on: sets the scale to the width-derived preset scale, centre still centred', () => {
    const view: Viewport = { pxPerDay: 12, originX: 100, originY: 0 };
    const wideSize: Size = { width: 1600, height: 400 };
    const dayAtCentre = (wideSize.width / 2 - view.originX) / view.pxPerDay;
    const next = zoomToPreset(view, wideSize, 'day', true);
    expect(next.pxPerDay).toBeCloseTo(pxPerDayForPreset('day', wideSize.width));
    expect(next.pxPerDay).not.toBe(ZOOM_STOPS.day);
    expect(screenXOfDay(dayAtCentre, next)).toBeCloseTo(wideSize.width / 2);
  });
});

describe('stepZoom / canZoom', () => {
  it('multiplies the scale about the centre', () => {
    const view: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
    expect(stepZoom(view, SIZE, 2).pxPerDay).toBe(20);
  });

  it('reports when a further zoom is (im)possible at the clamp bounds', () => {
    expect(canZoom(10, 2)).toBe(true);
    expect(canZoom(ZOOM_STOPS.year, 1 / 1.1)).toBe(true); // year(0.7) can still zoom out a bit
    expect(canZoom(0.4, 1 / 2)).toBe(false); // already at MIN_PX_PER_DAY
    expect(canZoom(MAX_PX_PER_DAY, 2)).toBe(false); // already at MAX_PX_PER_DAY
  });
});

describe('isAtPreset', () => {
  it('is true only for the nearest preset (flag-off)', () => {
    expect(isAtPreset(ZOOM_STOPS.month, 'month', SIZE.width, false)).toBe(true);
    expect(isAtPreset(ZOOM_STOPS.month, 'day', SIZE.width, false)).toBe(false);
  });

  it('is true only for the nearest preset (flag-on, width-aware)', () => {
    const px = pxPerDayForPreset('month', 1600);
    expect(isAtPreset(px, 'month', 1600, true)).toBe(true);
    expect(isAtPreset(px, 'day', 1600, true)).toBe(false);
  });
});

describe('rulerTicks', () => {
  it('shows day numbers, months and years when fully zoomed in', () => {
    const view: Viewport = { pxPerDay: ZOOM_STOPS.day, originX: 40, originY: 0 };
    const r = rulerTicks(view, SIZE, DATA_DATE);
    expect(r.days.length).toBeGreaterThan(0);
    expect(r.months.length).toBeGreaterThan(0);
    expect(r.years.length).toBeGreaterThan(0);
    // The first day label is a day-of-month number.
    expect(r.days[0]!.label).toMatch(/^\d{1,2}$/);
    expect(r.months.some((m) => m.label === 'Mar')).toBe(true);
    expect(r.years.some((y) => y.label === '2026')).toBe(true);
  });

  it('drops the day row when columns are too narrow, keeping months + years', () => {
    const view: Viewport = { pxPerDay: ZOOM_STOPS.week, originX: 40, originY: 0 };
    const r = rulerTicks(view, SIZE, DATA_DATE);
    expect(r.days).toHaveLength(0);
    expect(r.months.length).toBeGreaterThan(0);
    expect(r.years.length).toBeGreaterThan(0);
  });

  it('drops to year bands only at the coarsest zoom, and stays viewport-bounded (not O(plan))', () => {
    const view: Viewport = { pxPerDay: ZOOM_STOPS.year, originX: 40, originY: 0 };
    const r = rulerTicks(view, SIZE, DATA_DATE);
    expect(r.days).toHaveLength(0);
    expect(r.months).toHaveLength(0);
    // ~800px / 0.7px-per-day ≈ 3 years visible → only a handful of year bands, not thousands.
    expect(r.years.length).toBeGreaterThan(0);
    expect(r.years.length).toBeLessThan(10);
  });

  it('includes a band whose start is just off-screen left (one-column margin)', () => {
    // Pan so day 0 sits at x=5: the generated span starts one column left of the visible edge,
    // so a label whose band begins just off-screen still has an anchor to position against.
    const view: Viewport = { pxPerDay: ZOOM_STOPS.day, originX: 5, originY: 0 };
    const r = rulerTicks(view, SIZE, DATA_DATE);
    expect(r.days[0]!.x).toBeLessThan(0);
  });
});

describe('calendarBoundaries', () => {
  it('finds month starts (and year starts among them) via integer rollover, incl. a year boundary', () => {
    // From 2025-12-30, day offsets: 0=Dec30, 2=Jan1(2026, month+year start), 33=Feb1, 61=Mar1.
    const { months, years } = calendarBoundaries(0, 65, '2025-12-30');
    expect(months).toContain(2); // 2026-01-01
    expect(months).toContain(33); // 2026-02-01
    expect(months).toContain(61); // 2026-03-01 (2026 is not a leap year → Feb has 28 days)
    expect(years).toEqual([2]); // only the Jan-1 boundary is also a year start
  });

  it('handles a leap-year February correctly (29 days)', () => {
    // 2024 is a leap year: from 2024-02-01 (offset 0), Mar 1 is 29 days later (offset 29).
    const { months } = calendarBoundaries(0, 40, '2024-02-01');
    expect(months).toContain(0); // Feb 1
    expect(months).toContain(29); // Mar 1 — proves Feb had 29 days
  });

  it('returns empty rows when the span contains no boundary', () => {
    // Mid-month span with no 1st-of-month: 2026-03-10 (offset 0) .. 2026-03-14 (offset 4).
    // `startMonthIndex` is still reported — it is the absolute month ordinal of the first visible
    // day, which the month bands derive their parity from, and is defined whether or not the span
    // happens to contain a boundary.
    expect(calendarBoundaries(0, 4, '2026-03-10')).toEqual({
      months: [],
      years: [],
      startMonthIndex: 2026 * 12 + 2,
    });
  });
});

describe('isWorkingDay', () => {
  const noExceptions: WorkingDayCalendar = {
    workingWeekdays: STANDARD_WEEKDAYS_MASK,
    exceptions: new Map(),
  };

  it('shades exactly the 2 weekend days in any 7-day window under a Mon–Fri mask', () => {
    const working = [0, 1, 2, 3, 4, 5, 6].filter((d) => isWorkingDay(d, DATA_DATE, noExceptions));
    expect(working).toHaveLength(5); // Mon–Fri worked, Sat/Sun not — regardless of the start weekday
  });

  it('works every day under an all-days mask', () => {
    const cal: WorkingDayCalendar = { workingWeekdays: ALL_WEEKDAYS_MASK, exceptions: new Map() };
    expect([0, 1, 2, 3, 4, 5, 6].every((d) => isWorkingDay(d, DATA_DATE, cal))).toBe(true);
  });

  it('lets a dated exception override the weekly mask (a holiday, and a worked weekend)', () => {
    // Make the data date (a normally-worked day) a holiday.
    const holiday: WorkingDayCalendar = {
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
      exceptions: new Map([[DATA_DATE, false]]),
    };
    expect(isWorkingDay(0, DATA_DATE, holiday)).toBe(false);
    // Make a normally-non-working weekend day worked: find the first non-working offset, flip it.
    const firstOff = [0, 1, 2, 3, 4, 5, 6].find((d) => !isWorkingDay(d, DATA_DATE, noExceptions))!;
    const worked: WorkingDayCalendar = {
      workingWeekdays: STANDARD_WEEKDAYS_MASK,
      exceptions: new Map([[addCalendarDays(DATA_DATE, firstOff), true]]),
    };
    expect(isWorkingDay(firstOff, DATA_DATE, worked)).toBe(true);
  });
});
