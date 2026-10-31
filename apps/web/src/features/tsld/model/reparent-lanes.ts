import type { ActivitySummary } from '@repo/types';

import { deriveDiagramSource } from './derive-diagram-source';
import { swimlaneEditContext } from './swimlane-edit-context';
import { settleInSwimlanes, type SwimlaneLanePlacement } from './swimlane-lanes';

import { isWbsSwimlaneLevel, wbsSwimlaneInput } from '@/features/wbs';

/**
 * **The lane writes owed after a WBS parent write** (swimlanes M3-T2, feature-spec §4.6).
 *
 * Under a `WBS` source an activity's swimlane is the summary it sits under, so a parent write moves
 * work between swimlanes — and, because membership is inherited, moves a summary's whole subtree with
 * it. Each lane is stored against a basis, and the mover has just joined one it may never have been
 * placed in (or placed in long ago, among bars that have since moved). Left unwritten the projection
 * would still draw it somewhere free, but that lane is derived, and a recalculation can re-derive it
 * (`deriveSwimlaneLanes`, "the window in which an unplaced member can be re-placed").
 *
 * This plans the write against the picture **after** the change — the plan's activities with the new
 * parents substituted — so the lane stored is the lane the projection settles on there: the one the
 * mover remembers for its new group when it is free at its span, otherwise the nearest free lane. It
 * is pure, and the answer is `[]` unless the plan's swimlanes come from the WBS at a valid level and
 * somebody actually changed group.
 *
 * It plans in the `visual` basis (where bars are placed, not the Late overlay) with the pinned band
 * off, so a summary the band would lift still holds a lane, as in auto-resolve: a lane that is free
 * with the summaries counted is free without them, so neither picture can gain an overlap.
 */
export function planReparentLanes(args: {
  /** The plan's activities as they stand BEFORE the parent write. */
  activities: readonly ActivitySummary[];
  changes: readonly { id: string; parentId: string | null }[];
  source: string;
  level: number | null | undefined;
  /** The plan's data date, which the projection measures spans from. */
  dataDate: string | null | undefined;
  /**
   * Activities the write removes from the plan, left out of the picture it is planned against. A
   * dissolved summary is no longer a swimlane, so the children promoted out of it are settled in the
   * groups they now belong to, not beside an empty lane that is about to disappear.
   */
  removed?: readonly string[] | undefined;
}): SwimlaneLanePlacement[] {
  const { activities, changes, source, level, dataDate } = args;
  const gone = new Set(args.removed ?? []);
  if (source !== 'WBS' || !isWbsSwimlaneLevel(level) || !dataDate || changes.length === 0) {
    return [];
  }
  const moved = new Map(changes.map((c) => [c.id, c.parentId] as const));
  const after = activities
    .filter((a) => !gone.has(a.id))
    .map((a) => (moved.has(a.id) ? { ...a, parentId: moved.get(a.id) ?? null } : a));
  const was = wbsSwimlaneInput(activities, level).membership;
  const input = wbsSwimlaneInput(after, level);
  const changedGroup = after.flatMap((a) =>
    (was.get(a.id) ?? null) === (input.membership.get(a.id) ?? null) ? [] : [a.id],
  );
  if (changedGroup.length === 0) return [];

  const diagram = deriveDiagramSource(after, {
    wbsBand: { enabled: false, toggleOn: false },
    swimlanes: input,
    source: 'visual',
    dataDate,
  });
  const ctx = swimlaneEditContext({
    scene: diagram.swimlaneScene,
    input,
    sceneActivities: diagram.sceneActivities,
    activities: after,
    barDateSource: 'visual',
    dataDate,
  });
  return ctx === null ? [] : settleInSwimlanes(ctx, changedGroup);
}
