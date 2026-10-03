import type { ResourceSummary } from '@repo/types';

import { isResourceGroup } from '../schemas/resource-schemas';

type LibraryRow = Pick<ResourceSummary, 'id' | 'name' | 'parentId'>;

/**
 * The confirmation copy for the two things a planner can do to a resource GROUP — the ONE
 * definition, so the two dialogs cannot drift apart (ADR-0053 §3). The shape follows
 * `features/activities/lib/delete-activity-copy.ts`, which solved the same problem for WBS
 * summaries.
 *
 * Both counts are derived client-side from the library the caller loaded **unfiltered and
 * including archived rows**: the server moves and deletes archived members too, so a count taken
 * from the filtered table would understate what the action touches. The counts are advisory — the
 * server is authoritative — which is why an absent group degrades to a sentence without a number
 * rather than claiming "nothing in it" from a list that has not arrived.
 */

/**
 * The dialog title for deleting a resource: a group says so, because the sentence under it is
 * about everything inside.
 */
export function deleteResourceTitle(resource: Pick<ResourceSummary, 'kind'>): string {
  return isResourceGroup(resource) ? 'Delete group' : 'Delete resource';
}

/**
 * Deleting a group deletes its **whole subtree** (ADR-0053 §3), which the previous copy —
 * `Delete “X”?`, identical for every kind — did not say, and what it silently destroys is the
 * unassigned members, the ones nobody is watching. Counts every active descendant, not only the
 * direct children, because a nested group goes with its own contents. A leaf keeps its wording.
 */
export function deleteResourceDescription(
  resource: Pick<ResourceSummary, 'id' | 'name' | 'kind'>,
  library: readonly LibraryRow[],
): string {
  const name = `“${resource.name}”`;
  if (!isResourceGroup(resource)) return `Delete ${name}?`;

  const consequence =
    'Deleting a group deletes everything in it, and deleted resources can’t be restored. ' +
    'To keep them, dissolve the group instead.';
  if (!library.some((r) => r.id === resource.id)) {
    return `Delete the group ${name}? ${consequence}`;
  }

  const count = countDescendants(resource.id, library);
  if (count === 0) return `Delete the group ${name}? It has nothing in it.`;
  return `Delete the group ${name} and the ${plural(count)} in it? ${consequence}`;
}

/**
 * Dissolving a group removes the grouping and keeps the resources. Three things have to land: the
 * resources are **kept**, **where** they go (the group's own parent, or the top level — a planner
 * needs to know which before agreeing), and that this **cannot be undone from a recycle bin**.
 * That last one is the claim most likely to be assumed wrongly, because every other deletion here
 * is restorable; a resource dissolve has no restore, so the copy names the way back instead
 * (create the group again and move them in).
 *
 * Counts only DIRECT children: dissolve moves one level, and a grandchild stays under its own
 * parent, which is what moves up.
 */
export function dissolveGroupDescription(
  group: Pick<ResourceSummary, 'id' | 'name' | 'parentId'>,
  library: readonly LibraryRow[],
): string {
  const name = `“${group.name}”`;
  const known = library.some((r) => r.id === group.id);
  const children = library.filter((r) => r.parentId === group.id);

  if (known && children.length === 0) {
    return `Dissolve the group ${name}? It has nothing in it, so this just removes the empty group.`;
  }

  const parentName =
    group.parentId === null ? null : (library.find((r) => r.id === group.parentId)?.name ?? null);
  const destination =
    group.parentId === null
      ? 'the top level'
      : parentName === null
        ? 'the group above it'
        : `“${parentName}”`;
  const kept = known ? `its ${plural(children.length)}` : 'the resources in it';
  return (
    `Dissolve the group ${name}? This removes the grouping and keeps ${kept} — they move up to ` +
    `${destination}. This can’t be undone from a recycle bin; to group them again, create the ` +
    `group again and move them back.`
  );
}

function plural(count: number): string {
  return count === 1 ? '1 resource' : `${String(count)} resources`;
}

/**
 * Every descendant of `rootId`, transitively. Iterative over the loaded rows, with `seen` so a
 * malformed cycle (the server forbids one, but this is render-path code and must not depend on
 * that) cannot hang the dialog.
 */
function countDescendants(rootId: string, library: readonly LibraryRow[]): number {
  const childrenOf = new Map<string, string[]>();
  for (const r of library) {
    if (r.parentId === null) continue;
    const siblings = childrenOf.get(r.parentId);
    if (siblings) siblings.push(r.id);
    else childrenOf.set(r.parentId, [r.id]);
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
