import { describe, expect, it } from 'vitest';

import { packLanes } from './auto-pack';
import { laneOverlapIds, type LaneSpan } from './lane-overlap';

/** A whole-day offset from 2026-01-01 as a `YYYY-MM-DD` string, to bridge auto-pack's day-number
 * spans to this module's date-string spans in the cross-consistency test below. */
function dayToIso(n: number): string {
  return new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
}

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

  it('agrees with auto-pack: applying its packing clears every overlap the detector would flag', () => {
    // The two share the inclusive-span rule ("neither finishes strictly before the other starts").
    // This guards the invariant that auto-arrange never leaves an overlap the cue would then show —
    // if either implementation drifts, the packed arrangement would report a residual overlap here.
    const items = [
      { id: 'a', startDay: 0, endDay: 5, laneIndex: 0 },
      { id: 'b', startDay: 3, endDay: 8, laneIndex: 0 },
      { id: 'c', startDay: 6, endDay: 6, laneIndex: 0 },
      { id: 'd', startDay: 1, endDay: 2, laneIndex: 0 },
      { id: 'e', startDay: 9, endDay: 12, laneIndex: 0 },
    ];
    const packed = new Map(packLanes(items).map((c) => [c.id, c.laneIndex]));
    const spans = items.map((it) => ({
      id: it.id,
      laneIndex: packed.get(it.id) ?? it.laneIndex,
      start: dayToIso(it.startDay),
      finish: dayToIso(it.endDay),
    }));
    expect(laneOverlapIds(spans).size).toBe(0);
  });
});
