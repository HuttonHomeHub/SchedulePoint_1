import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Resource, type ResourceKind } from '@prisma/client';

import { chunkIds } from '../../common/db/id-chunks';
import {
  archivedFilterWhere,
  escapeLikePattern,
  type ArchivedFilter,
} from '../../common/query/library-filters';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The `?q=` term for a resource list (ADR-0053 §4 / US-8). A resource has both a `name` and an
 * optional natural-key `code`, and a planner searches by either, so this is an OR of two
 * case-insensitive `contains` — `name ILIKE '%q%' OR code ILIKE '%q%'`. Neither side is
 * btree-servable (leading wildcard), which is deliberate and bounded: the leading equality on
 * `organization_id` in the org composite confines the recheck to ONE tenant's rows in cursor
 * order. The documented, measure-first escalation is a `pg_trgm` GIN index (docs/TECH_DEBT.md).
 *
 * `%`/`_`/`\` in `search` are escaped first (`docs/TECH_DEBT.md` #337) so a resource literally
 * named or coded e.g. `50%` is matched by that search rather than treated as a wildcard.
 *
 * Nested under `AND` rather than spread at the top level so it composes with any other `OR` a
 * caller adds without either clobbering the other.
 */
function resourceSearchWhere(search: string | undefined): Prisma.ResourceWhereInput {
  if (search === undefined) return {};
  const pattern = escapeLikePattern(search);
  return {
    OR: [
      { name: { contains: pattern, mode: 'insensitive' } },
      { code: { contains: pattern, mode: 'insensitive' } },
    ],
  };
}

/** The scalar inputs a resource create needs (the org id is copied from the route scope). */
export interface CreateResourceInput {
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  kind: ResourceKind;
  /** Parent GROUP in the resource tree (ADR-0053 §3); null = top level. Validated in the service. */
  parentId: string | null;
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
  /** Parent GROUP in the resource tree (ADR-0053 §3); null moves the row to top level. */
  parentId?: string | null;
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
        parentId: input.parentId,
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

  /**
   * Every active resource name in the org that STARTS WITH one of `prefixes` — the import's
   * copy-name probe (ADR-0050 / ADR-0053 §5). When a planner answers a name collision with
   * "import a separate copy", the copy needs a name `uq_resources_org_name` will accept, and the
   * candidates are the base name plus an `(imported <date>)` suffix. A probe for the BASE names
   * alone would miss exactly the case that matters — the same file imported twice on the same day,
   * where the first copy already holds the first candidate — so this matches by prefix and lets the
   * caller pick the first free variant in memory.
   *
   * ARCHIVED rows are included: archiving does not free the name (ADR-0053 §4), so an archived row
   * still blocks the insert and must still be disambiguated around.
   */
  async findTakenNamesWithPrefixes(
    params: { organizationId: string; prefixes: readonly string[] },
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Set<string>> {
    if (params.prefixes.length === 0) return new Set();
    const rows = await db.resource.findMany({
      where: this.active({
        organizationId: params.organizationId,
        OR: params.prefixes.map((prefix) => ({ name: { startsWith: prefix } })),
      }),
      select: { name: true },
    });
    return new Set(rows.map((row) => row.name));
  }

  /** An active resource scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource | null> {
    return db.resource.findFirst({ where: this.active({ id, organizationId }) });
  }

  /**
   * A batch of active resources (by id set), org-scoped (anti-IDOR) — the schedule-interchange EXPORT
   * read (ADR-0050 M4a). Resolves the resources referenced by a plan's assignments in ONE query (never a
   * per-assignment findFirst); a soft-deleted resource (or one outside the org) is simply absent.
   */
  findActiveByIdsInOrg(
    ids: readonly string[],
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.resource.findMany({
      where: this.active({ id: { in: [...ids] }, organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * A page of an organisation's active resources (keyset cursor by id, org-scoped list order).
   *
   * `parentId` is the OPTIONAL resource-tree filter (ADR-0053 §3): a uuid returns that group's
   * direct children (backed by the partial `idx_resources_parent_id`), the literal `null` returns
   * only top-level rows, and OMITTING it returns the whole flat library exactly as before — the
   * behaviour-preserving default every existing client keeps getting. The distinction between
   * "omitted" and "explicitly null" is why this is `string | null | undefined` and not just
   * `string | undefined`.
   */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
    parentId?: string | null;
    kind?: ResourceKind;
    archived: ArchivedFilter;
    search?: string;
  }): Promise<Resource[]> {
    return this.prisma.resource.findMany({
      where: this.active({
        organizationId: params.organizationId,
        ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
        ...(params.kind === undefined ? {} : { kind: params.kind }),
        ...archivedFilterWhere(params.archived),
        ...resourceSearchWhere(params.search),
      }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Clear `archived_at` on a set of resources an import matched (CQ-4, ADR-0053 §4 / ADR-0050).
   * NOT version-gated, unlike {@link setArchivedIfVersionMatches}: the importer never read a
   * version to gate on, and an import must not fail because someone edited an unrelated library
   * row meanwhile. Runs inside the import's own transaction, so the unarchives and the imported
   * graph land together or not at all. The change is reported as a `repair` finding — never
   * silent.
   */
  async unarchiveManyForImport(
    params: { ids: readonly string[]; organizationId: string },
    actorId: string,
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (params.ids.length === 0) return 0;
    const { count } = await db.resource.updateMany({
      // `organizationId` is re-asserted here rather than trusted from the caller's ids: this is
      // the one archive write reached from a bulk import path, so the org filter is defence in
      // depth against a future caller passing an unfiltered id set (security review).
      where: this.active({
        id: { in: [...params.ids] },
        organizationId: params.organizationId,
        archivedAt: { not: null },
      }),
      data: { archivedAt: null, updatedBy: actorId, version: { increment: 1 } },
    });
    return count;
  }

  /**
   * A resource in ANY state, scoped to its organisation (anti-IDOR) — the first read of a restore,
   * which must find the row whether or not it is deleted. Callers branch on `deletedAt`.
   *
   * soft-delete: any-state — a restore starts from a row that is deleted by definition, and an
   * already-active one answers a no-op rather than a 404.
   */
  findAnyStateByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource | null> {
    return db.resource.findFirst({ where: { id, organizationId } });
  }

  /**
   * Every row of one deletion — the unit a restore brings back (ADR-0053 §3, ADR-0195 D1). A GROUP
   * delete stamps its whole branch with one batch id, a leaf mints its own. Org-scoped so a batch id
   * can never reach another tenant's rows. Rows already restored are excluded by the filter.
   */
  findDeletedBatchInOrg(
    batchId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource[]> {
    return db.resource.findMany({
      where: { deleteBatchId: batchId, organizationId, deletedAt: { not: null } },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * The ACTIVE resources (archived included) that already hold one of these names or codes — the
   * restore's clash pre-check, against `uq_resources_org_name` / `uq_resources_org_code`. Both
   * indexes are predicated on `deleted_at IS NULL` alone, so an archived row still holds its handle.
   * Chunked at the bind-parameter ceiling: a branch's fan-out is unbounded (`common/db/id-chunks.ts`).
   */
  async findActiveHoldingNamesOrCodes(
    params: { organizationId: string; names: readonly string[]; codes: readonly string[] },
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Pick<Resource, 'id' | 'name' | 'code' | 'archivedAt'>[]> {
    const held = new Map<string, Pick<Resource, 'id' | 'name' | 'code' | 'archivedAt'>>();
    const select = { id: true, name: true, code: true, archivedAt: true } as const;
    for (const chunk of chunkIds([...params.names])) {
      const rows = await db.resource.findMany({
        where: this.active({ organizationId: params.organizationId, name: { in: chunk } }),
        select,
      });
      for (const row of rows) held.set(row.id, row);
    }
    for (const chunk of chunkIds([...params.codes])) {
      const rows = await db.resource.findMany({
        where: this.active({ organizationId: params.organizationId, code: { in: chunk } }),
        select,
      });
      for (const row of rows) held.set(row.id, row);
    }
    return [...held.values()];
  }

  /**
   * Reactivate every row of one deletion in a single statement. `version` increments so a client
   * holding a stale copy gets a clean 409 on its next save. The archived state is untouched, so a
   * row deleted while archived comes back archived (ADR-0195 spec D7). Returns the rows restored;
   * `0` means the batch is gone.
   *
   * A row with NO batch id (the column is nullable, and nothing proves none predates the stamp) is
   * its own deletion: it is restored alone, by id, rather than by a `NULL` batch that would match
   * every such row in the organisation.
   */
  async restoreBatch(
    deletion: { id: string; batchId: string | null },
    organizationId: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.resource.updateMany({
      where:
        deletion.batchId === null
          ? { id: deletion.id, deleteBatchId: null, organizationId, deletedAt: { not: null } }
          : { deleteBatchId: deletion.batchId, organizationId, deletedAt: { not: null } },
      data: { deletedAt: null, deleteBatchId: null, updatedBy: actorId, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * The ARCHIVED resource holding this name or code in the org, if any (ADR-0053 §4). An
   * archived row deliberately keeps both: `uq_resources_org_name` / `uq_resources_org_code`
   * stay predicated on `deleted_at IS NULL` alone so that unarchive — an unguarded, lock-free,
   * version-gated UPDATE — can never fail on a handle taken meanwhile (see the M4 migration's
   * decision (1)). The accepted cost is that creating an ACTIVE resource on that name/code is a
   * 409; this lookup runs ONLY on that 409 path, to name the archived row in `details` so the
   * UI can offer "unarchive it instead" rather than a dead end.
   */
  findArchivedByNameOrCodeInOrg(
    params: { organizationId: string; name: string; code: string | null },
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Resource | null> {
    return db.resource.findFirst({
      where: this.active({
        organizationId: params.organizationId,
        archivedAt: { not: null },
        OR: [{ name: params.name }, ...(params.code === null ? [] : [{ code: params.code }])],
      }),
    });
  }

  /**
   * Set or clear `archived_at` on an active resource, gated on the optimistic `version`
   * (ADR-0053 §4, workflow W4). A metadata-only write: no advisory lock, no cascade (archiving
   * a `GROUP` deliberately does NOT archive its subtree) and no in-use guard — archiving is
   * explicitly NOT blocked by use, which is the entire point and the contrast with delete.
   * Returns rows changed; `0` means a version conflict or the row is gone → 409.
   */
  async setArchivedIfVersionMatches(
    id: string,
    expectedVersion: number,
    archivedAt: Date | null,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { count } = await db.resource.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { archivedAt, updatedBy: actorId, version: { increment: 1 } },
    });
    return count;
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
  ): Promise<string> {
    // The batch id is returned rather than discarded so the caller's audit row can name it
    // (ADR-0073 C3.3) — the same thread the group path already had to mint explicitly.
    const batchId = randomUUID();
    await db.resource.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return batchId;
  }

  /**
   * Soft-delete a WHOLE SUBTREE under ONE batch id (ADR-0053 §3) — the resource-tree analogue
   * of `HierarchyLifecycleService`'s stamp. Deleting a `GROUP` must sweep its descendants
   * together, or an active child would sit under a soft-deleted parent (the "no orphan under a
   * deleted ancestor" invariant). One shared `deleteBatchId` makes the branch the restore unit,
   * exactly like the ADR-0038 activity subtree cascade — which is why this cannot be a loop over
   * {@link softDelete} (that mints a fresh batch per row and would split the branch).
   *
   * The `deletedAt: null` guard (an `updateMany`, never `update`) makes the sweep IDEMPOTENT under
   * a concurrent delete of the same row: the racing transaction re-stamps nothing rather than
   * splitting the branch across two batches.
   */
  async softDeleteMany(
    ids: readonly string[],
    batchId: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.resource.updateMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: batchId, updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * The ids of the ACTIVE direct children of each id in `parentIds`, org-scoped (anti-IDOR).
   * One query per tree LEVEL — never per node — so the descendant BFS below stays O(depth)
   * round-trips. Backed by the partial `idx_resources_parent_id`.
   */
  async findActiveChildIdsOf(
    parentIds: readonly string[],
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    if (parentIds.length === 0) return [];
    const rows = await db.resource.findMany({
      where: this.active({ organizationId, parentId: { in: [...parentIds] } }),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Count the ACTIVE direct children of `resourceId` — the guard behind
   * `RESOURCE_GROUP_HAS_CHILDREN` (changing a `GROUP` back into an ordinary resource while it
   * still contains rows; the ADR-0038 type-change precedent). Org-scoped (anti-IDOR).
   */
  countActiveChildrenOf(
    resourceId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.resource.count({
      where: this.active({ organizationId, parentId: resourceId }),
    });
  }

  /**
   * Re-parent every ACTIVE direct child of `groupId` to `newParentId` (`null` = the top level) —
   * the write behind a group dissolve (ADR-0053 §3). One `UPDATE` by the indexed `parent_id`,
   * org-scoped (anti-IDOR). `version` increments so a client holding a stale copy of a promoted
   * child gets a clean 409 on its next save instead of silently undoing the promotion: the edit
   * form sends `parentId` on every save, so a form left open would otherwise put the child back
   * under a group that no longer exists. Archived children move too and stay archived.
   *
   * Callers MUST hold the org resource-tree lock; the destination is only a valid parent because
   * nothing can re-shape the tree between reading it and this write.
   */
  async promoteChildren(
    groupId: string,
    organizationId: string,
    newParentId: string | null,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.resource.updateMany({
      where: this.active({ organizationId, parentId: groupId }),
      data: { parentId: newParentId, updatedBy: actorId, version: { increment: 1 } },
    });
    return result.count;
  }

  /**
   * The promoted rows at their NEW parent and version, in id order — what a dissolve returns, since
   * `updateMany` reports only a count and the caller cannot derive the versions. Chunked: a group's
   * fan-out is unbounded and Prisma refuses an `in` list past the bind-variable ceiling
   * (`common/db/id-chunks.ts`). Chunks are consecutive slices of an id-sorted list, so concatenating
   * them keeps the global id order.
   */
  async findPromotedByIds(
    ids: readonly string[],
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; parentId: string | null; version: number }[]> {
    const rows: { id: string; parentId: string | null; version: number }[] = [];
    for (const chunk of chunkIds([...ids].sort())) {
      rows.push(
        ...(await db.resource.findMany({
          where: this.active({ organizationId, id: { in: chunk } }),
          select: { id: true, parentId: true, version: true },
          orderBy: { id: 'asc' },
        })),
      );
    }
    return rows;
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
   * Count the ACTIVE assignments referencing ANY resource in `resourceIds` — the SUBTREE
   * RESOURCE_IN_USE guard for a `GROUP` delete (ADR-0053 §3). A group whose descendants are
   * still assigned cannot be deleted, and the 409 carries the whole-subtree count so the message
   * is honest ("3 resources in this group are still assigned"), not just the root's zero.
   */
  countActiveAssignmentsUsingAny(
    resourceIds: readonly string[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    if (resourceIds.length === 0) return Promise.resolve(0);
    return db.resourceAssignment.count({
      where: { resourceId: { in: [...resourceIds] }, deletedAt: null },
    });
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

  /**
   * Resources using `calendarId` in ANY state — the narrowing guard's resource half. A binned
   * resource keeps `resources.calendar_id` (`ON DELETE RESTRICT`), so narrowing the calendar to
   * one project would strand it and the target project's expiry could never delete the calendar
   * (`docs/TECH_DEBT.md` #530). Deleting a calendar uses the active count above instead: a
   * soft delete trips no foreign key.
   *
   * soft-delete: any-state — a deleted resource still holds the foreign key the expiry would trip on.
   */
  countResourcesUsingCalendarAnyState(
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.resource.count({ where: { calendarId } });
  }

  /**
   * The ACTIVE plans with an active assignment of ANY of `resourceIds` — the set a restore stamps
   * "edited since calculated". Expected to be empty (a delete is refused while any assignment
   * references the resource), which is why this is defence in depth and not a branch anyone
   * exercises. One `= ANY(array)` bind, so a large branch cannot hit the parameter ceiling.
   */
  async findActivePlanIdsAssigningAny(
    resourceIds: readonly string[],
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    if (resourceIds.length === 0) return [];
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.plan_id AS id
      FROM resource_assignments ra
      JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
      JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
      WHERE ra.organization_id = ${organizationId}::uuid
        AND ra.resource_id = ANY(${[...resourceIds]}::uuid[])
        AND ra.deleted_at IS NULL
    `;
    return rows.map((row) => row.id);
  }

  /**
   * The ACTIVE plans with an active assignment of `resourceId` — the set a resource edit stamps
   * "edited since calculated" (`docs/TECH_DEBT.md` #449). `levellingOnly` narrows it to plans with
   * `level_resources` on, because the capacity ceiling is read only by levelling (ADR-0041 §2); the
   * resource's calendar, by contrast, moves dates in every plan that uses it. Organisation-scoped.
   */
  async findActivePlanIdsAssigning(
    resourceId: string,
    organizationId: string,
    levellingOnly: boolean,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.plan_id AS id
      FROM resource_assignments ra
      JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
      JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
      WHERE ra.organization_id = ${organizationId}::uuid
        AND ra.resource_id = ${resourceId}::uuid
        AND ra.deleted_at IS NULL
        ${levellingOnly ? Prisma.sql`AND p.level_resources` : Prisma.empty}
    `;
    return rows.map((row) => row.id);
  }
}
