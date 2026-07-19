import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityDefinitionInput,
  relaneCommand,
  repositionCommand,
  updateCommand,
  type RepositionLaneFn,
  type UpdateActivityFn,
} from './commands';

/** A full activity row; overrides pick out the fields a given test cares about. */
function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'pl1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 5,
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
    suspendDate: null,
    resumeDate: null,
    earlyStart: null,
    earlyFinish: null,
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
    ...overrides,
  };
}

/**
 * A fake `useUpdateActivity().mutateAsync` that echoes the patched activity with a bumped version,
 * so a command threading the response version can be asserted call-by-call.
 */
function fakeUpdate() {
  let next = 100;
  return vi.fn((input: Parameters<UpdateActivityFn>[0]) =>
    Promise.resolve(activity({ id: input.activityId, version: (next += 1) })),
  );
}

function fakeRepositionLane() {
  let next = 200;
  return vi.fn((input: Parameters<RepositionLaneFn>[0]) =>
    Promise.resolve(
      activity({ id: input.activityId, laneIndex: input.laneIndex, version: (next += 1) }),
    ),
  );
}

describe('activityDefinitionInput', () => {
  it('projects every settable definition field, mapping null/absent the way the edit dialog does', () => {
    const input = activityDefinitionInput(
      activity({
        code: 'A10',
        constraintType: 'SNET',
        constraintDate: '2026-02-01',
        calendarId: 'cal-9',
        parentId: 'sum-1',
        levelingPriority: 3,
        budgetedExpense: 150000, // minor units → 1500 major
        description: 'Dig it',
      }),
    );
    expect(input).toMatchObject({
      name: 'Excavate',
      code: 'A10',
      type: 'TASK',
      durationDays: 5,
      constraintType: 'SNET',
      constraintDate: '2026-02-01',
      calendarId: 'cal-9',
      parentId: 'sum-1',
      levelingPriority: 3,
      budgetedExpense: 1500,
      description: 'Dig it',
    });
  });

  it('maps a null constraint to the empty-string "none" the form uses', () => {
    const input = activityDefinitionInput(activity({ constraintType: null, constraintDate: null }));
    expect(input.constraintType).toBe('');
    expect(input.constraintDate).toBe('');
    expect(input.levelingPriority).toBeUndefined();
    expect(input.budgetedExpense).toBeUndefined();
  });
});

describe('repositionCommand', () => {
  it('redo re-applies the dropped placement; undo restores the pre-edit constraint + lane', async () => {
    const before = activity({
      constraintType: null,
      constraintDate: null,
      laneIndex: 0,
      version: 4,
    });
    // The reposition wrote an SNET-at-new-start and moved a lane; the server echoed version 5.
    const after = activity({
      constraintType: 'SNET',
      constraintDate: '2026-03-10',
      laneIndex: 2,
      version: 5,
    });
    const update = fakeUpdate();
    const command = repositionCommand({ update, before, after });

    await command.redo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 5, // starts from the post-edit version
        constraintType: 'SNET',
        constraintDate: '2026-03-10',
        laneIndex: 2,
      }),
    );

    await command.undo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 101, // threaded from the redo response (100 + 1)
        constraintType: '', // the prior "none" restored
        constraintDate: '',
        laneIndex: 0,
      }),
    );
  });

  it('defaults its label but accepts an override', () => {
    const update = fakeUpdate();
    expect(repositionCommand({ update, before: activity(), after: activity() }).label).toBe(
      'Move activity',
    );
    expect(
      repositionCommand({ update, before: activity(), after: activity(), label: 'Nudge' }).label,
    ).toBe('Nudge');
  });
});

describe('relaneCommand', () => {
  it('undo returns to the prior lane, redo re-applies the new lane, threading the version', async () => {
    const repositionLane = fakeRepositionLane();
    const command = relaneCommand({
      repositionLane,
      activityId: 'a1',
      fromLaneIndex: 0,
      toLaneIndex: 3,
      version: 7,
    });

    await command.undo();
    expect(repositionLane).toHaveBeenLastCalledWith({
      activityId: 'a1',
      laneIndex: 0,
      version: 7,
    });

    await command.redo();
    expect(repositionLane).toHaveBeenLastCalledWith({
      activityId: 'a1',
      laneIndex: 3,
      version: 201, // threaded from the undo response (200 + 1)
    });
  });
});

describe('updateCommand', () => {
  it('round-trips a definition edit: undo restores the before values, redo the after values', async () => {
    const before = activity({ name: 'Excavate', durationDays: 5, version: 9 });
    const after = activity({ name: 'Dig footings', durationDays: 8, version: 10 });
    const update = fakeUpdate();
    const command = updateCommand({ update, before, after });

    await command.undo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ activityId: 'a1', version: 10, name: 'Excavate', durationDays: 5 }),
    );

    await command.redo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 101, // threaded from the undo response
        name: 'Dig footings',
        durationDays: 8,
      }),
    );

    // do → undo → redo restores the post-edit state again, proving the inverse is a true round-trip.
    await command.undo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Excavate', durationDays: 5 }),
    );
    expect(command.label).toBe('Edit activity');
  });
});
