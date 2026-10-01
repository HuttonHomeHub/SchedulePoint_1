import { Prisma, type Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BaselineRepository } from '../baselines/baseline.repository';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { ScheduleActivityRow, ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';

/**
 * `ScheduleService.getLevellingApplication` (`docs/specs/apply-levelled-dates/`, M1): the seams the
 * pure engine cannot see — the permission, the scope, what a row is stamped with, and that the read
 * writes nothing. The derivation itself is `engine/apply-levelling.spec.ts`.
 */
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';

const plan = (overrides: Partial<Plan> = {}): Plan => ({
  id: PLAN_ID,
  organizationId: ORG_ID,
  projectId: 'project-1',
  name: 'Levelled',
  description: null,
  status: 'DRAFT',
  plannedStart: new Date('2026-01-01T00:00:00.000Z'),
  calendarId: null,
  progressRecalcMode: 'RETAINED_LOGIC',
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThresholdMinutes: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  levelResources: true,
  levelWithinFloatOnly: false,
  ignoreExternalRelationships: false,
  scheduleComputedAt: new Date('2026-01-01T09:30:00.000Z'),
  scheduleCriticalPathDefinition: null,
  scheduleCriticalFloatThresholdMinutes: null,
  scheduleTotalFloatMode: null,
  scheduleMakeOpenEndsCritical: null,
  eacMethod: 'CPI',
  currencyCode: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
  deletedAt: null,
  deleteBatchId: null,
  ...overrides,
});

const activityRow = (
  id: string,
  durationDays: number,
  extra: Partial<ScheduleActivityRow> = {},
): ScheduleActivityRow => ({
  id,
  durationMinutes: durationDays * 1440,
  type: 'TASK',
  parentId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  externalEarlyStart: null,
  externalLateFinish: null,
  visualStart: null,
  scheduleAsLateAsPossible: false,
  calendarId: null,
  actualStart: null,
  actualFinish: null,
  percentComplete: 0,
  remainingDurationMinutes: null,
  resumeDate: null,
  expectedFinish: null,
  levelingPriority: null,
  ...extra,
});

const principalWith = (permissions: Permission[]): Principal =>
  new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);

const CAN: Permission[] = ['activity:update'];

describe('ScheduleService.getLevellingApplication', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let schedule: {
    lockPlanForWrite: ReturnType<typeof vi.fn>;
    loadActivities: ReturnType<typeof vi.fn>;
    loadEdges: ReturnType<typeof vi.fn>;
    loadPlanCalendar: ReturnType<typeof vi.fn>;
    loadResourceAssignments: ReturnType<typeof vi.fn>;
    loadLevellingResources: ReturnType<typeof vi.fn>;
    loadPlacementIdentities: ReturnType<typeof vi.fn>;
    writeResults: ReturnType<typeof vi.fn>;
    writeDrivingFlags: ReturnType<typeof vi.fn>;
    stampScheduleComputedAt: ReturnType<typeof vi.fn>;
  };
  let service: ScheduleService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    schedule = {
      lockPlanForWrite: vi.fn().mockResolvedValue(undefined),
      loadActivities: vi.fn().mockResolvedValue([
        activityRow('A', 2, { levelingPriority: 1 }),
        activityRow('B', 2, {
          levelingPriority: 2,
          constraintType: 'SNET',
          constraintDate: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ]),
      loadEdges: vi.fn().mockResolvedValue([]),
      loadPlanCalendar: vi.fn().mockResolvedValue(null),
      loadResourceAssignments: vi.fn().mockResolvedValue([
        { activityId: 'A', resourceId: 'R', unitsPerHour: new Prisma.Decimal(1) },
        { activityId: 'B', resourceId: 'R', unitsPerHour: new Prisma.Decimal(1) },
      ]),
      loadLevellingResources: vi
        .fn()
        .mockResolvedValue([{ id: 'R', maxUnitsPerHour: new Prisma.Decimal(1), calendarId: null }]),
      loadPlacementIdentities: vi.fn().mockResolvedValue([
        { id: 'A', code: 'A100', name: 'Lift one', version: 3 },
        { id: 'B', code: null, name: 'Lift two', version: 7 },
      ]),
      writeResults: vi.fn(),
      writeDrivingFlags: vi.fn(),
      stampScheduleComputedAt: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      schedule as unknown as ScheduleRepository,
      { findHoursPerDayMinutes: () => Promise.resolve(new Map()) } as unknown as CalendarRepository,
      { assertHoldsPen: vi.fn() } as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      {
        countActiveForPlan: vi.fn().mockResolvedValue(0),
      } as unknown as CrossPlanDependencyRepository,
      {} as unknown as BaselineRepository,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  it('denies a caller without activity:update (403) before loading anything', async () => {
    // schedule:read is what every member holds; the preview asks for the permission of the write it
    // feeds, so a Viewer cannot spend its engine runs.
    await expect(
      service.getLevellingApplication(principalWith(['schedule:read']), 'acme', PLAN_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    expect(schedule.loadActivities).not.toHaveBeenCalled();
  });

  it('404s when the plan is not in the caller’s organisation', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(
      service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(schedule.loadActivities).not.toHaveBeenCalled();
  });

  it('422s with PLAN_START_REQUIRED when the plan has no start date', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ plannedStart: null as unknown as Date }));
    await expect(
      service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID),
    ).rejects.toMatchObject({ details: { reason: 'PLAN_START_REQUIRED' } });
    expect(schedule.loadActivities).not.toHaveBeenCalled();
  });

  it('stamps each row with the version it solved and the constraint the activity already has', async () => {
    const result = await service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID);

    // A keeps the crane; B is delayed by A's two days, so it is the only row. The constraint is
    // round-tripped so the batch write cannot clear it, and the lane is left alone.
    expect(result.rows).toEqual([
      {
        id: 'B',
        version: 7,
        constraintType: 'SNET',
        constraintDate: '2026-01-01',
        visualStart: '2026-01-03',
        laneIndex: null,
      },
    ]);
    expect(result.items).toEqual([
      {
        id: 'B',
        name: 'Lift two',
        code: null,
        beforeVisualStart: null,
        beforeDrawnStart: '2026-01-01',
        targetStart: '2026-01-03',
        wasPlaced: false,
        roundedToNextDay: false,
        reason: 'RESOURCE',
      },
    ]);
    expect(result.remainingAfterApply).toBe(0);
    expect(result.leftToLogic).toEqual([]);
    expect(result.followingLinks).toEqual([]);
    expect(result.conflictingPlaced).toEqual([]);
    expect(result.computedFrom.scheduleComputedAt).toBe('2026-01-01T09:30:00.000Z');
    // The placed finish before and after comes from a real solve of each: B moves from days 1-2 to 3-4.
    expect(result.projectFinishBefore).toBe('2026-01-02');
    expect(result.projectFinishAfter).toBe('2026-01-04');
  });

  it('names a follower that will follow its links, and stamps the hand-placed one with a LINKS row', async () => {
    // B is delayed behind A by the crane. C (no resource) follows B and is unplaced, so it gets no row
    // and is named in `followingLinks`; D follows B too and is hand-placed, so it is a row with the
    // reason LINKS (`docs/specs/logic-aware-levelling/` CQ-1 (a)).
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 2, { levelingPriority: 1 }),
      activityRow('B', 2, { levelingPriority: 2 }),
      activityRow('C', 1),
      activityRow('D', 1, { visualStart: new Date('2026-01-03T00:00:00.000Z') }),
    ]);
    schedule.loadEdges.mockResolvedValue(
      ['C', 'D'].map((successorId) => ({
        id: `B-${successorId}`,
        predecessorId: 'B',
        successorId,
        type: 'FS',
        lagMinutes: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      })),
    );
    schedule.loadPlacementIdentities.mockResolvedValue([
      { id: 'A', code: null, name: 'Lift one', version: 1 },
      { id: 'B', code: null, name: 'Lift two', version: 1 },
      { id: 'C', code: null, name: 'Fit-out', version: 1 },
      { id: 'D', code: null, name: 'Handover', version: 1 },
    ]);
    const result = await service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID);
    expect(result.followingLinks).toEqual([{ id: 'C', name: 'Fit-out' }]);
    expect(result.items.map((i) => [i.id, i.reason])).toEqual([
      ['B', 'RESOURCE'],
      ['D', 'LINKS'],
    ]);
    expect(result.leftToLogic).toEqual([]);
    expect(result.conflictingPlaced).toEqual([]);
  });

  it('writes nothing: no lock, no engine-owned write, no freshness stamp', async () => {
    await service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID);
    expect(schedule.lockPlanForWrite).not.toHaveBeenCalled();
    expect(schedule.writeResults).not.toHaveBeenCalled();
    expect(schedule.writeDrivingFlags).not.toHaveBeenCalled();
    expect(schedule.stampScheduleComputedAt).not.toHaveBeenCalled();
  });

  it('returns no rows for a plan that does not level, without loading a demand model', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ levelResources: false }));
    const result = await service.getLevellingApplication(principalWith(CAN), 'acme', PLAN_ID);
    expect(result.rows).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.remainingAfterApply).toBe(0);
    expect(schedule.loadResourceAssignments).not.toHaveBeenCalled();
  });
});
