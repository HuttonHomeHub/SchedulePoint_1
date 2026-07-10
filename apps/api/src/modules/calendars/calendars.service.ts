import { Injectable } from '@nestjs/common';
import { Prisma, type Calendar, type CalendarException } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

import {
  CalendarRepository,
  type CalendarPatch,
  type CalendarWithExceptions,
} from './calendar.repository';
import type { CreateCalendarExceptionDto } from './dto/create-calendar-exception.dto';
import type { CreateCalendarDto } from './dto/create-calendar.dto';
import type { UpdateCalendarDto } from './dto/update-calendar.dto';

/** Machine-readable conflict reasons carried in a {@link ConflictError}'s `details`. */
export const CALENDAR_CONFLICT = {
  /** A calendar name collides with an active calendar in the same org. */
  DUPLICATE_CALENDAR: 'DUPLICATE_CALENDAR',
  /** An exception date collides with an active exception on the same calendar. */
  DUPLICATE_EXCEPTION: 'DUPLICATE_EXCEPTION',
  /** Deleting a calendar still referenced by an active plan (added in Task C1). */
  CALENDAR_IN_USE: 'CALENDAR_IN_USE',
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
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CalendarsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Calendar[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:read', organization.id);

    const rows = await this.calendars.findManyActiveByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
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

    try {
      const calendar = await this.calendars.create({
        organizationId: organization.id,
        name: dto.name,
        workingWeekdays: dto.workingWeekdays,
        description: dto.description ?? null,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        { organizationId: organization.id, calendarId: calendar.id, userId: principal.userId },
        'calendar created',
      );
      return { ...calendar, exceptions: [] };
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateCalendarError();
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

    if (!(await this.calendars.findActiveByIdInOrg(calendarId, organization.id))) {
      throw new NotFoundError('Calendar not found.');
    }

    const patch: CalendarPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.workingWeekdays !== undefined) patch.workingWeekdays = dto.workingWeekdays;

    try {
      const changed = await this.calendars.updateIfVersionMatches(
        calendarId,
        dto.version,
        patch,
        principal.userId,
      );
      if (changed === 0) {
        throw new ConflictError('This calendar was changed elsewhere. Refresh and try again.');
      }
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateCalendarError();
      throw error;
    }

    const updated = await this.calendars.findActiveDetailByIdInOrg(calendarId, organization.id);
    if (!updated) throw new NotFoundError('Calendar not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, calendarId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'calendar:delete', organization.id);

    if (!(await this.calendars.findActiveByIdInOrg(calendarId, organization.id))) {
      throw new NotFoundError('Calendar not found.');
    }

    // The delete-in-use guard (count active plans referencing the calendar → 409
    // CALENDAR_IN_USE) is added in Task C1 with `plans.calendar_id`; no plan can
    // reference a calendar yet, so the delete is unguarded-but-unreferenced.
    await this.prisma.$transaction((tx) =>
      this.calendars.softDeleteWithExceptions(calendarId, principal.userId, tx),
    );
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
  ): Promise<CalendarException> {
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
      if (this.isUniqueViolation(error)) throw this.duplicateExceptionError();
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

  /** A Prisma unique-violation from a partial unique index (name or exception date). */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateCalendarError(): ConflictError {
    return new ConflictError('A calendar with this name already exists.', {
      reason: CALENDAR_CONFLICT.DUPLICATE_CALENDAR,
    });
  }

  private duplicateExceptionError(): ConflictError {
    return new ConflictError('An exception for this date already exists on this calendar.', {
      reason: CALENDAR_CONFLICT.DUPLICATE_EXCEPTION,
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
