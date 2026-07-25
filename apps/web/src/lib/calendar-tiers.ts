import type { CalendarSummary } from '@repo/types';

/**
 * Splitting a calendar list by tier for the pickers (ADR-0053 §1).
 *
 * It lives in `lib` (shared) because the plan, activity and resource pickers each live in a
 * different feature and a feature may not import a sibling (docs/FRONTEND_ARCHITECTURE.md). One
 * module means one set of group headings, so "Organisation" never reads as "Shared" two screens
 * later — and the ordering (organisation first, then this project's own) is the same everywhere.
 */

/** The `<optgroup>` heading for the shared organisation library. */
export const ORG_TIER_GROUP_LABEL = 'Organisation calendars';

/** The `<optgroup>` heading for the calendars belonging to the project in view. */
export const PROJECT_TIER_GROUP_LABEL = 'This project’s calendars';

/**
 * Partition a project-usable calendar list into its two tiers, preserving the server's order within
 * each. Organisation calendars come first: they are the shared default and the larger set, and a
 * project's own one-offs read as the exception below them.
 */
export function groupCalendarsByTier(calendars: CalendarSummary[]): {
  org: CalendarSummary[];
  project: CalendarSummary[];
} {
  const org: CalendarSummary[] = [];
  const project: CalendarSummary[] = [];
  for (const calendar of calendars) {
    if (calendar.scope === 'PROJECT') project.push(calendar);
    else org.push(calendar);
  }
  return { org, project };
}
