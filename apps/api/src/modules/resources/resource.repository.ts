import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Resource, type ResourceKind } from '@prisma/client';

import { archivedFilterWhere, type ArchivedFilter } from '../../common/query/library-filters';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The `?q=` term for a resource list (ADR-0053 §4 / US-8). A resource has both a `name` and an
 * optional natural-key `code`, and a planner searches by either, so this is an OR of two
 * case-insensitive `contains` — `name ILIKE '%q%' OR code ILIKE '%q%'`. Neither side is
 * btree-servable (leading wildcard), which is deliberate and bounded: the leading equality on
 * `organization_id` in the org composite confines the recheck to ONE tenant's rows in cursor
 * order. The documented, measure-first escalation is a `pg_trgm` GIN index (docs/TECH_DEBT.md).
 *
 * Nested under `AND` rather than spread at the top level so it composes with any other `OR` a
 * caller adds without either clobbering the other.
 */
function resourceSearchWhere(search: string | undefined): Prisma.ResourceWhereInput {
  if (search === undefined) return {};
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
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
  ): Promise<void> {
    await db.resource.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
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
}
