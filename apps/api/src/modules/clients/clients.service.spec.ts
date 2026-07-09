import { Prisma, type Client } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { ClientRepository } from './client.repository';
import { ClientsService } from './clients.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    organizationId: ORG_ID,
    name: 'Acme Client',
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
  'client:read',
  'client:create',
  'client:update',
  'client:delete',
  'client:restore',
];

describe('ClientsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let clients: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ClientsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    clients = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findByIdInOrg: vi.fn(),
      findManyActiveByOrg: vi.fn(),
      updateIfVersionMatches: vi.fn(),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ClientsService(
      organizations as unknown as OrganizationsService,
      clients as unknown as ClientRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a client for an authorised caller', async () => {
      clients.create.mockResolvedValue(client());
      const result = await service.create(principalWith(ALL), 'acme', { name: 'Acme Client' });
      expect(result.id).toBe('c1');
      expect(clients.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, name: 'Acme Client', description: null }),
      );
    });

    it('forbids a caller without client:create', async () => {
      await expect(
        service.create(principalWith(['client:read']), 'acme', { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(clients.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to a 409', async () => {
      clients.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', { name: 'Acme Client' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('update', () => {
    it('409s on a stale version', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(client());
      clients.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'c1', { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the client is missing', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'c1', { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('cascade soft-deletes an existing client', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(client());
      await service.remove(principalWith(ALL), 'acme', 'c1');
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'client',
        'c1',
        USER_ID,
      );
    });

    it('404s (and does not delete) when the client is missing', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'c1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted client', async () => {
      clients.findByIdInOrg.mockResolvedValue(client({ deletedAt: new Date() }));
      clients.findActiveByIdInOrg.mockResolvedValue(client());
      const result = await service.restore(principalWith(ALL), 'acme', 'c1');
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'client',
        'c1',
        USER_ID,
      );
      expect(result.id).toBe('c1');
    });

    it('is a no-op when the client is already active', async () => {
      clients.findByIdInOrg.mockResolvedValue(client({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', 'c1');
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('404s when the client is unknown in this org', async () => {
      clients.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', 'c1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
