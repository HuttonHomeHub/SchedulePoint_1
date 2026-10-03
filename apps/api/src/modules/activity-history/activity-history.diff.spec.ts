import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  MAX_KEYED_ITEMS_PER_ENTRY,
  MERGE_MAX_SPAN_MS,
  MERGE_QUIET_GAP_MS,
} from './activity-history.constants';
import {
  assignmentChange,
  assignmentItem,
  assignmentKey,
  assignmentState,
  changedReferenceIds,
  diffActivity,
  hasNonCostChange,
  isLaneOnly,
  isNetZero,
  linkItem,
  linkKey,
  linkState,
  mergeChanges,
  planRecord,
  type ActivityRecordedRow,
  type IncomingWrite,
  type ReferenceNames,
} from './activity-history.diff';
import type { LatestEntry, StoredChanges } from './activity-history.types';

const NO_NAMES: ReferenceNames = { calendars: new Map(), parents: new Map() };

function row(over: Partial<ActivityRecordedRow> = {}): ActivityRecordedRow {
  return {
    name: 'Excavate',
    code: '1010',
    description: null,
    type: 'TASK',
    durationMinutes: 4800,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    externalEarlyStart: null,
    externalLateFinish: null,
    expectedFinish: null,
    scheduleAsLateAsPossible: false,
    calendarId: null,
    levelingPriority: null,
    visualStart: null,
    laneIndex: 0,
    parentId: null,
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    physicalPercentComplete: null,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    ...over,
  };
}

const OTHER = { id: 'a-1', code: '1020', name: 'Steel erection' };
const FS = { type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' } as const;

describe('diffActivity', () => {
  it('records nothing when nothing recorded changed', () => {
    expect(diffActivity(row(), row(), NO_NAMES)).toEqual({});
  });

  it('records a changed duration with both sides', () => {
    expect(diffActivity(row(), row({ durationMinutes: 7200 }), NO_NAMES)).toEqual({
      durationMinutes: { from: 4800, to: 7200 },
    });
  });

  it('records a date by day and an external date by instant', () => {
    const changes = diffActivity(
      row(),
      row({
        constraintDate: new Date('2026-03-04T00:00:00.000Z'),
        externalEarlyStart: new Date('2026-03-04T09:30:00.000Z'),
      }),
      NO_NAMES,
    );
    expect(changes.constraintDate).toEqual({ from: null, to: '2026-03-04' });
    expect(changes.externalEarlyStart).toEqual({ from: null, to: '2026-03-04T09:30:00.000Z' });
  });

  it('treats a time-of-day-only change to an external date as a real change', () => {
    const a = row({ externalEarlyStart: new Date('2026-03-04T00:00:00.000Z') });
    const b = row({ externalEarlyStart: new Date('2026-03-04T09:30:00.000Z') });
    expect(Object.keys(diffActivity(a, b, NO_NAMES))).toEqual(['externalEarlyStart']);
  });

  it('records money as a number, converting the BIGINT', () => {
    expect(diffActivity(row(), row({ budgetedExpense: 125_000n }), NO_NAMES)).toEqual({
      budgetedExpense: { from: null, to: 125_000 },
    });
  });

  it('stores a description as length and digest, never the text', () => {
    const changes = diffActivity(row(), row({ description: 'secret text' }), NO_NAMES);
    const item = changes.description as { from: unknown; to: { len: number; h: string } };
    expect(item.from).toBeNull();
    expect(item.to.len).toBe(11);
    expect(item.to.h).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(changes)).not.toContain('secret');
  });

  it('names a changed reference as it is named now', () => {
    const names: ReferenceNames = {
      calendars: new Map([['cal-2', '24/7 crew']]),
      parents: new Map(),
    };
    expect(diffActivity(row(), row({ calendarId: 'cal-2' }), names).calendarId).toEqual({
      from: null,
      to: { id: 'cal-2', name: '24/7 crew' },
    });
  });

  it('reads only the references that changed', () => {
    expect(changedReferenceIds(row({ calendarId: 'c1' }), row({ calendarId: 'c1' }))).toEqual({
      calendarIds: [],
      parentIds: [],
    });
    expect(changedReferenceIds(row({ parentId: 'p1' }), row({ parentId: null }))).toEqual({
      calendarIds: [],
      parentIds: ['p1'],
    });
  });

  it('reports a lane change, which planRecord then declines to start an entry for (CQ-4)', () => {
    const lane = diffActivity(row(), row({ laneIndex: 3 }), NO_NAMES);
    expect(lane).toEqual({ laneIndex: { from: 0, to: 3 } });
    expect(isLaneOnly(lane)).toBe(true);
    expect(
      diffActivity(row(), row({ laneIndex: 3, visualStart: new Date('2026-03-04') }), NO_NAMES),
    ).toMatchObject({ laneIndex: { from: 0, to: 3 }, visualStart: { to: '2026-03-04' } });
  });
});

describe('isNetZero', () => {
  it('compares a reference by id, never by the name stored beside it', () => {
    expect(
      isNetZero('calendarId', {
        from: { id: 'c', name: 'Old name' },
        to: { id: 'c', name: 'New name' },
      }),
    ).toBe(true);
    expect(
      isNetZero('calendarId', { from: { id: 'c', name: 'x' }, to: { id: 'd', name: 'x' } }),
    ).toBe(false);
  });

  it('compares a description by length and digest', () => {
    const d = { len: 3, h: 'a'.repeat(16) };
    expect(isNetZero('description', { from: d, to: { ...d } })).toBe(true);
    expect(isNetZero('description', { from: d, to: { len: 3, h: 'b'.repeat(16) } })).toBe(false);
  });

  it('calls a link added then removed net-zero, and a link whose lag changed back net-zero', () => {
    expect(isNetZero(linkKey('l'), linkItem('IN', OTHER, null, null))).toBe(true);
    expect(isNetZero(linkKey('l'), linkItem('IN', OTHER, linkState(FS), linkState(FS)))).toBe(true);
    expect(
      isNetZero(
        linkKey('l'),
        linkItem('IN', OTHER, linkState(FS), linkState({ ...FS, lagMinutes: 5 })),
      ),
    ).toBe(false);
  });
});

describe('assignment state', () => {
  const base = {
    budgetedUnits: new Prisma.Decimal('40'),
    unitsPerHour: null,
    actualUnits: new Prisma.Decimal('0'),
    isDriving: true,
    curveType: 'UNIFORM',
    lagMinutes: 0,
    budgetedCost: null,
    actualCost: 0n,
  } as const;
  const resource = { id: 'r-1', code: 'CR600', name: 'Tower crane' };

  it('encodes the decimals as canonical fixed-4 strings taken from the row', () => {
    expect(assignmentState(base)).toMatchObject({
      budgetedUnits: '40.0000',
      unitsPerHour: null,
      actualUnits: '0.0000',
      actualCost: 0,
      budgetedCost: null,
    });
    // 14 integer digits and four decimals exceed 2^53 as a JSON number; the string keeps them.
    expect(
      assignmentState({ ...base, budgetedUnits: new Prisma.Decimal('12345678901234.5678') })
        .budgetedUnits,
    ).toBe('12345678901234.5678');
  });

  it('reports no change when only an unrecorded column differs', () => {
    const state = assignmentState(base);
    expect(assignmentChange(resource, state, assignmentState(base))).toBeUndefined();
  });

  it('reports a change when a unit is the only difference', () => {
    const after = assignmentState({ ...base, budgetedUnits: new Prisma.Decimal('42.5') });
    expect(assignmentChange(resource, assignmentState(base), after)).toMatchObject({
      to: { budgetedUnits: '42.5000' },
    });
  });
});

describe('mergeChanges', () => {
  it('keeps the original from and takes the latest to', () => {
    const merged = mergeChanges(
      { durationMinutes: { from: 4800, to: 6000 } },
      { durationMinutes: { from: 6000, to: 7200 } },
    );
    expect(merged).toEqual({ durationMinutes: { from: 4800, to: 7200 } });
  });

  it('adds an item touched for the first time', () => {
    const merged = mergeChanges(
      { durationMinutes: { from: 1, to: 2 } },
      { name: { from: 'a', to: 'b' } },
    );
    expect(Object.keys(merged).sort()).toEqual(['durationMinutes', 'name']);
  });

  it('drops an item that returned to where it started (the undo)', () => {
    expect(
      mergeChanges(
        { durationMinutes: { from: 4800, to: 7200 } },
        { durationMinutes: { from: 7200, to: 4800 } },
      ),
    ).toEqual({});
  });

  it('drops a link added then removed, and a description typed then typed back', () => {
    const d = { len: 3, h: 'a'.repeat(16) };
    const merged = mergeChanges(
      {
        [linkKey('l')]: linkItem('IN', OTHER, null, linkState(FS)),
        description: { from: d, to: { len: 4, h: 'b'.repeat(16) } },
      },
      {
        [linkKey('l')]: linkItem('IN', OTHER, linkState(FS), null),
        description: { from: { len: 4, h: 'b'.repeat(16) }, to: d },
      },
    );
    expect(merged).toEqual({});
  });

  it('keeps add-then-adjust-lag as one added item with the final lag', () => {
    const merged = mergeChanges(
      { [linkKey('l')]: linkItem('IN', OTHER, null, linkState(FS)) },
      {
        [linkKey('l')]: linkItem('IN', OTHER, linkState(FS), linkState({ ...FS, lagMinutes: 960 })),
      },
    );
    expect(merged[linkKey('l')]).toMatchObject({ from: null, to: { lagMinutes: 960 } });
  });

  it('refreshes the descriptor to the other end as named at the latest edit', () => {
    const merged = mergeChanges(
      { [linkKey('l')]: linkItem('IN', OTHER, linkState(FS), linkState({ ...FS, lagMinutes: 1 })) },
      {
        [linkKey('l')]: linkItem(
          'IN',
          { ...OTHER, name: 'Steel erection (renamed)' },
          linkState({ ...FS, lagMinutes: 1 }),
          linkState({ ...FS, lagMinutes: 2 }),
        ),
      },
    );
    expect(merged[linkKey('l')]).toMatchObject({ other: { name: 'Steel erection (renamed)' } });
  });

  it('calls an assignment whose units changed and changed back net-zero', () => {
    const resource = { id: 'r', code: null, name: 'Crane' };
    const a = assignmentState({
      budgetedUnits: new Prisma.Decimal(40),
      unitsPerHour: null,
      actualUnits: new Prisma.Decimal(0),
      isDriving: false,
      curveType: 'UNIFORM',
      lagMinutes: 0,
      budgetedCost: null,
      actualCost: 0n,
    });
    const b = { ...a, budgetedUnits: '50.0000' };
    expect(
      mergeChanges(
        { [assignmentKey('x')]: assignmentItem(resource, a, b) },
        { [assignmentKey('x')]: assignmentItem(resource, b, a) },
      ),
    ).toEqual({});
  });
});

describe('hasNonCostChange', () => {
  const resource = { id: 'r', code: null, name: 'Crane' };
  const state = (budgetedCost: number | null) => ({
    budgetedUnits: '1.0000',
    unitsPerHour: null,
    actualUnits: '0.0000',
    isDriving: false,
    curveType: 'UNIFORM' as const,
    lagMinutes: 0,
    budgetedCost,
    actualCost: 0,
  });

  it('is false for a monetary field alone and true when anything else rides with it', () => {
    expect(hasNonCostChange({ budgetedExpense: { from: 1, to: 2 } })).toBe(false);
    expect(
      hasNonCostChange({ budgetedExpense: { from: 1, to: 2 }, name: { from: 'a', to: 'b' } }),
    ).toBe(true);
  });

  it('is false for an assignment whose only difference is money, true for an add or a remove', () => {
    expect(
      hasNonCostChange({ [assignmentKey('x')]: assignmentItem(resource, state(1), state(2)) }),
    ).toBe(false);
    expect(
      hasNonCostChange({ [assignmentKey('x')]: assignmentItem(resource, null, state(2)) }),
    ).toBe(true);
  });

  it('is true for a link', () => {
    expect(hasNonCostChange({ [linkKey('l')]: linkItem('IN', OTHER, null, linkState(FS)) })).toBe(
      true,
    );
  });
});

describe('planRecord', () => {
  const NOW = new Date('2026-10-03T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const changes = (to: number): StoredChanges => ({ durationMinutes: { from: 1, to } });
  const latest = (over: Partial<LatestEntry> = {}): LatestEntry => ({
    id: 'e-1',
    actorUserId: 'u-1',
    scope: 'DEFINITION',
    firstRecordedAt: ago(20_000),
    lastRecordedAt: ago(10_000),
    editCount: 1,
    batchId: null,
    changes: changes(5),
    ...over,
  });
  const write = (over: Partial<IncomingWrite> = {}): IncomingWrite => ({
    actorUserId: 'u-1',
    scope: 'DEFINITION',
    isBatch: false,
    changes: { durationMinutes: { from: 5, to: 9 } },
    ...over,
  });

  it('does nothing for a write with no items', () => {
    expect(planRecord(latest(), write({ changes: {} }), NOW)).toEqual({ action: 'none' });
  });

  it('inserts when there is no entry yet', () => {
    expect(planRecord(null, write(), NOW)).toMatchObject({
      action: 'insert',
      firstRecordedAt: NOW,
    });
  });

  it('merges the same person, same scope, inside the window', () => {
    expect(planRecord(latest(), write(), NOW)).toMatchObject({
      action: 'merge',
      entryId: 'e-1',
      changes: { durationMinutes: { from: 1, to: 9 } },
      lastRecordedAt: NOW,
    });
  });

  it.each<[string, Partial<LatestEntry>, Partial<IncomingWrite>]>([
    ['a different person', { actorUserId: 'u-2' }, {}],
    ['a different scope', { scope: 'PROGRESS' }, {}],
    ['a quiet gap over 60 s', { lastRecordedAt: ago(MERGE_QUIET_GAP_MS + 1) }, {}],
    ['a span over 10 minutes', { firstRecordedAt: ago(MERGE_MAX_SPAN_MS + 1) }, {}],
    ['a batch latest entry', { batchId: 'b-1' }, {}],
    ['a batch write', {}, { isBatch: true }],
  ])('does not merge across %s', (_label, latestOver, writeOver) => {
    expect(planRecord(latest(latestOver), write(writeOver), NOW).action).toBe('insert');
  });

  it('merges exactly at the 60 s and 10 minute boundaries (inclusive)', () => {
    expect(
      planRecord(
        latest({
          lastRecordedAt: ago(MERGE_QUIET_GAP_MS),
          firstRecordedAt: ago(MERGE_MAX_SPAN_MS),
        }),
        write(),
        NOW,
      ).action,
    ).toBe('merge');
  });

  it('does not merge past a colleague: the latest entry is theirs, so mine inserts after it', () => {
    // The lookup is "latest for this activity, whoever made it"; mine is behind theirs and so is
    // never offered — the plan sees only theirs and refuses the merge on the actor.
    const theirs = latest({ actorUserId: 'u-2' });
    expect(planRecord(theirs, write(), NOW)).toMatchObject({
      action: 'insert',
      firstRecordedAt: NOW,
    });
  });

  it('never starts an entry for a lane-only save (CQ-4)', () => {
    expect(planRecord(null, write({ changes: { laneIndex: { from: 0, to: 1 } } }), NOW)).toEqual({
      action: 'none',
    });
    // …nor when the latest entry is joinable but holds no lane item yet.
    expect(
      planRecord(latest(), write({ changes: { laneIndex: { from: 0, to: 1 } } }), NOW),
    ).toEqual({ action: 'none' });
  });

  it('joins a lane-only save to an entry that already holds a lane, so the lane going back cancels', () => {
    const withLane = latest({
      changes: { visualStart: { from: null, to: '2026-03-04' }, laneIndex: { from: 0, to: 1 } },
    });
    // The lane moves on: 1 → 2 keeps the original from.
    expect(
      planRecord(withLane, write({ changes: { laneIndex: { from: 1, to: 2 } } }), NOW),
    ).toMatchObject({ action: 'merge', changes: { laneIndex: { from: 0, to: 2 } } });
    // The lane goes back to where it started: the lane item disappears, the placement stays.
    expect(
      planRecord(withLane, write({ changes: { laneIndex: { from: 1, to: 0 } } }), NOW),
    ).toMatchObject({ action: 'merge', changes: { visualStart: { to: '2026-03-04' } } });
    const merged = planRecord(withLane, write({ changes: { laneIndex: { from: 1, to: 0 } } }), NOW);
    expect(merged.action === 'merge' && 'laneIndex' in merged.changes).toBe(false);
  });

  it('drops the entry when the merge cancels out (the undo inside the window)', () => {
    expect(
      planRecord(
        latest({ changes: changes(5) }),
        write({ changes: { durationMinutes: { from: 5, to: 1 } } }),
        NOW,
      ),
    ).toEqual({ action: 'drop', entryId: 'e-1' });
  });

  it('keeps times strictly increasing when the clock reads at or before the latest entry', () => {
    const behind = latest({ actorUserId: 'u-2', lastRecordedAt: new Date(NOW.getTime() + 5) });
    expect(planRecord(behind, write(), NOW)).toMatchObject({
      action: 'insert',
      firstRecordedAt: new Date(NOW.getTime() + 6),
    });
  });

  it('never moves last_recorded_at backwards on a merge', () => {
    const ahead = latest({ lastRecordedAt: new Date(NOW.getTime() + 5) });
    expect(planRecord(ahead, write(), NOW)).toMatchObject({
      action: 'merge',
      lastRecordedAt: new Date(NOW.getTime() + 5),
    });
  });

  it('declines a merge that would take the entry past the keyed-item cap and inserts instead', () => {
    const items: StoredChanges = {};
    for (let i = 0; i < MAX_KEYED_ITEMS_PER_ENTRY; i += 1) {
      items[linkKey(`l${i}`)] = linkItem('IN', OTHER, null, linkState(FS));
    }
    const full = latest({ scope: 'LOGIC', changes: items });
    const next: IncomingWrite = {
      ...write({ scope: 'LOGIC' }),
      changes: { [linkKey('new')]: linkItem('OUT', OTHER, null, linkState(FS)) },
    };
    expect(planRecord(full, next, NOW).action).toBe('insert');
  });
});
