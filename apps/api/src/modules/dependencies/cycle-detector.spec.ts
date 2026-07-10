import { describe, expect, it } from 'vitest';

import { wouldCreateCycle } from './cycle-detector';
import type { PlanEdge } from './dependency.repository';

const edge = (predecessorId: string, successorId: string): PlanEdge => ({
  predecessorId,
  successorId,
});

describe('wouldCreateCycle', () => {
  it('allows an edge into an empty graph', () => {
    expect(wouldCreateCycle([], 'a', 'b')).toBe(false);
  });

  it('allows edges that keep the graph acyclic', () => {
    // a → b → c ; adding a → c (a shortcut) stays a DAG.
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });

  it('rejects a self-loop', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('rejects a direct 2-node mirror (a→b exists, adding b→a)', () => {
    expect(wouldCreateCycle([edge('a', 'b')], 'b', 'a')).toBe(true);
  });

  it('rejects a longer cycle (a→b→c exists, adding c→a)', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
  });

  it('rejects a cycle that closes through a branch', () => {
    // a → b, a → c, c → d ; adding d → a closes a → c → d → a.
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('c', 'd')];
    expect(wouldCreateCycle(edges, 'd', 'a')).toBe(true);
  });

  it('does not falsely flag when the successor cannot reach the predecessor', () => {
    // Two disjoint chains: x → y and a → b. Adding y → a is fine.
    const edges = [edge('x', 'y'), edge('a', 'b')];
    expect(wouldCreateCycle(edges, 'y', 'a')).toBe(false);
  });

  it('terminates on an already-cyclic graph (defensive) without looping forever', () => {
    // Should never happen (the invariant prevents it), but the walk must still halt.
    const edges = [edge('a', 'b'), edge('b', 'a')];
    expect(wouldCreateCycle(edges, 'b', 'c')).toBe(false);
  });

  it('handles a large chain within the O(V+E) walk', () => {
    const edges: PlanEdge[] = [];
    for (let i = 0; i < 2000; i++) edges.push(edge(`n${i}`, `n${i + 1}`));
    // Adding the tail → head closes one big cycle.
    expect(wouldCreateCycle(edges, 'n2000', 'n0')).toBe(true);
    // A forward shortcut stays acyclic.
    expect(wouldCreateCycle(edges, 'n0', 'n2000')).toBe(false);
  });
});
