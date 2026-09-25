import { describe, expect, it } from 'vitest';

import type { PlacedText } from './row-text-layout';
import { firstTextReaching, textBoxesOverlapping, textIndexOf } from './text-index';

const item = (lane: number, x: number, w: number): PlacedText => ({
  activityId: `${lane}:${x}`,
  lane,
  kind: 'name',
  text: 'x',
  x,
  y: 0,
  align: 'left',
  font: '11px sans-serif',
  width: w,
  ink: { x, y: -5.5, w, h: 11 },
  line: { x, y: -8, w, h: 16 },
});

describe('the text index (links-and-labels M1-T3)', () => {
  it('groups ink boxes by lane, sorted by left edge, with the widest width kept', () => {
    const index = textIndexOf([item(2, 300, 20), item(0, 50, 10), item(2, 100, 80)]);
    expect([...index.keys()].sort()).toEqual([0, 2]);
    expect(index.get(2)!.boxes.map((b) => b.x)).toEqual([100, 300]);
    expect(index.get(2)!.maxW).toBe(80);
  });

  it('the binary search starts at the first box that could still reach x', () => {
    const index = textIndexOf([item(0, 0, 100), item(0, 10, 5), item(0, 200, 5)]);
    const lane = index.get(0)!;
    // x = 105: a box starting before 105 − 100 = 5 cannot reach it, so the scan starts at index 1.
    expect(firstTextReaching(lane, 105)).toBe(1);
    // The wide first box is why maxW is needed: it reaches x = 50 though it starts first.
    expect(firstTextReaching(lane, 50)).toBe(0);
  });

  it('a query returns exactly the boxes a full scan would', () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      item(0, (i * 37) % 900, 10 + ((i * 13) % 70)),
    );
    const index = textIndexOf(items);
    for (const [x0, x1] of [
      [0, 10],
      [100, 140],
      [500, 900],
      [880, 1000],
    ] as const) {
      const scanned = items
        .map((i) => i.ink)
        .filter((b) => b.x < x1 && b.x + b.w > x0)
        .sort((p, q) => p.x - q.x || p.w - q.w);
      expect(textBoxesOverlapping(index, 0, x0, x1)).toEqual(scanned);
    }
  });

  it('touching is not meeting, and an empty lane has nothing', () => {
    const index = textIndexOf([item(1, 100, 20)]);
    expect(textBoxesOverlapping(index, 1, 120, 130)).toEqual([]);
    expect(textBoxesOverlapping(index, 1, 80, 100)).toEqual([]);
    expect(textBoxesOverlapping(index, 3, 0, 1000)).toEqual([]);
  });
});
