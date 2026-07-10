import { Injectable } from '@nestjs/common';
import { Prisma, type Plan, type PlanStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Fields a plan update may change (already converted to DB-ready values). */
export interface PlanPatch {
  name?: string;
  description?: string | null;
  status?: PlanStatus;
  plannedStart?: Date | null;
  /** The plan's default calendar id, or null to clear it (validated in the service). */
  calendarId?: string | null;
}

/**
 * Data-access for plans (ADR-0008). Centralises the soft-delete filter so no
 * read forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent project.
 * Delete/restore are handled by the shared HierarchyLifecycleService (a plan is
 * a leaf, so delete cascades to nothing), so this repository only covers
 * create/read/update.
 */
@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.PlanWhereInput = {}): Prisma.PlanWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.PlanUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Plan> {
    return db.plan.create({ data });
  }

  /** An active plan scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Plan | null> {
    return db.plan.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A plan in an organisation in ANY state (active or soft-deleted) — used to
   * scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Plan | null> {
    return db.plan.findFirst({ where: { id, organizationId } });
  }

  /** A page of a project's active plans (keyset cursor by id). */
  findManyActiveByProject(params: {
    organizationId: string;
    projectId: string;
    take: number;
    cursor?: string;
  }): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: this.active({ organizationId: params.organizationId, projectId: params.projectId }),
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
    patch: PlanPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.plan.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
