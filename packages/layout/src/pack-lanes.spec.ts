import { describe, expect, it } from 'vitest';

import { packLanes, type LaneChange, type PackItem } from './pack-lanes.js';

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

  /**
   * The logic hint (product-owner report: "the logic lines go up and off the canvas and back down").
   *
   * The packer minimised lane COUNT and was indifferent between equally-free lanes, so a successor
   * routinely landed as far as possible from its predecessor — a long vertical run that leaves the
   * viewport. These pin the two properties that make the hint safe to have on: it never costs a
   * lane, and it changes nothing at all when it is absent.
   */
  describe('with the logic hint', () => {
    // Three concurrent bars open lanes 0..2; X then starts after all three finish, so ALL THREE
    // lanes are free and the choice is pure preference. Its predecessor sits in lane 2.
    const items: PackItem[] = [
      { id: 'a', startDay: 0, endDay: 4, laneIndex: 0 },
      { id: 'b', startDay: 1, endDay: 5, laneIndex: 1 },
      { id: 'c', startDay: 2, endDay: 6, laneIndex: 2 },
      { id: 'x', startDay: 8, endDay: 9, laneIndex: 9 },
    ];

    it('puts a successor in the free lane nearest its predecessor', () => {
      const unhinted = laneAssignment(items, packLanes(items));
      // Without the hint, X takes the first free lane — the one furthest from the bar it follows.
      expect(unhinted.get('x')).toBe(0);

      const hinted = laneAssignment(items, packLanes(items, new Map([['x', ['c']]])));
      expect(hinted.get('c')).toBe(2);
      expect(hinted.get('x')).toBe(2);
      assertNoOverlap(items, packLanes(items, new Map([['x', ['c']]])));
    });

    it('never opens a lane the unhinted packer would not have opened', () => {
      const lanesUsed = (changes: LaneChange[]): number =>
        Math.max(...laneAssignment(items, changes).values()) + 1;
      expect(lanesUsed(packLanes(items, new Map([['x', ['c']]])))).toBe(
        lanesUsed(packLanes(items)),
      );
    });

    it('falls back to the first free lane for an activity with no placed predecessor', () => {
      // 'x' names a predecessor that is not in the packed set at all (undated, so it has no lane).
      const hinted = laneAssignment(items, packLanes(items, new Map([['x', ['ghost']]])));
      expect(hinted.get('x')).toBe(0);
    });

    it('is byte-identical to the unhinted packer when the map is empty', () => {
      expect(packLanes(items, new Map())).toEqual(packLanes(items));
    });

    it('averages several predecessors rather than following whichever is listed first', () => {
      // Predecessors in lanes 0 and 2 → target 1, so X takes lane 1 from either listing order.
      const both = packLanes(items, new Map([['x', ['a', 'c']]]));
      const reversed = packLanes(items, new Map([['x', ['c', 'a']]]));
      expect(laneAssignment(items, both).get('x')).toBe(1);
      expect(both).toEqual(reversed);
    });
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

  /**
   * **Packing an already-packed set moves nothing.**
   *
   * This is the property the whole "is this plan already arranged?" question rests on. An import
   * runs `packLanes` in ADR-0069 phase 3 (`interchange.service.ts:1096`); the canvas then runs it
   * again through `computeLaneArrangement` to decide whether to offer `Arrange` at all
   * (`TsldPanel.tsx:2213-2219`, `:2226-2228` — an empty result announces "Lanes are already
   * arranged; nothing to move."). If the packer were not idempotent, a freshly imported plan would
   * offer a press that reshuffles a diagram phase 3 had already laid out correctly — and nothing
   * anywhere asserted it.
   *
   * It is a property rather than an example, so it is checked over the fixture shapes the rest of
   * this file covers **and** with the predecessor hint in force, because the hint is the one input
   * that chooses between equally-valid free lanes and is therefore the one that could make a second
   * pass disagree with the first.
   *
   * **Verified red** against the defect it names — emitting a row for every item rather than only
   * the ones that move (`pack-lanes.ts:87`) — which fails here with "the second pass must move
   * nothing". That mutation also reddens the three single-pass minimal-diff cases, because they
   * pin the same line; **no mutation was found that reddens only this one**, and two were tried
   * (sorting by the input lane first, and steering an unhinted item toward its own current lane)
   * which leave the packer idempotent and are caught elsewhere or not at all. What this case adds
   * that none of its neighbours can is the **second pass**: they assert the diff is minimal for one
   * input, and only this one asserts the packer's own output is a fixed point.
   */
  it('is idempotent: re-packing its own output moves nothing', () => {
    const cases: { name: string; items: PackItem[]; hint?: Map<string, string[]> }[] = [
      {
        name: 'a chain that must spread',
        items: [
          { id: 'a', startDay: 0, endDay: 5, laneIndex: 9 },
          { id: 'b', startDay: 2, endDay: 7, laneIndex: 4 },
          { id: 'c', startDay: 3, endDay: 4, laneIndex: 0 },
          { id: 'd', startDay: 8, endDay: 9, laneIndex: 7 },
        ],
      },
      {
        name: 'source order — one bar per lane, every lane wrong',
        items: Array.from({ length: 12 }, (_, i) => ({
          id: `s${String(i)}`,
          startDay: i * 2,
          endDay: i * 2 + 1,
          laneIndex: i,
        })),
      },
      {
        name: 'with the predecessor hint in force',
        items: [
          { id: 'p', startDay: 0, endDay: 3, laneIndex: 6 },
          { id: 'q', startDay: 0, endDay: 3, laneIndex: 2 },
          { id: 'r', startDay: 4, endDay: 6, laneIndex: 5 },
          { id: 's', startDay: 4, endDay: 6, laneIndex: 1 },
        ],
        hint: new Map([
          ['r', ['p']],
          ['s', ['q']],
        ]),
      },
    ];

    for (const { name, items, hint } of cases) {
      const first = packLanes(items, hint);
      const settled = laneAssignment(items, first);
      const packed = items.map((i) => ({ ...i, laneIndex: settled.get(i.id)! }));
      // The control: a case where the first pass moved nothing proves nothing about idempotence.
      expect(first.length, `${name}: the first pass must actually move something`).toBeGreaterThan(
        0,
      );
      expect(packLanes(packed, hint), `${name}: the second pass must move nothing`).toEqual([]);
    }
  });
});
