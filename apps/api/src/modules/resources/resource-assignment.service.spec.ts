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

import type { ResourceAssignmentRepository } from './resource-assignment.repository';
import { ResourceAssignmentService } from './resource-assignment.service';
import type { ResourceRepository } from './resource.repository';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ACTIVITY_ID = '00000000-0000-0000-0000-0000000000ac';
const RESOURCE_ID = '00000000-0000-0000-0000-0000000000re';

function activity(overrides: Partial<Activity> = {}): Partial<Activity> {
  return { id: ACTIVITY_ID, organizationId: ORG_ID, deletedAt: null, ...overrides };
}

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: RESOURCE_ID,
    organizationId: ORG_ID,
    name: 'Crew A',
    code: null,
    description: null,
    kind: 'LABOUR',
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
    isDriving: false,
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
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})),
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
      expect(result).toHaveLength(1);
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
