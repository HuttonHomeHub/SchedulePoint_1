import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Resource, type ResourceKind } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** The scalar inputs a resource create needs (the org id is copied from the route scope). */
export interface CreateResourceInput {
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  kind: ResourceKind;
  calendarId: string | null;
  /** Capacity ceiling in units/working-hour (ADR-0041 §2); null = uncapped. Stored as DECIMAL(18,4). */
  maxUnitsPerHour: number | null;
  /** Planned cost rate in minor units/unit (EV1, ADR-0042); null = no cost. Stored as DECIMAL(18,4). */
  costPerUnit: number | null;
  createdBy: string;
  updatedBy: string;
}

/** Fields a resource update may change (already resolved to DB-ready values). */
export interface ResourcePatch {
  name?: string;
  code?: string | null;
  description?: string | null;
  kind?: ResourceKind;
  calendarId?: string | null;
  /** Capacity ceiling in units/working-hour (ADR-0041 §2); null clears to uncapped. */
  maxUnitsPerHour?: number | null;
  /** Planned cost rate in minor units/unit (EV1, ADR-0042); null clears to no cost. */
  costPerUnit?: number | null;
}

/**
 * Data-access for the org-scoped resource library (ADR-0008, ADR-0039). A near-clone of
 * {@link CalendarRepository}, but simpler — a resource is plain scalar columns plus an
 * optional `calendarId` (no shift/window materialisation). Centralises the soft-delete
 * filter so no read forgets `deletedAt: null`; write methods accept an optional
 * transaction client. Item lookups are scoped by organisation (anti-IDOR). Resources are
 * a sibling library (not a hierarchy level), so delete is a self-contained soft-delete
 * (the `deleteBatchId` is stamped for forward-compatibility / defence in depth).
 */
@Injectable()
export class ResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ResourceWhereInput = {}): Prisma.ResourceWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    input: CreateResourceInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource> {
    return db.resource.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        code: input.code,
        description: input.description,
        kind: input.kind,
        calendarId: input.calendarId,
        maxUnitsPerHour: input.maxUnitsPerHour,
        costPerUnit: input.costPerUnit,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      },
    });
  }

  /**
   * Batch-insert many resources in ONE statement, inside the caller's transaction (interchange
   * commit, ADR-0050 C2). Ids may be client-assigned (the `@default(uuid(7))` is bypassed) so the
   * caller can resolve `resourceKey` → id before writing the assignments that reference them. All rows
   * are brand-new, so no optimistic-lock/audit ceremony beyond the create defaults. Mirrors
   * {@link ActivityRepository.createMany} — avoids a per-row `create` loop that risked Prisma's
   * interactive-transaction timeout at the import ceiling.
   */
  async createManyForImport(
    rows: readonly Prisma.ResourceCreateManyInput[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.resource.createMany({ data: [...rows] });
  }

  /** An active resource scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource | null> {
    return db.resource.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A page of an organisation's active resources (keyset cursor by id, org-scoped list order). */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<Resource[]> {
    return this.prisma.resource.findMany({
      where: this.active({ organizationId: params.organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still matches.
   * Returns rows changed — `0` means a version conflict or the row is gone, which the
   * service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: ResourcePatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.resource.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Soft-delete a resource in the caller's transaction. Idempotent under a concurrent delete. */
  async softDelete(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.resource.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
  }

  /**
   * Count the ACTIVE assignments referencing `resourceId` — the RESOURCE_IN_USE delete
   * guard (ADR-0039 invariant (c)). A soft-deleted assignment does not count. Backed by
   * the partial `idx_resource_assignments_resource_id`.
   */
  countActiveAssignmentsUsing(
    resourceId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.resourceAssignment.count({ where: { resourceId, deletedAt: null } });
  }

  /**
   * Count the ACTIVE resources whose own calendar is `calendarId` — the third referencer
   * of the extended CALENDAR_IN_USE guard (ADR-0039 invariant (c), alongside active plans
   * and activities). A soft-deleted resource does not count. Backed by the partial
   * `idx_resources_calendar_id`.
   */
  countActiveResourcesUsingCalendar(
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.resource.count({ where: { calendarId, deletedAt: null } });
  }
}
