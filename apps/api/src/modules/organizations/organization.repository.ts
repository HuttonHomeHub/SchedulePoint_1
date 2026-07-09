import { Injectable } from '@nestjs/common';
import { Prisma, type Organization } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for organisations (ADR-0008). The only place Prisma is touched for
 * this entity; centralises the soft-delete filter so no read forgets
 * `deletedAt: null` (docs/DATABASE.md). Write methods accept an optional
 * transaction client so multi-step writes stay atomic.
 */
@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.OrganizationWhereInput = {}): Prisma.OrganizationWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.OrganizationCreateInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Organization> {
    return client.organization.create({ data });
  }

  findActiveBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findFirst({ where: this.active({ slug }) });
  }

  findActiveById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findFirst({ where: this.active({ id }) });
  }

  /** Load a set of organisations by id (used to expand a caller's memberships). */
  findManyActiveByIds(ids: string[]): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      where: this.active({ id: { in: ids } }),
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
