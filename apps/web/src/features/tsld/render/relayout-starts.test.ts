import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { packLanes } from '@repo/layout';
import { describe, expect, it } from 'vitest';

import type { LayoutObjective } from './layout-objective';
import { OPTIMISE_MAX_ACTIVITIES } from './optimise-layout';
import {
  pickBestStart,
  relayoutSeeds,
  relayoutStartIds,
  RELAYOUT_MULTISTART_MAX_ACTIVITIES,
  type StartId,
} from './relayout-starts';
import { axisDayOf, type RenderActivity, type RenderEdge } from './render-model';

/**
 * **The start seeds** (`relayout-quality` M2-T1). Each is a layout the search begins from, so what
 * matters is that it is a valid one (no overlap, every drawn bar placed), that it is the same on every
 * call whatever order the input arrives in, and that the pick among results is order-free.
 */
const DATA_DATE = '2026-01-01';

function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

function bar(id: string, laneIndex: number, start: number, length: number): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex,
    label: id,
    drawnStart: day(start),
    drawnFinish: day(start + length - 1),
    isCritical: false,
    isNearCritical: false,
  };
}

const link = (predecessorId: string, successorId: string): RenderEdge => ({
  predecessorId,
  successorId,
  type: 'FS',
  isDriving: true,
});

/** Two interleaved chains and a loose bar, scattered over six rows: the starts differ here. */
function plan() {
  const activities = [
    bar('a1', 0, 0, 4),
    bar('a2', 3, 5, 4),
    bar('a3', 1, 10, 4),
    bar('b1', 2, 1, 6),
    bar('b2', 5, 8, 3),
    bar('b3', 4, 12, 4),
    bar('c1', 0, 3, 5),
    bar('x1', 4, 12, 2),
    bar('x2', 5, 2, 2),
    { ...bar('u1', 2, 0, 1), drawnStart: null, drawnFinish: null },
  ];
  const edges = [
    link('a1', 'a2'),
    link('a2', 'a3'),
    link('b1', 'b2'),
    link('b2', 'b3'),
    link('x1', 'x2'),
  ];
  return { activities, edges };
}

function packedOf(activities: readonly RenderActivity[]): Map<string, number> {
  const changes = packLanes(
    activities
      .filter((a) => a.drawnStart !== null)
      .map((a) => ({
        id: a.id,
        laneIndex: -1,
        startDay: axisDayOf(a.type, DATA_DATE, a.drawnStart!),
        endDay: axisDayOf(a.type, DATA_DATE, a.drawnFinish ?? a.drawnStart!),
      })),
  );
  const lanes = new Map(activities.map((a) => [a.id, a.laneIndex]));
  for (const c of changes) lanes.set(c.id, c.laneIndex);
  return lanes;
}

function seedsOf(activities: readonly RenderActivity[], edges: readonly RenderEdge[]) {
  return relayoutSeeds(
    { activities, edges, dataDate: DATA_DATE, packed: packedOf(activities) },
    [0, 1, 2, 3],
  );
}

describe('relayoutStartIds', () => {
  it('runs all four starts up to the gate and the pack alone above it', () => {
    expect(relayoutStartIds(1)).toEqual([0, 1, 2, 3]);
    expect(relayoutStartIds(RELAYOUT_MULTISTART_MAX_ACTIVITIES)).toEqual([0, 1, 2, 3]);
    expect(relayoutStartIds(RELAYOUT_MULTISTART_MAX_ACTIVITIES + 1)).toEqual([0]);
  });

  it('is never wider than the plans Re-layout is searched on at all', () => {
    expect(RELAYOUT_MULTISTART_MAX_ACTIVITIES).toBeLessThanOrEqual(OPTIMISE_MAX_ACTIVITIES);
  });

  it('keeps the gate at the owner-decided size: a plan past it waits for the pack start only (CQ-2)', () => {
    expect(RELAYOUT_MULTISTART_MAX_ACTIVITIES).toBe(150);
    expect(relayoutStartIds(147)).toEqual([0, 1, 2, 3]);
    expect(relayoutStartIds(151)).toEqual([0]);
    expect(relayoutStartIds(300)).toEqual([0]);
  });
});

describe('relayoutSeeds', () => {
  it('starts from the given pack exactly, as start 0', () => {
    const { activities, edges } = plan();
    const packed = packedOf(activities);
    const [first] = relayoutSeeds({ activities, edges, dataDate: DATA_DATE, packed }, [0]);
    expect(first?.id).toBe(0);
    expect([...first!.lanes]).toEqual([...packed]);
  });

  it('gives every seed a lane for every activity, undrawn ones keeping theirs', () => {
    const { activities, edges } = plan();
    for (const seed of seedsOf(activities, edges)) {
      expect([...seed.lanes.keys()].sort()).toEqual(activities.map((a) => a.id).sort());
      expect(seed.lanes.get('u1')).toBe(2);
    }
  });

  it('never overlaps two drawn bars on a row', () => {
    const { activities, edges } = plan();
    for (const seed of seedsOf(activities, edges)) {
      const drawn = activities.filter((a) => a.drawnStart !== null);
      for (const x of drawn) {
        for (const y of drawn) {
          if (x.id >= y.id || seed.lanes.get(x.id) !== seed.lanes.get(y.id)) continue;
          const xs = axisDayOf(x.type, DATA_DATE, x.drawnStart!);
          const xe = axisDayOf(x.type, DATA_DATE, x.drawnFinish!);
          const ys = axisDayOf(y.type, DATA_DATE, y.drawnStart!);
          const ye = axisDayOf(y.type, DATA_DATE, y.drawnFinish!);
          expect(xe < ys || ye < xs, `start ${String(seed.id)}: ${x.id} overlaps ${y.id}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('is the same whatever order the activities and links arrive in', () => {
    const { activities, edges } = plan();
    const forward = seedsOf(activities, edges);
    const backward = seedsOf([...activities].reverse(), [...edges].reverse());
    const key = (seeds: ReturnType<typeof seedsOf>) =>
      JSON.stringify(seeds.map((s) => [s.id, [...s.lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1))]));
    expect(key(backward)).toBe(key(forward));
  });

  it('differs from the pack on a linked plan, so a second start is worth running', () => {
    const { activities, edges } = plan();
    expect(seedsOf(activities, edges).length).toBeGreaterThan(1);
  });

  it('drops a start whose layout equals an earlier one, and keeps start 0 first', () => {
    // Four sequential bars and no links: every start reduces to the same one-row pack.
    const activities = [bar('a', 0, 0, 5), bar('b', 1, 10, 5), bar('c', 2, 20, 5)];
    const seeds = seedsOf(activities, []);
    expect(seeds.map((s) => s.id)).toEqual([0]);
  });

  it('does not depend on the schedule engine or the server', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/tsld/render/relayout-starts.ts'),
      'utf8',
    );
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual(
      ['./layout-objective', './render-model', '@repo/layout'].sort(),
    );
  });
});

/** The same plan filed in two swimlanes: the chains apart from each other, the loose bars together. */
const SWIMLANES: ReadonlyMap<string, string> = new Map([
  ['a1', 'north'],
  ['a2', 'north'],
  ['a3', 'north'],
  ['c1', 'north'],
  ['b1', 'south'],
  ['b2', 'south'],
  ['b3', 'south'],
  ['x1', 'south'],
  ['x2', 'south'],
  ['u1', 'south'],
]);

/** Start 0 as the partitioned pack gives it: lanes local to each swimlane. */
function packedInSwimlanes(activities: readonly RenderActivity[]): Map<string, number> {
  const lanes = new Map(activities.map((a) => [a.id, a.laneIndex]));
  const changes = packLanes(
    activities
      .filter((a) => a.drawnStart !== null)
      .map((a) => ({
        id: a.id,
        laneIndex: -1,
        startDay: axisDayOf(a.type, DATA_DATE, a.drawnStart!),
        endDay: axisDayOf(a.type, DATA_DATE, a.drawnFinish ?? a.drawnStart!),
      })),
    undefined,
    SWIMLANES,
  );
  for (const c of changes) lanes.set(c.id, c.laneIndex);
  return lanes;
}

function swimlaneSeedsOf(activities: readonly RenderActivity[], edges: readonly RenderEdge[]) {
  return relayoutSeeds(
    {
      activities,
      edges,
      dataDate: DATA_DATE,
      packed: packedInSwimlanes(activities),
      partition: SWIMLANES,
    },
    [0, 1, 2, 3],
  );
}

describe('relayoutSeeds inside swimlanes (swimlanes M2-T6)', () => {
  it('builds starts 1 to 3 one swimlane at a time, each swimlane from row 0', () => {
    const { activities, edges } = plan();
    const seeds = swimlaneSeedsOf(activities, edges);
    expect(seeds.length).toBeGreaterThan(1);
    for (const seed of seeds.filter((s) => s.id !== 0)) {
      for (const key of ['north', 'south']) {
        const mine = activities.filter((a) => SWIMLANES.get(a.id) === key && a.drawnStart !== null);
        const used = [...new Set(mine.map((a) => seed.lanes.get(a.id)!))].sort((a, b) => a - b);
        expect(used[0], `start ${String(seed.id)} ${key}`).toBe(0);
        expect(used, `start ${String(seed.id)} ${key}`).toEqual(used.map((_, i) => i));
      }
    }
  });

  it('is the construction run on that swimlane alone, links across swimlanes ignored', () => {
    const { activities, edges } = plan();
    const across = [...edges, link('a3', 'b3'), link('b1', 'c1')];
    const together = swimlaneSeedsOf(activities, across);
    for (const key of ['north', 'south']) {
      const mine = activities.filter((a) => SWIMLANES.get(a.id) === key);
      const ids = new Set(mine.map((a) => a.id));
      const alone = relayoutSeeds(
        {
          activities: mine,
          edges: across.filter((e) => ids.has(e.predecessorId) && ids.has(e.successorId)),
          dataDate: DATA_DATE,
          packed: packedInSwimlanes(activities),
        },
        [1, 2, 3],
      );
      for (const seed of alone) {
        const joint = together.find((t) => t.id === seed.id);
        // A start that duplicates an earlier one is dropped, so compare the ones that survived.
        if (joint === undefined) continue;
        for (const id of ids)
          expect(joint.lanes.get(id), `start ${String(seed.id)} ${id}`).toBe(seed.lanes.get(id));
      }
    }
  });

  it('never overlaps two drawn bars of one swimlane on a row', () => {
    const { activities, edges } = plan();
    for (const seed of swimlaneSeedsOf(activities, edges)) {
      const drawn = activities.filter((a) => a.drawnStart !== null);
      for (const x of drawn) {
        for (const y of drawn) {
          if (x.id >= y.id || SWIMLANES.get(x.id) !== SWIMLANES.get(y.id)) continue;
          if (seed.lanes.get(x.id) !== seed.lanes.get(y.id)) continue;
          const xs = axisDayOf(x.type, DATA_DATE, x.drawnStart!);
          const xe = axisDayOf(x.type, DATA_DATE, x.drawnFinish!);
          const ys = axisDayOf(y.type, DATA_DATE, y.drawnStart!);
          const ye = axisDayOf(y.type, DATA_DATE, y.drawnFinish!);
          expect(xe < ys || ye < xs, `start ${String(seed.id)}: ${x.id} overlaps ${y.id}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('gives every seed a lane for every activity, an undrawn one keeping its own', () => {
    const { activities, edges } = plan();
    for (const seed of swimlaneSeedsOf(activities, edges)) {
      expect([...seed.lanes.keys()].sort()).toEqual(activities.map((a) => a.id).sort());
      expect(seed.lanes.get('u1')).toBe(2);
    }
  });

  it('is the same whatever order the activities and links arrive in', () => {
    const { activities, edges } = plan();
    const key = (seeds: ReturnType<typeof swimlaneSeedsOf>) =>
      JSON.stringify(seeds.map((s) => [s.id, [...s.lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1))]));
    expect(key(swimlaneSeedsOf([...activities].reverse(), [...edges].reverse()))).toBe(
      key(swimlaneSeedsOf(activities, edges)),
    );
  });

  it('is the old answer when no partition is given', () => {
    const { activities, edges } = plan();
    const packed = packedOf(activities);
    const bare = relayoutSeeds({ activities, edges, dataDate: DATA_DATE, packed }, [0, 1, 2, 3]);
    const absent = relayoutSeeds(
      { activities, edges, dataDate: DATA_DATE, packed, partition: undefined },
      [0, 1, 2, 3],
    );
    expect(absent).toEqual(bare);
  });
});

describe('pickBestStart', () => {
  const objective = (crossings: number, rows = 3): { final: LayoutObjective } => ({
    final: {
      overlaps: 0,
      occluded: 0,
      crossings,
      contacts: 0,
      sameRow: 0,
      travel: 0,
      rows,
    },
  });

  it('takes the lexicographically best result', () => {
    expect(pickBestStart([objective(5), objective(2), objective(4)])).toBe(1);
  });

  it('breaks a tie towards the lowest start', () => {
    expect(pickBestStart([objective(2), objective(2), objective(2)])).toBe(0);
    expect(pickBestStart([objective(3), objective(2), objective(2)])).toBe(1);
  });

  it('ranks a higher term before a lower one', () => {
    expect(pickBestStart([objective(2, 9), objective(3, 1)])).toBe(0);
  });

  it('throws when there is nothing to choose from', () => {
    expect(() => pickBestStart([])).toThrow();
  });
});

it('names every start', async () => {
  const { START_NAMES } = await import('./relayout-starts');
  const ids: StartId[] = [0, 1, 2, 3];
  expect(ids.map((id) => START_NAMES[id])).toHaveLength(4);
});
