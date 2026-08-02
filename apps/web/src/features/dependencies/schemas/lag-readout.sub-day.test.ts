import { describe, expect, it, vi } from 'vitest';

/**
 * The Lag column's read-out with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070 M4).
 *
 * Its own file because the flag is a build-time constant. What it pins is the reason M4 exists: a
 * two-hour cure lag typed into the M3 field previously read back as `0d` — indistinguishable from
 * no lag at all, in the one place a planner would look to check what they had just saved.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const { formatLag } = await import('./dependency-schemas');

/** An eight-hour working day — so a day is 480 minutes and not 1440 (ADR-0068). */
const EIGHT = 8;

describe('formatLag — sub-day read-out', () => {
  it('renders the exact value when the lag is not a whole number of days', () => {
    expect(formatLag({ lagDays: 0, lagMinutes: 240 }, EIGHT)).toBe('+4h');
    expect(formatLag({ lagDays: 0, lagMinutes: -90 }, EIGHT)).toBe('−1h 30m');
    expect(formatLag({ lagDays: 1, lagMinutes: 510 }, EIGHT)).toBe('+1d 30m');
  });

  it('keeps the shape a whole-day lag has always had', () => {
    // Nothing churns visually on a plan with no sub-day logic in it; the finer text appears only
    // when the value actually is finer.
    expect(formatLag({ lagDays: 2, lagMinutes: 960 }, EIGHT)).toBe('+2d');
    expect(formatLag({ lagDays: -1, lagMinutes: -480 }, EIGHT)).toBe('−1d');
    expect(formatLag({ lagDays: 0, lagMinutes: 0 }, EIGHT)).toBe('0d');
  });

  it('uses the typographic minus, because this is display and not a field', () => {
    // The inverse of the field's rule: the input writes an ASCII hyphen so a planner can retype it.
    expect(formatLag({ lagDays: 0, lagMinutes: -240 }, EIGHT)).toContain('−');
    expect(formatLag({ lagDays: 0, lagMinutes: -240 }, EIGHT)).not.toContain('-');
  });

  it('falls back to the stored day count with no factor', () => {
    // The degraded path — and the flag-off path — are the same output, deliberately.
    expect(formatLag({ lagDays: 3, lagMinutes: 1440 })).toBe('+3d');
    expect(formatLag({ lagDays: 0, lagMinutes: 240 })).toBe('0d');
  });

  it('reads a 24-hour lag on ITS day, not the plan’s', () => {
    // Four hours elapsed is a sixth of a 24-hour day and half an eight-hour one. Handing this the
    // wrong factor would not error — it would quietly print a different lag.
    expect(formatLag({ lagDays: 0, lagMinutes: 720 }, 24)).toBe('+12h');
    expect(formatLag({ lagDays: 0, lagMinutes: 720 }, EIGHT)).toBe('+1d 4h');
  });
});
