import { computeSchedule, type ComputeOptions } from './compute';
import { buildGraph } from './graph';
import type { EngineActivity, EngineEdge } from './types';

/**
 * One **float path** into a target activity (M6-F6, ADR-0035 §19): a maximal contiguous chain of
 * activities linked by logic, ranked by how much float it carries above the driving path.
 */
export interface FloatPath {
  /** 0 = the driving path (relative float 0); higher = increasingly floaty. */
  index: number;
  /** Working **minutes** of total float above the driving path (the entry activity's total float
   * minus the target's). Path 0 is always 0; branch paths (1+) are non-decreasing. It can be
   * **negative** when a branch is more critical than a floating target (a constraint-broken
   * predecessor with lower total float) — a real signal, not an error. */
  relativeFloat: number;
  /** The chain's activity ids, **target-first** (target … driving root for path 0; entry … root otherwise). */
  activityIds: string[];
}

/**
 * Enumerate the **ranked contiguous float paths** into `targetId` (P6 "multiple float paths",
 * ADR-0035 §19). This is a **read-only analysis** over the computed schedule — it never mutates the
 * network or the stored results.
 *
 * The documented SchedulePoint semantic (see `docs/DECISIONS.md`): a float path is a **contiguous
 * driving chain**, not activities sorted by total float. **Path 0** is the driving path — from the
 * target, step to the driving predecessor (the incoming edge flagged `isDriving`) until none remains.
 * Each activity's **non-driving** (branch) predecessors seed a frontier; the next path pops the
 * lowest-total-float branch entry and walks ITS driving chain through still-unassigned nodes. So every
 * activity belongs to exactly one path (the most-critical that reaches it), paths come out in
 * non-decreasing relative-float order, and a critical activity stays on path 0 even if a floaty branch
 * also touches it. Bounded by `maxPaths` and a per-chain depth guard (no blow-up on dense graphs).
 *
 * Returns `[]` for an unknown target (the caller maps that to a 404 if it exposes an endpoint).
 *
 * @throws {ScheduleGraphNotADagError} via {@link computeSchedule} if the graph cycles.
 */
export function computeFloatPaths(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  options: ComputeOptions,
  targetId: string,
  maxPaths: number,
): FloatPath[] {
  const graph = buildGraph(activities, edges);
  if (!graph.activities.has(targetId) || maxPaths <= 0) return [];

  const output = computeSchedule(activities, edges, options);
  const totalFloatById = new Map(output.results.map((r) => [r.activityId, r.totalFloat]));
  const drivingByEdgeId = new Map(output.edges.map((e) => [e.edgeId, e.isDriving]));
  const targetFloat = totalFloatById.get(targetId) ?? 0;
  const floatOf = (id: string): number => totalFloatById.get(id) ?? 0;

  const assigned = new Set<string>();
  const paths: FloatPath[] = [];
  // The branch frontier: candidate chain-entry activities, popped lowest-total-float first.
  const frontier: { id: string; float: number }[] = [{ id: targetId, float: targetFloat }];
  const depthGuard = activities.length + 1;

  while (paths.length < maxPaths && frontier.length > 0) {
    // Lowest total float first (stable enough for small networks; ties keep insertion order).
    frontier.sort((a, b) => a.float - b.float);
    const entry = frontier.shift()!;
    if (assigned.has(entry.id)) continue;

    // Walk the driving chain backward from the entry through unassigned nodes.
    const chain: string[] = [];
    let cursor: string | undefined = entry.id;
    let steps = 0;
    while (cursor !== undefined && !assigned.has(cursor) && steps < depthGuard) {
      steps += 1;
      assigned.add(cursor);
      chain.push(cursor);
      const incoming = graph.incoming.get(cursor) ?? [];
      const drivingPreds: string[] = [];
      for (const edge of incoming) {
        if (assigned.has(edge.predecessorId)) continue;
        if (drivingByEdgeId.get(edge.id) === true) {
          drivingPreds.push(edge.predecessorId);
        } else {
          // A non-driving predecessor starts a later, floatier path.
          frontier.push({ id: edge.predecessorId, float: floatOf(edge.predecessorId) });
        }
      }
      if (drivingPreds.length === 0) {
        cursor = undefined;
      } else {
        // Continue the chain via the most-critical driving predecessor; the rest branch off.
        drivingPreds.sort((a, b) => floatOf(a) - floatOf(b));
        cursor = drivingPreds[0];
        for (const p of drivingPreds.slice(1)) frontier.push({ id: p, float: floatOf(p) });
      }
    }

    paths.push({
      index: paths.length,
      relativeFloat: entry.float - targetFloat,
      activityIds: chain,
    });
  }

  return paths;
}
