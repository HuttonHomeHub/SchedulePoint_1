import type { Activity, Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestPrincipal } from '../../common/auth/guest-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import type { ActivityRepository } from '../activities/activity.repository';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { DependencyRepository } from '../dependencies/dependency.repository';
import type { PlanRepository } from '../plans/plan.repository';
import type { ScheduleAggregate, ScheduleRepository } from '../schedule/schedule.repository';

import type { PlanShareRepository } from './plan-share.repository';
import { GUEST_ACCESS_TOUCH_STALE_MS, ShareGuestService } from './share-guest.service';

const SHARE_ID = 'share-1';
const PLAN_ID = '00000000-0000-7000-8000-000000000001';
const ORG_ID = 'org-1';
const OTHER_PLAN = '00000000-0000-7000-8000-0000000000ff';
const OTHER_ORG = 'org-evil';

const guest = new GuestPrincipal(SHARE_ID, PLAN_ID, ORG_ID);

const DAY = new Date(Date.UTC(2026, 6, 1));

function planRow(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'proj-1',
    name: 'Tower A',
    status: 'ACTIVE',
    description: 'desc',
    plannedStart: DAY,
    calendarId: null,
    ...overrides,
  } as Plan;
}

function aggregate(): ScheduleAggregate {
  return {
    activityCount: 2,
    criticalCount: 1,
    nearCriticalCount: 0,
    constraintViolationCount: 0,
    externalDrivenCount: 0,
    constraintWarningCount: 0,
    loeNoSpanCount: 0,
    resourceDriverMissingCount: 0,
    leveledActivityCount: 0,
    levelingWindowExceededCount: 0,
    selfOverAllocatedCount: 0,
    leveledProjectFinish: null,
    projectFinish: '2026-08-15',
  };
}

function activityRow(id: string): Activity {
  return {
    id,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    code: id,
    name: id,
    type: 'TASK',
    durationMinutes: 1440,
    laneIndex: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: DAY,
    earlyFinish: DAY,
    lateStart: DAY,
    lateFinish: DAY,
    totalFloat: 0,
    isCritical: true,
  } as Activity;
}

describe('ShareGuestService', () => {
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let calendars: { findActiveDetailByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: { findManyActiveByPlan: ReturnType<typeof vi.fn> };
  let dependencies: { findManyActiveByPlan: ReturnType<typeof vi.fn> };
  let schedule: { summarise: ReturnType<typeof vi.fn> };
  let shares: { touchLastAccessedIfStale: ReturnType<typeof vi.fn> };
  let logger: Pick<PinoLogger, 'warn'>;
  let service: ShareGuestService;

  beforeEach(() => {
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(planRow()) };
    calendars = { findActiveDetailByIdInOrg: vi.fn().mockResolvedValue(null) };
    activities = { findManyActiveByPlan: vi.fn().mockResolvedValue([]) };
    dependencies = { findManyActiveByPlan: vi.fn().mockResolvedValue([]) };
    schedule = { summarise: vi.fn().mockResolvedValue(aggregate()) };
    shares = { touchLastAccessedIfStale: vi.fn().mockResolvedValue(1) };
    logger = { warn: vi.fn() };
    service = new ShareGuestService(
      plans as unknown as PlanRepository,
      calendars as unknown as CalendarRepository,
      activities as unknown as ActivityRepository,
      dependencies as unknown as DependencyRepository,
      schedule as unknown as ScheduleRepository,
      shares as unknown as PlanShareRepository,
      logger as unknown as PinoLogger,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  describe('getPlanView', () => {
    it('scopes EVERY read to the token’s plan + org (anti-IDOR — never any other id)', async () => {
      await service.getPlanView(guest);

      expect(plans.findActiveByIdInOrg).toHaveBeenCalledWith(PLAN_ID, ORG_ID);
      expect(schedule.summarise).toHaveBeenCalledWith(ORG_ID, PLAN_ID);
      // No call ever references a foreign plan/org.
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalledWith(OTHER_PLAN, expect.anything());
      expect(schedule.summarise).not.toHaveBeenCalledWith(OTHER_ORG, expect.anything());
    });

    it('loads the calendar only when the plan has one, scoped to the org', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(planRow({ calendarId: 'cal-1' }));
      await service.getPlanView(guest);
      expect(calendars.findActiveDetailByIdInOrg).toHaveBeenCalledWith('cal-1', ORG_ID);
    });

    it('does not touch the calendar repo when the plan has no calendar', async () => {
      await service.getPlanView(guest);
      expect(calendars.findActiveDetailByIdInOrg).not.toHaveBeenCalled();
    });

    it('returns the field-stripped plan view (header + summary)', async () => {
      const view = await service.getPlanView(guest);
      expect(view).toMatchObject({
        id: PLAN_ID,
        name: 'Tower A',
        status: 'ACTIVE',
        dataDate: '2026-07-01',
        calendar: null,
      });
      expect(view.summary.projectFinish).toBe('2026-08-15');
    });

    it('404s (uniform) when the plan is gone — defence in depth behind the guard', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.getPlanView(guest)).rejects.toBeInstanceOf(NotFoundError);
      expect(schedule.summarise).not.toHaveBeenCalled();
    });

    it('fires the COALESCED last-accessed touch for the token’s share id', async () => {
      await service.getPlanView(guest);
      expect(shares.touchLastAccessedIfStale).toHaveBeenCalledWith(
        SHARE_ID,
        GUEST_ACCESS_TOUCH_STALE_MS,
      );
    });
  });

  describe('listActivities', () => {
    it('reads the token’s plan/org, takes limit+1, and maps to guest DTOs', async () => {
      activities.findManyActiveByPlan.mockResolvedValue([activityRow('a1'), activityRow('a2')]);
      const page = await service.listActivities(guest, { limit: 20 });

      expect(activities.findManyActiveByPlan).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        planId: PLAN_ID,
        take: 21,
      });
      expect(page.items).toHaveLength(2);
      expect(page.items[0]).not.toHaveProperty('organizationId');
      expect(page.items[0]).not.toHaveProperty('createdBy');
      expect(page.meta).toEqual({ nextCursor: null, hasMore: false });
    });

    it('paginates: over-fetch signals hasMore and yields the last kept id as the cursor', async () => {
      activities.findManyActiveByPlan.mockResolvedValue([
        activityRow('a1'),
        activityRow('a2'),
        activityRow('a3'),
      ]);
      const page = await service.listActivities(guest, { limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.meta).toEqual({ nextCursor: 'a2', hasMore: true });
    });

    it('threads the cursor through to the repository', async () => {
      await service.listActivities(guest, { limit: 10, cursor: 'a5' });
      expect(activities.findManyActiveByPlan).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        planId: PLAN_ID,
        take: 11,
        cursor: 'a5',
      });
    });
  });

  describe('listDependencies', () => {
    it('reads the token’s plan/org and returns stripped edges', async () => {
      dependencies.findManyActiveByPlan.mockResolvedValue([
        {
          id: 'd1',
          predecessorId: 'a1',
          successorId: 'a2',
          type: 'FS',
          lagMinutes: 0,
        },
      ]);
      const page = await service.listDependencies(guest, { limit: 20 });
      expect(dependencies.findManyActiveByPlan).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        planId: PLAN_ID,
        take: 21,
      });
      expect(page.items[0]).toEqual({
        id: 'd1',
        predecessorId: 'a1',
        successorId: 'a2',
        type: 'FS',
        lagDays: 0,
      });
    });
  });

  it('never lets a failed telemetry touch break a read (fire-and-forget)', async () => {
    shares.touchLastAccessedIfStale.mockRejectedValue(new Error('db down'));
    await expect(service.getPlanView(guest)).resolves.toBeDefined();
    // Let the rejected promise settle so the catch runs.
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalled();
  });
});
