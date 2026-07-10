import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type Calendar, type CalendarException } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Fields a calendar update may change (already converted to DB-ready values). */
export interface CalendarPatch {
  name?: string;
  description?: string | null;
  workingWeekdays?: number;
}

/** A calendar with its active exceptions embedded, ordered by date. */
export type CalendarWithExceptions = Calendar & { exceptions: CalendarException[] };

/**
 * Data-access for the working-day calendar library (ADR-0008, ADR-0024).
 * Centralises the soft-delete filter so no read forgets `deletedAt: null`; write
 * methods accept an optional transaction client. Calendars are an org-scoped
 * SIBLING library (not a hierarchy level), so delete is a self-contained
 * soft-cascade (calendar → its exceptions under one `deleteBatchId`) rather than
 * the tree-shaped `HierarchyLifecycleService`; there is no calendar restore in
 * this slice, so the batch id is stamped only for forward-compatibility and
 * defence in depth. Item lookups are scoped by organisation (anti-IDOR).
 */
@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.CalendarWhereInput = {}): Prisma.CalendarWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.CalendarUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Calendar> {
    return db.calendar.create({ data });
  }

  /** An active calendar scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Calendar | null> {
    return db.calendar.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** An active calendar with its active exceptions (date-ordered) — the read shape. */
  findActiveDetailByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarWithExceptions | null> {
    return db.calendar.findFirst({
      where: this.active({ id, organizationId }),
      include: { exceptions: { where: { deletedAt: null }, orderBy: [{ date: 'asc' }] } },
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

  /** A page of an organisation's active calendars (keyset cursor by id). */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
  }): Promise<Calendar[]> {
    return this.prisma.calendar.findMany({
      where: this.active({ organizationId: params.organizationId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns rows changed — `0` means a version conflict or the row is
   * gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: CalendarPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.calendar.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
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

  createException(
    data: Prisma.CalendarExceptionUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarException> {
    return db.calendarException.create({ data });
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
