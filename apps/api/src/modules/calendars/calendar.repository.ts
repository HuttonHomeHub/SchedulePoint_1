import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Calendar,
  type CalendarException,
  type CalendarExceptionWindow,
  type CalendarShift,
} from '@prisma/client';
import { WorkingWeekdays } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Day↔minute factor (ADR-0036 §4.2). The public calendar contract stays weekday-mask +
 * whole-day-exception denominated; storage is intraday shift/window rows. Every API-created
 * weekday becomes one full-day `[0, 1440)` shift, and a worked exception one full-day window,
 * so the mask/day round-trips exactly. Richer shift calendars are not API-authorable yet
 * (M1 follow-on).
 */
const MINUTES_PER_DAY = 1440;

/** Fields a calendar update may change (already converted to DB-ready values). */
export interface CalendarPatch {
  name?: string;
  description?: string | null;
  /** New weekday mask; the repository replaces the calendar's full-day shift rows to match. */
  workingWeekdays?: number;
}

/** The scalar inputs plus the weekday mask a calendar create needs (shifts derived from the mask). */
export interface CreateCalendarInput {
  organizationId: string;
  name: string;
  workingWeekdays: number;
  description: string | null;
  createdBy: string;
  updatedBy: string;
}

/** The inputs a whole-day calendar exception create needs (windows derived from `isWorking`). */
export interface CreateCalendarExceptionInput {
  organizationId: string;
  calendarId: string;
  date: Date;
  isWorking: boolean;
  label: string | null;
  createdBy: string;
  updatedBy: string;
}

/** A calendar with its weekly shift rows embedded (weekday/start-ordered) — the list read shape. */
export type CalendarWithShifts = Calendar & { shifts: CalendarShift[] };
/** A dated exception with its replacement windows embedded (start-ordered). */
export type CalendarExceptionWithWindows = CalendarException & {
  windows: CalendarExceptionWindow[];
};
/** A calendar with its shifts and its active exceptions (each with windows) — the detail read shape. */
export type CalendarWithExceptions = CalendarWithShifts & {
  exceptions: CalendarExceptionWithWindows[];
};

/** The full-day `[0, 1440)` shift rows a weekday mask maps to (ADR-0036 §4.2). */
function fullDayShiftsFromMask(
  mask: number,
): { weekday: number; startMinute: number; endMinute: number }[] {
  return WorkingWeekdays.toIndices(mask).map((weekday) => ({
    weekday,
    startMinute: 0,
    endMinute: MINUTES_PER_DAY,
  }));
}

/**
 * Data-access for the working-day calendar library (ADR-0008, ADR-0024, ADR-0036).
 * Centralises the soft-delete filter so no read forgets `deletedAt: null`; write
 * methods accept an optional transaction client. Calendars are an org-scoped
 * SIBLING library (not a hierarchy level), so delete is a self-contained
 * soft-cascade (calendar → its exceptions under one `deleteBatchId`) rather than
 * the tree-shaped `HierarchyLifecycleService`; there is no calendar restore in
 * this slice, so the batch id is stamped only for forward-compatibility and
 * defence in depth. Item lookups are scoped by organisation (anti-IDOR). The
 * public weekday-mask / whole-day-exception contract is converted to and from the
 * stored shift/window rows (ADR-0036 §7) at this boundary.
 */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.CalendarWhereInput = {}): Prisma.CalendarWhereInput {
    return { ...where, deletedAt: null };
  }

  /** Create a calendar, materialising its weekday mask as full-day shift rows. */
  create(
    input: CreateCalendarInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarWithShifts> {
    return db.calendar.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
        shifts: { create: fullDayShiftsFromMask(input.workingWeekdays) },
      },
      include: { shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] } },
    });
  }

  /** An active calendar scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Calendar | null> {
    return db.calendar.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** An active calendar with its shift rows and active exceptions (each with windows) — the read shape. */
  findActiveDetailByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarWithExceptions | null> {
    return db.calendar.findFirst({
      where: this.active({ id, organizationId }),
      include: {
        shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
        exceptions: {
          where: { deletedAt: null },
          orderBy: [{ startDate: 'asc' }],
          include: { windows: { orderBy: [{ startMinute: 'asc' }] } },
        },
      },
    });
  }

  /**
   * An active calendar in an org by name (case-sensitive) — used to resolve the
   * seeded `Standard` calendar that new plans default to (Task C1). Returns null if
   * the org has no active calendar with that name (e.g. it was renamed/deleted).
   */
  findActiveByNameInOrg(
    organizationId: string,
    name: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Calendar | null> {
    return db.calendar.findFirst({ where: this.active({ organizationId, name }) });
  }

  /**
   * Count the ACTIVE plans whose default calendar is `calendarId` — the delete-in-use
   * guard (Task C1). A soft-deleted plan does not count (it no longer references the
   * calendar for scheduling). Backed by the partial `idx_plans_calendar_id`.
   */
  countActivePlansUsing(
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.plan.count({ where: { calendarId, deletedAt: null } });
  }

  /**
   * Count the ACTIVE activities whose own calendar is `calendarId` (M5, ADR-0037) — the other
   * half of the delete-in-use guard. A soft-deleted activity does not count (RESTRICT stays as
   * DB defence in depth). Backed by the partial `idx_activities_calendar_id`.
   */
  countActiveActivitiesUsing(
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.activity.count({ where: { calendarId, deletedAt: null } });
  }

  /** A page of an organisation's active calendars with their shift rows (keyset cursor by id). */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<CalendarWithShifts[]> {
    return this.prisma.calendar.findMany({
      where: this.active({ organizationId: params.organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] } },
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. When the mask changes, the calendar's full-day shift rows are replaced
   * as a set inside the same (caller-provided) transaction. Returns rows changed —
   * `0` means a version conflict or the row is gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: CalendarPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { workingWeekdays, ...scalar } = patch;
    const result = await db.calendar.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...scalar, updatedBy, version: { increment: 1 } },
    });
    if (result.count > 0 && workingWeekdays !== undefined) {
      // Replace the weekly pattern as a set (the calendar's version bump above is the lock).
      await db.calendarShift.deleteMany({ where: { calendarId: id } });
      const rows = fullDayShiftsFromMask(workingWeekdays).map((row) => ({
        ...row,
        calendarId: id,
      }));
      if (rows.length > 0) await db.calendarShift.createMany({ data: rows });
    }
    return result.count;
  }

  /**
   * Soft-delete a calendar and its active exceptions under one batch id, in the
   * caller's transaction. The `deletedAt: null` guards make it idempotent under a
   * concurrent delete. The caller must have verified scope + authorisation and
   * (from Task C1) that no active plan references the calendar.
   */
  async softDeleteWithExceptions(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const stamp = { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId };
    await db.calendarException.updateMany({
      where: { calendarId: id, deletedAt: null },
      data: stamp,
    });
    await db.calendar.updateMany({ where: { id, deletedAt: null }, data: stamp });
  }

  /** Create a whole-day exception, materialising `isWorking` as a full-day window (or none). */
  createException(
    input: CreateCalendarExceptionInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarExceptionWithWindows> {
    return db.calendarException.create({
      data: {
        organizationId: input.organizationId,
        calendarId: input.calendarId,
        // The public whole-day exception is a single-day inclusive range (ADR-0036 §2).
        startDate: input.date,
        endDate: input.date,
        label: input.label,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
        windows: input.isWorking
          ? { create: [{ startMinute: 0, endMinute: MINUTES_PER_DAY }] }
          : { create: [] },
      },
      include: { windows: { orderBy: [{ startMinute: 'asc' }] } },
    });
  }

  /** An active exception scoped to its calendar (the calendar is already org-scoped). */
  findActiveExceptionByIdInCalendar(
    exceptionId: string,
    calendarId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarException | null> {
    return db.calendarException.findFirst({
      where: { id: exceptionId, calendarId, deletedAt: null },
    });
  }

  /** Soft-delete one exception. Returns rows changed (`0` if already gone). */
  async softDeleteException(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.calendarException.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
    return result.count;
  }

  /**
   * Bump a calendar's optimistic-lock `version` (and `updatedBy`) — called when an
   * exception is added or removed so the calendar's version reflects that its
   * exception set changed (a stale calendar edit then correctly 409s).
   */
  async touchVersion(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.calendar.updateMany({
      where: { id, deletedAt: null },
      data: { updatedBy: actorId, version: { increment: 1 } },
    });
  }
}
