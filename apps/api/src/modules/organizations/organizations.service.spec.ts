import { Prisma, type Organization } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationRole, Principal } from '../../common/auth/principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';

import type { OrgMemberRepository } from './org-member.repository';
import type { OrganizationRepository } from './organization.repository';
import { OrganizationsService } from './organizations.service';

const USER = 'user-1';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: USER,
    updatedBy: USER,
    deletedAt: null,
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('OrganizationsService', () => {
  let organizations: {
    create: ReturnType<typeof vi.fn>;
    findActiveBySlug: ReturnType<typeof vi.fn>;
    findManyActiveByIds: ReturnType<typeof vi.fn>;
  };
  let members: { create: ReturnType<typeof vi.fn> };
  let calendarCreate: ReturnType<typeof vi.fn>;
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: OrganizationsService;

  beforeEach(() => {
    organizations = { create: vi.fn(), findActiveBySlug: vi.fn(), findManyActiveByIds: vi.fn() };
    members = { create: vi.fn().mockResolvedValue({}) };
    // The org-create transaction also seeds the Standard calendar via tx.calendar.create.
    calendarCreate = vi.fn().mockResolvedValue({});
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({ calendar: { create: calendarCreate } }),
      ),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new OrganizationsService(
      organizations as unknown as OrganizationRepository,
      members as unknown as OrgMemberRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  const principal = (memberships: { organizationId: string; role: OrganizationRole }[] = []) =>
    new Principal(
      USER,
      memberships.map((m) => ({ ...m, permissions: [] })),
    );

  describe('create', () => {
    it('creates the org + Org Admin membership and derives a slug', async () => {
      organizations.create.mockResolvedValue(makeOrg());

      const result = await service.create(principal(), { name: 'Acme' });

      expect(result.role).toBe(OrganizationRole.ORG_ADMIN);
      expect(organizations.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme', slug: 'acme', createdBy: USER }),
        expect.anything(),
      );
      expect(members.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, role: 'ORG_ADMIN' }),
        expect.anything(),
      );
      // The org is seeded a Standard (Mon–Fri) calendar in the same transaction,
      // scoped to the just-created org (id copied from the created row, not input).
      expect(calendarCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          name: 'Standard',
          workingWeekdays: 31,
          createdBy: USER,
        }),
      });
    });

    it('retries with a numeric suffix when the slug is taken', async () => {
      organizations.create
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValue(makeOrg({ slug: 'acme-2' }));

      await service.create(principal(), { name: 'Acme' });

      expect(organizations.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ slug: 'acme' }),
        expect.anything(),
      );
      expect(organizations.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ slug: 'acme-2' }),
        expect.anything(),
      );
    });
  });

  describe('list', () => {
    it('returns only the caller organisations, each with their role', async () => {
      organizations.findManyActiveByIds.mockResolvedValue([makeOrg({ id: 'org-1' })]);

      const result = await service.list(
        principal([{ organizationId: 'org-1', role: OrganizationRole.PLANNER }]),
      );

      expect(result).toEqual([
        { organization: expect.objectContaining({ id: 'org-1' }), role: OrganizationRole.PLANNER },
      ]);
    });

    it('returns an empty list when the caller has no organisations', async () => {
      const result = await service.list(principal());
      expect(result).toEqual([]);
      expect(organizations.findManyActiveByIds).not.toHaveBeenCalled();
    });
  });

  describe('resolveScope', () => {
    it('returns the org + role for a member', async () => {
      organizations.findActiveBySlug.mockResolvedValue(makeOrg({ id: 'org-1', slug: 'acme' }));
      const result = await service.resolveScope(
        principal([{ organizationId: 'org-1', role: OrganizationRole.VIEWER }]),
        'acme',
      );
      expect(result.role).toBe(OrganizationRole.VIEWER);
    });

    it('404s when the organisation does not exist', async () => {
      organizations.findActiveBySlug.mockResolvedValue(null);
      await expect(service.resolveScope(principal(), 'ghost')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('404s when the caller is not a member (anti-enumeration)', async () => {
      organizations.findActiveBySlug.mockResolvedValue(makeOrg({ id: 'org-1', slug: 'acme' }));
      await expect(service.resolveScope(principal(), 'acme')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
