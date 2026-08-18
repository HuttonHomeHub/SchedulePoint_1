import { Injectable } from '@nestjs/common';
import type { DeletedItemBlocker } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/** The three hierarchy levels a deleted row can belong to. */
export type DeletedKind = 'client' | 'project' | 'plan';

/** A soft-deleted row, with enough context to order and restore it. */
export interface DeletedRow {
  kind: DeletedKind;
  id: string;
  name: string;
  deletedAt: Date;
  /** True when the row's parent is active (or it is a client) — i.e. restorable now. */
  parentActive: boolean;
  /** The cascade this row was stamped by; the unit a restore actually operates on (ADR-0096). */
  deleteBatchId: string | null;
  /** The still-deleted ancestor, or null. Per row — see `DeletedHierarchyItem.blockedBy`. */
  blockedBy: DeletedItemBlocker | null;
}

/** Keyset position in the merged deleted stream: `(deletedAt, id)`. */
export interface DeletedCursor {
  deletedAt: Date;
  id: string;
}

/** The union query's row shape, before it is narrowed to {@link DeletedRow}. */
interface DeletedUnionRow {
  kind: string;
  id: string;
  name: string;
  deleted_at: Date;
  parent_active: boolean;
  delete_batch_id: string | null;
  /**
   * The blocking ancestor, flattened across the union because the three branches have different
   * parents (none, a client, a project) and a `UNION ALL` needs one column list. `blocker_kind` is
   * non-null exactly when the parent is deleted, so it alone decides whether the other three mean
   * anything — which is why the mapping reads it and not the others.
   */
  blocker_kind: string | null;
  blocker_id: string | null;
  blocker_name: string | null;
  blocker_batch_id: string | null;
}

/**
 * Data-access for the recycle bin. Reads soft-deleted rows across all three
 * hierarchy tables. The ordering `(deletedAt desc, id asc)` is a total order over
 * the union (ids are globally-unique uuids), and — because a cascade stamps a
 * whole batch with one `deletedAt` — the id tiebreaker keeps a batch grouped and
 * safe to keyset-page.
 *
 * One `UNION ALL` does the merge in the database and returns exactly `take` rows.
 * It replaces three `findMany`s each taking their own top `take` for the service
 * to merge-sort and slice: correct, but it read `3 × take` rows to return `take`
 * (TECH_DEBT #22), and the recycle-bin screen follows every cursor to the end, so
 * the waste multiplied by the number of pages rather than being paid once.
 *
 * `parent_active` — whether the row can be restored right now — is the join the
 * merge previously did per-table: a client's parent is its always-active
 * organisation, a project's is its client, a plan's is its project. Deliberately
 * NO new indexes: deleted rows are a small minority of each table and nobody has
 * profiled this screen, so a supporting `(organization_id, deleted_at DESC, id)
 * WHERE deleted_at IS NOT NULL` index stays the measure-first escalation, not a
 * guess shipped alongside a refactor.
 */
@Injectable()
export class RecycleBinRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDeletedPage(params: {
    organizationId: string;
    take: number;
    cursor?: DeletedCursor;
  }): Promise<DeletedRow[]> {
    const { organizationId, take, cursor } = params;
    // Rows strictly after the cursor in `(deleted_at desc, id asc)` order. A null
    // cursor is the first page, so every deleted row qualifies. Interpolations are
    // Prisma parameters, never string-built SQL (SECURITY_STANDARDS.md).
    const cursorAt = cursor?.deletedAt ?? null;
    const cursorId = cursor?.id ?? null;

    const rows = await this.prisma.$queryRaw<DeletedUnionRow[]>`
      SELECT 'client' AS kind, c.id, c.name, c.deleted_at, true AS parent_active,
             c.delete_batch_id,
             NULL::text AS blocker_kind, NULL::uuid AS blocker_id,
             NULL::text AS blocker_name, NULL::uuid AS blocker_batch_id
        FROM clients c
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.deleted_at IS NOT NULL
         AND (
           ${cursorAt}::timestamptz IS NULL
           OR c.deleted_at < ${cursorAt}::timestamptz
           OR (c.deleted_at = ${cursorAt}::timestamptz AND c.id > ${cursorId}::uuid)
         )
      UNION ALL
      SELECT 'project' AS kind, p.id, p.name, p.deleted_at, (cl.deleted_at IS NULL) AS parent_active,
             p.delete_batch_id,
             CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE 'client' END AS blocker_kind,
             CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.id END AS blocker_id,
             CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.name END AS blocker_name,
             CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.delete_batch_id END AS blocker_batch_id
        FROM projects p
        JOIN clients cl ON cl.id = p.client_id
       WHERE p.organization_id = ${organizationId}::uuid
         AND p.deleted_at IS NOT NULL
         AND (
           ${cursorAt}::timestamptz IS NULL
           OR p.deleted_at < ${cursorAt}::timestamptz
           OR (p.deleted_at = ${cursorAt}::timestamptz AND p.id > ${cursorId}::uuid)
         )
      UNION ALL
      SELECT 'plan' AS kind, pl.id, pl.name, pl.deleted_at, (pr.deleted_at IS NULL) AS parent_active,
             pl.delete_batch_id,
             CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE 'project' END AS blocker_kind,
             CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.id END AS blocker_id,
             CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.name END AS blocker_name,
             CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.delete_batch_id END AS blocker_batch_id
        FROM plans pl
        JOIN projects pr ON pr.id = pl.project_id
       WHERE pl.organization_id = ${organizationId}::uuid
         AND pl.deleted_at IS NOT NULL
         AND (
           ${cursorAt}::timestamptz IS NULL
           OR pl.deleted_at < ${cursorAt}::timestamptz
           OR (pl.deleted_at = ${cursorAt}::timestamptz AND pl.id > ${cursorId}::uuid)
         )
      ORDER BY deleted_at DESC, id ASC
      LIMIT ${take}
    `;

    return rows.map((row) => ({
      kind: row.kind as DeletedKind,
      id: row.id,
      name: row.name,
      deletedAt: row.deleted_at,
      parentActive: row.parent_active,
      deleteBatchId: row.delete_batch_id,
      // Built from the SAME join `parent_active` already reads (ADR-0096) — the blocker costs
      // columns, not a second query, so there is no N+1 here however long the page is.
      // `blocker_kind` is non-null exactly when the parent is deleted, so one field decides all four.
      blockedBy:
        row.blocker_kind === null
          ? null
          : {
              kind: row.blocker_kind as 'client' | 'project',
              id: row.blocker_id!,
              name: row.blocker_name!,
              deleteBatchId: row.blocker_batch_id,
            },
    }));
  }
}
