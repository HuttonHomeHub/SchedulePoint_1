import { describe, expect, it } from 'vitest';

import type { PlacedText } from './row-text-layout';
import { firstTextReaching, textIndexOf } from './text-index';

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

  it('skips only boxes that end before x, whatever the widths', () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      item(0, (i * 37) % 900, 10 + ((i * 13) % 70)),
    );
    const lane = textIndexOf(items).get(0)!;
    for (const x of [0, 10, 100, 140, 500, 880, 1000]) {
      const first = firstTextReaching(lane, x);
      // Every box before the start ends before x, so a scan from there loses nothing…
      for (const box of lane.boxes.slice(0, first)) expect(box.x + box.w).toBeLessThan(x);
      // …and the start is as far along as the bound allows.
      if (first > 0) expect(lane.boxes[first - 1]!.x).toBeLessThan(x - lane.maxW);
    }
  });
});
