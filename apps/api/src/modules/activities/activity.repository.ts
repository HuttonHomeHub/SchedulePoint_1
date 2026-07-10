import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Activity,
  type ActivityStatus,
  type ActivityType,
  type ConstraintType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fields an activity update may change (already converted to DB-ready values).
 * Split into DEFINITION fields (name/logic/graphics — Planner-owned) and PROGRESS
 * fields (status/%/actuals — Contributor-owned via the progress endpoint); the
 * repository is agnostic to the split, but the two callers each send only their
 * half. CPM output columns are engine-owned and never patched here.
 */
export interface ActivityPatch {
  // Definition
  name?: string;
  code?: string | null;
  description?: string | null;
  type?: ActivityType;
  durationDays?: number;
  constraintType?: ConstraintType | null;
  constraintDate?: Date | null;
  laneIndex?: number;
  // Progress
  status?: ActivityStatus;
  percentComplete?: number;
  actualStart?: Date | null;
  actualFinish?: Date | null;
}

/**
 * Data-access for activities (ADR-0008) — the leaf of the Client → Project →
 * Plan → Activity hierarchy. Centralises the soft-delete filter so no read
 * forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent plan.
 * Delete/restore are handled by the shared HierarchyLifecycleService, so this
 * repository only covers create/read/update.
 */
@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ActivityWhereInput = {}): Prisma.ActivityWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ActivityUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity> {
    return db.activity.create({ data });
  }

  /** An active activity scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** An activity in an organisation in ANY state (active or soft-deleted) — used
   * to scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Activity | null> {
    return db.activity.findFirst({ where: { id, organizationId } });
  }

  /** A page of a plan's active activities (keyset cursor by id). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
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
    patch: ActivityPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.activity.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
