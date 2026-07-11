import { describe, expect, it } from 'vitest';

import { packLanes, type LaneChange, type PackItem } from './auto-pack';

/** Apply the returned changes over the originals and assert no two items in a lane overlap in time. */
function laneAssignment(
  items: readonly PackItem[],
  changes: readonly LaneChange[],
): Map<string, number> {
  const lane = new Map(items.map((i) => [i.id, i.laneIndex]));
  for (const c of changes) lane.set(c.id, c.laneIndex);
  return lane;
}

function assertNoOverlap(items: readonly PackItem[], changes: readonly LaneChange[]): void {
  const lane = laneAssignment(items, changes);
  const byLane = new Map<number, PackItem[]>();
  for (const i of items) {
    const l = lane.get(i.id)!;
    (byLane.get(l) ?? byLane.set(l, []).get(l)!).push(i);
  }
  for (const arr of byLane.values()) {
    arr.sort((a, b) => a.startDay - b.startDay);
    for (let k = 1; k < arr.length; k++) {
      // Inclusive-finish: a lane-mate must start strictly after the previous one finishes.
      expect(arr[k]!.startDay).toBeGreaterThan(arr[k - 1]!.endDay);
    }
  }
}

describe('packLanes', () => {
  it('returns nothing for an empty set', () => {
    expect(packLanes([])).toEqual([]);
  });

  it('packs a single bar down to lane 0 (and no-ops when already there)', () => {
    expect(packLanes([{ id: 'a', startDay: 0, endDay: 3, laneIndex: 5 }])).toEqual([
      { id: 'a', laneIndex: 0 },
    ]);
    expect(packLanes([{ id: 'a', startDay: 0, endDay: 3, laneIndex: 0 }])).toEqual([]);
  });

  it('keeps time-sequential bars in one lane, overlapping bars in separate lanes', () => {
    const items: PackItem[] = [
      { id: 'a', startDay: 0, endDay: 5, laneIndex: 0 },
      { id: 'b', startDay: 3, endDay: 8, laneIndex: 0 }, // overlaps a → new lane
      { id: 'c', startDay: 6, endDay: 10, laneIndex: 0 }, // starts after a ends → reuses lane 0
    ];
    const changes = packLanes(items);
    const lane = laneAssignment(items, changes);
    expect(lane.get('a')).toBe(0);
    expect(lane.get('b')).toBe(1);
    expect(lane.get('c')).toBe(0);
    assertNoOverlap(items, changes);
  });

  it('uses the FEWEST lanes (max concurrency) and never overlaps within one', () => {
    // Three mutually-overlapping bars need three lanes; a fourth, later bar reuses lane 0.
    const items: PackItem[] = [
      { id: 'a', startDay: 0, endDay: 4, laneIndex: 0 },
      { id: 'b', startDay: 1, endDay: 5, laneIndex: 0 },
      { id: 'c', startDay: 2, endDay: 6, laneIndex: 0 },
      { id: 'd', startDay: 7, endDay: 9, laneIndex: 0 },
    ];
    const changes = packLanes(items);
    const lane = laneAssignment(items, changes);
    expect(new Set([lane.get('a'), lane.get('b'), lane.get('c')]).size).toBe(3); // 3 concurrent
    expect(lane.get('d')).toBe(0); // after a finishes → back to lane 0
    expect(Math.max(...[...lane.values()])).toBe(2); // exactly 3 lanes (0..2)
    assertNoOverlap(items, changes);
  });

  it('is deterministic regardless of input order (total-order sort)', () => {
    const base: PackItem[] = [
      { id: 'a', startDay: 0, endDay: 5, laneIndex: 0 },
      { id: 'b', startDay: 3, endDay: 8, laneIndex: 0 },
      { id: 'c', startDay: 6, endDay: 10, laneIndex: 0 },
      { id: 'd', startDay: 3, endDay: 8, laneIndex: 0 }, // ties with b on span → id breaks it
    ];
    const permutations = [
      base,
      [...base].reverse(),
      [base[3]!, base[0]!, base[2]!, base[1]!],
      [base[2]!, base[3]!, base[1]!, base[0]!],
    ];
    const results = permutations.map((p) => JSON.stringify(packLanes(p)));
    expect(new Set(results).size).toBe(1);
  });

  it('returns the MINIMAL diff — only rows whose lane changes, sorted by id', () => {
    // Already optimally packed: a and b are sequential in lane 0, c overlaps → lane 1.
    const items: PackItem[] = [
      { id: 'a', startDay: 0, endDay: 2, laneIndex: 0 },
      { id: 'b', startDay: 5, endDay: 7, laneIndex: 0 },
      { id: 'c', startDay: 1, endDay: 3, laneIndex: 1 },
    ];
    expect(packLanes(items)).toEqual([]); // nothing to move

    // Now scramble only c to a wasteful lane 4 → exactly one change back to lane 1.
    const scrambled = items.map((i) => (i.id === 'c' ? { ...i, laneIndex: 4 } : i));
    expect(packLanes(scrambled)).toEqual([{ id: 'c', laneIndex: 1 }]);
  });

  it('treats a milestone as a zero-length span at its day (shares/blocks a lane correctly)', () => {
    // A milestone on day 3 overlaps a bar spanning [3,5] (they share day 3) → separate lanes…
    const overlapping: PackItem[] = [
      { id: 'm', startDay: 3, endDay: 3, laneIndex: 0 },
      { id: 'bar', startDay: 3, endDay: 5, laneIndex: 0 },
    ];
    const oc = packLanes(overlapping);
    const ol = laneAssignment(overlapping, oc);
    expect(ol.get('m')).not.toBe(ol.get('bar'));
    assertNoOverlap(overlapping, oc);

    // …but a milestone the day AFTER a bar finishes reuses the bar's lane.
    const sequential: PackItem[] = [
      { id: 'bar', startDay: 0, endDay: 3, laneIndex: 0 },
      { id: 'm', startDay: 4, endDay: 4, laneIndex: 1 },
    ];
    expect(packLanes(sequential)).toEqual([{ id: 'm', laneIndex: 0 }]);
  });
});
