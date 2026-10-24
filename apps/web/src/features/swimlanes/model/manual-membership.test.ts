import type { ActivitySummary, SwimlaneSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { manualSwimlaneInput } from './manual-membership';

import { anActivity } from '@/test/activity-fixture';

const lane = (
  over: Partial<ActivitySummary['swimlaneLanes'][number]>,
): ActivitySummary['swimlaneLanes'][number] => ({
  basis: 'SWIMLANE',
  swimlaneId: 's1',
  summaryActivityId: null,
  wbsLevel: null,
  laneIndex: 2,
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...over,
});

const swimlane = (id: string, name: string, position: number): SwimlaneSummary => ({
  id,
  planId: 'p1',
  name,
  position,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const LIST = [swimlane('s1', 'Mechanical', 0), swimlane('s2', 'Electrical', 1)];

describe('manualSwimlaneInput', () => {
  it('lists the swimlanes in the order given, by id and name only', () => {
    expect(manualSwimlaneInput([], LIST).swimlanes).toEqual([
      { id: 's1', name: 'Mechanical' },
      { id: 's2', name: 'Electrical' },
    ]);
  });

  it('takes membership from each activity’s own swimlaneId', () => {
    const input = manualSwimlaneInput(
      [anActivity({ id: 'a', swimlaneId: 's2' }), anActivity({ id: 'b', swimlaneId: null })],
      LIST,
    );
    expect(input.membership.get('a')).toBe('s2');
    expect(input.membership.get('b')).toBeNull();
  });

  it('reads the stored lane written against the swimlane the activity is in, and no other', () => {
    const input = manualSwimlaneInput(
      [
        anActivity({
          id: 'a',
          swimlaneId: 's1',
          swimlaneLanes: [
            lane({ swimlaneId: 's2', laneIndex: 9 }),
            lane({ basis: 'NO_SWIMLANE', swimlaneId: null, laneIndex: 7 }),
            lane({ swimlaneId: 's1', laneIndex: 2, updatedAt: '2026-10-02T00:00:00.000Z' }),
          ],
        }),
      ],
      LIST,
    );
    expect(input.storedLanes.get('a')).toEqual({
      lane: 2,
      updatedAt: Date.parse('2026-10-02T00:00:00.000Z'),
    });
  });

  it('reads the NO_SWIMLANE row for an activity in no swimlane', () => {
    const input = manualSwimlaneInput(
      [
        anActivity({
          id: 'a',
          swimlaneId: null,
          swimlaneLanes: [
            lane({ swimlaneId: 's1', laneIndex: 9 }),
            lane({ basis: 'NO_SWIMLANE', swimlaneId: null, laneIndex: 4 }),
          ],
        }),
      ],
      LIST,
    );
    expect(input.storedLanes.get('a')?.lane).toBe(4);
  });

  it('treats a member of a swimlane that has been deleted as being in No swimlane', () => {
    // The id is kept on the activity so a restore brings the member back; until then it is shown
    // under "No swimlane" and must read that basis, not the deleted swimlane's.
    const input = manualSwimlaneInput(
      [
        anActivity({
          id: 'a',
          swimlaneId: 'gone',
          swimlaneLanes: [
            lane({ swimlaneId: 'gone', laneIndex: 9 }),
            lane({ basis: 'NO_SWIMLANE', swimlaneId: null, laneIndex: 1 }),
          ],
        }),
      ],
      LIST,
    );
    expect(input.storedLanes.get('a')?.lane).toBe(1);
  });

  it('leaves an activity that was never placed against its basis absent, not zero', () => {
    const input = manualSwimlaneInput(
      [anActivity({ id: 'a', swimlaneId: 's1', swimlaneLanes: [] })],
      LIST,
    );
    expect(input.storedLanes.has('a')).toBe(false);
  });
});
