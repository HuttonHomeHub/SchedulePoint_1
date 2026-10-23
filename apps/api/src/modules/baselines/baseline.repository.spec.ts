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

describe('BaselineRepository swimlane freeze (M1-T1b)', () => {
  const lane = {
    activityId: 'act-1',
    basis: 'SWIMLANE' as const,
    swimlaneId: 'lane-1',
    summaryActivityId: null,
    wbsLevel: null,
    laneIndex: 2,
    laneUpdatedAt: new Date('2026-01-05T10:00:00Z'),
  };
  const activity = {
    id: 'act-1',
    code: null,
    name: 'A',
    type: 'TASK' as const,
    durationMinutes: 480,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    isCritical: false,
    budgetedCost: 0,
    budgetedExpense: 0,
    assignments: [],
    laneIndex: 0,
    parentId: null,
    calendarId: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    placedStart: null,
    placedFinish: null,
    visualStart: null,
    swimlaneId: 'lane-1',
  };

  function tx() {
    return {
      baseline: { create: vi.fn().mockResolvedValue({ id: 'bl-1' }) },
      baselineActivity: { createMany: vi.fn() },
      baselineAssignment: { createMany: vi.fn() },
      baselineDependency: { createMany: vi.fn() },
      baselineActivitySwimlaneLane: { createMany: vi.fn() },
    };
  }
  const input = (over: object = {}) => ({
    organizationId: 'org',
    planId: 'plan',
    name: 'B',
    isActive: true,
    dataDate: null,
    capturedProjectFinish: null,
    hoursPerDayMinutes: 1440,
    criticalityRule: null,
    actorId: 'user',
    activities: [activity],
    dependencies: [],
    swimlane: { source: 'WBS' as const, wbsLevel: 2 },
    lanes: [lane],
    ...over,
  });

  it('writes the FULL level, the frozen source and level, the swimlane id and a lane copy', async () => {
    const db = tx();
    const repository = new BaselineRepository({} as PrismaService);
    await repository.createWithSnapshot(input(), db as never);

    expect(db.baseline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        swimlaneSnapshotLevel: 'FULL',
        swimlaneSource: 'WBS',
        swimlaneWbsLevel: 2,
      }),
    });
    expect(db.baselineActivity.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ sourceActivityId: 'act-1', swimlaneId: 'lane-1' })],
    });
    // `updated_at` becomes `lane_updated_at`; the activity id becomes the source activity id.
    expect(db.baselineActivitySwimlaneLane.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org',
          baselineId: 'bl-1',
          sourceActivityId: 'act-1',
          basis: 'SWIMLANE',
          swimlaneId: 'lane-1',
          summaryActivityId: null,
          wbsLevel: null,
          laneIndex: 2,
          laneUpdatedAt: lane.laneUpdatedAt,
        },
      ],
    });
  });

  it('writes FULL even when the plan has no lane rows to copy, and issues no empty insert', async () => {
    // The level is the discriminator: zero rows on a FULL baseline means "there were none".
    const db = tx();
    const repository = new BaselineRepository({} as PrismaService);
    await repository.createWithSnapshot(
      input({ swimlane: { source: 'NONE', wbsLevel: null }, lanes: [] }),
      db as never,
    );
    expect(db.baseline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        swimlaneSnapshotLevel: 'FULL',
        swimlaneSource: 'NONE',
        swimlaneWbsLevel: null,
      }),
    });
    expect(db.baselineActivitySwimlaneLane.createMany).not.toHaveBeenCalled();
  });

  it('loads lanes org-scoped, chunked, and renames updatedAt to laneUpdatedAt', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        activityId: 'act-1',
        basis: 'SWIMLANE',
        swimlaneId: 'lane-1',
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex: 2,
        updatedAt: lane.laneUpdatedAt,
      },
    ]);
    const repository = new BaselineRepository({} as PrismaService);
    const ids = Array.from({ length: 8_001 }, (_, i) => `a${i}`);
    const rows = await repository.loadLanesForCapture('org', ids, {
      activitySwimlaneLane: { findMany },
    } as never);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]![0].where).toEqual({
      organizationId: 'org',
      activityId: { in: ids.slice(0, 8_000) },
    });
    expect(rows[0]).toEqual(lane);
  });
});
