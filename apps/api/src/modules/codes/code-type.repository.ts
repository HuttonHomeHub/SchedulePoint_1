import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type CodeType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** A locked code type row's identity, order key and version (the reorder's read). */
export interface LockedCodeType {
  id: string;
  version: number;
  position: number;
}

/**
 * Data-access for a plan's code types (database-design §5.2). Every read states `deletedAt: null` or
 * says why not (ADR-0172), and every lookup is scoped by organisation AND plan, so a type of another
 * plan or tenant is indistinguishable from a missing one. Order is `position, id`: the key is
 * deliberately not unique, so a permutation in one UPDATE cannot fail. Rows are written through plain
 * columns only (database-design §16.3 D-P1), never a nested `connect`.
 */
@Injectable()
export class CodeTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.CodeTypeWhereInput): Prisma.CodeTypeWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.CodeTypeUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeType> {
    return db.codeType.create({ data });
  }

  /** A live type of this plan and organisation (anti-IDOR). */
  findActiveInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeType | null> {
    return db.codeType.findFirst({ where: this.active({ id, planId, organizationId }) });
  }

  /**
   * A type of this plan and organisation in either state.
   *
   * soft-delete: any-state — restore must find the deleted row it is about to reactivate.
   */
  findInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeType | null> {
    return db.codeType.findFirst({ where: { id, planId, organizationId } });
  }

  /** A page of the plan's live types in display order (keyset by id after `position, id`). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<CodeType[]> {
    return this.prisma.codeType.findMany({
      where: this.active({ organizationId: params.organizationId, planId: params.planId }),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * A page of the plan's types, live and deleted, in display order: the restore picker's read.
   *
   * soft-delete: any-state — the picker lists the deleted rows beside the live ones on purpose.
   */
  findManyAllByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<CodeType[]> {
    return this.prisma.codeType.findMany({
      where: { organizationId: params.organizationId, planId: params.planId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /** The live types of a plan in one inside-transaction read (the reorder's answer). */
  findManyActiveInTx(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient,
  ): Promise<CodeType[]> {
    return db.codeType.findMany({
      where: this.active({ organizationId, planId }),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  countActive(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.codeType.count({ where: this.active({ organizationId, planId }) });
  }

  /** Whether the plan has any live type: decides whether an activity response carries `codes`. */
  async hasActive(organizationId: string, planId: string): Promise<boolean> {
    const found = await this.prisma.codeType.findFirst({
      where: this.active({ organizationId, planId }),
      select: { id: true },
    });
    return found !== null;
  }

  /** The highest `position` among the plan's live types, or -1 when there are none. */
  async maxActivePosition(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.codeType.aggregate({
      where: this.active({ organizationId, planId }),
      _max: { position: true },
    });
    return result._max.position ?? -1;
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
    const result = await db.codeType.updateMany({
      where: this.active({ id, planId, organizationId, version: expectedVersion }),
      data: { name, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * Lock one live type and read its version — the check half of an opt-in versioned delete. `null`
   * means it is gone, deleted, or not in this plan and organisation.
   */
  async lockActiveVersion(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient,
  ): Promise<number | null> {
    const rows = await db.$queryRaw<{ version: number }[]>`
      SELECT version FROM code_types
      WHERE id = ${id}::uuid AND plan_id = ${planId}::uuid
        AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      FOR NO KEY UPDATE
    `;
    return rows[0]?.version ?? null;
  }

  /**
   * Soft-delete one type under a FRESH batch id, so a later plan restore never resurrects an
   * individually deleted type. Returns the batch id, or null when the row was already gone.
   */
  async softDelete(
    id: string,
    planId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<string | null> {
    const batchId = randomUUID();
    const result = await db.codeType.updateMany({
      where: this.active({ id, planId, organizationId }),
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return result.count === 1 ? batchId : null;
  }

  /**
   * Bring one deleted type back. A name taken meanwhile raises the unique violation the caller maps
   * to 409. Returns rows changed (0: it was not deleted, or is not in this plan).
   */
  async restore(
    id: string,
    planId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.codeType.updateMany({
      where: { id, planId, organizationId, deletedAt: { not: null } },
      data: { deletedAt: null, deleteBatchId: null, updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * The plan's live types, locked `FOR NO KEY UPDATE` in id order: the lock order every other
   * writer of these rows uses, so a reorder cannot deadlock against one.
   */
  lockActiveInIdOrder(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient,
  ): Promise<LockedCodeType[]> {
    return db.$queryRaw<LockedCodeType[]>`
      SELECT id, version, position FROM code_types
      WHERE plan_id = ${planId}::uuid AND organization_id = ${organizationId}::uuid
        AND deleted_at IS NULL
      ORDER BY id
      FOR NO KEY UPDATE
    `;
  }

  /**
   * Lock the named live types of this plan `FOR SHARE`, in id order, and return them with their
   * names. The caller holds its activity row locks already (database-design §15 lock order): a
   * type's delete takes `NO KEY UPDATE`, which conflicts with `FOR SHARE`, so an assignment cannot
   * commit against a type deleted a moment earlier. A shortfall against the ids asked for is a type
   * that is foreign, unknown or deleted, and the caller answers 404 without saying which.
   */
  async lockActiveForShare(
    organizationId: string,
    planId: string,
    ids: readonly string[],
    db: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string }[]> {
    if (ids.length === 0) return [];
    return db.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM code_types
      WHERE id IN (SELECT u FROM unnest(${[...ids]}::uuid[]) AS u)
        AND plan_id = ${planId}::uuid AND organization_id = ${organizationId}::uuid
        AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
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
      UPDATE code_types AS t
      SET position = v.pos, version = t.version + 1, updated_at = now(), updated_by = ${updatedBy}
      FROM unnest(${ids}::uuid[], ${positions}::int[]) AS v(id, pos)
      WHERE t.id = v.id AND t.plan_id = ${planId}::uuid
        AND t.organization_id = ${organizationId}::uuid
        AND t.deleted_at IS NULL AND t.position <> v.pos
    `;
  }
}
