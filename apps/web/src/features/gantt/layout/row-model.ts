import type { ActivitySummary } from '@repo/types';

/**
 * Which column the grid is ordered by. `wbs` is the plan's own order (the ADR-0038 parent tree,
 * or `laneIndex` while M1 is flat) and is the default: a schedule read in an arbitrary order is
 * not a programme, it is a list.
 */
export type GanttSortKey =
  'wbs' | 'name' | 'code' | 'earlyStart' | 'earlyFinish' | 'duration' | 'totalFloat';

export type GanttSortDirection = 'asc' | 'desc';

export interface GanttSort {
  key: GanttSortKey;
  direction: GanttSortDirection;
}

export const GANTT_SORT_KEYS: readonly GanttSortKey[] = [
  'wbs',
  'name',
  'code',
  'earlyStart',
  'earlyFinish',
  'duration',
  'totalFloat',
];

export const DEFAULT_GANTT_SORT: GanttSort = { key: 'wbs', direction: 'asc' };

/** One rendered line of the Gantt: an activity plus where it sits in the hierarchy. */
export interface GanttRow {
  activity: ActivitySummary;
  /** 0 for a top-level row; one deeper per WBS parent (ADR-0038). Drives indentation. */
  depth: number;
  /** True for a `WBS_SUMMARY` that has at least one visible-able child. */
  hasChildren: boolean;
  /** Undefined unless {@link hasChildren}; otherwise the current disclosure state. */
  expanded?: boolean;
}

/**
 * Compare two possibly-null values, always sorting nulls **last** regardless of direction.
 *
 * An activity with no computed dates has not been scheduled yet; it is missing information, not
 * an extreme value. Sorting it to the top of a descending "Early start" would put the least
 * informative rows where the eye lands first, so nulls sink in both directions.
 */
function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
  direction: GanttSortDirection,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? compare(a, b) : compare(b, a);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compare two activities on one column. Ties are broken by the caller, not here. */
function compareOn(a: ActivitySummary, b: ActivitySummary, sort: GanttSort): number {
  const dir = sort.direction;
  switch (sort.key) {
    case 'wbs':
      return dir === 'asc' ? a.laneIndex - b.laneIndex : b.laneIndex - a.laneIndex;
    case 'name':
      return dir === 'asc' ? collator.compare(a.name, b.name) : collator.compare(b.name, a.name);
    case 'code':
      return compareNullable(a.code, b.code, (x, y) => collator.compare(x, y), dir);
    case 'earlyStart':
      return compareNullable(a.earlyStart, b.earlyStart, (x, y) => x.localeCompare(y), dir);
    case 'earlyFinish':
      return compareNullable(a.earlyFinish, b.earlyFinish, (x, y) => x.localeCompare(y), dir);
    case 'duration':
      return dir === 'asc' ? a.durationDays - b.durationDays : b.durationDays - a.durationDays;
    case 'totalFloat':
      return compareNullable(a.totalFloat, b.totalFloat, (x, y) => x - y, dir);
  }
}

/**
 * Order activities for display.
 *
 * The comparator is made **total** by falling back to `id`, so the order is deterministic for
 * equal keys. `Array.prototype.sort` is stable in every engine we support, but stability only
 * preserves the *input* order — and the input here is a network response whose order we do not
 * control. Two runs must agree, which requires a tiebreak of our own.
 */
export function sortActivities(
  activities: readonly ActivitySummary[],
  sort: GanttSort,
): ActivitySummary[] {
  return [...activities].sort((a, b) => compareOn(a, b, sort) || a.id.localeCompare(b.id));
}

/**
 * Flatten activities into display rows, honouring the WBS parent tree (ADR-0038) and the caller's
 * collapsed set.
 *
 * Ordering is **depth-first within each level**: siblings are sorted by the active sort, then each
 * summary is immediately followed by its subtree. That keeps a child under its parent whatever the
 * sort — sorting a hierarchy by finish date and getting an interleaved flat list is a bar chart of
 * nothing.
 *
 * A parent that is not itself in `activities` (soft-deleted mid-session, or paged out) would orphan
 * its children; they are promoted to the root rather than silently dropped, because a row the user
 * cannot see is worse than one indented wrongly.
 */
export function buildRows(
  activities: readonly ActivitySummary[],
  sort: GanttSort,
  collapsed: ReadonlySet<string> = new Set(),
): GanttRow[] {
  const byParent = new Map<string | null, ActivitySummary[]>();
  const ids = new Set(activities.map((a) => a.id));

  for (const activity of activities) {
    // Promote an orphan (parent absent from this set) to the root.
    const parent =
      activity.parentId !== null && ids.has(activity.parentId) ? activity.parentId : null;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(activity);
    else byParent.set(parent, [activity]);
  }

  const rows: GanttRow[] = [];

  const walk = (parentId: string | null, depth: number): void => {
    const siblings = byParent.get(parentId);
    if (!siblings) return;
    for (const activity of sortActivities(siblings, sort)) {
      const children = byParent.get(activity.id);
      const hasChildren = children !== undefined && children.length > 0;
      const expanded = hasChildren ? !collapsed.has(activity.id) : undefined;
      rows.push({
        activity,
        depth,
        hasChildren,
        ...(expanded === undefined ? {} : { expanded }),
      });
      if (hasChildren && expanded === true) walk(activity.id, depth + 1);
    }
  };

  walk(null, 0);
  return rows;
}

/**
 * The inclusive date span the rows cover, or null when nothing is scheduled yet.
 *
 * Read from the rows rather than the plan header so the chart frames what is actually on screen —
 * a plan whose only activities are uncalculated has no span, and must render its "not calculated"
 * state rather than a chart anchored on an arbitrary date.
 */
export function rowsDateSpan(rows: readonly GanttRow[]): { start: string; finish: string } | null {
  let start: string | null = null;
  let finish: string | null = null;
  for (const { activity } of rows) {
    if (activity.earlyStart !== null && (start === null || activity.earlyStart < start)) {
      start = activity.earlyStart;
    }
    if (activity.earlyFinish !== null && (finish === null || activity.earlyFinish > finish)) {
      finish = activity.earlyFinish;
    }
  }
  return start !== null && finish !== null ? { start, finish } : null;
}
