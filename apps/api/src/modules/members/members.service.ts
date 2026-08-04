import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
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
    context?: RequestContext,
  ): Promise<OrgMemberWithUser> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:update_role', organization.id);

    if (!(await this.members.findActiveByIdInOrg(memberId, organization.id))) {
      throw new NotFoundError('Member not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialize per-org so the last-admin count can't be read stale.
      await this.members.lockOrganization(tx, organization.id);
      const member = await this.members.findActiveByIdInOrg(memberId, organization.id, tx);
      if (!member) throw new NotFoundError('Member not found.');

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

      // `before` is the POST-LOCK read above, never the existence check outside the transaction.
      // That earlier read is taken before `lockOrganization` serialises anything, so a concurrent
      // role change can land between the two — and the row would then record a prior role that was
      // already gone, produced by a transaction that looks correctly serialised. This is the
      // ADR-0063 `dissolve` defect, one module along.
      //
      // Inside the transaction, so a failed audit write rolls the role change back with it.
      await this.audit.record(
        {
          action: 'member.role_changed',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'ORG_MEMBER',
          subjectId: memberId,
          subjectLabel: member.user.email,
          before: { role: member.role },
          after: { role: dto.role },
          ...auditActor(principal, context),
        },
        tx,
      );
    });

    this.logger.info(
      { organizationId: organization.id, memberId, role: dto.role, userId: principal.userId },
      'member role changed',
    );

    const updated = await this.members.findActiveByIdInOrg(memberId, organization.id);
    if (!updated) throw new NotFoundError('Member not found.');
    return updated;
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    memberId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'member:remove', organization.id);

    if (!(await this.members.findActiveByIdInOrg(memberId, organization.id))) {
      throw new NotFoundError('Member not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.members.lockOrganization(tx, organization.id);
      const member = await this.members.findActiveByIdInOrg(memberId, organization.id, tx);
      if (!member) throw new NotFoundError('Member not found.');

      if (member.role === ADMIN_ROLE) {
        await this.assertNotLastAdmin(organization.id, tx);
      }
      const removed = await this.members.softDelete(memberId, principal.userId, tx);
      if (removed === 0) {
        throw new ConflictError('This member was changed elsewhere. Refresh and try again.');
      }

      // Again the post-lock `member`, for the reason given in `changeRole`.
      await this.audit.record(
        {
          action: 'member.removed',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'ORG_MEMBER',
          subjectId: memberId,
          subjectLabel: member.user.email,
          before: { role: member.role },
          ...auditActor(principal, context),
        },
        tx,
      );
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
