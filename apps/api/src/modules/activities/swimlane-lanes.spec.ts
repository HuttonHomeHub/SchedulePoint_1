import type { WbsNode } from '@repo/layout';
import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '../../common/errors/domain-errors';

import {
  attachSwimlaneLanes,
  deriveCodeLaneBasis,
  deriveLaneBasis,
  loadCodeSwimlaneLanes,
  loadSwimlaneLanes,
} from './swimlane-lanes';

const node = (id: string, parentId: string | null, type = 'TASK'): [string, WbsNode] => [
  id,
  { id, parentId, type },
];
const TREE: ReadonlyMap<string, WbsNode> = new Map([
  node('works', null, 'WBS_SUMMARY'),
  node('struct', 'works', 'WBS_SUMMARY'),
  node('pour', 'struct'),
  node('loose', null),
]);

describe('deriveLaneBasis', () => {
  it('refuses a lane while the plan has no swimlane source', () => {
    const error = (() => {
      try {
        deriveLaneBasis({ swimlaneSource: 'NONE', swimlaneWbsLevel: null }, 'a', null, TREE);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual({ reason: 'SWIMLANE_SOURCE_NONE' });
  });

  it('MANUAL: the swimlane the activity will be in, else No swimlane', () => {
    const plan = { swimlaneSource: 'MANUAL', swimlaneWbsLevel: null } as const;
    expect(deriveLaneBasis(plan, 'a', 'sw', TREE)).toEqual({
      basis: 'SWIMLANE',
      swimlaneId: 'sw',
      summaryActivityId: null,
      wbsLevel: null,
    });
    expect(deriveLaneBasis(plan, 'a', null, TREE)).toEqual({
      basis: 'NO_SWIMLANE',
      swimlaneId: null,
      summaryActivityId: null,
      wbsLevel: null,
    });
  });

  it('WBS: the summary at the level, and ignores the stored hand-made swimlane', () => {
    const at = (level: number, id: string) =>
      deriveLaneBasis({ swimlaneSource: 'WBS', swimlaneWbsLevel: level }, id, 'ignored', TREE);
    expect(at(1, 'pour')).toMatchObject({ basis: 'WBS_SUMMARY', summaryActivityId: 'works' });
    expect(at(2, 'pour')).toMatchObject({ basis: 'WBS_SUMMARY', summaryActivityId: 'struct' });
    expect(at(1, 'loose')).toEqual({
      basis: 'NO_WBS_SUMMARY',
      swimlaneId: null,
      summaryActivityId: null,
      wbsLevel: 1,
    });
  });

  it('WBS: a plan row with no level is refused rather than derived into a CHECK violation', () => {
    expect(() =>
      deriveLaneBasis({ swimlaneSource: 'WBS', swimlaneWbsLevel: null }, 'pour', null, TREE),
    ).toThrow(ValidationError);
  });
});

describe('loadSwimlaneLanes', () => {
  const row = (activityId: string, laneIndex: number) => ({
    activityId,
    basis: 'SWIMLANE' as const,
    swimlaneId: 'sw',
    summaryActivityId: null,
    wbsLevel: null,
    laneIndex,
    updatedAt: new Date('2026-10-23T10:00:00.000Z'),
  });

  it('issues no query for an empty page', async () => {
    const findMany = vi.fn();
    const lanes = await loadSwimlaneLanes({ activitySwimlaneLane: { findMany } } as never, []);
    expect(lanes.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reads the whole page in one query, scoped to the rows organisations', async () => {
    const findMany = vi.fn().mockResolvedValue([row('a', 1), row('a', 2), row('b', 3)]);
    const lanes = await loadSwimlaneLanes({ activitySwimlaneLane: { findMany } } as never, [
      { id: 'a', organizationId: 'o' },
      { id: 'b', organizationId: 'o' },
      { id: 'c', organizationId: 'o' },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where).toEqual({
      activityId: { in: ['a', 'b', 'c'] },
      organizationId: { in: ['o'] },
    });
    expect(lanes.get('a')?.map((l) => l.laneIndex)).toEqual([1, 2]);
    expect(lanes.get('a')?.[0]?.updatedAt).toBe('2026-10-23T10:00:00.000Z');
  });

  it('attaches [] to an activity that was never placed', () => {
    const attached = attachSwimlaneLanes([{ id: 'c' }], new Map());
    expect(attached).toEqual([{ id: 'c', swimlaneLanes: [] }]);
  });
});

describe('deriveCodeLaneBasis', () => {
  const live = new Set(['roof', 'l1']);

  it('is (type, the live value) for a carrier of a live value', () => {
    expect(deriveCodeLaneBasis('area', 'roof', live)).toEqual({
      codeTypeId: 'area',
      codeValueId: 'roof',
    });
  });

  it('is (type, null) for no value, and for a value that has been deleted', () => {
    expect(deriveCodeLaneBasis('area', null, live)).toEqual({
      codeTypeId: 'area',
      codeValueId: null,
    });
    expect(deriveCodeLaneBasis('area', 'gone', live).codeValueId).toBeNull();
  });

  it('is not reachable through the hand-made and WBS derivation', () => {
    expect(() =>
      deriveLaneBasis({ swimlaneSource: 'ACTIVITY_CODE', swimlaneWbsLevel: null }, 'a', null, TREE),
    ).toThrow(/by code/);
  });
});

describe('loadCodeSwimlaneLanes', () => {
  it('issues one statement for the page and orders each activity by type then value', async () => {
    const at = new Date('2026-10-30T10:00:00.000Z');
    const queryRaw = vi.fn().mockResolvedValue([
      { activityId: 'a', codeTypeId: 'b-type', codeValueId: 'v', laneIndex: 2, updatedAt: at },
      { activityId: 'a', codeTypeId: 'a-type', codeValueId: null, laneIndex: 1, updatedAt: at },
    ]);
    const lanes = await loadCodeSwimlaneLanes(
      { $queryRaw: queryRaw },
      { organizationId: 'o', planId: 'p' },
      ['a', 'c'],
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(lanes.get('a')?.map((l) => l.codeTypeId)).toEqual(['a-type', 'b-type']);
    expect(lanes.get('c')).toEqual([]);
  });

  it('issues none for an empty page', async () => {
    const queryRaw = vi.fn();
    await loadCodeSwimlaneLanes({ $queryRaw: queryRaw }, { organizationId: 'o', planId: 'p' }, []);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
