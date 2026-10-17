import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Resource, type ResourceKind } from '@prisma/client';
import {
  LIBRARY_RESTORE_REASON,
  RESOURCE_ERROR,
  type DissolveResourceGroupResult,
  type LibraryRestoreConflict,
  type PageMeta,
} from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import { acquireResourceWriteLocks } from '../../common/db/resource-advisory-lock';
import { acquireResourceTreeWriteLock } from '../../common/db/resource-tree-advisory-lock';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { normaliseSearchTerm, type ArchivedFilter } from '../../common/query/library-filters';
import { markScheduleInputsChanged } from '../../common/schedule-inputs/mark-schedule-inputs-changed';
import { PrismaService } from '../../prisma/prisma.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { assertCalendarUsableBy } from '../calendars/calendar-scope.guard';
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';

import type { CreateResourceDto } from './dto/create-resource.dto';
import type { UpdateResourceDto } from './dto/update-resource.dto';
import { assertValidResourceParent, resolveActiveSubtreeIds } from './resource-tree.guard';
import { ResourceRepository, type ResourcePatch } from './resource.repository';

/** Machine-readable conflict reasons carried in a {@link ConflictError}'s `details` (ADR-0039). */
export const RESOURCE_CONFLICT = {
  /** A resource name/code collides with an active resource in the same org. */
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  /** Deleting a resource still assigned to an active activity (a GROUP: anywhere in its subtree). */
  RESOURCE_IN_USE: 'RESOURCE_IN_USE',
  /** Turning a `GROUP` back into an ordinary resource while it still contains rows (ADR-0053 §3). */
  RESOURCE_GROUP_HAS_CHILDREN: 'RESOURCE_GROUP_HAS_CHILDREN',
} as const;

/**
 * PostgreSQL's `check_violation` SQLSTATE. The DB CHECKs behind the resource tree
 * (`ck_resources_parent_not_self`, `ck_resources_group_no_scheduling_fields`) are the LAST line of
 * defence behind the service rejects below; if one ever fires it means a service guard was
 * bypassed, and it should degrade to an honest 422 rather than an opaque 500.
 */
const PG_CHECK_VIOLATION = '23514';

/**
 * How many clashing holders a refused restore names. A branch of thousands could clash on many
 * names; the first few are what a person acts on, and `total` says how many there were.
 */
const MAX_NAMED_CONFLICTS = 5;

/** The height of a deleted branch, in nodes, from the rows themselves (a leaf is 1). */
function batchHeight(rows: readonly Resource[], rootId: string): number {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const siblings = childrenOf.get(row.parentId) ?? [];
    siblings.push(row.id);
    childrenOf.set(row.parentId, siblings);
  }
  let height = 1;
  let frontier = [rootId];
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    const next = frontier.flatMap((id) => childrenOf.get(id) ?? []).filter((id) => !seen.has(id));
    for (const id of next) seen.add(id);
    if (next.length > 0) height += 1;
    frontier = next;
  }
  return height;
}

/**
 * Business logic for the org-scoped resource library (ADR-0039). A near-clone of
 * {@link CalendarsService} but simpler (no shift/window materialisation). Every action
 * re-resolves the org scope from the caller's own memberships (anti-IDOR) and pairs it
 * with a permission check; all loads filter by the resolved `organization_id`. On
 * create/update a non-null `calendarId` is validated as an ACTIVE calendar in the SAME
 * org (the FK does not scope to org — ADR-0037/0039 invariant (a)) under the shared
 * calendar advisory lock. Delete enforces the RESOURCE_IN_USE guard (invariant (c)):
 * a resource assigned to an active activity cannot be soft-deleted.
 */
@Injectable()
export class ResourcesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly resources: ResourceRepository,
    private readonly calendars: CalendarRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(ResourcesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: {
      limit: number;
      cursor?: string;
      parentId?: string | null;
      kind?: ResourceKind;
      archived?: ArchivedFilter;
      q?: string;
    },
  ): Promise<{ items: Resource[]; meta: PageMeta; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);
    // Org-scoped cost:read (EV4a, ADR-0042) on the SAME resolved org — never `canAnywhere` (that would
    // be a cross-tenant IDOR). Threaded to the response DTO so the money `costPerUnit` is gated per role.
    const canReadCost = principal.can('cost:read', organization.id);

    const search = normaliseSearchTerm(query.q);
    const rows = await this.resources.findManyActiveByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      // Tree filter (ADR-0053 §3). Omitted ⇒ the whole flat library, byte-identical to before.
      ...(query.parentId === undefined ? {} : { parentId: query.parentId }),
      // Kind + search + archive filters (ADR-0053 §4 / US-8). `archived` defaults to `exclude`,
      // which is today's result set (nothing is archived until someone archives it), so a client
      // that sends none of these still sees exactly what it saw before.
      ...(query.kind === undefined ? {} : { kind: query.kind }),
      archived: query.archived ?? 'exclude',
      ...(search === undefined ? {} : { search }),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore }, canReadCost };
  }

  async get(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
  ): Promise<{ resource: Resource; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const resource = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!resource) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    return { resource, canReadCost };
  }

  async create(
    principal: Principal,
    orgSlug: string,
    dto: CreateResourceDto,
  ): Promise<{ resource: Resource; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:create', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const calendarId = dto.calendarId ?? null;
    const parentId = dto.parentId ?? null;
    // A GROUP is a pure grouping node (ADR-0053 §3): no calendar, no capacity ceiling, no cost
    // rate. Rejected here as a clean 422 so the same-row CHECK behind it never has to fire.
    this.assertGroupHasNoSchedulingFields(dto.kind, {
      calendarId,
      maxUnitsPerHour: dto.maxUnitsPerHour ?? null,
      costPerUnit: dto.costPerUnit ?? null,
    });

    try {
      const resource = await this.prisma.$transaction(async (tx) => {
        // Tree-shape write ⇒ the ORG-scoped tree lock, taken FIRST (see the documented lock order
        // on `remove`). Only taken when a parent is actually requested, so the ordinary
        // "create a top-level resource" path keeps today's lock profile exactly.
        if (parentId !== null) {
          await acquireResourceTreeWriteLock(tx, organization.id);
          await assertValidResourceParent(tx, this.resources, {
            parentId,
            organizationId: organization.id,
            selfId: null,
          });
        }
        // A specific calendar must be active + in-org (invariant (a)) AND org-GLOBAL: the
        // resource pool is deliberately unfragmented (ADR-0039), so an org-global resource may
        // only hold an org-global calendar. Passing `projectId: null` to THE shared guard is
        // exactly that statement — it hard-rejects ANY project-scoped calendar with 422
        // RESOURCE_REQUIRES_ORG_CALENDAR (ADR-0053 §2). Runs under the calendar advisory lock
        // before the insert, serialised with the delete-in-use guard.
        if (calendarId !== null) {
          await assertCalendarUsableBy(tx, this.calendars, {
            calendarId,
            organizationId: organization.id,
            projectId: null,
            // A brand-new resource holds no calendar yet — any archived calendar is a new binding.
            currentCalendarId: null,
          });
        }
        return this.resources.create(
          {
            organizationId: organization.id,
            name: dto.name,
            code: dto.code ?? null,
            description: dto.description ?? null,
            kind: dto.kind,
            // Resource-tree position (ADR-0053 §3); null = top level. Validated above under the lock.
            parentId,
            calendarId,
            // Capacity ceiling (ADR-0041 §2); null/omitted = uncapped. Client-settable; dark until L2.
            maxUnitsPerHour: dto.maxUnitsPerHour ?? null,
            // Cost rate (EV1, ADR-0042); null/omitted = no cost. Client-settable; dark until the EV read.
            costPerUnit: dto.costPerUnit ?? null,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      });
      this.logger.info(
        { organizationId: organization.id, resourceId: resource.id, userId: principal.userId },
        'resource created',
      );
      return { resource, canReadCost };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw await this.duplicateResourceError(organization.id, dto.name, dto.code ?? null);
      }
      throw this.mapCheckViolation(error);
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<{ resource: Resource; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:update', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const existing = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    const patch: ResourcePatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code === '' ? null : dto.code;
    if (dto.description !== undefined) {
      patch.description = dto.description === '' ? null : dto.description;
    }
    if (dto.kind !== undefined) patch.kind = dto.kind;
    // Capacity ceiling (ADR-0041 §2): client-settable; null clears to uncapped. Dark until L2.
    if (dto.maxUnitsPerHour !== undefined) patch.maxUnitsPerHour = dto.maxUnitsPerHour;
    // Cost rate (EV1, ADR-0042): client-settable; null clears to no cost. Dark until the EV read.
    if (dto.costPerUnit !== undefined) patch.costPerUnit = dto.costPerUnit;
    // The resource's own calendar: null clears to inherit the plan default; a specific id
    // is validated in-org under the calendar lock inside the transaction below.
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;

    // The POST-PATCH shape of the row, which is what the GROUP rule must be judged against: a
    // field the client did not send keeps its stored value, so clearing `kind` to GROUP while a
    // stored calendar/ceiling/rate survives is exactly the case to reject (and the case the DB
    // CHECK would otherwise catch as a 500).
    const effectiveKind = dto.kind ?? existing.kind;
    this.assertGroupHasNoSchedulingFields(effectiveKind, {
      calendarId: calendarId === undefined ? existing.calendarId : calendarId,
      maxUnitsPerHour:
        dto.maxUnitsPerHour === undefined
          ? (existing.maxUnitsPerHour?.toNumber() ?? null)
          : dto.maxUnitsPerHour,
      costPerUnit:
        dto.costPerUnit === undefined
          ? (existing.costPerUnit?.toNumber() ?? null)
          : dto.costPerUnit,
    });

    // A parent-CHANGING write (including an explicit `null` that promotes a row to top level) and
    // a kind change to/from GROUP both reshape the tree, so both take the org-scoped tree lock.
    const reparenting = dto.parentId !== undefined;
    const kindTouchesGroup =
      dto.kind !== undefined && (dto.kind === 'GROUP' || existing.kind === 'GROUP');
    if (dto.parentId !== undefined) patch.parentId = dto.parentId;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (reparenting || kindTouchesGroup) {
          await acquireResourceTreeWriteLock(tx, organization.id);
        }
        // Becoming a GROUP: a group can never be an assignment endpoint, so an already-assigned
        // resource may not be converted (409 RESOURCE_IN_USE — the same guard the delete uses).
        if (dto.kind === 'GROUP' && existing.kind !== 'GROUP') {
          const inUse = await this.resources.countActiveAssignmentsUsing(resourceId, tx);
          if (inUse > 0) {
            throw new ConflictError(RESOURCE_ERROR.RESOURCE_IN_USE, {
              reason: RESOURCE_CONFLICT.RESOURCE_IN_USE,
              count: inUse,
            });
          }
        }
        // Ceasing to be a GROUP: only a GROUP may be a parent, so the children would be orphaned
        // under a non-group. Reparent them first (the ADR-0038 type-change precedent).
        if (existing.kind === 'GROUP' && dto.kind !== undefined && dto.kind !== 'GROUP') {
          const children = await this.resources.countActiveChildrenOf(
            resourceId,
            organization.id,
            tx,
          );
          if (children > 0) {
            throw new ConflictError(RESOURCE_ERROR.RESOURCE_GROUP_HAS_CHILDREN, {
              reason: RESOURCE_CONFLICT.RESOURCE_GROUP_HAS_CHILDREN,
              count: children,
            });
          }
        }
        // Nesting under a group: acyclic, same-org, GROUP parent, depth-capped — all under the
        // lock taken above, so a concurrent mirror reparent cannot slip a cycle past two walks.
        if (dto.parentId !== undefined && dto.parentId !== null) {
          await assertValidResourceParent(tx, this.resources, {
            parentId: dto.parentId,
            organizationId: organization.id,
            selfId: resourceId,
          });
        }
        if (calendarId !== undefined && calendarId !== null) {
          // Same org-global-only rule as create (ADR-0053 §2): `projectId: null` rejects any
          // project-scoped calendar.
          await assertCalendarUsableBy(tx, this.calendars, {
            calendarId,
            organizationId: organization.id,
            projectId: null,
            // The resource's CURRENT calendar: re-submitting it is not a new binding, so a
            // resource already on an archived calendar stays editable (ADR-0053 §4).
            currentCalendarId: existing.calendarId,
          });
          patch.calendarId = calendarId;
        }
        const changed = await this.resources.updateIfVersionMatches(
          resourceId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This resource was changed elsewhere. Refresh and try again.');
        }
        // The two fields the engine reads (`schedule.repository.ts`, the resource select), compared by VALUE so a form that
        // resends what is stored stamps nothing. A calendar change re-dates every plan that uses the
        // resource; the capacity ceiling is read only by levelling, so it stamps only those plans
        // (#449). Last, after the write, as the helper's contract asks.
        const calendarMoved = calendarId !== undefined && calendarId !== existing.calendarId;
        const ceilingMoved =
          dto.maxUnitsPerHour !== undefined &&
          dto.maxUnitsPerHour !== (existing.maxUnitsPerHour?.toNumber() ?? null);
        if (calendarMoved || ceilingMoved) {
          await markScheduleInputsChanged(
            tx,
            organization.id,
            await this.resources.findActivePlanIdsAssigning(
              resourceId,
              organization.id,
              !calendarMoved,
              tx,
            ),
          );
        }
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw await this.duplicateResourceError(
          organization.id,
          dto.name ?? existing.name,
          dto.code === undefined ? existing.code : dto.code,
        );
      }
      throw this.mapCheckViolation(error);
    }

    const updated = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!updated) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    return { resource: updated, canReadCost };
  }

  /**
   * Archive or unarchive a resource (ADR-0053 §4, workflow W4) — a version-gated,
   * metadata-only `UPDATE archived_at`. There is deliberately **no** lock, **no** cascade and
   * **no** in-use guard:
   *
   * - **Not blocked by use.** Archiving a resource that is assigned — even one that is the
   *   DRIVING resource of a live activity — succeeds. That is the entire point and the
   *   contrast with delete: every existing assignment stays live and keeps scheduling,
   *   levelling, loading the histogram and earning value byte-identically. Only a NEW
   *   assignment is refused (422 `RESOURCE_ARCHIVED`).
   * - **No subtree cascade.** Archiving a `GROUP` does not archive its children; archive has
   *   no cascade (unlike the `GROUP` delete, which soft-deletes its subtree under one batch).
   *   An archived group with active children is legal, and the tree badges the group alone.
   *
   * Authorisation is `resource:update` — the same capability as any other resource edit; there
   * is no shared-tier distinction here because the pool is deliberately one org-global pool.
   */
  async setArchived(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    archived: boolean,
    version: number,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:update', organization.id);

    const existing = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    // A transaction ONLY so the audit row shares the write's fate (ADR-0073 family F). The
    // archive itself still takes no lock, no cascade and no in-use count — that is ADR-0053 §4's
    // whole point, and this adds an insert beside the update rather than a guard around it.
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.resources.setArchivedIfVersionMatches(
        resourceId,
        version,
        archived ? new Date() : null,
        principal.userId,
        tx,
      );
      if (changed === 0) {
        throw new ConflictError('This resource was changed elsewhere. Refresh and try again.');
      }
      // Archiving is orthogonal to deleting: every existing assignment stays live and levels
      // identically, and only a NEW assignment is refused. Nothing breaks and nobody is told,
      // which is why the log is the only place the change is recoverable from.
      await this.audit.record(
        {
          action: archived ? 'resource.archived' : 'resource.unarchived',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'RESOURCE',
          subjectId: resourceId,
          subjectLabel: existing.name,
          after: { name: existing.name, kind: existing.kind },
          ...auditActor(principal, context),
        },
        tx,
      );
    });

    this.logger.info(
      {
        organizationId: organization.id,
        resourceId,
        kind: existing.kind,
        archived,
        userId: principal.userId,
      },
      archived ? 'resource archived' : 'resource unarchived',
    );
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:delete', organization.id);

    const existing = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    // A GROUP delete is a tree-SHAPE change: it sweeps a whole branch, so it must also hold the
    // org-scoped tree lock (ADR-0053 §3), or a concurrent reparent could move a resource INTO the
    // branch between the subtree walk and the write, leaving an active child under a soft-deleted
    // parent. An ordinary resource can never have children (only a GROUP may be a parent), so its
    // subtree is itself and it keeps today's per-resource lock profile exactly.
    //
    // LOCK ORDER (the only order either path ever takes, so the two can never deadlock):
    //   1. the org resource-tree lock (GROUP deletes and reparents only), then
    //   2. the per-resource assign locks, in ASCENDING id order.
    const isGroup = existing.kind === 'GROUP';

    // Delete-in-use guard (ADR-0039 invariant (c)): a resource assigned to an active activity
    // cannot be deleted (409 RESOURCE_IN_USE) — for a GROUP, that means ANY resource in its whole
    // subtree, so the count in the message is honest. Soft delete never trips the DB FK, so this
    // service check is the real guard (RESTRICT is defence in depth). The resource advisory lock —
    // taken by both this delete and every assign — serialises the count + delete against a
    // concurrent assign, which a single READ COMMITTED transaction alone would NOT (a commit
    // landing after the count but before the delete stays invisible to the count).
    await this.prisma.$transaction(async (tx) => {
      if (isGroup) await acquireResourceTreeWriteLock(tx, organization.id);
      const subtreeIds = isGroup
        ? await resolveActiveSubtreeIds(tx, this.resources, resourceId, organization.id)
        : [resourceId];
      // Ascending id order — a fixed total order, so two concurrent deletes of overlapping
      // branches acquire the shared keys in the same sequence and cannot deadlock. ONE statement,
      // not one per descendant: a group's fan-out is unbounded (only its depth is capped), and a
      // per-id loop would hold the org-wide tree lock for a round trip per row
      // (backend-performance review: ~830 ms vs ~13 ms for a 2,000-row subtree).
      await acquireResourceWriteLocks(tx, [...subtreeIds].sort());

      // A leaf keeps the single-resource count it has always used; only a GROUP needs the
      // subtree-wide one, so the ordinary delete path is unchanged in behaviour AND in queries.
      const inUse = isGroup
        ? await this.resources.countActiveAssignmentsUsingAny(subtreeIds, tx)
        : await this.resources.countActiveAssignmentsUsing(resourceId, tx);
      if (inUse > 0) {
        throw new ConflictError(RESOURCE_ERROR.RESOURCE_IN_USE, {
          reason: RESOURCE_CONFLICT.RESOURCE_IN_USE,
          count: inUse,
          // How many rows the count spans — 1 for an ordinary resource, the branch for a group —
          // so the UI can say "3 resources in this group are still assigned".
          subtreeSize: subtreeIds.length,
        });
      }
      let batchId: string;
      if (isGroup) {
        // ONE batch id across the branch (the ADR-0038 subtree-cascade precedent): the branch is
        // the restore unit, so a future restore reactivates exactly what was deleted together.
        batchId = randomUUID();
        await this.resources.softDeleteMany(subtreeIds, batchId, principal.userId, tx);
      } else {
        // A leaf is its own batch — today's exact single-row path, left untouched.
        batchId = await this.resources.softDelete(resourceId, principal.userId, tx);
      }

      // ONE row for the branch, carrying its size — never one per descendant. The same rule
      // family D applies to a WBS summary, for the same reason: a GROUP delete is one thing a
      // person did, and 2,000 rows would bury that rather than record it.
      await this.audit.record(
        {
          action: 'resource.deleted',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'RESOURCE',
          subjectId: resourceId,
          subjectLabel: existing.name,
          before: {
            name: existing.name,
            kind: existing.kind,
            deleteBatchId: batchId,
            resourceCount: subtreeIds.length,
          },
          ...auditActor(principal, context),
        },
        tx,
      );
    });
    this.logger.info(
      {
        organizationId: organization.id,
        resourceId,
        kind: existing.kind,
        userId: principal.userId,
      },
      'resource deleted',
    );
  }

  /**
   * Restore a deleted resource, or a deleted group with everything deleted with it (ADR-0195).
   *
   * **Batch-keyed and all-or-nothing.** A leaf delete mints its own batch; a GROUP delete stamps
   * its whole branch with one. The restore reactivates exactly that batch and nothing deleted
   * separately — and if anything in it is blocked, nothing comes back. Called with a MEMBER's id it
   * is refused as `PARENT_DELETED`: the bin acts on the root, so a caller cannot resurrect part of
   * a branch.
   *
   * Every invariant a forward path guards is re-checked here, under the same locks, because a
   * delete does not clear them: the parent may be deleted, no longer a group or now too deep (the
   * tree guard, with the branch's height supplied because the walk reads only active rows); a
   * resource's calendar may have been deleted meanwhile (`CALENDAR_IN_USE` counts only ACTIVE
   * resources); and an active row may have taken the name or code (archived rows hold both).
   *
   * LOCK ORDER (a subset of `remove`'s and `update`'s, so none can deadlock): the org
   * resource-tree lock first, then the calendar advisory locks in ASCENDING id order. The calendar
   * lock is the one the calendar delete's in-use guard takes, so a concurrent delete of a calendar
   * this restore depends on either counts the restored resources (409 CALENDAR_IN_USE) or is seen
   * by the check below.
   *
   * Gate order is 403, then 404, then the 409/422 refusals, so a caller without the permission is
   * never told whether an id exists. An already-active row is a no-op 200: nothing is written and
   * no audit row is recorded.
   */
  async restore(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    context?: RequestContext,
  ): Promise<{ resource: Resource; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:restore', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const found = await this.resources.findAnyStateByIdInOrg(resourceId, organization.id);
    if (!found) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    if (found.deletedAt === null) return { resource: found, canReadCost };

    try {
      const restored = await this.prisma.$transaction(async (tx) => {
        await acquireResourceTreeWriteLock(tx, organization.id);

        // Re-read UNDER the lock (the `dissolveGroup` lesson): the first read happened before it,
        // and a concurrent restore of the same batch finishes inside that window.
        const root = await this.resources.findAnyStateByIdInOrg(resourceId, organization.id, tx);
        if (!root) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
        if (root.deletedAt === null) return { resource: root, noop: true as const };

        const batch =
          root.deleteBatchId === null
            ? [root]
            : await this.resources.findDeletedBatchInOrg(root.deleteBatchId, organization.id, tx);
        if (!batch.some((row) => row.id === root.id)) {
          throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
        }
        const ids = batch.map((row) => row.id);

        await this.assertParentRestorable(tx, organization.id, root, batch);
        await this.assertCalendarsRestorable(tx, organization.id, batch);
        await this.assertNoLiveHolder(tx, organization.id, batch);

        const count = await this.resources.restoreBatch(
          { id: root.id, batchId: root.deleteBatchId },
          organization.id,
          principal.userId,
          tx,
        );
        // Zero rows means the batch is gone — nothing else changes a deleted row's batch id, so
        // this is a concurrent restore that the lock should have serialised, or a hand-edited row.
        // Failing loudly beats answering 200 for a restore that did not happen.
        if (count === 0) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

        // Defence in depth: a delete is refused while ANY assignment references the resource (and
        // no cascade stamps assignments), so this is expected to be empty. If it ever is not, the
        // plans that now see a resource they did not are marked for recalculation, last, after the
        // write, as the helper's contract asks.
        await markScheduleInputsChanged(
          tx,
          organization.id,
          await this.resources.findActivePlanIdsAssigningAny(ids, organization.id, tx),
        );

        await this.audit.record(
          {
            action: 'resource.restored',
            outcome: 'SUCCESS',
            organizationId: organization.id,
            subjectType: 'RESOURCE',
            subjectId: root.id,
            subjectLabel: root.name,
            after: {
              name: root.name,
              kind: root.kind,
              deleteBatchId: root.deleteBatchId,
              resourceCount: count,
            },
            ...auditActor(principal, context),
          },
          tx,
        );

        const back = await this.resources.findActiveByIdInOrg(root.id, organization.id, tx);
        if (!back) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
        return { resource: back, noop: false as const, count };
      });

      if (!restored.noop) {
        this.logger.info(
          {
            organizationId: organization.id,
            resourceId,
            kind: restored.resource.kind,
            resourceCount: restored.count,
            userId: principal.userId,
          },
          'resource restored',
        );
      }
      return { resource: restored.resource, canReadCost };
    } catch (error) {
      // The backstop behind the pre-check: a CREATE of a top-level resource takes no tree lock, so
      // a name or code can be taken between the check and the write, and the unique index has the
      // last word.
      if (this.isUniqueViolation(error)) {
        const onCode =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          JSON.stringify(error.meta ?? {}).includes('code');
        throw new ConflictError(RESOURCE_ERROR.DUPLICATE_RESOURCE, {
          reason: onCode ? LIBRARY_RESTORE_REASON.CODE_TAKEN : LIBRARY_RESTORE_REASON.NAME_TAKEN,
        });
      }
      throw this.mapCheckViolation(error);
    }
  }

  /**
   * The restored root must land somewhere the forward paths would have accepted. A deleted parent
   * is `PARENT_DELETED` (restore it first); an active one must still be a GROUP and shallow enough
   * for the whole branch (the tree guard, given the branch's height).
   */
  private async assertParentRestorable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    root: Resource,
    batch: readonly Resource[],
  ): Promise<void> {
    if (root.parentId === null) return;
    const parent = await this.resources.findAnyStateByIdInOrg(root.parentId, organizationId, tx);
    // A parent that no longer exists at all cannot be restored first; the row is unreachable.
    if (!parent) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    if (parent.deletedAt !== null) {
      throw new ConflictError('Restore the resource group first.', {
        reason: LIBRARY_RESTORE_REASON.PARENT_DELETED,
        blockedBy: {
          kind: 'resource',
          relation: 'parent',
          id: parent.id,
          name: parent.name,
          deleteBatchId: parent.deleteBatchId,
        },
      });
    }
    try {
      await assertValidResourceParent(tx, this.resources, {
        parentId: parent.id,
        organizationId,
        selfId: root.id,
        movedHeight: batchHeight(batch, root.id),
      });
    } catch (error) {
      // Name the parent so the planner knows which group to fix; the guard does not carry it.
      if (error instanceof ValidationError && typeof error.details === 'object') {
        throw new ValidationError(error.message, { ...error.details, parentName: parent.name });
      }
      throw error;
    }
  }

  /**
   * Every calendar the batch points at must be active. Checked under the calendar advisory lock
   * the delete-in-use guard uses, taken in ascending id order, so the answer cannot change before
   * the restore commits. An archived calendar is fine: archived bindings stay live (ADR-0053 §4).
   */
  private async assertCalendarsRestorable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    batch: readonly Resource[],
  ): Promise<void> {
    const calendarIds = [
      ...new Set(batch.map((row) => row.calendarId).filter((id) => id !== null)),
    ].sort();
    if (calendarIds.length === 0) return;
    for (const calendarId of calendarIds) await acquireCalendarWriteLock(tx, calendarId);
    const states = await this.calendars.findAnyStateByIdsInOrg(calendarIds, organizationId, tx);
    const byId = new Map(states.map((state) => [state.id, state]));
    for (const calendarId of calendarIds) {
      const state = byId.get(calendarId);
      if (state && state.deletedAt === null) continue;
      throw new ConflictError('Restore the calendar first.', {
        reason: LIBRARY_RESTORE_REASON.CALENDAR_DELETED,
        calendar: {
          id: calendarId,
          name: state?.name ?? null,
          deleteBatchId: state?.deleteBatchId ?? null,
        },
      });
    }
  }

  /**
   * No active row may hold a name or code the batch needs. Archived rows count — archiving frees
   * neither — and the refusal names the holders so the planner knows what to rename.
   */
  private async assertNoLiveHolder(
    tx: Prisma.TransactionClient,
    organizationId: string,
    batch: readonly Resource[],
  ): Promise<void> {
    const names = new Set(batch.map((row) => row.name));
    const codes = new Set(batch.flatMap((row) => (row.code === null ? [] : [row.code])));
    const holders = await this.resources.findActiveHoldingNamesOrCodes(
      { organizationId, names: [...names], codes: [...codes] },
      tx,
    );
    const conflicts: LibraryRestoreConflict[] = [];
    for (const holder of holders) {
      const archived = holder.archivedAt !== null;
      if (names.has(holder.name)) {
        conflicts.push({ field: 'name', value: holder.name, id: holder.id, archived });
      }
      if (holder.code !== null && codes.has(holder.code)) {
        conflicts.push({ field: 'code', value: holder.code, id: holder.id, archived });
      }
    }
    const first = conflicts[0];
    if (!first) return;
    const what = first.field === 'name' ? 'named' : 'with the code';
    const subject = first.archived ? 'An archived resource' : 'A resource';
    const more = conflicts.length > 1 ? ` (and ${conflicts.length - 1} more)` : '';
    throw new ConflictError(
      `${subject} ${what} “${first.value}” already exists${more}. ` +
        'Rename or delete that one, then restore this.',
      {
        reason: conflicts.some((conflict) => conflict.field === 'name')
          ? LIBRARY_RESTORE_REASON.NAME_TAKEN
          : LIBRARY_RESTORE_REASON.CODE_TAKEN,
        conflicts: conflicts.slice(0, MAX_NAMED_CONFLICTS),
        total: conflicts.length,
      },
    );
  }

  /**
   * Dissolve a `GROUP`: promote its direct children to the group's own parent (or the top level),
   * then soft-delete the now-childless group — remove the grouping, keep the resources
   * (ADR-0053 §3; the resource-tree counterpart of the WBS `dissolveSummary`, ADR-0063 §8).
   *
   * Deliberately NOT folded into {@link remove}: that method's contract is "a group's removal takes
   * its branch", and this is its exact inverse. Behind one name the destructive reading could be
   * reached by a flag, which is what two routes exist to prevent.
   *
   * Only the org tree lock is taken — NOT the per-resource assign locks `remove` takes. Those
   * serialise the `RESOURCE_IN_USE` count against a concurrent assign, and dissolve has no such
   * count: it deletes only the group, and a group can never be assigned
   * (`resource-assignment.service.ts`, GROUP_NOT_ASSIGNABLE), so the children's assignments are
   * untouched and nothing the engine reads changes. The lock order stays a subset of `remove`'s
   * (tree lock first), so the two cannot deadlock.
   *
   * A restore does not undo a dissolve (ADR-0195 D6): the emptied group sits in the bin and comes
   * back EMPTY, while the promoted children stay where they were moved. The audit row carries the
   * batch id that restore keys on.
   */
  async dissolveGroup(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    context?: RequestContext,
  ): Promise<DissolveResourceGroupResult> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    // Gate order is 403, then 404, then 422 — the same as `remove`, so a caller without the
    // permission is never told whether an id exists or what kind it is.
    this.assertCan(principal, 'resource:delete', organization.id);

    const existing = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    if (existing.kind !== 'GROUP') this.throwNotAGroup();

    const promoted = await this.prisma.$transaction(async (tx) => {
      await acquireResourceTreeWriteLock(tx, organization.id);

      // Re-read the group UNDER the lock and take the children's destination from THAT row. The
      // read above happened before the lock, and a concurrent reparent (which takes the same lock)
      // may have moved the group meanwhile: using the pre-lock `parentId` would promote the
      // children to a parent the group no longer has — a silently wrong tree from a transaction
      // that looks correctly serialised (the `dissolveSummary` lesson). The kind is re-checked for
      // the same reason: a kind change on an empty group can land in the same window.
      const locked = await this.resources.findActiveByIdInOrg(resourceId, organization.id, tx);
      if (!locked) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
      if (locked.kind !== 'GROUP') this.throwNotAGroup();

      const childIds = await this.resources.findActiveChildIdsOf([resourceId], organization.id, tx);
      await this.resources.promoteChildren(
        resourceId,
        organization.id,
        locked.parentId,
        principal.userId,
        tx,
      );

      // Backstop, not a branch: every write that sets a `parentId` takes the tree lock we hold, so
      // nothing can have added a child since the `UPDATE`. If one ever did, soft-deleting would
      // strand an active resource under a deleted parent — failing the transaction is the only
      // acceptable outcome.
      if ((await this.resources.countActiveChildrenOf(resourceId, organization.id, tx)) > 0) {
        throw new ConflictError(RESOURCE_ERROR.RESOURCE_GROUP_HAS_CHILDREN, {
          reason: RESOURCE_CONFLICT.RESOURCE_GROUP_HAS_CHILDREN,
        });
      }
      const batchId = await this.resources.softDelete(resourceId, principal.userId, tx);

      // The destination's name as it was, `null` for the top level. One destination, so `null` is a
      // determined fact rather than an absence (the ADR-0073 `parentCount` lesson).
      const destination =
        locked.parentId === null
          ? null
          : await this.resources.findActiveByIdInOrg(locked.parentId, organization.id, tx);

      // ONE row, and deliberately NOT `resource.deleted`: the grouping went and the resources
      // stayed, so recording a deletion would send somebody looking for lost resources.
      await this.audit.record(
        {
          action: 'resource.dissolved',
          outcome: 'SUCCESS',
          organizationId: organization.id,
          subjectType: 'RESOURCE',
          subjectId: resourceId,
          subjectLabel: locked.name,
          before: {
            name: locked.name,
            promotedChildCount: childIds.length,
            destinationName: destination?.name ?? null,
            deleteBatchId: batchId,
          },
          ...auditActor(principal, context),
        },
        tx,
      );

      // Re-read so the response carries the NEW versions — `updateMany` reports only a count, and
      // the caller never knew which rows were children.
      return this.resources.findPromotedByIds(childIds, organization.id, tx);
    });

    this.logger.info(
      {
        organizationId: organization.id,
        resourceId,
        userId: principal.userId,
        promoted: promoted.length,
      },
      'resource group dissolved',
    );
    return { promoted };
  }

  private throwNotAGroup(): never {
    throw new ValidationError(RESOURCE_ERROR.RESOURCE_NOT_A_GROUP, {
      reason: 'RESOURCE_NOT_A_GROUP',
    });
  }

  /**
   * A `GROUP` is a grouping node, not a resource: it carries no working calendar, no capacity
   * ceiling and no cost rate (ADR-0053 §3). That emptiness is not cosmetic — it is exactly why a
   * group is invisible to the levelling pass, the histogram and the Earned-Value read-model, so
   * introducing the tree cannot change a single schedule output. Enforced here as a clean 422 in
   * front of the same-row `ck_resources_group_no_scheduling_fields`, which is the DB backstop.
   */
  private assertGroupHasNoSchedulingFields(
    kind: Resource['kind'],
    fields: {
      calendarId: string | null;
      maxUnitsPerHour: number | null;
      costPerUnit: number | null;
    },
  ): void {
    if (kind !== 'GROUP') return;
    const offending = (
      [
        ['calendarId', fields.calendarId],
        ['maxUnitsPerHour', fields.maxUnitsPerHour],
        ['costPerUnit', fields.costPerUnit],
      ] as const
    )
      .filter(([, value]) => value !== null)
      .map(([field]) => field);
    if (offending.length === 0) return;
    throw new ValidationError(RESOURCE_ERROR.GROUP_HAS_NO_SCHEDULING_FIELDS, {
      reason: 'GROUP_HAS_NO_SCHEDULING_FIELDS',
      fields: offending,
    });
  }

  /** A Prisma unique-violation from a partial unique index (resource name or code). */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  /**
   * Degrade a DB CHECK violation (`ck_resources_parent_not_self`,
   * `ck_resources_group_no_scheduling_fields`) into an honest 422 instead of an opaque 500.
   * Reaching here means a service guard above was bypassed — the DB is doing its job as the last
   * line of defence — so the response should say what is wrong rather than "internal error".
   * Every other error is returned untouched for the caller to rethrow.
   */
  private mapCheckViolation(error: unknown): unknown {
    // Prisma surfaces a CHECK violation differently per client method (a known P2010 for raw, an
    // "unknown request" for the query engine's own paths), so match on the SQLSTATE / constraint
    // name carried in the message rather than on the error class — the one thing all of them
    // share. Not a fragile heuristic: both names are ours and are asserted by the migration test.
    if (!(error instanceof Error)) return error;
    const message = error.message;
    if (!message.includes(PG_CHECK_VIOLATION) && !message.includes('ck_resources_')) return error;
    if (message.includes('ck_resources_parent_not_self')) {
      return new ConflictError(RESOURCE_ERROR.RESOURCE_PARENT_CYCLE, {
        reason: 'RESOURCE_PARENT_CYCLE',
      });
    }
    return new ValidationError(RESOURCE_ERROR.GROUP_HAS_NO_SCHEDULING_FIELDS, {
      reason: 'GROUP_HAS_NO_SCHEDULING_FIELDS',
    });
  }

  private async duplicateResourceError(
    organizationId: string,
    name: string,
    code: string | null,
  ): Promise<ConflictError> {
    // An ARCHIVED resource keeps its name AND its code (the M4 migration's decision (1): the
    // partial uniques stay predicated on `deleted_at IS NULL` so unarchive — an unguarded,
    // version-gated UPDATE — can never fail on a handle taken meanwhile). The accepted cost is
    // this 409; naming the archived row in `details` turns a dead end into "unarchive that one
    // instead". The lookup runs ONLY here, on the error path, so the happy path pays nothing.
    const archived = await this.resources.findArchivedByNameOrCodeInOrg({
      organizationId,
      name,
      code,
    });
    if (archived) {
      return new ConflictError(
        'An archived resource already uses this name or code. Unarchive it instead, or choose another.',
        { reason: RESOURCE_CONFLICT.DUPLICATE_RESOURCE, archivedResourceId: archived.id },
      );
    }
    return new ConflictError(RESOURCE_ERROR.DUPLICATE_RESOURCE, {
      reason: RESOURCE_CONFLICT.DUPLICATE_RESOURCE,
    });
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
