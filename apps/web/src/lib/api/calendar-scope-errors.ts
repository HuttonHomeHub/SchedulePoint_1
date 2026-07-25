import { CALENDAR_ERROR, type CalendarErrorReason } from '@repo/types';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Client-side mapping of the calendar-scope rejections (ADR-0053 §2) to the messages a planner
 * reads. It lives in `lib` (shared), not in the calendars feature, because THREE features surface
 * the same rejections — calendars, plans (the plan calendar picker), activities and resources — and
 * a feature may never import a sibling feature (docs/FRONTEND_ARCHITECTURE.md: "features → shared,
 * never the reverse").
 *
 * The base sentences come from `CALENDAR_ERROR` in `@repo/types`, so the same rejection reads
 * identically on both sides of the wire; this module only adds what the client can add — the *next
 * action*, and the per-class counts the 409 carries.
 */

/** A PROJECT-scoped calendar was assigned outside its owning project (→ 422). */
export const CALENDAR_WRONG_SCOPE = 'CALENDAR_WRONG_SCOPE';
/** A PROJECT-scoped calendar was assigned to an org-global resource (→ 422). */
export const RESOURCE_REQUIRES_ORG_CALENDAR = 'RESOURCE_REQUIRES_ORG_CALENDAR';
/** Narrowing an ORG calendar to one project while it is still used outside it (→ 409). */
export const CALENDAR_SCOPE_NARROWING_BLOCKED = 'CALENDAR_SCOPE_NARROWING_BLOCKED';
/** `scope: PROJECT` needs a `projectId`, and `scope: ORG` forbids one (→ 422). */
export const CALENDAR_SCOPE_PROJECT_MISMATCH = 'CALENDAR_SCOPE_PROJECT_MISMATCH';

/**
 * The `details` a narrowing 409 carries: the blocking totals, split per referencing class so the
 * message can tell a planner *what* to reassign, not merely that something is in the way.
 */
interface NarrowingBlockedDetails {
  reason?: string;
  count?: number;
  plans?: number;
  activities?: number;
  resources?: number;
}

/** The machine-readable `details.reason` of an API error, when it carries one. */
function reasonOf(error: unknown): string | undefined {
  if (!(error instanceof ApiFetchError)) return undefined;
  return (error.error.details as { reason?: string } | undefined)?.reason;
}

/** `2 plans` / `1 activity` — a count with its class, correctly singularised. Zero is dropped. */
function countPhrase(count: number | undefined, singular: string, plural: string): string | null {
  if (!count) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "2 plans, 1 activity and 3 resources" — an Oxford-free list of the non-zero classes. */
function joinCounts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The full, actionable message for a blocked narrowing (409). The API refuses to narrow an
 * organisation calendar into one project while anything OUTSIDE that project still references it,
 * and returns the blocking totals per class — so the message names them and says what to do, rather
 * than leaving the planner to guess which plans are in the way.
 */
function narrowingBlockedMessage(details: NarrowingBlockedDetails): string {
  const parts = [
    countPhrase(details.plans, 'plan', 'plans'),
    countPhrase(details.activities, 'activity', 'activities'),
    countPhrase(details.resources, 'resource', 'resources'),
  ].filter((part): part is string => part !== null);

  const base = CALENDAR_ERROR.CALENDAR_SCOPE_NARROWING_BLOCKED;
  if (parts.length === 0) {
    const total = details.count ?? 0;
    return total > 0
      ? `${base} ${total} reference${total === 1 ? '' : 's'} must move to another calendar first.`
      : `${base} Reassign what still uses it, then try again.`;
  }
  return `${base} Still used by ${joinCounts(parts)} outside it — reassign them to another calendar first.`;
}

/**
 * Map an API error to a calendar-scope message, or `null` when it is not one of them (the caller
 * then falls back to its existing generic handling — this helper never swallows an unrelated error).
 */
export function calendarScopeErrorMessage(error: unknown): string | null {
  const reason = reasonOf(error);
  if (reason === undefined) return null;

  if (reason === CALENDAR_SCOPE_NARROWING_BLOCKED) {
    const details = (error as ApiFetchError).error.details as NarrowingBlockedDetails | undefined;
    return narrowingBlockedMessage(details ?? {});
  }

  if (reason === CALENDAR_WRONG_SCOPE) {
    return `${CALENDAR_ERROR.CALENDAR_WRONG_SCOPE} Pick an organisation calendar, or one that belongs to this project.`;
  }

  if (reason === RESOURCE_REQUIRES_ORG_CALENDAR) {
    return `${CALENDAR_ERROR.RESOURCE_REQUIRES_ORG_CALENDAR} Promote the calendar to the organisation library, or pick one that is already shared.`;
  }

  if (reason === CALENDAR_SCOPE_PROJECT_MISMATCH) {
    return CALENDAR_ERROR[reason satisfies CalendarErrorReason];
  }

  return null;
}

/**
 * The message to show for a failed calendar-touching mutation: the scope-aware sentence when the
 * rejection is one of ADR-0053's, else the error's own message, else a generic fallback. The single
 * call every surface uses, so one rejection never reads three different ways.
 */
export function calendarErrorMessage(error: unknown, fallback: string): string {
  return calendarScopeErrorMessage(error) ?? (error instanceof Error ? error.message : fallback);
}
