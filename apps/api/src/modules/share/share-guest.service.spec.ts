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
import type { SwimlaneRepository } from '../swimlanes/swimlane.repository';

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
  let plans: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findCalendarIds: ReturnType<typeof vi.fn>;
  };
  let calendars: {
    findActiveDetailByIdInOrg: ReturnType<typeof vi.fn>;
    findHoursPerDayMinutes: ReturnType<typeof vi.fn>;
  };
  let activities: { findManyActiveByPlan: ReturnType<typeof vi.fn> };
  let dependencies: { findManyActiveByPlan: ReturnType<typeof vi.fn> };
  let schedule: { summarise: ReturnType<typeof vi.fn> };
  let swimlanes: {
    findAllActiveByPlan: ReturnType<typeof vi.fn>;
    findLanesForActivities: ReturnType<typeof vi.fn>;
  };
  let shares: { touchLastAccessedIfStale: ReturnType<typeof vi.fn> };
  let logger: Pick<PinoLogger, 'warn'>;
  let service: ShareGuestService;

  beforeEach(() => {
    plans = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue(planRow()),
      // The day-factor lookups (ADR-0068). Defaults resolve to nothing, so every activity falls
      // back to the 24-hour constant and these assertions read the arithmetic they always did.
      findCalendarIds: vi.fn().mockResolvedValue([]),
    };
    calendars = {
      findActiveDetailByIdInOrg: vi.fn().mockResolvedValue(null),
      findHoursPerDayMinutes: vi.fn().mockResolvedValue(new Map()),
    };
    activities = { findManyActiveByPlan: vi.fn().mockResolvedValue([]) };
    dependencies = { findManyActiveByPlan: vi.fn().mockResolvedValue([]) };
    schedule = { summarise: vi.fn().mockResolvedValue(aggregate()) };
    swimlanes = {
      findAllActiveByPlan: vi.fn().mockResolvedValue([]),
      findLanesForActivities: vi.fn().mockResolvedValue(new Map()),
    };
    shares = { touchLastAccessedIfStale: vi.fn().mockResolvedValue(1) };
    logger = { warn: vi.fn() };
    service = new ShareGuestService(
      plans as unknown as PlanRepository,
      calendars as unknown as CalendarRepository,
      activities as unknown as ActivityRepository,
      dependencies as unknown as DependencyRepository,
      schedule as unknown as ScheduleRepository,
      swimlanes as unknown as SwimlaneRepository,
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

  describe('swimlanes (ADR-0051 §4 as amended, SQ-4)', () => {
    const LANE_A = '00000000-0000-7000-8000-00000000000a';
    const LANE_B = '00000000-0000-7000-8000-00000000000b';
    const GONE = '00000000-0000-7000-8000-0000000000ee';

    function manual(): void {
      plans.findActiveByIdInOrg.mockResolvedValue(planRow({ swimlaneSource: 'MANUAL' } as never));
      swimlanes.findAllActiveByPlan.mockResolvedValue([
        { id: LANE_A, name: 'Mechanical', position: 0, version: 3, planId: PLAN_ID },
        { id: LANE_B, name: 'Electrical', position: 1, version: 1, planId: PLAN_ID },
      ]);
    }

    function laneRow(
      basis: 'SWIMLANE' | 'NO_SWIMLANE',
      swimlaneId: string | null,
      laneIndex: number,
    ): Record<string, unknown> {
      return {
        basis,
        swimlaneId,
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex,
        updatedAt: '2026-07-01T00:00:00.000Z',
      };
    }

    it('lists a hand-made plan’s swimlanes by id and name, in display order, and nothing else', async () => {
      manual();
      const view = await service.getPlanView(guest);
      expect(view.swimlanes).toEqual([
        { id: LANE_A, name: 'Mechanical' },
        { id: LANE_B, name: 'Electrical' },
      ]);
      expect(swimlanes.findAllActiveByPlan).toHaveBeenCalledWith(ORG_ID, PLAN_ID);
    });

    it.each(['NONE', 'WBS'] as const)(
      'lists none, and reads none, for a %s source',
      async (source) => {
        plans.findActiveByIdInOrg.mockResolvedValue(planRow({ swimlaneSource: source }));
        const view = await service.getPlanView(guest);
        expect(view.swimlanes).toEqual([]);
        expect(swimlanes.findAllActiveByPlan).not.toHaveBeenCalled();
      },
    );

    it('derives membership and the stored lane for the basis the diagram is drawn by', async () => {
      manual();
      activities.findManyActiveByPlan.mockResolvedValue([
        { ...activityRow('in-a'), swimlaneId: LANE_A },
        { ...activityRow('none'), swimlaneId: null },
        // Filed in a swimlane since deleted: shown under "No swimlane", on that basis's lane.
        { ...activityRow('gone'), swimlaneId: GONE },
      ]);
      swimlanes.findLanesForActivities.mockResolvedValue(
        new Map([
          ['in-a', [laneRow('NO_SWIMLANE', null, 5), laneRow('SWIMLANE', LANE_A, 2)]],
          ['none', [laneRow('SWIMLANE', LANE_B, 4)]],
          ['gone', [laneRow('SWIMLANE', GONE, 7), laneRow('NO_SWIMLANE', null, 1)]],
        ]),
      );
      const page = await service.listActivities(guest, { limit: 20 });
      const placed = page.items.map((i) => [i.memberOfSwimlaneId, i.swimlaneLaneIndex]);
      expect(placed).toEqual([
        [LANE_A, 2],
        [null, null],
        [null, 1],
      ]);
      expect(page.items[0]).not.toHaveProperty('swimlaneId');
      expect(page.items[0]).not.toHaveProperty('swimlaneLanes');
    });

    it('reports no membership on a plan without hand-made swimlanes, however the row is filed', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(planRow({ swimlaneSource: 'WBS' } as never));
      activities.findManyActiveByPlan.mockResolvedValue([
        { ...activityRow('kept'), swimlaneId: LANE_A },
      ]);
      const page = await service.listActivities(guest, { limit: 20 });
      expect(page.items[0]).toMatchObject({ memberOfSwimlaneId: null, swimlaneLaneIndex: null });
      expect(swimlanes.findLanesForActivities).not.toHaveBeenCalled();
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
          lagCalendar: 'PROJECT_DEFAULT',
          predecessor: { calendarId: null, type: 'TASK' },
          successor: { calendarId: null, type: 'TASK' },
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
        // The exact stored lag joined the guest scope with ADR-0070: a rounded day cannot tell a
        // two-hour cure from no lag at all.
        lagMinutes: 0,
      });
    });

    /**
     * `docs/TECH_DEBT.md` #316: the guest path used to read `Math.round(lagMinutes / 1440)`,
     * ignoring the relationship's OWN lag calendar entirely — the member DTO's rule
     * (`minutesToDays`, ADR-0068 §4). On an eight-hour lag calendar a one-day lag (480 minutes)
     * used to read as `0`; it now reads `1`, exactly as a member sees it.
     */
    it('measures lag on the relationship’s OWN lag calendar, not a hard-pinned 1440', async () => {
      plans.findCalendarIds.mockResolvedValue([{ id: PLAN_ID, calendarId: 'cal-8h' }]);
      calendars.findHoursPerDayMinutes.mockResolvedValue(new Map([['cal-8h', 480]]));
      dependencies.findManyActiveByPlan.mockResolvedValue([
        {
          id: 'd1',
          predecessorId: 'a1',
          successorId: 'a2',
          type: 'FS',
          lagMinutes: 480,
          lagCalendar: 'PROJECT_DEFAULT',
          predecessor: { calendarId: null, type: 'TASK' },
          successor: { calendarId: null, type: 'TASK' },
        },
      ]);

      const page = await service.listDependencies(guest, { limit: 20 });

      expect(page.items[0]).toMatchObject({ lagDays: 1, lagMinutes: 480 });
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
