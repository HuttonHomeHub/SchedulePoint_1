import type { ActivitySummary, DependencySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityDefinitionInput,
  autoArrangeCommand,
  createActivityCommand,
  createLoeSpanCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dependencyLinkOf,
  dependencyRemoveCommand,
  durationResizeCommand,
  lagDragCommand,
  relaneCommand,
  repositionCommand,
  updateCommand,
  visualResizeCommand,
  visualStartCommand,
  type BatchPositionsFn,
  type CreateDependencyFn,
  type RepositionLaneFn,
  type SetVisualStartFn,
  type UpdateActivityFn,
  type UpdateDependencyFn,
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
      'Move “Excavate”',
    );
    expect(
      repositionCommand({ update, before: activity(), after: activity(), label: 'Nudge' }).label,
    ).toBe('Nudge');
  });
});

describe('durationResizeCommand (ADR-0052 M2)', () => {
  it('undo restores the pre-resize duration (full definition), redo re-applies the new one', async () => {
    const before = activity({
      durationDays: 5,
      constraintType: 'SNET',
      constraintDate: '2026-02-01',
      version: 4,
    });
    const after = activity({
      durationDays: 9,
      constraintType: 'SNET',
      constraintDate: '2026-02-01',
      version: 5,
    });
    const update = fakeUpdate();
    const command = durationResizeCommand({ update, before, after });

    await command.undo();
    // The inverse is the FULL definition round-trip — the prior duration AND the untouched
    // constraint are resent, so nothing the resize carried along is silently cleared.
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 5, // starts from the post-edit version
        durationDays: 5,
        constraintType: 'SNET',
        constraintDate: '2026-02-01',
      }),
    );

    await command.redo();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 101, // threaded from the undo response (100 + 1)
        durationDays: 9,
      }),
    );
    expect(command.label).toBe('Resize “Excavate”');
  });

  it('coalesces per activity: a drag/held-key burst collapses to first-before → last-after', async () => {
    const update = fakeUpdate();
    const first = durationResizeCommand({
      update,
      before: activity({ durationDays: 5, version: 4 }),
      after: activity({ durationDays: 6, version: 5 }),
    });
    const second = durationResizeCommand({
      update,
      before: activity({ durationDays: 6, version: 5 }),
      after: activity({ durationDays: 8, version: 6 }),
    });
    expect(first.coalescing?.key).toBe('resize:a1');
    expect(second.coalescing?.key).toBe('resize:a1');

    // The history store merges same-key neighbours: merged.undo restores the OLDEST before…
    const merged = second.coalescing!.merge(first);
    await merged.undo();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ durationDays: 5 }));
    // …and merged.redo re-applies the NEWEST after.
    await merged.redo();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ durationDays: 8 }));
  });
});

describe('visualResizeCommand (ADR-0052 M3 — VISUAL start-edge resize)', () => {
  const fakeSetVisualStart = () => {
    let next = 60;
    return vi.fn((i: Parameters<SetVisualStartFn>[0]) =>
      Promise.resolve(activity({ id: i.activityId, version: (next += 1) })),
    );
  };

  it('undo restores the prior visualStart AND duration; redo re-applies, threading the version', async () => {
    const before = activity({ visualStart: null, durationDays: 5, version: 7 });
    const after = activity({ visualStart: '2026-03-10', durationDays: 8, version: 8 });
    const setVisualStart = fakeSetVisualStart();
    const command = visualResizeCommand({ setVisualStart, before, after });

    await command.undo();
    // The inverse restores BOTH halves of the start-edge edit through the same minimal seam —
    // the prior placement (null = revert to computed) and the prior duration.
    expect(setVisualStart).toHaveBeenLastCalledWith({
      activityId: 'a1',
      visualStart: null,
      durationDays: 5,
      version: 8, // starts from the post-edit version
    });

    await command.redo();
    expect(setVisualStart).toHaveBeenLastCalledWith({
      activityId: 'a1',
      visualStart: '2026-03-10',
      durationDays: 8,
      version: 61, // threaded from the undo response (60 + 1)
    });
    expect(command.label).toBe('Resize “Excavate”');
  });

  it('coalesces on the SHARED resize:{id} key: a start-drag burst collapses first-before → last-after', async () => {
    const setVisualStart = fakeSetVisualStart();
    const first = visualResizeCommand({
      setVisualStart,
      before: activity({ visualStart: '2026-03-01', durationDays: 5, version: 4 }),
      after: activity({ visualStart: '2026-03-02', durationDays: 4, version: 5 }),
    });
    const second = visualResizeCommand({
      setVisualStart,
      before: activity({ visualStart: '2026-03-02', durationDays: 4, version: 5 }),
      after: activity({ visualStart: '2026-03-04', durationDays: 2, version: 6 }),
    });
    // Same key as durationResizeCommand — one bar's resize gesture is ONE undo step whichever
    // edge it grabbed (both builders stash full ActivitySummary snapshots, so a cross-builder
    // merge stays type-safe).
    expect(first.coalescing?.key).toBe('resize:a1');
    expect(second.coalescing?.key).toBe('resize:a1');

    const merged = second.coalescing!.merge(first);
    await merged.undo();
    expect(setVisualStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ visualStart: '2026-03-01', durationDays: 5 }),
    );
    await merged.redo();
    expect(setVisualStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ visualStart: '2026-03-04', durationDays: 2 }),
    );
  });
});

describe('lagDragCommand (ADR-0052 M3)', () => {
  const fakeUpdateDependency = () => {
    let next = 300;
    return vi.fn((i: Parameters<UpdateDependencyFn>[0]) =>
      Promise.resolve(dependency({ id: i.dependencyId, lagDays: i.lagDays, version: (next += 1) })),
    );
  };

  it('undo restores the prior lag, redo the new one — echoing type + lag calendar verbatim', async () => {
    const updateDependency = fakeUpdateDependency();
    const command = lagDragCommand({
      updateDependency,
      dependency: dependency({ id: 'd7', type: 'SS', lagDays: 2, lagCalendar: 'TWENTY_FOUR_HOUR' }),
      afterLagDays: 5,
      version: 9,
    });

    await command.undo();
    expect(updateDependency).toHaveBeenLastCalledWith({
      dependencyId: 'd7',
      type: 'SS',
      lagDays: 2,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      version: 9, // starts from the post-edit version
    });

    await command.redo();
    expect(updateDependency).toHaveBeenLastCalledWith({
      dependencyId: 'd7',
      type: 'SS',
      lagDays: 5,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      version: 301, // threaded from the undo response (300 + 1)
    });
    expect(command.label).toBe('Change lag “Excavate” → “Pour”');
  });

  it('coalesces per dependency: a drag/nudge burst collapses to first-before → last-after', async () => {
    const updateDependency = fakeUpdateDependency();
    const first = lagDragCommand({
      updateDependency,
      dependency: dependency({ lagDays: 0 }),
      afterLagDays: 1,
      version: 2,
    });
    const second = lagDragCommand({
      updateDependency,
      dependency: dependency({ lagDays: 1 }),
      afterLagDays: -2,
      version: 3,
    });
    expect(first.coalescing?.key).toBe('lag:d1');
    expect(second.coalescing?.key).toBe('lag:d1');

    const merged = second.coalescing!.merge(first);
    await merged.undo();
    expect(updateDependency).toHaveBeenLastCalledWith(expect.objectContaining({ lagDays: 0 }));
    await merged.redo();
    expect(updateDependency).toHaveBeenLastCalledWith(expect.objectContaining({ lagDays: -2 }));
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
    expect(command.label).toBe('Edit “Excavate”');
  });
});

// ---------------------------------------------------------------------------------------------------
// M2 command builders.
// ---------------------------------------------------------------------------------------------------

/** A dependency edge; overrides pick out the fields a test cares about. */
function dependency(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'pl1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'a2', code: 'A20', name: 'Pour' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('createActivityCommand', () => {
  it('undo deletes the created activity; redo re-creates it (a new id) and redo again is idempotent', async () => {
    const created = activity({ id: 'new-1' });
    const input = { name: 'Excavate', type: 'TASK' as const, durationDays: 5, laneIndex: 2 };
    const createPlaced = vi.fn(() => Promise.resolve(activity({ id: 'new-2' })));
    const deleteActivity = vi.fn(() => Promise.resolve());
    const command = createActivityCommand({ created, input, createPlaced, deleteActivity });

    await command.undo();
    expect(deleteActivity).toHaveBeenCalledExactlyOnceWith('new-1'); // deletes the original id

    await command.redo();
    expect(createPlaced).toHaveBeenCalledExactlyOnceWith(input); // re-creates from the same input

    // A second undo deletes the RE-created id (new-2), not the stale original — the toggle tracks it.
    await command.undo();
    expect(deleteActivity).toHaveBeenLastCalledWith('new-2');
    expect(command.label).toBe('Add “Excavate”');
  });

  it('does not re-delete when already absent, nor re-create when already present', async () => {
    const createPlaced = vi.fn(() => Promise.resolve(activity({ id: 'x' })));
    const deleteActivity = vi.fn(() => Promise.resolve());
    const command = createActivityCommand({
      created: activity({ id: 'c1' }),
      input: { name: 'A', type: 'TASK', durationDays: 1, laneIndex: 0 },
      createPlaced,
      deleteActivity,
    });
    await command.redo(); // already present — no-op
    expect(createPlaced).not.toHaveBeenCalled();
    await command.undo(); // delete
    await command.undo(); // already absent — no-op
    expect(deleteActivity).toHaveBeenCalledTimes(1);
  });
});

describe('deleteActivityCommand', () => {
  it('undo re-creates the whole definition (new id) + restores the lane; redo deletes it again', async () => {
    const snapshot = activity({
      id: 'gone',
      name: 'Excavate',
      constraintType: 'SNET',
      constraintDate: '2026-02-01',
      laneIndex: 4,
      version: 9,
    });
    const createActivity = vi.fn(() =>
      Promise.resolve(activity({ id: 'reborn', laneIndex: 0, version: 1 })),
    );
    const repositionLane = vi.fn((i: { activityId: string; laneIndex: number; version: number }) =>
      Promise.resolve(activity({ id: i.activityId, laneIndex: i.laneIndex, version: 2 })),
    );
    const deleteActivity = vi.fn(() => Promise.resolve());
    const command = deleteActivityCommand({
      activity: snapshot,
      createActivity,
      repositionLane,
      deleteActivity,
    });

    await command.undo();
    // Re-creates the full definition…
    expect(createActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: 'Excavate',
        constraintType: 'SNET',
        constraintDate: '2026-02-01',
      }),
    );
    // …then restores the original lane (the create landed lane 0, snapshot was lane 4).
    expect(repositionLane).toHaveBeenCalledExactlyOnceWith({
      activityId: 'reborn',
      laneIndex: 4,
      version: 1,
    });

    await command.redo();
    expect(deleteActivity).toHaveBeenCalledExactlyOnceWith('reborn'); // deletes the re-created id
    expect(command.label).toBe('Delete “Excavate”');
  });

  it('skips the lane restore when the re-created activity already lands on the original lane', async () => {
    const snapshot = activity({ id: 'g', laneIndex: 3 });
    const createActivity = vi.fn(() =>
      Promise.resolve(activity({ id: 'r', laneIndex: 3, version: 1 })),
    );
    const repositionLane: RepositionLaneFn = vi.fn((i) =>
      Promise.resolve(activity({ id: i.activityId, laneIndex: i.laneIndex, version: 2 })),
    );
    const command = deleteActivityCommand({
      activity: snapshot,
      createActivity,
      repositionLane,
      deleteActivity: vi.fn(() => Promise.resolve()),
    });
    await command.undo();
    expect(repositionLane).not.toHaveBeenCalled();
  });
});

describe('dependency add / remove commands', () => {
  it('dependencyLinkOf projects endpoints/type/lag from a row', () => {
    expect(
      dependencyLinkOf(dependency({ type: 'SS', lagDays: 3, lagCalendar: 'TWENTY_FOUR_HOUR' })),
    ).toEqual({
      planId: 'pl1',
      predecessorId: 'a1',
      successorId: 'a2',
      type: 'SS',
      lagDays: 3,
      lagCalendar: 'TWENTY_FOUR_HOUR',
    });
  });

  it('add: undo removes the edge, redo re-creates it (a new id) from the captured link', async () => {
    const created = dependency({ id: 'edge-1', type: 'FS', lagDays: 2 });
    const createDependency: CreateDependencyFn = vi.fn(() =>
      Promise.resolve(dependency({ id: 'edge-2' })),
    );
    const deleteDependency = vi.fn(() => Promise.resolve());
    const command = dependencyAddCommand({
      dependency: created,
      createDependency,
      deleteDependency,
    });

    await command.undo();
    expect(deleteDependency).toHaveBeenCalledExactlyOnceWith('edge-1');

    await command.redo();
    expect(createDependency).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ predecessorId: 'a1', successorId: 'a2', type: 'FS', lagDays: 2 }),
    );

    await command.undo();
    expect(deleteDependency).toHaveBeenLastCalledWith('edge-2'); // the re-created id
    expect(command.label).toBe('Add link');
  });

  it('remove: undo re-creates the edge, redo removes it again', async () => {
    const removed = dependency({ id: 'edge-9', type: 'FF', lagDays: -1 });
    const createDependency: CreateDependencyFn = vi.fn(() =>
      Promise.resolve(dependency({ id: 'edge-10' })),
    );
    const deleteDependency = vi.fn(() => Promise.resolve());
    const command = dependencyRemoveCommand({
      dependency: removed,
      createDependency,
      deleteDependency,
    });

    await command.undo(); // re-create
    expect(createDependency).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'FF', lagDays: -1 }),
    );
    await command.redo(); // remove again
    expect(deleteDependency).toHaveBeenCalledExactlyOnceWith('edge-10');
    expect(command.label).toBe('Remove link');
  });
});

describe('createLoeSpanCommand', () => {
  const placedInput = {
    name: 'Level of effort',
    type: 'LEVEL_OF_EFFORT' as const,
    durationDays: 0,
    laneIndex: 2,
  };

  it('undo deletes the LOE (cascading its edges); redo re-composes LOE + SS + FF', async () => {
    const loe = activity({ id: 'loe-1', name: 'Level of effort', type: 'LEVEL_OF_EFFORT' });
    const createPlaced = vi.fn(() => Promise.resolve(activity({ id: 'loe-2' })));
    const createDependency: CreateDependencyFn = vi.fn(() => Promise.resolve(dependency({})));
    const deleteActivity = vi.fn(() => Promise.resolve());
    const command = createLoeSpanCommand({
      loe,
      placedInput,
      planId: 'pl1',
      startDriverId: 'start',
      finishDriverId: 'finish',
      createPlaced,
      createDependency,
      deleteActivity,
    });

    // Undo just deletes the LOE — the SS + FF edges cascade with it (no separate edge deletes).
    await command.undo();
    expect(deleteActivity).toHaveBeenCalledExactlyOnceWith('loe-1');

    // Redo re-composes the WHOLE span: a fresh LOE, then its SS (start → LOE) and FF (LOE → finish).
    await command.redo();
    expect(createPlaced).toHaveBeenCalledExactlyOnceWith(placedInput);
    expect(createDependency).toHaveBeenCalledTimes(2);
    expect(createDependency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ predecessorId: 'start', successorId: 'loe-2', type: 'SS' }),
    );
    expect(createDependency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ predecessorId: 'loe-2', successorId: 'finish', type: 'FF' }),
    );

    // A second undo deletes the RE-composed LOE id (loe-2), not the stale original — the toggle tracks it.
    await command.undo();
    expect(deleteActivity).toHaveBeenLastCalledWith('loe-2');
    expect(command.label).toBe('Add level-of-effort span');
  });

  it('is idempotent per direction (no double-delete / double-compose)', async () => {
    const createPlaced = vi.fn(() => Promise.resolve(activity({ id: 'x' })));
    const createDependency: CreateDependencyFn = vi.fn(() => Promise.resolve(dependency({})));
    const deleteActivity = vi.fn(() => Promise.resolve());
    const command = createLoeSpanCommand({
      loe: activity({ id: 'loe-1' }),
      placedInput,
      planId: 'pl1',
      startDriverId: 'start',
      finishDriverId: 'finish',
      createPlaced,
      createDependency,
      deleteActivity,
    });
    await command.redo(); // already present — no-op
    expect(createPlaced).not.toHaveBeenCalled();
    await command.undo(); // delete
    await command.undo(); // already absent — no-op
    expect(deleteActivity).toHaveBeenCalledTimes(1);
  });
});

describe('visualStartCommand', () => {
  it('undo restores the prior visualStart + lane; redo re-applies the drop, threading the version', async () => {
    let next = 50;
    const setVisualStart: SetVisualStartFn = vi.fn((i) =>
      Promise.resolve(activity({ id: i.activityId, version: (next += 1) })),
    );
    const command = visualStartCommand({
      setVisualStart,
      activityId: 'a1',
      before: { visualStart: null, laneIndex: 0 },
      after: { visualStart: '2026-03-10', laneIndex: 2 },
      version: 7,
    });

    await command.undo();
    expect(setVisualStart).toHaveBeenLastCalledWith({
      activityId: 'a1',
      visualStart: null,
      laneIndex: 0,
      version: 7, // starts from the post-edit version
    });

    await command.redo();
    expect(setVisualStart).toHaveBeenLastCalledWith({
      activityId: 'a1',
      visualStart: '2026-03-10',
      laneIndex: 2,
      version: 51, // threaded from the undo response (50 + 1)
    });
    expect(command.coalescing?.key).toBe('visual:a1');
  });
});

describe('autoArrangeCommand', () => {
  it('undo restores every prior lane in one batch; redo re-applies the pack, threading versions', async () => {
    const batchPositions: BatchPositionsFn = vi.fn(
      (input: { positions: { id: string; laneIndex: number; version: number }[] }) =>
        Promise.resolve(
          input.positions.map((p) =>
            activity({ id: p.id, laneIndex: p.laneIndex, version: p.version + 10 }),
          ),
        ),
    );
    const command = autoArrangeCommand({
      batchPositions,
      before: [
        { id: 'a1', laneIndex: 0 },
        { id: 'a2', laneIndex: 1 },
      ],
      after: [
        { id: 'a1', laneIndex: 2 },
        { id: 'a2', laneIndex: 3 },
      ],
      versions: new Map([
        ['a1', 5],
        ['a2', 6],
      ]),
    });

    await command.undo(); // restore prior lanes at the post-forward versions
    expect(batchPositions).toHaveBeenLastCalledWith({
      positions: [
        { id: 'a1', laneIndex: 0, version: 5 },
        { id: 'a2', laneIndex: 1, version: 6 },
      ],
    });

    await command.redo(); // re-apply the pack at the versions the undo returned (5+10, 6+10)
    expect(batchPositions).toHaveBeenLastCalledWith({
      positions: [
        { id: 'a1', laneIndex: 2, version: 15 },
        { id: 'a2', laneIndex: 3, version: 16 },
      ],
    });
    expect(command.label).toBe('Auto-arrange lanes');
  });
});
