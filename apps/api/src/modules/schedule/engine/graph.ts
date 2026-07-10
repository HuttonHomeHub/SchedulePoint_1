import { ScheduleGraphNotADagError, UnknownActivityError } from './errors';
import type { EngineActivity, EngineEdge } from './types';

/**
 * A validated, topologically ordered view of a plan's schedule network. The
 * forward pass walks `order` front-to-back; the backward pass walks it in
 * reverse. `incoming`/`outgoing` index the edges incident on each node so the
 * passes never re-scan the full edge list.
 */
export interface ScheduleGraph {
  /** Every activity, keyed by id. */
  readonly activities: ReadonlyMap<string, EngineActivity>;
  /** Activity ids in a deterministic topological order (predecessors first). */
  readonly order: readonly string[];
  /** Edges entering each activity (it is the successor). */
  readonly incoming: ReadonlyMap<string, readonly EngineEdge[]>;
  /** Edges leaving each activity (it is the predecessor). */
  readonly outgoing: ReadonlyMap<string, readonly EngineEdge[]>;
}

/** Binary-insert `id` into an ascending array, keeping it sorted. */
function insertSorted(sorted: string[], id: string): void {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid]! < id) low = mid + 1;
    else high = mid;
  }
  sorted.splice(low, 0, id);
}

/**
 * Build the schedule graph from a plan's activities and edges, computing a
 * **deterministic topological order** via Kahn's algorithm.
 *
 * Determinism matters: the same network must always produce the same order (and
 * therefore the same schedule) run-to-run. Among the nodes currently ready (zero
 * remaining in-degree) we always take the one with the smallest id, so ties are
 * broken stably regardless of input order.
 *
 * A **defensive DAG guard** closes the loop: if any node is left unordered after
 * Kahn drains, the graph contained a cycle (the write-path invariant, ADR-0021,
 * should have prevented this) and we throw {@link ScheduleGraphNotADagError}
 * rather than loop or emit a partial schedule.
 *
 * @throws {UnknownActivityError} if an edge references an unknown activity id.
 * @throws {ScheduleGraphNotADagError} if the graph is cyclic.
 */
export function buildGraph(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
): ScheduleGraph {
  const activityMap = new Map<string, EngineActivity>();
  for (const activity of activities) activityMap.set(activity.id, activity);

  const incoming = new Map<string, EngineEdge[]>();
  const outgoing = new Map<string, EngineEdge[]>();
  const inDegree = new Map<string, number>();
  for (const id of activityMap.keys()) {
    incoming.set(id, []);
    outgoing.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (!activityMap.has(edge.predecessorId)) throw new UnknownActivityError(edge.predecessorId);
    if (!activityMap.has(edge.successorId)) throw new UnknownActivityError(edge.successorId);
    outgoing.get(edge.predecessorId)!.push(edge);
    incoming.get(edge.successorId)!.push(edge);
    inDegree.set(edge.successorId, inDegree.get(edge.successorId)! + 1);
  }

  // Kahn's algorithm with a min-id ready set for deterministic ordering.
  const ready: string[] = [];
  for (const [id, degree] of inDegree) if (degree === 0) insertSorted(ready, id);

  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id)!) {
      const next = edge.successorId;
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) insertSorted(ready, next);
    }
  }

  if (order.length !== activityMap.size) {
    const ordered = new Set(order);
    const unresolved = [...activityMap.keys()].filter((id) => !ordered.has(id)).sort();
    throw new ScheduleGraphNotADagError(unresolved);
  }

  return { activities: activityMap, order, incoming, outgoing };
}
