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
import type { ActivityRepository } from '../activities/activity.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import { DependenciesService } from './dependencies.service';
import type { DependencyRepository, DependencyWithEndpoints } from './dependency.repository';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';
const PRED_ID = 'act-pred';
const SUCC_ID = 'act-succ';
const DEP_ID = 'dep-1';

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

function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    code: null,
    name: id,
    description: null,
    type: 'TASK',
    durationMinutes: 1440,
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
    parentId: null,
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

function dependency(): DependencyWithEndpoints {
  return {
    id: DEP_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    predecessorId: PRED_ID,
    successorId: SUCC_ID,
    type: 'FS',
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    predecessor: { id: PRED_ID, code: null, name: 'Pred' },
    successor: { id: SUCC_ID, code: null, name: 'Succ' },
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'dependency:read',
  'dependency:create',
  'dependency:update',
  'dependency:delete',
];

describe('DependenciesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let deps: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByPlan: ReturnType<typeof vi.fn>;
    findPredecessorsOf: ReturnType<typeof vi.fn>;
    findSuccessorsOf: ReturnType<typeof vi.fn>;
    findActiveEdgesByPlan: ReturnType<typeof vi.fn>;
    lockPlanForWrite: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
  };
  let lifecycle: { cascadeSoftDelete: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: DependenciesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    activities = {
      findActiveByIdInOrg: vi.fn((id: string) => Promise.resolve(activity(id))),
    };
    deps = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findManyActiveByPlan: vi.fn(),
      findPredecessorsOf: vi.fn(),
      findSuccessorsOf: vi.fn(),
      findActiveEdgesByPlan: vi.fn().mockResolvedValue([]),
      lockPlanForWrite: vi.fn().mockResolvedValue(undefined),
      updateIfVersionMatches: vi.fn(),
    };
    lifecycle = { cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }) };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new DependenciesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      deps as unknown as DependencyRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a link, copying org + plan from the parent', async () => {
      deps.create.mockResolvedValue(dependency());
      const result = await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        predecessorId: PRED_ID,
        successorId: SUCC_ID,
      });
      expect(result.id).toBe(DEP_ID);
      expect(deps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          planId: PLAN_ID,
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
        expect.anything(),
      );
    });

    it('passes the lag calendar through to the repository (ADR-0036 §6, M3)', async () => {
      deps.create.mockResolvedValue(dependency());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        predecessorId: PRED_ID,
        successorId: SUCC_ID,
        lagCalendar: 'TWENTY_FOUR_HOUR',
      });
      expect(deps.create).toHaveBeenCalledWith(
        expect.objectContaining({ lagCalendar: 'TWENTY_FOUR_HOUR' }),
        expect.anything(),
      );
    });

    it('rejects a self-loop (422) before touching the repository', async () => {
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: PRED_ID,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('rejects a link whose endpoint is a WBS summary (422 — a summary carries no logic)', async () => {
      activities.findActiveByIdInOrg
        .mockResolvedValueOnce(activity(PRED_ID, { type: 'WBS_SUMMARY' }))
        .mockResolvedValueOnce(activity(SUCC_ID));
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('404s when the parent plan is missing/deleted', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('404s when an endpoint activity belongs to another plan (no cross-plan link)', async () => {
      // Endpoints load predecessor then successor; the successor is in another plan.
      activities.findActiveByIdInOrg
        .mockResolvedValueOnce(activity(PRED_ID))
        .mockResolvedValueOnce(activity(SUCC_ID, { planId: 'other-plan' }));
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('404s when an endpoint activity is missing', async () => {
      activities.findActiveByIdInOrg
        .mockResolvedValueOnce(activity(PRED_ID))
        .mockResolvedValueOnce(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('forbids a caller without dependency:create', async () => {
      await expect(
        service.create(principalWith(['dependency:read']), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects a link that would close a cycle (409 CYCLE_DETECTED), under the plan lock', async () => {
      // An existing edge succ → pred means adding pred → succ closes a cycle.
      deps.findActiveEdgesByPlan.mockResolvedValue([
        { predecessorId: SUCC_ID, successorId: PRED_ID },
      ]);
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: 'CYCLE_DETECTED' });
      expect(deps.lockPlanForWrite).toHaveBeenCalledWith(PLAN_ID, expect.anything());
      expect(deps.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate (pred, succ, type) to a 409', async () => {
      deps.create.mockRejectedValue(uniqueViolation());
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, {
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: 'DUPLICATE_DEPENDENCY' });
    });
  });

  describe('lists', () => {
    it('404s the plan list when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.listByPlan(principalWith(ALL), 'acme', PLAN_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.findManyActiveByPlan).not.toHaveBeenCalled();
    });

    it('reports the next cursor for a full plan page', async () => {
      const rows = [dependency(), dependency(), dependency()].map((d, i) => ({
        ...d,
        id: `d${i}`,
      }));
      deps.findManyActiveByPlan.mockResolvedValue(rows);
      const { items, meta } = await service.listByPlan(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 2,
      });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ nextCursor: 'd1', hasMore: true });
    });

    it('404s a direction list when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.listPredecessors(principalWith(ALL), 'acme', PRED_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.findPredecessorsOf).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('409s on a stale version', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(dependency());
      deps.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', DEP_ID, { lagDays: 2, version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('maps a duplicate type change to a 409', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(dependency());
      deps.updateIfVersionMatches.mockRejectedValue(uniqueViolation());
      const error = await service
        .update(principalWith(ALL), 'acme', DEP_ID, { type: 'SS', version: 1 })
        .catch((e) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'DUPLICATE_DEPENDENCY' });
    });

    it('404s when the dependency is missing', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', DEP_ID, { lagDays: 1, version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('threads the lag calendar into the version-gated patch (M3)', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(dependency());
      deps.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', DEP_ID, {
        lagCalendar: 'TWENTY_FOUR_HOUR',
        version: 1,
      });
      expect(deps.updateIfVersionMatches).toHaveBeenCalledWith(
        DEP_ID,
        1,
        expect.objectContaining({ lagCalendar: 'TWENTY_FOUR_HOUR' }),
        expect.anything(),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing dependency via the lifecycle', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(dependency());
      await service.remove(principalWith(ALL), 'acme', DEP_ID);
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'dependency',
        DEP_ID,
        USER_ID,
      );
    });

    it('404s (and does not delete) when the dependency is missing', async () => {
      deps.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', DEP_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });
});
