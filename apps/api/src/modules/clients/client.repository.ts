import { Injectable } from '@nestjs/common';
import { Prisma, type Client } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for clients (ADR-0008). Centralises the soft-delete filter so no
 * read forgets `deletedAt: null`; write methods accept an optional transaction
 * client. Delete/restore are handled by the shared HierarchyLifecycleService
 * (cascade), so this repository only covers create/read/update.
 */
@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ClientWhereInput = {}): Prisma.ClientWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ClientUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client> {
    return db.client.create({ data });
  }

  /** An active client scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client | null> {
    return db.client.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A client in an organisation in ANY state (active or soft-deleted) — used to
   * scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client | null> {
    return db.client.findFirst({ where: { id, organizationId } });
  }

  /** A page of an organisation's active clients (keyset cursor by id). */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: this.active({ organizationId: params.organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns rows changed — `0` means a version conflict or the row is
   * gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: { name?: string; description?: string | null },
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.client.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
