import { Injectable } from '@nestjs/common';
import { Prisma, type Invitation, type Organization } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { OrganizationRole, Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
} from '../../common/errors/domain-errors';
import { MailService } from '../../common/mail/mail.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgMemberRepository } from '../organizations/org-member.repository';
import { OrganizationsService } from '../organizations/organizations.service';

import type { CreateInvitationDto } from './dto/create-invitation.dto';
import { type InvitationWithOrg, InvitationRepository } from './invitation.repository';
import { generateInvitationToken, hashInvitationToken } from './token';

/** How long an invitation stays valid. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Result of creating an invitation: the row plus the one-time accept URL. */
export interface CreatedInvitationResult {
  invitation: Invitation;
  acceptUrl: string;
}

/** Result of accepting: the organisation joined and the role granted. */
export interface AcceptedInvitationResult {
  organization: Organization;
  role: OrganizationRole;
}

/**
 * Invitation lifecycle: create (Org Admin), list pending, revoke, preview by
 * token, and accept. Tokens are stored hashed; the raw token is returned once
 * and emailed via the {@link MailService} port (published after commit). Accept
 * is transactional (membership + status change together).
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationRepository,
    private readonly members: OrgMemberRepository,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    @InjectPinoLogger(InvitationsService.name) private readonly logger: PinoLogger,
  ) {}

  async create(
    principal: Principal,
    orgSlug: string,
    dto: CreateInvitationDto,
  ): Promise<CreatedInvitationResult> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:invite', organization.id);

    // If a user with this email already belongs to the org, there's nothing to do.
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const membership = await this.members.findActiveByOrgAndUser(
        organization.id,
        existingUser.id,
      );
      if (membership) {
        throw new ConflictError('That person is already a member of this organisation.');
      }
    }

    const { token, tokenHash } = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    let invitation: Invitation;
    try {
      invitation = await this.invitations.create({
        organizationId: organization.id,
        email: dto.email,
        role: dto.role,
        tokenHash,
        expiresAt,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError('There is already a pending invitation for that email.');
      }
      throw error;
    }

    const acceptUrl = `${this.config.appUrl}/accept-invite?token=${token}`;
    // Publish AFTER the row is committed (no external I/O inside a transaction).
    await this.mail.sendInvitation({
      to: dto.email,
      organizationName: organization.name,
      role: dto.role,
      acceptUrl,
      expiresAt,
    });

    this.logger.info(
      { organizationId: organization.id, invitationId: invitation.id, userId: principal.userId },
      'invitation created',
    );
    return { invitation, acceptUrl };
  }

  async listPending(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Invitation[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'invitation:read', organization.id);

    const rows = await this.invitations.findManyPendingByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async revoke(principal: Principal, orgSlug: string, invitationId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'invitation:revoke', organization.id);

    const invitation = await this.invitations.findActiveByIdInOrg(invitationId, organization.id);
    if (!invitation) throw new NotFoundError('Invitation not found.');
    if (invitation.status !== 'PENDING') {
      throw new ConflictError('This invitation is no longer pending.');
    }

    await this.invitations.setStatus(invitationId, {
      status: 'REVOKED',
      updatedBy: principal.userId,
    });
    this.logger.info(
      { organizationId: organization.id, invitationId, userId: principal.userId },
      'invitation revoked',
    );
  }

  /** Token-gated preview shown before accepting. Throws 404 if the token is unknown. */
  async preview(token: string): Promise<InvitationWithOrg> {
    const invitation = await this.invitations.findActiveByTokenHash(hashInvitationToken(token));
    if (!invitation) throw new NotFoundError('Invitation not found.');
    return invitation;
  }

  async accept(principal: Principal, token: string): Promise<AcceptedInvitationResult> {
    const invitation = await this.invitations.findActiveByTokenHash(hashInvitationToken(token));
    if (!invitation) throw new NotFoundError('Invitation not found.');
    if (invitation.status !== 'PENDING') throw new GoneError('This invitation is no longer valid.');
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneError('This invitation has expired.');
    }

    // The signed-in user must be the invitee (compared by email). This match is
    // only a real proof of mailbox ownership when email verification is enforced
    // — otherwise an account can be registered for any address without proof, so
    // acceptance is a privilege grant gated on an unverified claim (ADR-0016,
    // docs/TECH_DEBT.md). When AUTH_REQUIRE_EMAIL_VERIFICATION is on we also
    // require the account's email to be verified before granting membership.
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenError('You are signed in as a different account than the one invited.');
    }
    if (this.config.requireEmailVerification && !user.emailVerified) {
      throw new ForbiddenError('Verify your email address before accepting this invitation.');
    }

    const existing = await this.members.findActiveByOrgAndUser(
      invitation.organizationId,
      principal.userId,
    );
    if (existing) throw new ConflictError('You are already a member of this organisation.');

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.members.create(
          {
            organizationId: invitation.organizationId,
            userId: principal.userId,
            role: invitation.role,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
        await this.invitations.setStatus(
          invitation.id,
          { status: 'ACCEPTED', acceptedByUserId: principal.userId, acceptedAt: new Date() },
          tx,
        );
      });
    } catch (error) {
      // A concurrent accept/join lost the race on the one-membership constraint.
      if (this.isUniqueViolation(error)) {
        throw new ConflictError('You are already a member of this organisation.');
      }
      throw error;
    }

    this.logger.info(
      {
        organizationId: invitation.organizationId,
        invitationId: invitation.id,
        userId: principal.userId,
      },
      'invitation accepted',
    );
    return { organization: invitation.organization, role: invitation.role };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
