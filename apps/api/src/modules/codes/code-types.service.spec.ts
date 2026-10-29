import { Prisma, type CodeType, type CodeValue, type Plan } from '@prisma/client';
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

import type { CodeTypeRepository } from './code-type.repository';
import { CodeTypesService } from './code-types.service';
import type { CodeValueRepository } from './code-value.repository';
import { CODE_CONFLICT, CODE_TYPE_LIMIT } from './codes.constants';

vi.mock('../../common/db/plan-advisory-lock', () => ({ acquirePlanWriteLock: vi.fn() }));
vi.mock('../../common/db/hierarchy-row-lock', () => ({
  lockActiveProjectChainForShare: vi.fn(),
}));

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';
const TYPE_ID = 'type-1';
const USER_ID = 'user-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Tower',
    deletedAt: null,
    swimlaneCodeTypeId: null,
    ...overrides,
  } as Plan;
}

function type(overrides: Partial<CodeType> = {}): CodeType {
  return {
    id: TYPE_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    name: 'Area',
    position: 0,
    version: 1,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  } as CodeType;
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'code:read',
  'code:create',
  'code:update',
  'code:delete',
  'code:restore',
];

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

type Mocks<K extends string> = Record<K, ReturnType<typeof vi.fn>>;

describe('CodeTypesService', () => {
  let plans: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let types: Mocks<
    | 'create'
    | 'findActiveInPlan'
    | 'findInPlan'
    | 'findManyActiveByPlan'
    | 'findManyAllByPlan'
    | 'findManyActiveInTx'
    | 'countActive'
    | 'maxActivePosition'
    | 'renameIfVersionMatches'
    | 'lockActiveVersion'
    | 'softDelete'
    | 'restore'
    | 'lockActiveInIdOrder'
    | 'rewritePositions'
  >;
  let values: Mocks<
    | 'findManyActiveByTypes'
    | 'findManyAllByTypes'
    | 'countActiveByTypes'
    | 'softDeleteByType'
    | 'restoreByBatch'
  >;
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: CodeTypesService;

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
    types = {
      create: vi.fn((data: Partial<CodeType>) => Promise.resolve(type(data))),
      findActiveInPlan: vi.fn().mockResolvedValue(type()),
      findInPlan: vi.fn().mockResolvedValue(type()),
      findManyActiveByPlan: vi.fn().mockResolvedValue([]),
      findManyAllByPlan: vi.fn().mockResolvedValue([]),
      findManyActiveInTx: vi.fn().mockResolvedValue([]),
      countActive: vi.fn().mockResolvedValue(0),
      maxActivePosition: vi.fn().mockResolvedValue(-1),
      renameIfVersionMatches: vi.fn().mockResolvedValue(1),
      lockActiveVersion: vi.fn().mockResolvedValue(1),
      softDelete: vi.fn().mockResolvedValue('batch-1'),
      restore: vi.fn().mockResolvedValue(1),
      lockActiveInIdOrder: vi.fn().mockResolvedValue([]),
      rewritePositions: vi.fn().mockResolvedValue(undefined),
    };
    values = {
      findManyActiveByTypes: vi.fn().mockResolvedValue([]),
      findManyAllByTypes: vi.fn().mockResolvedValue([]),
      countActiveByTypes: vi.fn().mockResolvedValue(new Map()),
      softDeleteByType: vi.fn().mockResolvedValue(3),
      restoreByBatch: vi.fn().mockResolvedValue(3),
    };
    editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1', clientId: 'c-1' }) },
    };
    const prisma = { $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)) };
    service = new CodeTypesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      types as unknown as CodeTypeRepository,
      values as unknown as CodeValueRepository,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  describe('authorisation', () => {
    it('refuses a write without the permission before touching the plan', async () => {
      const viewer = principalWith(['code:read']);
      await expect(service.create(viewer, 'acme', PLAN_ID, { name: 'A' })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('answers 404 for a foreign plan before any 403 or 423', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'A' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(editLock.assertHoldsPen).not.toHaveBeenCalled();
    });

    it('lets only code:restore read the deleted rows', async () => {
      await expect(
        service.list(principalWith(['code:read']), 'acme', PLAN_ID, {
          limit: 100,
          include: 'deleted',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 100, include: 'deleted' });
      expect(types.findManyAllByPlan).toHaveBeenCalledOnce();
      expect(types.findManyActiveByPlan).not.toHaveBeenCalled();
    });

    it('refuses a write without the pen, and changes nothing', async () => {
      editLock.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { name: 'B', version: 1 }),
      ).rejects.toBeInstanceOf(LockedError);
      expect(types.renameIfVersionMatches).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('reads the values of the whole page in one query, never one per type', async () => {
      types.findManyActiveByPlan.mockResolvedValue([type({ id: 't1' }), type({ id: 't2' })]);
      values.findManyActiveByTypes.mockResolvedValue([
        { id: 'v1', codeTypeId: 't2' } as CodeValue,
        { id: 'v2', codeTypeId: 't1' } as CodeValue,
        { id: 'v3', codeTypeId: 't2' } as CodeValue,
      ]);
      const { items } = await service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 100 });
      expect(values.findManyActiveByTypes).toHaveBeenCalledOnce();
      expect(values.findManyActiveByTypes).toHaveBeenCalledWith(ORG_ID, ['t1', 't2']);
      expect(items.map((i) => i.values?.map((v) => v.id))).toEqual([['v2'], ['v1', 'v3']]);
    });

    it('sends the live value count of every type, from one grouped query', async () => {
      types.findManyActiveByPlan.mockResolvedValue([type({ id: 't1' }), type({ id: 't2' })]);
      values.countActiveByTypes.mockResolvedValue(new Map([['t2', 4]]));
      const { items } = await service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 100 });
      expect(values.countActiveByTypes).toHaveBeenCalledOnce();
      expect(values.countActiveByTypes).toHaveBeenCalledWith(ORG_ID, ['t1', 't2']);
      expect(items.map((i) => i.valueCount)).toEqual([0, 4]);
    });

    it('with values=none returns the types alone and never reads a value', async () => {
      types.findManyActiveByPlan.mockResolvedValue([type({ id: 't1' })]);
      values.countActiveByTypes.mockResolvedValue(new Map([['t1', 2]]));
      const { items } = await service.list(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 100,
        values: 'none',
      });
      expect(items).toEqual([{ type: type({ id: 't1' }), valueCount: 2 }]);
      expect(values.findManyActiveByTypes).not.toHaveBeenCalled();
      expect(values.findManyAllByTypes).not.toHaveBeenCalled();
    });

    it('with values=none and include=deleted bounds the read by the types', async () => {
      types.findManyAllByPlan.mockResolvedValue([type({ id: 't1', deletedAt: new Date() })]);
      await service.list(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 100,
        values: 'none',
        include: 'deleted',
      });
      expect(values.findManyAllByTypes).not.toHaveBeenCalled();
    });

    it('reports the next cursor when a full page + 1 comes back', async () => {
      types.findManyActiveByPlan.mockResolvedValue([
        type({ id: 't1' }),
        type({ id: 't2' }),
        type({ id: 't3' }),
      ]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, {
        limit: 2,
      });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ nextCursor: 't2', hasMore: true });
    });
  });

  describe('create', () => {
    it('copies the organisation from the loaded plan, never from input', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan({ organizationId: 'org-from-plan' }));
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Area' });
      expect(types.create.mock.calls[0]?.[0]).toMatchObject({
        organizationId: 'org-from-plan',
        planId: PLAN_ID,
        name: 'Area',
        position: 0,
        createdBy: USER_ID,
      });
    });

    it('takes the plan lock first, then the pen, then counts', async () => {
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Area' });
      const at = (mock: { mock: { invocationCallOrder: number[] } }) =>
        mock.mock.invocationCallOrder[0] as number;
      expect(at(vi.mocked(acquirePlanWriteLock))).toBeLessThan(at(editLock.assertHoldsPen));
      expect(at(editLock.assertHoldsPen)).toBeLessThan(at(types.countActive));
    });

    it('appends after the last position', async () => {
      types.maxActivePosition.mockResolvedValue(4);
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Area' });
      expect(types.create.mock.calls[0]?.[0]).toMatchObject({ position: 5 });
    });

    it('refuses the 101st type with the limit reason and a way out', async () => {
      types.countActive.mockResolvedValue(CODE_TYPE_LIMIT);
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Area' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual({ reason: CODE_CONFLICT.TYPE_LIMIT });
      expect((error as ValidationError).message).toContain('Delete one you no longer use first');
      expect(types.create).not.toHaveBeenCalled();
    });

    it('maps the name index to CODE_TYPE_NAME_TAKEN, echoing only the name sent', async () => {
      types.create.mockRejectedValue(uniqueViolation());
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, { name: 'AREA' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe('A code type called AREA already exists.');
      expect((error as ConflictError).details).toEqual({ reason: CODE_CONFLICT.TYPE_NAME_TAKEN });
    });
  });

  describe('update and reorder', () => {
    it('is a stale-version 409 when the gated rename changes nothing', async () => {
      types.renameIfVersionMatches.mockResolvedValue(0);
      const error = await service
        .update(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { name: 'B', version: 1 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: CODE_CONFLICT.STALE_VERSION });
    });

    it('refuses a rename of a type that is not in the plan with 404', async () => {
      types.findActiveInPlan.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { name: 'B', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses a reorder naming a type twice, an unknown type, a short set and a stale version', async () => {
      types.lockActiveInIdOrder.mockResolvedValue([
        { id: 'a', version: 1, position: 0 },
        { id: 'b', version: 1, position: 1 },
      ]);
      const order = (...rows: [string, number][]) => ({
        order: rows.map(([id, version]) => ({ id, version })),
      });
      const p = principalWith(ALL);
      await expect(
        service.reorder(p, 'acme', PLAN_ID, order(['a', 1], ['a', 1])),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.reorder(p, 'acme', PLAN_ID, order(['a', 1], ['zzz', 1])),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.reorder(p, 'acme', PLAN_ID, order(['a', 1]))).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        service.reorder(p, 'acme', PLAN_ID, order(['a', 1], ['b', 7])),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(types.rewritePositions).not.toHaveBeenCalled();
      await service.reorder(p, 'acme', PLAN_ID, order(['b', 1], ['a', 1]));
      expect(types.rewritePositions).toHaveBeenCalledWith(
        ORG_ID,
        PLAN_ID,
        ['b', 'a'],
        USER_ID,
        expect.anything(),
      );
    });
  });

  describe('remove', () => {
    it('refuses the type the swimlanes are drawn from, and says what to do', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan({ swimlaneCodeTypeId: TYPE_ID }));
      const error = await service
        .remove(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe(
        'The swimlanes are made from Area. Choose another swimlane source first.',
      );
      expect((error as ConflictError).details).toEqual({
        reason: CODE_CONFLICT.TYPE_IS_SWIMLANE_SOURCE,
      });
      expect(types.softDelete).not.toHaveBeenCalled();
      expect(values.softDeleteByType).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('takes the plan lock before it re-reads the plan’s source', async () => {
      await service.remove(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID);
      // First read: the guard before the transaction. Second: under the lock.
      const reads = plans.findActiveByIdInOrg.mock.invocationCallOrder;
      const lock = vi.mocked(acquirePlanWriteLock).mock.invocationCallOrder[0] as number;
      expect(reads).toHaveLength(2);
      expect(reads[0]).toBeLessThan(lock);
      expect(reads[1]).toBeGreaterThan(lock);
    });

    it('deletes the type and its values in one batch and audits one row with the count', async () => {
      await service.remove(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID);
      expect(values.softDeleteByType).toHaveBeenCalledWith(
        TYPE_ID,
        ORG_ID,
        'batch-1',
        USER_ID,
        expect.anything(),
      );
      expect(audit.record).toHaveBeenCalledOnce();
      expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
        action: 'code_type.deleted',
        subjectType: 'CODE_TYPE',
        subjectId: TYPE_ID,
        before: { name: 'Area', planName: 'Tower', deleteBatchId: 'batch-1', valueCount: 3 },
      });
    });

    it('refuses a stale ?version= and deletes nothing', async () => {
      types.lockActiveVersion.mockResolvedValue(4);
      await expect(
        service.remove(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, undefined, 2),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(types.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('answers PARENT_DELETED under a deleted plan', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: new Date() }));
      types.findInPlan.mockResolvedValue(type({ deletedAt: new Date(), deleteBatchId: 'b' }));
      const error = await service
        .restore(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ reason: 'PARENT_DELETED' });
    });

    it('brings back exactly the values the delete took, by batch', async () => {
      types.findInPlan.mockResolvedValue(type({ deletedAt: new Date(), deleteBatchId: 'b-9' }));
      types.findActiveInPlan.mockResolvedValue(type());
      await service.restore(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID);
      expect(values.restoreByBatch).toHaveBeenCalledWith(
        TYPE_ID,
        ORG_ID,
        'b-9',
        USER_ID,
        expect.anything(),
      );
      expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
        action: 'code_type.restored',
        after: { name: 'Area', valueCount: 3, deleteBatchId: 'b-9' },
      });
    });

    it('refuses a restore past the cap, and a name taken meanwhile', async () => {
      types.findInPlan.mockResolvedValue(type({ deletedAt: new Date(), deleteBatchId: 'b' }));
      types.countActive.mockResolvedValue(CODE_TYPE_LIMIT);
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.TYPE_LIMIT } });
      types.countActive.mockResolvedValue(0);
      types.restore.mockRejectedValue(uniqueViolation());
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.TYPE_NAME_TAKEN } });
    });

    it('is a no-op for a type that is already live', async () => {
      await service.restore(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID);
      expect(types.restore).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
