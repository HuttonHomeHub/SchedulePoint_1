import { describe, expect, it } from 'vitest';

import type { PlanCrossEdge } from '../cross-plan-dependencies/cross-plan-dependency.repository';

import { ProgrammeCycleError, resolveProgrammeOrder } from './programme-order';

const edge = (predecessorPlanId: string, successorPlanId: string): PlanCrossEdge => ({
  predecessorPlanId,
  successorPlanId,
});

describe('resolveProgrammeOrder', () => {
  it('returns just the target when it has no cross-plan edges', () => {
    expect(resolveProgrammeOrder('C', [])).toEqual(['C']);
  });

  it('returns just the target when no edge feeds it (disconnected programme)', () => {
    // X → Y exists but is unrelated to C; C's upstream closure is only C.
    expect(resolveProgrammeOrder('C', [edge('X', 'Y')])).toEqual(['C']);
  });

  it('orders a chain upstream-first with the target last (A→B→C, target C)', () => {
    const edges = [edge('A', 'B'), edge('B', 'C')];
    expect(resolveProgrammeOrder('C', edges)).toEqual(['A', 'B', 'C']);
  });

  it('orders a diamond upstream-first, target last, tie-broken by id (target D)', () => {
    // A → B, A → C, B → D, C → D. Closure {A,B,C,D}; B and C tie → id order B before C; D last.
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];
    expect(resolveProgrammeOrder('D', edges)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ignores upstream plans that are NOT in the target’s closure', () => {
    // Target B's closure is {A, B}. The X → C chain (and C → nothing here) is unrelated and excluded.
    const edges = [edge('A', 'B'), edge('X', 'C')];
    expect(resolveProgrammeOrder('B', edges)).toEqual(['A', 'B']);
  });

  it('excludes plans DOWNSTREAM of the target (only upstreams are recalculated)', () => {
    // A → B → C: for target B, C (a downstream) is excluded; only A → B is the closure.
    const edges = [edge('A', 'B'), edge('B', 'C')];
    expect(resolveProgrammeOrder('B', edges)).toEqual(['A', 'B']);
  });

  it('is deterministic under an id permutation of the edge list (diamond)', () => {
    const forward = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];
    const shuffled = [edge('C', 'D'), edge('B', 'D'), edge('A', 'C'), edge('A', 'B')];
    const expected = ['A', 'B', 'C', 'D'];
    expect(resolveProgrammeOrder('D', forward)).toEqual(expected);
    expect(resolveProgrammeOrder('D', shuffled)).toEqual(expected);
  });

  it('respects the id tie-break with numeric-looking ids consistently', () => {
    // Two independent upstreams p10 and p2 of the target t; string compare puts p10 before p2.
    const edges = [edge('p10', 't'), edge('p2', 't')];
    expect(resolveProgrammeOrder('t', edges)).toEqual(['p10', 'p2', 't']);
  });

  it('handles a fan-in of several upstreams, all before the target, id-sorted', () => {
    const edges = [edge('d', 't'), edge('a', 't'), edge('c', 't'), edge('b', 't')];
    expect(resolveProgrammeOrder('t', edges)).toEqual(['a', 'b', 'c', 'd', 't']);
  });

  it('throws ProgrammeCycleError when a residual cycle sits inside the closure', () => {
    // A→B and B→A both feed the target's closure via B→T; the A↔B cycle can't be ordered.
    const edges = [edge('A', 'B'), edge('B', 'A'), edge('B', 'T')];
    expect(() => resolveProgrammeOrder('T', edges)).toThrow(ProgrammeCycleError);
  });

  it('carries the unresolved plan ids on the cycle error', () => {
    const edges = [edge('A', 'B'), edge('B', 'A'), edge('B', 'T')];
    try {
      resolveProgrammeOrder('T', edges);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProgrammeCycleError);
      // A and B sit on the cycle; T sits behind it — none can be ordered. Reported id-sorted.
      expect((error as ProgrammeCycleError).unresolvedPlanIds).toEqual(['A', 'B', 'T']);
    }
  });
});
