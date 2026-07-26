import type { ArchivedFilter } from '@repo/types';

/**
 * The shared vocabulary of the **library management** controls (ADR-0053 §4 / US-7 + US-8) —
 * archive state and free-text search — for the calendar and resource libraries and every picker
 * over them.
 *
 * It lives in `lib` (shared) because the surfaces that need it sit in four different features
 * (calendars, resources, plans, activities) and a feature may never import a sibling
 * (docs/FRONTEND_ARCHITECTURE.md). One module means "Archived" is spelled, styled and explained
 * the same way on every screen — which matters more than usual here, because the single biggest
 * risk of this feature is a planner reading *archive* as *delete*.
 */

/**
 * The trailing annotation on an archived option/row. Deliberately the noun a planner already
 * knows, never an icon alone: it rides in the option's ACCESSIBLE NAME via the combobox's
 * `badge`, so it is announced as well as seen (WCAG 1.4.1 — never colour/shape alone).
 */
export const ARCHIVED_BADGE = 'Archived';

/** The trailing annotation on a project-tier calendar option (ADR-0053 §1). */
export const PROJECT_TIER_BADGE = 'Project';

/**
 * The one-sentence answer to "is archive the same as delete?", shown next to every archive control.
 * Archiving is metadata-only: it changes **no** schedule output (the CPM engine never reads
 * `archived_at`), it only retires the row from new selections.
 */
export const ARCHIVE_EXPLAINER =
  'Archiving hides a row from the pickers. Everything already using it keeps working and still schedules exactly as before.';

/** The visible labels for the `?archived=` filter, in the order they are offered. */
export const ARCHIVED_FILTER_LABELS: Record<ArchivedFilter, string> = {
  exclude: 'Active only',
  include: 'Active and archived',
  only: 'Archived only',
};

/** True when a row carries an `archivedAt` instant — the single spelling of the predicate. */
export function isArchivedRow(row: { archivedAt: string | null } | undefined): boolean {
  return Boolean(row?.archivedAt);
}

/**
 * Case-insensitive substring match over one or more fields — the CLIENT-side twin of the server's
 * `?q=` predicate (`name`, plus `code` for a resource), used by the pickers that are already handed
 * the complete library and so have nothing to gain from a round trip. An empty/whitespace term
 * matches everything, exactly as an omitted `q` does server-side.
 */
export function matchesLibraryQuery(
  query: string,
  ...fields: readonly (string | null | undefined)[]
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}
