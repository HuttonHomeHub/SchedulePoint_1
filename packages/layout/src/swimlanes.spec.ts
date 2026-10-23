import { describe, expect, it } from 'vitest';

import { deriveSwimlaneLanes, wbsBasisOf, type SwimlaneMember, type WbsNode } from './swimlanes.js';

const member = (
  id: string,
  startDay: number,
  endDay: number,
  extra: Partial<SwimlaneMember> = {},
): SwimlaneMember => ({ id, swimlane: 'A', startDay, endDay, laneIndex: 0, ...extra });

function assertNoOverlap(
  members: readonly SwimlaneMember[],
  placements: ReturnType<typeof deriveSwimlaneLanes>,
): void {
  for (const [key, placement] of placements) {
    const inLane = new Map<number, SwimlaneMember[]>();
    for (const m of members.filter((x) => x.swimlane === key)) {
      const lane = placement.lanes.get(m.id)!;
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(placement.laneCount);
      inLane.set(lane, [...(inLane.get(lane) ?? []), m]);
    }
    for (const row of inLane.values()) {
      row.sort((a, b) => a.startDay - b.startDay);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i]!.startDay).toBeGreaterThan(row[i - 1]!.endDay);
      }
    }
  }
}

describe('deriveSwimlaneLanes', () => {
  it('first-fits a swimlane with no stored rows, in swimlane-free vertical order', () => {
    const members = [
      member('a', 0, 4, { laneIndex: 0 }),
      member('b', 2, 6, { laneIndex: 1 }),
      member('c', 5, 8, { laneIndex: 2 }),
    ];
    const a = deriveSwimlaneLanes(members).get('A')!;
    expect(Object.fromEntries(a.lanes)).toEqual({ a: 0, b: 1, c: 0 });
    expect(a.laneCount).toBe(2);
    expect(a.derived).toEqual(['a', 'b', 'c']);
  });

  it('treats a shared boundary day as an overlap (inclusive finish)', () => {
    const a = deriveSwimlaneLanes([member('a', 0, 3), member('b', 3, 5)]).get('A')!;
    expect(a.lanes.get('b')).toBe(1);
  });

  it('keeps stored rows and reports only the rest as derived', () => {
    const members = [member('a', 0, 4, { stored: { lane: 3, updatedAt: 1 } }), member('b', 10, 12)];
    const a = deriveSwimlaneLanes(members).get('A')!;
    expect(a.lanes.get('a')).toBe(3);
    // b's first-fit lane is 0, which is free.
    expect(a.lanes.get('b')).toBe(0);
    expect(a.derived).toEqual(['b']);
    expect(a.laneCount).toBe(4);
  });

  it('places an unplaced member at the free lane nearest its first-fit lane, lower on a tie', () => {
    // Lane 0 is taken by a stored row over the same days; first-fit target for u is 0.
    const members = [
      member('s0', 0, 5, { stored: { lane: 0, updatedAt: 1 } }),
      member('s1', 0, 5, { stored: { lane: 1, updatedAt: 1 } }),
      member('u', 0, 5),
    ];
    expect(deriveSwimlaneLanes(members).get('A')!.lanes.get('u')).toBe(2);

    const tie = [
      member('s1', 0, 5, { stored: { lane: 1, updatedAt: 1 } }),
      member('s3', 0, 5, { stored: { lane: 3, updatedAt: 1 } }),
      member('s0', 0, 5, { stored: { lane: 0, updatedAt: 1 } }),
      member('u', 0, 5),
    ];
    // Free lanes are 2 and 4+; target 0 is taken, so nearest is 2.
    expect(deriveSwimlaneLanes(tie).get('A')!.lanes.get('u')).toBe(2);

    const equidistant = [
      member('s0', 0, 5, { stored: { lane: 0, updatedAt: 1 } }),
      member('s1', 0, 5, { stored: { lane: 1, updatedAt: 1 } }),
      member('s2', 0, 5, { stored: { lane: 2, updatedAt: 1 } }),
      member('s4', 0, 5, { stored: { lane: 4, updatedAt: 1 } }),
      member('x', 6, 7),
      member('u', 0, 5, { laneIndex: 9 }),
    ];
    // u's first-fit target is lane 0 (unplaced-only layout); free lanes are 3 and 5+: nearest is 3.
    expect(deriveSwimlaneLanes(equidistant).get('A')!.lanes.get('u')).toBe(3);
  });

  describe('collision rule for stale rows', () => {
    it('the later updatedAt keeps the lane and the loser is derived', () => {
      const members = [
        member('old', 0, 5, { stored: { lane: 0, updatedAt: 100 } }),
        member('new', 3, 8, { stored: { lane: 0, updatedAt: 200 } }),
      ];
      const a = deriveSwimlaneLanes(members).get('A')!;
      expect(a.lanes.get('new')).toBe(0);
      expect(a.lanes.get('old')).toBe(1);
      expect(a.derived).toEqual(['old']);
    });

    it('breaks an updatedAt tie by the lower id', () => {
      const members = [
        member('b', 0, 5, { stored: { lane: 0, updatedAt: 100 } }),
        member('a', 0, 5, { stored: { lane: 0, updatedAt: 100 } }),
      ];
      const a = deriveSwimlaneLanes(members).get('A')!;
      expect(a.lanes.get('a')).toBe(0);
      expect(a.derived).toEqual(['b']);
    });

    it('does not treat rows in the same lane that do not overlap as a collision', () => {
      const members = [
        member('a', 0, 2, { stored: { lane: 0, updatedAt: 1 } }),
        member('b', 3, 5, { stored: { lane: 0, updatedAt: 2 } }),
      ];
      expect(deriveSwimlaneLanes(members).get('A')!.derived).toEqual([]);
    });

    it('treats a non-integer or negative stored lane as no row', () => {
      const members = [
        member('a', 0, 2, { stored: { lane: -1, updatedAt: 1 } }),
        member('b', 0, 2, { stored: { lane: 1.5, updatedAt: 1 } }),
      ];
      const a = deriveSwimlaneLanes(members).get('A')!;
      expect(a.derived).toEqual(['a', 'b']);
      assertNoOverlap(members, deriveSwimlaneLanes(members));
    });
  });

  it('places each swimlane independently, keyed in sorted order', () => {
    const members = [member('a', 0, 5, { swimlane: 'B' }), member('b', 0, 5, { swimlane: 'A' })];
    const result = deriveSwimlaneLanes(members);
    expect([...result.keys()]).toEqual(['A', 'B']);
    expect(result.get('A')!.lanes.get('b')).toBe(0);
    expect(result.get('B')!.lanes.get('a')).toBe(0);
  });

  it('is independent of input order', () => {
    const members = [
      member('a', 0, 4, { laneIndex: 1, stored: { lane: 2, updatedAt: 5 } }),
      member('b', 2, 6, { laneIndex: 0, stored: { lane: 2, updatedAt: 9 } }),
      member('c', 3, 9, { laneIndex: 2 }),
      member('d', 3, 9, { laneIndex: 2 }),
      member('e', 1, 2, { laneIndex: 0, swimlane: 'Z' }),
    ];
    const render = (ms: readonly SwimlaneMember[]): string =>
      JSON.stringify(
        [...deriveSwimlaneLanes(ms)].map(([k, p]) => [
          k,
          [...p.lanes].sort(),
          p.laneCount,
          p.derived,
        ]),
      );
    const expected = render(members);
    expect(render([...members].reverse())).toBe(expected);
    expect(render([members[2]!, members[4]!, members[0]!, members[3]!, members[1]!])).toBe(
      expected,
    );
  });

  it('never overlaps within a swimlane, including over stale rows (SC-4)', () => {
    // Small deterministic LCG so the cases are reproducible.
    let state = 12345;
    const next = (n: number): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % n;
    };
    for (let round = 0; round < 200; round += 1) {
      const members: SwimlaneMember[] = [];
      for (let i = 0; i < 25; i += 1) {
        const startDay = next(30);
        members.push({
          id: `m${i}`,
          swimlane: `s${next(3)}`,
          startDay,
          endDay: startDay + next(8),
          laneIndex: next(6),
          // Roughly two thirds carry a row, drawn from few lanes and few timestamps so rows collide.
          ...(next(3) === 0 ? {} : { stored: { lane: next(4), updatedAt: next(5) } }),
        });
      }
      const placements = deriveSwimlaneLanes(members);
      assertNoOverlap(members, placements);
      const total = [...placements.values()].reduce((n, p) => n + p.lanes.size, 0);
      expect(total).toBe(members.length);
    }
  });
});

describe('wbsBasisOf', () => {
  const node = (id: string, parentId: string | null, type = 'WBS_SUMMARY'): WbsNode => ({
    id,
    parentId,
    type,
  });
  const tree = (...nodes: WbsNode[]): Map<string, WbsNode> => new Map(nodes.map((n) => [n.id, n]));

  const nodes = tree(
    node('works', null),
    node('struct', 'works'),
    node('piling', 'struct'),
    node('task', 'piling', 'TASK'),
    node('shallow', 'works', 'TASK'),
    node('loose', null, 'TASK'),
  );

  it('finds the summary at each level on the path', () => {
    expect(wbsBasisOf('task', nodes, 1)).toEqual({ kind: 'summary', summaryId: 'works' });
    expect(wbsBasisOf('task', nodes, 2)).toEqual({ kind: 'summary', summaryId: 'struct' });
    expect(wbsBasisOf('task', nodes, 3)).toEqual({ kind: 'summary', summaryId: 'piling' });
  });

  it('has no swimlane when the tree is shallower than the level', () => {
    expect(wbsBasisOf('task', nodes, 4)).toEqual({ kind: 'none' });
    expect(wbsBasisOf('shallow', nodes, 3)).toEqual({ kind: 'none' });
    expect(wbsBasisOf('shallow', nodes, 2)).toEqual({ kind: 'none' });
  });

  it('has no swimlane for an activity with no parent', () => {
    expect(wbsBasisOf('loose', nodes, 1)).toEqual({ kind: 'none' });
  });

  it('makes a summary at exactly the level its own basis, and none above it', () => {
    expect(wbsBasisOf('struct', nodes, 2)).toEqual({ kind: 'summary', summaryId: 'struct' });
    expect(wbsBasisOf('struct', nodes, 1)).toEqual({ kind: 'summary', summaryId: 'works' });
    expect(wbsBasisOf('struct', nodes, 3)).toEqual({ kind: 'none' });
    expect(wbsBasisOf('works', nodes, 2)).toEqual({ kind: 'none' });
  });

  it('counts an orphan as top-level', () => {
    const orphaned = tree(node('s', 'gone'), node('t', 's', 'TASK'));
    expect(wbsBasisOf('t', orphaned, 1)).toEqual({ kind: 'summary', summaryId: 's' });
  });

  it('degrades to none for an unknown id, a bad level and a cycle', () => {
    expect(wbsBasisOf('nope', nodes, 1)).toEqual({ kind: 'none' });
    expect(wbsBasisOf('task', nodes, 0)).toEqual({ kind: 'none' });
    expect(wbsBasisOf('task', nodes, 1.5)).toEqual({ kind: 'none' });
    const cyclic = tree(node('a', 'b'), node('b', 'a'));
    expect(wbsBasisOf('a', cyclic, 1)).toEqual({ kind: 'none' });
  });

  it('does not count a non-summary at the level as a basis', () => {
    const odd = tree(node('t1', null, 'TASK'), node('t2', 't1', 'TASK'));
    expect(wbsBasisOf('t2', odd, 1)).toEqual({ kind: 'none' });
  });
});
