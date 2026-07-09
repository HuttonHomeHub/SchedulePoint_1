import { Injectable } from '@nestjs/common';
import { Prisma, type Project } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for projects (ADR-0008). Centralises the soft-delete filter so no
 * read forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent client.
 * Delete/restore are handled by the shared HierarchyLifecycleService (cascade),
 * so this repository only covers create/read/update.
 */
@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ProjectWhereInput = {}): Prisma.ProjectWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ProjectUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project> {
    return db.project.create({ data });
  }

  /** An active project scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project | null> {
    return db.project.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A project in an organisation in ANY state (active or soft-deleted) — used to
   * scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project | null> {
    return db.project.findFirst({ where: { id, organizationId } });
  }

  /** A page of a client's active projects (keyset cursor by id). */
  findManyActiveByClient(params: {
    organizationId: string;
    clientId: string;
    take: number;
    cursor?: string;
  }): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: this.active({ organizationId: params.organizationId, clientId: params.clientId }),
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
    const result = await db.project.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
