import type { DependencyType } from '@repo/types';

/**
 * Client-side link-draw legality pre-check (ADR-0026 D5). Pure, so the canvas can ring only
 * **legal** drop targets during a dependency-draw — the user learns a link is illegal *before*
 * release, rather than only when the API rejects it on drop. It mirrors the server's invariants
 * (self-loop, duplicate per `(predecessor, successor, type)`, and the DAG/cycle guard, ADR-0021),
 * but the server stays authoritative: this only pre-empts drops the loaded graph already proves
 * illegal — it never authorises one.
 */

export type LinkIllegalReason = 'self' | 'duplicate' | 'cycle';

/** The minimal directed edge shape the check needs (a subset of `DependencySummary`/`RenderEdge`). */
export interface LegalityEdge {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
}

/**
 * Why a `predecessor → successor` link of `type` would be rejected given the current `edges`, or
 * `null` when it is legal. Cycle detection is type-independent (the graph is directed
 * predecessor→successor); a duplicate is the same `(predecessor, successor, type)` triple.
 */
export function linkLegality(
  predecessorId: string,
  successorId: string,
  type: DependencyType,
  edges: readonly LegalityEdge[],
): LinkIllegalReason | null {
  if (predecessorId === successorId) return 'self';
  if (
    edges.some(
      (e) => e.predecessorId === predecessorId && e.successorId === successorId && e.type === type,
    )
  ) {
    return 'duplicate';
  }
  // Adding predecessor→successor closes a cycle iff the successor can already reach the predecessor.
  if (canReach(successorId, predecessorId, edges)) return 'cycle';
  return null;
}

/** BFS over successor adjacency: can `from` reach `to` following existing edges? */
function canReach(from: string, to: string, edges: readonly LegalityEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.predecessorId);
    if (list) list.push(edge.successorId);
    else adjacency.set(edge.predecessorId, [edge.successorId]);
  }
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** Human-readable reason for the conflict banner + live-region announcement. */
export function linkIllegalMessage(reason: LinkIllegalReason, successorName: string): string {
  switch (reason) {
    case 'self':
      return 'An activity can’t depend on itself.';
    case 'duplicate':
      return `“${successorName}” already has this link.`;
    case 'cycle':
      return `Linking to “${successorName}” would create a circular dependency.`;
  }
}
