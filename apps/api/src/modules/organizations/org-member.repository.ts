import { Injectable } from '@nestjs/common';
import { Prisma, type OrgMember } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for organisation memberships (ADR-0008) — the scoping join table.
 * Shared across the organisations, members, and invitations features. Centralises
 * the soft-delete filter; write methods accept an optional transaction client.
 */
@Injectable()
export class OrgMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.OrgMemberWhereInput = {}): Prisma.OrgMemberWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.OrgMemberUncheckedCreateInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<OrgMember> {
    return client.orgMember.create({ data });
  }

  /** The caller's active membership in an organisation, if any. */
  findActiveByOrgAndUser(organizationId: string, userId: string): Promise<OrgMember | null> {
    return this.prisma.orgMember.findFirst({ where: this.active({ organizationId, userId }) });
  }

  /** All of a user's active memberships (used to expand "my organisations"). */
  findManyActiveByUser(userId: string): Promise<OrgMember[]> {
    return this.prisma.orgMember.findMany({ where: this.active({ userId }) });
  }
}
