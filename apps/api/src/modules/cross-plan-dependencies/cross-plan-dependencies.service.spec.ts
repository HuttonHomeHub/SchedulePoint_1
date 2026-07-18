import { Prisma, type Activity, type Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActivityRepository } from '../activities/activity.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import { CrossPlanDependenciesService } from './cross-plan-dependencies.service';
import type {
  CrossPlanDependencyRepository,
  CrossPlanDependencyWithEndpoints,
} from './cross-plan-dependency.repository';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PRED_PLAN = 'plan-up';
const SUCC_PLAN = 'plan-down';
const PRED_ID = 'act-pred';
const SUCC_ID = 'act-succ';
const LINK_ID = 'xpd-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: SUCC_PLAN,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Downstream',
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
    scheduleComputedAt: null,
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

function activity(id: string, planId: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    organizationId: ORG_ID,
    planId,
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
    externalEarlyStart: null,
    externalLateFinish: null,
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
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayMinutes: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
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

function link(): CrossPlanDependencyWithEndpoints {
  return {
    id: LINK_ID,
    organizationId: ORG_ID,
    predecessorPlanId: PRED_PLAN,
    successorPlanId: SUCC_PLAN,
    predecessorId: PRED_ID,
    successorId: SUCC_ID,
    type: 'FS',
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
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

const ALL: Permission[] = ['dependency:read', 'dependency:link_cross_plan'];

describe('CrossPlanDependenciesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let repo: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    listBySuccessorPlan: ReturnType<typeof vi.fn>;
    listByActivity: ReturnType<typeof vi.fn>;
    loadOrgAdjacency: ReturnType<typeof vi.fn>;
    findDuplicate: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
  };
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: CrossPlanDependenciesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    // Predecessor is in the upstream plan; successor in the downstream plan (different plans).
    activities = {
      findActiveByIdInOrg: vi.fn((id: string) =>
        Promise.resolve(
          id === PRED_ID ? activity(PRED_ID, PRED_PLAN) : activity(SUCC_ID, SUCC_PLAN),
        ),
      ),
    };
    repo = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      listBySuccessorPlan: vi.fn(),
      listByActivity: vi.fn(),
      loadOrgAdjacency: vi.fn().mockResolvedValue([]),
      findDuplicate: vi.fn().mockResolvedValue(null),
      softDelete: vi.fn().mockResolvedValue(1),
    };
    editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    // The tx handle carries `$executeRaw` because the service takes the org-scoped advisory lock
    // (acquireOrgCrossPlanLock) directly on it before loading the adjacency.
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new CrossPlanDependenciesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      repo as unknown as CrossPlanDependencyRepository,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a link, deriving both plan ids from the endpoints and copying the org', async () => {
      repo.create.mockResolvedValue(link());
      const result = await service.create(principalWith(ALL), 'acme', {
        predecessorActivityId: PRED_ID,
        successorActivityId: SUCC_ID,
      });
      expect(result.id).toBe(LINK_ID);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          predecessorPlanId: PRED_PLAN,
          successorPlanId: SUCC_PLAN,
          predecessorId: PRED_ID,
          successorId: SUCC_ID,
          type: 'FS',
        }),
        expect.anything(),
      );
      // The pen is asserted on the SUCCESSOR plan (the edge's home).
      expect(editLock.assertHoldsPen).toHaveBeenCalledWith(
        expect.anything(),
        SUCC_PLAN,
        ORG_ID,
        expect.anything(),
      );
    });

    it('passes the lag calendar through to the repository (ADR-0036 §6, M3)', async () => {
      repo.create.mockResolvedValue(link());
      await service.create(principalWith(ALL), 'acme', {
        predecessorActivityId: PRED_ID,
        successorActivityId: SUCC_ID,
        lagCalendar: 'TWENTY_FOUR_HOUR',
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ lagCalendar: 'TWENTY_FOUR_HOUR' }),
        expect.anything(),
      );
    });

    it('forbids a caller without dependency:link_cross_plan (403)', async () => {
      await expect(
        service.create(principalWith(['dependency:read']), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('404s when an endpoint activity is missing or in another org (anti-IDOR)', async () => {
      activities.findActiveByIdInOrg
        .mockResolvedValueOnce(activity(PRED_ID, PRED_PLAN))
        .mockResolvedValueOnce(null);
      await expect(
        service.create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a same-plan edge (422 CROSS_PLAN_SAME_PLAN, N31) before opening the transaction', async () => {
      activities.findActiveByIdInOrg
        .mockResolvedValueOnce(activity(PRED_ID, SUCC_PLAN))
        .mockResolvedValueOnce(activity(SUCC_ID, SUCC_PLAN));
      const error = await service
        .create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual({ reason: 'CROSS_PLAN_SAME_PLAN' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a link that would close a plan-level cycle (409 CROSS_PLAN_CYCLE_DETECTED, N30)', async () => {
      // An existing edge SUCC_PLAN → PRED_PLAN means adding PRED_PLAN → SUCC_PLAN closes a cycle.
      repo.loadOrgAdjacency.mockResolvedValue([
        { predecessorPlanId: SUCC_PLAN, successorPlanId: PRED_PLAN },
      ]);
      const error = await service
        .create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: 'CROSS_PLAN_CYCLE_DETECTED' });
      expect(repo.create).not.toHaveBeenCalled();
      // The cycle is rejected before the pen is asserted (task-mandated ordering).
      expect(editLock.assertHoldsPen).not.toHaveBeenCalled();
    });

    it('surfaces a 423 when the caller does not hold the successor plan pen', async () => {
      editLock.assertHoldsPen.mockRejectedValue(new LockedError('locked'));
      await expect(
        service.create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        }),
      ).rejects.toBeInstanceOf(LockedError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate (pred, succ, type) via the pre-check (409 N33)', async () => {
      repo.findDuplicate.mockResolvedValue({ id: 'existing' });
      const error = await service
        .create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        reason: 'DUPLICATE_CROSS_PLAN_DEPENDENCY',
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('maps a P2002 unique violation to a 409 (N33 backstop)', async () => {
      repo.create.mockRejectedValue(uniqueViolation());
      const error = await service
        .create(principalWith(ALL), 'acme', {
          predecessorActivityId: PRED_ID,
          successorActivityId: SUCC_ID,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        reason: 'DUPLICATE_CROSS_PLAN_DEPENDENCY',
      });
    });
  });

  describe('lists', () => {
    it('404s the plan list when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.listByPlan(principalWith(ALL), 'acme', SUCC_PLAN, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.listBySuccessorPlan).not.toHaveBeenCalled();
    });

    it('reports the next cursor for a full plan page', async () => {
      const rows = [link(), link(), link()].map((l, i) => ({ ...l, id: `x${i}` }));
      repo.listBySuccessorPlan.mockResolvedValue(rows);
      const { items, meta } = await service.listByPlan(principalWith(ALL), 'acme', SUCC_PLAN, {
        limit: 2,
      });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ nextCursor: 'x1', hasMore: true });
    });

    it('404s an activity list when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.listByActivity(principalWith(ALL), 'acme', PRED_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.listByActivity).not.toHaveBeenCalled();
    });

    it('forbids a list for a caller without dependency:read', async () => {
      await expect(
        service.listByPlan(principalWith(['dependency:link_cross_plan']), 'acme', SUCC_PLAN, {
          limit: 20,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing link after asserting the successor-plan pen', async () => {
      repo.findActiveByIdInOrg.mockResolvedValue(link());
      await service.remove(principalWith(ALL), 'acme', LINK_ID);
      expect(editLock.assertHoldsPen).toHaveBeenCalledWith(expect.anything(), SUCC_PLAN, ORG_ID);
      expect(repo.softDelete).toHaveBeenCalledWith(LINK_ID, USER_ID, expect.anything());
    });

    it('404s (and does not delete) when the link is missing', async () => {
      repo.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', LINK_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });
});
