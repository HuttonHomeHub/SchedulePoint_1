import type { DependencySummary } from '@repo/types';

/**
 * The pure, renderer-agnostic **logic-path** computation behind the TSLD *Isolate logic path* command
 * (spec `docs/specs/canvas-nav/`, behind `VITE_CANVAS_NAV`). Like `lenses.ts` / `render-model.ts` it has
 * **no** canvas, DOM, React or data-fetching dependency and does **no** schedule arithmetic — it only
 * walks the client's already-shipped dependency edge list (`usePlanDependencies`), so it is exhaustively
 * unit-tested. `TsldPanel` memoises the chain into an `isolateDimmedIds` complement fed to the shipped
 * `TsldScene.dimmedIds` dim seam (unioned with any active filter dim).
 */

/**
 * The isolate chain mode (CQ-1): the **full** transitive predecessor+successor closure, or the
 * **driving**-only sub-chain (restricted to `DependencySummary.isDriving` edges — the binding logic
 * ties the engine already computed). Both derive from the same client edge list; no fetch.
 */
export type LogicPathMode = 'full' | 'driving';

/**
 * The transitive **logic chain** of the selected activity — the set of activity ids reachable from it by
 * walking dependency edges both **upstream** (predecessors) and **downstream** (successors), plus the
 * selected activity itself. `mode: 'driving'` restricts the walk to driving edges (`isDriving`), yielding
 * the driving-only sub-chain; `mode: 'full'` walks every edge.
 *
 * Pure and O(V + E): builds forward/back adjacency once, then a visited-set DFS in each direction
 * (defensive against duplicate edges and — though the graph is a DAG, ADR-0021 — self-loops / cycles,
 * which the visited set makes terminating). An empty/absent selection yields the empty set (isolate off).
 */
export function computeLogicPath(
  selectedId: string | null,
  dependencies: readonly DependencySummary[],
  options: { mode: LogicPathMode },
): Set<string> {
  const chain = new Set<string>();
  if (selectedId === null) return chain;

  const drivingOnly = options.mode === 'driving';
  const successorsOf = new Map<string, string[]>();
  const predecessorsOf = new Map<string, string[]>();
  for (const edge of dependencies) {
    if (drivingOnly && !edge.isDriving) continue;
    const predId = edge.predecessor.id;
    const succId = edge.successor.id;
    if (predId === succId) continue; // guard a self-loop (never valid, but keeps the walk total)
    push(successorsOf, predId, succId);
    push(predecessorsOf, succId, predId);
  }

  chain.add(selectedId);
  traverse(selectedId, successorsOf, chain);
  traverse(selectedId, predecessorsOf, chain);
  return chain;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** Iterative DFS from `start` over `adjacency`, adding every newly-reached node to `visited` (the shared
 * chain set — so a node reachable both up- and downstream is added once, and cycles terminate). */
function traverse(
  start: string,
  adjacency: ReadonlyMap<string, string[]>,
  visited: Set<string>,
): void {
  const stack: string[] = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
}

/**
 * The **complement** of a logic chain within the plan — every activity id NOT on the chain, i.e. the set
 * the canvas dims when isolate is active. `TsldPanel` feeds this into `TsldScene.dimmedIds` (unioned with
 * any active filter dim), reusing the shipped culled paint branch (zero new draw cost, ADR-0026).
 */
export function isolateDimmedIds(
  allIds: Iterable<string>,
  chain: ReadonlySet<string>,
): Set<string> {
  const dimmed = new Set<string>();
  for (const id of allIds) {
    if (!chain.has(id)) dimmed.add(id);
  }
  return dimmed;
}
