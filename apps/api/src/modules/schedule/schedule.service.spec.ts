import type { Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { EngineResult } from './engine';
import type {
  ScheduleActivityRow,
  ScheduleEdgeRow,
  ScheduleRepository,
} from './schedule.repository';
import { ScheduleService } from './schedule.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Baseline',
    description: null,
    status: 'DRAFT',
    plannedStart: new Date('2026-01-01T00:00:00.000Z'),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

const activityRow = (
  id: string,
  durationDays: number,
  extra: Partial<ScheduleActivityRow> = {},
): ScheduleActivityRow => ({
  id,
  durationDays,
  type: 'TASK',
  constraintType: null,
  constraintDate: null,
  ...extra,
});
const edgeRow = (predecessorId: string, successorId: string): ScheduleEdgeRow => ({
  predecessorId,
  successorId,
  type: 'FS',
  lagDays: 0,
});

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const CAN: Permission[] = ['schedule:calculate'];

describe('ScheduleService.recalculate', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let schedule: {
    lockPlanForWrite: ReturnType<typeof vi.fn>;
    loadActivities: ReturnType<typeof vi.fn>;
    loadEdges: ReturnType<typeof vi.fn>;
    writeResults: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ScheduleService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    schedule = {
      lockPlanForWrite: vi.fn().mockResolvedValue(undefined),
      loadActivities: vi.fn().mockResolvedValue([]),
      loadEdges: vi.fn().mockResolvedValue([]),
      writeResults: vi.fn().mockResolvedValue(undefined),
    };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      schedule as unknown as ScheduleRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  it('denies a caller without schedule:calculate (403)', async () => {
    await expect(service.recalculate(principalWith([]), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(schedule.loadActivities).not.toHaveBeenCalled();
  });

  it('404s when the plan is not found in the caller’s org', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(service.recalculate(principalWith(CAN), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('422s with PLAN_START_REQUIRED when the plan has no start date', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ plannedStart: null }));
    await expect(service.recalculate(principalWith(CAN), 'acme', PLAN_ID)).rejects.toMatchObject({
      details: { reason: 'PLAN_START_REQUIRED' },
    });
    await expect(service.recalculate(principalWith(CAN), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(schedule.lockPlanForWrite).not.toHaveBeenCalled();
  });

  it('is a no-op write for an empty plan and returns a zeroed summary', async () => {
    const summary = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(schedule.writeResults).toHaveBeenCalledWith(ORG_ID, PLAN_ID, [], {});
    expect(summary).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: null,
      activityCount: 0,
      criticalCount: 0,
    });
  });

  it('takes the plan lock BEFORE loading the graph', async () => {
    const order: string[] = [];
    schedule.lockPlanForWrite.mockImplementation(() => {
      order.push('lock');
    });
    schedule.loadActivities.mockImplementation(() => {
      order.push('load');
      return [];
    });
    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(order).toEqual(['lock', 'load']);
  });

  it('computes a known network and persists the engine-owned columns', async () => {
    // A(3) FS→ B(2): A is critical (float 0), B is critical, project finishes day 5.
    schedule.loadActivities.mockResolvedValue([activityRow('A', 3), activityRow('B', 2)]);
    schedule.loadEdges.mockResolvedValue([edgeRow('A', 'B')]);

    const summary = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);

    expect(summary).toMatchObject({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-05',
      activityCount: 2,
      criticalCount: 2,
    });
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    const byId = new Map(results.map((r) => [r.activityId, r]));
    expect(byId.get('A')).toMatchObject({
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-03',
      isCritical: true,
      totalFloat: 0,
    });
    expect(byId.get('B')).toMatchObject({
      earlyStart: '2026-01-04',
      earlyFinish: '2026-01-05',
      isCritical: true,
    });
  });

  it('passes constraint dates to the engine as YYYY-MM-DD', async () => {
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 2, {
        constraintType: 'SNET',
        constraintDate: new Date('2026-01-04T00:00:00.000Z'),
      }),
    ]);

    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);

    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    expect(results[0]).toMatchObject({ activityId: 'A', earlyStart: '2026-01-04' });
  });
});
