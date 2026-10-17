import type { DeletionGroup } from './group-deletions';

/**
 * Which kind of deletion the bin is narrowed to (ADR-0195 D8).
 *
 * **Client-side, over the groups, and not a `kind` query on the endpoint.** The screen pages the bin
 * to exhaustion and groups it in memory (`docs/TECH_DEBT.md` #57), because a group shown partially
 * would misstate what a Restore brings back. A server-side filter would split a project's row from
 * the calendars deleted with it — they are different tables — and hand back half a deletion.
 *
 * The filter looks at the group's **root**: the row a reader acts on. So a project that took a
 * calendar with it stays under "Clients, projects & plans", where its row is, and a calendar deleted
 * on its own is under "Calendars".
 */
export const SHOW_FILTERS = ['all', 'hierarchy', 'resources', 'calendars'] as const;

export type ShowFilter = (typeof SHOW_FILTERS)[number];

export const DEFAULT_SHOW: ShowFilter = 'all';

export const SHOW_OPTIONS: ReadonlyArray<{ value: ShowFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'hierarchy', label: 'Clients, projects & plans' },
  { value: 'resources', label: 'Resources' },
  { value: 'calendars', label: 'Calendars' },
];

/** The groups whose root is of the chosen kind. `all` is the identity, by reference. */
export function filterGroups(
  groups: readonly DeletionGroup[],
  show: ShowFilter,
): readonly DeletionGroup[] {
  if (show === 'all') return groups;
  return groups.filter(({ root }) => {
    switch (show) {
      case 'hierarchy':
        return root.kind === 'client' || root.kind === 'project' || root.kind === 'plan';
      case 'resources':
        return root.kind === 'resource';
      case 'calendars':
        return root.kind === 'calendar';
    }
  });
}

/**
 * What an empty filtered view says. It must name what is empty: reusing the whole-bin sentence
 * ("Nothing has been deleted") would be false while other kinds sit one control away.
 */
export function emptyFilterSentence(show: ShowFilter): string {
  switch (show) {
    case 'all':
      return 'Nothing has been deleted.';
    case 'hierarchy':
      return 'No deleted clients, projects or plans.';
    case 'resources':
      return 'No deleted resources.';
    case 'calendars':
      return 'No deleted calendars.';
  }
}
