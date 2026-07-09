import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationRole, Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  OrgMemberRepository,
  OrgMemberWithUser,
} from '../organizations/org-member.repository';
import type { OrganizationsService } from '../organizations/organizations.service';

import { MembersService } from './members.service';

const ORG_ID = 'org-1';

function member(overrides: Partial<OrgMemberWithUser> = {}): OrgMemberWithUser {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: 'user-2',
    role: 'ORG_ADMIN',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' } as OrgMemberWithUser['user'],
    ...overrides,
  };
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal('user-1', [
    { organizationId: ORG_ID, role: OrganizationRole.ORG_ADMIN, permissions },
  ]);
}

describe('MembersService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let members: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    countActiveByRole: ReturnType<typeof vi.fn>;
    updateRoleIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    lockOrganization: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: MembersService;

  beforeEach(() => {
    organizations = { resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID } }) };
    members = {
      findActiveByIdInOrg: vi.fn(),
      findManyActiveByOrg: vi.fn(),
      countActiveByRole: vi.fn(),
      updateRoleIfVersionMatches: vi.fn(),
      softDelete: vi.fn().mockResolvedValue(1),
      lockOrganization: vi.fn().mockResolvedValue(undefined),
    };
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new MembersService(
      organizations as unknown as OrganizationsService,
      members as unknown as OrgMemberRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('changeRole', () => {
    it('changes a role when the actor is an admin and the invariant holds', async () => {
      // Reads: pre-tx existence, in-tx re-read, and the final read of the update.
      members.findActiveByIdInOrg
        .mockResolvedValueOnce(member())
        .mockResolvedValueOnce(member())
        .mockResolvedValueOnce(member({ role: 'PLANNER' }));
      members.countActiveByRole.mockResolvedValue(2);
      members.updateRoleIfVersionMatches.mockResolvedValue(1);

      const result = await service.changeRole(
        principalWith(['member:update_role']),
        'acme',
        'member-1',
        {
          role: 'PLANNER',
          version: 1,
        },
      );

      expect(result.role).toBe('PLANNER');
      expect(members.updateRoleIfVersionMatches).toHaveBeenCalled();
    });

    it('refuses to demote the last Org Admin (409)', async () => {
      members.findActiveByIdInOrg.mockResolvedValue(member({ role: 'ORG_ADMIN' }));
      members.countActiveByRole.mockResolvedValue(1);

      await expect(
        service.changeRole(principalWith(['member:update_role']), 'acme', 'member-1', {
          role: 'VIEWER',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(members.updateRoleIfVersionMatches).not.toHaveBeenCalled();
    });

    it('maps a stale version to a conflict (409)', async () => {
      members.findActiveByIdInOrg.mockResolvedValue(member({ role: 'PLANNER' }));
      members.updateRoleIfVersionMatches.mockResolvedValue(0);

      await expect(
        service.changeRole(principalWith(['member:update_role']), 'acme', 'member-1', {
          role: 'VIEWER',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('forbids a non-admin actor (403)', async () => {
      await expect(
        service.changeRole(principalWith(['member:read']), 'acme', 'member-1', {
          role: 'VIEWER',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('404s when the member is not in the organisation', async () => {
      members.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.changeRole(principalWith(['member:update_role']), 'acme', 'missing', {
          role: 'VIEWER',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('removes a non-admin member', async () => {
      members.findActiveByIdInOrg.mockResolvedValue(member({ role: 'VIEWER' }));
      await service.remove(principalWith(['member:remove']), 'acme', 'member-1');
      expect(members.softDelete).toHaveBeenCalledWith('member-1', 'user-1', expect.anything());
    });

    it('refuses to remove the last Org Admin (409)', async () => {
      members.findActiveByIdInOrg.mockResolvedValue(member({ role: 'ORG_ADMIN' }));
      members.countActiveByRole.mockResolvedValue(1);
      await expect(
        service.remove(principalWith(['member:remove']), 'acme', 'member-1'),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(members.softDelete).not.toHaveBeenCalled();
    });
  });
});
