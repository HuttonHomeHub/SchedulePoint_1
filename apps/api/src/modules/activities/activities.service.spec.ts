import { Prisma, type Activity, type Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import { ActivitiesService } from './activities.service';
import type { ActivityRepository } from './activity.repository';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';
const ACTIVITY_ID = 'act-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Baseline',
    description: null,
    status: 'DRAFT',
    // Data date late enough that the progress tests' 2026 actuals are all on/before it (M2 N07).
    plannedStart: new Date('2026-12-31T00:00:00.000Z'),
    calendarId: null,
    schedulingMode: 'EARLY',
    progressRecalcMode: 'RETAINED_LOGIC',
    useExpectedFinishDates: false,
    criticalPathDefinition: 'TOTAL_FLOAT',
    criticalFloatThreshold: 0,
    totalFloatMode: 'FINISH',
    makeOpenEndsCritical: false,
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

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACTIVITY_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    // Stored in working-minutes now (ADR-0036): 5 working days = 5 × 1440.
    durationMinutes: 5 * 1440,
    calendarId: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    loeNoSpan: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
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

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'activity:read',
  'activity:create',
  'activity:update',
  'activity:delete',
  'activity:restore',
];

describe('ActivitiesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByPlan: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let calendars: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ActivitiesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    activities = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findByIdInOrg: vi.fn(),
      findManyActiveByPlan: vi.fn(),
      updateIfVersionMatches: vi.fn(),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    // The tx carries `$executeRaw` for the calendar advisory lock (ADR-0037 validation path).
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    // Activity calendars are validated in-org via this repo (ADR-0037); default: id resolves.
    calendars = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: 'cal-1' }) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ActivitiesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      calendars as unknown as CalendarRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates an activity under an active parent plan, copying its org id', async () => {
      activities.create.mockResolvedValue(activity());
      const result = await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Excavate',
      });
      expect(result.id).toBe(ACTIVITY_ID);
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, planId: PLAN_ID, name: 'Excavate' }),
        expect.anything(), // the transaction client (calendar validation is serialised inside it)
      );
    });

    it('validates a specific calendar in-org and threads it into the insert (M5, ADR-0037)', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Cure',
        calendarId: 'cal-1',
      });
      expect(calendars.findActiveByIdInOrg).toHaveBeenCalledWith(
        'cal-1',
        ORG_ID,
        expect.anything(),
      );
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'cal-1' }),
        expect.anything(),
      );
    });

    it('rejects a foreign/unknown activity calendar with 404 before the insert (M5)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Cure', calendarId: 'cal-x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('defaults type to TASK and duration to 1 when omitted', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'A' });
      const arg = activities.create.mock.calls[0]?.[0] as { type: string; durationMinutes: number };
      expect(arg.type).toBe('TASK');
      // Public default of 1 working day is stored as 1440 working-minutes (ADR-0036).
      expect(arg.durationMinutes).toBe(1440);
    });

    it('forces a milestone duration to 0 even if a non-zero value slips through', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'M',
        type: 'START_MILESTONE',
        durationDays: 3,
      });
      const arg = activities.create.mock.calls[0]?.[0] as { durationMinutes: number };
      expect(arg.durationMinutes).toBe(0);
    });

    it('converts a constraintDate (YYYY-MM-DD) to a UTC-midnight Date', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'A',
        constraintType: 'SNET',
        constraintDate: '2026-05-01',
      });
      const arg = activities.create.mock.calls[0]?.[0] as {
        constraintType: string;
        constraintDate: Date;
      };
      expect(arg.constraintType).toBe('SNET');
      expect(arg.constraintDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });

    it('404s when the parent plan is missing/deleted (and does not create)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('forbids a caller without activity:create', async () => {
      await expect(
        service.create(principalWith(['activity:read']), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name/code to a 409', async () => {
      activities.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Excavate' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('list', () => {
    it('404s when the parent plan is missing/deleted', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.findManyActiveByPlan).not.toHaveBeenCalled();
    });

    it('reports the next cursor when a full page + 1 comes back', async () => {
      activities.findManyActiveByPlan.mockResolvedValue([
        activity({ id: 'a' }),
        activity({ id: 'b' }),
        activity({ id: 'c' }),
      ]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 2 });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ nextCursor: 'b', hasMore: true });
    });
  });

  describe('update', () => {
    it('clears code/description on an empty string and constraint on null', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
        code: '',
        description: '',
        constraintType: null,
        constraintDate: null,
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        code: string | null;
        description: string | null;
        constraintType: unknown;
        constraintDate: Date | null;
      };
      expect(patch.code).toBeNull();
      expect(patch.description).toBeNull();
      expect(patch.constraintType).toBeNull();
      expect(patch.constraintDate).toBeNull();
    });

    it('coerces duration to 0 when the type is changed to a milestone', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
        type: 'FINISH_MILESTONE',
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        durationMinutes: number;
      };
      expect(patch.durationMinutes).toBe(0);
    });

    it('422s a partial constraint update (one side omitted) without touching the row', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          constraintType: null,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('409s on a stale version', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateProgress', () => {
    const PROGRESS: Permission[] = ['activity:update_progress'];

    it('derives IN_PROGRESS from a partial percentage', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        percentComplete: 40,
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        status: string;
        percentComplete: number;
      };
      expect(patch.status).toBe('IN_PROGRESS');
      expect(patch.percentComplete).toBe(40);
    });

    it('derives COMPLETE from 100% and IN_PROGRESS from a start date at 0%', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);

      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        percentComplete: 100,
        actualStart: '2026-05-01',
        actualFinish: '2026-06-01',
        version: 1,
      });
      expect(
        (activities.updateIfVersionMatches.mock.calls[0]?.[2] as { status: string }).status,
      ).toBe('COMPLETE');

      // Started but 0% → IN_PROGRESS (the actual-start signal, not just the %).
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        actualStart: '2026-05-01',
        version: 1,
      });
      expect(
        (activities.updateIfVersionMatches.mock.calls[1]?.[2] as { status: string }).status,
      ).toBe('IN_PROGRESS');
    });

    it('rejects a finish without a start, and a finish before the start', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualFinish: '2026-06-01',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualStart: '2026-06-01',
          actualFinish: '2026-05-01',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('rejects an actual date after the data date (M2 N07)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      // Data date is 2026-12-31; an actual start in 2027 is in the future.
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualStart: '2027-03-01',
          version: 1,
        }),
      ).rejects.toMatchObject({ details: { reason: 'ACTUAL_AFTER_DATA_DATE' } });
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('repairs a complete activity with no actual finish to the data date (M2 N08)', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          percentComplete: 100,
          actualStart: '2026-05-01',
          version: 1, // no actualFinish, but 100% ⇒ complete
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        actualFinish: Date;
        status: string;
      };
      expect(patch.status).toBe('COMPLETE');
      expect(patch.actualFinish.toISOString()).toBe('2026-12-31T00:00:00.000Z'); // repaired to data date
      // The repair is surfaced to the caller as a machine-readable warning (ADR-0035 §6).
      expect(warnings).toEqual([
        { code: 'COMPLETE_WITHOUT_FINISH', message: expect.any(String) as string },
      ]);
    });

    it('repairs remaining > 0 on a complete activity to 0 (M2 N18)', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          percentComplete: 100,
          actualStart: '2026-05-01',
          actualFinish: '2026-06-01',
          remainingDurationDays: 3, // contradicts completeness → repaired to 0
          version: 1,
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        remainingDurationMinutes: number;
      };
      expect(patch.remainingDurationMinutes).toBe(0);
      expect(warnings).toEqual([
        { code: 'REMAINING_ON_COMPLETE', message: expect.any(String) as string },
      ]);
    });

    it('converts remaining days to stored minutes for an in-progress activity (M2), no warnings', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          actualStart: '2026-05-01',
          remainingDurationDays: 2,
          version: 1,
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        remainingDurationMinutes: number;
      };
      expect(patch.remainingDurationMinutes).toBe(2 * 1440);
      // An ordinary in-progress report repairs nothing.
      expect(warnings).toEqual([]);
    });

    it('forbids a caller without activity:update_progress', async () => {
      await expect(
        service.updateProgress(principalWith(['activity:read']), 'acme', ACTIVITY_ID, {
          percentComplete: 10,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(activities.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('409s on a stale version', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          percentComplete: 50,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing activity', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await service.remove(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        ACTIVITY_ID,
        USER_ID,
      );
    });

    it('404s (and does not delete) when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted activity', async () => {
      activities.findByIdInOrg.mockResolvedValue(activity({ deletedAt: new Date() }));
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const result = await service.restore(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        ACTIVITY_ID,
        USER_ID,
      );
      expect(result.id).toBe(ACTIVITY_ID);
    });

    it('is a no-op when the activity is already active', async () => {
      activities.findByIdInOrg.mockResolvedValue(activity({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('404s when the activity is unknown in this org', async () => {
      activities.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
