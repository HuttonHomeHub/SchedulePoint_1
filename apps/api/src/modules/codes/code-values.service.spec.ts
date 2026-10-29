import { Prisma, type CodeType, type CodeValue, type Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { lockActiveProjectChainForShare } from '../../common/db/hierarchy-row-lock';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { CodeTypeRepository } from './code-type.repository';
import type { CodeValueRepository } from './code-value.repository';
import { CodeValuesService } from './code-values.service';
import { CODE_CONFLICT, CODE_VALUE_LIMIT } from './codes.constants';

vi.mock('../../common/db/plan-advisory-lock', () => ({ acquirePlanWriteLock: vi.fn() }));
vi.mock('../../common/db/hierarchy-row-lock', () => ({
  lockActiveProjectChainForShare: vi.fn(),
}));

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';
const TYPE_ID = 'type-1';
const VALUE_ID = 'value-1';
const USER_ID = 'user-1';

const plan = (overrides: Partial<Plan> = {}): Plan =>
  ({
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Tower',
    deletedAt: null,
    ...overrides,
  }) as Plan;

const type = (overrides: Partial<CodeType> = {}): CodeType =>
  ({ id: TYPE_ID, planId: PLAN_ID, name: 'Area', deletedAt: null, ...overrides }) as CodeType;

const value = (overrides: Partial<CodeValue> = {}): CodeValue =>
  ({
    id: VALUE_ID,
    organizationId: ORG_ID,
    codeTypeId: TYPE_ID,
    shortCode: 'L1',
    description: null,
    position: 0,
    version: 1,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  }) as CodeValue;

const principalWith = (permissions: Permission[]): Principal =>
  new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);

const ALL: Permission[] = [
  'code:read',
  'code:create',
  'code:update',
  'code:delete',
  'code:restore',
];

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });

type Mocks<K extends string> = Record<K, ReturnType<typeof vi.fn>>;

describe('CodeValuesService', () => {
  let plans: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let types: Mocks<'findActiveInPlan' | 'findInPlan' | 'lockActiveForShare'>;
  let values: Mocks<
    | 'create'
    | 'findActiveInPlan'
    | 'findInPlan'
    | 'findManyActiveInTx'
    | 'findPageByType'
    | 'findManyResolvedInPlan'
    | 'countActive'
    | 'maxActivePosition'
    | 'updateIfVersionMatches'
    | 'lockActiveVersion'
    | 'softDelete'
    | 'restore'
    | 'lockActiveInIdOrder'
    | 'rewritePositions'
  >;
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: CodeValuesService;

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
      findActiveInPlan: vi.fn().mockResolvedValue(type()),
      findInPlan: vi.fn().mockResolvedValue(type()),
      lockActiveForShare: vi.fn().mockResolvedValue([{ id: TYPE_ID, name: 'Area' }]),
    };
    values = {
      create: vi.fn((data: Partial<CodeValue>) => Promise.resolve(value(data))),
      findActiveInPlan: vi.fn().mockResolvedValue(value()),
      findInPlan: vi.fn().mockResolvedValue(value()),
      findManyActiveInTx: vi.fn().mockResolvedValue([]),
      findPageByType: vi.fn().mockResolvedValue([]),
      findManyResolvedInPlan: vi.fn().mockResolvedValue([]),
      countActive: vi.fn().mockResolvedValue(0),
      maxActivePosition: vi.fn().mockResolvedValue(-1),
      updateIfVersionMatches: vi.fn().mockResolvedValue(1),
      lockActiveVersion: vi.fn().mockResolvedValue(1),
      softDelete: vi.fn().mockResolvedValue('batch-1'),
      restore: vi.fn().mockResolvedValue(1),
      lockActiveInIdOrder: vi.fn().mockResolvedValue([]),
      rewritePositions: vi.fn().mockResolvedValue(undefined),
    };
    editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1', clientId: 'c-1' }) },
    };
    const prisma = { $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)) };
    service = new CodeValuesService(
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

  describe('list', () => {
    it('reads a page of the type, asking for one more row than it returns', async () => {
      values.findPageByType.mockResolvedValue([value({ id: 'a' }), value({ id: 'b' })]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, {
        limit: 1,
      });
      expect(values.findPageByType).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        codeTypeId: TYPE_ID,
        includeDeleted: false,
        take: 2,
      });
      expect(items.map((i) => i.id)).toEqual(['a']);
      expect(meta).toEqual({ nextCursor: 'a', hasMore: true });
    });

    it('passes the cursor through', async () => {
      await service.list(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { limit: 5, cursor: 'c' });
      expect(values.findPageByType.mock.calls[0]?.[0]).toMatchObject({ cursor: 'c', take: 6 });
    });

    it('refuses include=deleted without code:restore, before reading anything', async () => {
      const error = await service
        .list(principalWith(['code:read']), 'acme', PLAN_ID, TYPE_ID, {
          limit: 5,
          include: 'deleted',
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(values.findPageByType).not.toHaveBeenCalled();
    });

    it('reads deleted rows with code:restore', async () => {
      await service.list(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, {
        limit: 5,
        include: 'deleted',
      });
      expect(values.findPageByType.mock.calls[0]?.[0]).toMatchObject({ includeDeleted: true });
    });

    it('is a 404 for a type that is not a live type of the plan', async () => {
      types.findActiveInPlan.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { limit: 5 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(values.findPageByType).not.toHaveBeenCalled();
    });

    it('needs code:read', async () => {
      await expect(
        service.list(principalWith([]), 'acme', PLAN_ID, TYPE_ID, { limit: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('resolve', () => {
    it('reads the ids once, scoped by organisation and plan, without duplicates', async () => {
      await service.resolve(principalWith(['code:read']), 'acme', PLAN_ID, ['a', 'b', 'a']);
      expect(values.findManyResolvedInPlan).toHaveBeenCalledWith(ORG_ID, PLAN_ID, ['a', 'b']);
    });

    it('needs code:read and an active plan', async () => {
      await expect(
        service.resolve(principalWith([]), 'acme', PLAN_ID, ['a']),
      ).rejects.toBeInstanceOf(ForbiddenError);
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.resolve(principalWith(['code:read']), 'acme', PLAN_ID, ['a']),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('create', () => {
    it('refuses a write without the permission before touching the plan', async () => {
      await expect(
        service.create(principalWith(['code:read']), 'acme', PLAN_ID, TYPE_ID, { shortCode: 'L1' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('copies the organisation from the loaded plan and reads the type under the lock', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan({ organizationId: 'org-from-plan' }));
      await service.create(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, {
        shortCode: 'L1',
        description: 'Level 1',
      });
      expect(acquirePlanWriteLock).toHaveBeenCalledOnce();
      expect(types.findActiveInPlan).toHaveBeenCalledWith(
        TYPE_ID,
        PLAN_ID,
        ORG_ID,
        expect.anything(),
      );
      expect(values.create.mock.calls[0]?.[0]).toMatchObject({
        organizationId: 'org-from-plan',
        codeTypeId: TYPE_ID,
        shortCode: 'L1',
        description: 'Level 1',
        position: 0,
        createdBy: USER_ID,
      });
    });

    it('stores no description as null, never an empty string', async () => {
      await service.create(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { shortCode: 'L1' });
      expect(values.create.mock.calls[0]?.[0]).toMatchObject({ description: null });
    });

    it('answers 404 for a type that is deleted or in another plan', async () => {
      types.findActiveInPlan.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { shortCode: 'L1' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(values.create).not.toHaveBeenCalled();
    });

    it('refuses the 1,001st value with the limit reason, naming the type', async () => {
      values.countActive.mockResolvedValue(CODE_VALUE_LIMIT);
      const error = await service
        .create(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { shortCode: 'L1' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('Area can have at most 1000 values');
      expect((error as ValidationError).details).toEqual({ reason: CODE_CONFLICT.VALUE_LIMIT });
    });

    it('maps the short-code index to CODE_VALUE_TAKEN', async () => {
      values.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, TYPE_ID, { shortCode: 'l1' }),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.VALUE_TAKEN } });
    });
  });

  describe('update', () => {
    it('refuses an edit that names nothing to change, before spending a version', async () => {
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID, { version: 1 }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(values.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('writes only the fields sent, and null clears the description', async () => {
      await service.update(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID, {
        description: null,
        version: 1,
      });
      expect(values.updateIfVersionMatches.mock.calls[0]?.[4]).toEqual({ description: null });
    });

    it('is a stale-version 409 when the gated update changes nothing', async () => {
      values.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID, {
          shortCode: 'L2',
          version: 1,
        }),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.STALE_VERSION } });
    });

    it('answers 404 for a value of another plan', async () => {
      values.findActiveInPlan.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID, {
          shortCode: 'L2',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('deletes the value alone, leaving its assignments, and audits it with its type', async () => {
      await service.remove(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID);
      expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
        action: 'code_value.deleted',
        subjectType: 'CODE_VALUE',
        subjectLabel: 'L1',
        before: { shortCode: 'L1', typeName: 'Area', planName: 'Tower', deleteBatchId: 'batch-1' },
      });
    });

    it('refuses a stale ?version= and deletes nothing', async () => {
      values.lockActiveVersion.mockResolvedValue(3);
      await expect(
        service.remove(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID, undefined, 1),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(values.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      values.findInPlan.mockResolvedValue(value({ deletedAt: new Date(), deleteBatchId: 'b' }));
      values.findActiveInPlan.mockResolvedValue(value());
    });

    it('answers PARENT_DELETED naming the deleted type', async () => {
      types.lockActiveForShare.mockResolvedValue([]);
      types.findInPlan.mockResolvedValue(type({ deletedAt: new Date() }));
      const error = await service
        .restore(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe('Restore Area first.');
      expect((error as ConflictError).details).toEqual({ reason: 'PARENT_DELETED' });
      expect(values.restore).not.toHaveBeenCalled();
    });

    it('answers PARENT_DELETED under a deleted plan', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: new Date() }));
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID),
      ).rejects.toMatchObject({ details: { reason: 'PARENT_DELETED' } });
    });

    it('takes the ancestors, then the plan lock, then the type share lock, then restores', async () => {
      await service.restore(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID);
      const at = (mock: { mock: { invocationCallOrder: number[] } }) =>
        mock.mock.invocationCallOrder[0] as number;
      const order = [
        at(vi.mocked(lockActiveProjectChainForShare)),
        at(vi.mocked(acquirePlanWriteLock)),
        at(types.lockActiveForShare),
        at(values.restore),
      ];
      expect(order).toEqual([...order].sort((x, y) => x - y));
    });

    it('refuses a restore past the cap, and a short code taken meanwhile', async () => {
      values.countActive.mockResolvedValue(CODE_VALUE_LIMIT);
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.VALUE_LIMIT } });
      values.countActive.mockResolvedValue(0);
      values.restore.mockRejectedValue(uniqueViolation());
      await expect(
        service.restore(principalWith(ALL), 'acme', PLAN_ID, VALUE_ID),
      ).rejects.toMatchObject({ details: { reason: CODE_CONFLICT.VALUE_TAKEN } });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('applies nothing on a stale, short or duplicated set', async () => {
      values.lockActiveInIdOrder.mockResolvedValue([
        { id: 'a', version: 1, position: 0 },
        { id: 'b', version: 1, position: 1 },
      ]);
      const order = (...rows: [string, number][]) => ({
        order: rows.map(([id, version]) => ({ id, version })),
      });
      const p = principalWith(ALL);
      await expect(
        service.reorder(p, 'acme', PLAN_ID, TYPE_ID, order(['a', 1], ['a', 1])),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.reorder(p, 'acme', PLAN_ID, TYPE_ID, order(['a', 1])),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        service.reorder(p, 'acme', PLAN_ID, TYPE_ID, order(['a', 1], ['b', 5])),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(values.rewritePositions).not.toHaveBeenCalled();
    });
  });
});
