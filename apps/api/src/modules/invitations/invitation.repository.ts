import { Injectable } from '@nestjs/common';
import { Prisma, type Invitation, type Organization } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { pendingInvitationWhere } from './invitation-predicates';

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
      // The SHARED predicate, so this list and the landing's count cannot mean different things by
      // "pending" — they did, and the drift was invisible because each file read correctly alone.
      where: pendingInvitationWhere(params.organizationId),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * A page of the invitations addressed to one verified address (ADR-0221): live, undeleted, of an
   * undeleted organisation the user does not already belong to. `email` is compared as stored, which
   * is lower-case on both sides (`CreateInvitationDto` lower-cases it; so does sign-up); the caller
   * lower-cases the user's address anyway so the match never depends on that. One instant `now`
   * is passed in, as `liveInvitationWhere` requires, so the page cannot disagree with itself.
   */
  findManyLiveForEmail(params: {
    email: string;
    userId: string;
    now: Date;
    take: number;
    cursor?: string;
  }): Promise<InvitationWithOrg[]> {
    return this.prisma.invitation.findMany({
      where: {
        email: params.email,
        status: 'PENDING',
        deletedAt: null,
        expiresAt: { gt: params.now },
        organization: {
          deletedAt: null,
          members: { none: { userId: params.userId, deletedAt: null } },
        },
      },
      include: { organization: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * One invitation by id, only if it is addressed to this email (anti-IDOR: a foreign id is
   * indistinguishable from an unknown one) and its organisation is not deleted. Any status, so
   * the caller can answer 410 for a revoked or accepted one.
   */
  findActiveByIdForEmail(id: string, email: string): Promise<InvitationWithOrg | null> {
    return this.prisma.invitation.findFirst({
      where: { id, email, deletedAt: null, organization: { deletedAt: null } },
      include: { organization: true },
    });
  }

  /**
   * soft-delete: any-state — nothing in the application writes `invitations.deleted_at`, so no
   * deleted row can match this id; adding `deletedAt: null` would turn a future deleted match
   * into a thrown P2025, which is a behaviour choice rather than a gate chore.
   */
  async setStatus(
    id: string,
    data: Prisma.InvitationUncheckedUpdateInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.invitation.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  }
}

export type { Organization };
