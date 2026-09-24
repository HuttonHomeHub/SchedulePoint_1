import { describe, expect, it } from 'vitest';

import type { Point } from '../geometry';

import { createWrapClearance } from './wrap-clearance';

/**
 * **FC-G7's wrap-candidate budget, counted** (NetPoint grammar M6 gate pass). The spec commits to
 * "wrap-candidate segment tests ≤ visible truncating names", and until this file nothing counted
 * it: the laziness was a sentence in a comment. Two properties carry the bound. The index is built
 * at most once a frame, and never on a frame whose names all fit; and a test reads only the two
 * lanes a first line can reach, never the whole frame's routed lines.
 */
const LANE = 60;
const laneOfY = (y: number): number => Math.floor(y / LANE);

/** One horizontal leg per lane, across the whole width, at the lane's middle. */
function legs(lanes: number): Point[][] {
  return Array.from({ length: lanes }, (_, l) => [
    { x: 0, y: l * LANE + 30 },
    { x: 1000, y: l * LANE + 30 },
  ]);
}

describe('the wrap clearance index (FC-G7)', () => {
  it('builds nothing on a frame whose names all fit', () => {
    let read = 0;
    const wrap = createWrapClearance(
      () => {
        read += 1;
        return legs(40);
      },
      laneOfY,
      4,
    );
    expect(wrap.stats.builds).toBe(0);
    expect(read).toBe(0);
  });

  it('builds once however many names ask', () => {
    const wrap = createWrapClearance(() => legs(40), laneOfY, 4);
    for (let lane = 1; lane < 40; lane += 1) wrap.clear(lane, 500, 80, lane * LANE + 4, 12.5);
    expect(wrap.stats.builds).toBe(1);
  });

  it('tests only the two lanes a first line can reach, not the frame', () => {
    const wrap = createWrapClearance(() => legs(40), laneOfY, 4);
    // Clear of the legs vertically, so every segment in reach is tested and none ends the search.
    const names = 25;
    for (let i = 0; i < names; i += 1) wrap.clear(20, 500, 80, 20 * LANE + 4, 12.5);
    // Each name tests the legs of its own lane and the lane above: one each here.
    expect(wrap.stats.tests).toBeLessThanOrEqual(names * 2);
    expect(wrap.stats.tests).toBeGreaterThan(0);
  });

  it('refuses a first line a routed leg passes through', () => {
    const wrap = createWrapClearance(() => legs(3), laneOfY, 4);
    expect(wrap.clear(1, 500, 80, LANE + 30, 12.5)).toBe(false);
    expect(wrap.clear(1, 500, 80, LANE + 4, 12.5)).toBe(true);
  });
});
