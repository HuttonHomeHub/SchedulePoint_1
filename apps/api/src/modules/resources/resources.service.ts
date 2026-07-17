import { Injectable } from '@nestjs/common';
import { Prisma, type Resource } from '@prisma/client';
import { RESOURCE_ERROR, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import { acquireResourceWriteLock } from '../../common/db/resource-advisory-lock';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';

import type { CreateResourceDto } from './dto/create-resource.dto';
import type { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourceRepository, type ResourcePatch } from './resource.repository';

/** Machine-readable conflict reasons carried in a {@link ConflictError}'s `details` (ADR-0039). */
export const RESOURCE_CONFLICT = {
  /** A resource name/code collides with an active resource in the same org. */
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  /** Deleting a resource still assigned to an active activity. */
  RESOURCE_IN_USE: 'RESOURCE_IN_USE',
} as const;

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
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Resource[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);

    const rows = await this.resources.findManyActiveByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, resourceId: string): Promise<Resource> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);

    const resource = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!resource) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    return resource;
  }

  async create(principal: Principal, orgSlug: string, dto: CreateResourceDto): Promise<Resource> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:create', organization.id);

    const calendarId = dto.calendarId ?? null;
    try {
      const resource = await this.prisma.$transaction(async (tx) => {
        // A specific calendar must be active + in-org (invariant (a)) — validate under the
        // calendar lock before the insert, serialised with the delete-in-use guard.
        if (calendarId !== null) await this.assertCalendarInOrg(tx, calendarId, organization.id);
        return this.resources.create(
          {
            organizationId: organization.id,
            name: dto.name,
            code: dto.code ?? null,
            description: dto.description ?? null,
            kind: dto.kind,
            calendarId,
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
      return resource;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateResourceError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<Resource> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:update', organization.id);

    if (!(await this.resources.findActiveByIdInOrg(resourceId, organization.id))) {
      throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    }

    const patch: ResourcePatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code === '' ? null : dto.code;
    if (dto.description !== undefined) {
      patch.description = dto.description === '' ? null : dto.description;
    }
    if (dto.kind !== undefined) patch.kind = dto.kind;
    // The resource's own calendar: null clears to inherit the plan default; a specific id
    // is validated in-org under the calendar lock inside the transaction below.
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (calendarId !== undefined && calendarId !== null) {
          await this.assertCalendarInOrg(tx, calendarId, organization.id);
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
      if (this.isUniqueViolation(error)) throw this.duplicateResourceError();
      throw error;
    }

    const updated = await this.resources.findActiveByIdInOrg(resourceId, organization.id);
    if (!updated) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, resourceId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:delete', organization.id);

    if (!(await this.resources.findActiveByIdInOrg(resourceId, organization.id))) {
      throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
    }

    // Delete-in-use guard (ADR-0039 invariant (c)): a resource assigned to an active
    // activity cannot be deleted (409 RESOURCE_IN_USE). Soft delete never trips the DB
    // FK, so this service check is the real guard (RESTRICT is defence in depth). The
    // resource advisory lock — taken by both this delete and every assign — serialises
    // the count + delete against a concurrent assign, which a single READ COMMITTED
    // transaction alone would NOT (a commit landing after the count but before the
    // delete stays invisible to the count), so the guard cannot be raced.
    await this.prisma.$transaction(async (tx) => {
      await acquireResourceWriteLock(tx, resourceId);
      const inUse = await this.resources.countActiveAssignmentsUsing(resourceId, tx);
      if (inUse > 0) {
        throw new ConflictError(RESOURCE_ERROR.RESOURCE_IN_USE, {
          reason: RESOURCE_CONFLICT.RESOURCE_IN_USE,
          count: inUse,
        });
      }
      await this.resources.softDelete(resourceId, principal.userId, tx);
    });
    this.logger.info(
      { organizationId: organization.id, resourceId, userId: principal.userId },
      'resource deleted',
    );
  }

  /**
   * Validate a non-null `calendarId` is an ACTIVE calendar in the resource's own org
   * (ADR-0039 invariant (a), mirrors ActivitiesService). Taken under the same calendar
   * advisory lock the CALENDAR_IN_USE guard uses, so a resource can never be assigned a
   * calendar mid-deletion (no TOCTOU dangle). A foreign / deleted / unknown id is
   * indistinguishable from missing (404), leaking nothing.
   */
  private async assertCalendarInOrg(
    tx: Prisma.TransactionClient,
    calendarId: string,
    organizationId: string,
  ): Promise<void> {
    await acquireCalendarWriteLock(tx, calendarId);
    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organizationId, tx);
    if (!calendar) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_CALENDAR_NOT_FOUND);
  }

  /** A Prisma unique-violation from a partial unique index (resource name or code). */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateResourceError(): ConflictError {
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
