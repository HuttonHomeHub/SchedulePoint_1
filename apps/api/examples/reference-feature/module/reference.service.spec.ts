import { ReferenceItemStatus, type ReferenceItem } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationRole, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';

import { referencePermissionsForRole } from './reference-permissions';
import type { ReferenceRepository } from './reference.repository';
import { ReferenceService } from './reference.service';

const ORGANIZATION = '11111111-1111-7111-8111-111111111111';
const OTHER_ORGANIZATION = '22222222-2222-7222-8222-222222222222';
const USER = '33333333-3333-7333-8333-333333333333';
const ITEM_ID = '44444444-4444-7444-8444-444444444444';

function makeItem(overrides: Partial<ReferenceItem> = {}): ReferenceItem {
  return {
    id: ITEM_ID,
    organizationId: ORGANIZATION,
    name: 'Reference',
    description: null,
    status: ReferenceItemStatus.DRAFT,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: USER,
    updatedBy: USER,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Unit tests for the service. The **repository is mocked** — the service is
 * tested in isolation from the database (docs/TESTING.md). The e2e test exercises
 * the real repository against Postgres.
 */
describe('ReferenceService', () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findActiveById: ReturnType<typeof vi.fn>;
    findManyActive: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
  };
  let service: ReferenceService;
  let owner: Principal;
  let viewer: Principal;
  let outsider: Principal;

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = {
      create: vi.fn(),
      findActiveById: vi.fn(),
      findManyActive: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new ReferenceService(repository as unknown as ReferenceRepository, logger as never);
    const withPerms = (organizationId: string, role: OrganizationRole) => ({
      organizationId,
      role,
      permissions: referencePermissionsForRole(role),
    });
    owner = new Principal(USER, [withPerms(ORGANIZATION, OrganizationRole.ORG_ADMIN)]);
    viewer = new Principal(USER, [withPerms(ORGANIZATION, OrganizationRole.VIEWER)]);
    outsider = new Principal(USER, [withPerms(OTHER_ORGANIZATION, OrganizationRole.ORG_ADMIN)]);
  });

  describe('create', () => {
    it('creates an item with audit fields for a permitted member', async () => {
      repository.create.mockResolvedValue(makeItem());

      const result = await service.create(owner, {
        organizationId: ORGANIZATION,
        name: 'Reference',
      });

      expect(result.id).toBe(ITEM_ID);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORGANIZATION,
          name: 'Reference',
          description: null,
          createdBy: USER,
          updatedBy: USER,
        }),
      );
    });

    it('rejects a viewer without create permission', async () => {
      await expect(
        service.create(viewer, { organizationId: ORGANIZATION, name: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects creating in an organisation the user is not a member of', async () => {
      await expect(
        service.create(outsider, { organizationId: ORGANIZATION, name: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('getById', () => {
    it('returns an item the user may read', async () => {
      repository.findActiveById.mockResolvedValue(makeItem());
      const result = await service.getById(owner, ITEM_ID);
      expect(result.id).toBe(ITEM_ID);
      expect(repository.findActiveById).toHaveBeenCalledWith(ITEM_ID);
    });

    it('throws NotFound when the item is absent or soft-deleted', async () => {
      repository.findActiveById.mockResolvedValue(null);
      await expect(service.getById(owner, ITEM_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('forbids access to an item in another organisation (IDOR defence)', async () => {
      repository.findActiveById.mockResolvedValue(makeItem({ organizationId: ORGANIZATION }));
      await expect(service.getById(outsider, ITEM_ID)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('update (optimistic locking)', () => {
    it('updates when the version matches and increments it', async () => {
      repository.findActiveById
        .mockResolvedValueOnce(makeItem({ version: 1 }))
        .mockResolvedValueOnce(makeItem({ version: 2, name: 'New' }));
      repository.updateIfVersionMatches.mockResolvedValue(1);

      const result = await service.update(owner, ITEM_ID, { name: 'New', version: 1 });

      expect(result.version).toBe(2);
      expect(repository.updateIfVersionMatches).toHaveBeenCalledWith(
        ITEM_ID,
        1,
        expect.objectContaining({ name: 'New', version: { increment: 1 }, updatedBy: USER }),
      );
    });

    it('throws Conflict when the version does not match', async () => {
      repository.findActiveById.mockResolvedValue(makeItem({ version: 5 }));
      repository.updateIfVersionMatches.mockResolvedValue(0);

      await expect(
        service.update(owner, ITEM_ID, { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('remove (soft delete)', () => {
    it('soft-deletes via the repository', async () => {
      repository.findActiveById.mockResolvedValue(makeItem());
      repository.softDelete.mockResolvedValue(undefined);

      await service.remove(owner, ITEM_ID);

      expect(repository.softDelete).toHaveBeenCalledWith(ITEM_ID, USER);
    });

    it('forbids a viewer from deleting', async () => {
      repository.findActiveById.mockResolvedValue(makeItem());
      await expect(service.remove(viewer, ITEM_ID)).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('list (pagination)', () => {
    it('returns a page and a next cursor when more rows exist', async () => {
      const rows = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
      repository.findManyActive.mockResolvedValue(rows);

      const result = await service.list(owner, {
        organizationId: ORGANIZATION,
        limit: 2,
        order: 'desc',
        sort: 'createdAt',
      });

      expect(result.items).toHaveLength(2);
      expect(result.meta).toEqual({ nextCursor: 'b', hasMore: true });
      // Over-fetches by one to detect a further page.
      expect(repository.findManyActive).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });

    it('has no next cursor on the last page', async () => {
      repository.findManyActive.mockResolvedValue([makeItem({ id: 'a' })]);

      const result = await service.list(owner, {
        organizationId: ORGANIZATION,
        limit: 2,
        order: 'desc',
        sort: 'createdAt',
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta).toEqual({ nextCursor: null, hasMore: false });
    });

    it('forbids listing an organisation the user cannot read', async () => {
      await expect(
        service.list(outsider, {
          organizationId: ORGANIZATION,
          limit: 20,
          order: 'desc',
          sort: 'createdAt',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
