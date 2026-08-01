import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Calendar,
  type CalendarException,
  type CalendarExceptionWindow,
  type CalendarScope,
  type CalendarShift,
} from '@prisma/client';
import { WorkingWeekdays } from '@repo/types';

import { archivedFilterWhere, type ArchivedFilter } from '../../common/query/library-filters';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The `?q=` term for a calendar list (ADR-0053 §4 / US-8). A calendar has no `code`, so the
 * search is `name` alone — a single case-insensitive `contains`, i.e. `name ILIKE '%q%'`, which
 * no btree can serve (leading wildcard). Deliberately: the org composite bounds the candidate
 * set to one tenant in cursor order and this is a recheck over that bounded set. Returned as a
 * spreadable fragment (`{}` when there is no search) — and NOT as an `OR`, so it composes with
 * the project list's tier `OR` without either clobbering the other.
 */
function calendarSearchWhere(search: string | undefined): Prisma.CalendarWhereInput {
  if (search === undefined) return {};
  return { name: { contains: search, mode: 'insensitive' } };
}

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
  /** New explicit weekly shift windows; replaces the week as a set, like the mask above. */
  shifts?: readonly ShiftRow[];
  /**
   * The calendar tier (ADR-0053 §1). Always written together with {@link CalendarPatch.projectId}
   * so the pair can never disagree — the service sets both or neither, and
   * ck_calendars_scope_parent is the DB backstop.
   */
  scope?: CalendarScope;
  projectId?: string | null;
}

/** One stored working window (ADR-0036 §2); minutes from local midnight, `[start, end)`. */
export interface WindowRow {
  startMinute: number;
  endMinute: number;
}

/** One stored weekly shift window — a {@link WindowRow} pinned to a weekday (0 = Monday). */
export interface ShiftRow extends WindowRow {
  weekday: number;
}

/**
 * The scalar inputs plus the weekly pattern a calendar create needs.
 *
 * The pattern arrives EITHER as explicit `shifts` (the storage form — split shifts, night shifts,
 * a half-day Friday) OR as a `workingWeekdays` mask, which is shorthand for full-day windows on the
 * named days. The DTO has already refused a body carrying both or neither, so exactly one is set.
 */
export interface CreateCalendarInput {
  organizationId: string;
  name: string;
  workingWeekdays?: number;
  shifts?: readonly ShiftRow[];
  description: string | null;
  /** The tier to create at (ADR-0053 §1); `PROJECT` requires a `projectId`, `ORG` forbids one. */
  scope: CalendarScope;
  projectId: string | null;
  createdBy: string;
  updatedBy: string;
}

/**
 * Which tier(s) a calendar list should return (ADR-0053 §1). `org` is the DEFAULT on the
 * organisation list, so the shared library keeps exactly today's result set for existing
 * clients; `project` and `all` are opt-in.
 */
export type CalendarScopeFilter = 'org' | 'project' | 'all';

/**
 * The inputs a dated calendar exception create needs.
 *
 * The day's working time arrives EITHER as explicit `windows` (the storage form — a half-day
 * before a holiday, a short-crew shutdown day, a turnaround calendar's only working hours) OR as
 * the whole-day `isWorking` shorthand. The DTO has already refused a body carrying both.
 */
export interface CreateCalendarExceptionInput {
  organizationId: string;
  calendarId: string;
  date: Date;
  isWorking: boolean;
  windows?: readonly WindowRow[];
  label: string | null;
  createdBy: string;
  updatedBy: string;
}

/**
 * One imported calendar (+ its whole-day exceptions) for the batched import write. Ids are
 * CLIENT-ASSIGNED (the `@default(uuid(7))` is bypassed) so the caller can resolve key→id references
 * before any DB write (interchange commit, ADR-0050 B3). Shifts derive from the mask and windows from
 * `isWorking`, exactly as the single `create`/`createException`.
 */
export interface ImportCalendarBatchInput {
  id: string;
  organizationId: string;
  name: string;
  workingWeekdays: number;
  /**
   * The tier to create the imported calendar at (ADR-0053 §5). An import defaults to `PROJECT` —
   * pinned to the import's target project, so a foreign file stops permanently polluting the shared
   * organisation library — and only lands `ORG` where an org-global holder (a resource) needs it, or
   * where the caller explicitly opted its global calendars in. Written as a PAIR with `projectId`, so
   * the columns can never disagree (`ck_calendars_scope_parent` is the DB backstop).
   */
  scope: CalendarScope;
  projectId: string | null;
  createdBy: string;
  updatedBy: string;
  exceptions: readonly {
    id: string;
    date: Date;
    isWorking: boolean;
    label: string | null;
  }[];
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

/**
 * The weekly pattern as stored rows, from whichever form the caller supplied.
 *
 * ONE function rather than a branch at each call site: `create`, `update` and the interchange batch
 * all have to agree on what "no shifts and no mask" means, and three copies of that rule is how they
 * stop agreeing. Explicit shifts win; a mask expands to full-day windows; neither yields an empty
 * week, which is the window-only calendar (TECH_DEBT #79) and is the caller's business to have
 * validated, not this function's to second-guess.
 */
function shiftRowsFor(
  shifts: readonly ShiftRow[] | undefined,
  mask: number | undefined,
): ShiftRow[] {
  if (shifts !== undefined) return [...shifts];
  return mask === undefined ? [] : WorkingWeekdays.toFullDayShifts(mask);
}

/**
 * A dated exception's replacement windows, from whichever form the caller supplied — the
 * `shiftRowsFor` rule one table over, and for the same reason: `createException` and the
 * interchange batch both have to agree what `isWorking` means in window terms.
 *
 * Explicit windows win; `isWorking` is shorthand for the whole-day case (`true` ⇒ one full-day
 * window, `false` ⇒ none, which is a holiday). The DTO rejects sending both, and rejects an
 * empty `windows` array so "no working time" has exactly one spelling.
 */
function exceptionWindowRowsFor(
  windows: readonly WindowRow[] | undefined,
  isWorking: boolean,
): WindowRow[] {
  if (windows !== undefined) return [...windows];
  return isWorking ? [{ startMinute: 0, endMinute: MINUTES_PER_DAY }] : [];
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
        // The tier + its owning project are written as a PAIR (ADR-0053 §1); the service has
        // already validated the project is active and in-org.
        scope: input.scope,
        projectId: input.projectId,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
        shifts: { create: shiftRowsFor(input.shifts, input.workingWeekdays) },
      },
      include: { shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] } },
    });
  }

  /**
   * Batch-insert many calendars — each with its full-day shift rows and whole-day exceptions/windows —
   * in ONE `createMany` per table, inside the caller's transaction (interchange commit, ADR-0050 B3).
   * Ids are client-assigned so the caller resolves key→id references up front. Insert order is
   * FK-safe (calendars → shifts → exceptions → windows). Materialises the same mask→full-day-shift and
   * `isWorking`→full-day-window mapping as the single `create`/`createException`, so the public
   * weekday-mask / whole-day-exception contract is identical — just one batched write instead of a
   * per-row loop (which risked Prisma's interactive-transaction timeout at the import ceiling).
   */
  async createManyForImport(
    calendars: readonly ImportCalendarBatchInput[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (calendars.length === 0) return;
    const calendarRows: Prisma.CalendarCreateManyInput[] = [];
    const shiftRows: Prisma.CalendarShiftCreateManyInput[] = [];
    const exceptionRows: Prisma.CalendarExceptionCreateManyInput[] = [];
    const windowRows: Prisma.CalendarExceptionWindowCreateManyInput[] = [];

    for (const calendar of calendars) {
      calendarRows.push({
        id: calendar.id,
        organizationId: calendar.organizationId,
        name: calendar.name,
        description: null,
        // The tier + its owning project, always written together (ADR-0053 §1/§5).
        scope: calendar.scope,
        projectId: calendar.projectId,
        createdBy: calendar.createdBy,
        updatedBy: calendar.updatedBy,
      });
      for (const shift of WorkingWeekdays.toFullDayShifts(calendar.workingWeekdays)) {
        shiftRows.push({ calendarId: calendar.id, ...shift });
      }
      for (const exception of calendar.exceptions) {
        exceptionRows.push({
          id: exception.id,
          organizationId: calendar.organizationId,
          calendarId: calendar.id,
          // A single-day inclusive range (ADR-0036 §2) — start == end, as the single createException.
          startDate: exception.date,
          endDate: exception.date,
          label: exception.label,
          createdBy: calendar.createdBy,
          updatedBy: calendar.updatedBy,
        });
        // Through the same helper as the single create — an inline `isWorking ? full day : none`
        // here would be a second statement of the rule, free to drift from the one above.
        for (const window of exceptionWindowRowsFor(undefined, exception.isWorking)) {
          windowRows.push({ calendarExceptionId: exception.id, ...window });
        }
      }
    }

    await db.calendar.createMany({ data: calendarRows });
    if (shiftRows.length > 0) await db.calendarShift.createMany({ data: shiftRows });
    if (exceptionRows.length > 0) await db.calendarException.createMany({ data: exceptionRows });
    if (windowRows.length > 0) {
      await db.calendarExceptionWindow.createMany({ data: windowRows });
    }
  }

  /**
   * The names already TAKEN in one tier, out of a candidate set — the import's name-collision probe
   * (ADR-0053 §5). A calendar name is unique per tier among non-deleted rows (`uq_calendars_org_name`
   * for `ORG`, `uq_calendars_project_name` for `PROJECT`), so an import that blindly inserted a name the
   * tenant already holds would abort the whole commit on a `P2002` it could never resolve. One indexed
   * `IN` query per tier, never a query per calendar.
   *
   * ARCHIVED rows are deliberately included: archiving does NOT free the name (ADR-0053 §4), so an
   * archived calendar still blocks the insert and must still be disambiguated around. That is also why
   * calendars have no unarchive-on-match rule — an import never REUSES a calendar (see the service), so
   * there is nothing to unarchive.
   */
  async findTakenNames(
    params: {
      organizationId: string;
      scope: CalendarScope;
      projectId: string | null;
      names: readonly string[];
    },
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Set<string>> {
    if (params.names.length === 0) return new Set();
    const rows = await db.calendar.findMany({
      where: this.active({
        organizationId: params.organizationId,
        scope: params.scope,
        projectId: params.projectId,
        name: { in: [...params.names] },
      }),
      select: { name: true },
    });
    return new Set(rows.map((row) => row.name));
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
   * A batch of active calendars (by id set) with their shift rows and active exceptions (each with
   * windows), scoped to the org (anti-IDOR) — the schedule-interchange EXPORT read (ADR-0050 M4a). One
   * query per table (calendars joined to their shifts + exceptions + windows), never a query-per-calendar,
   * mirroring {@link findActiveDetailByIdInOrg} for a set of ids. Soft-deleted calendars (and any id not in
   * the org) are simply absent from the result, so the caller resolves only the calendars it can read.
   */
  findActiveDetailByIdsInOrg(
    ids: readonly string[],
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarWithExceptions[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return db.calendar.findMany({
      where: this.active({ id: { in: [...ids] }, organizationId }),
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
   * The ARCHIVED calendar holding `name` in the tier a create/rename was aiming at, if any
   * (ADR-0053 §4). An archived row deliberately keeps its name — the partial uniques stay
   * predicated on `deleted_at IS NULL` alone so that unarchive, an unguarded version-gated
   * UPDATE, can never fail on a name taken meanwhile (see the M4 migration's decision (1)).
   * The accepted cost is that creating an ACTIVE calendar on that name is a 409; this lookup
   * runs ONLY on that 409 path, to name the archived row in `details` so the UI can offer
   * "unarchive it instead" rather than a dead end.
   */
  findArchivedByNameInTier(
    params: {
      organizationId: string;
      name: string;
      scope: CalendarScope;
      projectId: string | null;
    },
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Calendar | null> {
    return db.calendar.findFirst({
      where: this.active({
        organizationId: params.organizationId,
        name: params.name,
        scope: params.scope,
        ...(params.scope === 'PROJECT' ? { projectId: params.projectId } : {}),
        archivedAt: { not: null },
      }),
    });
  }

  /**
   * Set or clear `archived_at` on an active calendar, gated on the optimistic `version`
   * (ADR-0053 §4, workflow W4). A metadata-only write: no advisory lock, no cascade and no
   * in-use guard — archiving is explicitly NOT blocked by use, which is the entire point and
   * the contrast with delete. Returns rows changed; `0` means a version conflict or the row is
   * gone, which the service maps to 409 / 404 exactly as the other version-gated updates do.
   */
  async setArchivedIfVersionMatches(
    id: string,
    expectedVersion: number,
    archivedAt: Date | null,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { count } = await db.calendar.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { archivedAt, updatedBy: actorId, version: { increment: 1 } },
    });
    return count;
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

  /**
   * A page of an organisation's active calendars with their shift rows (keyset cursor by id),
   * filtered by tier (ADR-0053 §1). `scope` defaults to `org` at the service, so an existing
   * client that sends nothing sees exactly today's result set — project calendars are a
   * usability filter here, never an authorisation boundary (the write-time
   * `assertCalendarUsableBy` guard is the security control).
   */
  findManyActiveByOrg(params: {
    organizationId: string;
    scope: CalendarScopeFilter;
    archived: ArchivedFilter;
    search?: string;
    take: number;
    cursor?: string;
  }): Promise<CalendarWithShifts[]> {
    return this.prisma.calendar.findMany({
      where: this.active({
        organizationId: params.organizationId,
        ...(params.scope === 'all' ? {} : { scope: params.scope === 'org' ? 'ORG' : 'PROJECT' }),
        ...archivedFilterWhere(params.archived),
        ...calendarSearchWhere(params.search),
      }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] } },
    });
  }

  /**
   * A page of the calendars USABLE IN a project (ADR-0053 §1) — its own PROJECT-scoped
   * calendars plus every ORG-scoped one — which is exactly the set `assertCalendarUsableBy`
   * accepts for a plan/activity in that project, so a picker fed from this list can never
   * offer a calendar the write seam will reject. Same keyset cursor + shift include as the
   * org list. Index note (corrected after the M6 backend-performance review measured it): there
   * is no `idx_calendars_project_created` composite — the M1 migration creates only the partial
   * single-column `idx_calendars_project_id`. In practice the whole `OR` is served by the
   * `(organization_id, created_at, id)` composite, which supplies the cursor ordering directly
   * with the scope/project predicate applied as a cheap per-row recheck (measured: 0.56 ms at the
   * ADR-0053 ceiling of 1,000 calendars). Do not add a composite on a guess — measure first.
   */
  findManyActiveForProject(params: {
    organizationId: string;
    projectId: string;
    archived: ArchivedFilter;
    search?: string;
    take: number;
    cursor?: string;
  }): Promise<CalendarWithShifts[]> {
    return this.prisma.calendar.findMany({
      where: this.active({
        organizationId: params.organizationId,
        OR: [{ scope: 'ORG' }, { scope: 'PROJECT', projectId: params.projectId }],
        ...archivedFilterWhere(params.archived),
        ...calendarSearchWhere(params.search),
      }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { shifts: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] } },
    });
  }

  /**
   * Count the ACTIVE plans using `calendarId` that live OUTSIDE `projectId` — the narrowing
   * guard (ADR-0053 §2, W2). Narrowing an ORG calendar to one project is only safe when no
   * referencer sits outside it; plans inside the target project keep working, so they are
   * deliberately excluded from the count. Backed by the partial `idx_plans_calendar_id`
   * (the `project_id` filter is a cheap re-check on the few matching rows).
   */
  countActivePlansUsingOutsideProject(
    calendarId: string,
    projectId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.plan.count({
      where: { calendarId, deletedAt: null, projectId: { not: projectId } },
    });
  }

  /**
   * Count the ACTIVE activities using `calendarId` whose PLAN lives outside `projectId` — the
   * other half of the narrowing guard (ADR-0053 §2). An activity has no `project_id` of its
   * own, so the scope is expressed through its plan (the same relation filter the step/note
   * cascades use). Backed by the partial `idx_activities_calendar_id`.
   */
  countActiveActivitiesUsingOutsideProject(
    calendarId: string,
    projectId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.activity.count({
      where: { calendarId, deletedAt: null, plan: { projectId: { not: projectId } } },
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
    const { workingWeekdays, shifts, ...scalar } = patch;
    const result = await db.calendar.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...scalar, updatedBy, version: { increment: 1 } },
    });
    if (result.count > 0 && (workingWeekdays !== undefined || shifts !== undefined)) {
      // Replace the weekly pattern as a set (the calendar's version bump above is the lock).
      // Either field replaces the WHOLE week — they are two spellings of one value, so a patch
      // naming one must not leave rows the other put there.
      await db.calendarShift.deleteMany({ where: { calendarId: id } });
      const rows = shiftRowsFor(shifts, workingWeekdays).map((row) => ({
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

  /** Create a dated exception with its replacement windows (explicit, or derived from `isWorking`). */
  createException(
    input: CreateCalendarExceptionInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CalendarExceptionWithWindows> {
    return db.calendarException.create({
      data: {
        organizationId: input.organizationId,
        calendarId: input.calendarId,
        // The public dated exception is a single-day inclusive range (ADR-0036 §2); a multi-day
        // range is storable but not yet authorable, so both ends are the one date.
        startDate: input.date,
        endDate: input.date,
        label: input.label,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
        windows: { create: exceptionWindowRowsFor(input.windows, input.isWorking) },
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
