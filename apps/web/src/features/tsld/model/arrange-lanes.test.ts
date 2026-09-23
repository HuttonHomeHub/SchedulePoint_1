import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  arrangeOfferMessage,
  computeLaneArrangement,
  summariseLaneArrangement,
} from './arrange-lanes';

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
  // An UNPLACED bar is drawn at its early dates: the engine's effective-Visual pass writes them
  // there (`lib/bar-dates.ts`). The effective dates default to the early ones so a fixture that
  // names only `earlyStart` describes a state the engine can produce, and a placed bar overrides
  // them explicitly.
  return {
    laneIndex: 0,
    type: 'TASK',
    earlyStart: null,
    earlyFinish: null,
    visualEffectiveStart: over.earlyStart ?? null,
    visualEffectiveFinish: over.earlyFinish ?? null,
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

describe('summariseLaneArrangement', () => {
  it('counts rows over what the SCENE paints, not over the plan', () => {
    /**
     * Band on, `#364` appends the band-drawn summary ABOVE the scene's range — so the plan's max
     * lane is 3 and the **drawn extent** is 3 rows, not 4. `worldExtent` reads the activities the
     * canvas is given (`sceneActivities`), and the strip's sentence has to be true of the picture
     * the reader is looking at.
     *
     * **Verified red** against counting over `input.activities`: that reports `arrangedRows: 4`,
     * i.e. it promises a planner a row the diagram will not draw.
     */
    const activities = plan();
    const sceneActivities = activities.filter((a) => a.id !== 's1');

    expect(
      summariseLaneArrangement({
        activities,
        sceneActivities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual({
      changes: [
        { id: 's1', laneIndex: 3 },
        { id: 't2', laneIndex: 1 },
        { id: 't3', laneIndex: 2 },
      ],
      currentRows: 1,
      arrangedRows: 3,
    });
  });

  it('counts a row an activity holds without moving, and one the packer never touched', () => {
    /**
     * Two ways a row survives a press, and a summary that only counted MOVED rows would miss both:
     * `t1` is already in lane 0 so it is absent from `changes`, and `u1` has no dates so it is
     * never packed at all (`computeLaneArrangement`'s undated rule) and keeps lane 7 — which is
     * what the canvas draws, so it is what the count has to say.
     */
    const activities = [
      activity({ ...TASKS[0]! }),
      activity({ ...TASKS[1]!, laneIndex: 5 }),
      activity({ id: 'u1', laneIndex: 7 }),
    ];

    expect(
      summariseLaneArrangement({
        activities,
        sceneActivities: activities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual({
      changes: [{ id: 't2', laneIndex: 1 }],
      currentRows: 8,
      arrangedRows: 8,
    });
  });

  it('reports the same rows either side when there is nothing to move', () => {
    // The dock's offer is shown on `changes.length > 0`, so this is the state in which it must not
    // appear — and a summary that reported a saving here would put a strip on every tidy plan.
    const activities = [activity({ ...TASKS[0]! }), activity({ ...TASKS[1]!, laneIndex: 1 })];

    expect(
      summariseLaneArrangement({
        activities,
        sceneActivities: activities,
        dependencies: [],
        dataDate: DATA_DATE,
      }),
    ).toEqual({ changes: [], currentRows: 2, arrangedRows: 2 });
  });

  it('reports no rows at all for a plan that has never been scheduled', () => {
    // `dataDate: null` short-circuits the arrangement, and a zero row count is the honest answer
    // for a scene with nothing in it rather than a `-Infinity` from an empty max.
    expect(
      summariseLaneArrangement({
        activities: [],
        sceneActivities: [],
        dependencies: [],
        dataDate: null,
      }),
    ).toEqual({ changes: [], currentRows: 0, arrangedRows: 0 });
  });
});

describe('arrangeOfferMessage', () => {
  const summary = (over: Partial<Parameters<typeof arrangeOfferMessage>[0]>) =>
    arrangeOfferMessage({ changes: [], currentRows: 0, arrangedRows: 0, ...over });

  it('states the saving when the diagram gets shorter', () => {
    expect(
      summary({ changes: [{ id: 'a', laneIndex: 0 }], currentRows: 14, arrangedRows: 9 }),
    ).toBe('Arrange would move 1 activity and draw this plan in 9 rows instead of 14.');
  });

  it('states the COST when the diagram gets taller, which a press legitimately can', () => {
    /**
     * `packLanes` refuses same-lane time overlap, so a layout that overlaps needs more rows to be
     * drawn correctly — measured 32 → 41 on a 500-bar synthetic scene. An offer that only ever
     * promised a saving would be a false statement on exactly the plans that most need the press.
     */
    expect(
      summary({
        changes: [
          { id: 'a', laneIndex: 0 },
          { id: 'b', laneIndex: 1 },
        ],
        currentRows: 32,
        arrangedRows: 41,
      }),
    ).toBe('Arrange would move 2 activities and draw this plan in 41 rows instead of 32.');
  });

  it('pluralises the row count, because a one-row plan is reachable', () => {
    // Pack two sequential bars out of lanes 0 and 5 and the whole diagram is one row. "1 rows"
    // is the kind of sentence a reader reads as a defect in the thing that wrote it.
    expect(summary({ changes: [{ id: 'a', laneIndex: 0 }], currentRows: 6, arrangedRows: 1 })).toBe(
      'Arrange would move 1 activity and draw this plan in 1 row instead of 6.',
    );
  });

  it('names the MECHANISM when the row count does not change, because the rows are not the news', () => {
    /**
     * "9 rows instead of 9" reads as a defect in the thing that wrote it, and "the same 9 rows" —
     * the first version of this branch — reads as "nothing visible happens, so why press it". Both
     * are wrong about the same plan: the press still repacks every lane by time and prefers a lane
     * already holding a predecessor, which is the whole of what Part C measures. So the second
     * clause states the mechanism, which is guaranteed, rather than an outcome per link, which the
     * predecessor hint only prefers among lanes that are already free.
     */
    expect(
      summary({
        changes: [
          { id: 'a', laneIndex: 0 },
          { id: 'b', laneIndex: 1 },
        ],
        currentRows: 9,
        arrangedRows: 9,
      }),
    ).toBe(
      'Arrange would move 2 activities to pack them by time and logic, still drawing this plan in 9 rows.',
    );
  });
});

/**
 * **Arrange packs the span the canvas DRAWS, not the early span** (reported 2026-09-23).
 *
 * The product owner pressed Arrange on a three-activity chain and two bars were drawn on top of
 * each other. Since ADR-0148 the canvas draws a bar at its effective-Visual dates
 * (`barDatesFor(a, 'visual')`), and a bar hand-placed earlier than its logic allows is drawn at
 * that placement — while Arrange packed `earlyStart`/`earlyFinish`, where the same two bars do not
 * touch. So Arrange judged one picture and the canvas painted another.
 *
 * The fixture is that shape exactly: `b` follows `a` by logic, so their EARLY spans are disjoint
 * and a pack on them leaves both in lane 0; `b` is placed five days into `a`, so their DRAWN spans
 * overlap and they must not share a row.
 */
describe('computeLaneArrangement — packs the drawn span', () => {
  it('separates a bar placed before its predecessor finishes, though their early spans are disjoint', () => {
    const a = activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-10' });
    const b = activity({
      id: 'b',
      earlyStart: '2026-01-11',
      earlyFinish: '2026-01-20',
      visualEffectiveStart: '2026-01-06',
      visualEffectiveFinish: '2026-01-15',
    });
    const changes = computeLaneArrangement({
      activities: [a, b],
      sceneActivities: [a, b],
      dependencies: [],
      dataDate: DATA_DATE,
    });
    const lane = (id: string): number => changes.find((c) => c.id === id)?.laneIndex ?? 0;
    expect(lane('a')).not.toBe(lane('b'));
  });

  it('leaves an unplaced chain in one row, because its drawn spans are its early spans', () => {
    // The control: without it, "never share a row" would pass the case above too.
    const a = activity({ id: 'a', earlyStart: '2026-01-01', earlyFinish: '2026-01-10' });
    const b = activity({ id: 'b', earlyStart: '2026-01-11', earlyFinish: '2026-01-20' });
    const changes = computeLaneArrangement({
      activities: [a, b],
      sceneActivities: [a, b],
      dependencies: [],
      dataDate: DATA_DATE,
    });
    expect(changes).toEqual([]);
  });
});
