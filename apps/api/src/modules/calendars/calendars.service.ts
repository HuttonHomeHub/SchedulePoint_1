import { Injectable } from '@nestjs/common';
import { Prisma, type Calendar, type CalendarScope } from '@prisma/client';
import { CALENDAR_ERROR, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { normaliseSearchTerm, type ArchivedFilter } from '../../common/query/library-filters';
import { formatCalendarDate, parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ProjectRepository } from '../projects/project.repository';
import { ResourceRepository } from '../resources/resource.repository';

import {
  CalendarRepository,
  exceptionWindowRowsFor,
  type CalendarExceptionWithWindows,
  type CalendarPatch,
  type CalendarScopeFilter,
  type CalendarWithExceptions,
  type CalendarWithShifts,
} from './calendar.repository';
import type { CreateCalendarExceptionDto } from './dto/create-calendar-exception.dto';
import type { CreateCalendarDto } from './dto/create-calendar.dto';
import type { UpdateCalendarExceptionDto } from './dto/update-calendar-exception.dto';
import type { UpdateCalendarDto } from './dto/update-calendar.dto';
import { resolveHoursPerDayMinutes } from './hours-per-day';
import { workingTimeChangeKind, type WorkingTimeChangeKind } from './working-time-change';

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
 * The longest span one exception may cover, in calendar days (~27 years).
 *
 * Two reasons, and the second is the one that would not have been noticed. It is a **typo guard**
 * first — a shutdown entered as `2226` rather than `2026` should be refused at the boundary rather
 * than stored. It is also the bound the **engine's calendar build** now relies on: `buildWorking
 * TimeCalendar` walks every day of every exception once (O(total exception days)), a cost its own
 * comment used to justify by "the single-day API shape keeps it at O(E)". Making ranges authorable
 * (surface audit F2) removed that premise, so the ceiling replaces it explicitly rather than
 * leaving a per-recalculation cost the API can be asked for without limit.
 */
const MAX_EXCEPTION_SPAN_DAYS = 10_000;
const MS_PER_DAY = 86_400_000;

/**
 * Refuse an exception span longer than {@link MAX_EXCEPTION_SPAN_DAYS}. Shared by create and
 * update so the two cannot disagree; a caller that sends no `endDate` is a single day and passes.
 */
function assertSpanWithinCeiling(date: string, endDate: string | undefined): void {
  if (endDate === undefined) return;
  const days = Math.round(
    (parseCalendarDate(endDate).getTime() - parseCalendarDate(date).getTime()) / MS_PER_DAY,
  );
  if (days > MAX_EXCEPTION_SPAN_DAYS) {
    throw new ValidationError(
      `An exception cannot span more than ${String(MAX_EXCEPTION_SPAN_DAYS)} days.`,
      { reason: 'EXCEPTION_RANGE_TOO_LONG', date, endDate, days },
    );
  }
}

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
    private readonly audit: AuditService,
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
        // Co-written with the week, never left to a read-time derivation (ADR-0068 §1).
        hoursPerDayMinutes: resolveHoursPerDayMinutes(dto),
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
    context?: RequestContext,
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
    // The day factor rides with the week (ADR-0068 §1). `current` keeps a rename from moving it,
    // and keeps a pattern edit from being stored with a factor that describes the OLD week.
    if (
      dto.hoursPerDay !== undefined ||
      dto.workingWeekdays !== undefined ||
      dto.shifts !== undefined
    ) {
      patch.hoursPerDayMinutes = resolveHoursPerDayMinutes({
        ...dto,
        current: existing.hoursPerDayMinutes,
      });
    }

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
        const rows = await this.calendars.updateIfVersionMatches(
          calendarId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        // A shared calendar's working time re-dates every plan on it — work owned by people who
        // did not make the change and are not told (ADR-0073 family E, Test 2). Emitted only when
        // the WORKING TIME moved: a rename or a description edit leaves this alone, and a scope
        // change is its own action in C3.3.
        //
        // Recorded only if the version-gated write actually landed; `rows === 0` throws below.
        if (rows > 0) {
          const kind = workingTimeChangeKind(dto);
          if (kind) {
            await this.recordWorkingTimeChange(tx, {
              organizationId: organization.id,
              calendarId,
              name: patch.name ?? existing.name,
              changedWhat: kind,
              principal,
              context,
            });
          }
        }
        return rows;
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
    context?: RequestContext,
  ): Promise<CalendarExceptionWithWindows> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');
    this.assertMayWriteExceptions(principal, calendar.scope, organization.id);

    // An inclusive range must not run backwards (surface audit F2). Checked here rather than by a
    // DTO cross-field validator for the same reason the resume/suspend order is (§progress): the
    // message names both dates, which a decorator on one of them cannot. The DB's exclusion
    // constraint is the backstop for OVERLAP; this is the one shape it cannot express, because an
    // empty range is not an overlap with anything.
    if (dto.endDate !== undefined && dto.endDate < dto.date) {
      throw new ValidationError('The exception’s last day cannot precede its first day.', {
        reason: 'EXCEPTION_RANGE_INVERTED',
        date: dto.date,
        endDate: dto.endDate,
      });
    }
    assertSpanWithinCeiling(dto.date, dto.endDate);

    const exception = await this.runExceptionWrite(async () =>
      this.prisma.$transaction(async (tx) => {
        const created = await this.calendars.createException(
          {
            // Denormalise the organisation id from the parent calendar, never input.
            organizationId: calendar.organizationId,
            calendarId: calendar.id,
            date: parseCalendarDate(dto.date),
            ...(dto.endDate === undefined ? {} : { endDate: parseCalendarDate(dto.endDate) }),
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
        // An exception IS working time (feature spec §2.2), so all three exception routes fold
        // into the same action rather than earning three of their own. What a reader needs is
        // "the working time on this calendar changed, and here is when" — not the shape of the
        // edit, which is a content history and is `updated_by`'s job.
        await this.recordWorkingTimeChange(tx, {
          organizationId: organization.id,
          calendarId: calendar.id,
          name: calendar.name,
          changedWhat: 'exception',
          principal,
          context,
        });
        return created;
      }),
    );
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
  }

  /**
   * Edit one dated exception's hours and/or label, version-gated.
   *
   * Anti-IDOR by shape: the exception is reached only via `findActiveExceptionByIdInCalendar`,
   * which requires the calendar id too, and that calendar has already been resolved inside the
   * caller's organisation. An exception-id-first lookup would make the calendar a decoration.
   *
   * TWO versions are in play and both matter. The write is gated on the **exception's** version —
   * a stale one is a 409, because someone else changed those hours since they were read. It then
   * bumps the **calendar's**, exactly as create and delete already do, so a client holding a stale
   * calendar is told as well.
   */
  async updateException(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    exceptionId: string,
    dto: UpdateCalendarExceptionDto,
    context?: RequestContext,
  ): Promise<CalendarExceptionWithWindows> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');
    this.assertMayWriteExceptions(principal, calendar.scope, organization.id);

    const existing = await this.calendars.findActiveExceptionByIdInCalendar(
      exceptionId,
      calendar.id,
    );
    if (!existing) throw new NotFoundError('Calendar exception not found.');

    // The same rule create enforces, against the row's OWN first day rather than a sibling field:
    // the first day is not editable here, so a shortened range is measured from where it starts.
    // The DB's exclusion constraint is the backstop for overlap; an empty range is not an overlap
    // with anything, so it is the one shape the constraint cannot express.
    if (dto.endDate !== undefined && dto.endDate < formatCalendarDate(existing.startDate)) {
      throw new ValidationError('The exception’s last day cannot precede its first day.', {
        reason: 'EXCEPTION_RANGE_INVERTED',
        date: formatCalendarDate(existing.startDate),
        endDate: dto.endDate,
      });
    }
    assertSpanWithinCeiling(formatCalendarDate(existing.startDate), dto.endDate);

    const updated = await this.runExceptionWrite(async () =>
      this.prisma.$transaction(async (tx) => {
        const changed = await this.calendars.updateExceptionIfVersionMatches(
          exceptionId,
          dto.version,
          {
            ...(dto.label === undefined ? {} : { label: dto.label }),
            // Extending a range can collide with the next exception along, which is the same 409
            // the create path reports — see `runExceptionWrite`.
            ...(dto.endDate === undefined ? {} : { endDate: parseCalendarDate(dto.endDate) }),
            // `isWorking` and `windows` are mutually exclusive at the DTO, and BOTH absent means the
            // hours are untouched — a label-only edit. `exceptionWindowRowsFor` would answer "no
            // windows" for that case, which is a holiday, so the decision has to be made here.
            ...(dto.windows !== undefined
              ? { windows: dto.windows }
              : dto.isWorking !== undefined
                ? { windows: exceptionWindowRowsFor(undefined, dto.isWorking) }
                : {}),
          },
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This exception has changed since you loaded it.', {
            reason: 'STALE_VERSION',
          });
        }
        await this.calendars.touchVersion(calendar.id, principal.userId, tx);
        await this.recordWorkingTimeChange(tx, {
          organizationId: organization.id,
          calendarId: calendar.id,
          name: calendar.name,
          changedWhat: 'exception',
          principal,
          context,
        });
        return this.calendars.findExceptionWithWindows(exceptionId, tx);
      }),
    );
    if (!updated) throw new NotFoundError('Calendar exception not found.');

    this.logger.info(
      {
        organizationId: organization.id,
        calendarId: calendar.id,
        exceptionId,
        userId: principal.userId,
      },
      'calendar exception updated',
    );
    return updated;
  }

  async removeException(
    principal: Principal,
    orgSlug: string,
    calendarId: string,
    exceptionId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:update', organization.id);

    const calendar = await this.calendars.findActiveByIdInOrg(calendarId, organization.id);
    if (!calendar) throw new NotFoundError('Calendar not found.');
    this.assertMayWriteExceptions(principal, calendar.scope, organization.id);

    const exception = await this.calendars.findActiveExceptionByIdInCalendar(
      exceptionId,
      calendarId,
    );
    if (!exception) throw new NotFoundError('Calendar exception not found.');

    await this.prisma.$transaction(async (tx) => {
      await this.calendars.softDeleteException(exceptionId, principal.userId, tx);
      await this.calendars.touchVersion(calendarId, principal.userId, tx);
      await this.recordWorkingTimeChange(tx, {
        organizationId: organization.id,
        calendarId,
        name: calendar.name,
        changedWhat: 'exception',
        principal,
        context,
      });
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
   * ONE producer for the four routes that change a calendar's working time (ADR-0073 family E).
   *
   * Shared rather than inlined for the ADR-0065 reason: four copies of the same row shape would
   * drift, and the drift would be invisible — each route looks right on its own, and only somebody
   * comparing a shift edit against an exception edit would notice one carries a field the other
   * does not.
   */
  private async recordWorkingTimeChange(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      calendarId: string;
      name: string;
      changedWhat: WorkingTimeChangeKind;
      principal: Principal;
      context: RequestContext | undefined;
    },
  ): Promise<void> {
    await this.audit.record(
      {
        action: 'calendar.working_time_changed',
        outcome: 'SUCCESS',
        organizationId: params.organizationId,
        subjectType: 'CALENDAR',
        subjectId: params.calendarId,
        subjectLabel: params.name,
        after: { name: params.name, changedWhat: params.changedWhat },
        ...auditActor(params.principal, params.context),
      },
      tx,
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
   * Who may write a calendar's dated exceptions (ADR-0053 §2).
   *
   * A holiday, a shutdown day or a half-day on an **ORG** calendar is shared tenant state in exactly
   * the way an edit to its weekly pattern is — it moves every plan in the organisation that inherits
   * that calendar — so it takes the same `calendar:manage_org` capability. Only `updateException`
   * asserted this; adding and removing an exception did not, which made the rule a property of one
   * of the three verbs rather than of the object.
   *
   * That gap is **behaviourally inert today**: every role holding `calendar:update` also holds
   * `calendar:manage_org` (Planner and Org Admin). It is fixed anyway, and as one shared helper, so
   * that the day those two permissions are split apart the answer is in one place rather than
   * spread across three call sites that had already disagreed once.
   */
  private assertMayWriteExceptions(
    principal: Principal,
    scope: CalendarScope,
    organizationId: string,
  ): void {
    if (scope === 'ORG') this.assertCan(principal, 'calendar:manage_org', organizationId);
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

  /**
   * Run a write that can collide with the exclusion constraint, turning `23P01` into the API's
   * 409 `DUPLICATE_EXCEPTION`.
   *
   * Shared by create and update because since ranges became editable both can collide: extending a
   * shutdown into the next bank holiday is the same conflict as adding a second exception on one
   * day, and two translations of one constraint would eventually disagree about which 409 it is.
   */
  private async runExceptionWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (this.isExceptionOverlapViolation(error)) throw this.duplicateExceptionError();
      throw error;
    }
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
