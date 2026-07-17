import { Prisma, type Activity, type Resource, type ResourceAssignment } from '@prisma/client';
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

import { ResourceAssignmentResponseDto } from './dto/assignment-response.dto';
import type { ResourceAssignmentRepository } from './resource-assignment.repository';
import { ResourceAssignmentService } from './resource-assignment.service';
import type { ResourceRepository } from './resource.repository';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ACTIVITY_ID = '00000000-0000-0000-0000-0000000000ac';
const RESOURCE_ID = '00000000-0000-0000-0000-0000000000re';

function activity(overrides: Partial<Activity> = {}): Partial<Activity> {
  return {
    id: ACTIVITY_ID,
    organizationId: ORG_ID,
    deletedAt: null,
    // Duration-type triad inputs (ADR-0040): default type, 10 working days (14 400 min), version 1.
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationMinutes: 10 * 1440,
    version: 1,
    ...overrides,
  };
}

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: RESOURCE_ID,
    organizationId: ORG_ID,
    name: 'Crew A',
    code: null,
    description: null,
    kind: 'LABOUR',
    maxUnitsPerHour: null,
    costPerUnit: null,
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

function assignment(overrides: Partial<ResourceAssignment> = {}): ResourceAssignment {
  return {
    id: 'asg-1',
    organizationId: ORG_ID,
    activityId: ACTIVITY_ID,
    resourceId: RESOURCE_ID,
    budgetedUnits: new Prisma.Decimal(0),
    unitsPerHour: null,
    isDriving: false,
    budgetedCost: null,
    actualCost: 0n,
    actualUnits: new Prisma.Decimal(0),
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

const ALL: Permission[] = ['resource:read', 'resource:assign'];

describe('ResourceAssignmentService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let resources: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let assignments: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByActivity: ReturnType<typeof vi.fn>;
    clearDrivingForActivity: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    activity: { findFirst: ReturnType<typeof vi.fn> };
  };
  // The activity.updateMany the tx uses to persist a units-driven derived duration (ADR-0040 §3).
  let txActivityUpdateMany: ReturnType<typeof vi.fn>;
  let service: ResourceAssignmentService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    resources = { findActiveByIdInOrg: vi.fn().mockResolvedValue(resource()) };
    assignments = {
      create: vi.fn().mockResolvedValue(assignment()),
      findActiveByIdInOrg: vi.fn(),
      findManyActiveByActivity: vi.fn().mockResolvedValue([]),
      clearDrivingForActivity: vi.fn(),
      updateIfVersionMatches: vi.fn().mockResolvedValue(1),
      softDelete: vi.fn().mockResolvedValue(1),
    };
    txActivityUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    prisma = {
      // The tx handle exposes $executeRaw (the resource advisory lock create takes) and the
      // `activity` model (the ADR-0040 units-driven derived-duration write).
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({ $executeRaw: vi.fn(), activity: { updateMany: txActivityUpdateMany } }),
      ),
      activity: { findFirst: vi.fn().mockResolvedValue(activity()) },
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ResourceAssignmentService(
      organizations as unknown as OrganizationsService,
      resources as unknown as ResourceRepository,
      assignments as unknown as ResourceAssignmentRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create (assign)', () => {
    it('assigns a resource, copying the org id from the activity (never input)', async () => {
      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
        resourceId: RESOURCE_ID,
        budgetedUnits: 40,
      });
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          activityId: ACTIVITY_ID,
          resourceId: RESOURCE_ID,
          budgetedUnits: 40,
          isDriving: false,
        }),
        expect.anything(),
      );
    });

    it('threads Earned-Value cost inputs into the create; a null budgetedCost stays null (EV1, ADR-0042)', async () => {
      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
        resourceId: RESOURCE_ID,
        budgetedUnits: 40,
        actualCost: 12000,
        actualUnits: 8,
      });
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ budgetedCost: null, actualCost: 12000, actualUnits: 8 }),
        expect.anything(),
      );
    });

    it('forbids a caller without resource:assign', async () => {
      await expect(
        service.create(principalWith(['resource:read']), 'acme', ACTIVITY_ID, {
          resourceId: RESOURCE_ID,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('404s when the activity is foreign/deleted', async () => {
      prisma.activity.findFirst.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', ACTIVITY_ID, { resourceId: RESOURCE_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('404s when the resource is foreign/deleted', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', ACTIVITY_ID, { resourceId: RESOURCE_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('404s and does not assign if the resource is deleted after the pre-check (TOCTOU re-check under the lock)', async () => {
      // The pre-transaction check sees the resource active; a concurrent delete lands; the
      // in-transaction re-check (under the resource advisory lock) then sees it gone → 404,
      // so no assignment is created against a soft-deleted resource.
      resources.findActiveByIdInOrg.mockResolvedValueOnce(resource()).mockResolvedValueOnce(null);
      await expect(
        service.create(principalWith(ALL), 'acme', ACTIVITY_ID, { resourceId: RESOURCE_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects a MATERIAL resource set as the driver (422)', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ kind: 'MATERIAL' }));
      await expect(
        service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
          resourceId: RESOURCE_ID,
          isDriving: true,
        }),
      ).rejects.toMatchObject({ details: { reason: 'MATERIAL_CANNOT_DRIVE' } });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('setting a driver first clears any other driver on the activity (a move, not a P2002)', async () => {
      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
        resourceId: RESOURCE_ID,
        isDriving: true,
      });
      expect(assignments.clearDrivingForActivity).toHaveBeenCalledWith(
        ACTIVITY_ID,
        USER_ID,
        expect.anything(),
      );
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDriving: true }),
        expect.anything(),
      );
    });

    it('does not clear drivers when the assignment is non-driving', async () => {
      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, { resourceId: RESOURCE_ID });
      expect(assignments.clearDrivingForActivity).not.toHaveBeenCalled();
    });

    it('maps a duplicate (activity, resource) to a 409 (DUPLICATE_ASSIGNMENT)', async () => {
      assignments.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', ACTIVITY_ID, { resourceId: RESOURCE_ID }),
      ).rejects.toMatchObject({ details: { reason: 'DUPLICATE_ASSIGNMENT' } });
    });
  });

  describe('list', () => {
    it('404s when the activity is foreign/deleted before listing', async () => {
      prisma.activity.findFirst.mockResolvedValue(null);
      await expect(service.list(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('returns the active assignments for a valid activity', async () => {
      assignments.findManyActiveByActivity.mockResolvedValue([assignment()]);
      const result = await service.list(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(result.items).toHaveLength(1);
    });

    // EV4a (ADR-0042): the money budgeted/actual cost is conditionally included only for a `cost:read`
    // caller (Planner/Org Admin), org-scoped and fail-closed.
    it('a cost:read caller reads the real budgetedCost/actualCost off the assignment', async () => {
      assignments.findManyActiveByActivity.mockResolvedValue([
        assignment({ budgetedCost: 120000n, actualCost: 45000n }),
      ]);
      const { items, canReadCost } = await service.list(
        principalWith([...ALL, 'cost:read']),
        'acme',
        ACTIVITY_ID,
      );
      expect(canReadCost).toBe(true);
      const dto = ResourceAssignmentResponseDto.from(items[0]!, canReadCost);
      expect(dto.budgetedCost).toBe(120000);
      expect(dto.actualCost).toBe(45000);
    });

    it('a non-cost-read caller gets null for BOTH cost fields (fail-closed)', async () => {
      assignments.findManyActiveByActivity.mockResolvedValue([
        assignment({ budgetedCost: 120000n, actualCost: 45000n }),
      ]);
      const { items, canReadCost } = await service.list(
        principalWith(['resource:read']),
        'acme',
        ACTIVITY_ID,
      );
      expect(canReadCost).toBe(false);
      const dto = ResourceAssignmentResponseDto.from(items[0]!, canReadCost);
      expect(dto.budgetedCost).toBeNull();
      expect(dto.actualCost).toBeNull();
    });
  });

  describe('update', () => {
    it('404s when the assignment is missing', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'asg-1', { budgetedUnits: 5, version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('409s on a stale version', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment());
      assignments.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'asg-1', { budgetedUnits: 5, version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects setting the driver on when the resource is MATERIAL (422)', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment());
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ kind: 'MATERIAL' }));
      await expect(
        service.update(principalWith(ALL), 'acme', 'asg-1', { isDriving: true, version: 1 }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(assignments.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('setting the driver on clears every OTHER driver on the activity (move)', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment());
      await service.update(principalWith(ALL), 'acme', 'asg-1', { isDriving: true, version: 1 });
      expect(assignments.clearDrivingForActivity).toHaveBeenCalledWith(
        ACTIVITY_ID,
        USER_ID,
        expect.anything(),
        'asg-1',
      );
    });

    it('patches Earned-Value cost inputs; a null budgetedCost clears to derive-at-read (EV1, ADR-0042)', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment());
      await service.update(principalWith(ALL), 'acme', 'asg-1', {
        budgetedCost: null,
        actualCost: 9000,
        actualUnits: 3,
        version: 1,
      });
      const patch = assignments.updateIfVersionMatches.mock.calls[0]?.[2] as {
        budgetedCost: number | null;
        actualCost: number;
        actualUnits: number;
      };
      expect(patch.budgetedCost).toBeNull();
      expect(patch.actualCost).toBe(9000);
      expect(patch.actualUnits).toBe(3);
    });
  });

  // Duration-type triad recompute on the ASSIGNMENT write path (M7 rung 4, ADR-0040 §3). Only the
  // DRIVING assignment participates (invariant (c)); the edited field is held, the dependent is
  // server-computed (invariant (d)). `D` = activity.durationMinutes / 60 working hours.
  describe('duration-type recompute (ADR-0040)', () => {
    /** The patch passed to the assignment optimistic update (its recomputed same-row fields). */
    function lastAssignmentPatch() {
      return assignments.updateIfVersionMatches.mock.calls[0]?.[2] as {
        budgetedUnits?: number;
        unitsPerHour?: number | null;
      };
    }

    it('derives and persists the ACTIVITY duration when the rate is edited on a FIXED_UNITS driver (units-driven)', async () => {
      // FIXED_UNITS: edit R ⇒ D := U / R (Units held). U = 300, R := 60 ⇒ D = 5 h ⇒ 300 min.
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: true, budgetedUnits: new Prisma.Decimal(300), unitsPerHour: null }),
      );

      await service.update(principalWith(ALL), 'acme', 'asg-1', {
        unitsPerHour: 60,
        editedField: 'UNITS_PER_HOUR',
        version: 1,
      });

      // The activity's durationMinutes is server-derived and persisted (optimistic-locked).
      expect(txActivityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACTIVITY_ID, version: 1, deletedAt: null },
          data: expect.objectContaining({ durationMinutes: 300 }),
        }),
      );
      // The assignment keeps the held Units and the edited rate.
      expect(lastAssignmentPatch()).toMatchObject({ budgetedUnits: 300, unitsPerHour: 60 });
    });

    it('derives the ACTIVITY duration when Units are edited on a FIXED_UNITS_TIME driver', async () => {
      // FIXED_UNITS_TIME: edit U ⇒ D := U / R (rate held). R = 4, U := 480 ⇒ D = 120 h ⇒ 7 200 min
      // (differs from the activity's stored 14 400, so a duration write is persisted).
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS_TIME' }));
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: true, unitsPerHour: new Prisma.Decimal(4) }),
      );

      await service.update(principalWith(ALL), 'acme', 'asg-1', {
        budgetedUnits: 480,
        editedField: 'UNITS',
        version: 1,
      });

      expect(txActivityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ durationMinutes: 7200 }) }),
      );
    });

    it('rejects a zero rate on a units-driven recompute with 422 UNITS_PER_HOUR_ZERO and writes nothing (N20)', async () => {
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: true, budgetedUnits: new Prisma.Decimal(300), unitsPerHour: null }),
      );

      await expect(
        service.update(principalWith(ALL), 'acme', 'asg-1', {
          unitsPerHour: 0,
          editedField: 'UNITS_PER_HOUR',
          version: 1,
        }),
      ).rejects.toMatchObject({ details: { reason: 'UNITS_PER_HOUR_ZERO' } });
      expect(assignments.updateIfVersionMatches).not.toHaveBeenCalled();
      expect(txActivityUpdateMany).not.toHaveBeenCalled();
    });

    it('server-computes the derived field, ignoring a client-supplied bogus value (invariant (d))', async () => {
      // Default type, edit rate ⇒ Units := D × R. D = 240 h, R = 4 ⇒ 960, regardless of the bogus 999999.
      prisma.activity.findFirst.mockResolvedValue(
        activity({ durationType: 'FIXED_DURATION_AND_UNITS_TIME' }),
      );
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment({ isDriving: true }));

      await service.update(principalWith(ALL), 'acme', 'asg-1', {
        unitsPerHour: 4,
        budgetedUnits: 999999, // bogus — the derived Units must overwrite it
        editedField: 'UNITS_PER_HOUR',
        version: 1,
      });

      expect(lastAssignmentPatch().budgetedUnits).toBe(960);
      // A same-row (Units) dependent never touches the activity duration.
      expect(txActivityUpdateMany).not.toHaveBeenCalled();
    });

    it('stores the rate on a NON-driving assignment but never touches the activity (invariant (c))', async () => {
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: false, unitsPerHour: null }),
      );

      await service.update(principalWith(ALL), 'acme', 'asg-1', {
        unitsPerHour: 5,
        editedField: 'UNITS_PER_HOUR',
        version: 1,
      });

      expect(lastAssignmentPatch().unitsPerHour).toBe(5); // stored verbatim
      expect(txActivityUpdateMany).not.toHaveBeenCalled();
    });

    it('does not recompute when no editedField is declared (plain store, parity)', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: true, unitsPerHour: new Prisma.Decimal(4) }),
      );

      await service.update(principalWith(ALL), 'acme', 'asg-1', { budgetedUnits: 7, version: 1 });

      expect(lastAssignmentPatch()).toMatchObject({ budgetedUnits: 7 });
      expect(prisma.activity.findFirst).not.toHaveBeenCalled();
      expect(txActivityUpdateMany).not.toHaveBeenCalled();
    });

    it('409s (rolling the whole write back) on a stale ACTIVITY version during a units-driven derive', async () => {
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));
      assignments.findActiveByIdInOrg.mockResolvedValue(
        assignment({ isDriving: true, budgetedUnits: new Prisma.Decimal(300), unitsPerHour: null }),
      );
      txActivityUpdateMany.mockResolvedValue({ count: 0 }); // stale activity version

      await expect(
        service.update(principalWith(ALL), 'acme', 'asg-1', {
          unitsPerHour: 60,
          editedField: 'UNITS_PER_HOUR',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('threads unitsPerHour into a create and derives the activity duration for a units-driven driver', async () => {
      prisma.activity.findFirst.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));

      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
        resourceId: RESOURCE_ID,
        budgetedUnits: 300,
        unitsPerHour: 60,
        editedField: 'UNITS_PER_HOUR',
        isDriving: true,
      });

      // FIXED_UNITS edit rate ⇒ D := 300 / 60 = 5 h = 300 min persisted on the activity.
      expect(txActivityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ durationMinutes: 300 }) }),
      );
      // The created assignment carries the held Units + the rate.
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ budgetedUnits: 300, unitsPerHour: 60, isDriving: true }),
        expect.anything(),
      );
    });

    it('stores unitsPerHour verbatim on a create with no editedField (no recompute)', async () => {
      await service.create(principalWith(ALL), 'acme', ACTIVITY_ID, {
        resourceId: RESOURCE_ID,
        budgetedUnits: 10,
        unitsPerHour: 3,
      });
      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ budgetedUnits: 10, unitsPerHour: 3, isDriving: false }),
        expect.anything(),
      );
      expect(txActivityUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove (unassign)', () => {
    it('soft-deletes an existing assignment', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(assignment());
      await service.remove(principalWith(ALL), 'acme', 'asg-1');
      expect(assignments.softDelete).toHaveBeenCalledWith('asg-1', USER_ID);
    });

    it('404s when the assignment is missing', async () => {
      assignments.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'asg-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(assignments.softDelete).not.toHaveBeenCalled();
    });

    it('forbids a caller without resource:assign', async () => {
      await expect(
        service.remove(principalWith(['resource:read']), 'acme', 'asg-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
