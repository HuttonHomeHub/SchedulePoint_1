import { describe, expect, it } from 'vitest';

import { laneOverlapPairs } from '../render/lane-overlap';

import {
  dayOf,
  laneSnapshotOf,
  type LaneSnapshot,
  type LaneState,
  resolveLaneDrop,
  resolveNewOverlaps,
} from './auto-resolve';

const st = (laneIndex: number, start: string, finish: string): LaneState => ({
  laneIndex,
  start,
  finish,
});
const snap = (entries: Record<string, LaneState>): LaneSnapshot => new Map(Object.entries(entries));

/** Apply the resolutions to S1 and return the overlap pairs that remain. */
function remaining(s1: LaneSnapshot, moves: ReturnType<typeof resolveNewOverlaps>): string[] {
  const lanes = new Map([...s1].map(([id, s]) => [id, s.laneIndex]));
  for (const m of moves) lanes.set(m.id, m.to);
  return laneOverlapPairs(
    [...s1].map(([id, s]) => ({ id, laneIndex: lanes.get(id)!, start: s.start, finish: s.finish })),
  ).map(([a, b]) => `${a}|${b}`);
}

describe('resolveNewOverlaps', () => {
  it('rule 1 — a planner stretching their own bar into a neighbour moves the stretched bar', () => {
    const s0 = snap({ C: st(0, '2026-01-01', '2026-01-05'), D: st(0, '2026-01-10', '2026-01-15') });
    const s1 = snap({ C: st(0, '2026-01-01', '2026-01-12'), D: st(0, '2026-01-10', '2026-01-15') });
    expect(resolveNewOverlaps(s0, s1, new Set(['C']))).toEqual([{ id: 'C', from: 0, to: 1 }]);
  });

  it('rule 1 holds whatever the subject set says — the unchanged bar never moves', () => {
    const s0 = snap({ C: st(0, '2026-01-01', '2026-01-05'), D: st(0, '2026-01-10', '2026-01-15') });
    const s1 = snap({ C: st(0, '2026-01-01', '2026-01-12'), D: st(0, '2026-01-10', '2026-01-15') });
    expect(resolveNewOverlaps(s0, s1, new Set(['D']))).toEqual([{ id: 'C', from: 0, to: 1 }]);
  });

  it('rule 2 — the recalculation pushes an un-edited successor into the bar the planner placed', () => {
    // The planner moves P (subject) into row 0 next to S; the engine then pushes S later into P.
    const s0 = snap({ P: st(1, '2026-01-01', '2026-01-05'), S: st(0, '2026-01-10', '2026-01-15') });
    const s1 = snap({ P: st(0, '2026-01-12', '2026-01-16'), S: st(0, '2026-01-14', '2026-01-19') });
    expect(resolveNewOverlaps(s0, s1, new Set(['P']))).toEqual([{ id: 'S', from: 0, to: 1 }]);
  });

  it('rule 3 — both pushed by the engine: the later drawn start moves', () => {
    const s0 = snap({ A: st(0, '2026-01-01', '2026-01-05'), B: st(0, '2026-01-10', '2026-01-15') });
    const s1 = snap({ A: st(0, '2026-01-03', '2026-01-12'), B: st(0, '2026-01-11', '2026-01-17') });
    expect(resolveNewOverlaps(s0, s1, new Set(['Z']))).toEqual([{ id: 'B', from: 0, to: 1 }]);
  });

  it('rule 3 — both subjects of one bulk command, same start: the larger id moves', () => {
    const s0 = snap({ A: st(0, '2026-01-01', '2026-01-02'), B: st(1, '2026-01-01', '2026-01-02') });
    const s1 = snap({ A: st(2, '2026-01-05', '2026-01-08'), B: st(2, '2026-01-05', '2026-01-09') });
    expect(resolveNewOverlaps(s0, s1, new Set(['A', 'B']))).toEqual([{ id: 'B', from: 2, to: 1 }]);
  });

  it('a create is "changed" — the new bar moves off the row it was dropped on', () => {
    const s0 = snap({ A: st(0, '2026-01-01', '2026-01-10') });
    const s1 = snap({ A: st(0, '2026-01-01', '2026-01-10'), N: st(0, '2026-01-05', '2026-01-06') });
    expect(resolveNewOverlaps(s0, s1, new Set(['N']))).toEqual([{ id: 'N', from: 0, to: 1 }]);
  });

  it('leaves an overlap that existed before the command alone', () => {
    const s0 = snap({ A: st(0, '2026-01-01', '2026-01-10'), B: st(0, '2026-01-05', '2026-01-12') });
    const s1 = snap({ A: st(0, '2026-01-01', '2026-01-11'), B: st(0, '2026-01-05', '2026-01-12') });
    expect(resolveNewOverlaps(s0, s1, new Set(['A']))).toEqual([]);
  });

  it('does nothing when nothing new overlaps', () => {
    const s = snap({ A: st(0, '2026-01-01', '2026-01-10'), B: st(0, '2026-01-11', '2026-01-12') });
    expect(resolveNewOverlaps(s, s, new Set(['A']))).toEqual([]);
  });

  it('places a cascade in drawn-start order so two movers never share the row they land in', () => {
    // Row 0 is the busy row; X and Y are both pushed into W and into each other.
    const s0 = snap({
      W: st(0, '2026-01-01', '2026-01-30'),
      X: st(0, '2026-02-01', '2026-02-05'),
      Y: st(0, '2026-02-06', '2026-02-10'),
      R1: st(1, '2026-01-01', '2026-03-01'),
    });
    const s1 = snap({
      W: st(0, '2026-01-01', '2026-01-30'),
      X: st(0, '2026-01-20', '2026-01-28'),
      Y: st(0, '2026-01-22', '2026-01-29'),
      R1: st(1, '2026-01-01', '2026-03-01'),
    });
    const moves = resolveNewOverlaps(s0, s1, new Set());
    expect(moves).toEqual([
      { id: 'X', from: 0, to: 2 },
      { id: 'Y', from: 0, to: 3 },
    ]);
    expect(remaining(s1, moves)).toEqual([]);
  });

  it('moves nobody whose lane and span are both unchanged, on a larger random edit', () => {
    const s0 = new Map<string, LaneState>();
    const s1 = new Map<string, LaneState>();
    for (let i = 0; i < 40; i += 1) {
      const day = String(1 + (i % 25)).padStart(2, '0');
      const state = st(i % 6, `2026-01-${day}`, `2026-01-${day}`);
      s0.set(`a${String(i).padStart(2, '0')}`, state);
      s1.set(`a${String(i).padStart(2, '0')}`, state);
    }
    // Stretch five bars across the month, so they collide with neighbours.
    for (const id of ['a03', 'a11', 'a17', 'a22', 'a30']) {
      s1.set(id, { ...s1.get(id)!, finish: '2026-01-28' });
    }
    const moves = resolveNewOverlaps(s0, s1, new Set(['a03', 'a11', 'a17', 'a22', 'a30']));
    const movedIds = new Set(moves.map((m) => m.id));
    for (const id of movedIds) expect(['a03', 'a11', 'a17', 'a22', 'a30']).toContain(id);
    const newPairs = new Set(remaining(s1, moves));
    const old = new Set(
      laneOverlapPairs([...s0].map(([id, s]) => ({ id, ...s }))).map(([a, b]) => `${a}|${b}`),
    );
    for (const pair of newPairs) expect(old.has(pair)).toBe(true);
  });

  it('is deterministic: the same snapshots in any insertion order give the same result', () => {
    const s0 = snap({ C: st(0, '2026-01-01', '2026-01-05'), D: st(0, '2026-01-10', '2026-01-15') });
    const s1 = snap({ D: st(0, '2026-01-10', '2026-01-15'), C: st(0, '2026-01-01', '2026-01-12') });
    const a = resolveNewOverlaps(s0, s1, new Set(['C']));
    const b = resolveNewOverlaps(
      new Map([...s0].reverse()),
      new Map([...s1].reverse()),
      new Set(['C']),
    );
    expect(b).toEqual(a);
  });
});

describe('dayOf', () => {
  it('agrees with Date.parse across leap years and a century boundary', () => {
    for (const iso of [
      '1999-12-31',
      '2000-02-28',
      '2000-02-29',
      '2000-03-01',
      '2024-02-29',
      '2026-01-01',
      '2100-03-01',
    ]) {
      expect(dayOf(iso)).toBe(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
    }
  });
});

describe('laneSnapshotOf', () => {
  const row = (
    id: string,
    laneIndex: number,
    visualEffectiveStart: string | null,
    visualEffectiveFinish: string | null,
  ) => ({
    id,
    laneIndex,
    earlyStart: '2000-01-01',
    earlyFinish: '2000-01-02',
    visualEffectiveStart,
    visualEffectiveFinish,
    lateStart: '2099-01-01',
    lateFinish: '2099-01-02',
  });

  it('reads the drawn (visual) span, never the early or late one', () => {
    // Early and late dates are deliberately far away: a snapshot built from either would put these
    // bars decades from where the planner sees them, which is the #663 defect in a new place.
    expect(laneSnapshotOf([row('A', 3, '2026-01-05', '2026-01-09')])).toEqual(
      new Map([['A', st(3, '2026-01-05', '2026-01-09')]]),
    );
  });

  it('draws a milestone at its start and leaves an undrawn activity out', () => {
    const s = laneSnapshotOf([row('M', 0, '2026-01-05', null), row('U', 0, null, null)]);
    expect(s.get('M')).toEqual(st(0, '2026-01-05', '2026-01-05'));
    expect(s.has('U')).toBe(false);
  });
});

describe('resolveLaneDrop', () => {
  it('lands on the target when it is free', () => {
    const s = snap({ X: st(0, '2026-01-01', '2026-01-05'), Y: st(1, '2026-02-01', '2026-02-05') });
    expect(resolveLaneDrop(s, 'X', 1)).toBe(1);
  });

  it('moving down onto an occupied lane goes on down, never back to the lane it left', () => {
    // The nearest-free rule would answer 0 here — the lane X came from, free to X by definition —
    // so Alt+↓ would do nothing. The direction of travel is the planner's, and it wins.
    const s = snap({
      X: st(0, '2026-01-01', '2026-01-05'),
      Y: st(1, '2026-01-03', '2026-01-08'),
      Z: st(2, '2026-01-04', '2026-01-04'),
    });
    expect(resolveLaneDrop(s, 'X', 1)).toBe(3);
  });

  it('moving up onto an occupied lane goes on up', () => {
    const s = snap({
      X: st(3, '2026-01-01', '2026-01-05'),
      Y: st(2, '2026-01-03', '2026-01-08'),
    });
    expect(resolveLaneDrop(s, 'X', 2)).toBe(1);
  });

  it('moving up with no free lane above stays where it was', () => {
    const s = snap({
      X: st(2, '2026-01-01', '2026-01-05'),
      Y: st(1, '2026-01-03', '2026-01-08'),
      Z: st(0, '2026-01-02', '2026-01-02'),
    });
    expect(resolveLaneDrop(s, 'X', 1)).toBe(2);
  });

  it('touching end to start is an overlap (inclusive spans, the lane-overlap convention)', () => {
    const s = snap({ X: st(0, '2026-01-05', '2026-01-09'), Y: st(1, '2026-01-01', '2026-01-05') });
    expect(resolveLaneDrop(s, 'X', 1)).toBe(2);
  });

  it('an activity the diagram does not draw lands where it was asked to', () => {
    const s = snap({ Y: st(1, '2026-01-01', '2026-01-05') });
    expect(resolveLaneDrop(s, 'U', 1)).toBe(1);
  });
});
