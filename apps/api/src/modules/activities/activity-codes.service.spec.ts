import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { lockActivityRowsInIdOrder } from '../../common/db/activity-row-lock';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActivityHistoryRecorder } from '../activity-history/activity-history.recorder';
import type { CodeAssignmentRepository } from '../codes/code-assignment.repository';
import type { CodeTypeRepository } from '../codes/code-type.repository';
import type { CodeValueRepository } from '../codes/code-value.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import { ActivityCodesService } from './activity-codes.service';
import type { ActivityRepository } from './activity.repository';
import type { UpdateActivityCodesDto } from './dto/update-activity-codes.dto';

vi.mock('../../common/db/plan-advisory-lock', () => ({ acquirePlanWriteLock: vi.fn() }));
vi.mock('../../common/db/activity-row-lock', () => ({ lockActivityRowsInIdOrder: vi.fn() }));

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';
const USER_ID = 'user-1';
const A1 = 'activity-1';
const A2 = 'activity-2';
const AREA = 'type-area';
const TRADE = 'type-trade';
const L1 = 'value-l1';
const L2 = 'value-l2';
const MECH = 'value-mech';

const principalWith = (permissions: Permission[]): Principal =>
  new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);

const body = (...rows: UpdateActivityCodesDto['activities']): UpdateActivityCodesDto => ({
  activities: rows,
});

describe('ActivityCodesService', () => {
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: { bumpVersions: ReturnType<typeof vi.fn> };
  let types: { lockActiveForShare: ReturnType<typeof vi.fn> };
  let values: { lockForShare: ReturnType<typeof vi.fn> };
  let assignments: Record<'findStored' | 'upsertMany' | 'deleteMany', ReturnType<typeof vi.fn>>;
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let history: { record: ReturnType<typeof vi.fn>; codeWrites: ReturnType<typeof vi.fn> };
  let service: ActivityCodesService;

  beforeEach(() => {
    vi.mocked(acquirePlanWriteLock).mockReset();
    // Every activity asked for is the plan's, at version 1.
    vi.mocked(lockActivityRowsInIdOrder)
      .mockReset()
      .mockImplementation((_tx, _org, _plan, ids) =>
        Promise.resolve(ids.map((id) => ({ id, version: 1 }))),
      );
    const organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PLAN_ID, organizationId: ORG_ID }),
    };
    activities = {
      bumpVersions: vi.fn((_org: string, _plan: string, rows: unknown[]) =>
        Promise.resolve(rows.length),
      ),
    };
    // The rows the locks find: what was asked for, each as the plan's own.
    const typeNames: Record<string, string> = { [AREA]: 'Area', [TRADE]: 'Trade' };
    const valueTypes: Record<string, string> = { [L1]: AREA, [L2]: AREA, [MECH]: TRADE };
    types = {
      lockActiveForShare: vi.fn((_org: string, _plan: string, ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id, name: typeNames[id] ?? id }))),
      ),
    };
    values = {
      lockForShare: vi.fn((_org: string, _plan: string, ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({ id, codeTypeId: valueTypes[id] ?? AREA, deleted: false })),
        ),
      ),
    };
    assignments = {
      findStored: vi.fn().mockResolvedValue([]),
      upsertMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    };
    editLock = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    history = {
      record: vi.fn().mockResolvedValue(undefined),
      codeWrites: vi.fn().mockReturnValue([]),
    };
    const prisma = {
      $transaction: vi.fn((cb: (t: unknown) => unknown) => cb({})),
      activity: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new ActivityCodesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      types as unknown as CodeTypeRepository,
      values as unknown as CodeValueRepository,
      assignments as unknown as CodeAssignmentRepository,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      history as unknown as ActivityHistoryRecorder,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  const write = (dto: UpdateActivityCodesDto, permissions: Permission[] = ['activity:update']) =>
    service.write(principalWith(permissions), 'acme', PLAN_ID, dto);

  it('needs activity:update, not a code permission: an assignment is an activity write', async () => {
    await expect(
      write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] }), [
        'code:create',
        'code:update',
      ]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    await write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] }));
  });

  it('refuses a write without the pen before it takes any lock', async () => {
    editLock.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
    await expect(
      write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] })),
    ).rejects.toBeInstanceOf(LockedError);
    expect(acquirePlanWriteLock).not.toHaveBeenCalled();
  });

  it('takes the locks in the design’s order: plan, activities, types, values, then history last', async () => {
    await write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] }));
    const at = (mock: { mock: { invocationCallOrder: number[] } }) =>
      mock.mock.invocationCallOrder[0] as number;
    const order = [
      at(vi.mocked(acquirePlanWriteLock)),
      at(vi.mocked(lockActivityRowsInIdOrder)),
      at(types.lockActiveForShare),
      at(values.lockForShare),
      at(history.record),
    ];
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('answers 404 when an activity is not in the plan, and writes nothing', async () => {
    vi.mocked(lockActivityRowsInIdOrder).mockResolvedValue([{ id: A1, version: 1 }]);
    await expect(
      write(
        body(
          { id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
          { id: A2, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(assignments.upsertMany).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it('answers 409 STALE_VERSION when any row’s version is not current, before any write', async () => {
    const error = await write(
      body(
        { id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
        { id: A2, version: 7, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
      ),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({ reason: 'STALE_VERSION' });
    expect(assignments.upsertMany).not.toHaveBeenCalled();
    expect(activities.bumpVersions).not.toHaveBeenCalled();
  });

  it('answers 404 for a code type or value that is not the plan’s, and 422 for the others', async () => {
    const one = body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] });
    types.lockActiveForShare.mockResolvedValueOnce([]);
    await expect(write(one)).rejects.toBeInstanceOf(NotFoundError);
    values.lockForShare.mockResolvedValueOnce([]);
    await expect(write(one)).rejects.toBeInstanceOf(NotFoundError);

    const wrong = await write(
      body({ id: A1, version: 1, codes: [{ codeTypeId: TRADE, codeValueId: L1 }] }),
    ).catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(ValidationError);
    expect((wrong as ValidationError).message).toBe('That value does not belong to Trade.');
    expect((wrong as ValidationError).details).toEqual({ reason: 'CODE_VALUE_WRONG_TYPE' });

    values.lockForShare.mockResolvedValue([{ id: L1, codeTypeId: AREA, deleted: true }]);
    const deleted = await write(one).catch((e: unknown) => e);
    expect((deleted as ValidationError).details).toEqual({ reason: 'CODE_VALUE_DELETED' });
    expect(assignments.upsertMany).not.toHaveBeenCalled();
  });

  it('refuses the same activity twice and the same type twice before opening a transaction', async () => {
    const one = { codeTypeId: AREA, codeValueId: L1 };
    await expect(
      write(body({ id: A1, version: 1, codes: [one] }, { id: A1, version: 1, codes: [one] })),
    ).rejects.toMatchObject({ details: { reason: 'DUPLICATE_CODES_ACTIVITY_ID' } });
    await expect(
      write(body({ id: A1, version: 1, codes: [one, { codeTypeId: AREA, codeValueId: L2 }] })),
    ).rejects.toMatchObject({ details: { reason: 'DUPLICATE_CODES_TYPE_ID' } });
    expect(acquirePlanWriteLock).not.toHaveBeenCalled();
  });

  it('sets, changes and clears: only what differs from the stored rows is written', async () => {
    assignments.findStored.mockResolvedValue([
      { activityId: A1, codeTypeId: AREA, codeValueId: L1 },
      { activityId: A1, codeTypeId: TRADE, codeValueId: MECH },
    ]);
    await write(
      body(
        {
          id: A1,
          version: 1,
          codes: [
            { codeTypeId: AREA, codeValueId: L1 }, // unchanged
            { codeTypeId: TRADE, codeValueId: null }, // cleared
          ],
        },
        { id: A2, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L2 }] }, // new
      ),
    );
    expect(assignments.upsertMany).toHaveBeenCalledWith(
      ORG_ID,
      PLAN_ID,
      [{ activityId: A2, codeTypeId: AREA, codeValueId: L2 }],
      expect.anything(),
    );
    expect(assignments.deleteMany).toHaveBeenCalledWith(
      PLAN_ID,
      [{ activityId: A1, codeTypeId: TRADE }],
      expect.anything(),
    );
    expect(history.codeWrites).toHaveBeenCalledWith(PLAN_ID, [
      {
        id: A1,
        changes: [
          { codeTypeId: AREA, from: L1, to: L1 },
          { codeTypeId: TRADE, from: MECH, to: null },
        ],
      },
      { id: A2, changes: [{ codeTypeId: AREA, from: null, to: L2 }] },
    ]);
  });

  it('organisation on every row comes from the loaded plan, not from the body', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue({
      id: PLAN_ID,
      organizationId: ORG_ID,
    });
    await write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] }));
    expect(assignments.upsertMany.mock.calls[0]?.[0]).toBe(ORG_ID);
    expect(activities.bumpVersions.mock.calls[0]?.[0]).toBe(ORG_ID);
  });

  it('rolls back with a 409 when the version bump finds fewer rows than the batch', async () => {
    activities.bumpVersions.mockResolvedValue(1);
    await expect(
      write(
        body(
          { id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
          { id: A2, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] },
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(history.record).not.toHaveBeenCalled();
  });

  it('records in a DEFINITION batch', async () => {
    await write(body({ id: A1, version: 1, codes: [{ codeTypeId: AREA, codeValueId: L1 }] }));
    expect(history.record.mock.calls[0]?.[1]).toMatchObject({
      actorUserId: USER_ID,
      scope: 'DEFINITION',
      batch: {},
    });
  });
});
