import type { ActivitySummary, CodeValueSummary, PlanCodeLane } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { codeSwimlaneInput } from './code-membership';

import { anActivity } from '@/test/activity-fixture';

const TYPE = { id: 'area', name: 'Area' };
const value = (id: string, shortCode: string, description: string | null = null) =>
  ({
    id,
    codeTypeId: 'area',
    shortCode,
    description,
    position: 0,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
  }) satisfies CodeValueSummary;

// In the order the API returns them (position, id).
const VALUES = [value('gf', 'GF', 'Ground floor'), value('l1', 'L1', 'Level 1'), value('l2', 'L2')];

const carrying = (id: string, valueId: string | null, over: Partial<ActivitySummary> = {}) =>
  anActivity({
    id,
    codes: valueId === null ? [] : [{ codeTypeId: 'area', codeValueId: valueId }],
    ...over,
  });

const laneEntry = (
  codeValueId: string | null,
  laneIndex: number,
  updatedAt = '2026-10-02T00:00:00.000Z',
) => ({
  codeTypeId: 'area',
  codeValueId,
  laneIndex,
  updatedAt,
});

describe('codeSwimlaneInput', () => {
  it('builds once per data change: the same inputs give the same object', () => {
    const activities = [carrying('a', 'gf')];
    const first = codeSwimlaneInput(activities, TYPE, VALUES);
    expect(codeSwimlaneInput(activities, TYPE, VALUES)).toBe(first);
    expect(codeSwimlaneInput([...activities], TYPE, VALUES)).not.toBe(first);
    expect(codeSwimlaneInput(activities, { ...TYPE, name: 'Zone' }, VALUES)).not.toBe(first);
    expect(codeSwimlaneInput(activities, TYPE, [...VALUES])).not.toBe(first);
    expect(codeSwimlaneInput(activities, TYPE, VALUES, new Map())).not.toBe(first);
  });

  it('is one swimlane per value in use, in value order, named description else short code', () => {
    const input = codeSwimlaneInput(
      [carrying('a', 'l2'), carrying('b', 'gf'), carrying('c', 'l2')],
      TYPE,
      VALUES,
    );
    expect(input.swimlanes).toEqual([
      { id: 'gf', name: 'Ground floor' },
      { id: 'l2', name: 'L2' },
    ]);
  });

  it('names the source, the type and the none swimlane', () => {
    expect(codeSwimlaneInput([], TYPE, VALUES)).toMatchObject({
      source: 'ACTIVITY_CODE',
      codeTypeId: 'area',
      codeTypeName: 'Area',
      noneName: 'No Area',
    });
  });

  it('files an activity with no value, or a value that is not live, under none', () => {
    const input = codeSwimlaneInput(
      [carrying('a', null), carrying('b', 'deleted-value'), carrying('c', 'gf')],
      TYPE,
      VALUES,
    );
    expect(input.membership.get('a')).toBeNull();
    expect(input.membership.get('b')).toBeNull();
    expect(input.membership.get('c')).toBe('gf');
  });

  it('reads only the value of its own type', () => {
    const input = codeSwimlaneInput(
      [anActivity({ id: 'a', codes: [{ codeTypeId: 'trade', codeValueId: 'gf' }] })],
      TYPE,
      VALUES,
    );
    expect(input.membership.get('a')).toBeNull();
  });

  it('puts a WBS summary in no swimlane whatever it carries, and does not count its value', () => {
    const input = codeSwimlaneInput(
      [carrying('sum', 'l1', { type: 'WBS_SUMMARY' }), carrying('t', 'gf')],
      TYPE,
      VALUES,
    );
    expect(input.membership.get('sum')).toBeNull();
    expect(input.swimlanes.map((s) => s.id)).toEqual(['gf']);
  });

  describe('the stored lane', () => {
    it('is the list’s entry for the activity’s current value', () => {
      const input = codeSwimlaneInput(
        [carrying('a', 'gf', { codeSwimlaneLanes: [laneEntry('gf', 3)] })],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.get('a')).toEqual({
        lane: 3,
        updatedAt: Date.parse('2026-10-02T00:00:00.000Z'),
      });
    });

    it('is the (type, none) entry for an activity with no value', () => {
      const input = codeSwimlaneInput(
        [carrying('a', null, { codeSwimlaneLanes: [laneEntry(null, 1)] })],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.get('a')).toMatchObject({ lane: 1 });
    });

    it('is the (type, none) entry for an activity whose value is not live', () => {
      const input = codeSwimlaneInput(
        [carrying('a', 'deleted-value', { codeSwimlaneLanes: [laneEntry(null, 2)] })],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.get('a')).toMatchObject({ lane: 2 });
    });

    it('is absent, so the lane is derived, when the entry is for a value the activity has left', () => {
      const input = codeSwimlaneInput(
        [carrying('a', 'l1', { codeSwimlaneLanes: [laneEntry('gf', 3)] })],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.has('a')).toBe(false);
    });

    it('is absent for an entry keyed to a value when the activity now has none, and vice versa', () => {
      const input = codeSwimlaneInput(
        [
          carrying('a', null, { codeSwimlaneLanes: [laneEntry('gf', 3)] }),
          carrying('b', 'gf', { codeSwimlaneLanes: [laneEntry(null, 3)] }),
        ],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.size).toBe(0);
    });

    it('ignores an entry for another type', () => {
      const input = codeSwimlaneInput(
        [
          carrying('a', 'gf', {
            codeSwimlaneLanes: [{ ...laneEntry('gf', 3), codeTypeId: 'trade' }],
          }),
        ],
        TYPE,
        VALUES,
      );
      expect(input.storedLanes.has('a')).toBe(false);
    });

    it('falls back to the plan-wide lane when the list has none, under the same rule', () => {
      const planLanes = new Map<string, PlanCodeLane>([
        [
          'a',
          {
            activityId: 'a',
            codeValueId: 'gf',
            laneIndex: 5,
            updatedAt: '2026-10-03T00:00:00.000Z',
          },
        ],
        [
          'b',
          {
            activityId: 'b',
            codeValueId: 'gf',
            laneIndex: 6,
            updatedAt: '2026-10-03T00:00:00.000Z',
          },
        ],
      ]);
      const input = codeSwimlaneInput(
        [carrying('a', 'gf'), carrying('b', 'l1')],
        TYPE,
        VALUES,
        planLanes,
      );
      expect(input.storedLanes.get('a')).toMatchObject({ lane: 5 });
      expect(input.storedLanes.has('b')).toBe(false);
    });

    it('prefers the list’s entry over the plan-wide one', () => {
      const planLanes = new Map<string, PlanCodeLane>([
        [
          'a',
          {
            activityId: 'a',
            codeValueId: 'gf',
            laneIndex: 5,
            updatedAt: '2026-10-03T00:00:00.000Z',
          },
        ],
      ]);
      const input = codeSwimlaneInput(
        [carrying('a', 'gf', { codeSwimlaneLanes: [laneEntry('gf', 2)] })],
        TYPE,
        VALUES,
        planLanes,
      );
      expect(input.storedLanes.get('a')).toMatchObject({ lane: 2 });
    });
  });
});
