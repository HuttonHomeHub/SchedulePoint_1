import { Prisma, type Plan } from '@prisma/client';
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
    progressRecalcMode: 'RETAINED_LOGIC',
    useExpectedFinishDates: false,
    criticalPathDefinition: 'TOTAL_FLOAT',
    criticalFloatThreshold: 0,
    totalFloatMode: 'FINISH',
    makeOpenEndsCritical: false,
    levelResources: false,
    levelWithinFloatOnly: false,
    ignoreExternalRelationships: false,
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
const edgeRow = (predecessorId: string, successorId: string): ScheduleEdgeRow => ({
  id: `${predecessorId}-${successorId}-FS`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
  lagCalendar: 'PROJECT_DEFAULT',
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
    loadResourceAssignments: ReturnType<typeof vi.fn>;
    loadLevellingResources: ReturnType<typeof vi.fn>;
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
      loadResourceAssignments: vi.fn().mockResolvedValue([]),
      loadLevellingResources: vi.fn().mockResolvedValue([]),
      writeResults: vi.fn().mockResolvedValue(undefined),
      writeDrivingFlags: vi.fn().mockResolvedValue(undefined),
      summarise: vi.fn().mockResolvedValue({
        activityCount: 0,
        criticalCount: 0,
        nearCriticalCount: 0,
        constraintViolationCount: 0,
        constraintWarningCount: 0,
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

  it('resolves an in-progress activity’s remaining from percent complete and floors it at the data date (M2)', async () => {
    // 5-day activity, 60% done, started before the data date → 2 days remain (derived), scheduled
    // from the data date 2026-01-01 (all-days calendar) → inclusive finish 2026-01-02; start frozen.
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 5, { actualStart: new Date('2025-12-20'), percentComplete: 60 }),
    ]);
    const summary = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    const a = results.find((r) => r.activityId === 'A')!;
    expect(a.earlyStart).toBe('2025-12-20'); // frozen actual start
    expect(a.earlyFinish).toBe('2026-01-02'); // data date + 2 remaining days
    expect(summary.projectFinish).toBe('2026-01-02');
  });

  it('threads the plan’s progress recalc mode into the engine (M2)', async () => {
    // P (in progress, 5 days left) FS→ B (in progress out of sequence, 2 days left). Under
    // PROGRESS_OVERRIDE B ignores the incomplete P and its remaining runs from the data date.
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ progressRecalcMode: 'PROGRESS_OVERRIDE' }));
    schedule.loadActivities.mockResolvedValue([
      activityRow('P', 5, {
        actualStart: new Date('2025-12-20'),
        remainingDurationMinutes: 5 * 1440,
      }),
      activityRow('B', 5, {
        actualStart: new Date('2025-12-21'),
        remainingDurationMinutes: 2 * 1440,
      }),
    ]);
    schedule.loadEdges.mockResolvedValue([edgeRow('P', 'B')]);
    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    const b = results.find((r) => r.activityId === 'B')!;
    // Override drops the incomplete predecessor P → B's remaining from data date 01-01 + 2d = 01-02
    // (under Retained Logic it would wait for P's 01-05 finish and land on 01-07).
    expect(b.earlyFinish).toBe('2026-01-02');
  });

  it('threads the plan’s expected-finish option into the engine (M4, ADR-0035 §9)', async () => {
    // An in-progress activity (2 days left) that carries an expectedFinish. With the plan option ON
    // its remaining is resized so the early finish lands on the target (01-08); OFF it runs 2 days
    // from the data date (01-02). The service must thread `useExpectedFinishDates` through.
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ useExpectedFinishDates: true }));
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 10, {
        actualStart: new Date('2025-12-20'),
        remainingDurationMinutes: 2 * 1440,
        expectedFinish: new Date('2026-01-08'),
      }),
    ]);
    const summary = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(summary.projectFinish).toBe('2026-01-08');

    // Option OFF ⇒ the 2 remaining days run from the data date → 2026-01-02 (a different finish).
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ useExpectedFinishDates: false }));
    const off = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(off.projectFinish).toBe('2026-01-02');
  });

  it('threads external / inter-project dates + the ignore flag into the engine (ADR-0043 / ADR-0035 §30)', async () => {
    // A single activity whose logic-earliest is the data date (01-01), but carrying an external early
    // start of 01-05 imported from another project. With external honoured (flag off) its early start is
    // clamped UP to 01-05 and it is flagged external-driven; with ignore-external ON the bound drops and
    // it falls back to the data date. The service must thread the instants AND the plan flag through.
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 3, { externalEarlyStart: new Date('2026-01-05T00:00:00.000Z') }),
    ]);

    const honoured = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    const a = results.find((r) => r.activityId === 'A')!;
    expect(a.earlyStart).toBe('2026-01-05'); // clamped up to the external early start
    expect(a.externalDriven).toBe(true);
    expect(honoured.externalDrivenCount).toBe(1);

    // Ignore-external ON drops the bound → back to the data date, no external-driven activity.
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ ignoreExternalRelationships: true }));
    const ignored = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    const [, , ignoredResults] = schedule.writeResults.mock.calls[1] as [
      string,
      string,
      EngineResult[],
    ];
    const aIgnored = ignoredResults.find((r) => r.activityId === 'A')!;
    expect(aIgnored.earlyStart).toBe('2026-01-01'); // dropped → data date
    expect(ignored.externalDrivenCount).toBe(0);
  });

  it('threads the plan’s critical-path definition into the engine (M6, ADR-0035 §17)', async () => {
    // Spine A(2)→B(4) plus an OPEN-ENDED X(3) with an early FNLT that forces negative float. Under
    // TOTAL_FLOAT (default) X is critical (3 critical); under LONGEST_PATH it drops off the driving
    // chain (2 critical). The service must thread `criticalPathDefinition` through to the engine.
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 2),
      activityRow('B', 4),
      activityRow('X', 3, {
        constraintType: 'FNLT',
        constraintDate: new Date('2026-01-02'),
      }),
    ]);
    schedule.loadEdges.mockResolvedValue([edgeRow('A', 'B')]);

    plans.findActiveByIdInOrg.mockResolvedValue(plan({ criticalPathDefinition: 'TOTAL_FLOAT' }));
    const totalFloat = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(totalFloat.criticalCount).toBe(3);

    plans.findActiveByIdInOrg.mockResolvedValue(plan({ criticalPathDefinition: 'LONGEST_PATH' }));
    const longestPath = await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
    expect(longestPath.criticalCount).toBe(2);
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

  it('a TWENTY_FOUR_HOUR lag edge moves the recalculated date (not a silent no-op, M3)', async () => {
    // On a Mon–Fri plan calendar, FS + 3 days measured as ELAPSED time (24-Hour) crosses the
    // weekend and lands the successor earlier than the same lag measured in working days.
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ calendarId: 'cal-1' }));
    schedule.loadPlanCalendar.mockResolvedValue({
      shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
      exceptions: [],
    });
    schedule.loadActivities.mockResolvedValue([activityRow('A', 1), activityRow('B', 1)]);

    const bStart = async (lagCalendar: 'PROJECT_DEFAULT' | 'TWENTY_FOUR_HOUR') => {
      schedule.writeResults.mockClear();
      schedule.loadEdges.mockResolvedValue([
        {
          id: 'A-B-FS',
          predecessorId: 'A',
          successorId: 'B',
          type: 'FS',
          lagMinutes: 3 * 1440,
          lagCalendar,
        },
      ]);
      await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
      const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
      return results.find((r) => r.activityId === 'B')!.earlyStart;
    };

    expect(await bStart('TWENTY_FOUR_HOUR')).not.toBe(await bStart('PROJECT_DEFAULT'));
  });

  it('schedules an activity on its OWN calendar — a distinct calendar moves the date (M5, ADR-0037)', async () => {
    // The plan is Mon–Fri; an activity assigned a 24/7 calendar works across weekends, so a long
    // duration finishes on a different date than the same activity inheriting the 5-day plan.
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ calendarId: 'cal-plan' }));
    // cal-247 → a 24/7 week (works weekends); anything else (incl. the plan's cal-plan) → Mon–Fri.
    schedule.loadPlanCalendar.mockImplementation((_org, calId) => {
      const weekdays = calId === 'cal-247' ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
      // Return the row synchronously (the service `await`s it) — the lint-clean mock idiom here.
      return {
        shifts: weekdays.map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
        exceptions: [],
      };
    });

    const aFinish = async (calendarId: string | null) => {
      schedule.writeResults.mockClear();
      schedule.loadActivities.mockResolvedValue([activityRow('A', 8, { calendarId })]); // 8 days
      schedule.loadEdges.mockResolvedValue([]);
      await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);
      const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
      return results.find((r) => r.activityId === 'A')!.earlyFinish;
    };

    expect(await aFinish('cal-247')).not.toBe(await aFinish(null));
  });

  it('does not run levelling and writes no leveled overlay when levelResources is off (parity, ADR-0041 §7)', async () => {
    // The default plan has levelResources false. The demand model must never be loaded and the
    // persisted results must carry no leveled overlay — byte-identical to the pre-levelling recalc.
    schedule.loadActivities.mockResolvedValue([activityRow('A', 3), activityRow('B', 2)]);
    schedule.loadEdges.mockResolvedValue([edgeRow('A', 'B')]);

    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);

    expect(schedule.loadResourceAssignments).not.toHaveBeenCalled();
    expect(schedule.loadLevellingResources).not.toHaveBeenCalled();
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    for (const r of results) {
      expect(r.leveledStart).toBeUndefined();
      expect(r.levelingDelay).toBeUndefined();
      expect(r.levelingWindowExceeded).toBeUndefined();
    }
    // The network dates are exactly what the pre-levelling engine produced.
    const byId = new Map(results.map((r) => [r.activityId, r]));
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-03');
    expect(byId.get('B')!.earlyFinish).toBe('2026-01-05');
  });

  it('runs levelling and persists the leveled columns via the engine-owned write when opted in (ADR-0041)', async () => {
    // levelResources on. A and B (each 2 days) both demand a capacity-1 resource → B is serialised
    // behind A. The leveled overlay is written through the same writeResults path as early_*/is_critical
    // (which never touches version/updated_at — the ADR-0022 engine-owned contract).
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ levelResources: true }));
    schedule.loadActivities.mockResolvedValue([
      activityRow('A', 2, { levelingPriority: 1 }),
      activityRow('B', 2, { levelingPriority: 2 }),
    ]);
    schedule.loadEdges.mockResolvedValue([]);
    schedule.loadResourceAssignments.mockResolvedValue([
      { activityId: 'A', resourceId: 'R', unitsPerHour: new Prisma.Decimal(1) },
      { activityId: 'B', resourceId: 'R', unitsPerHour: new Prisma.Decimal(1) },
    ]);
    schedule.loadLevellingResources.mockResolvedValue([
      { id: 'R', maxUnitsPerHour: new Prisma.Decimal(1), calendarId: null },
    ]);

    await service.recalculate(principalWith(CAN), 'acme', PLAN_ID);

    expect(schedule.loadResourceAssignments).toHaveBeenCalledWith(
      ORG_ID,
      PLAN_ID,
      expect.anything(),
    );
    const [, , results] = schedule.writeResults.mock.calls[0] as [string, string, EngineResult[]];
    const byId = new Map(results.map((r) => [r.activityId, r]));
    // A keeps its network position; B is delayed by exactly A's 2-day duration.
    expect(byId.get('A')!.leveledStart).toBe('2026-01-01');
    expect(byId.get('A')!.levelingDelay).toBe(0);
    expect(byId.get('B')!.leveledStart).toBe('2026-01-03');
    expect(byId.get('B')!.levelingDelay).toBe(2 * 1440);
    // The pure network is untouched (Q2): both still start at the data date.
    expect(byId.get('A')!.earlyStart).toBe('2026-01-01');
    expect(byId.get('B')!.earlyStart).toBe('2026-01-01');
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
        constraintViolationCount: 0,
        externalDrivenCount: 2,
        constraintWarningCount: 0,
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
      constraintViolationCount: 0,
      constraintWarningCount: 0,
      // The read summary now threads the aggregated `external_driven` count straight from `summarise`
      // (ADR-0043 / ADR-0035 §30) — no longer hard-coded 0.
      externalDrivenCount: 2,
    });
  });

  it('reports a null data date when the plan has no start, without erroring', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(plan({ plannedStart: null as unknown as Date }));
    schedule.summarise.mockResolvedValue({
      activityCount: 0,
      criticalCount: 0,
      nearCriticalCount: 0,
      constraintViolationCount: 0,
      constraintWarningCount: 0,
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

const COST: Permission[] = ['cost:read'];

describe('ScheduleService.getEarnedValue', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let schedule: {
    loadEarnedValueActivities: ReturnType<typeof vi.fn>;
    loadActiveBaselineCostSnapshot: ReturnType<typeof vi.fn>;
    loadPlanCalendar: ReturnType<typeof vi.fn>;
  };
  let service: ScheduleService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    schedule = {
      // One TASK, DURATION %-complete 50, a £1,000.00 lump-sum budget, no assignments, no baseline.
      loadEarnedValueActivities: vi.fn().mockResolvedValue([
        {
          id: 'act-1',
          type: 'TASK',
          parentId: null,
          percentCompleteType: 'DURATION',
          percentComplete: 50,
          physicalPercentComplete: null,
          steps: [],
          budgetedExpense: 100000n,
          actualExpense: null,
          earlyStart: null,
          earlyFinish: null,
          assignments: [],
        },
      ]),
      loadActiveBaselineCostSnapshot: vi.fn().mockResolvedValue([]),
      loadPlanCalendar: vi.fn().mockResolvedValue(null),
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

  it('denies a caller without cost:read (403) before any load', async () => {
    // A Viewer/Contributor with only schedule:read must NOT reach cost.
    await expect(
      service.getEarnedValue(principalWith(READ), 'acme', PLAN_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(schedule.loadEarnedValueActivities).not.toHaveBeenCalled();
  });

  it('404s when the plan is not in the caller’s org', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(
      service.getEarnedValue(principalWith(COST), 'acme', PLAN_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('assembles the inputs and returns the module’s Earned-Value numbers', async () => {
    const result = await service.getEarnedValue(principalWith(COST), 'acme', PLAN_ID);
    // BAC = the £1,000.00 lump-sum; EV = BAC × 50% = £500.00; no baseline → PV falls back and is
    // flagged; currency/eacMethod come from the plan; data date = the plan start.
    expect(result).toMatchObject({
      dataDate: '2026-01-01',
      eacMethod: 'CPI',
      currencyCode: null,
      costBaselineMissing: true,
    });
    expect(result.total.bac).toBe(100000);
    expect(result.total.ev).toBe(50000);
    expect(result.total.ac).toBe(0);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({ activityId: 'act-1', performancePercent: 50 });
  });

  it('joins the active baseline cost snapshot for PV (not flagged as missing)', async () => {
    schedule.loadActiveBaselineCostSnapshot.mockResolvedValue([
      {
        sourceActivityId: 'act-1',
        budgetedCost: 100000n,
        baselineStart: new Date('2026-01-01T00:00:00Z'),
        baselineFinish: new Date('2026-01-05T00:00:00Z'),
      },
    ]);
    const result = await service.getEarnedValue(principalWith(COST), 'acme', PLAN_ID);
    // A snapshot cost is present for every leaf → the live-budget fallback flag is off.
    expect(result.costBaselineMissing).toBe(false);
  });
});

describe('ScheduleService.getResourceHistogram (M7 rung 5, ADR-0044 §3 / ADR-0035 §31)', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let schedule: {
    loadResourceHistogramAssignments: ReturnType<typeof vi.fn>;
    loadPlanCalendar: ReturnType<typeof vi.fn>;
  };
  let service: ScheduleService;

  const row = (overrides: Record<string, unknown> = {}) => ({
    resourceId: 'res-1',
    activityId: 'act-1',
    budgetedUnits: new Prisma.Decimal(1200),
    curveType: 'BELL' as const,
    // A 21-day span on the (null-calendar → all-days-work) plan calendar, DAY-aligned to the profile.
    earlyStart: new Date('2026-01-01T00:00:00Z'),
    earlyFinish: new Date('2026-01-22T00:00:00Z'),
    calendarId: null,
    ...overrides,
  });

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'VIEWER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    schedule = {
      loadResourceHistogramAssignments: vi.fn().mockResolvedValue([row()]),
      loadPlanCalendar: vi.fn().mockResolvedValue(null),
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

  it('denies a caller without schedule:read (403) before any load', async () => {
    await expect(
      service.getResourceHistogram(principalWith([]), 'acme', PLAN_ID, 'DAY', 50, 0),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(schedule.loadResourceHistogramAssignments).not.toHaveBeenCalled();
  });

  it('404s when the plan is not in the caller’s org', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(
      service.getResourceHistogram(principalWith(READ), 'acme', PLAN_ID, 'DAY', 50, 0),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('curve-shapes the histogram (BELL) and conserves units to the buckets', async () => {
    const result = await service.getResourceHistogram(
      principalWith(READ),
      'acme',
      PLAN_ID,
      'DAY',
      50,
      0,
    );
    expect(result.granularity).toBe('DAY');
    expect(result.buckets).toHaveLength(21);
    expect(result.series).toHaveLength(1);
    const series = result.series[0]!;
    expect(series.resourceId).toBe('res-1');
    // 1200 × BELL peak 9% ⇒ 108 at buckets 9 & 10; Σ = 1200.
    expect(series.values[9]).toBe(108);
    expect(series.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 4);
    expect(series.total).toBe(1200);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.curveNormalisedCount).toBe(0);
  });

  it('UNIFORM (the default) is a flat load', async () => {
    schedule.loadResourceHistogramAssignments.mockResolvedValue([
      row({ curveType: 'UNIFORM', budgetedUnits: new Prisma.Decimal(210) }),
    ]);
    const result = await service.getResourceHistogram(
      principalWith(READ),
      'acme',
      PLAN_ID,
      'DAY',
      50,
      0,
    );
    expect(result.series[0]!.values).toEqual(new Array(21).fill(10));
    expect(result.curveNormalisedCount).toBe(0);
  });

  it('offset-pages the per-resource series', async () => {
    schedule.loadResourceHistogramAssignments.mockResolvedValue([
      row({ resourceId: 'res-1' }),
      row({ resourceId: 'res-2' }),
      row({ resourceId: 'res-3' }),
    ]);
    const result = await service.getResourceHistogram(
      principalWith(READ),
      'acme',
      PLAN_ID,
      'DAY',
      1,
      1,
    );
    expect(result.total).toBe(3);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]!.resourceId).toBe('res-2'); // sorted, page of 1 at offset 1
    expect(result.hasMore).toBe(true);
  });
});
