import { wbsBasisOf, type WbsNode } from '@repo/layout';
import type { ActivitySummary } from '@repo/types';

import type { SwimlaneInput } from '@/features/tsld';

/**
 * **Swimlanes from the WBS: who belongs to which summary at level N** (swimlanes M3-T1, feature-spec
 * US-4 and §4.6). It sits beside `wbs-groups.ts` so the Gantt, the band and the swimlanes read one
 * tree, and it answers through `@repo/layout`'s `wbsBasisOf` — the same ancestor walk the server calls
 * to decide which basis a lane row is written against — so the two cannot disagree about depth.
 *
 * - **The swimlanes** are the `WBS_SUMMARY` activities at exactly level N (1 is a top-level summary),
 *   in WBS order — depth-first, siblings by `laneIndex` then id, which is the Gantt's own default
 *   sort — named after their summary, so a rename needs no write.
 * - **An activity** under one of them, at any depth, is in that swimlane. A summary at level N is in
 *   its own. Everything else — work above the level, work in a plan with no summary there, an
 *   orphan — is in "No swimlane".
 * - **Nothing here reads `swimlaneId`.** By-hand membership is kept on the row and ignored while the
 *   source is `WBS`, which is what lets switching back return the hand-made picture with no write.
 *
 * ## Summaries the band lifts out
 *
 * A summary is a member like any other activity, so it is in its own swimlane here. When the pinned
 * band is on it is drawn there instead, and `deriveDiagramSource` projects over the activities the
 * band leaves in the scene, so the summary takes no lane and is never drawn a second time. The
 * swimlane it names stays: it is a group, whether or not its bar is in the band.
 */

/** The WBS levels a plan can be divided at (`ck_plans_swimlane_source_level`). */
export const WBS_SWIMLANE_LEVELS = [1, 2, 3] as const;
export type WbsSwimlaneLevel = (typeof WBS_SWIMLANE_LEVELS)[number];

/** `true` for a level the plan's source can hold. */
export function isWbsSwimlaneLevel(level: number | null | undefined): level is WbsSwimlaneLevel {
  return level === 1 || level === 2 || level === 3;
}

const byLaneThenId = (a: ActivitySummary, b: ActivitySummary): number =>
  a.laneIndex - b.laneIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The summaries of the plan in WBS order, each with its level (1 is top-level). An activity whose
 * `parentId` names a row that is not present is an orphan and a root, as everywhere else; a cycle is
 * unreachable from any root and so is left out rather than hanging the walk.
 */
function summariesInWbsOrder(
  activities: readonly ActivitySummary[],
): { summary: ActivitySummary; level: number }[] {
  const present = new Set(activities.map((a) => a.id));
  const childrenOf = new Map<string | null, ActivitySummary[]>();
  for (const a of activities) {
    const parent = a.parentId !== null && present.has(a.parentId) ? a.parentId : null;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(a);
    else childrenOf.set(parent, [a]);
  }
  const out: { summary: ActivitySummary; level: number }[] = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, level: number): void => {
    for (const child of [...(childrenOf.get(parent) ?? [])].sort(byLaneThenId)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.type === 'WBS_SUMMARY') out.push({ summary: child, level });
      // Every node counts toward depth, as in `wbsBasisOf`, so a (forbidden, ADR-0038) task with
      // children cannot make the two walks disagree about a level.
      visit(child.id, level + 1);
    }
  };
  visit(null, 1);
  return out;
}

/** How many groups each level holds, and the level setup offers first. */
export interface WbsSwimlaneLevels {
  /** Summaries at level 1, 2 and 3, in that order. */
  counts: readonly [number, number, number];
  /** The level setup preselects, or `null` when the plan has no summary at any of them. */
  suggested: WbsSwimlaneLevel | null;
}

/**
 * The shallowest level with at least two summaries, because level 1 is often a single "The Works"
 * node (ADR-0063 §3) and one swimlane holding the whole plan says nothing. A plan whose levels each
 * hold one falls back to the shallowest that holds any.
 */
export function wbsSwimlaneLevels(activities: readonly ActivitySummary[]): WbsSwimlaneLevels {
  const counts: [number, number, number] = [0, 0, 0];
  for (const { level } of summariesInWbsOrder(activities)) {
    if (level <= 3) counts[level - 1] = (counts[level - 1] ?? 0) + 1;
  }
  const pick = (atLeast: number): WbsSwimlaneLevel | null =>
    WBS_SWIMLANE_LEVELS.find((level) => (counts[level - 1] ?? 0) >= atLeast) ?? null;
  return { counts, suggested: pick(2) ?? pick(1) };
}

/**
 * The last build, keyed by the identity of its inputs: the scene, the editor's read-only field and
 * auto-resolve all hand this the cache's own array, so they share one walk per data change.
 */
let last: { activities: readonly ActivitySummary[]; level: number; input: SwimlaneInput } | null =
  null;

/**
 * The neutral swimlane input for a plan whose swimlanes come from its WBS at `level`.
 *
 * The stored lane is the row written against the activity's WBS basis: its summary's group, or "No
 * WBS group" at this level. A basis with no row means the activity has never been placed there, and
 * the projection derives a lane (ADR-0139); switching source never writes one.
 */
export function wbsSwimlaneInput(
  activities: readonly ActivitySummary[],
  level: number,
): SwimlaneInput {
  if (last?.activities === activities && last.level === level) return last.input;
  const input = buildInput(activities, level);
  last = { activities, level, input };
  return input;
}

function buildInput(activities: readonly ActivitySummary[], level: number): SwimlaneInput {
  const nodes = new Map<string, WbsNode>(
    activities.map((a) => [a.id, { id: a.id, parentId: a.parentId, type: a.type }]),
  );
  const swimlanes = summariesInWbsOrder(activities)
    .filter((s) => s.level === level)
    .map(({ summary }) => ({ id: summary.id, name: summary.name }));

  const membership = new Map<string, string | null>();
  const storedLanes = new Map<string, { lane: number; updatedAt: number }>();
  for (const a of activities) {
    const basis = wbsBasisOf(a.id, nodes, level);
    const summaryId = basis.kind === 'summary' ? basis.summaryId : null;
    membership.set(a.id, summaryId);
    const row = a.swimlaneLanes.find((l) =>
      summaryId === null
        ? l.basis === 'NO_WBS_SUMMARY' && l.wbsLevel === level
        : l.basis === 'WBS_SUMMARY' && l.summaryActivityId === summaryId,
    );
    if (row) storedLanes.set(a.id, { lane: row.laneIndex, updatedAt: Date.parse(row.updatedAt) });
  }
  return { swimlanes, membership, storedLanes, source: 'WBS' };
}
