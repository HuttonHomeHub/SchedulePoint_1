import { describe, expect, it } from 'vitest';

import {
  BAR_HEIGHT,
  BAR_PAD,
  LABEL_FONT,
  LABEL_INSIDE_MIN_HEIGHT_PX,
  LANE_HEIGHT,
  TAIL_HEIGHT,
} from './geometry';
import { ARROWHEAD_HALF_W_PX, FAN_OUT_MAX_PX, FAN_OUT_STEP_PX } from './link-routing';
import { BAR_RADIUS, GLYPH_CAP_OVERHANG, PROGRESS_BAND_H, SUMMARY_TAB_H } from './render-model';

/**
 * **Each glyph constant's justification, asserted** (logic-legibility M3-T2).
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
 * **The fan-out pair is the sharpest, and it is the one the compiler could not see.**
 * `link-routing.ts` justified `FAN_OUT_MAX_PX = 6` by `BAR_HEIGHT / 2` in a module that did not
 * import `BAR_HEIGHT`. The import is the fix; this file is the proof it is load-bearing.
 */

/** A bar's half-height — the quantity the fan-out comment asserted and could not reach. */
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

  /**
   * The relationship `link-routing.ts` asserted in a comment for two years while importing
   * nothing that could check it. **Verified red** by putting `FAN_OUT_STEP_PX` back to a literal
   * 3 with `BAR_HEIGHT` at 5: the step alone then exceeds a half-height of 2.5.
   */
  it('the fan-out spread stays inside the bar it fans across', () => {
    expect(FAN_OUT_STEP_PX).toBeLessThanOrEqual(HALF_BAR);
    expect(FAN_OUT_MAX_PX).toBeLessThanOrEqual(HALF_BAR);
    expect(FAN_OUT_MAX_PX).toBeGreaterThanOrEqual(FAN_OUT_STEP_PX);
  });

  /**
   * ADR-0065's coupling, kept as an assertion now that `ARROWHEAD_HALF_W_PX` is its own constant.
   *
   * The reason it was `= FAN_OUT_STEP_PX` is real — widening the barbs past the fan-out step
   * pushes each head across its neighbour in a fanned bundle — but that reason is about the fan,
   * and the fan is about the bar. An arrowhead is a decoration on a **link**, so inheriting a
   * bar-derived value would shrink every arrowhead the day the bar thins, for no reason anybody
   * chose. The constraint is preserved; the derivation is not.
   *
   * **This assertion has a lifetime, and it is stated here rather than discovered at M3-T3.**
   * Running the derivations forward at the target geometry — `BAR_HEIGHT = 5` — shows it failing:
   * `FAN_OUT_STEP_PX` derives to 1 and the head stays 3. That is not a defect in either constant.
   * ADR-0065's premise is a **fanned bundle**, and spec D10 retires fan-out in favour of the
   * reference's node glyph precisely because a step of 3 already exceeds a 5 px bar's half-height
   * of 2.5. With no fan there is no neighbour to cross, so the constraint loses its subject.
   *
   * So when M3-T3 retires fan-out, this case is **deleted with it, not relaxed** — and until then
   * it is exactly tight (3 against 3), which is what makes it a test of the relationship rather
   * than of slack.
   */
  it('an arrowhead is no wider than the fan-out step, without being derived from the bar', () => {
    expect(ARROWHEAD_HALF_W_PX).toBeLessThanOrEqual(FAN_OUT_STEP_PX);
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
  it('reproduces every shipped value at LANE_HEIGHT 28 / BAR_HEIGHT 18', () => {
    expect({ LANE_HEIGHT, BAR_HEIGHT, BAR_PAD }).toEqual({
      LANE_HEIGHT: 28,
      BAR_HEIGHT: 18,
      BAR_PAD: 5,
    });
    expect({
      TAIL_HEIGHT,
      BAR_RADIUS,
      GLYPH_CAP_OVERHANG,
      SUMMARY_TAB_H,
      PROGRESS_BAND_H,
      FAN_OUT_STEP_PX,
      FAN_OUT_MAX_PX,
      ARROWHEAD_HALF_W_PX,
    }).toEqual({
      TAIL_HEIGHT: 6,
      BAR_RADIUS: 3,
      GLYPH_CAP_OVERHANG: 3,
      SUMMARY_TAB_H: 4,
      PROGRESS_BAND_H: 4,
      FAN_OUT_STEP_PX: 3,
      FAN_OUT_MAX_PX: 6,
      ARROWHEAD_HALF_W_PX: 3,
    });
  });
});
