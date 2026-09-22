import { describe, expect, it } from 'vitest';

import {
  BAR_HEIGHT,
  BAR_PAD,
  LABEL_FONT,
  LABEL_INSIDE_MIN_HEIGHT_PX,
  LANE_HEIGHT,
  TAIL_HEIGHT,
} from './geometry';
import { BAR_RADIUS, GLYPH_CAP_OVERHANG, PROGRESS_BAND_H, SUMMARY_TAB_H } from './render-model';

/**
 * **Each glyph constant's justification, asserted** (logic-legibility M3-T2, re-baselined at T3).
 *
 * Seven constants were literals whose entire reason for being that number was a sentence about
 * `BAR_HEIGHT = 18` — _"thinner than the bar"_, _"subtle at 18"_, _"1 px clearance"_,
 * _"BAR_HEIGHT/2 = 9px"_. Every one of those sentences **inverts** at a NetPoint-thin bar: a 6 px
 * tail becomes thicker than the bar it recedes behind, a 3 px radius makes a capsule, a 4 px tab
 * is nearly as tall as the bar it hangs from, and a fan-out step of 3 exceeds a half-height of
 * 2.5 before the cap is even consulted.
 *
 * The constants are now derived, and this file asserts **the relationship rather than the value**
 * — so the claim in each docblock and the number in the code cannot part company again. That is
 * the whole of M3-T2: a value re-derived without its justification written somewhere a machine
 * reads is the same literal wearing a different number.
 *
 * **Every derivation reproduces today's shipped value exactly at `BAR_HEIGHT = 18`**, which is
 * what makes this milestone byte-identical and therefore committable on its own. The pinned values
 * below are that assertion; they are not the gate, the relationships above them are.
 *
 * **The fan-out pair used to be the sharpest case here and is now gone**, which is the strongest
 * thing this file did. `link-routing.ts` justified `FAN_OUT_MAX_PX = 6` by `BAR_HEIGHT / 2` in a
 * module that did not import `BAR_HEIGHT`; importing it made the relationship checkable, checking
 * it at the target geometry showed it could not hold, and M3-T3 retired the mechanism in favour of
 * the node glyph. Its two cases are **deleted with it, not relaxed** — exactly as the arrowhead
 * case's own docblock said they would be.
 */

/** A bar's half-height — the quantity several of these constants are really about. */
const HALF_BAR = BAR_HEIGHT / 2;

describe('M3-T2 — each constant asserts the relationship its docblock claims', () => {
  it('TAIL_HEIGHT is thinner than the bar, so a tail never reads as duration', () => {
    expect(TAIL_HEIGHT).toBeLessThan(BAR_HEIGHT);
    expect(TAIL_HEIGHT).toBeGreaterThanOrEqual(1);
  });

  it('BAR_RADIUS softens the bar rather than making it a capsule', () => {
    // A radius at or past the half-height IS a capsule — the shape the docblock says it is not.
    expect(BAR_RADIUS).toBeLessThan(HALF_BAR);
    expect(BAR_RADIUS).toBeGreaterThanOrEqual(1);
  });

  it('GLYPH_CAP_OVERHANG stays a proportion of the bar AND fits inside the pad', () => {
    // Proportion: a cap that overhangs by more than the bar is half as tall reads as the glyph.
    expect(GLYPH_CAP_OVERHANG).toBeLessThan(HALF_BAR);
    // Containment: the bracket must not leave the lane (FC-6). The `- 1` is the hairline stroke.
    expect(GLYPH_CAP_OVERHANG).toBeLessThanOrEqual(BAR_PAD - 1);
  });

  it('SUMMARY_TAB_H is a proportion of the bar AND fits inside the pad', () => {
    // The shipped 4 was justified by a 1 px clearance, which stops binding once the pad grows;
    // what does not stop binding is that a tab nearly as tall as its bar is not a tab.
    expect(SUMMARY_TAB_H).toBeLessThan(HALF_BAR);
    expect(SUMMARY_TAB_H).toBeLessThanOrEqual(BAR_PAD - 1);
  });

  it('the in-bar progress band and its insets fit inside the bar', () => {
    // 2 px inset top and bottom plus the band itself, with room left for the centred label above.
    expect(PROGRESS_BAND_H * 2).toBeLessThanOrEqual(BAR_HEIGHT);
  });

  it('LABEL_INSIDE_MIN_HEIGHT_PX holds the font it gates', () => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(LABEL_FONT)?.[1]);
    expect(Number.isFinite(px)).toBe(true);
    expect(LABEL_INSIDE_MIN_HEIGHT_PX).toBeGreaterThan(px);
  });

  /**
   * The values these derivations produce at the **shipped** geometry, pinned so this milestone is
   * visibly byte-identical. When M3-T3 changes `BAR_HEIGHT` this case is re-baselined by reading —
   * the relationships above are what must still hold, and they are asserted separately for exactly
   * that reason.
   */
  it("reproduces the row treatment's values at the shipped geometry", () => {
    // Re-baselined at M3-T3 **by reading**, not with `-u`: the relationships asserted above are
    // what must still hold, and they are separate cases for exactly this moment.
    expect({ LANE_HEIGHT, BAR_HEIGHT, BAR_PAD }).toEqual({
      LANE_HEIGHT: 52,
      BAR_HEIGHT: 5,
      BAR_PAD: 23.5,
    });
    expect({
      TAIL_HEIGHT,
      BAR_RADIUS,
      GLYPH_CAP_OVERHANG,
      SUMMARY_TAB_H,
      PROGRESS_BAND_H,
    }).toEqual({
      TAIL_HEIGHT: 2,
      BAR_RADIUS: 1,
      GLYPH_CAP_OVERHANG: 1,
      SUMMARY_TAB_H: 1,
      PROGRESS_BAND_H: 1,
    });
  });
});
