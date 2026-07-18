import { Prisma, type Activity, type ActivityStep } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { ActivityStepRepository } from './activity-step.repository';
import { ActivityStepsService } from './activity-steps.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ACTIVITY_ID = '00000000-0000-0000-0000-0000000000ac';

function activity(overrides: Partial<Activity> = {}): Partial<Activity> {
  return { id: ACTIVITY_ID, organizationId: ORG_ID, deletedAt: null, version: 1, ...overrides };
}

function step(seq: number, overrides: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: `step-${seq}`,
    organizationId: ORG_ID,
    activityId: ACTIVITY_ID,
    seq,
    name: `Step ${seq}`,
    weight: new Prisma.Decimal(1),
    percentComplete: 0,
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

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = ['activity:read', 'activity:update'];

describe('ActivityStepsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let steps: {
    findManyActiveByActivity: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateFields: ReturnType<typeof vi.fn>;
    softDeleteMany: ReturnType<typeof vi.fn>;
  };
  let txActivityUpdateMany: ReturnType<typeof vi.fn>;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    activity: { findFirst: ReturnType<typeof vi.fn> };
  };
  let service: ActivityStepsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    steps = {
      findManyActiveByActivity: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(step(1)),
      updateFields: vi.fn().mockResolvedValue(undefined),
      softDeleteMany: vi.fn().mockResolvedValue(undefined),
    };
    txActivityUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({ activity: { updateMany: txActivityUpdateMany } }),
      ),
      activity: { findFirst: vi.fn().mockResolvedValue(activity()) },
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ActivityStepsService(
      organizations as unknown as OrganizationsService,
      steps as unknown as ActivityStepRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('list', () => {
    it('returns the activity’s active steps (activity:read)', async () => {
      steps.findManyActiveByActivity.mockResolvedValue([step(1), step(2)]);
      const result = await service.list(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(result).toHaveLength(2);
    });

    it('404s when the activity is foreign/deleted (anti-IDOR)', async () => {
      prisma.activity.findFirst.mockResolvedValue(null);
      await expect(service.list(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('forbids a caller without activity:read', async () => {
      await expect(
        service.list(principalWith(['activity:update']), 'acme', ACTIVITY_ID),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('replace (bulk)', () => {
    const dto = (
      steps: { name: string; weight: number; percentComplete: number }[],
      version = 1,
    ) => ({
      version,
      steps,
    });

    it('reconciles by seq: updates the shared prefix, appends the new tail, bumps the activity version', async () => {
      steps.findManyActiveByActivity.mockResolvedValueOnce([step(1), step(2)]); // reconcile snapshot
      await service.replace(
        principalWith(ALL),
        'acme',
        ACTIVITY_ID,
        dto([
          { name: 'A', weight: 10, percentComplete: 100 },
          { name: 'B', weight: 35, percentComplete: 70 },
          { name: 'C', weight: 55, percentComplete: 0 },
        ]),
      );
      // Version-gated bump on the parent activity.
      expect(txActivityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACTIVITY_ID, version: 1, deletedAt: null },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
      // Two retained positions updated in place, one new appended at seq 3, nothing removed.
      expect(steps.updateFields).toHaveBeenCalledTimes(2);
      expect(steps.create).toHaveBeenCalledTimes(1);
      expect(steps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          activityId: ACTIVITY_ID,
          seq: 3,
          name: 'C',
        }),
        expect.anything(),
      );
      expect(steps.softDeleteMany).not.toHaveBeenCalled();
    });

    it('soft-deletes the removed tail under one batch when the list shrinks', async () => {
      steps.findManyActiveByActivity.mockResolvedValueOnce([step(1), step(2), step(3)]);
      await service.replace(
        principalWith(ALL),
        'acme',
        ACTIVITY_ID,
        dto([{ name: 'only', weight: 1, percentComplete: 50 }]),
      );
      expect(steps.updateFields).toHaveBeenCalledTimes(1);
      expect(steps.create).not.toHaveBeenCalled();
      expect(steps.softDeleteMany).toHaveBeenCalledWith(
        ['step-2', 'step-3'],
        expect.any(String),
        USER_ID,
        expect.anything(),
      );
    });

    it('clears all steps on an empty list (removes every active row)', async () => {
      steps.findManyActiveByActivity.mockResolvedValueOnce([step(1), step(2)]);
      await service.replace(principalWith(ALL), 'acme', ACTIVITY_ID, dto([]));
      expect(steps.updateFields).not.toHaveBeenCalled();
      expect(steps.create).not.toHaveBeenCalled();
      expect(steps.softDeleteMany).toHaveBeenCalledWith(
        ['step-1', 'step-2'],
        expect.any(String),
        USER_ID,
        expect.anything(),
      );
    });

    it('409s on a stale activity version (nothing written)', async () => {
      txActivityUpdateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.replace(principalWith(ALL), 'acme', ACTIVITY_ID, dto([], 5)),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(steps.updateFields).not.toHaveBeenCalled();
      expect(steps.create).not.toHaveBeenCalled();
    });

    it('forbids a caller without activity:update', async () => {
      await expect(
        service.replace(principalWith(['activity:read']), 'acme', ACTIVITY_ID, dto([])),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
