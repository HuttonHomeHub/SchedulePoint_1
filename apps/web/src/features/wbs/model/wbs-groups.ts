import type { ActivitySummary } from '@repo/types';

import type { BarDateSource } from '@/features/tsld';

/**
 * The **one** definition of "what groups does this plan have, and what is in each" — consumed by
 * the Gantt row model and (M4) the TSLD WBS band, so the two surfaces cannot come to disagree
 * about which activities are unfiled.
 *
 * Pure: no React, no canvas, no network. Given the plan's activities and which dates the caller is
 * drawing (ADR-0033's `BarDateSource`), it returns the real `WBS_SUMMARY` groups plus **one
 * derived bucket** holding every top-level activity that is not itself a summary.
 *
 * ## The bucket is derived, never persisted
 *
 * A persisted "Unassigned" summary per plan would put a new node and a non-null `parentId` into
 * `computeSchedule`'s input for **every plan in the system** — the byte-identity the ADR-0034
 * parity gate exists to protect, spent on a display feature. It would also leak into baselines,
 * interchange export, the earned-value plan total and every other place that reads
 * `parentId === null` as meaning "top level". So the bucket lives here, in the view layer, and the
 * database never hears about it.
 *
 * ## The one place this diverges from the engine, stated plainly
 *
 * A **real** summary's dates are read straight from the engine's persisted columns and are never
 * recomputed here — a second rollup implementation is exactly the drift this module exists to
 * prevent. The **derived** bucket has no persisted dates to read, so its span is a plain min/max
 * over its members' drawn dates. The engine additionally rolls a real summary's span onto its
 * calendar's working boundaries; this does not. In practice the minimum of member early-starts is
 * already a working instant on that member's own calendar, so the two agree in every ordinary
 * case — and where they could differ, the derived row is the honest one, because it has no
 * calendar of its own to roll onto. A unit test asserts both halves of this — a real summary's
 * dates pass through untouched, and the bucket's are a plain min/max — so that nobody later
 * "fixes" it into a second rollup.
 */

/** A real `WBS_SUMMARY` and the activities filed directly under it. */
export interface SummaryGroup {
  kind: 'summary';
  /** The summary activity itself — its dates are the engine's, untouched. */
  summary: ActivitySummary;
  /** Direct children only. A nested summary appears here AND as its own `SummaryGroup`. */
  memberIds: string[];
}

/** The synthetic "Unassigned" bucket. It has no id in the database, because it is not in it. */
export interface DerivedGroup {
  kind: 'derived';
  label: 'Unassigned';
  memberIds: string[];
  /** Min over members' drawn start; null when no member has been computed yet. */
  start: string | null;
  /** Max over members' drawn finish; null when no member has been computed yet. */
  finish: string | null;
}

export interface WbsGroups {
  summaries: SummaryGroup[];
  /** `null` when there is nothing unfiled — an empty bucket is noise, not information. */
  unassigned: DerivedGroup | null;
}

/**
 * Pick the dates this activity is currently drawn at, matching `toRenderActivities`' selection so
 * the bucket's span follows Early/Visual/Late like every other bar on screen.
 */
function drawnSpan(
  activity: ActivitySummary,
  source: BarDateSource,
): { start: string | null; finish: string | null } {
  if (source === 'visual') {
    return { start: activity.visualEffectiveStart, finish: activity.visualEffectiveFinish };
  }
  if (source === 'late') {
    return { start: activity.lateStart, finish: activity.lateFinish };
  }
  return { start: activity.earlyStart, finish: activity.earlyFinish };
}

/**
 * Derive the plan's groups.
 *
 * "Top level" is resolved the same way `gantt/layout/row-model.ts` resolves it: an activity whose
 * `parentId` names a row that is **not present** is an orphan and counts as top-level, rather than
 * vanishing. The two must agree — an activity the Gantt indents at the root while the bucket
 * thinks it is filed would be a row that appears twice or not at all.
 */
export function deriveWbsGroups(
  activities: readonly ActivitySummary[],
  { source = 'early' }: { source?: BarDateSource } = {},
): WbsGroups {
  const present = new Set(activities.map((a) => a.id));
  const resolvedParent = (a: ActivitySummary): string | null =>
    a.parentId !== null && present.has(a.parentId) ? a.parentId : null;

  const membersOf = new Map<string, string[]>();
  const unfiled: ActivitySummary[] = [];

  for (const activity of activities) {
    const parent = resolvedParent(activity);
    if (parent === null) {
      // A top-level summary is a group in its own right, not a member of the bucket — the bucket
      // is for work that has not been filed, and a grouping is not work.
      if (activity.type !== 'WBS_SUMMARY') unfiled.push(activity);
      continue;
    }
    const members = membersOf.get(parent);
    if (members) members.push(activity.id);
    else membersOf.set(parent, [activity.id]);
  }

  const summaries: SummaryGroup[] = activities
    .filter((a) => a.type === 'WBS_SUMMARY')
    .map((summary) => ({
      kind: 'summary' as const,
      summary,
      memberIds: membersOf.get(summary.id) ?? [],
    }));

  return { summaries, unassigned: deriveBucket(unfiled, source) };
}

function deriveBucket(
  members: readonly ActivitySummary[],
  source: BarDateSource,
): DerivedGroup | null {
  if (members.length === 0) return null;

  let start: string | null = null;
  let finish: string | null = null;
  for (const member of members) {
    const span = drawnSpan(member, source);
    if (span.start !== null && (start === null || span.start < start)) start = span.start;
    if (span.finish !== null && (finish === null || span.finish > finish)) finish = span.finish;
  }

  return {
    kind: 'derived',
    label: 'Unassigned',
    memberIds: members.map((m) => m.id),
    start,
    finish,
  };
}

/**
 * Whether a group has a span to draw a bar for. A group whose members are all uncalculated has no
 * bar — drawing one at an invented date would state a schedule the engine has not produced.
 */
export function groupHasBar(group: DerivedGroup): boolean {
  return group.start !== null && group.finish !== null;
}
