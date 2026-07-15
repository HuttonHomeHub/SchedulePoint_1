import type { Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
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
    calendarId: null,
    schedulingMode: 'EARLY',
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
  // Storage is working-minutes (ADR-0036); a whole day = 1440 min on the all-minutes calendar.
  durationMinutes: durationDays * 1440,
  type: 'TASK',
  constraintType: null,
  constraintDate: null,
  visualStart: null,
  ...extra,
});
const edgeRow = (predecessorId: string, successorId: string): ScheduleEdgeRow => ({
  id: `${predecessorId}-${successorId}-FS`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
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
    loadPlanCalendar: ReturnType<typeof vi.fn>;
    writeResults: ReturnType<typeof vi.fn>;
    writeDrivingFlags: ReturnType<typeof vi.fn>;
    summarise: ReturnType<typeof vi.fn>;
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
      loadPlanCalendar: vi.fn().mockResolvedValue(null),
      writeResults: vi.fn().mockResolvedValue(undefined),
      writeDrivingFlags: vi.fn().mockResolvedValue(undefined),
      summarise: vi.fn().mockResolvedValue({
        activityCount: 0,
        criticalCount: 0,
        nearCriticalCount: 0,
        parkedConstraintCount: 0,
        projectFinish: null,
      }),
    };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      schedule as unknown as ScheduleRepository,
      { assertHoldsPen: vi.fn().mockResolvedValue(undefined) } as unknown as PlanEditLockService,
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
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ plannedStart: null as unknown as Date }));
    await expect(service.recalculate(principalWith(CAN), 'acme', PLAN_ID)).rejects.toMatchObject({
      details: { reason: 'PLAN_START_REQUIRED' },
    });
    await expect(service.recalculate(principalWith(CAN), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(schedule.lockPlanForWrite).not.toHaveBeenCalled();
  });

  it('uses all-days-work without loading a calendar when the plan has none', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ calendarId: null }));
    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(schedule.loadPlanCalendar).not.toHaveBeenCalled();
  });

  it('loads the plan calendar (scoped) when one is assigned', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ calendarId: 'cal-1' }));
    schedule.loadPlanCalendar.mockResolvedValue({
      // Mon–Fri full-day shift rows (ADR-0036) — the storage shape the engine port loads.
      shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
      exceptions: [],
    });
    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(schedule.loadPlanCalendar).toHaveBeenCalledWith(ORG_ID, 'cal-1', expect.anything());
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

    // The engine-owned driving flags are persisted alongside the activity results (M3):
    // A→B is the binding tie that sets B's start, so it is driving.
    const drivingCall = schedule.writeDrivingFlags.mock.calls[0] as [
      string,
      string,
      Array<{ edgeId: string; isDriving: boolean }>,
      unknown,
    ];
    expect(drivingCall[0]).toBe(ORG_ID);
    expect(drivingCall[1]).toBe(PLAN_ID);
    expect(drivingCall[2]).toEqual([{ edgeId: 'A-B-FS', isDriving: true }]);
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

const READ: Permission[] = ['schedule:read'];

describe('ScheduleService.summary', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let schedule: { summarise: ReturnType<typeof vi.fn> };
  let service: ScheduleService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'VIEWER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    schedule = {
      summarise: vi.fn().mockResolvedValue({
        activityCount: 3,
        criticalCount: 2,
        nearCriticalCount: 1,
        parkedConstraintCount: 0,
        projectFinish: '2026-01-13',
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      schedule as unknown as ScheduleRepository,
      { assertHoldsPen: vi.fn().mockResolvedValue(undefined) } as unknown as PlanEditLockService,
      { $transaction: vi.fn() } as unknown as PrismaService,
      logger,
    );
  });

  it('returns the aggregate with the plan’s start as the data date (any member)', async () => {
    const result = await service.summary(principalWith(READ), 'acme', PLAN_ID);
    expect(result).toEqual({
      dataDate: '2026-01-01',
      projectFinish: '2026-01-13',
      activityCount: 3,
      criticalCount: 2,
      nearCriticalCount: 1,
      parkedConstraintCount: 0,
    });
  });

  it('reports a null data date when the plan has no start, without erroring', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ plannedStart: null as unknown as Date }));
    schedule.summarise.mockResolvedValue({
      activityCount: 0,
      criticalCount: 0,
      nearCriticalCount: 0,
      parkedConstraintCount: 0,
      projectFinish: null,
    });
    const result = await service.summary(principalWith(READ), 'acme', PLAN_ID);
    expect(result.dataDate).toBeNull();
    expect(result.projectFinish).toBeNull();
  });

  it('404s when the plan is not in the caller’s org', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(service.summary(principalWith(READ), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('denies a caller without schedule:read (403)', async () => {
    await expect(service.summary(principalWith([]), 'acme', PLAN_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(schedule.summarise).not.toHaveBeenCalled();
  });
});
