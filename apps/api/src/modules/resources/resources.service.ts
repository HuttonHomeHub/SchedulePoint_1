import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Resource, type ResourceKind } from '@prisma/client';
import { RESOURCE_ERROR, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireResourceWriteLock } from '../../common/db/resource-advisory-lock';
import { acquireResourceTreeWriteLock } from '../../common/db/resource-tree-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { normaliseSearchTerm, type ArchivedFilter } from '../../common/query/library-filters';
import { PrismaService } from '../../prisma/prisma.service';
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
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:update', organization.id);

    const existing = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    const changed = await this.resources.setArchivedIfVersionMatches(
      resourceId,
      version,
      archived ? new Date() : null,
      principal.userId,
    );
    if (changed === 0) {
      throw new ConflictError('This resource was changed elsewhere. Refresh and try again.');
    }

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

  async remove(principal: Principal, orgSlug: string, resourceId: string): Promise<void> {
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
      // branches acquire the shared keys in the same sequence and cannot deadlock.
      for (const id of [...subtreeIds].sort()) await acquireResourceWriteLock(tx, id);

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
      if (isGroup) {
        // ONE batch id across the branch (the ADR-0038 subtree-cascade precedent): the branch is
        // the restore unit, so a future restore reactivates exactly what was deleted together.
        await this.resources.softDeleteMany(subtreeIds, randomUUID(), principal.userId, tx);
      } else {
        // A leaf is its own batch — today's exact single-row path, left untouched.
        await this.resources.softDelete(resourceId, principal.userId, tx);
      }
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
