import { describe, expect, it } from 'vitest';

import { firstReaching, indexByLane } from './lane-reach-index';

type Span = [number, number];

describe('indexByLane', () => {
  it('buckets by lane, sorts by the order given, and keeps the widest extent', () => {
    const entries: [number, Span][] = [
      [2, [300, 320]],
      [0, [50, 60]],
      [2, [100, 180]],
    ];
    const index = indexByLane(
      entries,
      (p, q) => p[0] - q[0],
      ([a, b]) => b - a,
      (spans, widest) => ({ spans, widest }),
    );
    expect(index.get(2)).toEqual({
      spans: [
        [100, 180],
        [300, 320],
      ],
      widest: 80,
    });
    expect(index.get(0)?.widest).toBe(10);
    expect(index.size).toBe(2);
  });
});

describe('firstReaching', () => {
  const spans: Span[] = [
    [0, 100],
    [10, 15],
    [200, 205],
  ];

  it('skips only entries that end before x', () => {
    expect(firstReaching(spans, 100, 105, (s) => s[0])).toBe(1);
    expect(firstReaching(spans, 100, 50, (s) => s[0])).toBe(0);
    expect(firstReaching(spans, 100, 1000, (s) => s[0])).toBe(3);
  });
});
