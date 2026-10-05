import type { ResourceAssignmentSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  assignmentAddCommand,
  assignmentChanged,
  assignmentEditCommand,
  assignmentRemoveCommand,
  crossPlanLinkAddCommand,
  crossPlanLinkRemoveCommand,
  reparentCommand,
  reparentedRows,
  reparentLabel,
  stepsChanged,
  stepsReplaceCommand,
} from './record-commands';
import { notApplicable } from './replay';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aCrossPlanLink, anAssignment, aStep, fakePlanServer } from '@/test/fake-plan-server';

/**
 * The per-command matrix for the records beside the bar (undo-redo M3, ADR-0176): a clean replay
 * applies; a field the step wrote having been changed by somebody else sets it aside **without
 * writing**; an unrelated field changed is no reason to refuse; a row that is gone is set aside as
 * gone; and a multi-row step is set aside whole when any one row fails. Every case runs against
 * `fakePlanServer`, whose mutations enforce the optimistic lock.
 */

const APPLIED = { kind: 'applied' } as const;
const A = (id: string, name: string, overrides = {}) => anActivity({ id, name, ...overrides });
type AssignmentSeed = Partial<ResourceAssignmentSummary>;
/** What an edit writes in these cases; the fake server applies exactly these. */
interface EditPatch {
  budgetedUnits?: number;
  unitsPerHour?: number;
  isDriving?: boolean;
  lagMinutes?: number;
}

describe('reparentCommand', () => {
  async function filed() {
    const server = fakePlanServer({
      activities: [
        A('s1', 'Substructure', { type: 'WBS_SUMMARY' }),
        A('a1', 'Excavate'),
        A('a2', 'Pour'),
        A('a3', 'Backfill', { parentId: 's1' }),
      ],
    });
    const before = [server.row('a1'), server.row('a2')];
    const after = await server.mutations.updateParents({
      parents: before.map((row) => ({ id: row.id, parentId: 's1', version: row.version })),
    });
    server.mutations.updateParents.mockClear();
    const command = reparentCommand({
      before,
      after,
      updateParents: server.mutations.updateParents,
      label: 'Move 2 activities under “Substructure”',
    });
    return { server, command };
  }

  it('clean replay: undo returns every row in ONE batch, redo files them again', async () => {
    const { server, command } = await filed();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.updateParents).toHaveBeenCalledOnce();
    expect([server.row('a1').parentId, server.row('a2').parentId]).toEqual([null, null]);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect([server.row('a1').parentId, server.row('a2').parentId]).toEqual(['s1', 's1']);
    expect(server.mutations.updateParents).toHaveBeenCalledTimes(2);
  });

  it('a parent changed by somebody else sets the WHOLE step aside and writes nothing', async () => {
    const { server, command } = await filed();
    server.edit('a2', { parentId: null });
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Pour'));
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
    expect(server.row('a1').parentId).toBe('s1');
  });

  it('an unrelated field changed is no reason to refuse, and is left alone', async () => {
    const { server, command } = await filed();
    server.edit('a1', { name: 'Renamed' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.row('a1')).toMatchObject({ name: 'Renamed', parentId: null });
  });

  it('a row that is gone sets the whole step aside as gone', async () => {
    const { server, command } = await filed();
    server.remove('a1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
    expect(server.row('a2').parentId).toBe('s1');
  });

  it('ignores rows whose parent did not change, so a no-op batch is an empty step', async () => {
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')] });
    const row = server.row('a1');
    expect(reparentedRows([row], [row])).toEqual([]);
    const command = reparentCommand({
      before: [row],
      after: [row],
      updateParents: server.mutations.updateParents,
      label: 'Nothing',
    });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect(server.mutations.updateParents).not.toHaveBeenCalled();
  });

  it('an undo then a redo reads the live version each time', async () => {
    const { server, command } = await filed();
    server.edit('a1', { name: 'Renamed' });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    server.edit('a1', { description: 'Edited again' });
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
  });

  it('labels an Indent by the row and its destination, and a bulk move by the count', () => {
    const summary = A('s1', 'Substructure', { type: 'WBS_SUMMARY' });
    const one = A('a1', 'Excavate', { parentId: 's1' });
    const two = A('a2', 'Pour', { parentId: 's1' });
    expect(reparentLabel([one], [summary, one])).toBe('Move “Excavate” under “Substructure”');
    expect(reparentLabel([one, two], [summary, one, two])).toBe(
      'Move 2 activities under “Substructure”',
    );
    expect(reparentLabel([{ ...one, parentId: null }], [summary])).toBe(
      'Move “Excavate” to the top level',
    );
    expect(reparentLabel([one, { ...two, parentId: null }], [summary])).toBe('Move 2 activities');
  });
});

describe('stepsReplaceCommand', () => {
  const step = (seq: number, name: string, weight = 1, percentComplete = 0) =>
    aStep({ id: `old${seq}`, seq, name, weight, percentComplete });

  async function saved() {
    const before = [step(1, 'Form'), step(2, 'Pour')];
    const server = fakePlanServer({ activities: [A('a1', 'Excavate')], steps: { a1: before } });
    const after = await server.mutations.replaceSteps({
      activityId: 'a1',
      version: server.row('a1').version,
      steps: [
        { name: 'Form', weight: 1, percentComplete: 100 },
        { name: 'Pour', weight: 1, percentComplete: 0 },
        { name: 'Strip', weight: 2, percentComplete: 0 },
      ],
    });
    server.mutations.replaceSteps.mockClear();
    const command = stepsReplaceCommand({
      activity: { id: 'a1', name: 'Excavate' },
      before,
      after,
      replaceSteps: server.mutations.replaceSteps,
    });
    return { server, command, before, after };
  }

  it('clean replay: undo puts the earlier list back, redo the saved one, at the live version', async () => {
    const { server, command } = await saved();
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
    expect((await server.ctx.readSteps('a1'))?.map((s) => s.name)).toEqual(['Form', 'Pour']);
    expect(await command.redo(server.ctx)).toEqual(APPLIED);
    expect((await server.ctx.readSteps('a1'))?.map((s) => s.name)).toEqual([
      'Form',
      'Pour',
      'Strip',
    ]);
  });

  it('a step edited by somebody else sets the step aside and writes nothing', async () => {
    const { server, command, after } = await saved();
    server.setSteps(
      'a1',
      after.map((s) => (s.name === 'Pour' ? { ...s, percentComplete: 50 } : s)),
    );
    expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Excavate'));
    expect(server.mutations.replaceSteps).not.toHaveBeenCalled();
  });

  it('a step added by somebody else is a change too', async () => {
    const { server, command, after } = await saved();
    server.setSteps('a1', [...after, aStep({ id: 'x', seq: 4, name: 'Theirs' })]);
    expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
    expect(server.mutations.replaceSteps).not.toHaveBeenCalled();
  });

  it('an unrelated field on the activity changed is no reason to refuse', async () => {
    const { server, command } = await saved();
    server.edit('a1', { name: 'Renamed', percentComplete: 40 });
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('an activity that is gone sets the step aside as gone', async () => {
    const { server, command } = await saved();
    server.remove('a1');
    expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
    expect(server.mutations.replaceSteps).not.toHaveBeenCalled();
  });

  it('compares what was saved, not step ids — a replace re-creates them', async () => {
    const { server, command, after } = await saved();
    // The same list, as if saved again by somebody else: new ids, same content.
    server.setSteps(
      'a1',
      after.map((s, i) => ({ ...s, id: `fresh${i}` })),
    );
    expect(await command.undo(server.ctx)).toEqual(APPLIED);
  });

  it('knows a save that changed nothing is not a step', () => {
    const list = [step(1, 'Form')];
    expect(stepsChanged(list, [{ ...list[0]!, id: 'other' }])).toBe(false);
    expect(stepsChanged(list, [step(1, 'Form', 1, 10)])).toBe(true);
  });
});

describe('assignment commands', () => {
  const writes = (server: ReturnType<typeof fakePlanServer>) => ({
    createAssignment: server.mutations.createAssignment,
    updateAssignment: server.mutations.updateAssignment,
    deleteAssignment: server.mutations.deleteAssignment,
  });
  const idOf = (server: ReturnType<typeof fakePlanServer>, resourceId: string) =>
    [...server.assignments.values()].find((a) => a.resourceId === resourceId);

  describe('add', () => {
    async function assigned(seed: AssignmentSeed[] = []) {
      const server = fakePlanServer({
        activities: [A('a1', 'Excavate')],
        assignments: seed.map((over) => anAssignment(over)),
      });
      const displaced = [...server.assignments.values()].find((a) => a.isDriving);
      const created = await server.mutations.createAssignment({
        activityId: 'a1',
        body: { resourceId: 'r2', budgetedUnits: 16, isDriving: displaced !== undefined },
      });
      server.mutations.createAssignment.mockClear();
      const command = assignmentAddCommand({
        assignment: created,
        resourceName: 'Crane',
        activityName: 'Excavate',
        ...(displaced ? { displaced: { assignment: displaced, resourceName: 'Digger' } } : {}),
        writes: writes(server),
      });
      return { server, command };
    }

    it('clean replay: undo unassigns it, redo assigns it again (found by resource, not id)', async () => {
      const { server, command } = await assigned();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r2')).toBeUndefined();
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r2')).toMatchObject({ budgetedUnits: 16 });
      // A re-created assignment has a NEW id; the next undo still finds it.
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r2')).toBeUndefined();
    });

    it('an assignment edited since sets the step aside and deletes nothing', async () => {
      const { server, command } = await assigned();
      server.editAssignment(idOf(server, 'r2')!.id, { budgetedUnits: 99 });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Crane'));
      expect(server.mutations.deleteAssignment).not.toHaveBeenCalled();
    });

    it('an assignment already gone sets the step aside as gone', async () => {
      const { server, command } = await assigned();
      server.removeAssignment(idOf(server, 'r2')!.id);
      expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Crane'));
    });

    it('an activity that is gone names the activity', async () => {
      const { server, command } = await assigned();
      server.remove('a1');
      expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Excavate'));
    });

    it('a redo whose resource is now assigned is set aside as a duplicate', async () => {
      const { server, command } = await assigned();
      await command.undo(server.ctx);
      await server.mutations.createAssignment({
        activityId: 'a1',
        body: { resourceId: 'r2', budgetedUnits: 1, isDriving: false },
      });
      expect(await command.redo(server.ctx)).toEqual(notApplicable('duplicate', 'Crane'));
    });

    it('an assign that took over driving gives the previous driver back on undo', async () => {
      const { server, command } = await assigned([
        { id: 'as1', resourceId: 'r1', isDriving: true },
      ]);
      expect(idOf(server, 'r1')?.isDriving).toBe(false);
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r1')?.isDriving).toBe(true);
      expect(idOf(server, 'r2')).toBeUndefined();
    });

    it('is all-or-nothing: a displaced driver changed since writes neither row', async () => {
      const { server, command } = await assigned([
        { id: 'as1', resourceId: 'r1', isDriving: true },
      ]);
      server.editAssignment('as1', { isDriving: true });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Digger'));
      expect(server.mutations.updateAssignment).not.toHaveBeenCalled();
      expect(server.mutations.deleteAssignment).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    async function removed() {
      const server = fakePlanServer({
        activities: [A('a1', 'Excavate')],
        assignments: [anAssignment({ id: 'as1', resourceId: 'r1', budgetedUnits: 12 })],
      });
      const gone = anAssignment({ id: 'as1', resourceId: 'r1', budgetedUnits: 12 });
      await server.mutations.deleteAssignment({ assignmentId: 'as1', activityId: 'a1' });
      server.mutations.deleteAssignment.mockClear();
      const command = assignmentRemoveCommand({
        assignment: gone,
        resourceName: 'Digger',
        activityName: 'Excavate',
        writes: writes(server),
      });
      return { server, command };
    }

    it('clean replay: undo assigns it again with what it held, redo unassigns it', async () => {
      const { server, command } = await removed();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r1')).toMatchObject({ budgetedUnits: 12 });
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r1')).toBeUndefined();
    });

    it('an undo whose resource has been assigned since is set aside as a duplicate', async () => {
      const { server, command } = await removed();
      await server.mutations.createAssignment({
        activityId: 'a1',
        body: { resourceId: 'r1', budgetedUnits: 3, isDriving: false },
      });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('duplicate', 'Digger'));
    });

    it('a redo whose assignment was changed since is set aside and deletes nothing', async () => {
      const { server, command } = await removed();
      await command.undo(server.ctx);
      server.editAssignment(idOf(server, 'r1')!.id, { lagMinutes: 60 });
      expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Digger'));
      expect(server.mutations.deleteAssignment).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    async function edited(options: {
      patch: EditPatch;
      seed?: AssignmentSeed[];
      editedField?: 'UNITS' | 'UNITS_PER_HOUR';
      displacedId?: string;
    }) {
      const server = fakePlanServer({
        activities: [A('a1', 'Excavate')],
        assignments: (options.seed ?? [{ id: 'as1', resourceId: 'r1' }]).map((over) =>
          anAssignment(over),
        ),
      });
      const before = { ...server.assignments.get('as1')! };
      const displaced =
        options.displacedId === undefined
          ? undefined
          : { ...server.assignments.get(options.displacedId)! };
      const after = await server.mutations.updateAssignment({
        assignmentId: 'as1',
        activityId: 'a1',
        version: before.version,
        ...options.patch,
      });
      server.mutations.updateAssignment.mockClear();
      const command = assignmentEditCommand({
        before,
        after,
        resourceName: 'Digger',
        activityName: 'Excavate',
        writes: writes(server),
        ...(options.editedField ? { editedField: options.editedField } : {}),
        ...(displaced ? { displaced: { assignment: displaced, resourceName: 'Crane' } } : {}),
      });
      return { server, command, before, after };
    }
    it('clean replay: undo restores the field, redo re-applies it, at the live version', async () => {
      const { server, command } = await edited({ patch: { budgetedUnits: 40 } });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as1')?.budgetedUnits).toBe(8);
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as1')?.budgetedUnits).toBe(40);
    });

    it('writes only the fields the edit changed', async () => {
      const { server, command } = await edited({ patch: { lagMinutes: 120 } });
      await command.undo(server.ctx);
      const sent = server.mutations.updateAssignment.mock.calls[0]?.[0];
      expect(sent).toMatchObject({ assignmentId: 'as1', lagMinutes: 0 });
      expect(sent).not.toHaveProperty('budgetedUnits');
      expect(sent).not.toHaveProperty('isDriving');
    });

    it('a field the edit wrote having been changed since sets the step aside', async () => {
      const { server, command } = await edited({ patch: { budgetedUnits: 40 } });
      server.editAssignment('as1', { budgetedUnits: 55 });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Digger'));
      expect(server.mutations.updateAssignment).not.toHaveBeenCalled();
    });

    it('an unrelated field changed since is no reason to refuse, and is left alone', async () => {
      const { server, command } = await edited({ patch: { budgetedUnits: 40 } });
      server.editAssignment('as1', { lagMinutes: 30 });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as1')).toMatchObject({ budgetedUnits: 8, lagMinutes: 30 });
    });

    it('an assignment that is gone sets the step aside as gone', async () => {
      const { server, command } = await edited({ patch: { budgetedUnits: 40 } });
      server.removeAssignment('as1');
      expect(await command.undo(server.ctx)).toEqual(notApplicable('gone', 'Digger'));
    });

    it('replays the triad field the forward write named, so the server recomputes', async () => {
      const { server, command } = await edited({
        seed: [{ id: 'as1', resourceId: 'r1', isDriving: true, unitsPerHour: 2 }],
        patch: { budgetedUnits: 40 },
        editedField: 'UNITS',
      });
      await command.undo(server.ctx);
      expect(server.mutations.updateAssignment.mock.calls[0]?.[0]).toMatchObject({
        budgetedUnits: 8,
        editedField: 'UNITS',
      });
    });

    it('does not name an edited field the edit did not change', async () => {
      const { server, command } = await edited({
        patch: { lagMinutes: 120 },
        editedField: 'UNITS',
      });
      await command.undo(server.ctx);
      expect(server.mutations.updateAssignment.mock.calls[0]?.[0]).not.toHaveProperty(
        'editedField',
      );
    });

    it('a PATCH cannot clear a rate, so undoing "set a rate" re-creates the assignment without one', async () => {
      const { server, command } = await edited({
        seed: [{ id: 'as1', resourceId: 'r1', isDriving: true, unitsPerHour: null }],
        patch: { unitsPerHour: 3 },
      });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.mutations.deleteAssignment).toHaveBeenCalledOnce();
      expect(idOf(server, 'r1')).toMatchObject({ unitsPerHour: null, isDriving: true });
      // The re-created row has a new id; redo still finds it by resource.
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(idOf(server, 'r1')?.unitsPerHour).toBe(3);
    });

    it('making a resource the driver is undone by restoring the previous driver', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: false },
          { id: 'as2', resourceId: 'r2', isDriving: true },
        ],
        patch: { isDriving: true },
        displacedId: 'as2',
      });
      expect(server.assignments.get('as2')?.isDriving).toBe(false);
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as1')?.isDriving).toBe(false);
      expect(server.assignments.get('as2')?.isDriving).toBe(true);
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as1')?.isDriving).toBe(true);
      expect(server.assignments.get('as2')?.isDriving).toBe(false);
    });

    it('is all-or-nothing about the displaced driver: if it changed, neither row is written', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: false },
          { id: 'as2', resourceId: 'r2', isDriving: true },
        ],
        patch: { isDriving: true, budgetedUnits: 20 },
        displacedId: 'as2',
      });
      server.editAssignment('as2', { isDriving: true });
      expect(await command.undo(server.ctx)).toEqual(notApplicable('changed', 'Crane'));
      expect(server.mutations.updateAssignment).not.toHaveBeenCalled();
    });

    /**
     * Review B1: a write that makes this row the driver clears WHOEVER drives now, and the step used to
     * neither compare nor remember that. A colleague who made somebody else the driver since must stop
     * the redo, with nothing written, rather than be displaced without a word.
     */
    it('a redo that would displace a driver the step never met is set aside, writing nothing', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: false },
          { id: 'as2', resourceId: 'r2', isDriving: true },
          { id: 'as3', resourceId: 'r3', isDriving: false },
        ],
        patch: { isDriving: true },
        displacedId: 'as2',
      });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      // A colleague hands the pen's driver role to somebody else.
      server.editAssignment('as2', { isDriving: false });
      server.editAssignment('as3', { isDriving: true });
      server.mutations.updateAssignment.mockClear();
      expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Crane'));
      expect(server.mutations.updateAssignment).not.toHaveBeenCalled();
      expect(server.assignments.get('as3')?.isDriving).toBe(true);
    });

    it('a redo that finds nobody driving displaces nobody, and the next undo writes only this row', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: false },
          { id: 'as2', resourceId: 'r2', isDriving: true },
        ],
        patch: { isDriving: true },
        displacedId: 'as2',
      });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      server.editAssignment('as2', { isDriving: false });
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      server.mutations.updateAssignment.mockClear();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      // The driver the ORIGINAL edit met is not put back: it was not displaced this time.
      expect(server.assignments.get('as2')?.isDriving).toBe(false);
      expect(server.mutations.updateAssignment).toHaveBeenCalledTimes(1);
    });

    it('remembers whoever the redo displaced, so the next undo gives THAT driver back', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: false },
          { id: 'as2', resourceId: 'r2', isDriving: true },
        ],
        patch: { isDriving: true },
        displacedId: 'as2',
      });
      await command.undo(server.ctx);
      await command.redo(server.ctx);
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(server.assignments.get('as2')?.isDriving).toBe(true);
      expect(server.assignments.get('as1')?.isDriving).toBe(false);
    });

    it('undoing "stopped driving" is set aside when somebody else drives now', async () => {
      const { server, command } = await edited({
        seed: [
          { id: 'as1', resourceId: 'r1', isDriving: true },
          { id: 'as2', resourceId: 'r2', isDriving: false },
        ],
        patch: { isDriving: false },
      });
      server.editAssignment('as2', { isDriving: true });
      server.mutations.updateAssignment.mockClear();
      expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
      expect(server.mutations.updateAssignment).not.toHaveBeenCalled();
    });

    /**
     * Review B2: a PATCH cannot clear a rate, so the step deletes and re-creates, and the delete is
     * unversioned. A create that fails afterwards must not leave the resource unassigned.
     */
    describe('re-creating an assignment to clear its rate', () => {
      const rateSet = () =>
        edited({
          seed: [{ id: 'as1', resourceId: 'r1', isDriving: true, unitsPerHour: null }],
          patch: { unitsPerHour: 3 },
        });
      const refused = () => new ApiFetchError(422, { code: 'VALIDATION', message: 'Refused.' });

      it('a failed create is compensated from the row that was read, and reported as such', async () => {
        const { server, command } = await rateSet();
        server.mutations.createAssignment.mockRejectedValueOnce(refused());
        await expect(command.undo(server.ctx)).rejects.toThrow(/put back as it was/);
        expect(idOf(server, 'r1')).toMatchObject({ unitsPerHour: 3, isDriving: true });
      });

      it('says so when it could not be put back either', async () => {
        const { server, command } = await rateSet();
        server.mutations.createAssignment
          .mockRejectedValueOnce(refused())
          .mockRejectedValueOnce(refused());
        await expect(command.undo(server.ctx)).rejects.toThrow(/could not be put back/);
        expect(idOf(server, 'r1')).toBeUndefined();
      });

      it('a lost pen is rethrown as it is, for the pen contract', async () => {
        const { server, command } = await rateSet();
        const locked = new ApiFetchError(423, { code: 'LOCKED', message: 'No pen.' });
        server.mutations.createAssignment.mockRejectedValueOnce(locked);
        await expect(command.undo(server.ctx)).rejects.toBe(locked);
        expect(idOf(server, 'r1')).toMatchObject({ unitsPerHour: 3 });
      });
    });

    /** Review S3: a PATCH cannot write a null actual cost, so the step is refused, not half-undone. */
    it('a target the PATCH cannot express is set aside, not reported as applied', async () => {
      const before = anAssignment({ id: 'as1', actualCost: 5 });
      const after = anAssignment({ id: 'as1', actualCost: null, version: 2 });
      const server = fakePlanServer({ activities: [A('a1', 'Excavate')], assignments: [after] });
      const command = assignmentEditCommand({
        before,
        after,
        resourceName: 'Digger',
        activityName: 'Excavate',
        writes: writes(server),
      });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      // Redo would have to write a null the endpoint cannot take.
      expect(await command.redo(server.ctx)).toEqual(notApplicable('changed', 'Digger'));
    });

    it('an edit that changed nothing is not a step', () => {
      const row = anAssignment();
      expect(assignmentChanged(row, { ...row, version: 2 })).toBe(false);
      expect(assignmentChanged(row, { ...row, budgetedUnits: 9 })).toBe(true);
    });
  });
});

describe('cross-plan link commands', () => {
  const links = (server: ReturnType<typeof fakePlanServer>) => ({
    createLink: server.mutations.createCrossPlanLink,
    deleteLink: server.mutations.deleteCrossPlanLink,
  });
  const live = (server: ReturnType<typeof fakePlanServer>) => [...server.crossPlanLinks.values()];

  describe('add', () => {
    async function added() {
      const server = fakePlanServer({
        activities: [A('a1', 'Excavate'), A('o1', 'Other plan work', { planId: 'p2' })],
      });
      const link = await server.mutations.createCrossPlanLink({
        predecessorActivityId: 'o1',
        successorActivityId: 'a1',
        type: 'FS',
        lagDays: 2,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      server.mutations.createCrossPlanLink.mockClear();
      return { server, command: crossPlanLinkAddCommand({ link, ...links(server) }), link };
    }

    it('clean replay: undo removes the link, redo adds it again with the same type and lag', async () => {
      const { server, command } = await added();
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(live(server)).toHaveLength(0);
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(live(server)).toHaveLength(1);
      expect(live(server)[0]).toMatchObject({ type: 'FS', lagDays: 2 });
      // A re-created link has a new id; the next undo tracks it.
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(live(server)).toHaveLength(0);
    });

    it('a link changed since sets the step aside and deletes nothing', async () => {
      const { server, command, link } = await added();
      server.editCrossPlanLink(link.id, { type: 'SS' });
      expect((await command.undo(server.ctx)).kind).toBe('not-applicable');
      expect(server.mutations.deleteCrossPlanLink).not.toHaveBeenCalled();
    });

    it('a link already gone sets the step aside as gone', async () => {
      const { server, command, link } = await added();
      server.removeCrossPlanLink(link.id);
      expect(await command.undo(server.ctx)).toEqual(
        notApplicable('gone', 'Other plan work → Excavate'),
      );
    });

    it('a redo whose upstream activity was deleted names the one that is gone', async () => {
      const { server, command } = await added();
      await command.undo(server.ctx);
      server.remove('o1');
      expect(await command.redo(server.ctx)).toEqual(notApplicable('gone', 'Other plan work'));
      expect(server.mutations.createCrossPlanLink).not.toHaveBeenCalled();
    });

    it('a redo the server refuses for a programme cycle reads as "cannot be made now"', async () => {
      const { server, command } = await added();
      await command.undo(server.ctx);
      server.mutations.createCrossPlanLink.mockRejectedValueOnce(
        new ApiFetchError(409, {
          code: 'CONFLICT',
          message: 'Cycle.',
          details: { reason: 'CROSS_PLAN_CYCLE_DETECTED' },
        }),
      );
      expect(await command.redo(server.ctx)).toEqual(
        notApplicable('duplicate', 'Other plan work → Excavate'),
      );
    });

    it('a redo the server refuses as a duplicate is set aside, not thrown', async () => {
      const { server, command } = await added();
      await command.undo(server.ctx);
      await server.mutations.createCrossPlanLink({
        predecessorActivityId: 'o1',
        successorActivityId: 'a1',
        type: 'FS',
        lagDays: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      expect(await command.redo(server.ctx)).toEqual(
        notApplicable('duplicate', 'Other plan work → Excavate'),
      );
    });
  });

  describe('remove', () => {
    it('clean replay: undo adds it again, redo removes it', async () => {
      const link = aCrossPlanLink({ id: 'x1', lagDays: 1, lagMinutes: 480 });
      const server = fakePlanServer({
        activities: [A('a1', 'Excavate'), A('o1', 'Other plan work', { planId: 'p2' })],
      });
      const command = crossPlanLinkRemoveCommand({ link, ...links(server) });
      expect(await command.undo(server.ctx)).toEqual(APPLIED);
      expect(live(server)[0]).toMatchObject({ type: 'FS', lagDays: 1 });
      expect(await command.redo(server.ctx)).toEqual(APPLIED);
      expect(live(server)).toHaveLength(0);
    });
  });
});
