import type { ActivityCodeLaneSummary, ActivitySwimlaneLaneSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  guestCodePlacement,
  guestCodeSwimlaneList,
  guestSwimlaneList,
  guestSwimlanePlacement,
} from './guest-swimlanes';

const A = 'lane-a';
const B = 'lane-b';

function row(
  basis: ActivitySwimlaneLaneSummary['basis'],
  swimlaneId: string | null,
  laneIndex: number,
): ActivitySwimlaneLaneSummary {
  return {
    basis,
    swimlaneId,
    summaryActivityId: null,
    wbsLevel: null,
    laneIndex,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('guestSwimlaneList', () => {
  const live = [
    { id: A, name: 'Mechanical', position: 0 },
    { id: B, name: 'Electrical', position: 1 },
  ];

  it('is the live list, narrowed to id and name, for a hand-made plan', () => {
    expect(guestSwimlaneList('MANUAL', live)).toEqual([
      { id: A, name: 'Mechanical' },
      { id: B, name: 'Electrical' },
    ]);
  });

  it.each(['NONE', 'WBS'] as const)('is empty for a %s source', (source) => {
    expect(guestSwimlaneList(source, live)).toEqual([]);
  });
});

describe('guestSwimlanePlacement', () => {
  const known = new Set([A, B]);

  it('reads the SWIMLANE row of the swimlane the activity is in', () => {
    const lanes = [row('NO_SWIMLANE', null, 9), row('SWIMLANE', B, 3), row('SWIMLANE', A, 1)];
    expect(guestSwimlanePlacement(known, { swimlaneId: A }, lanes)).toEqual({
      memberOfSwimlaneId: A,
      swimlaneLaneIndex: 1,
    });
  });

  it('files an unassigned activity under "No swimlane" on its NO_SWIMLANE row', () => {
    const lanes = [row('SWIMLANE', A, 1), row('NO_SWIMLANE', null, 4)];
    expect(guestSwimlanePlacement(known, { swimlaneId: null }, lanes)).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: 4,
    });
  });

  it('treats a deleted swimlane as "No swimlane" and never returns its id', () => {
    const lanes = [row('SWIMLANE', 'deleted', 6), row('NO_SWIMLANE', null, 2)];
    expect(guestSwimlanePlacement(known, { swimlaneId: 'deleted' }, lanes)).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: 2,
    });
  });

  it('says null, not 0, for an activity never placed on its basis (the absence of a row)', () => {
    expect(guestSwimlanePlacement(known, { swimlaneId: A }, [])).toEqual({
      memberOfSwimlaneId: A,
      swimlaneLaneIndex: null,
    });
  });

  it('places nothing when the plan shows no swimlanes, whatever the row is filed under', () => {
    expect(guestSwimlanePlacement(new Set(), { swimlaneId: A }, [row('SWIMLANE', A, 1)])).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: null,
    });
  });
});

describe('guestCodeSwimlaneList', () => {
  const values = [
    { id: 'gf', shortCode: 'GF', description: 'Ground floor' },
    { id: 'l1', shortCode: 'L1', description: null },
    { id: 'l2', shortCode: 'L2', description: 'Level 2' },
  ];

  it('is the values in use in value order, named by description else short code, id and name only', () => {
    const list = guestCodeSwimlaneList(values, [
      { type: 'TASK', valueId: 'l1' },
      { type: 'TASK', valueId: 'gf' },
    ]);
    expect(list).toEqual([
      { id: 'gf', name: 'Ground floor' },
      { id: 'l1', name: 'L1' },
    ]);
    expect(Object.keys(list[0] ?? {})).toEqual(['id', 'name']);
  });

  it('leaves out a value only a WBS summary carries, and a value that is not live', () => {
    const list = guestCodeSwimlaneList(values, [
      { type: 'WBS_SUMMARY', valueId: 'l2' },
      { type: 'TASK', valueId: 'deleted' },
    ]);
    expect(list).toEqual([]);
  });
});

describe('guestCodePlacement', () => {
  const known = new Set(['gf', 'l1']);
  const lane = (codeValueId: string | null, laneIndex: number): ActivityCodeLaneSummary => ({
    codeTypeId: 'area',
    codeValueId,
    laneIndex,
    updatedAt: '2026-07-01T00:00:00.000Z',
  });

  it('puts an activity in its value’s band, on the lane stored for that band', () => {
    expect(guestCodePlacement(known, { type: 'TASK' }, 'gf', [lane('gf', 2)])).toEqual({
      memberOfSwimlaneId: 'gf',
      swimlaneLaneIndex: 2,
    });
  });

  it('files an activity with no value under No <type> (null), on its none-band lane', () => {
    expect(guestCodePlacement(known, { type: 'TASK' }, undefined, [lane(null, 4)])).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: 4,
    });
  });

  it('says null, not 0, for an activity never placed in its band', () => {
    expect(guestCodePlacement(known, { type: 'TASK' }, 'l1', [])).toEqual({
      memberOfSwimlaneId: 'l1',
      swimlaneLaneIndex: null,
    });
  });

  it('files a value that is not a drawn band under none, and ignores the row kept for the value', () => {
    expect(guestCodePlacement(known, { type: 'TASK' }, 'l2', [lane('l2', 7)])).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: null,
    });
  });

  it('never makes a WBS summary a member, whatever it carries', () => {
    expect(guestCodePlacement(known, { type: 'WBS_SUMMARY' }, 'gf', [lane('gf', 1)])).toEqual({
      memberOfSwimlaneId: null,
      swimlaneLaneIndex: null,
    });
  });
});
