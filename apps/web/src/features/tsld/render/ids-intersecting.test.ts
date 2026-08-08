import { describe, expect, it } from 'vitest';

import {
  idsIntersecting,
  rectFromCorners,
  type RenderActivity,
  type Viewport,
} from './render-model';

/**
 * The one predicate a marquee sweep and a shift-click span both resolve through
 * (`docs/specs/canvas-multi-select/` M2-T2).
 *
 * The cases worth having are the boundary ones, because they are where two independent
 * implementations would have disagreed: a rectangle that only **touches** an edge, a milestone
 * (zero duration but not zero area), a bar wider than the sweep, and an activity with no computed
 * dates at all.
 */
const DATA_DATE = '2026-01-01';
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };

function task(id: string, startDay: number, endDay: number, lane: number): RenderActivity {
  const iso = (d: number) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  return {
    id,
    name: id,
    type: 'TASK',
    laneIndex: lane,
    earlyStart: iso(startDay),
    earlyFinish: iso(endDay),
    label: id,
    isCritical: false,
    isNearCritical: false,
  };
}

function milestone(id: string, day: number, lane: number): RenderActivity {
  const iso = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
  return {
    id,
    name: id,
    type: 'START_MILESTONE',
    laneIndex: lane,
    earlyStart: iso,
    earlyFinish: iso,
    label: id,
    isCritical: false,
    isNearCritical: false,
  };
}

/** An activity the engine has never scheduled — no geometry, so nothing to sweep. */
function unscheduled(id: string, lane: number): RenderActivity {
  return {
    id,
    name: id,
    type: 'TASK',
    laneIndex: lane,
    earlyStart: null,
    earlyFinish: null,
    label: id,
    isCritical: false,
    isNearCritical: false,
  };
}

describe('idsIntersecting', () => {
  const plan = [task('a', 0, 4, 0), task('b', 10, 14, 1), milestone('m', 20, 2)];

  it('catches every bar the rectangle overlaps, in plan order', () => {
    // A sweep spanning lanes 0-1 and days 0-14.
    const rect = { x: 0, y: 0, w: 200, h: 200 };
    expect(idsIntersecting(plan, rect, VIEW, DATA_DATE)).toEqual(['a', 'b', 'm']);
  });

  it('returns plan order, not sweep order — a repeat of the same gesture is stable', () => {
    const reversed = [...plan].reverse();
    const rect = { x: 0, y: 0, w: 400, h: 400 };
    expect(idsIntersecting(reversed, rect, VIEW, DATA_DATE)).toEqual(['m', 'b', 'a']);
  });

  it('catches a milestone — zero duration is not zero area', () => {
    // A tight sweep around the diamond alone.
    const rect = { x: 195, y: 0, w: 20, h: 400 };
    expect(idsIntersecting(plan, rect, VIEW, DATA_DATE)).toEqual(['m']);
  });

  it('catches a bar WIDER than the rectangle — the sweep is inside it', () => {
    const wide = [task('w', 0, 100, 0)];
    const rect = { x: 300, y: 0, w: 5, h: 400 };
    expect(idsIntersecting(wide, rect, VIEW, DATA_DATE)).toEqual(['w']);
  });

  it('excludes an activity with no computed dates', () => {
    const rect = { x: 0, y: 0, w: 1000, h: 1000 };
    expect(idsIntersecting([unscheduled('u', 0)], rect, VIEW, DATA_DATE)).toEqual([]);
  });

  it('a zero-area rectangle touches nothing — a click that never moved is a clear', () => {
    expect(idsIntersecting(plan, { x: 0, y: 0, w: 0, h: 0 }, VIEW, DATA_DATE)).toEqual([]);
    expect(idsIntersecting(plan, { x: 0, y: 0, w: 100, h: 0 }, VIEW, DATA_DATE)).toEqual([]);
  });

  it('does not catch a bar it only abuts — overlap is strict', () => {
    // `a` spans days 0-4 inclusive, i.e. x ∈ [0, 50). A rectangle starting exactly at 50 misses it.
    const justRight = { x: 50, y: 0, w: 10, h: 400 };
    expect(idsIntersecting([task('a', 0, 4, 0)], justRight, VIEW, DATA_DATE)).toEqual([]);
  });

  it('returns nothing for an empty plan', () => {
    expect(idsIntersecting([], { x: 0, y: 0, w: 100, h: 100 }, VIEW, DATA_DATE)).toEqual([]);
  });
});

describe('rectFromCorners', () => {
  it('normalises a drag in any direction to the same rectangle', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 60, y: 80 };
    const expected = { x: 10, y: 20, w: 50, h: 60 };
    expect(rectFromCorners(a, b)).toEqual(expected);
    expect(rectFromCorners(b, a)).toEqual(expected);
    expect(rectFromCorners({ x: 60, y: 20 }, { x: 10, y: 80 })).toEqual(expected);
  });

  it('gives a zero-area rectangle for a press that never moved', () => {
    expect(rectFromCorners({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });
});
