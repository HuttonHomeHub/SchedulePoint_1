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

function repositoryReturning(row: object): {
  repository: BaselineRepository;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(row);
  const findMany = vi.fn().mockResolvedValue([row]);
  const prisma = { baseline: { findFirst, findMany } } as unknown as PrismaService;
  return { repository: new BaselineRepository(prisma), findFirst, findMany };
}

describe('BaselineRepository activity counts', () => {
  const row = { id: 'b1', name: 'Baseline', _count: { activities: 7 } };

  it('counts only live snapshot rows on a single read', async () => {
    const { repository, findFirst } = repositoryReturning(row);

    const result = await repository.findActiveWithCountByIdInPlan('b1', 'org', 'plan');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: liveActivityCount }));
    expect(result?.activityCount).toBe(7);
  });

  it('counts only live snapshot rows on a page', async () => {
    const { repository, findMany } = repositoryReturning(row);

    const result = await repository.findManyActiveByPlan({
      organizationId: 'org',
      planId: 'plan',
      take: 10,
      order: 'desc',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: liveActivityCount }));
    expect(result[0]?.activityCount).toBe(7);
  });
});
