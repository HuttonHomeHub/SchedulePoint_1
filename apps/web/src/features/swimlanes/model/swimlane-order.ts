import type { SwimlaneSummary } from '@repo/types';

/**
 * The list with one swimlane moved a place up (`-1`) or down (`1`), or `null` when it is already at
 * that end or is not in the list. Pure, so the gutter menu, the manage dialog and the undo command
 * agree on what "move up" means.
 */
export function movedSwimlane(
  list: readonly SwimlaneSummary[],
  id: string,
  delta: -1 | 1,
): SwimlaneSummary[] | null {
  const from = list.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return null;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return null;
  next.splice(to, 0, moved);
  return next;
}

/** The body `PATCH …/swimlanes/order` names: every active swimlane once, with the version it was read at. */
export function orderBody(list: readonly SwimlaneSummary[]): { id: string; version: number }[] {
  return list.map((s) => ({ id: s.id, version: s.version }));
}

/**
 * How many activities each swimlane holds, by the activities' own `swimlaneId`. A swimlane nobody is
 * in is absent (read it as 0). Counts only ids that are in `known`, because a member of a deleted
 * swimlane keeps its id so a restore can bring it back, and is shown under "No swimlane" meanwhile.
 */
export function membersBySwimlane(
  activities: readonly { swimlaneId: string | null }[],
  known: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const a of activities) {
    if (a.swimlaneId !== null && known.has(a.swimlaneId)) {
      counts.set(a.swimlaneId, (counts.get(a.swimlaneId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The delete confirmation's sentence (feature-spec US-2). It says where the members go and that Undo
 * brings them back; both are true (a soft delete keeps `swimlaneId`, and a restore returns the
 * swimlane with its remembered lanes).
 */
export function deleteConsequence(memberCount: number): string {
  if (memberCount === 0) return 'No activities are in this swimlane. Undo brings it back.';
  return memberCount === 1
    ? '1 activity will show under No swimlane. Undo brings it back.'
    : `${String(memberCount)} activities will show under No swimlane. Undo brings them back.`;
}
