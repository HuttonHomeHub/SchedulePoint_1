import type { PlanCrossEdge } from './cross-plan-dependency.repository';

/**
 * Would adding the cross-plan edge `predecessorPlan → successorPlan` to `edges` close a
 * **plan-level** cycle (inter-project M2, ADR-0045 §3)?
 *
 * The graph here is coarse: its **nodes are plans** and its **edges are cross-plan
 * dependencies**. A new edge `p → s` creates a cycle **iff** `p` is already reachable from
 * `s` along the existing cross-plan edges (there is already a path `s → … → p`), because the
 * new edge would then complete `s → … → p → s`. So we walk forward from `s` over successor-plan
 * edges and report whether we reach `p`. Pure and `O(V+E)` in plans/edges (not activities): the
 * caller loads the org's active cross-plan edges once and passes them in.
 *
 * `p === s` is a trivial self-cycle at plan grain (a cross-plan edge whose endpoints share a
 * plan) — the service rejects it as a 422 N31 (`CROSS_PLAN_SAME_PLAN`) before this runs; we
 * still return `true` defensively. This is the plan-grain analogue of the intra-plan
 * `wouldCreateCycle` (ADR-0021); the caller runs it inside the create transaction under an
 * ORG-scoped advisory lock so concurrent mirror inserts cannot bypass it.
 */
export function wouldCreatePlanCycle(
  edges: readonly PlanCrossEdge[],
  predecessorPlanId: string,
  successorPlanId: string,
): boolean {
  if (predecessorPlanId === successorPlanId) return true;

  // Adjacency: predecessor plan → its direct successor plans.
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.predecessorPlanId);
    if (outgoing) outgoing.push(edge.successorPlanId);
    else adjacency.set(edge.predecessorPlanId, [edge.successorPlanId]);
  }

  // DFS forward from the proposed successor plan; reaching the predecessor plan means a cycle.
  const seen = new Set<string>([successorPlanId]);
  const stack: string[] = [successorPlanId];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === predecessorPlanId) return true;
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}
