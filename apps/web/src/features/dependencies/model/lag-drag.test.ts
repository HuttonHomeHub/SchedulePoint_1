import { describe, expect, it } from 'vitest';

import { hasSubDayLag, resolveLagDragWrite } from './lag-drag';

/**
 * **A whole-day drag must not flatten a sub-day lag** (`docs/TECH_DEBT.md` #233).
 *
 * Every case below was verified red against the pre-fix handler, which computed
 * `lagDays === dependency.lagDays ? noop : send(lagDays)` — so the remainder cases returned a
 * whole-day absolute and the `1d 90m` row lost its ninety minutes on the first drag.
 *
 * The fixture factor is **8 hours a day (480 minutes)** throughout, because that is the calendar
 * the defect is visible on: on a 24-hour calendar every lag a planner types happens to be a whole
 * number of days more often, and a test that only ever exercised 1440 would pass against a
 * function that had hard-coded it.
 */

const H = 8; // hours per day
const D = H * 60; // 480 working minutes in a day

/** A row as the API returns it: `lagDays` is ROUNDED from `lagMinutes`, which is what is stored. */
function row(lagDays: number, lagMinutes: number): { lagDays: number; lagMinutes: number } {
  return { lagDays, lagMinutes };
}

describe('resolveLagDragWrite — the drag moves whole days and keeps the remainder', () => {
  it('writes minutes, not days, so the remainder survives a drag that lands', () => {
    // 1d 90m stored (570 min on an 8h day) dragged one column right.
    expect(resolveLagDragWrite(row(1, 570), 2, H)).toEqual({ kind: 'minutes', lagMinutes: 1050 });
    // 1050 is 2d 90m. The pre-fix handler sent `lagDays: 2` and the 90 minutes were gone.
  });

  it('keeps the remainder dragging the other way, including across zero into a lead', () => {
    expect(resolveLagDragWrite(row(1, 570), 0, H)).toEqual({ kind: 'minutes', lagMinutes: 90 });
    expect(resolveLagDragWrite(row(1, 570), -1, H)).toEqual({ kind: 'minutes', lagMinutes: -390 });
  });

  /**
   * **The rounding cancels, and this is the case that proves it.** `lagDays` appears on both sides
   * of the delta, so the result does not depend on how the API rounded — 570/480 is 1.1875, and
   * whether that was floored, rounded or truncated to 1, moving one column adds exactly one day's
   * minutes. A formulation that rebuilt an absolute from `lagDays × 480` would answer 960 here and
   * be wrong by the remainder.
   */
  it('does not depend on how lagDays was rounded', () => {
    for (const stored of [481, 570, 700, 959]) {
      const moved = resolveLagDragWrite(row(1, stored), 2, H);
      expect(moved, `stored ${stored}`).toEqual({ kind: 'minutes', lagMinutes: stored + D });
    }
  });

  it('is a no-op when the pointer stayed inside its day column', () => {
    expect(resolveLagDragWrite(row(0, 90), 0, H)).toEqual({ kind: 'noop' });
    expect(resolveLagDragWrite(row(3, 3 * D), 3, H)).toEqual({ kind: 'noop' });
  });

  /**
   * The degraded path, and it is the pre-fix behaviour on purpose: an unknown factor cannot
   * preserve a remainder, and ADR-0068 leaves no safe fallback — guessing 24 would read an
   * eight-hour day as three and guessing 8 would do the reverse, both silently, both moving dates.
   * So it sends what it always sent rather than inventing minutes.
   */
  it('falls back to whole days when the lag calendar factor is unknown', () => {
    expect(resolveLagDragWrite(row(1, 570), 2, undefined)).toEqual({ kind: 'days', lagDays: 2 });
    expect(resolveLagDragWrite(row(1, 570), 1, undefined)).toEqual({ kind: 'noop' });
  });

  /** A whole-day lag is byte-identical in effect either way — the parity case. */
  it('a whole-day lag writes the same instant whichever branch runs', () => {
    const known = resolveLagDragWrite(row(2, 2 * D), 5, H);
    expect(known).toEqual({ kind: 'minutes', lagMinutes: 5 * D });
    expect(resolveLagDragWrite(row(2, 2 * D), 5, undefined)).toEqual({ kind: 'days', lagDays: 5 });
  });

  /** The 24-hour (elapsed) calendar, where a day is 1440 — the other real factor in the product. */
  it('measures the delta on the elapsed calendar when that is the lag calendar', () => {
    expect(resolveLagDragWrite(row(7, 7 * 1440 + 30), 8, 24)).toEqual({
      kind: 'minutes',
      lagMinutes: 8 * 1440 + 30,
    });
  });
});

describe('hasSubDayLag', () => {
  it('is true only when the row carries time a whole-day gesture cannot express', () => {
    expect(hasSubDayLag(row(0, 90), H)).toBe(true);
    expect(hasSubDayLag(row(1, 570), H)).toBe(true);
    expect(hasSubDayLag(row(0, 0), H)).toBe(false);
    expect(hasSubDayLag(row(2, 2 * D), H)).toBe(false);
    expect(hasSubDayLag(row(-1, -D), H)).toBe(false);
  });

  /** "I cannot tell" must not render as "there is none" — the ADR-0070 three-valued rule. */
  it('is false when the factor is unknown, and says so rather than guessing', () => {
    expect(hasSubDayLag(row(0, 90), undefined)).toBe(false);
  });
});
