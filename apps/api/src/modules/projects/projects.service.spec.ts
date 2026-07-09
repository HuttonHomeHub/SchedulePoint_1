import { Prisma, type Client, type Project } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClientRepository } from '../clients/client.repository';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { ProjectRepository } from './project.repository';
import { ProjectsService } from './projects.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CLIENT_ID = 'client-1';

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
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

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    name: 'Riverside',
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
  'project:read',
  'project:create',
  'project:update',
  'project:delete',
  'project:restore',
];

describe('ProjectsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let clients: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let projects: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByClient: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ProjectsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    clients = { findActiveByIdInOrg: vi.fn().mockResolvedValue(client()) };
    projects = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findByIdInOrg: vi.fn(),
      findManyActiveByClient: vi.fn(),
      updateIfVersionMatches: vi.fn(),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new ProjectsService(
      organizations as unknown as OrganizationsService,
      clients as unknown as ClientRepository,
      projects as unknown as ProjectRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a project under an active parent client, copying its org id', async () => {
      projects.create.mockResolvedValue(project());
      const result = await service.create(principalWith(ALL), 'acme', CLIENT_ID, {
        name: 'Riverside',
      });
      expect(result.id).toBe('p1');
      expect(projects.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, clientId: CLIENT_ID, name: 'Riverside' }),
      );
    });

    it('404s when the parent client is missing/deleted (and does not create)', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', CLIENT_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(projects.create).not.toHaveBeenCalled();
    });

    it('forbids a caller without project:create', async () => {
      await expect(
        service.create(principalWith(['project:read']), 'acme', CLIENT_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(projects.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to a 409', async () => {
      projects.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', CLIENT_ID, { name: 'Riverside' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('list', () => {
    it('404s when the parent client is missing/deleted', async () => {
      clients.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', CLIENT_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(projects.findManyActiveByClient).not.toHaveBeenCalled();
    });

    it('paginates a client’s projects (hasMore + nextCursor)', async () => {
      projects.findManyActiveByClient.mockResolvedValue([
        project({ id: 'p1' }),
        project({ id: 'p2' }),
        project({ id: 'p3' }),
      ]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', CLIENT_ID, {
        limit: 2,
      });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ hasMore: true, nextCursor: 'p2' });
    });
  });

  describe('update', () => {
    it('409s on a stale version', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(project());
      projects.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'p1', { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the project is missing', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'p1', { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('cascade soft-deletes an existing project', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(project());
      await service.remove(principalWith(ALL), 'acme', 'p1');
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        'p1',
        USER_ID,
      );
    });

    it('404s (and does not delete) when the project is missing', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'p1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted project', async () => {
      projects.findByIdInOrg.mockResolvedValue(project({ deletedAt: new Date() }));
      projects.findActiveByIdInOrg.mockResolvedValue(project());
      const result = await service.restore(principalWith(ALL), 'acme', 'p1');
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        'p1',
        USER_ID,
      );
      expect(result.id).toBe('p1');
    });

    it('is a no-op when the project is already active', async () => {
      projects.findByIdInOrg.mockResolvedValue(project({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', 'p1');
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('404s when the project is unknown in this org', async () => {
      projects.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', 'p1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
