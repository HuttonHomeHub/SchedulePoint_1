import type { Calendar, Prisma } from '@prisma/client';
import { CALENDAR_ERROR } from '@repo/types';

import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import { NotFoundError, ValidationError } from '../../common/errors/domain-errors';

import type { CalendarRepository } from './calendar.repository';

/**
 * Where a calendar is about to be bound. `projectId` is the project the holder lives in
 * (a plan's project, or an activity's plan's project); `null` means the holder is
 * ORG-GLOBAL — today only a {@link Resource} — for which ANY project-scoped calendar is a
 * hard reject (ADR-0053 §2). It is deliberately NOT optional: a new seam must state which
 * it is, so "forgot to pass a project" cannot silently become "org-global, anything goes".
 */
export interface CalendarUsableByParams {
  calendarId: string;
  organizationId: string;
  projectId: string | null;
}

/**
 * THE calendar-scope invariant, in one place (ADR-0053 §2). A calendar is usable by a
 * holder iff it is an ACTIVE calendar in the holder's own organisation **and** either
 *
 * - `scope = ORG` — the shared organisation library, usable anywhere in the org; or
 * - `scope = PROJECT` and its `project_id` is the holder's own project.
 *
 * Every write seam that binds a `calendar_id` (`plan.calendarId`, `activity.calendarId`,
 * `resource.calendarId`) calls exactly this function, so the tier is an invariant rather
 * than a convention that each seam re-implements slightly differently. The
 * per-relationship lag calendar is NOT a seam: `ActivityDependency.lagCalendar` is a
 * `LagCalendarSource` enum that dereferences a calendar an endpoint already resolved (and
 * therefore already guarded), not a calendar FK — a structural test pins that down so a
 * future FK cannot land unguarded.
 *
 * Takes the same calendar advisory lock the `CALENDAR_IN_USE` delete guard uses, so a
 * calendar can never be bound mid-deletion (no TOCTOU dangling reference) and a concurrent
 * narrow cannot slip past the count. Must run inside the caller's write transaction.
 *
 * Failure modes are deliberately split so the tier never becomes a cross-tenant existence
 * oracle: a foreign / soft-deleted / unknown id is indistinguishable from missing (**404**),
 * while an in-org calendar of the wrong tier is a semantic rejection (**422**) that names
 * the owning project in `details`.
 */
export async function assertCalendarUsableBy(
  db: Prisma.TransactionClient,
  calendars: CalendarRepository,
  params: CalendarUsableByParams,
): Promise<Calendar> {
  await acquireCalendarWriteLock(db, params.calendarId);
  const calendar = await calendars.findActiveByIdInOrg(
    params.calendarId,
    params.organizationId,
    db,
  );
  if (!calendar) throw new NotFoundError('Calendar not found.');

  // The shared tier is usable by every holder in the org — today's only behaviour, and the
  // reason every pre-ADR-0053 row (all ORG) keeps working unchanged.
  if (calendar.scope === 'ORG') return calendar;

  // scope === 'PROJECT' from here: the holder must be inside the owning project.
  if (params.projectId === null) {
    throw new ValidationError(CALENDAR_ERROR.RESOURCE_REQUIRES_ORG_CALENDAR, {
      reason: 'RESOURCE_REQUIRES_ORG_CALENDAR',
      calendarId: calendar.id,
      // The project that owns the calendar — same org as the caller, so naming it leaks nothing.
      projectId: calendar.projectId,
    });
  }
  if (calendar.projectId !== params.projectId) {
    throw new ValidationError(CALENDAR_ERROR.CALENDAR_WRONG_SCOPE, {
      reason: 'CALENDAR_WRONG_SCOPE',
      calendarId: calendar.id,
      projectId: calendar.projectId,
    });
  }
  return calendar;
}
