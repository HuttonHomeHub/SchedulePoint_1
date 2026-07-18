import { describe, expect, it } from 'vitest';

import { wouldCreatePlanCycle } from './cross-plan-cycle-detector';
import type { PlanCrossEdge } from './cross-plan-dependency.repository';

const edge = (predecessorPlanId: string, successorPlanId: string): PlanCrossEdge => ({
  predecessorPlanId,
  successorPlanId,
});

describe('wouldCreatePlanCycle', () => {
  it('allows a cross-plan edge into an empty programme graph', () => {
    expect(wouldCreatePlanCycle([], 'A', 'B')).toBe(false);
  });

  it('allows edges that keep the plan graph acyclic', () => {
    // A → B → C ; adding A → C (a programme shortcut) stays a DAG.
    const edges = [edge('A', 'B'), edge('B', 'C')];
    expect(wouldCreatePlanCycle(edges, 'A', 'C')).toBe(false);
  });

  it('rejects a same-plan self-cycle (defensive; the service rejects N31 first)', () => {
    expect(wouldCreatePlanCycle([], 'A', 'A')).toBe(true);
  });

  it('rejects a direct 2-plan mirror (A→B exists, adding B→A)', () => {
    expect(wouldCreatePlanCycle([edge('A', 'B')], 'B', 'A')).toBe(true);
  });

  it('rejects a longer plan cycle (A→B→C exists, adding C→A)', () => {
    const edges = [edge('A', 'B'), edge('B', 'C')];
    expect(wouldCreatePlanCycle(edges, 'C', 'A')).toBe(true);
  });

  it('rejects a cycle that closes through a branch', () => {
    // A → B, A → C, C → D ; adding D → A closes A → C → D → A.
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('C', 'D')];
    expect(wouldCreatePlanCycle(edges, 'D', 'A')).toBe(true);
  });

  it('does not falsely flag when the successor plan cannot reach the predecessor plan', () => {
    // Two disjoint programme chains: X → Y and A → B. Adding Y → A is fine.
    const edges = [edge('X', 'Y'), edge('A', 'B')];
    expect(wouldCreatePlanCycle(edges, 'Y', 'A')).toBe(false);
  });

  it('terminates on an already-cyclic graph (defensive) without looping forever', () => {
    // Should never persist (the invariant prevents it), but the walk must still halt.
    const edges = [edge('A', 'B'), edge('B', 'A')];
    expect(wouldCreatePlanCycle(edges, 'B', 'C')).toBe(false);
  });

  it('handles a large plan chain within the O(V+E) walk', () => {
    const edges: PlanCrossEdge[] = [];
    for (let i = 0; i < 2000; i++) edges.push(edge(`p${i}`, `p${i + 1}`));
    // Adding the tail → head closes one big programme cycle.
    expect(wouldCreatePlanCycle(edges, 'p2000', 'p0')).toBe(true);
    // A forward shortcut stays acyclic.
    expect(wouldCreatePlanCycle(edges, 'p0', 'p2000')).toBe(false);
  });
});
