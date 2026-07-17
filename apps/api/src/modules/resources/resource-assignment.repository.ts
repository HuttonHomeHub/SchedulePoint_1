import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type ResourceAssignment } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** The scalar inputs an assignment create needs (org id copied from the endpoints, never input). */
export interface CreateAssignmentInput {
  organizationId: string;
  activityId: string;
  resourceId: string;
  budgetedUnits: number;
  /** Planned rate (units/time), the triad's Units/Time term (M7 rung 4, ADR-0040); null = no rate. */
  unitsPerHour: number | null;
  isDriving: boolean;
  /** Optional budgeted-cost override in minor units (EV1, ADR-0042); null = derive at read time. BIGINT. */
  budgetedCost: number | null;
  /** Actual cost spent in minor units (EV1, ADR-0042); defaults to 0. Stored as BIGINT. */
  actualCost: number;
  /** Quantity of work actually done (EV1, ADR-0042); defaults to 0. Stored as DECIMAL(18,4). */
  actualUnits: number;
  createdBy: string;
  updatedBy: string;
}

/** Fields an assignment update may change. */
export interface AssignmentPatch {
  budgetedUnits?: number;
  /** Planned rate (units/time), the triad's Units/Time term (M7 rung 4, ADR-0040); null = no rate. */
  unitsPerHour?: number | null;
  isDriving?: boolean;
  /** Optional budgeted-cost override in minor units (EV1, ADR-0042); null clears to derive-at-read. */
  budgetedCost?: number | null;
  /** Actual cost spent in minor units (EV1, ADR-0042). Stored as BIGINT. */
  actualCost?: number;
  /** Quantity of work actually done (EV1, ADR-0042). Stored as DECIMAL(18,4). */
  actualUnits?: number;
}

/**
 * Data-access for resource assignments (ADR-0039) — the activity↔resource join. Follows
 * the same house standards as the resource library (soft-delete filter centralised, write
 * methods accept an optional transaction client, item lookups org-scoped for anti-IDOR).
 * The ≤1-driver-per-activity DB partial-unique is guaranteed by clearing any existing
 * driver in the SAME transaction ({@link clearDrivingForActivity}) so "set driver" is a
 * move, never a P2002.
 */
@Injectable()
export class ResourceAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(
    where: Prisma.ResourceAssignmentWhereInput = {},
  ): Prisma.ResourceAssignmentWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    input: CreateAssignmentInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ResourceAssignment> {
    return db.resourceAssignment.create({
      data: {
        organizationId: input.organizationId,
        activityId: input.activityId,
        resourceId: input.resourceId,
        budgetedUnits: input.budgetedUnits,
        unitsPerHour: input.unitsPerHour,
        isDriving: input.isDriving,
        budgetedCost: input.budgetedCost,
        actualCost: input.actualCost,
        actualUnits: input.actualUnits,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      },
    });
  }

  /** An active assignment scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ResourceAssignment | null> {
    return db.resourceAssignment.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** All active assignments of an activity (creation-ordered) — the list read shape. */
  findManyActiveByActivity(
    activityId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ResourceAssignment[]> {
    return db.resourceAssignment.findMany({
      where: this.active({ activityId, organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Clear `isDriving` on every OTHER active driving assignment of `activityId` (optionally
   * excluding `exceptId`, the row about to be set), inside the caller's transaction. This
   * makes "set driver" a MOVE — the ≤1-driver partial-unique never trips a P2002. Bumps
   * those rows' `version`/`updatedBy` so a stale peer edit correctly 409s.
   */
  async clearDrivingForActivity(
    activityId: string,
    actorId: string,
    db: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    await db.resourceAssignment.updateMany({
      where: this.active({
        activityId,
        isDriving: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      }),
      data: { isDriving: false, updatedBy: actorId, version: { increment: 1 } },
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still matches.
   * Returns rows changed — `0` means a version conflict or the row is gone (→ 409).
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: AssignmentPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.resourceAssignment.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Soft-delete (unassign) one assignment. Returns rows changed (`0` if already gone). */
  async softDelete(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.resourceAssignment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
    return result.count;
  }
}
