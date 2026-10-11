import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { BaselineRepository } from './baseline.repository';

/**
 * A baseline's `activityCount` counts live snapshot rows only (ADR-0172 M4).
 *
 * The count used to be an unfiltered `_count` that relied on a baseline's snapshot rows being
 * stamped deleted together with it. That invariant held, so no number was ever wrong — but the
 * detail view filters the same relation, and the two could drift the day a snapshot row was
 * deleted on its own. These tests pin the filter at the query, where a mock can see it; the
 * Supertest suite proves the number against Postgres.
 */
const liveActivityCount = { _count: { select: { activities: { where: { deletedAt: null } } } } };

function repositoryReturning(
  row: object,
  counts: object[] = [],
): {
  repository: BaselineRepository;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(row);
  const findMany = vi.fn().mockResolvedValue([row]);
  const groupBy = vi.fn().mockResolvedValue(counts);
  const prisma = {
    baseline: { findFirst, findMany },
    baselineActivity: { groupBy },
  } as unknown as PrismaService;
  return { repository: new BaselineRepository(prisma), findFirst, findMany, groupBy };
}

describe('BaselineRepository activity counts', () => {
  const row = { id: 'b1', name: 'Baseline', _count: { activities: 7 } };

  it('counts only live snapshot rows on a single read', async () => {
    const { repository, findFirst } = repositoryReturning(row);

    const result = await repository.findActiveWithCountByIdInPlan('b1', 'org', 'plan');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: liveActivityCount }));
    expect(result?.activityCount).toBe(7);
  });

  it('counts only live snapshot rows on a page, keyed to the page and not to the table', async () => {
    const { repository, findMany, groupBy } = repositoryReturning({ id: 'b1', name: 'Baseline' }, [
      { baselineId: 'b1', _count: { _all: 7 } },
    ]);

    const result = await repository.findManyActiveByPlan({
      organizationId: 'org',
      planId: 'plan',
      take: 10,
      order: 'desc',
    });

    // No `_count` include: that is the whole-table grouped join this read exists to avoid (#441).
    expect(findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ include: expect.anything() }),
    );
    expect(groupBy).toHaveBeenCalledWith({
      by: ['baselineId'],
      where: { baselineId: { in: ['b1'] }, deletedAt: null },
      _count: { _all: true },
    });
    expect(result[0]?.activityCount).toBe(7);
  });

  it('reports 0 for a baseline with no live snapshot rows', async () => {
    const { repository } = repositoryReturning({ id: 'b1', name: 'Baseline' }, []);

    const result = await repository.findManyActiveByPlan({
      organizationId: 'org',
      planId: 'plan',
      take: 10,
      order: 'desc',
    });

    expect(result[0]?.activityCount).toBe(0);
  });

  it('issues no count statement for an empty page', async () => {
    const { repository, findMany, groupBy } = repositoryReturning({ id: 'b1' });
    findMany.mockResolvedValue([]);

    const result = await repository.findManyActiveByPlan({
      organizationId: 'org',
      planId: 'plan',
      take: 10,
      order: 'desc',
    });

    expect(result).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
