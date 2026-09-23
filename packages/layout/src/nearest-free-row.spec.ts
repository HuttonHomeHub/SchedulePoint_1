import { describe, expect, it } from 'vitest';

import { nearestFreeRow, rowOccupancy } from './nearest-free-row.js';
import type { PackItem } from './pack-lanes.js';

const item = (id: string, laneIndex: number, startDay: number, endDay: number): PackItem => ({
  id,
  laneIndex,
  startDay,
  endDay,
});

describe('nearestFreeRow', () => {
  it('keeps a mover that already fits in its own row', () => {
    expect(nearestFreeRow(item('m', 2, 10, 14), [item('a', 2, 0, 9), item('b', 2, 15, 20)])).toBe(
      2,
    );
  });

  it('treats touching as overlapping, the inclusive-finish convention packLanes uses', () => {
    // a finishes on day 10 and the mover starts on day 10: they share that day.
    expect(nearestFreeRow(item('m', 0, 10, 14), [item('a', 0, 5, 10)])).toBe(1);
  });

  it('moves one row away rather than two, and prefers the lower row on a tie', () => {
    const others = [item('a', 3, 0, 20), item('b', 2, 30, 40), item('c', 4, 30, 40)];
    // Rows 2 and 4 are both one away and both free for [5, 12]; the lower wins.
    expect(nearestFreeRow(item('m', 3, 5, 12), others)).toBe(2);
  });

  it('skips a blocked neighbour for the next free row', () => {
    const others = [item('a', 3, 0, 20), item('b', 2, 0, 20), item('c', 4, 0, 20)];
    expect(nearestFreeRow(item('m', 3, 5, 12), others)).toBe(1);
  });

  it('opens one row past the highest in use when every row is blocked', () => {
    const others = [item('a', 0, 0, 20), item('b', 1, 0, 20), item('c', 2, 0, 20)];
    expect(nearestFreeRow(item('m', 0, 5, 12), others)).toBe(3);
  });

  it('ignores the mover itself if it appears among the others', () => {
    expect(nearestFreeRow(item('m', 0, 5, 12), [item('m', 0, 5, 12)])).toBe(0);
  });

  it('does not depend on the order of the others', () => {
    const others = [
      item('a', 3, 0, 20),
      item('b', 2, 30, 40),
      item('c', 4, 0, 40),
      item('d', 1, 8, 9),
    ];
    const expected = nearestFreeRow(item('m', 3, 5, 12), others);
    expect(nearestFreeRow(item('m', 3, 5, 12), [...others].reverse())).toBe(expected);
    expect(expected).toBe(2);
  });
});

describe('rowOccupancy', () => {
  it('answers exactly as nearestFreeRow does for a single query', () => {
    const others = [item('a', 3, 0, 20), item('b', 2, 0, 20), item('c', 4, 30, 40)];
    const mover = item('m', 3, 5, 12);
    expect(rowOccupancy(others).nearestFree(mover)).toBe(nearestFreeRow(mover, others));
  });

  it('sees a moved item in its new row, so a cascade cannot put two movers in one row', () => {
    const occupancy = rowOccupancy([item('x', 0, 0, 10), item('y', 0, 5, 15), item('w', 1, 0, 20)]);
    // y overlaps x in row 0 and w in row 1, so it goes to row 2 …
    const y = occupancy.nearestFree(item('y', 0, 5, 15));
    expect(y).toBe(2);
    occupancy.move('y', y);
    // … and a third bar over the same days now finds row 2 taken as well.
    expect(occupancy.nearestFree(item('z', 0, 6, 9))).toBe(3);
  });
});
