import type { ActivityCodeAssignment, CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityCodesCommand,
  codeTypeAddCommand,
  codeTypeDeleteCommand,
  codeTypeRenameCommand,
  codeTypeReorderCommand,
  codeValueAddCommand,
  codeValueDeleteCommand,
  codeValueEditCommand,
  codeValueReorderCommand,
} from './code-commands';
import { historyResultMessage } from './history-result';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

const aType = (id: string, name: string, position: number, version = 1): CodeTypeSummary => ({
  id,
  planId: 'p1',
  name,
  position,
  version,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const aValue = (
  id: string,
  codeTypeId: string,
  shortCode: string,
  position: number,
  description: string | null = null,
): CodeValueSummary => ({
  id,
  codeTypeId,
  shortCode,
  description,
  position,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

function plan() {
  return fakePlanServer({
    codeTypes: [aType('area', 'Area', 0), aType('trade', 'Trade', 1)],
    codeValues: [
      aValue('l1', 'area', 'L1', 0, 'Level 1'),
      aValue('l2', 'area', 'L2', 1),
      aValue('civ', 'trade', 'CIV', 0),
    ],
  });
}

const typeNames = (server: ReturnType<typeof plan>): string[] =>
  server.liveCodeTypes().map((t) => t.name);
const valueCodes = (server: ReturnType<typeof plan>, typeId: string): string[] =>
  server.liveCodeValues(typeId).map((v) => v.shortCode);

describe('codeTypeAddCommand', () => {
  const made = (server: ReturnType<typeof plan>) => {
    const created = aType('system', 'System', 2);
    server.codeTypes.set(created.id, { ...created });
    const m = server.mutations;
    return {
      created,
      command: codeTypeAddCommand({
        created,
        remove: m.deleteCodeType,
        restore: m.restoreCodeType,
      }),
    };
  };

  it('undoes by deleting the type and redoes by restoring that same id', async () => {
    const server = plan();
    const { command } = made(server);
    expect(command.label).toBe('Add code type “System”');
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Area', 'Trade']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Area', 'Trade', 'System']);
  });

  it('is set aside, writing nothing, when a colleague renamed the type or deleted it', async () => {
    const server = plan();
    const { created, command } = made(server);
    server.editCodeType(created.id, { name: 'Systems' });
    expect(await command.undo(server.ctx)).toEqual({
      kind: 'not-applicable',
      reason: 'changed',
      subjectName: 'System',
    });
    expect(server.mutations.deleteCodeType).not.toHaveBeenCalled();

    const other = plan();
    const second = made(other);
    other.codeTypes.get(second.created.id)!.deletedAt = '2026-01-01T00:00:00Z';
    expect(await second.command.undo(other.ctx)).toMatchObject({ reason: 'gone' });
  });

  it('is labelled Restore when it records a restore from the Deleted list', () => {
    const server = plan();
    const command = codeTypeAddCommand({
      created: aType('area', 'Area', 0),
      remove: server.mutations.deleteCodeType,
      restore: server.mutations.restoreCodeType,
      restored: true,
    });
    expect(command.label).toBe('Restore code type “Area”');
  });
});

describe('codeTypeRenameCommand', () => {
  it('writes the other name with the row’s current version, in both directions', async () => {
    const server = plan();
    const after = await server.mutations.renameCodeType({
      codeTypeId: 'area',
      name: 'Zone',
      version: 1,
    });
    const command = codeTypeRenameCommand({
      codeTypeId: 'area',
      before: 'Area',
      after,
      rename: server.mutations.renameCodeType,
    });
    expect(command.label).toBe('Rename code type “Area”');
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Area', 'Trade']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Zone', 'Trade']);
  });

  it('is set aside when the name is no longer the one the step left', async () => {
    const server = plan();
    const after = await server.mutations.renameCodeType({
      codeTypeId: 'area',
      name: 'Zone',
      version: 1,
    });
    const command = codeTypeRenameCommand({
      codeTypeId: 'area',
      before: 'Area',
      after,
      rename: server.mutations.renameCodeType,
    });
    server.editCodeType('area', { name: 'Region' });
    expect(await command.undo(server.ctx)).toMatchObject({
      kind: 'not-applicable',
      reason: 'changed',
    });
  });
});

describe('codeTypeReorderCommand', () => {
  it('restores the order the step started from', async () => {
    const server = plan();
    const before = server.liveCodeTypes();
    const after = await server.mutations.reorderCodeTypes({
      order: [
        { id: 'trade', version: 1 },
        { id: 'area', version: 1 },
      ],
    });
    const command = codeTypeReorderCommand({
      before,
      after,
      movedName: 'Trade',
      reorder: server.mutations.reorderCodeTypes,
    });
    expect(typeNames(server)).toEqual(['Trade', 'Area']);
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Area', 'Trade']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Trade', 'Area']);
  });

  it('is set aside when a colleague has added a type since, rather than undoing their change too', async () => {
    const server = plan();
    const before = server.liveCodeTypes();
    const after = await server.mutations.reorderCodeTypes({
      order: [
        { id: 'trade', version: 1 },
        { id: 'area', version: 1 },
      ],
    });
    const command = codeTypeReorderCommand({
      before,
      after,
      movedName: 'Trade',
      reorder: server.mutations.reorderCodeTypes,
    });
    server.codeTypes.set('phase', aType('phase', 'Phase', 2));
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'changed' });
  });
});

describe('codeTypeDeleteCommand', () => {
  it('undoes by restoring the type with the values its delete took, and redoes by deleting again', async () => {
    const server = plan();
    const deleted = server.liveCodeTypes()[0]!;
    await server.mutations.deleteCodeType({ codeTypeId: 'area', version: 1 });
    const command = codeTypeDeleteCommand({
      deleted,
      remove: server.mutations.deleteCodeType,
      restore: server.mutations.restoreCodeType,
    });
    expect(command.label).toBe('Delete code type “Area”');
    expect(typeNames(server)).toEqual(['Trade']);
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Area', 'Trade']);
    expect(valueCodes(server, 'area')).toEqual(['L1', 'L2']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(typeNames(server)).toEqual(['Trade']);
  });

  it('redo is set aside when the type was renamed in between', async () => {
    const server = plan();
    const deleted = server.liveCodeTypes()[0]!;
    const command = codeTypeDeleteCommand({
      deleted,
      remove: server.mutations.deleteCodeType,
      restore: server.mutations.restoreCodeType,
    });
    server.editCodeType('area', { name: 'Zone' });
    expect(await command.redo(server.ctx)).toMatchObject({ reason: 'changed' });
  });
});

describe('codeValueAddCommand', () => {
  const made = (server: ReturnType<typeof plan>, restored = false) => {
    const created = aValue('l3', 'area', 'L3', 2);
    server.codeValues.set(created.id, { ...created });
    return {
      created,
      command: codeValueAddCommand({
        created,
        typeName: 'Area',
        remove: server.mutations.deleteCodeValue,
        restore: server.mutations.restoreCodeValue,
        restored,
      }),
    };
  };

  it('undoes by deleting the value and redoes by restoring that id', async () => {
    const server = plan();
    const { command } = made(server);
    expect(command.label).toBe('Add value “L3” to Area');
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(valueCodes(server, 'area')).toEqual(['L1', 'L2']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(valueCodes(server, 'area')).toEqual(['L1', 'L2', 'L3']);
  });

  it('says Restore … of Area when it records a restore', () => {
    expect(made(plan(), true).command.label).toBe('Restore value “L3” of Area');
  });

  it('is set aside as parent-deleted when redo meets a type that was deleted meanwhile', async () => {
    const server = plan();
    const { command } = made(server);
    await command.undo(server.ctx);
    await server.mutations.deleteCodeType({ codeTypeId: 'area' });
    expect(await command.redo(server.ctx)).toMatchObject({ reason: 'parent-deleted' });
  });

  it('is gone, not an error, when undo finds the whole type deleted', async () => {
    const server = plan();
    const { command } = made(server);
    await server.mutations.deleteCodeType({ codeTypeId: 'area' });
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'gone' });
  });
});

describe('codeValueEditCommand', () => {
  it('writes the short code and description back, clearing a description with null', async () => {
    const server = plan();
    const before = server.liveCodeValues('area')[0]!;
    const after = await server.mutations.editCodeValue({
      codeValueId: 'l1',
      codeTypeId: 'area',
      shortCode: 'L1A',
      description: null,
      version: before.version,
    });
    const command = codeValueEditCommand({
      before,
      after,
      edit: server.mutations.editCodeValue,
    });
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.liveCodeValues('area')[0]).toMatchObject({
      shortCode: 'L1',
      description: 'Level 1',
    });
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.liveCodeValues('area')[0]).toMatchObject({ shortCode: 'L1A', description: null });
  });

  it('is set aside when a colleague changed the description the step left', async () => {
    const server = plan();
    const before = server.liveCodeValues('area')[0]!;
    const after = await server.mutations.editCodeValue({
      codeValueId: 'l1',
      codeTypeId: 'area',
      shortCode: 'L1A',
      version: before.version,
    });
    const command = codeValueEditCommand({ before, after, edit: server.mutations.editCodeValue });
    server.editCodeValueRow('l1', { description: 'Level One' });
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'changed' });
  });
});

describe('codeValueReorderCommand', () => {
  it('restores the previous order of the type’s values, and refuses when the set changed', async () => {
    const server = plan();
    const before = server.liveCodeValues('area');
    const after = await server.mutations.reorderCodeValues({
      codeTypeId: 'area',
      order: [
        { id: 'l2', version: 1 },
        { id: 'l1', version: 1 },
      ],
    });
    const command = codeValueReorderCommand({
      codeTypeId: 'area',
      before,
      after,
      movedName: 'L2',
      reorder: server.mutations.reorderCodeValues,
    });
    expect(valueCodes(server, 'area')).toEqual(['L2', 'L1']);
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(valueCodes(server, 'area')).toEqual(['L1', 'L2']);
    await command.redo(server.ctx);
    server.codeValues.set('l3', aValue('l3', 'area', 'L3', 2));
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'changed' });
  });
});

describe('codeValueDeleteCommand', () => {
  it('undoes by restoring the value’s id and redoes by deleting it again', async () => {
    const server = plan();
    const deleted = server.liveCodeValues('area')[0]!;
    await server.mutations.deleteCodeValue({ codeValueId: 'l1', codeTypeId: 'area' });
    const command = codeValueDeleteCommand({
      deleted,
      remove: server.mutations.deleteCodeValue,
      restore: server.mutations.restoreCodeValue,
    });
    expect(command.label).toBe('Delete value “L1”');
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(valueCodes(server, 'area')).toEqual(['L1', 'L2']);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(valueCodes(server, 'area')).toEqual(['L2']);
  });

  it('undo is parent-deleted when the type was deleted after the value', async () => {
    const server = plan();
    const deleted = server.liveCodeValues('area')[0]!;
    await server.mutations.deleteCodeValue({ codeValueId: 'l1', codeTypeId: 'area' });
    const command = codeValueDeleteCommand({
      deleted,
      remove: server.mutations.deleteCodeValue,
      restore: server.mutations.restoreCodeValue,
    });
    await server.mutations.deleteCodeType({ codeTypeId: 'area' });
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'parent-deleted' });
  });
});

describe('activityCodesCommand', () => {
  const held = (...pairs: [string, string][]): ActivityCodeAssignment[] =>
    pairs.map(([codeTypeId, codeValueId]) => ({ codeTypeId, codeValueId }));

  /** Two activities coded Area = L1, then Area is set to L2 on both (the step under test). */
  function setTwo() {
    const server = fakePlanServer({
      codeTypes: [aType('area', 'Area', 0), aType('trade', 'Trade', 1)],
      codeValues: [
        aValue('l1', 'area', 'L1', 0, 'Level 1'),
        aValue('l2', 'area', 'L2', 1, 'Level 2'),
        aValue('civ', 'trade', 'CIV', 0),
      ],
      activities: [
        anActivity({ id: 'a1', name: 'Piling', codes: held(['area', 'l1'], ['trade', 'civ']) }),
        anActivity({ id: 'a2', name: 'Pour', codes: held(['area', 'l1']) }),
      ],
    });
    const steps = ['a1', 'a2'].map((id) => ({
      id,
      name: id === 'a1' ? 'Piling' : 'Pour',
      changes: [{ codeTypeId: 'area', before: 'l1', after: 'l2' }],
    }));
    const command = activityCodesCommand({
      steps,
      label: 'Set Area on 2 activities',
      valueNames: new Map([
        ['l1', 'Level 1'],
        ['l2', 'Level 2'],
      ]),
      write: server.mutations.writeActivityCodes,
    });
    return { server, command };
  }

  const areaOf = (server: ReturnType<typeof plan>, id: string): string | undefined =>
    server.row(id).codes?.find((c) => c.codeTypeId === 'area')?.codeValueId;

  it('writes the before-state on undo and the after-state on redo, as one request each', async () => {
    const { server, command } = setTwo();
    await server.mutations.writeActivityCodes({
      activities: [
        { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
      ],
    });
    server.mutations.writeActivityCodes.mockClear();
    expect(command.affectsSchedule).toBe(false);
    expect(command.subjects).toEqual(['a1', 'a2']);

    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.writeActivityCodes).toHaveBeenCalledTimes(1);
    expect(areaOf(server, 'a1')).toBe('l1');
    expect(areaOf(server, 'a2')).toBe('l1');
    // The other type the activity carries was never in the step, so it is untouched.
    expect(server.row('a1').codes).toContainEqual({ codeTypeId: 'trade', codeValueId: 'civ' });

    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
    expect(areaOf(server, 'a1')).toBe('l2');
  });

  it('sends the rows’ CURRENT versions, not the ones it remembers', async () => {
    const { server, command } = setTwo();
    await server.mutations.writeActivityCodes({
      activities: [
        { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
      ],
    });
    // A colleague edits an unrelated field of a1, which moves its version on.
    server.edit('a1', { name: 'Piling (rev)' });
    server.mutations.writeActivityCodes.mockClear();
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.mutations.writeActivityCodes.mock.calls[0]?.[0].activities[0]?.version).toBe(3);
  });

  it('is set aside, writing nothing, when a colleague changed a touched type since', async () => {
    const { server, command } = setTwo();
    await server.mutations.writeActivityCodes({
      activities: [
        { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
      ],
    });
    server.mutations.writeActivityCodes.mockClear();
    server.edit('a2', { codes: held(['area', 'l1']) });
    expect(await command.undo(server.ctx)).toEqual({
      kind: 'not-applicable',
      reason: 'changed',
      subjectName: 'Pour',
    });
    expect(server.mutations.writeActivityCodes).not.toHaveBeenCalled();
  });

  it('does NOT mind a colleague changing a type the step never touched', async () => {
    const { server, command } = setTwo();
    await server.mutations.writeActivityCodes({
      activities: [
        { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
      ],
    });
    server.edit('a1', { codes: held(['area', 'l2']) });
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
  });

  it('says gone for an activity deleted since', async () => {
    const { server, command } = setTwo();
    await server.mutations.writeActivityCodes({
      activities: [
        { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
      ],
    });
    server.remove('a1');
    expect(await command.undo(server.ctx)).toMatchObject({ reason: 'gone', subjectName: 'Piling' });
  });

  it('reads an activity with no codes key, or an empty one, as holding nothing', async () => {
    const server = fakePlanServer({
      codeTypes: [aType('area', 'Area', 0)],
      codeValues: [aValue('l1', 'area', 'L1', 0)],
      activities: [anActivity({ id: 'a1', name: 'Piling' })],
    });
    const command = activityCodesCommand({
      steps: [
        {
          id: 'a1',
          name: 'Piling',
          changes: [{ codeTypeId: 'area', before: null, after: 'l1' }],
        },
      ],
      label: 'Set Area on “Piling”',
      valueNames: new Map(),
      write: server.mutations.writeActivityCodes,
    });
    await server.mutations.writeActivityCodes({
      activities: [{ id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l1' }] }],
    });
    expect(await command.undo(server.ctx)).toEqual({ kind: 'applied' });
    expect(server.row('a1').codes).toEqual([]);
    expect(await command.redo(server.ctx)).toEqual({ kind: 'applied' });
  });

  describe('a value deleted since (the server’s 422)', () => {
    it('sets the step aside as value-deleted, naming the value and the way back', async () => {
      const { server, command } = setTwo();
      await server.mutations.writeActivityCodes({
        activities: [
          { id: 'a1', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
          { id: 'a2', version: 1, codes: [{ codeTypeId: 'area', codeValueId: 'l2' }] },
        ],
      });
      // Undo's target is Level 1. Deleting it leaves the activities' after-state (Level 2) intact, so
      // the check passes and only the server's refusal can catch it.
      server.codeValues.get('l1')!.deletedAt = '2026-01-01T00:00:00Z';
      const result = await command.undo(server.ctx);
      expect(result).toEqual({
        kind: 'not-applicable',
        reason: 'value-deleted',
        subjectName: 'Level 1',
      });
      expect(
        historyResultMessage({
          direction: 'undo',
          outcome: 'set-aside',
          label: command.label,
          setAside: { reason: 'value-deleted', subjectName: 'Level 1', nextLabel: null },
        }),
      ).toBe(
        'Couldn’t undo set Area on 2 activities — Level 1 was deleted. Restore it in Codes… to set it again. That step was skipped.',
      );
    });

    it('treats a wrong-type refusal the same way', async () => {
      const write = vi.fn(() =>
        Promise.reject(
          new ApiFetchError(422, {
            code: 'VALIDATION_ERROR',
            message: 'That value does not belong to Area.',
            details: { reason: 'CODE_VALUE_WRONG_TYPE' },
          }),
        ),
      );
      const server = fakePlanServer({
        activities: [anActivity({ id: 'a1', name: 'Piling', codes: held(['area', 'l2']) })],
      });
      const command = activityCodesCommand({
        steps: [
          {
            id: 'a1',
            name: 'Piling',
            changes: [{ codeTypeId: 'area', before: 'l1', after: 'l2' }],
          },
        ],
        label: 'Set Area on “Piling”',
        valueNames: new Map([['l1', 'Level 1']]),
        write,
      });
      expect(await command.undo(server.ctx)).toMatchObject({ reason: 'value-deleted' });
    });

    it('still rethrows a 422 that is not about a value, so the history keeps the step', async () => {
      const write = vi.fn(() =>
        Promise.reject(
          new ApiFetchError(422, { code: 'VALIDATION_ERROR', message: 'Bad.', details: {} }),
        ),
      );
      const server = fakePlanServer({
        activities: [anActivity({ id: 'a1', name: 'Piling', codes: held(['area', 'l2']) })],
      });
      const command = activityCodesCommand({
        steps: [
          {
            id: 'a1',
            name: 'Piling',
            changes: [{ codeTypeId: 'area', before: null, after: 'l2' }],
          },
        ],
        label: 'x',
        valueNames: new Map(),
        write,
      });
      await expect(command.undo(server.ctx)).rejects.toBeInstanceOf(ApiFetchError);
    });
  });
});
