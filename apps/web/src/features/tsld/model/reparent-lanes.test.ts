import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { planReparentLanes } from './reparent-lanes';

import { anActivity } from '@/test/activity-fixture';

const DATA_DATE = '2026-01-01';
const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;

const summary = (id: string, parentId: string | null = null): ActivitySummary =>
  anActivity({ id, name: id, type: 'WBS_SUMMARY', parentId, laneIndex: 0 });

function task(
  id: string,
  parentId: string | null,
  start: number,
  end: number,
  stored?: { summary: string; lane: number },
): ActivitySummary {
  return anActivity({
    id,
    name: id,
    parentId,
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
    swimlaneLanes:
      stored === undefined
        ? []
        : [
            {
              basis: 'WBS_SUMMARY',
              swimlaneId: null,
              summaryActivityId: stored.summary,
              wbsLevel: null,
              laneIndex: stored.lane,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
  });
}

const BASE = {
  source: 'WBS',
  level: 1,
  dataDate: DATA_DATE,
} as const;

// Two groups. G1 holds t1 (days 0-3, lane 0). G2 holds t2 (days 0-3, lane 0) and t3 (days 5-8, lane 1).
const PLAN = [
  summary('G1'),
  summary('G2'),
  task('t1', 'G1', 0, 3, { summary: 'G1', lane: 0 }),
  task('t2', 'G2', 0, 3, { summary: 'G2', lane: 0 }),
  task('t3', 'G2', 5, 8, { summary: 'G2', lane: 1 }),
];

describe('planReparentLanes', () => {
  it('writes nothing unless the plan’s swimlanes come from the WBS at a valid level', () => {
    const changes = [{ id: 't1', parentId: 'G2' }];
    expect(planReparentLanes({ ...BASE, activities: PLAN, changes, source: 'MANUAL' })).toEqual([]);
    expect(planReparentLanes({ ...BASE, activities: PLAN, changes, source: 'NONE' })).toEqual([]);
    expect(planReparentLanes({ ...BASE, activities: PLAN, changes, level: null })).toEqual([]);
    expect(planReparentLanes({ ...BASE, activities: PLAN, changes, dataDate: null })).toEqual([]);
    expect(planReparentLanes({ ...BASE, activities: PLAN, changes: [] })).toEqual([]);
  });

  it('writes nothing when the move stays inside its group', () => {
    // t3 is re-filed under the same summary it already has.
    expect(
      planReparentLanes({ ...BASE, activities: PLAN, changes: [{ id: 't3', parentId: 'G2' }] }),
    ).toEqual([]);
  });

  it('stores the mover’s lane in its new group: nearest free when its old lane is taken', () => {
    // t1 (days 0-3) joins G2, where t2 holds lane 0 at the same days; t3 holds lane 1 at days 5-8,
    // which does not overlap t1, so lane 1 is the nearest free one.
    const writes = planReparentLanes({
      ...BASE,
      activities: PLAN,
      changes: [{ id: 't1', parentId: 'G2' }],
    });
    expect(writes.find((p) => p.id === 't1')).toEqual({ id: 't1', lane: 1, materialised: true });
  });

  it('takes the lane the mover remembers for the new group when it is free', () => {
    const remembered = PLAN.map((a) =>
      a.id === 't1'
        ? {
            ...a,
            swimlaneLanes: [
              ...a.swimlaneLanes,
              {
                basis: 'WBS_SUMMARY' as const,
                swimlaneId: null,
                summaryActivityId: 'G2',
                wbsLevel: null,
                laneIndex: 3,
                updatedAt: '2026-01-02T00:00:00.000Z',
              },
            ],
          }
        : a,
    );
    const writes = planReparentLanes({
      ...BASE,
      activities: remembered,
      changes: [{ id: 't1', parentId: 'G2' }],
    });
    expect(writes.find((p) => p.id === 't1')?.lane).toBe(3);
  });

  it('moves a summary’s whole subtree, because membership is inherited', () => {
    const nested = [
      summary('G1'),
      summary('G2'),
      { ...summary('S', 'G1'), visualEffectiveStart: iso(0), visualEffectiveFinish: iso(3) },
      task('t1', 'S', 0, 3, { summary: 'G1', lane: 0 }),
      task('t2', 'G2', 0, 3, { summary: 'G2', lane: 0 }),
    ];
    const ids = planReparentLanes({
      ...BASE,
      activities: nested,
      changes: [{ id: 'S', parentId: 'G2' }],
    }).map((p) => p.id);
    expect(ids).toContain('S');
    expect(ids).toContain('t1');
  });

  it('never names a swimlane and never carries an undo origin', () => {
    const writes = planReparentLanes({
      ...BASE,
      activities: PLAN,
      changes: [{ id: 't1', parentId: 'G2' }],
    });
    expect(writes.length).toBeGreaterThan(0);
    for (const p of writes) {
      expect(p.swimlaneId).toBeUndefined();
      expect(p.from).toBeUndefined();
      expect(p.materialised).toBe(true);
    }
  });

  it('gives two movers that swap groups a lane each', () => {
    const writes = planReparentLanes({
      ...BASE,
      activities: PLAN,
      changes: [
        { id: 't1', parentId: 'G2' },
        { id: 't2', parentId: 'G1' },
      ],
    });
    const laneOf = new Map(writes.map((p) => [p.id, p.lane]));
    // t1 (days 0-3) lands in G2 beside t3 (days 5-8) and t2 lands alone in G1: neither collides.
    expect(laneOf.get('t1')).toBe(0);
    expect(laneOf.get('t2')).toBe(0);
  });
});
