import type { DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeLogicPath, isolateDimmedIds } from './logic-path';

/** A minimal {@link DependencySummary} edge for the pure logic-path walk (only endpoints + `isDriving`
 * are read). */
function edge(predId: string, succId: string, isDriving = true): DependencySummary {
  return {
    id: `${predId}-${succId}`,
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    predecessor: { id: predId, code: null, name: predId },
    successor: { id: succId, code: null, name: succId },
  };
}

describe('computeLogicPath', () => {
  it('returns the empty set when nothing is selected', () => {
    expect(computeLogicPath(null, [edge('a', 'b')], { mode: 'full' }).size).toBe(0);
  });

  it('includes just the selected node when it has no edges', () => {
    // a—b—c is a chain, but selecting the disconnected node d yields only itself.
    const deps = [edge('a', 'b'), edge('b', 'c')];
    expect([...computeLogicPath('d', deps, { mode: 'full' })]).toEqual(['d']);
  });

  it('walks the full transitive predecessor + successor chain from the middle of a linear chain', () => {
    // a → b → c → d ; selecting c reaches upstream (a, b) AND downstream (d), plus itself.
    const deps = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];
    expect(computeLogicPath('c', deps, { mode: 'full' })).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('follows a fan-in / fan-out branch', () => {
    // a → c, b → c (fan-in); c → d, c → e (fan-out). Selecting c reaches all five.
    const deps = [edge('a', 'c'), edge('b', 'c'), edge('c', 'd'), edge('c', 'e')];
    expect(computeLogicPath('c', deps, { mode: 'full' })).toEqual(
      new Set(['a', 'b', 'c', 'd', 'e']),
    );
  });

  it('covers both arms of a diamond', () => {
    // a → b, a → c, b → d, c → d. Selecting a (or d) reaches the whole diamond exactly once.
    const deps = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    expect(computeLogicPath('a', deps, { mode: 'full' })).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(computeLogicPath('d', deps, { mode: 'full' })).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('restricts to the driving sub-chain in driving mode', () => {
    // a →(driving) b →(non-driving) c. Full reaches c; driving stops at b.
    const deps = [edge('a', 'b', true), edge('b', 'c', false)];
    expect(computeLogicPath('a', deps, { mode: 'full' })).toEqual(new Set(['a', 'b', 'c']));
    expect(computeLogicPath('a', deps, { mode: 'driving' })).toEqual(new Set(['a', 'b']));
  });

  it('terminates on a cycle (visited-set guard) rather than looping forever', () => {
    // a → b → c → a (a cycle — defensive; ADR-0021 forbids it, but the walk must still be total).
    const deps = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    expect(computeLogicPath('a', deps, { mode: 'full' })).toEqual(new Set(['a', 'b', 'c']));
  });

  it('ignores a self-loop edge', () => {
    const deps = [edge('a', 'a'), edge('a', 'b')];
    expect(computeLogicPath('a', deps, { mode: 'full' })).toEqual(new Set(['a', 'b']));
  });
});

describe('isolateDimmedIds', () => {
  it('is the complement of the chain within the plan ids', () => {
    const chain = new Set(['a', 'b']);
    expect(isolateDimmedIds(['a', 'b', 'c', 'd'], chain)).toEqual(new Set(['c', 'd']));
  });

  it('dims nothing when the chain is the whole plan', () => {
    expect(isolateDimmedIds(['a', 'b'], new Set(['a', 'b'])).size).toBe(0);
  });
});
