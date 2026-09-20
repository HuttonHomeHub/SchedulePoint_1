import { describe, expect, it } from 'vitest';

import { feasibleWindowRect, TAIL_HEIGHT, type Rect, type Viewport } from './geometry';

/**
 * **The feasible window's derivation** (one-planning-surface M-E, spec §4.8).
 *
 * The painter's cases live in `paint.live-feedback.test.ts` and count marks on a batched path;
 * these assert the arithmetic that decides where those marks go, which a counting stub cannot see.
 */
// A real `Viewport`, not an `as` cast over a partial literal. The first version cast, invented an
// `originDay` field that does not exist and omitted `originX` that does — vitest does not
// typecheck, so it passed here and failed only at the pre-push gate. A cast in a fixture is how a
// test stops describing the type it claims to be about.
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const BAR: Rect = { x: 100, y: 50, w: 40, h: 18 };

describe('the feasible window', () => {
  it('brackets [earlyStart, lateFinish] in the band it inherits from the tails', () => {
    // Placed 3 days late with 2 days left: earliest is 3 days left of the bar, latest 2 right of it.
    const win = feasibleWindowRect(BAR, 2, 3, VIEW)!;
    expect(win.leftCapX).toBe(100 - 30);
    expect(win.rightCapX).toBe(140 + 20);
    expect(win.rect).toEqual({ x: 70, y: 50 + (18 - TAIL_HEIGHT) / 2, w: 90, h: TAIL_HEIGHT });
  });

  it('derives the right edge from remainingFloat, never from totalFloat', () => {
    // The whole of `docs/TECH_DEBT.md` #348 in one assertion. `totalFloat` is measured from the
    // EARLY finish; from a PLACED finish the room left is `T − d`. A window built from the former
    // overshoots the late finish by exactly the drift — and is indistinguishable from a correct one
    // wherever nothing is placed, which is why this fixture places something.
    const totalFloat = 10;
    const drift = 8;
    const remaining = totalFloat - drift;
    const correct = feasibleWindowRect(BAR, remaining, drift, VIEW)!;
    const overshooting = feasibleWindowRect(BAR, totalFloat, drift, VIEW)!;
    expect(correct.rightCapX).toBe(140 + 20);
    expect(overshooting.rightCapX).toBe(140 + 100);
    expect(correct.rightCapX).not.toBe(overshooting.rightCapX);
  });

  it('is symmetric about the bar: the span is drift + duration + remaining float', () => {
    // The structural identity, stated as arithmetic so a later edit cannot quietly break half of
    // it: left edge = earlyStart, right edge = lateFinish, and the bar sits between them.
    const win = feasibleWindowRect(BAR, 4, 6, VIEW)!;
    expect(win.rect.w).toBe((6 + 4) * VIEW.pxPerDay + BAR.w);
  });

  describe('the two states the shipped tails drew nothing for', () => {
    it('inverts the RIGHT cap when remaining float is negative', () => {
      // A placement past a ceiling: the bar overflows its own window, so the cap falls inside it
      // and must be painted AFTER the bar or it is invisible.
      const win = feasibleWindowRect(BAR, -2, 0, VIEW)!;
      expect(win.rightCapInsideBar).toBe(true);
      expect(win.rightCapX).toBe(140 - 20);
      expect(win.leftCapInsideBar).toBe(false);
    });

    it('inverts the LEFT cap when drift is negative', () => {
      // ADR-0033's stay-and-flag KEEPS a placement earlier than logic allows rather than clamping
      // it, and drift is signed. This half was missing from the spec until an architecture review —
      // one correct pattern applied to a control and not its neighbour.
      const win = feasibleWindowRect(BAR, 3, -2, VIEW)!;
      expect(win.leftCapInsideBar).toBe(true);
      expect(win.leftCapX).toBe(100 + 20);
      expect(win.rightCapInsideBar).toBe(false);
    });

    it('inverts BOTH at once — they are independent', () => {
      const win = feasibleWindowRect(BAR, -1, -1, VIEW)!;
      expect(win.leftCapInsideBar).toBe(true);
      expect(win.rightCapInsideBar).toBe(true);
      // The rect still spans a positive width, because it is normalised rather than assumed
      // left-to-right. A raw subtraction would give a negative width and draw nothing.
      expect(win.rect.w).toBeGreaterThan(0);
    });
  });

  describe('the two nulls, which are different facts', () => {
    it('draws a zero-width bracket on a critical, unplaced bar', () => {
      // The COMMON case on the deployed estate (FC-1 predicts no placements at all), and the one
      // the old tails returned `null` for. A control that lights and does nothing is the
      // lit-but-inert dead end ADR-0081 records four times.
      const win = feasibleWindowRect(BAR, 0, null, VIEW)!;
      expect(win).not.toBeNull();
      expect(win.leftCapX).toBe(BAR.x);
      expect(win.rightCapX).toBe(BAR.x + BAR.w);
    });

    it('returns null ONLY when the plan has never been calculated', () => {
      // No remaining float means no late finish to bracket — the one state with no honest answer.
      expect(feasibleWindowRect(BAR, null, 3, VIEW)).toBeNull();
      expect(feasibleWindowRect(BAR, undefined, 3, VIEW)).toBeNull();
      // …and a null DRIFT is not that state: it means unplaced, so the left edge is the bar's own.
      expect(feasibleWindowRect(BAR, 5, null, VIEW)).not.toBeNull();
      expect(feasibleWindowRect(BAR, 5, undefined, VIEW)).not.toBeNull();
    });
  });
});
