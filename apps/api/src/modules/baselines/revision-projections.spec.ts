import { describe, expect, it } from 'vitest';

import {
  frozenGhostSwimlanes,
  frozenRevisionSide,
  liveRevisionSide,
  type FrozenRevisionRowInput,
  type LiveRevisionRowInput,
} from './revision-projections';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

// A bar the engine left at 5-9 Jan whose placement moved it to 12-16 Jan: the network dates and the
// placed dates differ, so the dates a projection reads are visible in the output.
const frozen: FrozenRevisionRowInput = {
  sourceActivityId: 'a',
  code: 'A10',
  name: 'Slab',
  type: 'TASK',
  durationMinutes: 480,
  isCritical: false,
  totalFloat: 0,
  totalFloatMinutes: 0,
  placedStart: day('2026-01-12'),
  placedFinish: day('2026-01-16'),
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  swimlaneId: null,
};

const live: LiveRevisionRowInput = {
  id: 'a',
  code: 'A10',
  name: 'Slab',
  type: 'TASK',
  durationMinutes: 480,
  isCritical: false,
  totalFloat: 0,
  totalFloatMinutes: 0,
  earlyStart: day('2026-01-05'),
  earlyFinish: day('2026-01-09'),
  visualEffectiveStart: day('2026-01-19'),
  visualEffectiveFinish: day('2026-01-23'),
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
};

describe('the revision projections read the placed dates', () => {
  it('reads placed dates on the frozen side and the effective-visual span on the live side', () => {
    const [f] = frozenRevisionSide([frozen]);
    const [l] = liveRevisionSide([live]);
    expect([f!.earlyStart, f!.earlyFinish]).toEqual(['2026-01-12', '2026-01-16']);
    expect([l!.earlyStart, l!.earlyFinish]).toEqual(['2026-01-19', '2026-01-23']);
  });
});

describe('both projections carry the float minutes verbatim (#318)', () => {
  it('copies minutes, and a float never calculated stays NULL on both columns', () => {
    const [f] = frozenRevisionSide([{ ...frozen, totalFloat: 5, totalFloatMinutes: 2400 }]);
    const [l] = liveRevisionSide([{ ...live, totalFloat: null, totalFloatMinutes: null }]);
    expect([f!.totalFloatDays, f!.totalFloatMinutes]).toEqual([5, 2400]);
    expect([l!.totalFloatDays, l!.totalFloatMinutes]).toEqual([null, null]);
  });
});

describe('frozenGhostSwimlanes', () => {
  const lane = {
    sourceActivityId: 'a',
    basis: 'SWIMLANE' as const,
    swimlaneId: 'lane-1',
    summaryActivityId: null,
    wbsLevel: null,
    laneIndex: 4,
    laneUpdatedAt: new Date('2026-01-05T10:00:00.000Z'),
  };

  it('carries every lane row of an activity, choosing none', () => {
    const second = { ...lane, basis: 'NO_SWIMLANE' as const, swimlaneId: null, laneIndex: 0 };
    const facts = frozenGhostSwimlanes([{ ...frozen, swimlaneId: 'lane-1' }], [lane, second]);
    expect(facts?.get('a')).toEqual({
      swimlaneId: 'lane-1',
      lanes: [
        expect.objectContaining({ basis: 'SWIMLANE', laneIndex: 4 }),
        expect.objectContaining({ basis: 'NO_SWIMLANE', laneIndex: 0 }),
      ],
    });
    expect(facts?.get('a')?.lanes[0]?.laneUpdatedAt).toBe('2026-01-05T10:00:00.000Z');
  });

  it('carries the code placements only when the caller passes them, and nulls for a row with none', () => {
    const withCodes = frozenGhostSwimlanes([frozen, { ...frozen, sourceActivityId: 'b' }], [], {
      typeId: 'area',
      placements: [{ sourceActivityId: 'a', codeValueId: 'roof', codeLaneIndex: 2 }],
    });
    expect(withCodes?.get('a')?.code).toEqual({ typeId: 'area', valueId: 'roof', laneIndex: 2 });
    expect(withCodes?.get('b')?.code).toEqual({ typeId: 'area', valueId: null, laneIndex: null });
    expect(frozenGhostSwimlanes([frozen], [])?.get('a')).not.toHaveProperty('code');
  });

  it('gives an activity that froze no lane row an empty list, not an absent entry', () => {
    // "Recorded nothing for this activity" must stay distinct from "the baseline recorded none".
    const facts = frozenGhostSwimlanes([frozen], []);
    expect(facts?.get('a')).toEqual({ swimlaneId: null, lanes: [] });
  });
});
