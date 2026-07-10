import type { PlanEdge } from './dependency.repository';

/**
 * Would adding the edge `predecessor → successor` to `edges` close a cycle?
 *
 * A new edge `p → s` creates a cycle **iff** `p` is already reachable from `s`
 * along the existing edges (i.e. there is already a path `s → … → p`), because
 * the new edge would then complete `s → … → p → s`. So we walk forward from `s`
 * over successor-edges and report whether we reach `p`. Pure and `O(V+E)`: the
 * caller loads the plan's active edges once (indexed by `plan_id`) and passes
 * them in. The self-loop `p === s` is a trivial cycle (the caller rejects it as a
 * 422 before this runs; we still return `true` defensively).
 *
 * This is the in-memory guarantee behind ADR-0021 (the plan's dependency graph is
 * always a DAG); the caller runs it inside the create transaction under a
 * plan-scoped lock so concurrent inserts cannot bypass it.
 */
export function wouldCreateCycle(
  edges: readonly PlanEdge[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;

  // Adjacency: predecessor → its direct successors.
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.predecessorId);
    if (outgoing) outgoing.push(edge.successorId);
    else adjacency.set(edge.predecessorId, [edge.successorId]);
  }

  // DFS forward from the proposed successor; reaching the predecessor means a cycle.
  const seen = new Set<string>([successorId]);
  const stack: string[] = [successorId];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === predecessorId) return true;
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}
