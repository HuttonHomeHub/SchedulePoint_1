import { describe, expect, it } from 'vitest';

import { dockBounds } from './dock-bounds';
import { CANVAS_MIN_WIDTH, NOTES_PANEL_MAX_WIDTH } from './use-notes-panel-prefs';

import { SPLITTER_WIDTH } from '@/components/ui/panel-resizer';

/**
 * The four docks' minimums as they ship (`use-notes-panel-prefs.ts`, `use-revision-compare-panel-prefs.ts`,
 * the health and float-paths prefs). Restated here as inputs rather than imported, so a test reads as
 * the arithmetic it is checking; the figures are the ones `m0-measurement.md` §4 used.
 */
const NOTES_MIN = 280;
const REVISIONS_MIN = 380;

const bounds = (bodyWidth: number, min: number, stored = min) =>
  dockBounds({ stored, min, max: NOTES_PANEL_MAX_WIDTH, bodyWidth });

describe('dockBounds', () => {
  it('applies no cap and squeezes nothing while the body is unmeasured (0)', () => {
    const b = bounds(0, REVISIONS_MIN, 500);
    expect(b.squeezed).toBe(false);
    expect(b.resizable).toBe(true);
    expect(b.width).toBe(500);
    expect(b.min).toBe(REVISIONS_MIN);
    expect(b.max).toBe(NOTES_PANEL_MAX_WIDTH);
  });

  it('still clamps an unmeasured stored width into the dock’s own range', () => {
    expect(bounds(0, NOTES_MIN, 9999).width).toBe(NOTES_PANEL_MAX_WIDTH);
    expect(bounds(0, NOTES_MIN, 10).width).toBe(NOTES_MIN);
  });

  it.each([320, 640, 700, 767, 768, 1024, 1440])(
    'keeps aria-valuemin <= aria-valuemax and the width inside the body at %i',
    (bodyWidth) => {
      for (const min of [NOTES_MIN, 300, 340, REVISIONS_MIN]) {
        const b = bounds(bodyWidth, min, 420);
        expect(b.min).toBeLessThanOrEqual(b.max);
        expect(b.width).toBeGreaterThanOrEqual(b.min);
        expect(b.width).toBeLessThanOrEqual(bodyWidth - SPLITTER_WIDTH);
      }
    },
  );

  it('caps a stored 420 at the 319 px cap in a 320 px body, and the caller still holds 420', () => {
    const b = bounds(320, NOTES_MIN, 420);
    expect(b.cap).toBe(319);
    expect(b.width).toBe(319);
    // A render clamp: the input is untouched, which is what lets 420 come back at 1440.
    expect(bounds(1440, NOTES_MIN, 420).width).toBe(420);
  });

  it('lowers the minimum to the cap when the body is narrower than the dock’s minimum', () => {
    const b = bounds(320, REVISIONS_MIN);
    expect(b.min).toBe(319);
    expect(b.max).toBe(319);
    // Nothing to resize: the dock fills the row.
    expect(b.resizable).toBe(false);
  });

  it('640 with the revisions dock: squeezed, and it takes the row — no 259 px dead strip', () => {
    const b = bounds(640, REVISIONS_MIN);
    // 640 - 380 - 1 = 259 < 360.
    expect(640 - REVISIONS_MIN - SPLITTER_WIDTH).toBeLessThan(CANVAS_MIN_WIDTH);
    expect(b.squeezed).toBe(true);
    expect(b.width).toBe(639);
    expect(b.resizable).toBe(false);
  });

  it('640 with the notes dock: squeezed too, by one pixel (359 < 360)', () => {
    // Recorded so it does not surprise anyone: the splitter's pixel is what tips it.
    expect(640 - NOTES_MIN - SPLITTER_WIDTH).toBe(359);
    const b = bounds(640, NOTES_MIN);
    expect(b.squeezed).toBe(true);
    expect(b.width).toBe(639);
  });

  it('767: the dock leaves the diagram its full 360 floor, which the old clamp did not', () => {
    const b = bounds(767, REVISIONS_MIN, 640);
    expect(b.squeezed).toBe(false);
    // The old `max(min, body - 360)` rendered 407 and left 359; the splitter's pixel is budgeted now.
    expect(b.width).toBe(406);
    expect(767 - SPLITTER_WIDTH - b.width).toBe(CANVAS_MIN_WIDTH);
    expect(b.resizable).toBe(true);
  });

  it('768 and 1024: not squeezed, and a wide body is bounded by the dock’s static maximum', () => {
    expect(bounds(768, NOTES_MIN).squeezed).toBe(false);
    const wide = bounds(1024, NOTES_MIN, 9999);
    expect(wide.squeezed).toBe(false);
    expect(wide.width).toBe(NOTES_PANEL_MAX_WIDTH);
    expect(wide.max).toBe(NOTES_PANEL_MAX_WIDTH);
  });

  it('is not resizable when the room above the minimum is exactly nothing', () => {
    // 280 + 1 + 360 = 641: the dock fits at its minimum and no wider.
    const b = bounds(641, NOTES_MIN);
    expect(b.squeezed).toBe(false);
    expect(b.width).toBe(NOTES_MIN);
    expect(b.resizable).toBe(false);
  });
});
