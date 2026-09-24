import { describe, expect, it } from 'vitest';

import { packAroundCarried } from './pack-around.js';

const item = (id: string, startDay: number, endDay: number, laneIndex: number) => ({
  id,
  startDay,
  endDay,
  laneIndex,
});

describe('packAroundCarried', () => {
  it('never moves a carried row, even one that overlaps another carried row', () => {
    const carried = [item('a', 0, 10, 0), item('b', 5, 15, 0)];
    expect(packAroundCarried(carried, [])).toEqual([]);
  });

  it('puts a mover in the nearest free row from its predecessors’ mean row', () => {
    const carried = [item('a', 0, 4, 3), item('b', 0, 20, 4)];
    // Predecessor `a` sits in row 3 and row 3 is free after day 4, so the mover joins it.
    const movers = [item('m', 5, 9, 99)];
    expect(packAroundCarried(carried, movers, new Map([['m', ['a']]]))).toEqual([
      { id: 'm', laneIndex: 3 },
    ]);
  });

  it('with no predecessor, starts from row 0 and takes the nearest free row', () => {
    const carried = [item('a', 0, 10, 0), item('b', 0, 10, 1)];
    expect(packAroundCarried(carried, [item('m', 2, 3, 7)])).toEqual([{ id: 'm', laneIndex: 2 }]);
  });

  it('a mean of x.5 rounds to the LOWER row', () => {
    const carried = [item('p', 0, 1, 2), item('q', 0, 1, 3)];
    expect(packAroundCarried(carried, [item('m', 5, 6, 0)], new Map([['m', ['p', 'q']]]))).toEqual([
      { id: 'm', laneIndex: 2 },
    ]);
  });

  it('a later mover sees an earlier one, and follows it as a predecessor', () => {
    const movers = [item('m2', 6, 8, 50), item('m1', 0, 5, 40)];
    const out = packAroundCarried([], movers, new Map([['m2', ['m1']]]));
    // m1 first (start order), row 0; m2 hangs off m1 and fits after it in row 0.
    expect(out).toEqual([
      { id: 'm1', laneIndex: 0 },
      { id: 'm2', laneIndex: 0 },
    ]);
  });

  it('is independent of input order', () => {
    const carried = [item('a', 0, 10, 0)];
    const movers = [item('x', 1, 2, 9), item('y', 1, 2, 9), item('z', 3, 4, 9)];
    expect(packAroundCarried(carried, movers)).toEqual(
      packAroundCarried(carried, [...movers].reverse()),
    );
  });
});
