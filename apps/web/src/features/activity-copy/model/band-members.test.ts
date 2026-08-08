import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { bandMembers } from './band-members';

/**
 * The band set (`docs/specs/activity-copy-paste/` M2-T1).
 *
 * The test that earns its place is **the dangling parent**. A naive `parentId` walk treats an id
 * pointing at a row that is not in the list as a real parent, so the activity is neither unfiled nor
 * reachable — it silently vanishes from the copy. `deriveWbsGroups` already resolves that case, and
 * building on it is the whole reason this module is four lines of closure rather than its own walk.
 */
function activity(over: Partial<ActivitySummary> & { id: string }): ActivitySummary {
  return {
    planId: 'p1',
    name: over.id,
    code: null,
    description: null,
    type: 'TASK',
    durationDays: 1,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-06',
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

//  root ─┬─ mid ─┬─ leaf1
//        │       └─ leaf2
//        └─ sibling
//  outside (not in the band)
const PLAN = [
  activity({ id: 'root', type: 'WBS_SUMMARY' }),
  activity({ id: 'mid', type: 'WBS_SUMMARY', parentId: 'root' }),
  activity({ id: 'leaf1', parentId: 'mid' }),
  activity({ id: 'leaf2', parentId: 'mid' }),
  activity({ id: 'sibling', parentId: 'root' }),
  activity({ id: 'outside' }),
];

describe('bandMembers', () => {
  it('takes the summary and its WHOLE subtree, not just direct children', () => {
    const ids = bandMembers(PLAN, 'root').map((a) => a.id);
    expect(new Set(ids)).toEqual(new Set(['root', 'mid', 'leaf1', 'leaf2', 'sibling']));
    expect(ids).not.toContain('outside');
  });

  it('puts the summary first and every parent before its children', () => {
    const ids = bandMembers(PLAN, 'root').map((a) => a.id);
    expect(ids[0]).toBe('root');
    expect(ids.indexOf('mid')).toBeLessThan(ids.indexOf('leaf1'));
    expect(ids.indexOf('mid')).toBeLessThan(ids.indexOf('leaf2'));
  });

  it('takes a nested band when asked for the inner summary', () => {
    const ids = bandMembers(PLAN, 'mid').map((a) => a.id);
    expect(new Set(ids)).toEqual(new Set(['mid', 'leaf1', 'leaf2']));
  });

  it('returns nothing for a non-summary or an unknown id', () => {
    expect(bandMembers(PLAN, 'leaf1')).toEqual([]);
    expect(bandMembers(PLAN, 'nope')).toEqual([]);
  });

  it('returns the summary alone for an empty band', () => {
    const plan = [activity({ id: 'empty', type: 'WBS_SUMMARY' })];
    expect(bandMembers(plan, 'empty').map((a) => a.id)).toEqual(['empty']);
  });

  it('does not lose an activity whose parent id dangles', () => {
    // `ghost` is not in the list. A naive walk treats `orphan` as a child of something absent, so it
    // is neither unfiled nor reachable and silently drops out of every copy. `deriveWbsGroups`
    // resolves it as unfiled — so it is correctly OUTSIDE the band rather than nowhere.
    const plan = [
      activity({ id: 'root', type: 'WBS_SUMMARY' }),
      activity({ id: 'kept', parentId: 'root' }),
      activity({ id: 'orphan', parentId: 'ghost' }),
    ];
    const ids = bandMembers(plan, 'root').map((a) => a.id);
    expect(ids).toEqual(['root', 'kept']);
    expect(ids).not.toContain('orphan');
  });
});
