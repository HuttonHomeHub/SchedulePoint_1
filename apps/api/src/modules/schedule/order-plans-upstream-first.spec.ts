import { describe, expect, it } from 'vitest';

import type { PlanCrossEdge } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { orderPlansUpstreamFirst, ProgrammeCycleError } from './programme-order';

/**
 * The Kahn step extracted from `resolveProgrammeOrder` (#385 M3-T0), called here with an explicit
 * node set. `programme-order.spec.ts` is the before/after oracle for the move and is not edited; these
 * cases cover what only the new entry point can be asked: several roots at once, edges that leave the
 * set, and a cycle among the nodes.
 */
const edge = (predecessorPlanId: string, successorPlanId: string): PlanCrossEdge => ({
  predecessorPlanId,
  successorPlanId,
});

describe('orderPlansUpstreamFirst', () => {
  it('orders a multi-root node set upstream-first, ties by id', () => {
    // Two independent chains, b → d and a → c. Roots a and b tie, then c and d are released in turn.
    const edges = [edge('b', 'd'), edge('a', 'c')];
    expect(orderPlansUpstreamFirst(new Set(['a', 'b', 'c', 'd']), edges)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('keeps an isolated node (no edge touches it) in id order among the roots', () => {
    const edges = [edge('m', 'z')];
    expect(orderPlansUpstreamFirst(new Set(['z', 'm', 'b']), edges)).toEqual(['b', 'm', 'z']);
  });

  it('orders a chain whose ids sort against it upstream-first, not id-first', () => {
    // Upstream `x` sorts after its downstreams, so an id order would put it last.
    const edges = [edge('x', 'm'), edge('m', 'b')];
    expect(orderPlansUpstreamFirst(new Set(['b', 'm', 'x']), edges)).toEqual(['x', 'm', 'b']);
  });

  it('ignores an edge with an end outside the node set, so a gap in a chain leaves the id tie-break', () => {
    // x → m → b with m absent: x and b are unrelated within the set, so b (id-first) comes first.
    // This is the case the boot re-derivation avoids by passing the whole organisation graph.
    const edges = [edge('x', 'm'), edge('m', 'b')];
    expect(orderPlansUpstreamFirst(new Set(['b', 'x']), edges)).toEqual(['b', 'x']);
  });

  it('throws ProgrammeCycleError naming the plans on a residual cycle, id-sorted', () => {
    const edges = [edge('a', 'b'), edge('c', 'b'), edge('b', 'c')];
    const run = () => orderPlansUpstreamFirst(new Set(['a', 'b', 'c']), edges);
    expect(run).toThrow(ProgrammeCycleError);
    try {
      run();
    } catch (error) {
      expect((error as ProgrammeCycleError).unresolvedPlanIds).toEqual(['b', 'c']);
    }
  });

  it('returns an empty order for an empty node set', () => {
    expect(orderPlansUpstreamFirst(new Set(), [edge('a', 'b')])).toEqual([]);
  });
});
