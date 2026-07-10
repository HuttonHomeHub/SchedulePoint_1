import { Prisma } from '@prisma/client';

/**
 * The fixed advisory-lock namespace for calendar-assignment writes. Two operations
 * must serialise on a calendar to avoid a plan dangling a reference to a deleted
 * calendar: **deleting** a calendar (which checks no active plan uses it) and
 * **assigning** that calendar to a plan. Both take the lock under THIS namespace so
 * they contend on the same key; changing it in one place only would silently break
 * that mutual exclusion, so both call sites go through this helper.
 */
const CALENDAR_LOCK_NAMESPACE = 'calendar-assign';

/**
 * Take a transaction-scoped Postgres advisory lock keyed by the calendar. The
 * calendar delete-in-use guard and a plan's calendar assignment serialise on this
 * key, so a calendar can never be soft-deleted in the window between another
 * request's "no plan uses it" check and its write (and vice versa). Different
 * calendars hash to different keys and never contend. Auto-releases at transaction
 * end. Must be called inside a `$transaction` (the `xact` variant).
 *
 * A `hashtext` collision between two distinct calendar ids only causes harmless
 * false contention (they serialise unnecessarily) — never cross-calendar
 * corruption — so the small key space is acceptable.
 */
export async function acquireCalendarWriteLock(
  db: Prisma.TransactionClient,
  calendarId: string,
): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_LOCK_NAMESPACE}), hashtext(${calendarId}))`;
}
