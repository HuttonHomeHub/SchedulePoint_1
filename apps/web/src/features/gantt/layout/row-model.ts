import type { ActivitySummary } from '@repo/types';

import { deriveWbsGroups, type DerivedGroup } from '@/features/wbs';
// Straight from `lib/`, not through `@/features/tsld`'s barrel. The type is shared by both views,
// so reaching for it through the canvas's barrel is the feature-to-feature leak `bar-dates.ts`'
// docblock names — and it is what made this module's date handling look like a canvas concern.
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';

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

/** One rendered line of the Gantt for a real activity, plus where it sits in the hierarchy. */
export interface GanttActivityRow {
  kind: 'activity';
  activity: ActivitySummary;
  /** 0 for a top-level row; one deeper per WBS parent (ADR-0038). Drives indentation. */
  depth: number;
  /** True for a `WBS_SUMMARY` that has at least one visible-able child. */
  hasChildren: boolean;
  /** Undefined unless {@link hasChildren}; otherwise the current disclosure state. */
  expanded?: boolean;
}

/**
 * The **Unassigned** bucket row — a grouping line with no activity behind it, because the bucket is
 * derived in the view layer and never persisted (see `features/wbs/model/wbs-groups.ts`).
 *
 * A discriminated union rather than a synthetic `ActivitySummary`: a fake activity would flow into
 * selection, the row menu, the bar geometry and the variance lookup, and each of those would appear
 * to work while acting on a row the server has never heard of. With `kind` the compiler makes every
 * consumer say which it is holding.
 */
export interface GanttBucketRow {
  kind: 'bucket';
  /** Reserved, non-UUID id — the collapse set and the focus map are keyed by row id. */
  id: typeof UNASSIGNED_ROW_ID;
  label: 'Unassigned';
  /** How many activities are unfiled. Shown so the row says why it exists. */
  count: number;
  start: string | null;
  finish: string | null;
  expanded: boolean;
}

export type GanttRow = GanttActivityRow | GanttBucketRow;

/**
 * The bucket row's id. Deliberately not a UUID so it can never collide with an activity id in the
 * collapse set, the focus map, or a future `?row=` deep link.
 */
export const UNASSIGNED_ROW_ID = '__unassigned__';

/**
 * The key a row is tracked by — focus, the roving tab stop, the collapse set and the ref map all
 * use it. One accessor rather than `row.activity.id` at each site, so a bucket row cannot reach a
 * lookup that assumes an activity.
 */
export function rowId(row: GanttRow): string {
  return row.kind === 'bucket' ? row.id : row.activity.id;
}

/**
 * A row's disclosure state, or `null` when it has nothing to disclose. Both row kinds can be
 * expandable, and both answer through here so the keyboard handler never has to know which it has.
 */
export function rowDisclosure(row: GanttRow): { expanded: boolean } | null {
  if (row.kind === 'bucket') return { expanded: row.expanded };
  return row.hasChildren ? { expanded: row.expanded === true } : null;
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

/**
 * Compare two activities on one column. Ties are broken by the caller, not here.
 *
 * The date cases read `source` — the same {@link BarDateSource} the bars and the cells use — so the
 * grid orders by what it is **showing**. Sorting a VISUAL plan by the early dates while the Start
 * column printed the effective-Visual ones is indistinguishable, to a reader, from not sorting at
 * all (`docs/TECH_DEBT.md` #135).
 */
function compareOn(
  a: ActivitySummary,
  b: ActivitySummary,
  sort: GanttSort,
  source: BarDateSource,
): number {
  const dir = sort.direction;
  switch (sort.key) {
    case 'wbs':
      return dir === 'asc' ? a.laneIndex - b.laneIndex : b.laneIndex - a.laneIndex;
    case 'name':
      return dir === 'asc' ? collator.compare(a.name, b.name) : collator.compare(b.name, a.name);
    case 'code':
      return compareNullable(a.code, b.code, (x, y) => collator.compare(x, y), dir);
    case 'earlyStart':
      return compareNullable(
        barDatesFor(a, source).start,
        barDatesFor(b, source).start,
        (x, y) => x.localeCompare(y),
        dir,
      );
    case 'earlyFinish':
      return compareNullable(
        barDatesFor(a, source).finish,
        barDatesFor(b, source).finish,
        (x, y) => x.localeCompare(y),
        dir,
      );
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
  source: BarDateSource = 'early',
): ActivitySummary[] {
  return [...activities].sort((a, b) => compareOn(a, b, sort, source) || a.id.localeCompare(b.id));
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
  options: { unassignedBucket?: boolean; barDateSource?: BarDateSource | undefined } = {},
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
    for (const activity of sortActivities(siblings, sort, options.barDateSource ?? 'early')) {
      const children = byParent.get(activity.id);
      const hasChildren = children !== undefined && children.length > 0;
      const expanded = hasChildren ? !collapsed.has(activity.id) : undefined;
      rows.push({
        kind: 'activity',
        activity,
        depth,
        hasChildren,
        ...(expanded === undefined ? {} : { expanded }),
      });
      if (hasChildren && expanded === true) walk(activity.id, depth + 1);
    }
  };

  const bucket = options.unassignedBucket === true ? bucketFor(activities, options) : null;
  if (bucket === null) {
    walk(null, 0);
    return rows;
  }

  // Filed structure first, then everything not yet filed: the bucket is the plan's remainder, and
  // reading it before the structure would make an unstructured tail look like the plan's shape.
  const unfiled = new Set(bucket.memberIds);
  const topLevel = (byParent.get(null) ?? []).filter((a) => !unfiled.has(a.id));
  byParent.set(null, topLevel);
  walk(null, 0);

  const expanded = !collapsed.has(UNASSIGNED_ROW_ID);
  rows.push({
    kind: 'bucket',
    id: UNASSIGNED_ROW_ID,
    label: 'Unassigned',
    count: bucket.memberIds.length,
    start: bucket.start,
    finish: bucket.finish,
    expanded,
  });
  if (expanded) {
    const members = activities.filter((a) => unfiled.has(a.id));
    for (const activity of sortActivities(members, sort)) {
      // A bucket member is by definition top-level and not a summary, so it can have no subtree of
      // its own — the walk below it would always be empty.
      rows.push({ kind: 'activity', activity, depth: 1, hasChildren: false });
    }
  }
  return rows;
}

/**
 * The bucket, or `null` when it should not be shown.
 *
 * Two conditions, both deliberate. **No unfiled work** ⇒ nothing to bucket. **No real summary** ⇒
 * the plan is flat, and heading a flat list "Unassigned" would invent a hierarchy that does not
 * exist and indent every row for nothing. The bucket exists to make a *half*-structured plan read
 * honestly; a plan with no structure is already honest.
 */
function bucketFor(
  activities: readonly ActivitySummary[],
  options: { barDateSource?: BarDateSource | undefined },
): DerivedGroup | null {
  const groups = deriveWbsGroups(activities, { source: options.barDateSource ?? 'early' });
  if (groups.unassigned === null || groups.summaries.length === 0) return null;
  return groups.unassigned;
}

/**
 * The inclusive date span the rows cover, or null when nothing is scheduled yet.
 *
 * Read from the rows rather than the plan header so the chart frames what is actually on screen —
 * a plan whose only activities are uncalculated has no span, and must render its "not calculated"
 * state rather than a chart anchored on an arbitrary date.
 */
export function rowsDateSpan(
  rows: readonly GanttRow[],
  source: BarDateSource = 'early',
): { start: string; finish: string } | null {
  let start: string | null = null;
  let finish: string | null = null;
  const widen = (rowStart: string | null, rowFinish: string | null): void => {
    if (rowStart !== null && (start === null || rowStart < start)) start = rowStart;
    if (rowFinish !== null && (finish === null || rowFinish > finish)) finish = rowFinish;
  };
  for (const row of rows) {
    // The bucket counts too. When it is expanded its span merely restates its members'; when it is
    // COLLAPSED they are not rows at all, and skipping it would frame a chart its own bar hangs off
    // the end of.
    //
    // The activity branch read `earlyStart`/`earlyFinish` unconditionally until 2026-08-17, three
    // lines below a bucket branch that had already been made source-aware — so in a VISUAL plan a
    // bar the engine pushed past its early finish fell OUTSIDE the framed extent, and the chart did
    // not contain its own content. That reads as a rendering fault rather than a date bug, which is
    // why it survived: nobody looks for a scheduling defect in a clipped bar.
    if (row.kind === 'bucket') widen(row.start, row.finish);
    else {
      const { start: rowStart, finish: rowFinish } = barDatesFor(row.activity, source);
      widen(rowStart, rowFinish);
    }
  }
  return start !== null && finish !== null ? { start, finish } : null;
}
