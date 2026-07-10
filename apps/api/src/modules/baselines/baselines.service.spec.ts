import { Prisma, type Baseline, type Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { BaselineRepository, CaptureActivityRow } from './baseline.repository';
import { BASELINE_ERROR, BaselinesService } from './baselines.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'proj-1',
    name: 'Baseline plan',
    description: null,
    status: 'DRAFT',
    plannedStart: new Date('2026-01-05T00:00:00Z'),
    calendarId: null,
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

function baseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
    id: 'base-1',
    organizationId: ORG_ID,
    planId: PLAN_ID,
    name: 'Contract Baseline',
    isActive: true,
    capturedAt: new Date('2026-01-05T09:00:00Z'),
    dataDate: new Date('2026-01-05T00:00:00Z'),
    capturedProjectFinish: new Date('2026-03-01T00:00:00Z'),
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

function activityRow(overrides: Partial<CaptureActivityRow> = {}): CaptureActivityRow {
  return {
    id: 'act-1',
    code: 'A100',
    name: 'Mobilise',
    type: 'TASK',
    durationDays: 5,
    earlyStart: new Date('2026-01-05T00:00:00Z'),
    earlyFinish: new Date('2026-01-09T00:00:00Z'),
    lateStart: new Date('2026-01-05T00:00:00Z'),
    lateFinish: new Date('2026-01-09T00:00:00Z'),
    totalFloat: 0,
    isCritical: true,
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
  'baseline:read',
  'baseline:create',
  'baseline:activate',
  'baseline:delete',
];

describe('BaselinesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let baselines: {
    createWithSnapshot: ReturnType<typeof vi.fn>;
    loadActiveActivitiesForCapture: ReturnType<typeof vi.fn>;
    countActiveByPlan: ReturnType<typeof vi.fn>;
    findActiveByIdInPlan: ReturnType<typeof vi.fn>;
    findActiveDetailByIdInPlan: ReturnType<typeof vi.fn>;
    findActiveWithCountByIdInPlan: ReturnType<typeof vi.fn>;
    findManyActiveByPlan: ReturnType<typeof vi.fn>;
    clearActive: ReturnType<typeof vi.fn>;
    setActive: ReturnType<typeof vi.fn>;
    softDeleteWithSnapshot: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: BaselinesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    baselines = {
      createWithSnapshot: vi.fn().mockResolvedValue(baseline()),
      loadActiveActivitiesForCapture: vi.fn().mockResolvedValue([activityRow()]),
      countActiveByPlan: vi.fn().mockResolvedValue(0),
      findActiveByIdInPlan: vi.fn().mockResolvedValue(baseline()),
      findActiveDetailByIdInPlan: vi.fn(),
      findActiveWithCountByIdInPlan: vi.fn().mockResolvedValue({ ...baseline(), activityCount: 1 }),
      findManyActiveByPlan: vi.fn().mockResolvedValue([]),
      clearActive: vi.fn(),
      setActive: vi.fn().mockResolvedValue(1),
      softDeleteWithSnapshot: vi.fn(),
    };
    // The tx handle exposes $executeRaw (the plan advisory lock used by capture).
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new BaselinesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      baselines as unknown as BaselineRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('capture', () => {
    it('captures a baseline, freezing identity + computed dates', async () => {
      const result = await service.capture(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Contract Baseline',
      });
      expect(result.baseline.id).toBe('base-1');
      expect(result.activityCount).toBe(1);
      expect(baselines.createWithSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          planId: PLAN_ID,
          name: 'Contract Baseline',
          dataDate: plan().plannedStart,
          capturedProjectFinish: activityRow().earlyFinish,
          activities: [expect.objectContaining({ id: 'act-1', name: 'Mobilise' })],
        }),
        expect.anything(),
      );
    });

    it('makes the plan’s FIRST baseline active, later ones inactive', async () => {
      baselines.countActiveByPlan.mockResolvedValueOnce(0);
      await service.capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'First' });
      expect(baselines.createWithSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: true }),
        expect.anything(),
      );

      baselines.countActiveByPlan.mockResolvedValueOnce(1);
      await service.capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'Second' });
      expect(baselines.createWithSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
        expect.anything(),
      );
    });

    it('rejects (422) an empty plan with nothing to freeze', async () => {
      baselines.loadActiveActivitiesForCapture.mockResolvedValue([]);
      const error = await service
        .capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual({
        reason: BASELINE_ERROR.SCHEDULE_NOT_CALCULATED,
      });
      expect(baselines.createWithSnapshot).not.toHaveBeenCalled();
    });

    it('rejects (422) a never-calculated plan (activities but no computed finish)', async () => {
      baselines.loadActiveActivitiesForCapture.mockResolvedValue([
        activityRow({ earlyStart: null, earlyFinish: null }),
      ]);
      await expect(
        service.capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(baselines.createWithSnapshot).not.toHaveBeenCalled();
    });

    it('404s when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('maps a duplicate name to a 409', async () => {
      baselines.createWithSnapshot.mockRejectedValue(uniqueViolation());
      await expect(
        service.capture(principalWith(ALL), 'acme', PLAN_ID, { name: 'Contract Baseline' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('forbids a caller without baseline:create', async () => {
      await expect(
        service.capture(principalWith(['baseline:read']), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(baselines.loadActiveActivitiesForCapture).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns a plan’s baselines with their activity counts', async () => {
      baselines.findManyActiveByPlan.mockResolvedValue([{ ...baseline(), activityCount: 3 }]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 20,
        order: 'desc',
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.activityCount).toBe(3);
      expect(meta.hasMore).toBe(false);
    });

    it('paginates with a next cursor when there are more', async () => {
      const rows = [
        { ...baseline({ id: 'b1' }), activityCount: 1 },
        { ...baseline({ id: 'b2' }), activityCount: 1 },
      ];
      baselines.findManyActiveByPlan.mockResolvedValue(rows);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 1,
        order: 'desc',
      });
      expect(items).toHaveLength(1);
      expect(meta.hasMore).toBe(true);
      expect(meta.nextCursor).toBe('b1');
    });

    it('404s when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 20, order: 'desc' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('forbids a caller without baseline:read', async () => {
      await expect(
        service.list(principalWith([]), 'acme', PLAN_ID, { limit: 20, order: 'desc' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('activate', () => {
    it('clears the current active then sets the target active (in that order)', async () => {
      const result = await service.activate(principalWith(ALL), 'acme', PLAN_ID, 'base-1');
      // clearActive must run before setActive so the one-active partial unique never trips.
      expect(baselines.clearActive.mock.invocationCallOrder[0]).toBeLessThan(
        baselines.setActive.mock.invocationCallOrder[0]!,
      );
      expect(result.baseline.id).toBe('base-1');
      expect(result.activityCount).toBe(1);
    });

    it('404s when the baseline is missing', async () => {
      baselines.findActiveByIdInPlan.mockResolvedValue(null);
      await expect(
        service.activate(principalWith(ALL), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(baselines.setActive).not.toHaveBeenCalled();
    });

    it('404s when the baseline is deleted between the check and the flip', async () => {
      baselines.setActive.mockResolvedValue(0);
      await expect(
        service.activate(principalWith(ALL), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('forbids a caller without baseline:activate', async () => {
      await expect(
        service.activate(principalWith(['baseline:read']), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(baselines.clearActive).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-cascades the baseline and its snapshot rows', async () => {
      await service.remove(principalWith(ALL), 'acme', PLAN_ID, 'base-1');
      expect(baselines.softDeleteWithSnapshot).toHaveBeenCalledWith(
        'base-1',
        USER_ID,
        expect.anything(),
      );
    });

    it('404s (and does not delete) when the baseline is missing', async () => {
      baselines.findActiveByIdInPlan.mockResolvedValue(null);
      await expect(
        service.remove(principalWith(ALL), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(baselines.softDeleteWithSnapshot).not.toHaveBeenCalled();
    });

    it('forbids a caller without baseline:delete', async () => {
      await expect(
        service.remove(principalWith(['baseline:read']), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(baselines.softDeleteWithSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('404s when the baseline is missing in this plan', async () => {
      baselines.findActiveDetailByIdInPlan.mockResolvedValue(null);
      await expect(
        service.get(principalWith(ALL), 'acme', PLAN_ID, 'base-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns the baseline with its frozen activities', async () => {
      baselines.findActiveDetailByIdInPlan.mockResolvedValue({ ...baseline(), activities: [] });
      const result = await service.get(principalWith(ALL), 'acme', PLAN_ID, 'base-1');
      expect(result.id).toBe('base-1');
      expect(result.activities).toEqual([]);
    });
  });
});
