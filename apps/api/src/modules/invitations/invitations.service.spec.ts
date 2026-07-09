import { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
} from '../../common/errors/domain-errors';
import type { MailService } from '../../common/mail/mail.service';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrgMemberRepository } from '../organizations/org-member.repository';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { InvitationRepository, InvitationWithOrg } from './invitation.repository';
import { InvitationsService } from './invitations.service';
import { hashInvitationToken } from './token';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function invitation(overrides: Partial<InvitationWithOrg> = {}): InvitationWithOrg {
  return {
    id: 'inv-1',
    organizationId: ORG_ID,
    email: 'invitee@example.com',
    role: 'PLANNER',
    tokenHash: 'hash',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    acceptedByUserId: null,
    acceptedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    organization: { id: ORG_ID, name: 'Acme', slug: 'acme' } as InvitationWithOrg['organization'],
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'ORG_ADMIN', permissions }]);
}

describe('InvitationsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let invitations: {
    create: ReturnType<typeof vi.fn>;
    findActiveByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findManyPendingByOrg: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
  let members: {
    findActiveByOrgAndUser: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
  let mail: { sendInvitation: ReturnType<typeof vi.fn> };
  let service: InvitationsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID, name: 'Acme' } }),
    };
    invitations = {
      create: vi.fn(),
      findActiveByTokenHash: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findManyPendingByOrg: vi.fn(),
      setStatus: vi.fn().mockResolvedValue(undefined),
    };
    members = { findActiveByOrgAndUser: vi.fn(), create: vi.fn() };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})),
      user: { findUnique: vi.fn() },
    };
    mail = { sendInvitation: vi.fn().mockResolvedValue(undefined) };
    const config = { appUrl: 'https://app.example' } as AppConfigService;
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new InvitationsService(
      organizations as unknown as OrganizationsService,
      invitations as unknown as InvitationRepository,
      members as unknown as OrgMemberRepository,
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config,
      logger,
    );
  });

  describe('create', () => {
    it('creates an invitation and sends the email with an accept URL', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      invitations.create.mockResolvedValue(invitation());

      const result = await service.create(principalWith(['member:invite']), 'acme', {
        email: 'invitee@example.com',
        role: 'PLANNER',
      });

      expect(result.acceptUrl).toMatch(/^https:\/\/app\.example\/accept-invite\?token=/);
      expect(mail.sendInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'invitee@example.com', acceptUrl: result.acceptUrl }),
      );
    });

    it('409s when the invitee is already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-9' });
      members.findActiveByOrgAndUser.mockResolvedValue({ id: 'member-9' });
      await expect(
        service.create(principalWith(['member:invite']), 'acme', {
          email: 'x@example.com',
          role: 'VIEWER',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(invitations.create).not.toHaveBeenCalled();
    });

    it('409s when a pending invitation already exists (unique violation)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      invitations.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(['member:invite']), 'acme', {
          email: 'x@example.com',
          role: 'VIEWER',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('forbids a caller without member:invite', async () => {
      await expect(
        service.create(principalWith(['member:read']), 'acme', {
          email: 'x@example.com',
          role: 'VIEWER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('accept', () => {
    const token = 'the-token';
    const invitee = principalWith([]);

    it('accepts a valid invitation for the matching user', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(
        invitation({ tokenHash: hashInvitationToken(token) }),
      );
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, email: 'invitee@example.com' });
      members.findActiveByOrgAndUser.mockResolvedValue(null);

      const result = await service.accept(invitee, token);

      expect(result.organization.id).toBe(ORG_ID);
      expect(members.create).toHaveBeenCalled();
      expect(invitations.setStatus).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ status: 'ACCEPTED', acceptedByUserId: USER_ID }),
        expect.anything(),
      );
    });

    it('404s for an unknown token', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(null);
      await expect(service.accept(invitee, token)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('410s for a revoked or already-accepted invitation', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(invitation({ status: 'REVOKED' }));
      await expect(service.accept(invitee, token)).rejects.toBeInstanceOf(GoneError);
    });

    it('410s for an expired invitation', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(
        invitation({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.accept(invitee, token)).rejects.toBeInstanceOf(GoneError);
    });

    it('403s when signed in as a different account than invited', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(invitation());
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, email: 'someone-else@example.com' });
      await expect(service.accept(invitee, token)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('409s when already a member', async () => {
      invitations.findActiveByTokenHash.mockResolvedValue(invitation());
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, email: 'invitee@example.com' });
      members.findActiveByOrgAndUser.mockResolvedValue({ id: 'member-1' });
      await expect(service.accept(invitee, token)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('revoke', () => {
    it('409s when the invitation is not pending', async () => {
      invitations.findActiveByIdInOrg.mockResolvedValue(invitation({ status: 'ACCEPTED' }));
      await expect(
        service.revoke(principalWith(['invitation:revoke']), 'acme', 'inv-1'),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
