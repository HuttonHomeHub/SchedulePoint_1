import { describe, expect, it } from 'vitest';

import { fitToContent, pan, revealOffset } from './viewport';

/**
 * **`revealOffset` — the one "make this visible" arithmetic** (`docs/TECH_DEBT.md` #152).
 *
 * Extracted from the selection-reveal effect so `zoomToActivity` could repair the lane axis with
 * the same function rather than a second opinion. The #152 case is pinned with the register row's
 * own live numbers: `fitToContent` pins `originY` to the padding — right for whole-plan Fit at
 * lane 0, wrong for one activity in a high lane — and the command then announced "Zoomed to
 * Activity A01928" while scrolling it OUT of view (topLane −1.1, visible: false, on a
 * 274-lane plan).
 */
describe('revealOffset', () => {
  const MARGIN = 28; // LANE_HEIGHT — the margin both call sites pass.

  it('returns 0 for a target already inside the margins', () => {
    expect(revealOffset(100, 50, 900, MARGIN)).toBe(0);
  });

  it('pans a target above/left of the window down/right to the margin', () => {
    expect(revealOffset(-40, 20, 900, MARGIN)).toBe(68); // -40 → 28
  });

  it('pans a target below/right of the window the minimum distance in', () => {
    // start 950, span 20 → end 970; extent 900, margin 28 → end must reach 872: pan -98.
    expect(revealOffset(950, 20, 900, MARGIN)).toBe(-98);
  });

  it('aligns the START of a target larger than the usable window', () => {
    // span 1000 > 900 - 2*28: reading a too-big thing from its beginning beats fitting its end.
    expect(revealOffset(300, 1000, 900, MARGIN)).toBe(MARGIN - 300);
  });

  /**
   * **The #152 shape, end to end through the two functions the fix composes.** A one-activity fit
   * (what `zoomToActivity` does) pins `originY` to the padding, so a lane-273 bar's y is
   * 273 × LANE_HEIGHT + padding ≈ 7,676 px — far below a 900 px viewport. The repair is
   * `pan(view, 0, revealOffset(rect.y, rect.h, height, margin))`; after it, the bar's y sits
   * inside `[margin, height - margin - h]`. Verified red in spirit against the pre-fix command:
   * without the repair the offset is ~−6,800 px and the bar is invisible, which is exactly the
   * probe's `topLane −1.1, visible: false`.
   */
  it('brings a high-lane bar into a one-activity fit (the register row case)', () => {
    const LANE_HEIGHT = 28;
    const size = { width: 1600, height: 900 };
    const view = fitToContent(
      [
        {
          id: 'a',
          name: 'A01928',
          laneIndex: 273,
          earlyStart: '2026-01-05',
          earlyFinish: '2026-01-19',
        } as never,
      ],
      size,
      '2026-01-05',
      160,
    );
    // The fit pins originY to the padding, so the lane-273 rect is far below the viewport.
    const y = view.originY + 273 * LANE_HEIGHT;
    expect(y).toBeGreaterThan(size.height);

    const dy = revealOffset(y, LANE_HEIGHT, size.height, LANE_HEIGHT);
    const repaired = pan(view, 0, dy);
    const yAfter = repaired.originY + 273 * LANE_HEIGHT;
    expect(yAfter).toBeGreaterThanOrEqual(LANE_HEIGHT);
    expect(yAfter + LANE_HEIGHT).toBeLessThanOrEqual(size.height - LANE_HEIGHT);
  });
});
