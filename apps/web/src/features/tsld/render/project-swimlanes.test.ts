import { describe, expect, it } from 'vitest';

import { projectSwimlanes, swimlaneMarksOf, type SwimlaneInput } from './project-swimlanes';

import { anActivity } from '@/test/activity-fixture';

const DATA_DATE = '2026-01-01';

function bar(id: string, startDay: number, endDay: number, extra: object = {}) {
  const iso = (d: number) => `2026-01-${String(d + 1).padStart(2, '0')}`;
  return anActivity({
    id,
    laneIndex: 0,
    visualEffectiveStart: iso(startDay),
    visualEffectiveFinish: iso(endDay),
    ...extra,
  });
}

function input(over: Partial<SwimlaneInput> = {}): SwimlaneInput {
  return {
    swimlanes: [
      { id: 'A', name: 'Alpha' },
      { id: 'B', name: 'Beta' },
    ],
    membership: new Map(),
    storedLanes: new Map(),
    ...over,
  };
}

const OPTIONS = { source: 'visual', dataDate: DATA_DATE } as const;

describe('projectSwimlanes', () => {
  it('stacks swimlanes in order with each one’s lanes contiguous', () => {
    const acts = [bar('a1', 0, 3), bar('a2', 1, 4), bar('b1', 0, 3), bar('b2', 5, 6)];
    const out = projectSwimlanes(
      acts,
      input({
        membership: new Map([
          ['a1', 'A'],
          ['a2', 'A'],
          ['b1', 'B'],
          ['b2', 'B'],
        ]),
      }),
      OPTIONS,
    );
    expect(out.extents).toEqual([
      { id: 'A', name: 'Alpha', firstLane: 0, laneCount: 2 },
      { id: 'B', name: 'Beta', firstLane: 2, laneCount: 1 },
    ]);
    expect(out.laneCount).toBe(3);
    // b2 starts after b1 ends, so both share Beta's one lane, which is display lane 2.
    expect(out.displayLanes.get('b1')).toBe(2);
    expect(out.displayLanes.get('b2')).toBe(2);
    expect(new Set([out.displayLanes.get('a1'), out.displayLanes.get('a2')])).toEqual(
      new Set([0, 1]),
    );
  });

  it('puts "No swimlane" last, and hides it when empty', () => {
    const members = new Map([['a1', 'A']]);
    const hidden = projectSwimlanes([bar('a1', 0, 1)], input({ membership: members }), OPTIONS);
    expect(hidden.extents.map((e) => e.id)).toEqual(['A', 'B']);

    const shown = projectSwimlanes(
      [bar('a1', 0, 1), bar('loose', 0, 1), bar('orphan', 0, 1)],
      input({
        membership: new Map([
          ['a1', 'A'],
          ['orphan', 'deleted-swimlane'],
        ]),
      }),
      OPTIONS,
    );
    expect(shown.extents.map((e) => e.id)).toEqual(['A', 'B', null]);
    expect(shown.extents[2]).toEqual({ id: null, name: null, firstLane: 2, laneCount: 2 });
    expect(shown.displayLanes.get('loose')).toBeGreaterThanOrEqual(2);
    expect(shown.displayLanes.get('orphan')).toBeGreaterThanOrEqual(2);
  });

  it('gives an empty swimlane one lane, so it keeps its place in the stack', () => {
    const out = projectSwimlanes(
      [bar('b1', 0, 1)],
      input({ membership: new Map([['b1', 'B']]) }),
      OPTIONS,
    );
    expect(out.extents[0]).toEqual({ id: 'A', name: 'Alpha', firstLane: 0, laneCount: 1 });
    expect(out.displayLanes.get('b1')).toBe(1);
    expect(out.laneCount).toBe(2);
  });

  it('leaves out an activity the pinned WBS band draws', () => {
    const summary = bar('sum', 0, 9, { type: 'WBS_SUMMARY' });
    const out = projectSwimlanes(
      [summary, bar('a1', 0, 1)],
      input({
        membership: new Map([
          ['sum', 'A'],
          ['a1', 'A'],
        ]),
      }),
      { ...OPTIONS, bandLiftedIds: new Set(['sum']) },
    );
    expect(out.displayLanes.has('sum')).toBe(false);
    expect(out.extents[0]?.laneCount).toBe(1);
  });

  it('has no display lane for an activity with no drawn start', () => {
    const out = projectSwimlanes(
      [bar('a1', 0, 1, { visualEffectiveStart: null, visualEffectiveFinish: null })],
      input({ membership: new Map([['a1', 'A']]) }),
      OPTIONS,
    );
    expect(out.displayLanes.size).toBe(0);
    expect(out.extents[0]?.laneCount).toBe(1);
  });

  it('keeps a stored lane within its swimlane', () => {
    const out = projectSwimlanes(
      [bar('a1', 0, 1), bar('b1', 0, 1)],
      input({
        membership: new Map([
          ['a1', 'A'],
          ['b1', 'B'],
        ]),
        storedLanes: new Map([['b1', { lane: 2, updatedAt: 1 }]]),
      }),
      OPTIONS,
    );
    expect(out.extents[1]).toEqual({ id: 'B', name: 'Beta', firstLane: 1, laneCount: 3 });
    expect(out.displayLanes.get('b1')).toBe(3);
  });

  it('is deterministic regardless of input order', () => {
    const acts = [bar('a1', 0, 3), bar('a2', 1, 4), bar('a3', 2, 5), bar('b1', 0, 3)];
    const membership = new Map([
      ['a1', 'A'],
      ['a2', 'A'],
      ['a3', 'A'],
      ['b1', 'B'],
    ]);
    const forward = projectSwimlanes(acts, input({ membership }), OPTIONS);
    const backward = projectSwimlanes([...acts].reverse(), input({ membership }), OPTIONS);
    expect([...forward.displayLanes].sort()).toEqual([...backward.displayLanes].sort());
    expect(forward.extents).toEqual(backward.extents);
  });

  it('exposes a read model only', () => {
    const out = projectSwimlanes([], input(), OPTIONS);
    expect(Object.keys(out).sort()).toEqual(['derivedIds', 'displayLanes', 'extents', 'laneCount']);
  });

  it('names the members whose lane was derived rather than read from a stored row', () => {
    const out = projectSwimlanes(
      [bar('a1', 0, 1), bar('a2', 0, 1), bar('b1', 0, 1)],
      input({
        membership: new Map([
          ['a1', 'A'],
          ['a2', 'A'],
          ['b1', 'B'],
        ]),
        storedLanes: new Map([['a1', { lane: 0, updatedAt: 1 }]]),
      }),
      OPTIONS,
    );
    expect([...out.derivedIds].sort()).toEqual(['a2', 'b1']);
  });
});

describe('swimlaneMarksOf', () => {
  it('is the projection’s extents with the ground choice, and absent without a projection', () => {
    const out = projectSwimlanes([bar('a1', 0, 3)], input(), OPTIONS);
    expect(swimlaneMarksOf(out, true)).toEqual({ extents: out.extents, ground: true });
    expect(swimlaneMarksOf(out, false)?.ground).toBe(false);
    expect(swimlaneMarksOf(null, true)).toBeUndefined();
  });
});
