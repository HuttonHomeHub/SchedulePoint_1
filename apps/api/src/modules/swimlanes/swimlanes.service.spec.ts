import { Prisma, type Plan, type Swimlane } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { lockActiveProjectChainForShare } from '../../common/db/hierarchy-row-lock';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { SwimlaneRepository } from './swimlane.repository';
import { SwimlanesService } from './swimlanes.service';

vi.mock('../../common/db/plan-advisory-lock', () => ({ acquirePlanWriteLock: vi.fn() }));
vi.mock('../../common/db/hierarchy-row-lock', () => ({
  lockActiveProjectChainForShare: vi.fn(),
}));

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';
const LANE_ID = 'lane-1';
const USER_ID = 'user-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Tower',
    deletedAt: null,
    ...overrides,
  } as Plan;
}

function lane(overrides: Partial<Swimlane> = {}): Swimlane {
  return {
    id: LANE_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    name: 'Mechanical',
    position: 0,
    version: 1,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  } as Swimlane;
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'swimlane:read',
  'swimlane:create',
  'swimlane:update',
  'swimlane:delete',
  'swimlane:restore',
];

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('SwimlanesService', () => {
  let plans: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let tx: { project: { findFirst: ReturnType<typeof vi.fn> } };
  let service: SwimlanesService;

  beforeEach(() => {
    vi.mocked(acquirePlanWriteLock).mockReset();
    vi.mocked(lockActiveProjectChainForShare).mockReset().mockResolvedValue(true);
    const organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()),
      findByIdInOrg: vi.fn().mockResolvedValue(plan()),
    };
    repo = {
      create: vi.fn((data: Partial<Swimlane>) => Promise.resolve(lane(data))),
      findActiveInPlan: vi.fn().mockResolvedValue(lane()),
      findInPlan: vi.fn().mockResolvedValue(lane()),
      findManyActiveByPlan: vi.fn().mockResolvedValue([]),
      findManyActiveInTx: vi.fn().mockResolvedValue([]),
      countActive: vi.fn().mockResolvedValue(0),
      maxActivePosition: vi.fn().mockResolvedValue(-1),
      shiftAfter: vi.fn().mockResolvedValue(undefined),
      renameIfVersionMatches: vi.fn().mockResolvedValue(1),
      lockActiveVersion: vi.fn().mockResolvedValue(1),
      softDelete: vi.fn().mockResolvedValue('batch-1'),
      restore: vi.fn().mockResolvedValue(1),
      lockActiveInIdOrder: vi.fn().mockResolvedValue([]),
      rewritePositions: vi.fn().mockResolvedValue(undefined),
    };
    editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1', clientId: 'c-1' }) },
    };
    const prisma = { $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)) };
    service = new SwimlanesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      repo as unknown as SwimlaneRepository,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  describe('authorisation', () => {
    it('refuses a write without the permission before touching the plan', async () => {
      const viewer = principalWith(['swimlane:read']);
      await expect(service.create(viewer, 'acme', PLAN_ID, { name: 'A' })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('answers 404 for a plan outside the organisation', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 100 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('answers 404 for a swimlane that is not in this plan and organisation', async () => {
      repo.findActiveInPlan!.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, LANE_ID, { name: 'B', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.findActiveInPlan).toHaveBeenCalledWith(LANE_ID, PLAN_ID, ORG_ID);
    });
  });

  describe('create', () => {
    it('copies the organisation from the loaded plan and appends at max+1 under the lock and pen', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan({ organizationId: 'org-from-plan' }));
      repo.maxActivePosition!.mockResolvedValue(4);
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Civil' });
      expect(acquirePlanWriteLock).toHaveBeenCalledWith(tx, PLAN_ID);
      expect(editLock.assertHoldsPen).toHaveBeenCalledWith(expect.anything(), PLAN_ID, ORG_ID, tx);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-from-plan',
          planId: PLAN_ID,
          name: 'Civil',
          position: 5,
        }),
        tx,
      );
    });

    it('inserts after a swimlane by shifting the later ones', async () => {
      repo.findActiveInPlan!.mockResolvedValue(lane({ position: 2 }));
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X', after: LANE_ID });
      expect(repo.shiftAfter).toHaveBeenCalledWith(ORG_ID, PLAN_ID, 2, USER_ID, tx);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ position: 3 }), tx);
    });

    it('answers 404 when `after` is not an active swimlane of the plan', async () => {
      repo.findActiveInPlan!.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X', after: LANE_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('refuses the 101st swimlane with 422 SWIMLANE_LIMIT', async () => {
      repo.countActive!.mockResolvedValue(100);
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual({ reason: 'SWIMLANE_LIMIT' });
    });

    it('maps the case-insensitive unique violation to 409 without echoing the name', async () => {
      repo.create!.mockRejectedValue(uniqueViolation());
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Électrique' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: 'SWIMLANE_NAME_TAKEN' });
      expect((error as ConflictError).message).not.toContain('Électrique');
    });

    it('propagates 423 when the pen is not held, creating nothing', async () => {
      editLock.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(LockedError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('answers 409 STALE_VERSION when the version gate changes nothing', async () => {
      repo.renameIfVersionMatches!.mockResolvedValue(0);
      const error = await service
        .update(principalWith(ALL), 'acme', PLAN_ID, LANE_ID, { name: 'B', version: 9 })
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'STALE_VERSION' });
    });

    it('maps a duplicate name to 409 SWIMLANE_NAME_TAKEN', async () => {
      repo.renameIfVersionMatches!.mockRejectedValue(uniqueViolation());
      const error = await service
        .update(principalWith(ALL), 'acme', PLAN_ID, LANE_ID, { name: 'B', version: 1 })
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'SWIMLANE_NAME_TAKEN' });
    });
  });

  describe('reorder', () => {
    const order = [
      { id: 'b', version: 1 },
      { id: 'a', version: 2 },
    ];

    it('rewrites positions in the requested order when every swimlane is named at its version', async () => {
      repo.lockActiveInIdOrder!.mockResolvedValue([
        { id: 'a', version: 2, position: 0 },
        { id: 'b', version: 1, position: 1 },
      ]);
      await service.reorder(principalWith(ALL), 'acme', PLAN_ID, { order });
      expect(repo.rewritePositions).toHaveBeenCalledWith(ORG_ID, PLAN_ID, ['b', 'a'], USER_ID, tx);
    });

    it('refuses a duplicate id with 422 before locking anything', async () => {
      await expect(
        service.reorder(principalWith(ALL), 'acme', PLAN_ID, {
          order: [order[0]!, order[0]!],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.lockActiveInIdOrder).not.toHaveBeenCalled();
    });

    it('answers 409 when a version is stale, writing nothing', async () => {
      repo.lockActiveInIdOrder!.mockResolvedValue([
        { id: 'a', version: 3, position: 0 },
        { id: 'b', version: 1, position: 1 },
      ]);
      await expect(
        service.reorder(principalWith(ALL), 'acme', PLAN_ID, { order }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repo.rewritePositions).not.toHaveBeenCalled();
    });

    it('answers 409 when the order does not name every active swimlane', async () => {
      repo.lockActiveInIdOrder!.mockResolvedValue([
        { id: 'a', version: 2, position: 0 },
        { id: 'b', version: 1, position: 1 },
        { id: 'c', version: 1, position: 2 },
      ]);
      await expect(
        service.reorder(principalWith(ALL), 'acme', PLAN_ID, { order }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('answers 404 for an id that is not an active swimlane of the plan', async () => {
      repo.lockActiveInIdOrder!.mockResolvedValue([{ id: 'a', version: 2, position: 0 }]);
      await expect(
        service.reorder(principalWith(ALL), 'acme', PLAN_ID, { order }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('soft-deletes and records swimlane.deleted with the batch id in the same transaction', async () => {
      await service.remove(principalWith(ALL), 'acme', PLAN_ID, LANE_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'swimlane.deleted',
          subjectType: 'SWIMLANE',
          subjectId: LANE_ID,
          before: { name: 'Mechanical', planName: 'Tower', deleteBatchId: 'batch-1' },
        }),
        tx,
      );
    });

    it('refuses a stale ?version= with 409 and deletes nothing', async () => {
      repo.lockActiveVersion!.mockResolvedValue(4);
      await expect(
        service.remove(principalWith(ALL), 'acme', PLAN_ID, LANE_ID, undefined, 2),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repo.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('answers 404 when the row vanished between the read and the lock', async () => {
      repo.lockActiveVersion!.mockResolvedValue(null);
      await expect(
        service.remove(principalWith(ALL), 'acme', PLAN_ID, LANE_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('restore', () => {
    const deleted = (): Swimlane => lane({ deletedAt: new Date(), deleteBatchId: 'batch-1' });

    it('restores under the ancestor locks and the plan lock, and records swimlane.restored', async () => {
      repo.findInPlan!.mockResolvedValue(deleted());
      await service.restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID);
      expect(lockActiveProjectChainForShare).toHaveBeenCalledWith(tx, {
        clientId: 'c-1',
        projectId: 'project-1',
      });
      expect(acquirePlanWriteLock).toHaveBeenCalledWith(tx, PLAN_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'swimlane.restored' }),
        tx,
      );
    });

    it('answers PARENT_DELETED when the plan is deleted, before the pen', async () => {
      repo.findInPlan!.mockResolvedValue(deleted());
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: new Date() }));
      const error = await service
        .restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID)
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'PARENT_DELETED' });
      expect(editLock.assertHoldsPen).not.toHaveBeenCalled();
    });

    it('answers PARENT_DELETED when an ancestor was deleted meanwhile', async () => {
      repo.findInPlan!.mockResolvedValue(deleted());
      vi.mocked(lockActiveProjectChainForShare).mockResolvedValue(false);
      const error = await service
        .restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID)
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'PARENT_DELETED' });
    });

    it('maps a name taken meanwhile to 409', async () => {
      repo.findInPlan!.mockResolvedValue(deleted());
      repo.restore!.mockRejectedValue(uniqueViolation());
      const error = await service
        .restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID)
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toEqual({ reason: 'SWIMLANE_NAME_TAKEN' });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses to restore past the 100-swimlane cap', async () => {
      repo.findInPlan!.mockResolvedValue(deleted());
      repo.countActive!.mockResolvedValue(100);
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('is a no-op for an already-active swimlane', async () => {
      await service.restore(principalWith(ALL), 'acme', PLAN_ID, LANE_ID);
      expect(repo.restore).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
