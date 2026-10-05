import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityDefinitionInput,
  autoArrangeCommand,
  bulkPlacementCommand,
  createActivityCommand,
  createLoeSpanCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dependencyEditChanged,
  dependencyEditCommand,
  dependencyLinkOf,
  dependencyRemoveCommand,
  durationResizeCommand,
  lagDragCommand,
  linkChainCommand,
  relaneCommand,
  typeChangeCommand,
  updateCommand,
  visualResizeCommand,
  visualStartCommand,
} from './commands';
import { notApplicable } from './replay';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aDependency, fakePlanServer } from '@/test/fake-plan-server';

/**
 * The per-command matrix (ADR-0176, undo-redo M2): for each ported builder — a clean replay applies;
 * a field the step wrote having been changed by somebody else sets it aside **without writing**; an
 * unrelated field changed is not a reason to refuse; a value the server normalised still applies; and
 * a multi-row step is set aside whole when any one row fails. Every case runs against `fakePlanServer`,
 * whose mutations enforce the optimistic lock, so "writes with the row's CURRENT version" is something
 * the fake would refuse rather than something a test has to remember to assert.
 */

const A = (id: string, name: string, overrides: Partial<ActivitySummary> = {}) =>
  anActivity({ id, name, ...overrides });

const APPLIED = { kind: 'applied' } as const;

describe('activityDefinitionInput', () => {
  it('projects every settable definition field, mapping null/absent the way the edit dialog does', () => {
    const input = activityDefinitionInput(
      A('a1', 'Excavate', {
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
      durationMinutes: 2400,
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
    const input = activityDefinitionInput(
      A('a1', 'Excavate', { constraintType: null, constraintDate: null }),
    );
    expect(input.constraintType).toBe('');
    expect(input.constraintDate).toBe('');
    expect(input.levelingPriority).toBeUndefined();
    expect(input.budgetedExpense).toBeUndefined();
  });
});

describe('updateCommand — a field-scoped definition step', () => {
  async function edited(
    patch: Partial<ActivitySummary>,
    options?: Parameters<typeof fakePlanServer>[1],
  ) {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] }, options);
    const before = server.row('a1');
    const after = await server.mutations.patchFields({
      activityId: 'a1',
      version: before.version,
      patch,
    });
    const command = updateCommand({ patch: server.mutations.patchFields, before, after });
    server.mutations.patchFields.mockClear();
    return { server, command };
  }

  it('clean replay: undo restores the field, redo re-applies it, each at the row’s current version', async () => {
    const { server, command } = await edited({ name: 'Dig' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').name).toBe('Excavate');
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').name).toBe('Dig');
  });

  it('writes only the fields the edit changed, never the whole definition', async () => {
    const { server, command } = await edited({ name: 'Dig' });
    await command.undo(server.ctx);
    expect(server.mutations.patchFields).toHaveBeenCalledOnce();
    expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({ name: 'Excavate' });
  });

  it('an unrelated field changed by somebody else does not stop the undo, and is left alone', async () => {
    const { server, command } = await edited({ name: 'Dig' });
    server.edit('a1', { description: 'Their note' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1')).toMatchObject({ name: 'Excavate', description: 'Their note' });
  });

  it('a written field changed by somebody else sets the step aside and writes nothing', async () => {
    const { server, command } = await edited({ name: 'Dig' });
    server.edit('a1', { name: 'Trench' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.mutations.patchFields).not.toHaveBeenCalled();
    expect(server.row('a1').name).toBe('Trench');
  });

  it('a deleted row sets the step aside as gone', async () => {
    const { server, command } = await edited({ name: 'Dig' });
    server.remove('a1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
  });

  it('compares what the server saved, not what was sent (a trimmed name still applies)', async () => {
    const { server, command } = await edited(
      { name: '  Dig  ' },
      { normalise: (row) => void (row.name = row.name.trim()) },
    );
    expect(server.row('a1').name).toBe('Dig');
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').name).toBe('Excavate');
  });

  it('writes the exact stored minutes of a sub-day duration, not the rounded day', async () => {
    const { server, command } = await edited({ durationMinutes: 90, durationDays: 0 });
    await command.undo(server.ctx);
    expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({
      durationMinutes: 2400,
    });
  });

  it('a constraint moves with its date, so clearing one writes both', async () => {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate', { constraintType: 'SNET', constraintDate: '2026-03-02' })],
    });
    const before = server.row('a1');
    const after = await server.mutations.patchFields({
      activityId: 'a1',
      version: before.version,
      patch: { constraintType: null, constraintDate: null },
    });
    server.mutations.patchFields.mockClear();
    const command = updateCommand({ patch: server.mutations.patchFields, before, after });
    await command.undo(server.ctx);
    expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({
      constraintType: 'SNET',
      constraintDate: '2026-03-02',
    });
  });

  it('an edit that changed no field replays as a no-op without a write', async () => {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const row = server.row('a1');
    const command = updateCommand({ patch: server.mutations.patchFields, before: row, after: row });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.patchFields).not.toHaveBeenCalled();
  });

  it('names its subject', () => {
    const row = A('a1', 'Excavate');
    expect(updateCommand({ patch: vi.fn(), before: row, after: row }).label).toBe(
      'Edit “Excavate”',
    );
  });

  describe('F-3: the editor’s type change', () => {
    // The server re-expressed the milestone's dates (ADR-0162): the Monday constraint date became
    // the Sunday when the type crossed into FINISH_MILESTONE. Resending dates with the type would be
    // read in the new convention, so the inverse must send the type and nothing else.
    const taskRow = A('a1', 'Pour', {
      type: 'TASK',
      durationMinutes: 0,
      durationDays: 0,
      constraintType: 'SNET',
      constraintDate: '2026-03-09',
    });
    const milestoneRow = {
      ...taskRow,
      type: 'FINISH_MILESTONE' as const,
      constraintDate: '2026-03-08',
      version: 2,
    };

    it('undo sends the type alone and leaves the stored date to the server', async () => {
      const server = fakePlanServer({ activities: [milestoneRow] });
      const command = updateCommand({
        patch: server.mutations.patchFields,
        before: taskRow,
        after: milestoneRow,
      });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({ type: 'TASK' });
      expect(server.row('a1').constraintDate).toBe('2026-03-08');
    });

    it('does not compare the re-expressed date, so a colleague moving it is no reason to refuse', async () => {
      const server = fakePlanServer({ activities: [milestoneRow] });
      const command = updateCommand({
        patch: server.mutations.patchFields,
        before: taskRow,
        after: milestoneRow,
      });
      server.edit('a1', { constraintDate: '2026-03-20' });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
    });

    it('a constraint whose type changed in the same save is a real edit and keeps its date', async () => {
      const after = { ...milestoneRow, constraintType: 'FNET' as const };
      const server = fakePlanServer({ activities: [after] });
      const command = updateCommand({
        patch: server.mutations.patchFields,
        before: taskRow,
        after,
      });
      await command.undo(server.ctx);
      expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({
        type: 'TASK',
        constraintType: 'SNET',
        constraintDate: '2026-03-09',
      });
    });
  });
});

describe('durationResizeCommand', () => {
  async function resized(durations: number[]) {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const commands = [];
    for (const minutes of durations) {
      const before = server.row('a1');
      const after = await server.mutations.patchFields({
        activityId: 'a1',
        version: before.version,
        patch: { durationMinutes: minutes, durationDays: minutes / 480 },
      });
      commands.push(durationResizeCommand({ patch: server.mutations.patchFields, before, after }));
    }
    server.mutations.patchFields.mockClear();
    return { server, commands };
  }

  it('clean replay: undo restores the duration, redo re-applies it', async () => {
    const { server, commands } = await resized([4800]);
    const [command] = commands;
    expect(await command?.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').durationMinutes).toBe(2400);
    expect(await command?.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').durationMinutes).toBe(4800);
  });

  it('a duration changed by somebody else sets the step aside', async () => {
    const { server, commands } = await resized([4800]);
    server.edit('a1', { durationMinutes: 960 });
    expect(await commands[0]?.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.mutations.patchFields).not.toHaveBeenCalled();
  });

  it('a drag burst coalesces to first-before → last-after, checked against the newest saved row', async () => {
    const { server, commands } = await resized([3600, 4800]);
    const [first, second] = commands;
    const merged = second?.coalescing?.merge(first!);
    expect(await merged?.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').durationMinutes).toBe(2400);
  });

  it('a stale step that follows another on the same row still replays — the live version is read', async () => {
    // Two steps on one row: after the newer one is undone the row's version has moved on, and the
    // older step must write at THAT version (`docs/TECH_DEBT.md` #447), not the one it captured.
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const b1 = server.row('a1');
    const a1 = await server.mutations.patchFields({
      activityId: 'a1',
      version: b1.version,
      patch: { name: 'Dig' },
    });
    const first = updateCommand({ patch: server.mutations.patchFields, before: b1, after: a1 });
    const b2 = server.row('a1');
    const a2 = await server.mutations.patchFields({
      activityId: 'a1',
      version: b2.version,
      patch: { durationMinutes: 4800 },
    });
    const second = durationResizeCommand({
      patch: server.mutations.patchFields,
      before: b2,
      after: a2,
    });
    expect(await second.undo(server.ctx)).toEqual(APPLIED);
    expect(await first.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1')).toMatchObject({ name: 'Excavate', durationMinutes: 2400 });
  });
});

describe('typeChangeCommand', () => {
  async function converted(options?: Parameters<typeof fakePlanServer>[1]) {
    const server = fakePlanServer(
      {
        activities: [
          A('a1', 'Pour', {
            durationMinutes: 0,
            durationDays: 0,
            constraintType: 'SNET',
            constraintDate: '2026-03-09',
          }),
        ],
      },
      options,
    );
    const before = server.row('a1');
    const saved = await server.mutations.patchFields({
      activityId: 'a1',
      version: before.version,
      patch: { type: 'FINISH_MILESTONE', constraintDate: '2026-03-08' },
    });
    server.mutations.patchFields.mockClear();
    const command = typeChangeCommand({
      patch: server.mutations.patchFields,
      activityId: 'a1',
      before: 'TASK',
      after: 'FINISH_MILESTONE',
      saved,
      activityName: 'Pour',
    });
    return { server, command };
  }

  it('clean replay: sends the type and nothing else each way', async () => {
    const { server, command } = await converted();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.patchFields.mock.calls[0]?.[0].patch).toEqual({ type: 'TASK' });
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.patchFields.mock.calls[1]?.[0].patch).toEqual({
      type: 'FINISH_MILESTONE',
    });
  });

  it('still applies when the server re-expressed the dates — only the type is compared', async () => {
    const { server, command } = await converted();
    expect(server.row('a1').constraintDate).toBe('2026-03-08');
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('a type changed by somebody else sets the step aside', async () => {
    const { server, command } = await converted();
    server.edit('a1', { type: 'START_MILESTONE' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Pour'));
    expect(server.mutations.patchFields).not.toHaveBeenCalled();
  });

  it('names its subject', async () => {
    expect((await converted()).command.label).toBe('Make “Pour” a milestone');
  });
});

describe('relaneCommand', () => {
  async function relaned(lanes: number[]) {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate', { laneIndex: 0 })] });
    const commands = [];
    let from = 0;
    for (const to of lanes) {
      const saved = await server.mutations.repositionLane({
        activityId: 'a1',
        laneIndex: to,
        version: server.row('a1').version,
      });
      commands.push(
        relaneCommand({
          repositionLane: server.mutations.repositionLane,
          activityId: 'a1',
          fromLaneIndex: from,
          toLaneIndex: to,
          saved,
          activityName: 'Excavate',
        }),
      );
      from = to;
    }
    server.mutations.repositionLane.mockClear();
    return { server, commands };
  }

  it('clean replay: undo returns to the prior lane, redo re-applies the new one', async () => {
    const { server, commands } = await relaned([2]);
    expect(await commands[0]?.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').laneIndex).toBe(0);
    expect(await commands[0]?.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').laneIndex).toBe(2);
  });

  it('a lane moved by somebody else sets the step aside', async () => {
    const { server, commands } = await relaned([2]);
    server.edit('a1', { laneIndex: 5 });
    expect(await commands[0]?.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.mutations.repositionLane).not.toHaveBeenCalled();
  });

  it('an unrelated field changed does not stop it', async () => {
    const { server, commands } = await relaned([2]);
    server.edit('a1', { name: 'Renamed' });
    expect(await commands[0]?.undo(server.ctx)).toEqual(APPLIED);
  });

  it('a lane-only step does not ask for a recalculation', async () => {
    const { commands } = await relaned([2]);
    expect(commands[0]?.affectsSchedule).toBe(false);
  });

  it('a burst coalesces to first-before → last-after and keeps its name', async () => {
    const { server, commands } = await relaned([1, 2]);
    const merged = commands[1]?.coalescing?.merge(commands[0]!);
    expect(merged?.label).toBe('Move “Excavate” to lane');
    expect(await merged?.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').laneIndex).toBe(0);
  });
});

describe('visualStartCommand', () => {
  async function placed(options?: Parameters<typeof fakePlanServer>[1]) {
    const server = fakePlanServer({ activities: [A('a1', 'Foundations')] }, options);
    const before = { visualStart: null, laneIndex: 0 };
    const after = { visualStart: '2026-03-08', laneIndex: 0 };
    const saved = await server.mutations.setVisualStart({
      activityId: 'a1',
      visualStart: after.visualStart,
      laneIndex: after.laneIndex,
      version: server.row('a1').version,
    });
    server.mutations.setVisualStart.mockClear();
    const command = visualStartCommand({
      setVisualStart: server.mutations.setVisualStart,
      activityId: 'a1',
      before,
      after,
      saved,
      activityName: 'Foundations',
    });
    return { server, command };
  }

  it('clean replay: undo restores the prior placement, redo re-applies the drop', async () => {
    const { server, command } = await placed();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').visualStart).toBeNull();
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').visualStart).toBe('2026-03-08');
  });

  it('a placement changed through the API behind the planner’s back sets the step aside', async () => {
    const { server, command } = await placed();
    server.edit('a1', { visualStart: '2026-04-01' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Foundations'));
    expect(server.mutations.setVisualStart).not.toHaveBeenCalled();
  });

  it('compares the placement the server saved, so a snapped date still applies', async () => {
    // The drop named a Sunday; the server stored the Monday. Comparing the sent value would refuse.
    const { server, command } = await placed({
      normalise: (row) => {
        if (row.visualStart === '2026-03-08') row.visualStart = '2026-03-09';
      },
    });
    expect(server.row('a1').visualStart).toBe('2026-03-09');
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('a deleted row sets the step aside as gone', async () => {
    const { server, command } = await placed();
    server.remove('a1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Foundations'));
  });

  it('names its subject', async () => {
    expect((await placed()).command.label).toBe('Move “Foundations”');
  });
});

describe('visualResizeCommand', () => {
  async function resized() {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const before = server.row('a1');
    const after = await server.mutations.setVisualStart({
      activityId: 'a1',
      visualStart: '2026-03-02',
      durationDays: 7,
      version: before.version,
    });
    server.mutations.setVisualStart.mockClear();
    const command = visualResizeCommand({
      setVisualStart: server.mutations.setVisualStart,
      before,
      after,
    });
    return { server, command, before };
  }

  it('clean replay: undo restores the start and duration together, redo re-applies them', async () => {
    const { server, command, before } = await resized();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.setVisualStart.mock.calls[0]?.[0]).toMatchObject({
      visualStart: before.visualStart,
      durationDays: before.durationDays,
    });
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').durationDays).toBe(7);
  });

  it('a duration changed by somebody else sets the step aside', async () => {
    const { server, command } = await resized();
    server.edit('a1', { durationMinutes: 960, durationDays: 2 });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
  });

  it('shares the resize coalescing key with the finish-edge resize', async () => {
    const { command } = await resized();
    expect(command.coalescing?.key).toBe('resize:a1');
  });
});

describe('autoArrangeCommand', () => {
  async function arranged() {
    const server = fakePlanServer({
      activities: [
        A('a1', 'One', { laneIndex: 0 }),
        A('a2', 'Two', { laneIndex: 1 }),
        A('a3', 'Three', { laneIndex: 2 }),
      ],
    });
    const before = [
      { id: 'a1', laneIndex: 0 },
      { id: 'a2', laneIndex: 1 },
      { id: 'a3', laneIndex: 2 },
    ];
    const after = [
      { id: 'a1', laneIndex: 2 },
      { id: 'a2', laneIndex: 0 },
      { id: 'a3', laneIndex: 1 },
    ];
    const saved = await server.mutations.batchPositions({
      positions: after.map((p) => ({ ...p, version: server.row(p.id).version })),
    });
    server.mutations.batchPositions.mockClear();
    const command = autoArrangeCommand({
      batchPositions: server.mutations.batchPositions,
      before,
      after,
      saved,
    });
    return { server, command };
  }

  it('clean replay: undo restores every lane in one batch, redo re-applies the pack', async () => {
    const { server, command } = await arranged();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.batchPositions).toHaveBeenCalledOnce();
    expect([server.row('a1'), server.row('a2'), server.row('a3')].map((r) => r.laneIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect([server.row('a1'), server.row('a2'), server.row('a3')].map((r) => r.laneIndex)).toEqual([
      2, 0, 1,
    ]);
  });

  it('one row of three moved since sets the WHOLE step aside — nothing is half-restored', async () => {
    const { server, command } = await arranged();
    server.edit('a2', { laneIndex: 7 });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Two'));
    expect(server.mutations.batchPositions).not.toHaveBeenCalled();
    expect(server.row('a1').laneIndex).toBe(2);
  });

  it('one row of three deleted sets the whole step aside as gone', async () => {
    const { server, command } = await arranged();
    server.remove('a3');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.batchPositions).not.toHaveBeenCalled();
  });

  it('an unrelated field changed on one row does not stop it', async () => {
    const { server, command } = await arranged();
    server.edit('a2', { name: 'Renamed' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('counts what it moved in its label, singular and plural', () => {
    const one = [{ id: 'a1', laneIndex: 0 }];
    const batchPositions = vi.fn();
    expect(autoArrangeCommand({ batchPositions, before: one, after: one, saved: [] }).label).toBe(
      'Auto-arrange 1 activity',
    );
  });
});

describe('bulkPlacementCommand', () => {
  async function bulkMoved(options?: Parameters<typeof fakePlanServer>[1]) {
    const server = fakePlanServer(
      {
        activities: [
          A('a1', 'One', { visualStart: '2026-03-02', laneIndex: 0 }),
          A('a2', 'Two', { visualStart: '2026-03-03', laneIndex: 1 }),
        ],
      },
      options,
    );
    const placement = (id: string, visualStart: string | null) => ({
      id,
      constraintType: null,
      constraintDate: null,
      visualStart,
      laneIndex: null,
    });
    const before = [placement('a1', '2026-03-02'), placement('a2', '2026-03-03')];
    const after = [placement('a1', '2026-03-09'), placement('a2', '2026-03-10')];
    const saved = await server.mutations.batchPlacements({
      placements: after.map((p) => ({ ...p, version: server.row(p.id).version })),
    });
    server.mutations.batchPlacements.mockClear();
    const command = bulkPlacementCommand({
      batchPlacements: server.mutations.batchPlacements,
      before,
      after,
      saved,
    });
    return { server, command };
  }

  it('clean replay: undo restores every placement in one batch, redo re-applies them', async () => {
    const { server, command } = await bulkMoved();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').visualStart).toBe('2026-03-02');
    expect(server.row('a2').visualStart).toBe('2026-03-03');
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a2').visualStart).toBe('2026-03-10');
  });

  it('one row’s placement changed since sets the whole step aside', async () => {
    const { server, command } = await bulkMoved();
    server.edit('a2', { visualStart: '2026-05-01' });
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.batchPlacements).not.toHaveBeenCalled();
    expect(server.row('a1').visualStart).toBe('2026-03-09');
  });

  it('a lane the step never wrote is not compared (an overlap resolve moved the bar since)', async () => {
    const { server, command } = await bulkMoved();
    server.edit('a1', { laneIndex: 4 });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1').laneIndex).toBe(4);
  });

  it('compares the dates the server saved, so a snapped date still applies', async () => {
    const { server, command } = await bulkMoved({
      normalise: (row) => {
        if (row.visualStart === '2026-03-09') row.visualStart = '2026-03-10';
      },
    });
    expect(server.row('a1').visualStart).toBe('2026-03-10');
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });
});

describe('lagDragCommand', () => {
  async function dragged(
    after: { lagMinutes: number } | { lagDays: number } = { lagMinutes: 600 },
  ) {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate'), A('a2', 'Pour')],
      dependencies: [aDependency({ lagMinutes: 90, lagDays: 0 })],
    });
    const dependency = server.link('d1')!;
    const saved = await server.mutations.updateDependency({
      dependencyId: 'd1',
      type: dependency.type,
      lagCalendar: dependency.lagCalendar,
      version: dependency.version,
      ...after,
    });
    server.mutations.updateDependency.mockClear();
    const command = lagDragCommand({
      updateDependency: server.mutations.updateDependency,
      dependency,
      after,
      saved,
    });
    return { server, command };
  }

  it('clean replay: undo restores the exact stored minutes, redo re-applies the new lag', async () => {
    const { server, command } = await dragged();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.link('d1')?.lagMinutes).toBe(90);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.link('d1')?.lagMinutes).toBe(600);
  });

  it('a lag changed by somebody else sets the step aside', async () => {
    const { server, command } = await dragged();
    server.editDependency('d1', { lagMinutes: 1200 });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate → Pour'));
    expect(server.mutations.updateDependency).not.toHaveBeenCalled();
  });

  it('echoes the link’s CURRENT type and calendar, never reverting a colleague’s change to them', async () => {
    const { server, command } = await dragged();
    server.editDependency('d1', { type: 'SS', lagCalendar: 'TWENTY_FOUR_HOUR' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.link('d1')).toMatchObject({ type: 'SS', lagCalendar: 'TWENTY_FOUR_HOUR' });
  });

  it('a deleted link sets the step aside as gone', async () => {
    const { server, command } = await dragged();
    server.removeDependency('d1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate → Pour'));
  });

  it('degrades to days only where the forward write did', async () => {
    const { server, command } = await dragged({ lagDays: 2 });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.updateDependency.mock.calls[0]?.[0]).toHaveProperty('lagDays');
  });

  it('a burst coalesces to first-before → last-after', async () => {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate'), A('a2', 'Pour')],
      dependencies: [aDependency({ lagMinutes: 0 })],
    });
    const commands = [];
    for (const lagMinutes of [480, 960]) {
      const dependency = server.link('d1')!;
      const saved = await server.mutations.updateDependency({
        dependencyId: 'd1',
        type: dependency.type,
        lagCalendar: dependency.lagCalendar,
        version: dependency.version,
        lagMinutes,
      });
      commands.push(
        lagDragCommand({
          updateDependency: server.mutations.updateDependency,
          dependency,
          after: { lagMinutes },
          saved,
        }),
      );
    }
    const merged = commands[1]?.coalescing?.merge(commands[0]!);
    expect(await merged?.undo(server.ctx)).toEqual(APPLIED);
    expect(server.link('d1')?.lagMinutes).toBe(0);
  });
});

describe('dependencyEditCommand', () => {
  async function edited() {
    const server = fakePlanServer({
      activities: [A('a1', 'Excavate'), A('a2', 'Pour')],
      dependencies: [aDependency({ type: 'FS', lagMinutes: 30, lagCalendar: 'PROJECT_DEFAULT' })],
    });
    const before = server.link('d1')!;
    const after = await server.mutations.updateDependency({
      dependencyId: 'd1',
      type: 'SS',
      lagMinutes: 90,
      lagCalendar: 'PREDECESSOR',
      version: before.version,
    });
    server.mutations.updateDependency.mockClear();
    const command = dependencyEditCommand({
      updateDependency: server.mutations.updateDependency,
      before,
      after,
    });
    return { server, command };
  }

  it('clean replay: type, lag and calendar move together in one PATCH, the lag in exact minutes', async () => {
    const { server, command } = await edited();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.updateDependency).toHaveBeenCalledOnce();
    expect(server.link('d1')).toMatchObject({
      type: 'FS',
      lagMinutes: 30,
      lagCalendar: 'PROJECT_DEFAULT',
    });
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.link('d1')).toMatchObject({ type: 'SS', lagMinutes: 90 });
  });

  it('any one of the three fields changed since sets the step aside', async () => {
    const { server, command } = await edited();
    server.editDependency('d1', { lagCalendar: 'SUCCESSOR' });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate → Pour'));
    expect(server.mutations.updateDependency).not.toHaveBeenCalled();
  });

  it('a deleted link sets the step aside as gone', async () => {
    const { server, command } = await edited();
    server.removeDependency('d1');
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
  });

  it('does not coalesce — a dialog save is a discrete step', async () => {
    expect((await edited()).command.coalescing).toBeUndefined();
  });

  it('names both endpoints', async () => {
    expect((await edited()).command.label).toBe('Edit link “Excavate” → “Pour”');
  });
});

describe('dependencyEditChanged (#65, CQ-2)', () => {
  it('is false for a save that resends the same values', () => {
    const row = aDependency({ type: 'FS', lagMinutes: 90, lagCalendar: 'PROJECT_DEFAULT' });
    expect(dependencyEditChanged(row, { ...row })).toBe(false);
  });

  it('sees a sub-day lag change that a days comparison cannot', () => {
    const before = aDependency({ lagMinutes: 30, lagDays: 0 });
    const after = aDependency({ lagMinutes: 90, lagDays: 0 });
    expect(before.lagDays).toBe(after.lagDays);
    expect(dependencyEditChanged(before, after)).toBe(true);
  });

  it('sees a type change and a lag-calendar change', () => {
    const before = aDependency({ type: 'FS', lagCalendar: 'PROJECT_DEFAULT' });
    expect(dependencyEditChanged(before, { ...before, type: 'SF' })).toBe(true);
    expect(dependencyEditChanged(before, { ...before, lagCalendar: 'PREDECESSOR' })).toBe(true);
  });
});

describe('dependency add / remove commands', () => {
  const seed = () => ({
    activities: [A('a1', 'Excavate'), A('a2', 'Pour')],
    dependencies: [aDependency({ lagMinutes: 90 })],
  });

  it('dependencyLinkOf carries a SUB-DAY lag as minutes rather than its rounded day (ADR-0070)', () => {
    expect(dependencyLinkOf(aDependency({ lagMinutes: 90, lagDays: 0 }))).toMatchObject({
      predecessorId: 'a1',
      successorId: 'a2',
      lagMinutes: 90,
    });
  });

  describe('add', () => {
    const added = () => {
      const server = fakePlanServer(seed());
      const command = dependencyAddCommand({
        dependency: server.link('d1')!,
        createDependency: server.mutations.createDependency,
        deleteDependency: server.mutations.deleteDependency,
      });
      return { server, command };
    };

    it('clean replay: undo removes the edge, redo re-creates it from the captured link', async () => {
      const { server, command } = added();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.link('d1')).toBeUndefined();
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(server.mutations.createDependency).toHaveBeenCalledWith(
        expect.objectContaining({ predecessorId: 'a1', successorId: 'a2', lagMinutes: 90 }),
      );
    });

    it('an edge changed since sets the step aside and deletes nothing', async () => {
      const { server, command } = added();
      server.editDependency('d1', { lagMinutes: 600 });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate → Pour'));
      expect(server.mutations.deleteDependency).not.toHaveBeenCalled();
    });

    it('an edge already gone sets the step aside as gone', async () => {
      const { server, command } = added();
      server.removeDependency('d1');
      expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate → Pour'));
    });

    it('a redo whose link now exists is set aside as a duplicate', async () => {
      const { server, command } = added();
      await command.undo(server.ctx);
      await server.mutations.createDependency({
        planId: 'p1',
        predecessorId: 'a1',
        successorId: 'a2',
        type: 'FS',
        lagMinutes: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      expect(await command.redo(server.ctx)).toEqual(notApplicable('duplicate', 'Excavate → Pour'));
    });

    it('a redo whose endpoint was deleted names the bar that is gone', async () => {
      const { server, command } = added();
      await command.undo(server.ctx);
      server.remove('a2');
      expect(await command.redo(server.ctx)).toEqual(notApplicable('gone', 'Pour'));
    });

    it('is idempotent: a retried undo cannot double-delete', async () => {
      const { server, command } = added();
      await command.undo(server.ctx);
      await command.undo(server.ctx);
      expect(server.mutations.deleteDependency).toHaveBeenCalledOnce();
    });
  });

  describe('remove', () => {
    const removed = () => {
      const server = fakePlanServer(seed());
      const dependency = server.link('d1')!;
      server.removeDependency('d1');
      const command = dependencyRemoveCommand({
        dependency,
        createDependency: server.mutations.createDependency,
        deleteDependency: server.mutations.deleteDependency,
      });
      return { server, command };
    };

    it('clean replay: undo re-creates the edge, redo removes the NEW one', async () => {
      const { server, command } = removed();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      const created = [...server.dependencies.values()][0];
      expect(created).toMatchObject({ lagMinutes: 90 });
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(server.dependencies.size).toBe(0);
    });

    it('redo is set aside when the re-created edge was changed since', async () => {
      const { server, command } = removed();
      await command.undo(server.ctx);
      const [created] = [...server.dependencies.values()];
      server.editDependency(created!.id, { lagMinutes: 5 });
      expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Excavate → Pour'));
    });

    it('an undo whose endpoint was deleted since names it', async () => {
      const { server, command } = removed();
      server.remove('a1');
      expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
    });
  });

  it('default labels name both endpoints', () => {
    const dependency = aDependency();
    const fns = { createDependency: vi.fn(), deleteDependency: vi.fn() };
    expect(dependencyAddCommand({ dependency, ...fns }).label).toBe('Add link “Excavate” → “Pour”');
    expect(dependencyRemoveCommand({ dependency, ...fns }).label).toBe(
      'Remove link “Excavate” → “Pour”',
    );
  });
});

describe('linkChainCommand', () => {
  async function chained() {
    const server = fakePlanServer({
      activities: [A('a1', 'One'), A('a2', 'Two'), A('a3', 'Three')],
    });
    const edges = [
      { predecessorId: 'a1', successorId: 'a2' },
      { predecessorId: 'a2', successorId: 'a3' },
    ];
    const created = [];
    for (const edge of edges) {
      created.push(
        await server.mutations.createDependency({
          planId: 'p1',
          ...edge,
          type: 'FS',
          lagMinutes: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
      );
    }
    server.mutations.createDependency.mockClear();
    const command = linkChainCommand({
      created,
      createDependency: server.mutations.createDependency,
      deleteDependency: server.mutations.deleteDependency,
    });
    return { server, command, created };
  }

  it('clean replay: undo removes the whole chain, redo re-creates it with new ids', async () => {
    const { server, command, created } = await chained();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.dependencies.size).toBe(0);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.dependencies.size).toBe(2);
    expect(server.dependencies.has(created[0]!.id)).toBe(false);
  });

  it('one link of the chain changed sets the WHOLE step aside — no link is deleted', async () => {
    const { server, command, created } = await chained();
    server.editDependency(created[1]!.id, { lagMinutes: 480 });
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteDependency).not.toHaveBeenCalled();
    expect(server.dependencies.size).toBe(2);
  });

  it('one link already gone sets the whole step aside as gone', async () => {
    const { server, command, created } = await chained();
    server.removeDependency(created[0]!.id);
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.deleteDependency).not.toHaveBeenCalled();
  });

  it('a redo refused part-way rolls the partial chain back', async () => {
    const { server, command } = await chained();
    await command.undo(server.ctx);
    // The second link already exists, so re-creating the chain is refused after the first lands.
    await server.mutations.createDependency({
      planId: 'p1',
      predecessorId: 'a2',
      successorId: 'a3',
      type: 'FS',
      lagMinutes: 0,
      lagCalendar: 'PROJECT_DEFAULT',
    });
    expect((await command.redo(server.ctx)).kind).toBe('not-applicable');
    expect([...server.dependencies.values()].map((d) => d.predecessor.id)).toEqual(['a2']);
  });

  it('names how many activities it links', async () => {
    expect((await chained()).command.label).toBe('Link 2 activities in sequence');
  });
});

describe('createActivityCommand', () => {
  function drawn() {
    const server = fakePlanServer({ activities: [A('a1', 'Foundations')] });
    const command = createActivityCommand({
      created: server.row('a1'),
      deleteActivity: server.mutations.deleteActivity,
      restoreBatch: server.mutations.restoreBatch,
    });
    return { server, command };
  }

  it('undo deletes the activity; redo RESTORES it — the same id, never a re-create', async () => {
    const { server, command } = drawn();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.activities.has('a1')).toBe(false);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.activities.has('a1')).toBe(true);
    expect(server.mutations.restoreBatch).toHaveBeenCalledWith({ deleteBatchId: 'batch-1' });
  });

  it('rethreads the batch on a second round: undo again deletes the restored row', async () => {
    const { server, command } = drawn();
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.deleteActivity).toHaveBeenCalledTimes(2);
    expect(server.activities.has('a1')).toBe(false);
  });

  it('an undo whose activity was deleted since is set aside as gone', async () => {
    const { server, command } = drawn();
    server.remove('a1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Foundations'));
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
  });

  it('is idempotent: a retried undo cannot double-delete, nor a retried redo double-restore', async () => {
    const { server, command } = drawn();
    await command.undo(server.ctx);
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    await command.redo(server.ctx);
    expect(server.mutations.deleteActivity).toHaveBeenCalledOnce();
    expect(server.mutations.restoreBatch).toHaveBeenCalledOnce();
  });

  it('names its subject', () => {
    expect(drawn().command.label).toBe('Add “Foundations”');
  });
});

describe('deleteActivityCommand', () => {
  async function deleted() {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const activity = server.row('a1');
    const { deleteBatchId } = await server.mutations.deleteActivity('a1');
    server.mutations.deleteActivity.mockClear();
    const command = deleteActivityCommand({
      activity,
      deleteBatchId,
      restoreBatch: server.mutations.restoreBatch,
      deleteActivity: server.mutations.deleteActivity,
    });
    return { server, command };
  }

  it('undo restores the batch (id-stable); redo deletes the same id again', async () => {
    const { server, command } = await deleted();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.activities.has('a1')).toBe(true);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.deleteActivity).toHaveBeenCalledWith('a1');
    expect(server.activities.has('a1')).toBe(false);
  });

  it('rethreads the batch id on every redo, so a second undo restores what the second delete swept', async () => {
    const { server, command } = await deleted();
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.restoreBatch).toHaveBeenLastCalledWith({ deleteBatchId: 'batch-2' });
  });

  it('a restore the server refuses for a deleted phase is set aside in the phase’s words', async () => {
    const { server, command } = await deleted();
    server.mutations.restoreBatch.mockRejectedValueOnce(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'no',
        details: { reason: 'PARENT_DELETED' },
      }),
    );
    expect(await command.undo(server.ctx)).toEqual(notApplicable('parent-deleted', 'Excavate'));
  });

  it('a restore that 404s is set aside as gone', async () => {
    const { server, command } = await deleted();
    server.mutations.restoreBatch.mockRejectedValueOnce(
      new ApiFetchError(404, { code: 'NOT_FOUND', message: 'no' }),
    );
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
  });

  it('a redo whose activity was deleted by somebody else is set aside as gone', async () => {
    const { server, command } = await deleted();
    await command.undo(server.ctx);
    server.remove('a1');
    expect(await command.redo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
  });

  it('a transport failure is thrown, not set aside — the step stays on top to retry', async () => {
    const { server, command } = await deleted();
    server.mutations.restoreBatch.mockRejectedValueOnce(new Error('network'));
    await expect(command.undo(server.ctx)).rejects.toThrow('network');
  });

  it('is idempotent in both directions', async () => {
    const { server, command } = await deleted();
    await command.redo(server.ctx);
    expect(server.mutations.deleteActivity).not.toHaveBeenCalled();
    await command.undo(server.ctx);
    await command.undo(server.ctx);
    expect(server.mutations.restoreBatch).toHaveBeenCalledOnce();
  });
});

describe('createLoeSpanCommand', () => {
  function composed() {
    const server = fakePlanServer({
      activities: [A('a1', 'Start'), A('a2', 'Finish'), A('loe', 'Level of effort')],
    });
    const placedInput = {
      name: 'Level of effort',
      type: 'LEVEL_OF_EFFORT' as const,
      durationDays: 0,
      laneIndex: 0,
    };
    const createPlaced = vi.fn(() => {
      server.activities.set('loe2', A('loe2', 'Level of effort'));
      return Promise.resolve(server.row('loe2'));
    });
    const command = createLoeSpanCommand({
      loe: server.row('loe'),
      placedInput,
      planId: 'p1',
      startDriverId: 'a1',
      finishDriverId: 'a2',
      createPlaced,
      createDependency: server.mutations.createDependency,
      deleteActivity: server.mutations.deleteActivity,
    });
    return { server, command, createPlaced };
  }

  it('undo deletes the LOE; redo re-composes LOE + SS + FF', async () => {
    const { server, command, createPlaced } = composed();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.activities.has('loe')).toBe(false);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect(createPlaced).toHaveBeenCalledOnce();
    expect(server.mutations.createDependency).toHaveBeenCalledTimes(2);
  });

  it('an undo whose LOE was deleted since is set aside as gone', async () => {
    const { server, command } = composed();
    server.remove('loe');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Level of effort'));
  });

  it('a redo whose driver was deleted since is set aside before anything is created', async () => {
    const { server, command, createPlaced } = composed();
    await command.undo(server.ctx);
    server.remove('a2');
    expect(await command.redo(server.ctx)).toEqual(notApplicable('gone', 'The finish activity'));
    expect(createPlaced).not.toHaveBeenCalled();
  });

  it('is idempotent per direction', async () => {
    const { server, command, createPlaced } = composed();
    await command.undo(server.ctx);
    await command.undo(server.ctx);
    await command.redo(server.ctx);
    await command.redo(server.ctx);
    expect(server.mutations.deleteActivity).toHaveBeenCalledOnce();
    expect(createPlaced).toHaveBeenCalledOnce();
  });
});
