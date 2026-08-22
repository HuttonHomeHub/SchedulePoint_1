import { describe, expect, it } from 'vitest';

import {
  axisMarkers,
  clampMarkLeft,
  MARK_MIN_CENTRE_SEPARATION_PX,
  type AxisMarkerScene,
} from './axis-markers';
import type { Size, Viewport } from './geometry';

/**
 * The pure axis-marker model (`docs/specs/canvas-axis-markers/`, `docs/TECH_DEBT.md` #148).
 *
 * These cases landed **before** the module (the ADR-0100 M2-T1 discipline) and cover the four
 * ordered steps — cull, clamp, coincidence, overlap — plus the one property the whole two-row
 * design rests on: this function cannot see the pointer.
 *
 * **What it deliberately does not assert:** pixel-exact clamping against a *measured* DOM width.
 * jsdom has no layout, so a width here is injected. Whether a real marker's real width clears the
 * scene canvas is a browser question and belongs to `e2e-axis-markers`.
 */

const view = (pxPerDay: number, originX: number): Viewport => ({ pxPerDay, originX, originY: 32 });
const size = (width: number): Size => ({ width, height: 600 });
const on: AxisMarkerScene = {
  dataDateLine: true,
  todayOffset: 10,
  todayFraction: 0.5,
  todayToggle: true,
};

/** A stand-in for `measureText` / `getBoundingClientRect`: every label is `width` px wide. */
const fixed = (width: number) => () => width;

describe('cull — an off-screen rule has no mark at all', () => {
  it('drops both when the whole span is left of the surface', () => {
    const model = axisMarkers(view(24, -500), size(800), on);
    expect(model.lines).toEqual([]);
    expect(model.marks).toEqual([]);
    expect(model.merged).toBe(false);
  });

  it('drops Today alone when it is right of the surface and the data date is not', () => {
    // originX 10 puts the data date at 10; today is 10.5 days on at 100 px/day = 1060, off a
    // 800 px surface.
    const model = axisMarkers(view(100, 10), size(800), on);
    expect(model.lines.map((l) => l.kind)).toEqual(['dataDate']);
    expect(model.marks.map((m) => m.kind)).toEqual(['dataDate']);
  });

  it('runs cull BEFORE clamp — an off-screen rule never becomes an edge marker', () => {
    // If clamping ran first, today at x = 1060 would be pushed to the right edge and appear as a
    // marker pointing at a day that is not on screen.
    const model = axisMarkers(view(100, 10), size(800), on, fixed(60));
    expect(model.marks.some((m) => m.kind === 'today')).toBe(false);
  });
});

describe('coincidence — one line, one merged label', () => {
  it('merges when the two rules round onto the same pixel', () => {
    // todayOffset 0 with a fraction small enough that `Math.round` collapses it.
    const scene: AxisMarkerScene = { ...on, todayOffset: 0, todayFraction: 0.001 };
    const model = axisMarkers(view(24, 100), size(800), scene);
    expect(model.merged).toBe(true);
    expect(model.lines.map((l) => l.kind)).toEqual(['dataDate']);
    expect(model.marks).toHaveLength(1);
    expect(model.marks[0]?.label).toBe('Data date · today');
  });

  it('does not merge a sub-pixel-but-distinct pair, in both directions', () => {
    for (const fraction of [0.05, -0.05]) {
      const scene: AxisMarkerScene = { ...on, todayOffset: 0, todayFraction: fraction };
      // 24 px/day × 0.05 = 1.2 px — distinct after rounding.
      const model = axisMarkers(view(24, 100), size(800), scene);
      expect(model.merged, `fraction ${String(fraction)}`).toBe(false);
      expect(model.lines).toHaveLength(2);
    }
  });
});

describe('overlap — Data date keeps its label, Today loses it', () => {
  it('withholds the Today MARK but never the Today LINE', () => {
    // 1 px/day × 10.5 days = 10.5 px apart: far inside the separation threshold.
    const model = axisMarkers(view(1, 100), size(800), on);
    expect(model.merged).toBe(false);
    expect(model.lines.map((l) => l.kind)).toEqual(['dataDate', 'today']);
    expect(model.marks.map((m) => m.kind)).toEqual(['dataDate']);
  });

  it('keeps both once they clear the separation', () => {
    // 10 px/day × 10.5 = 105 px, comfortably past 52.
    const model = axisMarkers(view(10, 100), size(800), on);
    expect(model.marks.map((m) => m.kind)).toEqual(['dataDate', 'today']);
  });

  it('the fallback threshold is the boundary it says it is', () => {
    const justUnder = MARK_MIN_CENTRE_SEPARATION_PX - 2;
    const justOver = MARK_MIN_CENTRE_SEPARATION_PX + 2;
    for (const [gap, expected] of [
      [justUnder, ['dataDate']],
      [justOver, ['dataDate', 'today']],
    ] as const) {
      const scene: AxisMarkerScene = { ...on, todayOffset: gap, todayFraction: 0 };
      const model = axisMarkers(view(1, 100), size(800), scene);
      expect(
        model.marks.map((m) => m.kind),
        `gap ${String(gap)}`,
      ).toEqual(expected);
    }
  });

  it('tests the CLAMPED boxes when widths are measured — trap T2', () => {
    // The case the anchor rule gets wrong. Surface 100 px; the data date at 5 and today at 95, so
    // their anchors are 90 px apart — well past the 52 px threshold. With 60 px labels both clamp
    // inward (to 0 and 40) and the boxes 0–60 and 40–100 DO overlap.
    const scene: AxisMarkerScene = { ...on, todayOffset: 90, todayFraction: 0 };
    const v = view(1, 5);

    const unmeasured = axisMarkers(v, size(100), scene);
    expect(unmeasured.marks.map((m) => m.kind)).toEqual(['dataDate', 'today']);

    const measured = axisMarkers(v, size(100), scene, fixed(60));
    expect(measured.marks.map((m) => m.kind)).toEqual(['dataDate']);
  });
});

describe('placement', () => {
  it('clamps a mark to the surface at either edge, and centres it between', () => {
    expect(clampMarkLeft(5, 60, 800)).toBe(0);
    expect(clampMarkLeft(795, 60, 800)).toBe(740);
    expect(clampMarkLeft(400, 60, 800)).toBe(370);
  });

  it('reports the measured width and clamped left only when a measure is supplied', () => {
    const bare = axisMarkers(view(10, 100), size(800), on).marks[0];
    expect(bare?.width).toBeUndefined();
    expect(bare?.left).toBeUndefined();

    const placed = axisMarkers(view(10, 100), size(800), on, fixed(62))?.marks[0];
    expect(placed?.width).toBe(62);
    expect(placed?.left).toBe(clampMarkLeft(placed?.x ?? 0, 62, 800));
  });
});

describe('the model is a function of (viewport, scene) alone', () => {
  it('is identical at two pan positions in y — markers are chrome, not scene content', () => {
    const a = axisMarkers({ pxPerDay: 10, originX: 100, originY: 0 }, size(800), on);
    const b = axisMarkers({ pxPerDay: 10, originX: 100, originY: 400 }, size(800), on);
    expect(b).toEqual(a);
  });

  it('gates on the toggle and on a resolvable today', () => {
    expect(axisMarkers(view(10, 100), size(800), { ...on, todayToggle: false }).lines).toEqual([
      { kind: 'dataDate', x: expect.any(Number) as number },
    ]);
    expect(axisMarkers(view(10, 100), size(800), { ...on, todayOffset: null }).lines).toHaveLength(
      1,
    );
    expect(
      axisMarkers(view(10, 100), size(800), { ...on, dataDateLine: undefined }).lines.map(
        (l) => l.kind,
      ),
    ).toEqual(['today']);
  });
});
