import { Injectable } from '@nestjs/common';
import type { DeletedItem, DeletedItemBlocker } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/** What a deleted row is: a hierarchy level, or one of the two libraries (ADR-0195). */
export type DeletedKind = DeletedItem['kind'];

/** A soft-deleted row, with enough context to order and restore it. */
export interface DeletedRow {
  kind: DeletedKind;
  id: string;
  name: string;
  deletedAt: Date;
  /** True when nothing blocks the restore: no deleted parent, and no deleted calendar. */
  parentActive: boolean;
  /** The cascade this row was stamped by; the unit a restore actually operates on (ADR-0096). */
  deleteBatchId: string | null;
  /** The still-deleted parent or dependency, or null. Per row — see `DeletedItem.blockedBy`. */
  blockedBy: DeletedItemBlocker | null;
  /** Resource kind or calendar scope, for display; null for the hierarchy (ADR-0195). */
  subtype: DeletedItem['subtype'];
  /**
   * The instant the retention period is counted from, or null when no timer ever removes this row:
   * the row's own `deleted_at` for a client, project or plan; the PROJECT's for a project-scoped
   * calendar whose project is deleted; null for a resource and an ORG calendar (ADR-0195 D4). The
   * service adds the period, so the period is read from config in one place.
   */
  expiryBasis: Date | null;
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
   * The blocker, flattened across the union because the five branches have different parents and a
   * `UNION ALL` needs one column list. `blocker_kind` is non-null exactly when something blocks, so
   * it alone decides whether the other columns mean anything — which is why the mapping reads it.
   */
  blocker_kind: string | null;
  blocker_relation: string | null;
  blocker_id: string | null;
  blocker_name: string | null;
  blocker_batch_id: string | null;
  subtype: string | null;
  expiry_basis: Date | null;
}

/**
 * Data-access for the recycle bin. Reads soft-deleted rows across the three hierarchy tables and
 * the two libraries (ADR-0195). The ordering `(deletedAt desc, id asc)` is a total order over the
 * union (ids are globally-unique uuids), and — because a cascade stamps a whole batch with one
 * `deletedAt` — the id tiebreaker keeps a batch grouped and safe to keyset-page.
 *
 * One `UNION ALL` does the merge in the database and returns exactly `take` rows. It replaces
 * per-table `findMany`s each taking their own top `take` for the service to merge-sort and slice
 * (TECH_DEBT #22), and the recycle-bin screen follows every cursor to the end, so the waste would
 * multiply by the number of pages rather than being paid once.
 *
 * **A blocker is a parent OR a dependency, parent first** (ADR-0195 D3). The parent is read from
 * the same join that decides `parent_active`, so it costs columns, not a query. The dependency — a
 * resource batch's first deleted calendar — needs a lookup over the whole batch, so it runs AFTER
 * the page is cut, for the page's own resources only, and only for a row with no deleted parent
 * (the group's root). A member of a group never pays for it, and it cannot grow with the bin.
 *
 * Deliberately NO new indexes: a supporting `(organization_id, deleted_at DESC, id) WHERE
 * deleted_at IS NOT NULL` index stays the measure-first escalation (ADR-0096 D6, ADR-0195), and it
 * goes through the database-architect agent if a reading ever asks for it.
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

    // soft-delete: any-state — the bin lists deleted rows on purpose (`deleted_at IS NOT NULL`), and
    // its joins to a parent client, project or resource group, and its lookup of a batch's
    // calendars, read that row's own state to say whether it blocks the restore; filtering any of
    // them would hide exactly the blocker the row reports.
    const rows = await this.prisma.$queryRaw<DeletedUnionRow[]>`
      WITH page AS (
        SELECT 'client' AS kind, c.id, c.name, c.deleted_at, true AS parent_active,
               c.delete_batch_id,
               NULL::text AS blocker_kind, NULL::text AS blocker_relation, NULL::uuid AS blocker_id,
               NULL::text AS blocker_name, NULL::uuid AS blocker_batch_id,
               NULL::text AS subtype, c.deleted_at AS expiry_basis
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
               CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE 'parent' END AS blocker_relation,
               CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.id END AS blocker_id,
               CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.name END AS blocker_name,
               CASE WHEN cl.deleted_at IS NULL THEN NULL ELSE cl.delete_batch_id END AS blocker_batch_id,
               NULL::text AS subtype, p.deleted_at AS expiry_basis
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
               CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE 'parent' END AS blocker_relation,
               CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.id END AS blocker_id,
               CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.name END AS blocker_name,
               CASE WHEN pr.deleted_at IS NULL THEN NULL ELSE pr.delete_batch_id END AS blocker_batch_id,
               NULL::text AS subtype, pl.deleted_at AS expiry_basis
          FROM plans pl
          JOIN projects pr ON pr.id = pl.project_id
         WHERE pl.organization_id = ${organizationId}::uuid
           AND pl.deleted_at IS NOT NULL
           AND (
             ${cursorAt}::timestamptz IS NULL
             OR pl.deleted_at < ${cursorAt}::timestamptz
             OR (pl.deleted_at = ${cursorAt}::timestamptz AND pl.id > ${cursorId}::uuid)
           )
        UNION ALL
        SELECT 'resource' AS kind, rs.id, rs.name, rs.deleted_at,
               (rp.id IS NULL OR rp.deleted_at IS NULL) AS parent_active,
               rs.delete_batch_id,
               CASE WHEN rp.deleted_at IS NULL THEN NULL ELSE 'resource' END AS blocker_kind,
               CASE WHEN rp.deleted_at IS NULL THEN NULL ELSE 'parent' END AS blocker_relation,
               CASE WHEN rp.deleted_at IS NULL THEN NULL ELSE rp.id END AS blocker_id,
               CASE WHEN rp.deleted_at IS NULL THEN NULL ELSE rp.name END AS blocker_name,
               CASE WHEN rp.deleted_at IS NULL THEN NULL ELSE rp.delete_batch_id END AS blocker_batch_id,
               rs.kind::text AS subtype, NULL::timestamptz AS expiry_basis
          FROM resources rs
          LEFT JOIN resources rp ON rp.id = rs.parent_id AND rp.organization_id = rs.organization_id
         WHERE rs.organization_id = ${organizationId}::uuid
           AND rs.deleted_at IS NOT NULL
           AND (
             ${cursorAt}::timestamptz IS NULL
             OR rs.deleted_at < ${cursorAt}::timestamptz
             OR (rs.deleted_at = ${cursorAt}::timestamptz AND rs.id > ${cursorId}::uuid)
           )
        UNION ALL
        SELECT 'calendar' AS kind, ca.id, ca.name, ca.deleted_at,
               (pj.id IS NULL OR pj.deleted_at IS NULL) AS parent_active,
               ca.delete_batch_id,
               CASE WHEN pj.deleted_at IS NULL THEN NULL ELSE 'project' END AS blocker_kind,
               CASE WHEN pj.deleted_at IS NULL THEN NULL ELSE 'parent' END AS blocker_relation,
               CASE WHEN pj.deleted_at IS NULL THEN NULL ELSE pj.id END AS blocker_id,
               CASE WHEN pj.deleted_at IS NULL THEN NULL ELSE pj.name END AS blocker_name,
               CASE WHEN pj.deleted_at IS NULL THEN NULL ELSE pj.delete_batch_id END AS blocker_batch_id,
               ca.scope::text AS subtype, pj.deleted_at AS expiry_basis
          FROM calendars ca
          LEFT JOIN projects pj ON pj.id = ca.project_id AND pj.organization_id = ca.organization_id
         WHERE ca.organization_id = ${organizationId}::uuid
           AND ca.deleted_at IS NOT NULL
           AND (
             ${cursorAt}::timestamptz IS NULL
             OR ca.deleted_at < ${cursorAt}::timestamptz
             OR (ca.deleted_at = ${cursorAt}::timestamptz AND ca.id > ${cursorId}::uuid)
           )
        ORDER BY deleted_at DESC, id ASC
        LIMIT ${take}
      )
      SELECT pg.kind, pg.id, pg.name, pg.deleted_at,
             (pg.parent_active AND cb.id IS NULL) AS parent_active,
             pg.delete_batch_id,
             COALESCE(pg.blocker_kind, CASE WHEN cb.id IS NULL THEN NULL ELSE 'calendar' END) AS blocker_kind,
             COALESCE(pg.blocker_relation, CASE WHEN cb.id IS NULL THEN NULL ELSE 'calendar' END) AS blocker_relation,
             COALESCE(pg.blocker_id, cb.id) AS blocker_id,
             COALESCE(pg.blocker_name, cb.name) AS blocker_name,
             COALESCE(pg.blocker_batch_id, cb.delete_batch_id) AS blocker_batch_id,
             pg.subtype, pg.expiry_basis
        FROM page pg
        LEFT JOIN LATERAL (
          SELECT rc.id, rc.name, rc.delete_batch_id
            FROM resources rm
            JOIN calendars rc ON rc.id = rm.calendar_id AND rc.organization_id = rm.organization_id
           WHERE rm.delete_batch_id = pg.delete_batch_id
             AND rm.organization_id = ${organizationId}::uuid
             AND rm.deleted_at IS NOT NULL
             AND rc.deleted_at IS NOT NULL
           ORDER BY rc.id
           LIMIT 1
        ) cb ON pg.kind = 'resource' AND pg.blocker_kind IS NULL AND pg.delete_batch_id IS NOT NULL
       ORDER BY pg.deleted_at DESC, pg.id ASC
    `;

    return rows.map((row) => ({
      kind: row.kind as DeletedKind,
      id: row.id,
      name: row.name,
      deletedAt: row.deleted_at,
      parentActive: row.parent_active,
      deleteBatchId: row.delete_batch_id,
      // `blocker_kind` is non-null exactly when something blocks, so one field decides all five.
      blockedBy:
        row.blocker_kind === null
          ? null
          : {
              kind: row.blocker_kind as DeletedItemBlocker['kind'],
              relation: row.blocker_relation as DeletedItemBlocker['relation'],
              id: row.blocker_id!,
              name: row.blocker_name!,
              deleteBatchId: row.blocker_batch_id,
            },
      subtype: row.subtype as DeletedRow['subtype'],
      expiryBasis: row.expiry_basis,
    }));
  }
}
