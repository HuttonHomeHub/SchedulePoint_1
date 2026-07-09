import { Injectable } from '@nestjs/common';
import { Prisma, type Invitation, type Organization } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** An invitation joined with its organisation (for token preview/accept). */
export type InvitationWithOrg = Prisma.InvitationGetPayload<{ include: { organization: true } }>;

/**
 * Data-access for invitations (ADR-0008). Centralises the soft-delete filter;
 * write methods accept an optional transaction client. Tokens are looked up by
 * hash only — the raw token never touches the database.
 */
@Injectable()
export class InvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.InvitationWhereInput = {}): Prisma.InvitationWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.InvitationUncheckedCreateInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Invitation> {
    return client.invitation.create({ data });
  }

  /** Look up an invitation by token hash, with its organisation (for accept/preview). */
  findActiveByTokenHash(tokenHash: string): Promise<InvitationWithOrg | null> {
    return this.prisma.invitation.findFirst({
      where: this.active({ tokenHash }),
      include: { organization: true },
    });
  }

  /** A specific active invitation scoped to an organisation (anti-IDOR). */
  findActiveByIdInOrg(id: string, organizationId: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A page of an organisation's pending invitations. */
  findManyPendingByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<Invitation[]> {
    return this.prisma.invitation.findMany({
      where: this.active({ organizationId: params.organizationId, status: 'PENDING' }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  async setStatus(
    id: string,
    data: Prisma.InvitationUncheckedUpdateInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.invitation.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  }
}

export type { Organization };
