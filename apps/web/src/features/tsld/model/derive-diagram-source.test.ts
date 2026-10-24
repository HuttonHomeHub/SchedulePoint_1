import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { toRenderActivities } from '../render/to-render-model';

import { deriveDiagramSource } from './derive-diagram-source';

import { deriveWbsBandSource } from '@/features/wbs';
import { anActivity } from '@/test/activity-fixture';

const DATA_DATE = '2026-01-01';

const task = (id: string, lane: number, start: string, finish: string): ActivitySummary =>
  anActivity({ id, laneIndex: lane, earlyStart: start, earlyFinish: finish });

const ACTIVITIES = [
  anActivity({
    id: 'sum',
    type: 'WBS_SUMMARY',
    laneIndex: 0,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-30',
  }),
  task('a', 1, '2026-01-02', '2026-01-09'),
  task('b', 2, '2026-01-03', '2026-01-10'),
  task('c', 3, '2026-01-20', '2026-01-25'),
];

const NO_BAND = { enabled: false, toggleOn: false };

describe('deriveDiagramSource, swimlanes off (SC-3)', () => {
  it.each([
    ['band off', NO_BAND],
    ['band on', { enabled: true, toggleOn: true }],
    ['flag on, toggle off', { enabled: true, toggleOn: false }],
  ])('is exactly the old two-step composition with the %s', (_name, wbsBand) => {
    const band = deriveWbsBandSource(ACTIVITIES, { ...wbsBand, source: 'early' });
    for (const swimlanes of [undefined, null]) {
      const out = deriveDiagramSource(ACTIVITIES, {
        wbsBand,
        swimlanes,
        source: 'early',
        dataDate: DATA_DATE,
      });
      expect(out.sceneActivities).toEqual(band.sceneActivities);
      expect(out.renderActivities).toEqual(toRenderActivities(band.sceneActivities, 'early'));
      expect(out.bandGroups).toEqual(band.groups);
      expect(out.bandHeight).toBe(band.height);
      expect(out.swimlaneScene).toBeNull();
    }
  });

  it('hands the plan’s own list back by identity when the band is off', () => {
    const out = deriveDiagramSource(ACTIVITIES, {
      wbsBand: NO_BAND,
      source: 'early',
      dataDate: DATA_DATE,
    });
    expect(out.sceneActivities).toBe(ACTIVITIES);
  });

  it('draws swimlane-free when there is no data date to measure spans from', () => {
    const out = deriveDiagramSource(ACTIVITIES, {
      wbsBand: NO_BAND,
      swimlanes: {
        swimlanes: [{ id: 's1', name: 'M' }],
        membership: new Map(),
        storedLanes: new Map(),
      },
      source: 'early',
      dataDate: null,
    });
    expect(out.swimlaneScene).toBeNull();
    expect(out.renderActivities.map((r) => r.laneIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe('deriveDiagramSource, swimlanes on', () => {
  const swimlanes = {
    swimlanes: [
      { id: 's1', name: 'Mechanical' },
      { id: 's2', name: 'Electrical' },
    ],
    membership: new Map<string, string | null>([
      ['a', 's2'],
      ['b', 's1'],
      ['c', 's1'],
    ]),
    storedLanes: new Map<string, { lane: number; updatedAt: number }>(),
  };

  it('swaps the display lane into the render activities, and nowhere else', () => {
    const out = deriveDiagramSource(ACTIVITIES, {
      wbsBand: NO_BAND,
      swimlanes,
      source: 'early',
      dataDate: DATA_DATE,
    });
    const projection = out.swimlaneScene!;

    // The canvas is handed display lanes, exactly the projection's.
    for (const r of out.renderActivities) {
      expect(r.laneIndex).toBe(projection.displayLanes.get(r.id) ?? 0);
    }
    // s1 (b, c: they do not overlap in time, so one lane) is above s2 (a), so a is below b.
    const lane = (id: string) => out.renderActivities.find((r) => r.id === id)!.laneIndex;
    expect(lane('b')).toBeLessThan(lane('a'));
    expect(lane('b')).toBe(lane('c'));

    // The stored-lane list is the packing input and keeps the stored lanes.
    expect(out.sceneActivities.map((a) => [a.id, a.laneIndex])).toEqual([
      ['sum', 0],
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    // And the input list was never written to.
    expect(ACTIVITIES.map((a) => a.laneIndex)).toEqual([0, 1, 2, 3]);
  });

  it('leaves a summary the band draws out of the swimlanes, so it holds no lane open', () => {
    const out = deriveDiagramSource(ACTIVITIES, {
      wbsBand: { enabled: true, toggleOn: true },
      swimlanes,
      source: 'early',
      dataDate: DATA_DATE,
    });
    expect(out.renderActivities.some((r) => r.id === 'sum')).toBe(false);
    expect(out.swimlaneScene!.displayLanes.has('sum')).toBe(false);
  });

  it('is a pure function of its inputs', () => {
    const args = {
      wbsBand: NO_BAND,
      swimlanes,
      source: 'early',
      dataDate: DATA_DATE,
    } as const;
    expect(deriveDiagramSource(ACTIVITIES, args)).toEqual(deriveDiagramSource(ACTIVITIES, args));
  });
});
