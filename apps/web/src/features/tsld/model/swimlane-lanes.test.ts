import { describe, expect, it } from 'vitest';

import { projectSwimlanes } from '../render/project-swimlanes';

import { drawnDaySpan } from './drawn-span';
import {
  arrangeInSwimlanes,
  arrangeSceneOf,
  createInSwimlane,
  dropInSwimlane,
  laneRangeOf,
  moveManyInSwimlanes,
  moveWithinSwimlane,
  NO_FREE_LANE_PLURAL,
  NO_SWIMLANE_KEY,
  nudgeInSwimlane,
  type DaySpan,
  type SwimlaneEditContext,
} from './swimlane-lanes';

import { anActivity } from '@/test/activity-fixture';

const DATA_DATE = '2026-01-01';
const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;

interface Spec {
  id: string;
  start: number;
  end: number;
  swimlane: string | null;
  /** The lane stored in the activity's swimlane; absent means never placed (derived). */
  lane?: number;
}

/** Alpha, Beta and (when something is unassigned) No swimlane, built through the real projection. */
function context(specs: Spec[], extra: Partial<SwimlaneEditContext> = {}): SwimlaneEditContext {
  const activities = specs.map((s) =>
    anActivity({
      id: s.id,
      laneIndex: 0,
      visualEffectiveStart: iso(s.start),
      visualEffectiveFinish: iso(s.end),
    }),
  );
  const input = {
    swimlanes: [
      { id: 'A', name: 'Alpha' },
      { id: 'B', name: 'Beta' },
    ],
    membership: new Map(specs.map((s) => [s.id, s.swimlane] as const)),
    storedLanes: new Map(
      specs.flatMap((s) =>
        s.lane === undefined ? [] : [[s.id, { lane: s.lane, updatedAt: 1 }] as const],
      ),
    ),
  };
  const scene = projectSwimlanes(activities, input, { source: 'visual', dataDate: DATA_DATE });
  const spans = new Map<string, DaySpan>();
  for (const a of activities) {
    const span = drawnDaySpan(a, 'visual', DATA_DATE);
    if (span) spans.set(a.id, span);
  }
  return {
    scene,
    input,
    spans,
    remembered: () => undefined,
    stored: new Map(activities.map((a) => [a.id, a.laneIndex])),
    ...extra,
  };
}

// Alpha holds a1 (lane 0) and a2 (lane 1, later); Beta holds b1; n1 is unassigned.
// Display lanes: a1 0, a2 1, b1 2, n1 3.
const BASE: Spec[] = [
  { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
  { id: 'a2', start: 5, end: 8, swimlane: 'A', lane: 1 },
  { id: 'b1', start: 0, end: 3, swimlane: 'B', lane: 0 },
  { id: 'n1', start: 0, end: 3, swimlane: null, lane: 0 },
];

describe('laneRangeOf', () => {
  it('puts no edge in the way of a hand-made swimlane, "No swimlane" included', () => {
    for (const id of ['a1', 'b1', 'n1']) {
      expect(laneRangeOf(context(BASE), id)).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
    }
  });

  it('has nothing to say about a bar that is not drawn', () => {
    expect(laneRangeOf(context(BASE), 'ghost')).toBeNull();
  });
});

describe('dropInSwimlane', () => {
  it('takes the dropped lane inside the swimlane when it is free at the span', () => {
    // a1 (days 0-3) dropped on lane 1, which holds a2 (days 5-8): free.
    const move = dropInSwimlane(context(BASE), 'a1', 1);
    expect(move).toMatchObject({ kind: 'write', requested: 1 });
    if (move.kind !== 'write') return;
    expect(move.placements).toEqual([{ id: 'a1', lane: 1, from: { swimlaneId: 'A', lane: 0 } }]);
    expect(move.landed).toEqual({
      swimlane: 'Alpha',
      lane: 1,
      count: 2,
      changedSwimlane: false,
      displayLane: 1,
      how: 'asked',
    });
  });

  it('goes on to the next free lane in the direction of travel, growing the swimlane at the bottom', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
      { id: 'b1', start: 0, end: 3, swimlane: 'B', lane: 0 },
    ];
    const move = dropInSwimlane(context(specs), 'a1', 1);
    expect(move.kind).toBe('write');
    if (move.kind !== 'write') return;
    expect(move.placements).toEqual([{ id: 'a1', lane: 2, from: { swimlaneId: 'A', lane: 0 } }]);
    expect(move.landed).toMatchObject({ swimlane: 'Alpha', lane: 2, count: 3 });
  });

  it('stays when going up finds no free lane', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
    ];
    const move = dropInSwimlane(context(specs), 'a2', 0);
    expect(move).toMatchObject({ kind: 'stay', landed: { swimlane: 'Alpha', lane: 1 } });
  });

  it('files a bar in another hand-made swimlane at its remembered lane when that is free', () => {
    const move = dropInSwimlane(context(BASE, { remembered: () => 3 }), 'a1', 2);
    expect(move).toMatchObject({ kind: 'write' });
    if (move.kind !== 'write') return;
    expect(move.placements[0]).toEqual({
      id: 'a1',
      lane: 3,
      swimlaneId: 'B',
      from: { swimlaneId: 'A', lane: 0 },
    });
    expect(move.landed).toEqual({
      swimlane: 'Beta',
      lane: 3,
      count: 4,
      changedSwimlane: true,
      displayLane: 5,
      how: 'remembered',
    });
  });

  it('files it at the nearest free lane to its remembered lane when that is taken', () => {
    // b1 holds Beta lane 0 over the same days; the remembered lane is 0.
    const move = dropInSwimlane(context(BASE, { remembered: () => 0 }), 'a1', 2);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements[0]).toEqual({
      id: 'a1',
      lane: 1,
      swimlaneId: 'B',
      from: { swimlaneId: 'A', lane: 0 },
    });
  });

  it('files it at the nearest free lane to the drop when it has no remembered lane', () => {
    const move = dropInSwimlane(context(BASE), 'a1', 2);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements[0]).toEqual({
      id: 'a1',
      lane: 1,
      swimlaneId: 'B',
      from: { swimlaneId: 'A', lane: 0 },
    });
  });

  it('files a bar in no swimlane when it is dropped into "No swimlane" (swimlaneId: null)', () => {
    const move = dropInSwimlane(context(BASE), 'a1', 3);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements[0]).toEqual({
      id: 'a1',
      lane: 1,
      swimlaneId: null,
      from: { swimlaneId: 'A', lane: 0 },
    });
    expect(move.landed).toMatchObject({ swimlane: 'No swimlane', changedSwimlane: true });
  });

  it('files a bar from "No swimlane" in a swimlane when it is dropped in one', () => {
    const move = dropInSwimlane(context(BASE), 'n1', 0);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements[0]).toEqual({
      id: 'n1',
      lane: 1,
      swimlaneId: 'A',
      from: { swimlaneId: null, lane: 0 },
    });
  });

  it('moves a bar within "No swimlane", writing no swimlane', () => {
    const free = dropInSwimlane(
      context([...BASE, { id: 'n2', start: 6, end: 9, swimlane: null, lane: 1 }]),
      'n1',
      4,
    );
    if (free.kind !== 'write') throw new Error('expected a write');
    expect(free.placements).toEqual([{ id: 'n1', lane: 1, from: { swimlaneId: null, lane: 0 } }]);
    // Where the dropped lane is taken it goes on down, growing the bucket.
    const taken = dropInSwimlane(
      context([...BASE, { id: 'n2', start: 0, end: 3, swimlane: null, lane: 1 }]),
      'n1',
      4,
    );
    if (taken.kind !== 'write') throw new Error('expected a write');
    expect(taken.placements).toEqual([{ id: 'n1', lane: 2, from: { swimlaneId: null, lane: 0 } }]);
  });

  it('moves a member whose swimlane was deleted, drawn under "No swimlane", without naming a swimlane', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'z1', start: 0, end: 3, swimlane: 'gone', lane: 0 },
    ];
    const move = dropInSwimlane(context(specs), 'z1', 3);
    if (move.kind !== 'write') throw new Error('expected a write');
    // Its kept id is left alone for a restore, and an undo puts it back under none.
    expect(move.placements).toEqual([{ id: 'z1', lane: 1, from: { swimlaneId: null, lane: 0 } }]);
  });

  it('writes a deleted-swimlane member beside a move, at the lane it is drawn in', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'z1', start: 0, end: 3, swimlane: 'gone' },
      { id: 'n1', start: 0, end: 3, swimlane: null, lane: 5 },
    ];
    const ctx = context(specs);
    const move = dropInSwimlane(ctx, 'n1', 0);
    if (move.kind !== 'write') throw new Error('expected a write');
    const z = move.placements.find((p) => p.id === 'z1');
    expect(z).toEqual({ id: 'z1', lane: expect.any(Number), materialised: true });
    expect(z).not.toHaveProperty('swimlaneId');
  });

  it('never grows a swimlane by more than one lane, however far below the pointer is', () => {
    const move = dropInSwimlane(context(BASE.filter((s) => s.id !== 'n1')), 'a1', 40);
    if (move.kind !== 'write') throw new Error('expected a write');
    // Beta has one lane, so the farthest a drop may ask for is its second.
    expect(move.landed).toMatchObject({ swimlane: 'Beta', lane: 1, count: 2 });
  });

  it('says how the bar came to be where it is: asked, next free, or back in its lane', () => {
    const asked = dropInSwimlane(context(BASE), 'a1', 1);
    expect(asked.kind === 'write' && asked.landed.how).toBe('asked');
    const crowded = context([
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
    ]);
    const next = dropInSwimlane(crowded, 'a1', 1);
    expect(next.kind === 'write' && next.landed.how).toBe('next-free');
    const back = dropInSwimlane(context(BASE, { remembered: () => 3 }), 'a1', 2);
    expect(back.kind === 'write' && back.landed.how).toBe('remembered');
    const taken = dropInSwimlane(context(BASE, { remembered: () => 0 }), 'a1', 2);
    expect(taken.kind === 'write' && taken.landed.how).toBe('next-free');
    const stays = dropInSwimlane(crowded, 'a2', 0);
    expect(stays.kind === 'stay' && stays.landed.how).toBe('stays');
  });

  it('writes the swimlane’s unplaced members at their drawn lanes in the same batch (materialise on write)', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 5, end: 8, swimlane: 'A' },
      { id: 'a3', start: 0, end: 3, swimlane: 'A' },
      { id: 'b2', start: 0, end: 3, swimlane: 'B' },
    ];
    const ctx = context(specs);
    const move = dropInSwimlane(ctx, 'a1', 3);
    if (move.kind !== 'write') throw new Error('expected a write');
    const written = new Map(move.placements.map((p) => [p.id, p.lane]));
    // Alpha's two derived members are filed where they are drawn; Beta's is the target, so too.
    expect(written.get('a2')).toBe(ctx.scene.displayLanes.get('a2'));
    expect(written.get('a3')).toBe(ctx.scene.displayLanes.get('a3'));
    expect(written.has('b2')).toBe(true);
    // They are part of the batch and no part of the edit, which is how the host leaves them out of undo.
    expect(
      move.placements
        .filter((p) => p.materialised)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['a2', 'a3', 'b2']);
    expect(move.placements[0]).not.toHaveProperty('materialised');
  });

  it('never carries a swimlane-free laneIndex', () => {
    const move = dropInSwimlane(context(BASE), 'a1', 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    for (const p of move.placements) expect(Object.keys(p)).not.toContain('laneIndex');
  });
});

describe('nudgeInSwimlane', () => {
  it('refuses Alt+Up on the top lane, naming the swimlane', () => {
    expect(nudgeInSwimlane(context(BASE), 'a1', -1)).toEqual({
      kind: 'refuse',
      reason: 'Already in the top lane of Alpha.',
    });
  });

  it('says "No swimlane" for the top lane of the unassigned bucket', () => {
    expect(nudgeInSwimlane(context(BASE), 'n1', -1)).toEqual({
      kind: 'refuse',
      reason: 'Already in the top lane of No swimlane.',
    });
  });

  it('grows the swimlane when Alt+Down is pressed on its bottom lane', () => {
    const move = nudgeInSwimlane(context(BASE), 'a2', 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([{ id: 'a2', lane: 2, from: { swimlaneId: 'A', lane: 1 } }]);
    expect(move.landed).toEqual({
      swimlane: 'Alpha',
      lane: 2,
      count: 3,
      changedSwimlane: false,
      displayLane: 2,
      how: 'asked',
    });
  });

  it('never crosses into the next swimlane', () => {
    const move = nudgeInSwimlane(context(BASE), 'a2', 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements.every((p) => p.swimlaneId === undefined)).toBe(true);
  });

  it('goes past an occupied lane to the next free one', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
    ];
    const move = nudgeInSwimlane(context(specs), 'a1', 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([{ id: 'a1', lane: 2, from: { swimlaneId: 'A', lane: 0 } }]);
    expect(move.requested).toBe(1);
  });
});

describe('moveWithinSwimlane', () => {
  it('grows a swimlane by one lane at most, however far a held key aimed', () => {
    // Alpha has two lanes (0-1); a2 is on the bottom one and the key aimed five lanes on.
    const move = moveWithinSwimlane(context(BASE), 'a2', 6, 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements[0]).toMatchObject({ id: 'a2', lane: 2 });
    expect(move.landed).toMatchObject({ lane: 2, count: 3, how: 'asked' });
    expect(move.requested).toBe(2);
  });

  it('lands a bar aimed one past the last lane on a new one, growing the swimlane', () => {
    const move = moveWithinSwimlane(context(BASE), 'a1', 2, 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([{ id: 'a1', lane: 2, from: { swimlaneId: 'A', lane: 0 } }]);
    expect(move.landed).toMatchObject({ lane: 2, count: 3, displayLane: 2 });
  });

  it('does not write when the bar is aimed at the lane it is in', () => {
    expect(moveWithinSwimlane(context(BASE), 'a1', 0, 1).kind).toBe('stay');
  });
});

describe('moveManyInSwimlanes', () => {
  it('moves each bar inside its own swimlane and files none elsewhere', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'b1', start: 0, end: 3, swimlane: 'B', lane: 0 },
    ];
    const move = moveManyInSwimlanes(context(specs), ['a1', 'b1'], 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([
      { id: 'a1', lane: 1, from: { swimlaneId: 'A', lane: 0 } },
      { id: 'b1', lane: 1, from: { swimlaneId: 'B', lane: 0 } },
    ]);
  });

  it('refuses the whole set when one of them is on the top lane of its swimlane', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'b1', start: 0, end: 3, swimlane: 'B', lane: 1 },
    ];
    const move = moveManyInSwimlanes(context(specs), ['a1', 'b1'], -1);
    expect(move.kind).toBe('refuse');
    if (move.kind !== 'refuse') return;
    expect(move.reason).toContain('top lane of its swimlane');
  });

  it('lets bars that move together pass through each other’s lanes', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
    ];
    const move = moveManyInSwimlanes(context(specs), ['a1', 'a2'], 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([
      { id: 'a1', lane: 1, from: { swimlaneId: 'A', lane: 0 } },
      { id: 'a2', lane: 2, from: { swimlaneId: 'A', lane: 1 } },
    ]);
  });

  it('sends a bar whose target an unselected bar holds to the nearest free lane', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 0, end: 3, swimlane: 'A', lane: 1 },
    ];
    const move = moveManyInSwimlanes(context(specs), ['a1'], 1);
    if (move.kind !== 'write') throw new Error('expected a write');
    expect(move.placements).toEqual([{ id: 'a1', lane: 2, from: { swimlaneId: 'A', lane: 0 } }]);
  });
});

describe('the plural refusal', () => {
  it('has a plain, swimlane-aware sentence', () => {
    expect(NO_FREE_LANE_PLURAL).toBe(
      'None of the selected activities has a free lane that way in its swimlane, so none moved.',
    );
  });
});

describe('createInSwimlane', () => {
  it('files a new bar in the swimlane under the click, at the nearest free lane there', () => {
    // Display lane 2 is Beta's first lane, held by b1 over days 0-3.
    const made = createInSwimlane(context(BASE), 2, { startDay: 0, endDay: 2 });
    expect(made).toMatchObject({ swimlaneId: 'B', lane: 1 });
    expect(made?.landed.swimlane).toBe('Beta');
  });

  it('sends nothing to file for "No swimlane"', () => {
    expect(createInSwimlane(context(BASE), 3, { startDay: 20, endDay: 21 })?.swimlaneId).toBeNull();
  });

  it('takes the first free lane of the swimlane-free layout', () => {
    // Every BASE activity is stored on lane 0 and covers days 0-3; days 20-21 are free there.
    const made = createInSwimlane(context(BASE), 0, { startDay: 20, endDay: 21 });
    expect(made?.laneIndex).toBe(0);
    const taken = createInSwimlane(context(BASE), 0, { startDay: 1, endDay: 2 });
    expect(taken?.laneIndex).toBe(1);
  });

  it('files a click below the last swimlane in the last one', () => {
    expect(
      createInSwimlane(context(BASE), 40, { startDay: 20, endDay: 21 })?.swimlaneId,
    ).toBeNull();
  });
});

describe('arrangeSceneOf', () => {
  it('reads each drawn bar as a lane inside its swimlane, with the swimlanes in order', () => {
    const scene = arrangeSceneOf(context(BASE));
    expect([...scene.lanes]).toEqual([
      ['a1', 0],
      ['a2', 1],
      ['b1', 0],
      ['n1', 0],
    ]);
    expect(Object.fromEntries(scene.partition.swimlaneOf)).toEqual({
      a1: 'A',
      a2: 'A',
      b1: 'B',
      n1: NO_SWIMLANE_KEY,
    });
    expect(scene.partition.order).toEqual(['A', 'B', NO_SWIMLANE_KEY]);
  });

  it('keeps a swimlane with nothing drawn in it in the order, so it keeps its row', () => {
    const scene = arrangeSceneOf(context([{ id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 }]));
    expect(scene.partition.order).toEqual(['A', 'B']);
  });
});

describe('arrangeInSwimlanes', () => {
  it('writes only the bars whose lane inside their swimlane changed, from where they were', () => {
    const placements = arrangeInSwimlanes(
      context(BASE),
      new Map([
        ['a1', 0],
        ['a2', 0],
        ['b1', 0],
      ]),
    );
    expect(placements).toEqual([{ id: 'a2', lane: 0, from: { swimlaneId: 'A', lane: 1 } }]);
  });

  it('never names a swimlane, so no bar changes swimlane', () => {
    const placements = arrangeInSwimlanes(
      context(BASE),
      new Map([
        ['a1', 1],
        ['a2', 0],
        ['b1', 1],
        ['n1', 1],
      ]),
    );
    expect(placements.length).toBeGreaterThan(0);
    for (const p of placements) expect(p).not.toHaveProperty('swimlaneId');
  });

  it('writes the unplaced members of a swimlane it touched, at the lane they are drawn in', () => {
    const specs: Spec[] = [
      { id: 'a1', start: 0, end: 3, swimlane: 'A', lane: 0 },
      { id: 'a2', start: 5, end: 8, swimlane: 'A' },
      { id: 'b1', start: 0, end: 3, swimlane: 'B' },
    ];
    const ctx = context(specs);
    const placements = arrangeInSwimlanes(
      ctx,
      new Map([
        ['a1', 1],
        ['a2', 0],
        ['b1', 0],
      ]),
    );
    // a1 moved; a2 is drawn at its derived lane (0, free beside a1 once a1 has gone) and is written
    // there too, in the same batch. b1 is in a swimlane nothing moved in, so it stays unplaced.
    expect(placements.map((p) => p.id).sort()).toEqual(['a1', 'a2']);
    expect(placements.find((p) => p.id === 'a2')).toEqual({
      id: 'a2',
      lane: 0,
      materialised: true,
    });
  });

  it('writes nothing when the answer is the layout already drawn', () => {
    const ctx = context(BASE);
    expect(arrangeInSwimlanes(ctx, arrangeSceneOf(ctx).lanes)).toEqual([]);
  });
});
