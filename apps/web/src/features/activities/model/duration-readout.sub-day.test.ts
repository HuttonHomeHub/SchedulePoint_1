import { describe, expect, it, vi } from 'vitest';

/**
 * The Duration column's read-out with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070 M4).
 *
 * The defect it closes: a four-hour lift typed into the M1 field read back as `0 d`, which is what
 * the table also prints for a milestone — so the one screen that lists a plan's work showed a real
 * activity as having none.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const { formatDurationCell, formatDurationRead } = await import('./duration-field');

/** An eight-hour working day — so a day is 480 minutes and not 1440 (ADR-0068). */
const EIGHT = 8;

describe('formatDurationRead', () => {
  it('renders the exact value when the duration is not a whole number of days', () => {
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 240 }, EIGHT)).toBe('4h');
    expect(formatDurationRead({ durationDays: 2, durationMinutes: 1200 }, EIGHT)).toBe('2d 4h');
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 90 }, EIGHT)).toBe('1h 30m');
  });

  it('keeps the shape a whole-day duration has always had', () => {
    expect(formatDurationRead({ durationDays: 5, durationMinutes: 2400 }, EIGHT)).toBe('5 d');
    expect(formatDurationRead({ durationDays: 1, durationMinutes: 480 }, EIGHT)).toBe('1 d');
  });

  it('reads the day on the ACTIVITY’s own calendar', () => {
    // 480 minutes is one day at eight hours and a third of one at twenty-four. The same stored
    // number, two correct answers — which is why the factor is never defaulted. (`durationDays` is
    // what the SERVER computed, so a row measured on a 24-hour calendar carries 0 here.)
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 480 }, 24)).toBe('8h');
  });

  it('falls back to the stored day count with no factor', () => {
    // The degraded path and the flag-off path are the same output, deliberately.
    expect(formatDurationRead({ durationDays: 5, durationMinutes: 2400 }, undefined)).toBe('5 d');
    expect(formatDurationRead({ durationDays: 0, durationMinutes: 240 }, undefined)).toBe('0 d');
  });
});

describe('formatDurationCell (the one Duration cell, #375, ADR-0197)', () => {
  const zero = { durationDays: 0, durationMinutes: 0 };
  it('reads an em dash for both milestone types', () => {
    expect(formatDurationCell({ ...zero, type: 'START_MILESTONE' }, EIGHT)).toBe('—');
    expect(formatDurationCell({ ...zero, type: 'FINISH_MILESTONE' }, EIGHT)).toBe('—');
  });

  it('reads every plain type exactly as formatDurationRead does', () => {
    for (const type of ['TASK', 'RESOURCE_DEPENDENT']) {
      expect(formatDurationCell({ type, durationDays: 0, durationMinutes: 240 }, EIGHT)).toBe('4h');
      expect(formatDurationCell({ type, ...zero }, EIGHT)).toBe('0 d');
    }
  });

  describe.each(['WBS_SUMMARY', 'LEVEL_OF_EFFORT'])('a %s states the derived duration', (type) => {
    // This block restates two assertions the #375 fix pinned: that a summary reads `—` and that an LOE
    // reads `0 d`. Both described the STORED duration being unusable, which is still true — the cell now
    // reads the engine-derived span instead, and `—` means the engine wrote none.
    it('in whole days', () => {
      expect(
        formatDurationCell(
          { type, ...zero, derivedDurationDays: 47, derivedDurationMinutes: 47 * 480 },
          EIGHT,
        ),
      ).toBe('47 d');
    });

    it('in the sub-day grammar when the span is not a whole number of days', () => {
      expect(
        formatDurationCell(
          { type, ...zero, derivedDurationDays: 47, derivedDurationMinutes: 46 * 480 + 240 },
          EIGHT,
        ),
      ).toBe('46d 4h');
    });

    it('as an em dash where the engine wrote none, never the stored zero', () => {
      expect(formatDurationCell({ type, ...zero, derivedDurationMinutes: null }, EIGHT)).toBe('—');
      expect(formatDurationCell({ type, ...zero }, EIGHT)).toBe('—');
    });

    it('as a real zero when the span is genuinely zero', () => {
      expect(
        formatDurationCell(
          { type, ...zero, derivedDurationDays: 0, derivedDurationMinutes: 0 },
          EIGHT,
        ),
      ).toBe('0 d');
    });
  });

  it('ignores a derived value on a task', () => {
    expect(
      formatDurationCell(
        {
          type: 'TASK',
          durationDays: 2,
          durationMinutes: 960,
          derivedDurationDays: 9,
          derivedDurationMinutes: 9 * 480,
        },
        EIGHT,
      ),
    ).toBe('2 d');
  });
});
