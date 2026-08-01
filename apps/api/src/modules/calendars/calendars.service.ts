import { Injectable } from '@nestjs/common';
import { Prisma, type Calendar, type CalendarScope } from '@prisma/client';
import { CALENDAR_ERROR, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { normaliseSearchTerm, type ArchivedFilter } from '../../common/query/library-filters';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ProjectRepository } from '../projects/project.repository';
import { ResourceRepository } from '../resources/resource.repository';

import {
  CalendarRepository,
  type CalendarExceptionWithWindows,
  type CalendarPatch,
  type CalendarScopeFilter,
  type CalendarWithExceptions,
  type CalendarWithShifts,
} from './calendar.repository';
import type { CreateCalendarExceptionDto } from './dto/create-calendar-exception.dto';
import type { CreateCalendarDto } from './dto/create-calendar.dto';
import type { UpdateCalendarDto } from './dto/update-calendar.dto';

/** Machine-readable conflict reasons carried in a {@link ConflictError}'s `details`. */
export const CALENDAR_CONFLICT = {
  /** A calendar name collides with an active calendar in the same TIER (ADR-0053 §1). */
  DUPLICATE_CALENDAR: 'DUPLICATE_CALENDAR',
  /** An exception date collides with an active exception on the same calendar. */
  DUPLICATE_EXCEPTION: 'DUPLICATE_EXCEPTION',
  /** Deleting a calendar still referenced by an active plan (added in Task C1). */
  CALENDAR_IN_USE: 'CALENDAR_IN_USE',
  /**
   * Narrowing an ORG calendar to one project while active plans/activities outside that
   * project — or ANY active resource — still reference it (ADR-0053 §2). Widening
   * (PROJECT → ORG) is always safe and never raises this.
   */
  CALENDAR_SCOPE_NARROWING_BLOCKED: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
} as const;

/**
 * Business logic for the org-scoped working-day calendar library (ADR-0024).
 * Every action re-resolves the org scope from the caller's own memberships
 * (anti-IDOR) and pairs it with a permission check; all loads filter by the
 * resolved `organization_id`. Calendars are a reusable sibling library (not a
 * hierarchy level): delete is a self-contained soft-cascade (calendar → its
 * exceptions), and adding/removing an exception bumps the calendar's version.
 * The delete-in-use guard (409 `CALENDAR_IN_USE`) lands with `plans.calendar_id`
 * in Task C1 — until then no plan can reference a calendar.
 */
@Injectable()
export class CalendarsService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly calendars: CalendarRepository,
    private readonly projects: ProjectRepository,
    private readonly resources: ResourceRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CalendarsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: {
      limit: number;
      cursor?: string;
      scope?: CalendarScopeFilter;
      archived?: ArchivedFilter;
      q?: string;
    },
  ): Promise<{ items: CalendarWithShifts[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:read', organization.id);

    const search = normaliseSearchTerm(query.q);
    const rows = await this.calendars.findManyActiveByOrg({
      organizationId: organization.id,
      // Default `org` (ADR-0053 §1): the shared library list keeps EXACTLY today's result
      // set for a client that sends no filter — project calendars are opt-in here.
      scope: query.scope ?? 'org',
      // Default `exclude` (ADR-0053 §4): same contract for the archive filter — nothing is
      // archived until someone archives it, so today's result set is preserved exactly.
      archived: query.archived ?? 'exclude',
      ...(search === undefined ? {} : { search }),
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return this.paginate(rows, query.limit);
  }

  /**
   * The calendars USABLE IN a project (ADR-0053 §1) — its own PROJECT-scoped calendars plus
   * every ORG-scoped one. This is exactly the set `assertCalendarUsableBy` accepts for a plan
   * or activity in that project, so a picker fed from here can never offer something the write
   * seam will reject. The project is loaded active + in-org first (anti-IDOR): a foreign,
   * deleted or unknown project id is a 404, never an existence oracle.
   */
  async listForProject(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    query: { limit: number; cursor?: string; archived?: ArchivedFilter; q?: string },
  ): Promise<{ items: CalendarWithShifts[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:read', organization.id);

    if (!(await this.projects.findActiveByIdInOrg(projectId, organization.id))) {
      throw new NotFoundError('Project not found.');
    }

    const search = normaliseSearchTerm(query.q);
    const rows = await this.calendars.findManyActiveForProject({
      organizationId: organization.id,
      projectId,
      // Default `exclude` — an archived calendar is retired from every picker, and this list
      // IS the picker source for a plan/activity in this project (ADR-0053 §4).
      archived: query.archived ?? 'exclude',
      ...(search === undefined ? {} : { search }),
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return this.paginate(rows, query.limit);
  }

  async get(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
  ): Promise<CalendarWithExceptions> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:read', organization.id);

    const calendar = await this.calendars.findActiveDetailByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');
    return calendar;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    dto: CreateCalendarDto,
  ): Promise<CalendarWithExceptions> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:create', organization.id);

    // The tier defaults to ORG, so an existing client that sends neither field gets exactly
    // today's behaviour (ADR-0053 §1). The DTO has already rejected the mismatched pairings
    // (PROJECT without a project, ORG with one); this resolves the validated pair.
    const scope: CalendarScope = dto.scope ?? 'ORG';
    const projectId = scope === 'PROJECT' ? (dto.projectId ?? null) : null;
    if (scope === 'PROJECT' && projectId === null) {
      // Defence in depth behind the DTO cross-field validator — a service-level invariant
      // must never depend on the DTO alone (the DB CHECK is the third line).
      throw new ValidationError(CALENDAR_ERROR.CALENDAR_SCOPE_PROJECT_MISMATCH, {
        reason: 'CALENDAR_SCOPE_PROJECT_MISMATCH',
      });
    }
    // Writing to the SHARED library is the independently-revocable capability (ADR-0053 §2).
    if (scope === 'ORG') this.assertCan(principal, 'calendar:manage_org', organization.id);
    if (projectId !== null) {
      // The owning project must be active and in the caller's own org (anti-IDOR): a foreign,
      // deleted or unknown project id reads as 404, leaking nothing about other tenants.
      if (!(await this.projects.findActiveByIdInOrg(projectId, organization.id))) {
        throw new NotFoundError('Project not found.');
      }
    }

    try {
      const calendar = await this.calendars.create({
        organizationId: organization.id,
        name: dto.name,
        // Exactly one of these is set — the DTO refuses both and refuses neither. Spread
        // conditionally rather than passing `undefined`: `exactOptionalPropertyTypes` treats an
        // explicit undefined as a present key, which is not what "the caller sent one form" means.
        ...(dto.workingWeekdays === undefined ? {} : { workingWeekdays: dto.workingWeekdays }),
        ...(dto.shifts === undefined ? {} : { shifts: dto.shifts }),
        description: dto.description ?? null,
        scope,
        projectId,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        {
          organizationId: organization.id,
          calendarId: calendar.id,
          scope,
          projectId,
          userId: principal.userId,
        },
        'calendar created',
      );
      return { ...calendar, exceptions: [] };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw await this.duplicateCalendarError(organization.id, dto.name, scope, projectId);
      }
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    dto: UpdateCalendarDto,
  ): Promise<CalendarWithExceptions> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const existing = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!existing) throw new NotFoundError('Calendar not found.');

    // Editing a calendar that ALREADY lives in the shared library is a write to shared tenant
    // state, so it needs the extra capability regardless of whether the tier changes (ADR-0053 §2).
    if (existing.scope === 'ORG') {
      this.assertCan(principal, 'calendar:manage_org', organization.id);
    }

    const patch: CalendarPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.workingWeekdays !== undefined) patch.workingWeekdays = dto.workingWeekdays;
    if (dto.shifts !== undefined) patch.shifts = dto.shifts;

    const target = this.resolveTargetScope(existing, dto);
    if (target !== null) {
      // Promoting INTO or re-homing WITHIN the tiers both touch the shared library's
      // membership, so both need `calendar:manage_org` (ADR-0053 §2).
      this.assertCan(principal, 'calendar:manage_org', organization.id);
      if (target.projectId !== null) {
        if (!(await this.projects.findActiveByIdInOrg(target.projectId, organization.id))) {
          throw new NotFoundError('Project not found.');
        }
      }
      patch.scope = target.scope;
      patch.projectId = target.projectId;
    }

    try {
      // Replacing the weekly shift set on a mask change is atomic with the version-gated
      // scalar update (ADR-0036 §2): run both inside one transaction.
      const changed = await this.prisma.$transaction(async (tx) => {
        // Narrowing (→ PROJECT) must count referencers UNDER the same advisory lock the
        // delete-in-use guard and every assignment seam take, so a plan cannot be pointed at
        // the calendar between the count and the update (no TOCTOU). Widening (→ ORG) needs no
        // count at all: every referencer of a project calendar is inside that project, which is
        // a subset of the organisation, so the set of legal references only grows.
        if (target !== null && target.projectId !== null) {
          await acquireCalendarWriteLock(tx, calendarId);
          await this.assertNarrowingAllowed(calendarId, target.projectId, tx);
        }
        return this.calendars.updateIfVersionMatches(
          calendarId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
      });
      if (changed === 0) {
        throw new ConflictError('This calendar was changed elsewhere. Refresh and try again.');
      }
      if (target !== null) {
        this.logger.info(
          {
            organizationId: organization.id,
            calendarId,
            fromScope: existing.scope,
            fromProjectId: existing.projectId,
            toScope: target.scope,
            toProjectId: target.projectId,
            userId: principal.userId,
          },
          'calendar scope changed',
        );
      }
    } catch (error) {
      // The effective tier of THIS write — the target when the scope moved, else the stored one.
      if (this.isUniqueViolation(error)) {
        throw await this.duplicateCalendarError(
          organization.id,
          dto.name ?? existing.name,
          target?.scope ?? existing.scope,
          target?.projectId ?? existing.projectId,
        );
      }
      throw error;
    }

    const updated = await this.calendars.findActiveDetailByIdInOrg(calendarId, organization.id);
    if (!updated) throw new NotFoundError('Calendar not found.');
    return updated;
  }

  /**
   * Archive or unarchive a calendar (ADR-0053 §4, workflow W4) — a version-gated,
   * metadata-only `UPDATE archived_at`. There is deliberately **no** lock, **no** cascade and
   * **no** in-use guard: archiving is explicitly NOT blocked by use. That is the entire point,
   * and the contrast with delete — it is the only way to retire a calendar that
   * `CALENDAR_IN_USE` (correctly) refuses to delete. Every existing plan/activity/resource
   * binding stays live and keeps scheduling identically; only NEW bindings are refused, at the
   * `assertCalendarUsableBy` seam.
   *
   * Authorisation mirrors `update`: `calendar:update` always, plus `calendar:manage_org` when
   * the row sits in the SHARED tier — retiring something from the shared library is a write to
   * shared tenant state exactly as editing or deleting it is.
   *
   * Idempotent by intent but not silently so: re-archiving an already-archived calendar simply
   * rewrites the instant, which is a harmless no-op the caller cannot distinguish — there is no
   * state machine to violate.
   */
  async setArchived(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    archived: boolean,
    version: number,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const existing = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!existing) throw new NotFoundError('Calendar not found.');
    if (existing.scope === 'ORG') {
      this.assertCan(principal, 'calendar:manage_org', organization.id);
    }

    const changed = await this.calendars.setArchivedIfVersionMatches(
      calendarId,
      version,
      archived ? new Date() : null,
      principal.userId,
    );
    if (changed === 0) {
      throw new ConflictError('This calendar was changed elsewhere. Refresh and try again.');
    }

    this.logger.info(
      {
        organizationId: organization.id,
        calendarId,
        scope: existing.scope,
        archived,
        userId: principal.userId,
      },
      archived ? 'calendar archived' : 'calendar unarchived',
    );
  }

  async remove(principal: Principal, orgSlug: string, calendarId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:delete', organization.id);

    const existing = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!existing) throw new NotFoundError('Calendar not found.');
    // Removing a row from the SHARED library is a write to shared tenant state (ADR-0053 §2),
    // so it needs the same independently-revocable capability as creating/editing one. A
    // PROJECT-scoped calendar needs only `calendar:delete`.
    if (existing.scope === 'ORG') {
      this.assertCan(principal, 'calendar:manage_org', organization.id);
    }

    // Delete-in-use guard: a calendar referenced by an active plan cannot be deleted,
    // so a plan can never dangle a missing calendar (409 CALENDAR_IN_USE). Soft delete
    // never trips the DB FK, so this service check is the real guard (RESTRICT is
    // defence in depth). The count + delete run in ONE transaction under a
    // calendar-scoped advisory lock shared with plan-calendar assignment, so a
    // concurrent PATCH cannot slip a plan onto the calendar between the count and the
    // delete (no TOCTOU dangling reference).
    await this.prisma.$transaction(async (tx) => {
      await acquireCalendarWriteLock(tx, calendarId);
      // In-use = active plans OR active activities OR active resources that reference this
      // calendar (ADR-0037 M5 + ADR-0039 M7 — a resource is the third referencer).
      const [planCount, activityCount, resourceCount] = await Promise.all([
        this.calendars.countActivePlansUsing(calendarId, tx),
        this.calendars.countActiveActivitiesUsing(calendarId, tx),
        this.resources.countActiveResourcesUsingCalendar(calendarId, tx),
      ]);
      const inUse = planCount + activityCount + resourceCount;
      if (inUse > 0) {
        throw new ConflictError(this.inUseMessage(planCount, activityCount, resourceCount), {
          reason: CALENDAR_CONFLICT.CALENDAR_IN_USE,
          count: inUse,
          plans: planCount,
          activities: activityCount,
          resources: resourceCount,
        });
      }
      await this.calendars.softDeleteWithExceptions(calendarId, principal.userId, tx);
    });
    this.logger.info(
      { organizationId: organization.id, calendarId, userId: principal.userId },
      'calendar deleted (with exceptions)',
    );
  }

  async addException(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    dto: CreateCalendarExceptionDto,
  ): Promise<CalendarExceptionWithWindows> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');

    try {
      const exception = await this.prisma.$transaction(async (tx) => {
        const created = await this.calendars.createException(
          {
            // Denormalise the organisation id from the parent calendar, never input.
            organizationId: calendar.organizationId,
            calendarId: calendar.id,
            date: parseCalendarDate(dto.date),
            isWorking: dto.isWorking ?? false,
            // Conditional spread: `exactOptionalPropertyTypes` counts an explicit `undefined` as a
            // present key, which would make the repository's "explicit windows win" branch fire on
            // a body that never sent any.
            ...(dto.windows ? { windows: dto.windows } : {}),
            label: dto.label ?? null,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
        await this.calendars.touchVersion(calendar.id, principal.userId, tx);
        return created;
      });
      this.logger.info(
        {
          organizationId: organization.id,
          calendarId: calendar.id,
          exceptionId: exception.id,
          userId: principal.userId,
        },
        'calendar exception added',
      );
      return exception;
    } catch (error) {
      if (this.isExceptionOverlapViolation(error)) throw this.duplicateExceptionError();
      throw error;
    }
  }

  async removeException(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    exceptionId: string,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');

    const exception = await this.calendars.findActiveExceptionByIdInCalendar(
      exceptionId,
      calendarId,
    );
    if (!exception) throw new NotFoundError('Calendar exception not found.');

    await this.prisma.$transaction(async (tx) => {
      await this.calendars.softDeleteException(exceptionId, principal.userId, tx);
      await this.calendars.touchVersion(calendarId, principal.userId, tx);
    });
    this.logger.info(
      {
        organizationId: organization.id,
        calendarId,
        exceptionId,
        userId: principal.userId,
      },
      'calendar exception removed',
    );
  }

  /**
   * Resolve the tier a PATCH is asking for, or `null` when the tier is unchanged (ADR-0053 §2).
   * `scope` and `projectId` are both optional and either may be sent alone: `scope: 'ORG'`
   * promotes (and clears the project); `projectId` alone re-homes a project calendar. An
   * unchanged pair returns `null` so an ordinary rename never takes the narrowing path.
   */
  private resolveTargetScope(
    existing: Calendar,
    dto: UpdateCalendarDto,
  ): { scope: CalendarScope; projectId: string | null } | null {
    if (dto.scope === undefined && dto.projectId === undefined) return null;

    const scope: CalendarScope = dto.scope ?? existing.scope;
    // ORG always clears the project (the CHECK would reject anything else); PROJECT keeps the
    // current owner unless the caller names a new one.
    const projectId =
      scope === 'ORG' ? null : dto.projectId !== undefined ? dto.projectId : existing.projectId;
    if (scope === 'PROJECT' && projectId === null) {
      // Defence in depth behind the DTO cross-field validator and the DB CHECK.
      throw new ValidationError(CALENDAR_ERROR.CALENDAR_SCOPE_PROJECT_MISMATCH, {
        reason: 'CALENDAR_SCOPE_PROJECT_MISMATCH',
      });
    }
    if (scope === existing.scope && projectId === existing.projectId) return null;
    return { scope, projectId };
  }

  /**
   * The narrowing guard (ADR-0053 §2, W2): a calendar may only be pinned to `projectId` while
   * NOTHING outside that project still uses it. Counts active plans and activities in OTHER
   * projects plus **every** active resource (the resource pool is org-global, so any resource
   * reference is by definition outside a single project — an archived resource still counts,
   * because archived is not deleted and the reference is live). Non-zero ⇒ 409 with per-class
   * counts so the UI can say precisely what is in the way. Must be called under the calendar
   * advisory lock inside the write transaction.
   */
  private async assertNarrowingAllowed(
    calendarId: string,
    projectId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const [plans, activities, resources] = await Promise.all([
      this.calendars.countActivePlansUsingOutsideProject(calendarId, projectId, tx),
      this.calendars.countActiveActivitiesUsingOutsideProject(calendarId, projectId, tx),
      this.resources.countActiveResourcesUsingCalendar(calendarId, tx),
    ]);
    const blocking = plans + activities + resources;
    if (blocking > 0) {
      throw new ConflictError(CALENDAR_ERROR.CALENDAR_SCOPE_NARROWING_BLOCKED, {
        reason: CALENDAR_CONFLICT.CALENDAR_SCOPE_NARROWING_BLOCKED,
        count: blocking,
        plans,
        activities,
        resources,
      });
    }
  }

  /** Slice a `limit + 1` keyset page into its items + `{ nextCursor, hasMore }` meta. */
  private paginate(
    rows: CalendarWithShifts[],
    limit: number,
  ): { items: CalendarWithShifts[]; meta: PageMeta } {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  /** A Prisma unique-violation from a partial unique index (calendar name). */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  /**
   * A duplicate active exception on the same calendar. Since ADR-0036 the overlap
   * guard is a GiST EXCLUDE over the exception's inclusive date range (Postgres
   * `23P01` exclusion_violation), not a unique index — Prisma does not map `23P01`
   * to a `P2002` code, so match it by the constraint name across whichever error
   * shape Prisma surfaces it as. The DB constraint remains the last line of defence;
   * this catch is what turns it into the 409 `DUPLICATE_EXCEPTION` the API promises.
   */
  private isExceptionOverlapViolation(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientUnknownRequestError) &&
      error.message.includes('ex_calendar_exceptions_no_overlap')
    );
  }

  /**
   * Name uniqueness is PER TIER since ADR-0053, so a P2002 can now come from either partial
   * unique — `uq_calendars_org_name` (the shared library) or `uq_calendars_project_name` (one
   * project). Both are the same 409 `DUPLICATE_CALENDAR`, but the message names the tier that
   * collided so a promote ("…in the organisation library") and a narrow ("…in that project")
   * read correctly. The tier is taken from the write's own EFFECTIVE scope rather than parsed
   * out of the driver's error text: the service already knows which tier it was writing into,
   * and that does not depend on how Prisma happens to render a raw partial index.
   */
  private async duplicateCalendarError(
    organizationId: string,
    name: string,
    scope: CalendarScope,
    projectId: string | null,
  ): Promise<ConflictError> {
    const tier = scope === 'PROJECT' ? 'in that project' : 'in the organisation library';
    // An ARCHIVED calendar keeps its name (the M4 migration's decision (1): the partial uniques
    // stay predicated on `deleted_at IS NULL` so unarchive — an unguarded version-gated UPDATE —
    // can never fail on a name taken meanwhile). The accepted cost is this 409; naming the
    // archived row in `details` turns a dead end into "unarchive that one instead". The lookup
    // runs ONLY here, on the error path, so the happy path pays nothing.
    const archived = await this.calendars.findArchivedByNameInTier({
      organizationId,
      name,
      scope,
      projectId,
    });
    if (archived) {
      return new ConflictError(
        `An archived calendar named “${name}” already exists ${tier}. Unarchive it instead, or choose another name.`,
        {
          reason: CALENDAR_CONFLICT.DUPLICATE_CALENDAR,
          archivedCalendarId: archived.id,
        },
      );
    }
    return new ConflictError(`A calendar with this name already exists ${tier}.`, {
      reason: CALENDAR_CONFLICT.DUPLICATE_CALENDAR,
    });
  }

  private duplicateExceptionError(): ConflictError {
    return new ConflictError('An exception for this date already exists on this calendar.', {
      reason: CALENDAR_CONFLICT.DUPLICATE_EXCEPTION,
    });
  }

  /** A human count of what still references a calendar, unioning plans + activities + resources (ADR-0037/0039). */
  private inUseMessage(plans: number, activities: number, resources: number): string {
    const parts: string[] = [];
    if (plans > 0) parts.push(`${plans} active plan${plans === 1 ? '' : 's'}`);
    if (activities > 0) parts.push(`${activities} active activit${activities === 1 ? 'y' : 'ies'}`);
    if (resources > 0) parts.push(`${resources} active resource${resources === 1 ? '' : 's'}`);
    return `This calendar is in use by ${parts.join(' and ')}.`;
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
