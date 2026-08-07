import { describe, expect, it } from 'vitest';

import { compareByTimeThenLane, compareEarlyStart, type OrderableActivity } from './ordering';

const row = (id: string, earlyStart: string | null, laneIndex: number): OrderableActivity => ({
  id,
  earlyStart,
  laneIndex,
});

describe('compareEarlyStart', () => {
  it('orders ISO dates ascending', () => {
    expect(compareEarlyStart('2026-01-01', '2026-06-01')).toBeLessThan(0);
    expect(compareEarlyStart('2026-06-01', '2026-01-01')).toBeGreaterThan(0);
    expect(compareEarlyStart('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('sorts nulls last in both argument positions', () => {
    // An activity with no computed early start has not been scheduled yet. Sorting it first would
    // put "we do not know when this happens" at the head of every cycle, which is the least useful
    // place for it.
    expect(compareEarlyStart(null, '2026-01-01')).toBeGreaterThan(0);
    expect(compareEarlyStart('2026-01-01', null)).toBeLessThan(0);
    expect(compareEarlyStart(null, null)).toBe(0);
  });
});

describe('compareByTimeThenLane', () => {
  it('orders by early start first', () => {
    expect(
      compareByTimeThenLane(row('b', '2026-01-01', 9), row('a', '2026-02-01', 0)),
    ).toBeLessThan(0);
  });

  it('falls back to lane index when the dates are equal', () => {
    expect(
      compareByTimeThenLane(row('b', '2026-01-01', 1), row('a', '2026-01-01', 4)),
    ).toBeLessThan(0);
  });

  it('breaks a full tie on id, so the walk is stable across renders', () => {
    expect(
      compareByTimeThenLane(row('a', '2026-01-01', 2), row('b', '2026-01-01', 2)),
    ).toBeLessThan(0);
    expect(
      compareByTimeThenLane(row('b', '2026-01-01', 2), row('a', '2026-01-01', 2)),
    ).toBeGreaterThan(0);
    expect(compareByTimeThenLane(row('a', '2026-01-01', 2), row('a', '2026-01-01', 2))).toBe(0);
  });

  it('produces the same order however the input is shuffled', () => {
    // The point of the id tie-break: a cycle that reorders between two renders is not a cycle.
    const rows = [
      row('d', '2026-03-01', 0),
      row('c', '2026-01-01', 2),
      row('a', '2026-01-01', 2),
      row('e', null, 0),
      row('b', '2026-01-01', 0),
    ];
    const forwards = [...rows].sort(compareByTimeThenLane).map((r) => r.id);
    const backwards = [...rows]
      .reverse()
      .sort(compareByTimeThenLane)
      .map((r) => r.id);
    expect(forwards).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(backwards).toEqual(forwards);
  });
});
