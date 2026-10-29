import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type CodeValue } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The nine columns a value response emits. The list reads up to 100,000 values, so it selects these
 * and not the actor stamps and the organisation id the response drops.
 */
const LISTED_VALUE = {
  id: true,
  codeTypeId: true,
  shortCode: true,
  description: true,
  position: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/** A value as the list reads it: the columns of {@link LISTED_VALUE}. */
export type ListedCodeValue = Prisma.CodeValueGetPayload<{ select: typeof LISTED_VALUE }>;

/** A value with the name and state of its type, as the resolve read returns it. */
export type ResolvedCodeValue = Prisma.CodeValueGetPayload<{
  select: typeof LISTED_VALUE & { codeType: { select: { name: true; deletedAt: true } } };
}>;

/** A locked code value row's identity, order key and version (the reorder's read). */
export interface LockedCodeValue {
  id: string;
  version: number;
  position: number;
}

/** What an assignment learns about a value it names, under the lock. */
export interface ShareLockedCodeValue {
  id: string;
  codeTypeId: string;
  deleted: boolean;
}

/**
 * Data-access for a code type's values (database-design §5.3). A value has no `plan_id`: the type
 * carries it, so every lookup that starts from a value id is scoped by organisation AND the type's
 * plan, and a value of another plan or tenant is indistinguishable from a missing one. Rows are
 * written through plain columns only (database-design §16.3 D-P1).
 */
@Injectable()
export class CodeValueRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.CodeValueWhereInput): Prisma.CodeValueWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.CodeValueUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeValue> {
    return db.codeValue.create({ data });
  }

  /** A live value of this plan and organisation (anti-IDOR), found by its own id. */
  findActiveInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeValue | null> {
    return db.codeValue.findFirst({
      where: this.active({ id, organizationId, codeType: { planId } }),
    });
  }

  /**
   * A value of this plan and organisation in either state.
   *
   * soft-delete: any-state — restore must find the deleted row it is about to reactivate.
   */
  findInPlan(
    id: string,
    planId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CodeValue | null> {
    return db.codeValue.findFirst({ where: { id, organizationId, codeType: { planId } } });
  }

  /** The live values of these types, in display order, in one query (the list's page of values). */
  findManyActiveByTypes(
    organizationId: string,
    typeIds: readonly string[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ListedCodeValue[]> {
    if (typeIds.length === 0) return Promise.resolve([]);
    return db.codeValue.findMany({
      where: this.active({ organizationId, codeTypeId: { in: [...typeIds] } }),
      select: LISTED_VALUE,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * The values of these types, live and deleted, in display order: the restore picker's read.
   *
   * soft-delete: any-state — the picker lists the deleted rows beside the live ones on purpose.
   */
  findManyAllByTypes(
    organizationId: string,
    typeIds: readonly string[],
  ): Promise<ListedCodeValue[]> {
    if (typeIds.length === 0) return Promise.resolve([]);
    return this.prisma.codeValue.findMany({
      where: { organizationId, codeTypeId: { in: [...typeIds] } },
      select: LISTED_VALUE,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * One page of a type's values in display order, live only or live and deleted. `take` includes the
   * caller's look-ahead row. Scoped by organisation and type; the caller has already proven the type
   * is a live one of the plan in the path.
   *
   * The deleted branch is the restore picker's read of ONE type, bounded by `take` (#562 bullet 2).
   * soft-delete: any-state — when `includeDeleted` is set the picker lists deleted rows on purpose.
   */
  findPageByType(params: {
    organizationId: string;
    codeTypeId: string;
    includeDeleted: boolean;
    take: number;
    cursor?: string;
  }): Promise<ListedCodeValue[]> {
    const scope = { organizationId: params.organizationId, codeTypeId: params.codeTypeId };
    return this.prisma.codeValue.findMany({
      where: params.includeDeleted ? scope : this.active(scope),
      select: LISTED_VALUE,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Whether this id is a position the page can start after: a value of the type that the same page
   * would list (live only, or either state with `includeDeleted`). Prisma answers a cursor row the
   * page's own filter excludes with an empty page, which a client would read as the end.
   *
   * soft-delete: any-state — when `includeDeleted` is set a deleted value is a valid cursor.
   */
  async existsInType(
    organizationId: string,
    codeTypeId: string,
    valueId: string,
    includeDeleted: boolean,
  ): Promise<boolean> {
    const scope = { id: valueId, organizationId, codeTypeId };
    const row = await this.prisma.codeValue.findFirst({
      where: includeDeleted ? scope : this.active(scope),
      select: { id: true },
    });
    return row !== null;
  }

  /** The number of live values of each of these types, in one grouped query. Absent = none. */
  async countActiveByTypes(
    organizationId: string,
    typeIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (typeIds.length === 0) return new Map();
    const groups = await this.prisma.codeValue.groupBy({
      by: ['codeTypeId'],
      where: this.active({ organizationId, codeTypeId: { in: [...typeIds] } }),
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.codeTypeId, g._count._all]));
  }

  /**
   * The named values of this plan and organisation, live or deleted, under live or deleted types.
   * Unknown, foreign and purged ids are simply not in the answer. One statement, not paged: the
   * caller bounds the ids.
   *
   * soft-delete: any-state — the resolve read names values the caller already holds, deleted or not.
   */
  findManyResolvedInPlan(
    organizationId: string,
    planId: string,
    ids: readonly string[],
  ): Promise<ResolvedCodeValue[]> {
    return this.prisma.codeValue.findMany({
      where: { id: { in: [...ids] }, organizationId, codeType: { planId } },
      select: { ...LISTED_VALUE, codeType: { select: { name: true, deletedAt: true } } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  /** All of a type's live values in display order, inside a transaction (the reorder's answer). */
  findManyActiveInTx(
    organizationId: string,
    codeTypeId: string,
    db: Prisma.TransactionClient,
  ): Promise<CodeValue[]> {
    return db.codeValue.findMany({
      where: this.active({ organizationId, codeTypeId }),
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  countActive(
    organizationId: string,
    codeTypeId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.codeValue.count({ where: this.active({ organizationId, codeTypeId }) });
  }

  /** The highest `position` among the type's live values, or -1 when there are none. */
  async maxActivePosition(
    organizationId: string,
    codeTypeId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.codeValue.aggregate({
      where: this.active({ organizationId, codeTypeId }),
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }

  /** Version-gated edit. Returns rows changed: 0 is a stale version or a row that has gone. */
  async updateIfVersionMatches(
    id: string,
    codeTypeId: string,
    organizationId: string,
    expectedVersion: number,
    data: { shortCode?: string; description?: string | null },
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.codeValue.updateMany({
      where: this.active({ id, codeTypeId, organizationId, version: expectedVersion }),
      data: { ...data, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Lock one live value and read its version — the check half of an opt-in versioned delete. */
  async lockActiveVersion(
    id: string,
    codeTypeId: string,
    organizationId: string,
    db: Prisma.TransactionClient,
  ): Promise<number | null> {
    const rows = await db.$queryRaw<{ version: number }[]>`
      SELECT version FROM code_values
      WHERE id = ${id}::uuid AND code_type_id = ${codeTypeId}::uuid
        AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      FOR NO KEY UPDATE
    `;
    return rows[0]?.version ?? null;
  }

  /**
   * Soft-delete one value under a FRESH batch id. Its assignments and code lanes are left as they
   * are: the activities that carry it read as having no value, and a restore brings them back
   * (database-design §8.3). Returns the batch id, or null when the row was already gone.
   */
  async softDelete(
    id: string,
    codeTypeId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<string | null> {
    const batchId = randomUUID();
    const result = await db.codeValue.updateMany({
      where: this.active({ id, codeTypeId, organizationId }),
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return result.count === 1 ? batchId : null;
  }

  /** Stamp every live value of a type into the type's delete batch; returns how many it took. */
  async softDeleteByType(
    codeTypeId: string,
    organizationId: string,
    batchId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.codeValue.updateMany({
      where: this.active({ codeTypeId, organizationId }),
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return result.count;
  }

  /** Bring one deleted value back; returns rows changed (0: it was not deleted). */
  async restore(
    id: string,
    codeTypeId: string,
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.codeValue.updateMany({
      where: { id, codeTypeId, organizationId, deletedAt: { not: null } },
      data: { deletedAt: null, deleteBatchId: null, updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * Bring back the values a type's delete took with it: exactly those stamped with its batch id, so
   * a value the planner deleted on its own before stays deleted.
   */
  async restoreByBatch(
    codeTypeId: string,
    organizationId: string,
    batchId: string,
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await db.codeValue.updateMany({
      where: { codeTypeId, organizationId, deleteBatchId: batchId, deletedAt: { not: null } },
      data: { deletedAt: null, deleteBatchId: null, updatedBy: actorId },
    });
    return result.count;
  }

  /** The type's live values, locked `FOR NO KEY UPDATE` in id order (the reorder's lock). */
  lockActiveInIdOrder(
    organizationId: string,
    codeTypeId: string,
    db: Prisma.TransactionClient,
  ): Promise<LockedCodeValue[]> {
    return db.$queryRaw<LockedCodeValue[]>`
      SELECT id, version, position FROM code_values
      WHERE code_type_id = ${codeTypeId}::uuid AND organization_id = ${organizationId}::uuid
        AND deleted_at IS NULL
      ORDER BY id
      FOR NO KEY UPDATE
    `;
  }

  /**
   * Lock the named values of this plan `FOR SHARE`, in id order, live or deleted, and say which type
   * each belongs to and whether it is deleted (or its type is). The caller holds its activity row
   * locks and the types' share locks already (database-design §15 lock order): a value's delete takes
   * `NO KEY UPDATE`, which conflicts with `FOR SHARE`, so an assignment cannot commit against a value
   * deleted a moment earlier. A value of another plan or organisation is not returned at all, so a
   * shortfall is "unknown or foreign" and the caller answers 404 without saying which.
   *
   * soft-delete: any-state — the whole question is whether the value or its type is deleted, which
   * the caller answers with the specific refusal (a deleted value is not a missing one).
   */
  lockForShare(
    organizationId: string,
    planId: string,
    ids: readonly string[],
    db: Prisma.TransactionClient,
  ): Promise<ShareLockedCodeValue[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.$queryRaw<ShareLockedCodeValue[]>`
      SELECT v.id AS id, v.code_type_id AS "codeTypeId",
             (v.deleted_at IS NOT NULL OR t.deleted_at IS NOT NULL) AS deleted
      FROM code_values v
      JOIN code_types t ON t.id = v.code_type_id
      WHERE v.id IN (SELECT u FROM unnest(${[...ids]}::uuid[]) AS u)
        AND t.plan_id = ${planId}::uuid AND t.organization_id = ${organizationId}::uuid
        AND v.organization_id = ${organizationId}::uuid
      ORDER BY v.id
      FOR SHARE OF v
    `;
  }

  /** Rewrite `position` to the given dense values in one statement; rows already there are untouched. */
  async rewritePositions(
    organizationId: string,
    codeTypeId: string,
    orderedIds: readonly string[],
    updatedBy: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...orderedIds];
    const positions = ids.map((_, index) => index);
    await db.$executeRaw`
      UPDATE code_values AS c
      SET position = v.pos, version = c.version + 1, updated_at = now(), updated_by = ${updatedBy}
      FROM unnest(${ids}::uuid[], ${positions}::int[]) AS v(id, pos)
      WHERE c.id = v.id AND c.code_type_id = ${codeTypeId}::uuid
        AND c.organization_id = ${organizationId}::uuid
        AND c.deleted_at IS NULL AND c.position <> v.pos
    `;
  }
}
