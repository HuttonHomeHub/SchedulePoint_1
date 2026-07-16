import { describe, expect, it } from 'vitest';

import { laneOverlapIds, type LaneSpan } from './lane-overlap';

const span = (
  id: string,
  laneIndex: number,
  start: string | null,
  finish: string | null,
): LaneSpan => ({
  id,
  laneIndex,
  start,
  finish,
});

describe('laneOverlapIds', () => {
  it('flags both bars of a same-lane time overlap', () => {
    const result = laneOverlapIds([
      span('a', 0, '2026-01-01', '2026-01-10'),
      span('b', 0, '2026-01-05', '2026-01-15'), // overlaps a
    ]);
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('does not flag bars that abut but do not overlap (finish strictly before next start)', () => {
    // a finishes 01-10, b starts 01-11 — share a lane legally (mirrors auto-pack's strict rule).
    const result = laneOverlapIds([
      span('a', 0, '2026-01-01', '2026-01-10'),
      span('b', 0, '2026-01-11', '2026-01-20'),
    ]);
    expect(result.size).toBe(0);
  });

  it('treats a shared boundary day as an overlap (inclusive spans)', () => {
    const result = laneOverlapIds([
      span('a', 0, '2026-01-01', '2026-01-10'),
      span('b', 0, '2026-01-10', '2026-01-20'), // shares 01-10 → overlaps
    ]);
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('ignores overlaps across different lanes', () => {
    const result = laneOverlapIds([
      span('a', 0, '2026-01-01', '2026-01-10'),
      span('b', 1, '2026-01-05', '2026-01-15'), // same dates, different lane → fine
    ]);
    expect(result.size).toBe(0);
  });

  it('flags every member of a three-way pile-up in one lane', () => {
    const result = laneOverlapIds([
      span('a', 0, '2026-01-01', '2026-01-20'),
      span('b', 0, '2026-01-05', '2026-01-08'),
      span('c', 0, '2026-01-15', '2026-01-25'),
    ]);
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('flags a milestone (start === finish) sitting inside a task span', () => {
    const result = laneOverlapIds([
      span('task', 0, '2026-01-01', '2026-01-10'),
      span('ms', 0, '2026-01-05', '2026-01-05'),
    ]);
    expect(result).toEqual(new Set(['task', 'ms']));
  });

  it('skips uncalculated (null-dated) activities — they are not drawn', () => {
    const result = laneOverlapIds([
      span('a', 0, null, null),
      span('b', 0, '2026-01-05', '2026-01-15'),
    ]);
    expect(result.size).toBe(0);
  });

  it('returns an empty set for a single-item lane', () => {
    expect(laneOverlapIds([span('a', 0, '2026-01-01', '2026-01-10')]).size).toBe(0);
  });
});
