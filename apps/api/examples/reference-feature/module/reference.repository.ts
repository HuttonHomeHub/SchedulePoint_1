import { Injectable } from '@nestjs/common';
import { Prisma, type ReferenceItem } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reference repository — the **data-access layer** template (ADR-0008). It is
 * the ONLY place that talks to Prisma for this feature, so queries live in one
 * place and the service stays free of persistence detail.
 *
 * It also centralises the **soft-delete filter**: every read goes through
 * {@link active}, so no caller can forget `deletedAt: null` (docs/DATABASE.md).
 * (A Prisma client extension can enforce this globally across all models; this
 * per-repository form keeps the template self-contained.)
 */
@Injectable()
export class ReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Merge a where clause with the base filter that excludes soft-deleted rows. */
  private active(where: Prisma.ReferenceItemWhereInput = {}): Prisma.ReferenceItemWhereInput {
    return { ...where, deletedAt: null };
  }

  async create(data: Prisma.ReferenceItemCreateInput): Promise<ReferenceItem> {
    return this.prisma.referenceItem.create({ data });
  }

  async findActiveById(id: string): Promise<ReferenceItem | null> {
    return this.prisma.referenceItem.findFirst({ where: this.active({ id }) });
  }

  async findManyActive(params: {
    where: Prisma.ReferenceItemWhereInput;
    orderBy: Prisma.ReferenceItemOrderByWithRelationInput[];
    take: number;
    cursor?: string;
  }): Promise<ReferenceItem[]> {
    return this.prisma.referenceItem.findMany({
      where: this.active(params.where),
      orderBy: params.orderBy,
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the row if its version still matches
   * (and it isn't soft-deleted). Returns the number of rows changed — `0` means
   * a version conflict (or the row is gone), which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    data: Prisma.ReferenceItemUpdateManyMutationInput,
  ): Promise<number> {
    const result = await this.prisma.referenceItem.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data,
    });
    return result.count;
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.referenceItem.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }
}
