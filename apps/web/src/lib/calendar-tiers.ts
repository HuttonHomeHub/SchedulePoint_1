import type { CalendarSummary } from '@repo/types';

// Type-only (erased at build time), so this shared module still has NO runtime dependency on the
// component tier — it only speaks the option shape the pickers hand to the primitive.
import type { ComboboxOption } from '@/components/ui/combobox';
import { ARCHIVED_BADGE, PROJECT_TIER_BADGE, isArchivedRow } from '@/lib/library-filters';

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

/**
 * The calendars a picker may OFFER: the active ones, plus the current value even when it is
 * archived (ADR-0053 §4 / US-8 — "only *new* selections are filtered"). One rule, so no picker can
 * blank a legitimate stored selection just because someone retired that calendar afterwards.
 */
export function offerableCalendars(
  calendars: readonly CalendarSummary[],
  currentId: string,
): CalendarSummary[] {
  return calendars.filter((calendar) => !isArchivedRow(calendar) || calendar.id === currentId);
}

/** The combobox `group` key for the shared organisation library. */
export const ORG_TIER_GROUP = 'org';
/** The combobox `group` key for the calendars belonging to the project in view. */
export const PROJECT_TIER_GROUP = 'project';

/**
 * The visible heading per tier group — the combobox's `groupLabels`, the direct successor of the
 * `<optgroup label>`s the pickers used before ADR-0053 §4.
 */
export const CALENDAR_TIER_GROUP_LABELS: Readonly<Record<string, string>> = {
  [ORG_TIER_GROUP]: ORG_TIER_GROUP_LABEL,
  [PROJECT_TIER_GROUP]: PROJECT_TIER_GROUP_LABEL,
};

/**
 * Map calendars to combobox options, carrying the two annotations a planner needs to tell otherwise
 * identical rows apart (the tiers deliberately allow duplicate names):
 *
 * - `group` — the tier, when `grouped` (a project-usable list that actually spans both tiers). A
 *   single-tier list reads better flat, exactly as it did with `<optgroup>`.
 * - `badge` — `Archived` for a retired calendar, else `Project` for a project-tier row in an
 *   ungrouped list, where the group heading isn't there to say it. The badge is part of the
 *   option's accessible name, so the distinction is heard as well as seen.
 *
 * Archived rows are only ever present here because the CURRENT value is archived (every list read
 * defaults to `?archived=exclude`); the badge is what makes that state honest rather than invisible.
 */
export function toCalendarOptions(
  calendars: readonly CalendarSummary[],
  options: { grouped: boolean },
): ComboboxOption[] {
  return calendars.map((calendar) => {
    const isProject = calendar.scope === 'PROJECT';
    const badge = isArchivedRow(calendar)
      ? ARCHIVED_BADGE
      : !options.grouped && isProject
        ? PROJECT_TIER_BADGE
        : undefined;
    return {
      value: calendar.id,
      label: calendar.name,
      ...(options.grouped ? { group: isProject ? PROJECT_TIER_GROUP : ORG_TIER_GROUP } : {}),
      ...(badge === undefined ? {} : { badge }),
    };
  });
}
