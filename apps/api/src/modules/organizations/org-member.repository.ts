import { Injectable } from '@nestjs/common';
import { Prisma, type OrgMember, type User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** An organisation membership joined with the member's user profile. */
export type OrgMemberWithUser = Prisma.OrgMemberGetPayload<{ include: { user: true } }>;

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

  /** A specific active membership scoped to an organisation (anti-IDOR). */
  findActiveByIdInOrg(id: string, organizationId: string): Promise<OrgMemberWithUser | null> {
    return this.prisma.orgMember.findFirst({
      where: this.active({ id, organizationId }),
      include: { user: true },
    });
  }

  /** A page of an organisation's active members, with user profiles. */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<OrgMemberWithUser[]> {
    return this.prisma.orgMember.findMany({
      where: this.active({ organizationId: params.organizationId }),
      include: { user: true },
      // Stable order: newest members last is confusing in a roster, so order by
      // creation ascending then id for a deterministic cursor.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /** Count active members holding a role (used for the last-Org-Admin invariant). */
  countActiveByRole(
    organizationId: string,
    role: OrgMember['role'],
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return client.orgMember.count({ where: this.active({ organizationId, role }) });
  }

  /**
   * Optimistic-locked role change: only touches the row if its version still
   * matches (and it isn't soft-deleted). Returns rows changed — `0` means a
   * version conflict or the row is gone, which the service maps to 409.
   */
  async updateRoleIfVersionMatches(
    id: string,
    expectedVersion: number,
    role: OrgMember['role'],
    updatedBy: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await client.orgMember.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { role, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  async softDelete(
    id: string,
    deletedBy: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.orgMember.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }
}

export type { User };
