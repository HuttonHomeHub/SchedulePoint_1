import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeLaneArrangement } from './arrange-lanes';

/**
 * Auto-arrange packs what the SCENE paints (`docs/TECH_DEBT.md` #364).
 *
 * The fixture is built so the two answers cannot coincide. A band-drawn summary spanning the whole
 * programme sits across three short tasks that overlap each other in pairs: packed **with** them it
 * takes a low lane and shoves every task up one, packed **after** them it takes a lane above all
 * three. So the same four bars come back with different lanes depending on which rule ran, and a
 * test that passed against both would be pinning nothing.
 *
 * The band-off case is here for the same reason the split is written the way it is: that path has
 * to stay the pre-#364 answer exactly, and "it looks like the same call" is not a test.
 */
const DATA_DATE = '2026-01-01';

/** Three tasks that pairwise overlap — t1 [0,2], t2 [1,3], t3 [2,4] — so no two share a lane. */
const TASKS = [
  { id: 't1', earlyStart: '2026-01-01', earlyFinish: '2026-01-03' },
  { id: 't2', earlyStart: '2026-01-02', earlyFinish: '2026-01-04' },
  { id: 't3', earlyStart: '2026-01-03', earlyFinish: '2026-01-05' },
];

function activity(over: Partial<ActivitySummary> & Pick<ActivitySummary, 'id'>): ActivitySummary {
  return {
    laneIndex: 0,
    type: 'TASK',
    earlyStart: null,
    earlyFinish: null,
    ...over,
  } as unknown as ActivitySummary;
}

/** The whole plan: the three tasks plus one summary spanning all of them, [0,10]. */
function plan(summaryOver: Partial<ActivitySummary> = {}): ActivitySummary[] {
  return [
    activity({ ...TASKS[0]! }),
    activity({
      id: 's1',
      type: 'WBS_SUMMARY',
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-11',
      ...summaryOver,
    }),
    activity({ ...TASKS[1]! }),
    activity({ ...TASKS[2]! }),
  ];
}

describe('computeLaneArrangement', () => {
  it('packs the band-drawn summary ABOVE the scene instead of through it', () => {
    const activities = plan();
    const sceneActivities = activities.filter((a) => a.id !== 's1');

    expect(
      computeLaneArrangement({
        activities,
        sceneActivities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual([
      // Appended at `base` = the 3 lanes the scene used, so band on it is outside the drawn extent.
      { id: 's1', laneIndex: 3 },
      { id: 't2', laneIndex: 1 },
      { id: 't3', laneIndex: 2 },
    ]);
  });

  it('is the pre-#364 single pack when the band is off', () => {
    /**
     * Band off, `deriveWbsBandSource` returns the input array **by identity**, so this is the exact
     * call the panel made before the split — asserted against the answer that packing produces,
     * which differs from the one above at every lane but `t1`'s.
     */
    const activities = plan();

    expect(
      computeLaneArrangement({
        activities,
        sceneActivities: activities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual([
      { id: 's1', laneIndex: 1 },
      { id: 't2', laneIndex: 2 },
      { id: 't3', laneIndex: 3 },
    ]);
  });

  it('keeps a summary the band does not draw in the scene block', () => {
    /**
     * The band depth-caps what it draws (`WBS_BAND_MAX_DEPTH`), so a deeper summary is an ordinary
     * bar in the diagram — which is why the split is "whatever the scene does not paint" rather
     * than "summaries". Lifting them all out unconditionally has already shipped once as a defect
     * (`wbs-band-source.ts`). Here `s2` stays in the scene and takes lane 1, below `s1`'s 4.
     */
    const activities = [
      ...plan(),
      activity({
        id: 's2',
        type: 'WBS_SUMMARY',
        earlyStart: '2026-01-01',
        earlyFinish: '2026-01-11',
      }),
    ];
    const sceneActivities = activities.filter((a) => a.id !== 's1');

    expect(
      computeLaneArrangement({
        activities,
        sceneActivities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual([
      { id: 's1', laneIndex: 4 },
      { id: 's2', laneIndex: 1 },
      { id: 't2', laneIndex: 2 },
      { id: 't3', laneIndex: 3 },
    ]);
  });

  it('emits nothing for an appended summary already sitting at its target lane', () => {
    // The batch is minimal on both sides of the split, not just the scene's — otherwise every press
    // of Arrange would rewrite every summary's lane to the value it already held.
    const activities = plan({ laneIndex: 3 });
    const sceneActivities = activities.filter((a) => a.id !== 's1');

    expect(
      computeLaneArrangement({
        activities,
        sceneActivities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual([
      { id: 't2', laneIndex: 1 },
      { id: 't3', laneIndex: 2 },
    ]);
  });

  it('moves nothing on a plan that has never been scheduled', () => {
    const activities = plan();
    expect(
      computeLaneArrangement({
        activities,
        sceneActivities: activities.filter((a) => a.id !== 's1'),
        dependencies: [],
        dataDate: null,
      }),
    ).toEqual([]);
  });
});
