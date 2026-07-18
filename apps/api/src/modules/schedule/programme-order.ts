/**
 * Programme recalc ordering (inter-project M2, ADR-0045 §4 / ADR-0035 §30.8) — the pure, engine-free
 * resolver that turns a target plan + the org's cross-plan edge set into the **upstream closure** of that
 * plan, **topologically ordered upstream-first** (the target is LAST). It lives ABOVE the engine (beside
 * {@link ./schedule.service}); it never touches `computeSchedule` and reads no database.
 *
 * The graph here is coarse — the same plan-node / cross-plan-edge graph as {@link
 * ./cross-plan-dependencies/cross-plan-cycle-detector}. An edge `A → B` means plan A is **upstream** of B
 * (B derives an external bound from A, ADR-0045 §2), so A must be recalculated **before** B. The
 * orchestrator ({@link ./schedule.service} `recalculateProgramme`) walks the returned order, recalculating
 * each plan with the existing single-plan transaction; because upstreams come first, every downstream
 * plan reads its upstreams' freshly-written dates when it derives (§30.8).
 *
 * Determinism: the closure is the set of plans transitively upstream of the target (plus the target); the
 * topological order breaks every tie by **plan id** (Kahn's algorithm over an id-sorted frontier), so the
 * order — and therefore the per-plan advisory-lock acquisition order — is stable across runs. A stable
 * lock order is what makes two overlapping programme recalcs deadlock-free (ADR-0045 §4).
 */
import type { PlanCrossEdge } from '../cross-plan-dependencies/cross-plan-dependency.repository';

/**
 * Thrown when a residual **plan-level** cycle survives the topological sort of a programme closure.
 *
 * This should be unreachable in production: the plan-level DAG invariant (ADR-0045 §3) rejects any
 * cross-plan edge that would close a cycle, under an org-scoped advisory lock. The guard mirrors the
 * engine's {@link ./engine/errors} `ScheduleGraphNotADagError` — if the invariant is ever breached it
 * **fails loud** (never loops forever, never runs a partial programme), and the service maps it to a
 * distinct alarm-worthy 500.
 */
export class ProgrammeCycleError extends Error {
  /** The plan ids that could not be ordered (they sit on/behind a residual cross-plan cycle). */
  readonly unresolvedPlanIds: readonly string[];

  constructor(unresolvedPlanIds: readonly string[]) {
    super(
      `Programme graph is not a DAG: ${unresolvedPlanIds.length} plan${
        unresolvedPlanIds.length === 1 ? '' : 's'
      } could not be topologically ordered (residual cross-plan cycle).`,
    );
    this.name = 'ProgrammeCycleError';
    this.unresolvedPlanIds = unresolvedPlanIds;
  }
}

/**
 * Resolve the **upstream closure** of `targetPlanId` — the target plus every plan it transitively depends
 * on over cross-plan edges — in **topological order, upstream-first** (so every plan precedes the plans
 * that derive from it; the target is LAST). Ties are broken by plan id for a stable, deadlock-free lock
 * order (ADR-0045 §4 / ADR-0035 §30.8).
 *
 * Only plans **upstream** of the target are included: a plan downstream of the target (one that derives
 * from it) is not recalculated by the target's programme solve, and a disconnected component is ignored.
 * A target with no incoming cross-plan edges yields `[targetPlanId]` — a single-plan recalc.
 *
 * @throws {@link ProgrammeCycleError} if a residual cycle is detected within the closure (unreachable
 *   given the F3 plan-level DAG invariant; a defensive fail-loud guard).
 */
export function resolveProgrammeOrder(
  targetPlanId: string,
  edges: readonly PlanCrossEdge[],
): string[] {
  // Predecessors (upstreams) of each plan and successors (downstreams), restricted to this org's edges.
  const upstreamsOf = new Map<string, string[]>();
  const downstreamsOf = new Map<string, string[]>();
  for (const edge of edges) {
    (upstreamsOf.get(edge.successorPlanId) ?? setDefault(upstreamsOf, edge.successorPlanId)).push(
      edge.predecessorPlanId,
    );
    (
      downstreamsOf.get(edge.predecessorPlanId) ?? setDefault(downstreamsOf, edge.predecessorPlanId)
    ).push(edge.successorPlanId);
  }

  // 1. Upstream closure: BFS backwards from the target over predecessor edges. The target is always in.
  const closure = new Set<string>([targetPlanId]);
  const frontier: string[] = [targetPlanId];
  while (frontier.length > 0) {
    const plan = frontier.pop() as string;
    for (const upstream of upstreamsOf.get(plan) ?? []) {
      if (!closure.has(upstream)) {
        closure.add(upstream);
        frontier.push(upstream);
      }
    }
  }

  // 2. Kahn's algorithm over the closure only, with an id-sorted frontier for a deterministic order.
  //    In-degree = how many upstream (predecessor) edges point at a plan FROM WITHIN the closure.
  const inDegree = new Map<string, number>();
  for (const plan of closure) {
    let degree = 0;
    for (const upstream of upstreamsOf.get(plan) ?? []) {
      if (closure.has(upstream)) degree += 1;
    }
    inDegree.set(plan, degree);
  }

  // The ready set: closure plans with no remaining in-closure upstream. Kept sorted (ties by id).
  const ready = [...closure].filter((plan) => inDegree.get(plan) === 0).sort(compareIds);
  const order: string[] = [];
  while (ready.length > 0) {
    const plan = ready.shift() as string;
    order.push(plan);
    for (const downstream of downstreamsOf.get(plan) ?? []) {
      if (!closure.has(downstream)) continue;
      const remaining = (inDegree.get(downstream) as number) - 1;
      inDegree.set(downstream, remaining);
      if (remaining === 0) insertSorted(ready, downstream);
    }
  }

  // Every closure plan must have been ordered; a shortfall means a residual cycle (invariant breach).
  if (order.length !== closure.size) {
    const unresolved = [...closure].filter((plan) => !order.includes(plan)).sort(compareIds);
    throw new ProgrammeCycleError(unresolved);
  }
  return order;
}

/** Seed an empty adjacency bucket for `key` and return it, so the caller can push in one expression. */
function setDefault(map: Map<string, string[]>, key: string): string[] {
  const bucket: string[] = [];
  map.set(key, bucket);
  return bucket;
}

/** Stable, locale-independent plan-id comparison (the tie-break that fixes the order + lock order). */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Insert `id` into the already-sorted `ready` frontier, preserving the id order (small N). */
function insertSorted(ready: string[], id: string): void {
  let lo = 0;
  let hi = ready.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareIds(ready[mid] as string, id) < 0) lo = mid + 1;
    else hi = mid;
  }
  ready.splice(lo, 0, id);
}
