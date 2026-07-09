import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OrgMemberRepository,
  type OrgMemberWithUser,
} from '../organizations/org-member.repository';
import { OrganizationsService } from '../organizations/organizations.service';

import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const ADMIN_ROLE = 'ORG_ADMIN';

/**
 * Membership management within an organisation. Every action re-resolves the
 * org scope from the caller's own memberships (anti-IDOR) and pairs a permission
 * check with that scope. Role changes and removals enforce the last-Org-Admin
 * invariant and optimistic locking inside a transaction.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly members: OrgMemberRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(MembersService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: OrgMemberWithUser[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:read', organization.id);

    const rows = await this.members.findManyActiveByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async changeRole(
    principal: Principal,
    orgSlug: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrgMemberWithUser> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:update_role', organization.id);

    const member = await this.members.findActiveByIdInOrg(memberId, organization.id);
    if (!member) throw new NotFoundError('Member not found.');

    await this.prisma.$transaction(async (tx) => {
      if (member.role === ADMIN_ROLE && dto.role !== ADMIN_ROLE) {
        await this.assertNotLastAdmin(organization.id, tx);
      }
      const changed = await this.members.updateRoleIfVersionMatches(
        memberId,
        dto.version,
        dto.role,
        principal.userId,
        tx,
      );
      if (changed === 0) {
        throw new ConflictError('This member was changed elsewhere. Refresh and try again.');
      }
    });

    this.logger.info(
      { organizationId: organization.id, memberId, role: dto.role, userId: principal.userId },
      'member role changed',
    );

    const updated = await this.members.findActiveByIdInOrg(memberId, organization.id);
    if (!updated) throw new NotFoundError('Member not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, memberId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:remove', organization.id);

    const member = await this.members.findActiveByIdInOrg(memberId, organization.id);
    if (!member) throw new NotFoundError('Member not found.');

    await this.prisma.$transaction(async (tx) => {
      if (member.role === ADMIN_ROLE) {
        await this.assertNotLastAdmin(organization.id, tx);
      }
      await this.members.softDelete(memberId, principal.userId, tx);
    });

    this.logger.info(
      { organizationId: organization.id, memberId, userId: principal.userId },
      'member removed',
    );
  }

  private async assertNotLastAdmin(
    organizationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const admins = await this.members.countActiveByRole(organizationId, ADMIN_ROLE, tx);
    if (admins <= 1) {
      throw new ConflictError('An organisation must keep at least one Org Admin.');
    }
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
