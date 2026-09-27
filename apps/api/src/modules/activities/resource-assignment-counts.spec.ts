import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { liveAssignmentWhere } from './live-assignment';
import { attachAssignmentCounts, loadResourceAssignmentCounts } from './resource-assignment-counts';

const ORG = '00000000-0000-4000-8000-000000000001';

function row(id: string, type: string, durationMinutes: number, organizationId = ORG) {
  return { id, organizationId, type, durationMinutes };
}

function db(groups: { activityId: string; _count: { _all: number } }[] = []) {
  const groupBy = vi.fn().mockResolvedValue(groups);
  return { client: { resourceAssignment: { groupBy } } as unknown as PrismaClient, groupBy };
}

/**
 * The loader's contract, with the database mocked (ADR-0162 decision 6, FC-9 remedy rung 1). What
 * "live" means against real rows — a soft-deleted assignment, an assignment to a soft-deleted
 * resource — is FC-10's agreement e2e (`zero-duration-assignment-count.e2e-spec.ts`), because a mocked
 * `groupBy` returns whatever it is told and cannot say which rows a `where` would have matched.
 */
describe('loadResourceAssignmentCounts', () => {
  it('issues NO query when the rows hold no zero-duration task', async () => {
    const { client, groupBy } = db();
    const counts = await loadResourceAssignmentCounts(client, [
      row('a', 'TASK', 480),
      row('b', 'FINISH_MILESTONE', 0),
      row('c', 'LEVEL_OF_EFFORT', 0),
      row('d', 'WBS_SUMMARY', 0),
    ]);
    expect(groupBy).not.toHaveBeenCalled();
    expect(counts.size).toBe(0);
  });

  it('asks ONE grouped query about the zero-duration tasks only, with the live predicate', async () => {
    const { client, groupBy } = db([{ activityId: 'z2', _count: { _all: 3 } }]);
    const counts = await loadResourceAssignmentCounts(client, [
      row('z1', 'TASK', 0),
      row('t', 'TASK', 480),
      row('z2', 'TASK', 0),
      row('m', 'START_MILESTONE', 0),
    ]);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['activityId'],
      where: { activityId: { in: ['z1', 'z2'] }, ...liveAssignmentWhere(ORG) },
      _count: { _all: true },
    });
    // 0 for a counted task with no live assignment, N for one with N; nothing for the rest.
    expect([...counts]).toEqual([
      ['z1', 0],
      ['z2', 3],
    ]);
  });

  it('asks once per organisation, because the live predicate is organisation-scoped', async () => {
    const { client, groupBy } = db();
    await loadResourceAssignmentCounts(client, [
      row('z1', 'TASK', 0, ORG),
      row('z2', 'TASK', 0, '00000000-0000-4000-8000-000000000002'),
      row('z3', 'TASK', 0, ORG),
    ]);
    expect(groupBy).toHaveBeenCalledTimes(2);
  });
});

describe('attachAssignmentCounts', () => {
  it('gives a counted row its count and every other row null, never 0', () => {
    const rows = [{ id: 'z1' }, { id: 'z2' }, { id: 't' }];
    const out = attachAssignmentCounts(
      rows,
      new Map([
        ['z1', 0],
        ['z2', 2],
      ]),
    );
    expect(out.map((r) => r.resourceAssignmentCount)).toEqual([0, 2, null]);
  });
});
