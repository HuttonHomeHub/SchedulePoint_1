import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Swimlane } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** A locked swimlane row's identity, order key and version (the reorder's read). */
export interface LockedSwimlane {
  id: string;
  version: number;
  position: number;
}

/**
 * Data-access for swimlanes (swimlanes schema-design §3.4, §5). Every read states `deletedAt: null`
 * or says why not (ADR-0172), and every lookup is scoped by organisation AND plan, so a swimlane of
 * another plan or tenant is indistinguishable from a missing one. Order is `position, id`: the key is
 * deliberately not unique (schema-design Q1).
 */
@Injectable()
export class SwimlaneRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.SwimlaneWhereInput): Prisma.SwimlaneWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.SwimlaneUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Swimlane> {
    return db.swimlane.create({ data });
  }

  /** An active swimlane of this plan and organisation (anti-IDOR). */
  findActiveInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Swimlane | null> {
    return db.swimlane.findFirst({ where: this.active({ id, planId, organizationId }) });
  }

  /**
   * A swimlane of this plan and organisation in either state.
   *
   * soft-delete: any-state — restore must find the deleted row it is about to reactivate.
   */
  findInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Swimlane | null> {
    return db.swimlane.findFirst({ where: { id, planId, organizationId } });
  }

  /** A page of the plan's active swimlanes in display order (keyset by id after `position, id`). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<Swimlane[]> {
    return this.prisma.swimlane.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /** All of a plan's active swimlanes in display order, inside a transaction (the reorder's answer). */
  findManyActiveInTx(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient,
  ): Promise<Swimlane[]> {
    return db.swimlane.findMany({
      where: this.active({ organizationId, planId }),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  countActive(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.swimlane.count({ where: this.active({ organizationId, planId }) });
  }

  /** The highest `position` among the plan's active swimlanes, or -1 when there are none. */
  async maxActivePosition(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.swimlane.aggregate({
      where: this.active({ organizationId, planId }),
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }

  /**
   * Make room for an insert: every active swimlane after `position` moves down one, and its version
   * bumps because order is part of its state (schema-design Q1).
   */
  async shiftAfter(
    organizationId: string,
    planId: string,
    position: number,
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    await db.swimlane.updateMany({
      where: this.active({ organizationId, planId, position: { gt: position } }),
      data: { position: { increment: 1 }, version: { increment: 1 }, updatedBy },
    });
  }

  /** Version-gated rename. Returns rows changed: 0 is a stale version or a row that has gone. */
  async renameIfVersionMatches(
    id: string,
    planId: string,
    organizationId: string,
    expectedVersion: number,
    name: string,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.swimlane.updateMany({
      where: this.active({ id, planId, organizationId, version: expectedVersion }),
      data: { name, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Lock one active swimlane and read its version — the check half of an opt-in versioned delete.
   * `null` means it is gone, deleted, or not in this plan and organisation.
   */
  async lockActiveVersion(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient,
  ): Promise<number | null> {
    const rows = await db.$queryRaw<{ version: number }[]>`
      SELECT version FROM swimlanes
      WHERE id = ${id}::uuid AND plan_id = ${planId}::uuid
        AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      FOR NO KEY UPDATE
    `;
    return rows[0]?.version ?? null;
  }

  /**
   * Soft-delete one swimlane under a FRESH batch id (the note precedent), so a later plan restore
   * never resurrects an individually deleted swimlane. Members keep their `swimlane_id`.
   * Returns the batch id, or null when the row was already gone.
   */
  async softDelete(
    id: string,
    planId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<string | null> {
    const batchId = randomUUID();
    const result = await db.swimlane.updateMany({
      where: this.active({ id, planId, organizationId }),
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return result.count === 1 ? batchId : null;
  }

  /**
   * Bring one deleted swimlane back as it was. A name taken meanwhile raises the unique violation
   * the caller maps to 409. Returns rows changed (0: it was not deleted, or is not in this plan).
   */
  async restore(
    id: string,
    planId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.swimlane.updateMany({
      where: { id, planId, organizationId, deletedAt: { not: null } },
      data: { deletedAt: null, deleteBatchId: null, updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * The plan's active swimlanes, locked `FOR NO KEY UPDATE` in id order (schema-design §5, the #440
   * reason: the rewrite below locks in join order, and every other writer takes id order).
   */
  lockActiveInIdOrder(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient,
  ): Promise<LockedSwimlane[]> {
    return db.$queryRaw<LockedSwimlane[]>`
      SELECT id, version, position FROM swimlanes
      WHERE plan_id = ${planId}::uuid AND organization_id = ${organizationId}::uuid
        AND deleted_at IS NULL
      ORDER BY id
      FOR NO KEY UPDATE
    `;
  }

  /** Rewrite `position` to the given dense values in one statement; rows already there are untouched. */
  async rewritePositions(
    organizationId: string,
    planId: string,
    orderedIds: readonly string[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...orderedIds];
    const positions = ids.map((_, index) => index);
    await db.$executeRaw`
      UPDATE swimlanes AS s
      SET position = t.pos, version = s.version + 1, updated_at = now(), updated_by = ${updatedBy}
      FROM unnest(${ids}::uuid[], ${positions}::int[]) AS t(id, pos)
      WHERE s.id = t.id AND s.plan_id = ${planId}::uuid
        AND s.organization_id = ${organizationId}::uuid
        AND s.deleted_at IS NULL AND s.position <> t.pos
    `;
  }
}
