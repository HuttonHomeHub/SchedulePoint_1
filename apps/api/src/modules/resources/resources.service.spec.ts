import { Prisma, type Calendar, type Resource } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';

import { ResourceResponseDto } from './dto/resource-response.dto';
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
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    archivedAt: null,
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
    // A resource may only hold an ORG-scoped calendar (ADR-0053 §2); PROJECT is the reject case.
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    hoursPerDayMinutes: 1440,
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
    findArchivedByNameOrCodeInOrg: ReturnType<typeof vi.fn>;
    setArchivedIfVersionMatches: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    softDeleteMany: ReturnType<typeof vi.fn>;
    countActiveAssignmentsUsing: ReturnType<typeof vi.fn>;
    countActiveAssignmentsUsingAny: ReturnType<typeof vi.fn>;
    countActiveChildrenOf: ReturnType<typeof vi.fn>;
    findActiveChildIdsOf: ReturnType<typeof vi.fn>;
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
      findArchivedByNameOrCodeInOrg: vi.fn().mockResolvedValue(null),
      setArchivedIfVersionMatches: vi.fn().mockResolvedValue(1),
      findManyActiveByOrg: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      softDelete: vi.fn(),
      softDeleteMany: vi.fn().mockResolvedValue(1),
      countActiveAssignmentsUsing: vi.fn().mockResolvedValue(0),
      countActiveAssignmentsUsingAny: vi.fn().mockResolvedValue(0),
      countActiveChildrenOf: vi.fn().mockResolvedValue(0),
      findActiveChildIdsOf: vi.fn().mockResolvedValue([]),
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
      expect(result.resource.id).toBe('res-1');
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

  // EV4a (ADR-0042): the money cost rate is conditionally included only for a `cost:read` caller
  // (Planner/Org Admin), org-scoped. `canReadCost` is computed in the service and threaded to the DTO.
  describe('cost:read gating (EV4a)', () => {
    const withCost = resource({ costPerUnit: new Prisma.Decimal(5237.5) });

    it('a Planner/Org-Admin (cost:read) read exposes the real costPerUnit', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(withCost);
      const { resource: r, canReadCost } = await service.get(
        principalWith([...ALL, 'cost:read']),
        'acme',
        'res-1',
      );
      expect(canReadCost).toBe(true);
      expect(ResourceResponseDto.from(r, canReadCost).costPerUnit).toBe(5237.5);
    });

    it('a Viewer/Contributor (no cost:read) read returns null for costPerUnit (fail-closed)', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(withCost);
      const { resource: r, canReadCost } = await service.get(
        principalWith(['resource:read']),
        'acme',
        'res-1',
      );
      expect(canReadCost).toBe(false);
      expect(ResourceResponseDto.from(r, canReadCost).costPerUnit).toBeNull();
    });

    it('list threads the same fail-closed decision (null costPerUnit for a non-cost-read caller)', async () => {
      resources.findManyActiveByOrg.mockResolvedValue([withCost]);
      const { items, canReadCost } = await service.list(principalWith(['resource:read']), 'acme', {
        limit: 20,
      });
      expect(canReadCost).toBe(false);
      expect(ResourceResponseDto.from(items[0]!, canReadCost).costPerUnit).toBeNull();
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

  // ---------------------------------------------------------------------------
  // Resource hierarchy (ADR-0053 §3, library-scoping M3)
  // ---------------------------------------------------------------------------

  describe('the GROUP kind', () => {
    it('creates a group with no scheduling fields', async () => {
      resources.create.mockResolvedValue(resource({ kind: 'GROUP' }));
      await service.create(principalWith(ALL), 'acme', { name: 'Groundworks', kind: 'GROUP' });
      expect(resources.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'GROUP', calendarId: null, parentId: null }),
        expect.anything(),
      );
    });

    it.each([
      ['a calendar', { calendarId: CAL_ID }],
      ['a capacity ceiling', { maxUnitsPerHour: 4 }],
      ['a cost rate', { costPerUnit: 1200 }],
    ])('422s when a group is created with %s', async (_label, extra) => {
      await expect(
        service.create(principalWith(ALL), 'acme', { name: 'G', kind: 'GROUP', ...extra }),
      ).rejects.toMatchObject({ details: { reason: 'GROUP_HAS_NO_SCHEDULING_FIELDS' } });
      expect(resources.create).not.toHaveBeenCalled();
    });

    it('422s when converting to GROUP would leave a STORED calendar behind', async () => {
      // The client sends only `kind`, so the stored calendar survives the patch — judged on the
      // post-patch shape, which is the whole point of that check.
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ calendarId: CAL_ID }));
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { kind: 'GROUP', version: 1 }),
      ).rejects.toMatchObject({ details: { reason: 'GROUP_HAS_NO_SCHEDULING_FIELDS' } });
      expect(resources.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('allows converting to GROUP when the same request clears the scheduling fields', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ calendarId: CAL_ID }));
      resources.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'res-1', {
        kind: 'GROUP',
        calendarId: null,
        version: 1,
      });
      expect(resources.updateIfVersionMatches).toHaveBeenCalled();
    });

    it('409s (RESOURCE_IN_USE) when converting an ASSIGNED resource into a group', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource());
      resources.countActiveAssignmentsUsing.mockResolvedValue(2);
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { kind: 'GROUP', version: 1 }),
      ).rejects.toMatchObject({ details: { reason: 'RESOURCE_IN_USE', count: 2 } });
      expect(resources.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('409s (RESOURCE_GROUP_HAS_CHILDREN) when un-grouping a group that still contains rows', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ kind: 'GROUP' }));
      resources.countActiveChildrenOf.mockResolvedValue(3);
      await expect(
        service.update(principalWith(ALL), 'acme', 'res-1', { kind: 'LABOUR', version: 1 }),
      ).rejects.toMatchObject({ details: { reason: 'RESOURCE_GROUP_HAS_CHILDREN', count: 3 } });
      expect(resources.updateIfVersionMatches).not.toHaveBeenCalled();
    });
  });

  describe('the resource tree', () => {
    it('validates a parentId on create and stores it', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ id: 'grp', kind: 'GROUP' }));
      resources.create.mockResolvedValue(resource({ parentId: 'grp' }));
      await service.create(principalWith(ALL), 'acme', {
        name: 'Crew A',
        kind: 'LABOUR',
        parentId: 'grp',
      });
      expect(resources.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'grp' }),
        expect.anything(),
      );
    });

    it('rejects a non-GROUP parent on create (422) and writes nothing', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ id: 'crew', kind: 'LABOUR' }));
      await expect(
        service.create(principalWith(ALL), 'acme', {
          name: 'Crew B',
          kind: 'LABOUR',
          parentId: 'crew',
        }),
      ).rejects.toMatchObject({ details: { reason: 'RESOURCE_PARENT_NOT_GROUP' } });
      expect(resources.create).not.toHaveBeenCalled();
    });

    it('re-parents to null (top level) without needing a parent lookup', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ parentId: 'grp' }));
      resources.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'res-1', { parentId: null, version: 1 });
      const patch = resources.updateIfVersionMatches.mock.calls[0]?.[2] as {
        parentId: string | null;
      };
      expect(patch.parentId).toBeNull();
    });

    it('leaves the tree position untouched when parentId is omitted', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ parentId: 'grp' }));
      resources.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'res-1', { name: 'Renamed', version: 1 });
      const patch = resources.updateIfVersionMatches.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(patch).not.toHaveProperty('parentId');
    });

    it('deletes a GROUP as a whole subtree under ONE batch id', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ id: 'grp', kind: 'GROUP' }));
      resources.findActiveChildIdsOf
        .mockResolvedValueOnce(['child-a', 'child-b'])
        .mockResolvedValueOnce([]);
      await service.remove(principalWith(ALL), 'acme', 'grp');
      const [ids, batchId] = resources.softDeleteMany.mock.calls[0] as [string[], string];
      expect([...ids].sort()).toEqual(['child-a', 'child-b', 'grp']);
      expect(batchId).toEqual(expect.any(String));
      // The per-row helper (which would mint a batch per row and split the branch) is never used.
      expect(resources.softDelete).not.toHaveBeenCalled();
    });

    it('409s with the SUBTREE count when a descendant is still assigned, and deletes nothing', async () => {
      resources.findActiveByIdInOrg.mockResolvedValue(resource({ id: 'grp', kind: 'GROUP' }));
      resources.findActiveChildIdsOf.mockResolvedValueOnce(['child-a']).mockResolvedValueOnce([]);
      resources.countActiveAssignmentsUsingAny.mockResolvedValue(3);
      await expect(service.remove(principalWith(ALL), 'acme', 'grp')).rejects.toMatchObject({
        details: { reason: 'RESOURCE_IN_USE', count: 3, subtreeSize: 2 },
      });
      expect(resources.softDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('passes an explicit parentId filter straight through (null = top level)', async () => {
      resources.findManyActiveByOrg.mockResolvedValue([]);
      await service.list(principalWith(ALL), 'acme', { limit: 20, parentId: null });
      expect(resources.findManyActiveByOrg).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: null }),
      );
    });

    it('omits the filter entirely when parentId is absent — the flat library, unchanged', async () => {
      resources.findManyActiveByOrg.mockResolvedValue([]);
      await service.list(principalWith(ALL), 'acme', { limit: 20 });
      const params = resources.findManyActiveByOrg.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(params).not.toHaveProperty('parentId');
    });
  });
});
