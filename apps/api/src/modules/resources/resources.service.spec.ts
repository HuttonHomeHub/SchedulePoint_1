import { Prisma, type Calendar, type Resource } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { ResourceRepository } from './resource.repository';
import { ResourcesService } from './resources.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CAL_ID = '00000000-0000-0000-0000-0000000000ca';

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'res-1',
    organizationId: ORG_ID,
    name: 'Crew A',
    code: 'CREW-A',
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

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: CAL_ID,
    organizationId: ORG_ID,
    name: 'Standard',
    description: null,
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

const ALL: Permission[] = [
  'resource:read',
  'resource:create',
  'resource:update',
  'resource:delete',
];

describe('ResourcesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let resources: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    countActiveAssignmentsUsing: ReturnType<typeof vi.fn>;
  };
  let calendars: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ResourcesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    resources = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findManyActiveByOrg: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      softDelete: vi.fn(),
      countActiveAssignmentsUsing: vi.fn().mockResolvedValue(0),
    };
    calendars = { findActiveByIdInOrg: vi.fn() };
    // The tx handle exposes $executeRaw (the calendar advisory lock used by create/update).
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ResourcesService(
      organizations as unknown as OrganizationsService,
      resources as unknown as ResourceRepository,
      calendars as unknown as CalendarRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a resource for an authorised caller', async () => {
      resources.create.mockResolvedValue(resource());
      const result = await service.create(principalWith(ALL), 'acme', {
        name: 'Crew A',
        kind: 'LABOUR',
      });
      expect(result.id).toBe('res-1');
      expect(resources.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, name: 'Crew A', kind: 'LABOUR' }),
        expect.anything(),
      );
    });

    it('forbids a caller without resource:create', async () => {
      await expect(
        service.create(principalWith(['resource:read']), 'acme', { name: 'X', kind: 'LABOUR' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(resources.create).not.toHaveBeenCalled();
    });

    it('validates a settable calendarId is an active calendar in the same org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      resources.create.mockResolvedValue(resource({ calendarId: CAL_ID }));
      await service.create(principalWith(ALL), 'acme', {
        name: 'On Cal',
        kind: 'EQUIPMENT',
        calendarId: CAL_ID,
      });
      expect(calendars.findActiveByIdInOrg).toHaveBeenCalledWith(CAL_ID, ORG_ID, expect.anything());
    });

    it('rejects a calendarId that is not an active calendar in this org (404)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', {
          name: 'Bad Cal',
          kind: 'LABOUR',
          calendarId: CAL_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(resources.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name/code to a 409 (DUPLICATE_RESOURCE)', async () => {
      resources.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', { name: 'Dup', kind: 'LABOUR' }),
      ).rejects.toMatchObject({ details: { reason: 'DUPLICATE_RESOURCE' } });
    });

    it('threads the costPerUnit cost rate into the insert (EV1, ADR-0042 — passthrough)', async () => {
      resources.create.mockResolvedValue(resource());
      await service.create(principalWith(ALL), 'acme', {
        name: 'Crew B',
        kind: 'LABOUR',
        costPerUnit: 5237.5,
      });
      expect(resources.create).toHaveBeenCalledWith(
        expect.objectContaining({ costPerUnit: 5237.5 }),
        expect.anything(),
      );
    });
  });

  describe('get', () => {
    it('404s when the resource is missing', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.get(principalWith(ALL), 'acme', 'res-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('update', () => {
    it('409s on a stale version', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      resources.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects a settable calendarId not in this org (404)', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { calendarId: CAL_ID, version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(resources.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('maps a duplicate to a 409', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      resources.updateIfVersionMatches.mockRejectedValue(uniqueViolation());
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { name: 'Taken', version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('patches costPerUnit and clears it on null (EV1, ADR-0042)', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      resources.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'res-1', { costPerUnit: null, version: 1 });
      const patch = resources.updateIfVersionMatches.mock.calls[0]?.[2] as {
        costPerUnit: number | null;
      };
      expect(patch.costPerUnit).toBeNull();
    });
  });

  describe('remove', () => {
    it('soft-deletes a resource with no active assignments', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      await service.remove(principalWith(ALL), 'acme', 'res-1');
      expect(resources.softDelete).toHaveBeenCalledWith('res-1', USER_ID, expect.anything());
    });

    it('409s (RESOURCE_IN_USE) when an active assignment references the resource', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      resources.countActiveAssignmentsUsing.mockResolvedValue(3);
      await expect(service.remove(principalWith(ALL), 'acme', 'res-1')).rejects.toMatchObject({
        details: { reason: 'RESOURCE_IN_USE', count: 3 },
      });
      expect(resources.softDelete).not.toHaveBeenCalled();
    });

    it('404s (and does not delete) when the resource is missing', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'res-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(resources.softDelete).not.toHaveBeenCalled();
    });

    it('forbids a caller without resource:delete', async () => {
      await expect(
        service.remove(principalWith(['resource:read']), 'acme', 'res-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
