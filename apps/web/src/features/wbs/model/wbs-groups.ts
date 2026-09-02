import type { ActivitySummary } from '@repo/types';

import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';

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
 *
 * A thin alias for {@link barDatesFor} — this was a **verbatim second copy** of that ternary until
 * 2026-08-17, written before `lib/bar-dates.ts` existed and left behind when it arrived. Exactly
 * the drift that module's docblock exists to prevent, one import away from it. Kept as a named
 * local because two call sites read better for it, and because deleting the name would lose the
 * sentence above about *why* this follows the drawn dates rather than the early ones.
 */
function drawnSpan(
  activity: ActivitySummary,
  source: BarDateSource,
): { start: string | null; finish: string | null } {
  return barDatesFor(activity, source);
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

/**
 * One row of the TSLD WBS band (ADR-0063): a real summary or the derived bucket, with its nesting
 * depth and the span it draws at.
 *
 * Structurally identical to the render model's `WbsBandGroup`, and deliberately declared here
 * rather than imported: `features/tsld` imports no other feature (ADR-0026 D8), so the geometry
 * module cannot reach into this one, and this one must not become the reason that rule bends. The
 * host composes the two.
 */
export interface WbsBandGroupInput {
  /** `null` for the derived bucket — it has no activity id, because it is not in the database. */
  id: string | null;
  label: string;
  depth: number;
  start: string | null;
  finish: string | null;
  /**
   * How much work this group holds — the number this group's accessible name states
   * (`docs/TECH_DEBT.md` #232).
   *
   * **For a real `WBS_SUMMARY` this is the WHOLE SUBTREE, at every depth, and it counts nested
   * summaries as members too.** That is a decision, not an implementation detail, and it is stated
   * here because the obvious "fix" is to make it direct children — which `SummaryGroup.memberIds`
   * holds, one type up. A phase's size is the work inside it, not how many boxes it was split into
   * at the first level, and a planner reading "Substructure, 40 activities" containing "Piling, 12
   * activities" is reading a work breakdown the way work breakdowns are read.
   *
   * For the derived bucket the distinction does not arise: the bucket holds top-level non-summary
   * activities and has no nesting, so its members and its subtree are the same set. That is also
   * why this agrees with the Gantt, whose bucket row is the only place in that view carrying a
   * count (`gantt/layout/row-model.ts:244`); a real summary is a `GanttActivityRow` and has no
   * count at all, so there is nothing there to disagree with.
   *
   * **The counts are NOT additive across nesting**, and this sentence is here because the obvious
   * reading of two adjacent rows is to add them: a nested summary's count is *included inside* its
   * ancestors', so "Structure, 30" containing "Substructure, 10" describes 30 activities and not
   * 40. That is why anything announcing these rows has to carry a nesting cue rather than a flat
   * list of numbers — see {@link WbsBandGroupInput.parentId}.
   *
   * Deliberately absent from the render tier's `WbsBandGroup` (`tsld/render/wbs-band.ts`), which
   * this type otherwise mirrors: a count is not geometry, and the painter must not grow a reason
   * to read it.
   */
  count: number;
  /**
   * The **resolved** parent of this group — `null` for a top-level summary, for the derived bucket,
   * and for a summary whose `parentId` names a row that is not present (an orphan is top-level
   * here exactly as it is everywhere else in this module, so one rule serves every reader).
   *
   * It exists because the band conveys **containment** visually — a child's bar sits inside its
   * parent's span — and a consumer that renders these rows as a flat list throws that away. With
   * subtree counts (above) that is worse than cosmetic: a reader who cannot tell a parent from a
   * sibling will sum two numbers that overlap. An accessibility review of `docs/TECH_DEBT.md` #232
   * found exactly that, and this field is what lets a text equivalent say `aria-level`.
   *
   * Like `count`, deliberately absent from the render tier's `WbsBandGroup`: the painter derives a
   * row's y from the SET of depths present, not from any one row's parent.
   */
  parentId: string | null;
}

/**
 * Project the plan's groups into band rows, in draw order: summaries outermost-first, then the
 * derived bucket last.
 *
 * Depth is the count of summary ancestors, walked with a `seen` guard. The server forbids a cycle
 * in the parent tree (ADR-0038), but this is render-path code and must not hang the canvas if one
 * ever exists; a cycle simply stops the walk, and the group lands at the depth reached so far.
 *
 * The bucket is given **depth 0**: it is a top-level grouping, a sibling of the outermost
 * summaries, not a child of anything.
 */
export function wbsBandGroups(
  activities: readonly ActivitySummary[],
  { source = 'early' }: { source?: BarDateSource } = {},
): WbsBandGroupInput[] {
  const groups = deriveWbsGroups(activities, { source });
  const byId = new Map(activities.map((a) => [a.id, a]));

  const depthOf = (activity: ActivitySummary): number => {
    let depth = 0;
    const seen = new Set<string>([activity.id]);
    let parentId = activity.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break; // an orphan is top-level, exactly as the row model treats it
      seen.add(parentId);
      depth += 1;
      parentId = parent.parentId;
    }
    return depth;
  };

  // Children by parent, over the SAME resolved-parent rule `deriveWbsGroups` uses — an activity
  // whose `parentId` names a row that is not present is an orphan and counts as top-level, so it
  // belongs to no summary's subtree rather than to a phantom one.
  const present = new Set(activities.map((a) => a.id));
  const childrenOf = new Map<string, string[]>();
  for (const activity of activities) {
    const parentId = activity.parentId;
    if (parentId === null || !present.has(parentId)) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(activity.id);
    else childrenOf.set(parentId, [activity.id]);
  }

  /**
   * Everything under `id`, at any depth. The `seen` guard is the `depthOf` guard's mirror and is
   * there for the same reason: the server forbids a cycle in the parent tree (ADR-0038), but this
   * is render-path code and must not hang the canvas if one ever exists.
   */
  const subtreeCount = (id: string): number => {
    let total = 0;
    const seen = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined) break;
      for (const child of childrenOf.get(next) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        total += 1;
        stack.push(child);
      }
    }
    return total;
  };

  const rows: WbsBandGroupInput[] = groups.summaries
    .map((group) => {
      const span = drawnSpan(group.summary, source);
      return {
        id: group.summary.id,
        label: group.summary.name,
        depth: depthOf(group.summary),
        start: span.start,
        finish: span.finish,
        count: subtreeCount(group.summary.id),
        // The RESOLVED parent, not the raw column: an orphan is top-level here, as it is in
        // `deriveWbsGroups` and in the Gantt row model.
        parentId:
          group.summary.parentId !== null && present.has(group.summary.parentId)
            ? group.summary.parentId
            : null,
      };
    })
    .sort((a, b) => a.depth - b.depth);

  if (groups.unassigned !== null) {
    rows.push({
      id: null,
      label: groups.unassigned.label,
      depth: 0,
      start: groups.unassigned.start,
      finish: groups.unassigned.finish,
      count: groups.unassigned.memberIds.length,
      parentId: null,
    });
  }
  return rows;
}
