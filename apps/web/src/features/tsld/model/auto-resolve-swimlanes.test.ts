import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { laneOverlapPairs } from '../render/lane-overlap';
import type { SwimlaneInput } from '../render/project-swimlanes';

import {
  layoutSnapshotsOf,
  NO_SWIMLANE_KEY,
  resolveBothLayouts,
  type LayoutSnapshots,
} from './auto-resolve-swimlanes';

interface Spec {
  id: string;
  /** Swimlane-free lane. */
  plain: number;
  /** Swimlane id, or null for "No swimlane". */
  swimlane: string | null;
  /** Stored lane inside the swimlane, or undefined for "never placed". */
  lane?: number;
  start: number;
  finish: number;
}

const day = (n: number): string => `2026-03-${String(n + 1).padStart(2, '0')}`;
const SWIMLANES = [
  { id: 'S1', name: 'Foundations' },
  { id: 'S2', name: 'Services' },
];

function rowOf(s: Spec): ActivitySummary {
  return {
    id: s.id,
    name: s.id,
    type: 'TASK',
    laneIndex: s.plain,
    version: 1,
    swimlaneId: s.swimlane,
    swimlaneLanes: [],
    earlyStart: day(s.start),
    earlyFinish: day(s.finish),
    lateStart: null,
    lateFinish: null,
    visualEffectiveStart: day(s.start),
    visualEffectiveFinish: day(s.finish),
  } as unknown as ActivitySummary;
}

function inputOf(specs: readonly Spec[]): SwimlaneInput {
  return {
    swimlanes: SWIMLANES,
    membership: new Map(specs.map((s) => [s.id, s.swimlane])),
    storedLanes: new Map(
      specs.flatMap((s) => (s.lane === undefined ? [] : [[s.id, { lane: s.lane, updatedAt: 0 }]])),
    ),
  };
}

const snapshotsOf = (specs: readonly Spec[]): LayoutSnapshots =>
  layoutSnapshotsOf(specs.map(rowOf), inputOf(specs));

/** Every overlapping pair in both pictures, as `plain:a|b` / `<swimlane>:a|b`. */
function overlapsOf(s: LayoutSnapshots): Set<string> {
  const out = new Set<string>();
  for (const [a, b] of laneOverlapPairs([...s.plain].map(([id, v]) => ({ id, ...v })))) {
    out.add(`plain:${a}|${b}`);
  }
  for (const [key, group] of s.swimlane ?? []) {
    for (const [a, b] of laneOverlapPairs([...group].map(([id, v]) => ({ id, ...v })))) {
      out.add(`${key}:${a}|${b}`);
    }
  }
  return out;
}

describe('layoutSnapshotsOf', () => {
  it('has no swimlane picture without an input', () => {
    const specs: Spec[] = [{ id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 }];
    expect(layoutSnapshotsOf(specs.map(rowOf), null).swimlane).toBeNull();
  });

  it('keeps each picture in its own lane field, grouped by swimlane', () => {
    const s = snapshotsOf([
      { id: 'A', plain: 4, swimlane: 'S1', lane: 1, start: 0, finish: 3 },
      { id: 'B', plain: 2, swimlane: null, lane: 0, start: 0, finish: 3 },
    ]);
    expect(s.plain.get('A')?.laneIndex).toBe(4);
    expect(s.swimlane?.get('S1')?.get('A')?.laneIndex).toBe(1);
    expect(s.swimlane?.get(NO_SWIMLANE_KEY)?.get('B')?.laneIndex).toBe(0);
  });

  it('reads a stale collision from the stored rows, which the projection would hide', () => {
    const s = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 5 },
      { id: 'B', plain: 1, swimlane: 'S1', lane: 0, start: 3, finish: 8 },
    ]);
    expect([...overlapsOf(s)]).toEqual(['S1:A|B']);
  });
});

describe('resolveBothLayouts', () => {
  it('resolves the swimlane picture alone and never writes a plain lane for it', () => {
    // Plain lanes differ, so the plain picture is clear; the stored in-swimlane lanes collide.
    const before = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 1, swimlane: 'S1', lane: 0, start: 6, finish: 9 },
    ]);
    const after = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 1, swimlane: 'S1', lane: 0, start: 2, finish: 9 },
    ]);
    const moves = resolveBothLayouts(before, after, new Set(['B']));
    expect(moves.plain).toEqual([]);
    expect(moves.swimlane).toEqual([{ id: 'B', from: 0, to: 1, swimlaneId: 'S1' }]);
  });

  it('resolves the plain picture alone and never writes a swimlane lane for it', () => {
    const before = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 0, swimlane: 'S2', lane: 0, start: 6, finish: 9 },
    ]);
    const after = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 0, swimlane: 'S2', lane: 0, start: 2, finish: 9 },
    ]);
    const moves = resolveBothLayouts(before, after, new Set(['B']));
    expect(moves.plain).toEqual([{ id: 'B', from: 0, to: 1 }]);
    expect(moves.swimlane).toEqual([]);
  });

  it('resolves both pictures from the one snapshot pair', () => {
    const before = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 0, swimlane: 'S1', lane: 0, start: 6, finish: 9 },
    ]);
    const after = snapshotsOf([
      { id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 0, swimlane: 'S1', lane: 0, start: 2, finish: 9 },
    ]);
    const moves = resolveBothLayouts(before, after, new Set(['B']));
    expect(moves.plain).toEqual([{ id: 'B', from: 0, to: 1 }]);
    expect(moves.swimlane).toEqual([{ id: 'B', from: 0, to: 1, swimlaneId: 'S1' }]);
  });

  it('a mover takes a lane of its own swimlane, which may grow, and does not leave it', () => {
    const before = snapshotsOf([
      { id: 'A', plain: 0, swimlane: null, lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 1, swimlane: null, lane: 1, start: 0, finish: 3 },
      { id: 'C', plain: 2, swimlane: 'S1', lane: 0, start: 6, finish: 9 },
    ]);
    const after = snapshotsOf([
      { id: 'A', plain: 0, swimlane: null, lane: 0, start: 0, finish: 3 },
      { id: 'B', plain: 1, swimlane: null, lane: 1, start: 0, finish: 3 },
      { id: 'C', plain: 2, swimlane: null, lane: 0, start: 1, finish: 9 },
    ]);
    // C joined "No swimlane" (new to that group), colliding with A at lane 0 there.
    const moves = resolveBothLayouts(before, after, new Set(['C']));
    expect(moves.swimlane).toEqual([{ id: 'C', from: 0, to: 2, swimlaneId: null }]);
  });

  it('skips the swimlane picture when either side cannot read it', () => {
    const specs: Spec[] = [{ id: 'A', plain: 0, swimlane: 'S1', lane: 0, start: 0, finish: 3 }];
    const without = layoutSnapshotsOf(specs.map(rowOf), null);
    const moves = resolveBothLayouts(snapshotsOf(specs), without, new Set(['A']));
    expect(moves.swimlane).toEqual([]);
  });
});

/** A small deterministic generator, so a failing seed can be replayed. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('SC-4 property: an edit leaves no overlap it did not find', () => {
  const GROUPS = ['S1', 'S2', null] as const;

  /** First-fit-with-a-random-start placement, so the generated plan has no overlap to begin with. */
  function clearPlan(rand: () => number, count: number): Spec[] {
    const specs: Spec[] = [];
    const taken = {
      plain: new Map<string, Spec[]>(),
      swim: new Map<string, Spec[]>(),
    };
    const fits = (held: Spec[] | undefined, s: Spec): boolean =>
      !(held ?? []).some((o) => !(o.finish < s.start || s.finish < o.start));
    for (let i = 0; i < count; i += 1) {
      const start = Math.floor(rand() * 20);
      const spec: Spec = {
        id: `A${String(i).padStart(2, '0')}`,
        plain: 0,
        swimlane: GROUPS[Math.floor(rand() * GROUPS.length)] ?? null,
        lane: 0,
        start,
        finish: start + Math.floor(rand() * 6),
      };
      spec.plain = Math.floor(rand() * 3);
      while (!fits(taken.plain.get(String(spec.plain)), spec)) spec.plain += 1;
      const swimKey = `${String(spec.swimlane)}:`;
      spec.lane = Math.floor(rand() * 3);
      while (!fits(taken.swim.get(swimKey + String(spec.lane)), spec)) spec.lane += 1;
      taken.plain.set(String(spec.plain), [...(taken.plain.get(String(spec.plain)) ?? []), spec]);
      const slot = swimKey + String(spec.lane);
      taken.swim.set(slot, [...(taken.swim.get(slot) ?? []), spec]);
      specs.push(spec);
    }
    return specs;
  }

  function edit(
    rand: () => number,
    specs: readonly Spec[],
  ): { after: Spec[]; subjects: Set<string> } {
    const subjects = new Set<string>();
    const after = specs.map((s) => {
      if (rand() > 0.4) return { ...s };
      subjects.add(s.id);
      const start = Math.max(0, s.start + Math.floor(rand() * 9) - 4);
      return { ...s, start, finish: start + Math.floor(rand() * 8) };
    });
    return { after, subjects };
  }

  function apply(
    s1: LayoutSnapshots,
    moves: ReturnType<typeof resolveBothLayouts>,
  ): LayoutSnapshots {
    const plain = new Map(s1.plain);
    for (const m of moves.plain) plain.set(m.id, { ...plain.get(m.id)!, laneIndex: m.to });
    const swimlane = new Map([...(s1.swimlane ?? [])].map(([k, g]) => [k, new Map(g)]));
    for (const m of moves.swimlane) {
      const group = swimlane.get(m.swimlaneId ?? NO_SWIMLANE_KEY)!;
      group.set(m.id, { ...group.get(m.id)!, laneIndex: m.to });
    }
    return { plain, swimlane };
  }

  it('after resolving, nothing overlaps that a clear plan did not, and only bars the edit touched move', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const rand = prng(seed);
      const before = clearPlan(rand, 3 + Math.floor(rand() * 10));
      const { after, subjects } = edit(rand, before);
      const s0 = snapshotsOf(before);
      const s1 = snapshotsOf(after);
      const moves = resolveBothLayouts(s0, s1, subjects);

      expect([...overlapsOf(apply(s1, moves))], `seed ${String(seed)}`).toEqual([]);

      const changed = (
        pick: (
          s: LayoutSnapshots,
        ) => { laneIndex: number; start: string; finish: string } | undefined,
      ): boolean => {
        const was = pick(s0);
        const now = pick(s1);
        return (
          was === undefined ||
          now === undefined ||
          was.laneIndex !== now.laneIndex ||
          was.start !== now.start ||
          was.finish !== now.finish
        );
      };
      for (const m of moves.plain) {
        expect(
          changed((s) => s.plain.get(m.id)),
          `plain ${m.id}, seed ${String(seed)}`,
        ).toBe(true);
      }
      for (const m of moves.swimlane) {
        const key = m.swimlaneId ?? NO_SWIMLANE_KEY;
        expect(
          changed((s) => s.swimlane?.get(key)?.get(m.id)),
          `swimlane ${m.id}, seed ${String(seed)}`,
        ).toBe(true);
      }
    }
  });

  it('over stale stored rows, no overlap is added and none that existed is touched', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const rand = prng(seed * 7919);
      // Arbitrary stored lanes, so rows collide before the edit as server-side arrivals leave them.
      const before = clearPlan(rand, 3 + Math.floor(rand() * 10)).map((s) => ({
        ...s,
        lane: Math.floor(rand() * 2),
      }));
      const { after, subjects } = edit(rand, before);
      const s0 = snapshotsOf(before);
      const s1 = snapshotsOf(after);
      const moves = resolveBothLayouts(s0, s1, subjects);
      const remaining = overlapsOf(apply(s1, moves));
      const existing = overlapsOf(s0);
      for (const pair of remaining) {
        expect(existing.has(pair), `${pair}, seed ${String(seed)}`).toBe(true);
      }
    }
  });
});
