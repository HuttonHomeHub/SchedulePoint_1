import type { ActivitySummary } from '@repo/types';

/**
 * The confirmation copy for deleting an activity — the ONE definition, because the same dialog is
 * raised from two places (the plan workspace's `activity-crud-dialogs` and `ActivitiesTable`) and a
 * warning that appears on only one of them is worse than none.
 *
 * Deleting a `WBS_SUMMARY` cascades to its **whole subtree** (ADR-0038), which the previous copy —
 * `Delete “X”? You can restore it later.`, identical for every activity type — did not say. A
 * planner deleting a grouping was told the reassuring half of the truth: the restore is real, but
 * it comes back with everything, and in the meantime an unknown amount of work has vanished from
 * the plan.
 *
 * The count is derived client-side from the already-loaded plan activities, so it is advisory: the
 * server is authoritative and the delete is a cascade regardless of what this said. That is why it
 * is phrased as a warning ("and the N activities below it") rather than as a promise, and why an
 * empty or still-loading list degrades to the plain sentence instead of claiming zero descendants.
 */
export function deleteActivityDescription(
  activity: Pick<ActivitySummary, 'id' | 'name' | 'type'>,
  planActivities: readonly Pick<ActivitySummary, 'id' | 'parentId'>[],
): string {
  const name = `“${activity.name}”`;
  if (activity.type !== 'WBS_SUMMARY') {
    return `Delete ${name}? You can restore it later.`;
  }

  // The subject's own absence means the list has not arrived (or is stale) — NOT that the summary
  // is empty. Saying "it has nothing filed under it" from a list we have not got would be a
  // confident lie in the one direction that matters, so warn about the cascade without a number.
  if (!planActivities.some((a) => a.id === activity.id)) {
    return (
      `Delete the summary ${name}? Deleting a summary deletes everything filed under it. ` +
      `You can restore them together later.`
    );
  }

  const count = countDescendants(activity.id, planActivities);
  if (count === 0) {
    return `Delete the summary ${name}? It has nothing filed under it. You can restore it later.`;
  }
  const activities = count === 1 ? '1 activity' : `${count} activities`;
  return (
    `Delete the summary ${name} and the ${activities} below it? ` +
    `Deleting a summary deletes everything it contains. You can restore them together later, ` +
    `or dissolve the summary instead to remove the grouping and keep the work.`
  );
}

/**
 * Every active descendant of `rootId`, transitively. Breadth-first over the loaded rows rather than
 * a recursive walk per node, so a deep tree costs one pass; `seen` also stops a malformed cycle
 * from hanging the dialog (the server forbids one, but this is render-path code and must not
 * depend on that being true).
 */
function countDescendants(
  rootId: string,
  planActivities: readonly Pick<ActivitySummary, 'id' | 'parentId'>[],
): number {
  const childrenOf = new Map<string, string[]>();
  for (const a of planActivities) {
    if (a.parentId === null) continue;
    const siblings = childrenOf.get(a.parentId);
    if (siblings) siblings.push(a.id);
    else childrenOf.set(a.parentId, [a.id]);
  }

  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  let count = 0;
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined) break;
    for (const child of childrenOf.get(next) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      count += 1;
      queue.push(child);
    }
  }
  return count;
}
