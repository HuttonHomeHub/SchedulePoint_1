import { describe, expect, it } from 'vitest';

import { ancestorIds, subtreeSizes, wouldCloseLoop } from './wbs-tree';

type Row = { id: string; parentId: string | null };

const byIdOf = (rows: Row[]): Map<string, Row> => new Map(rows.map((r) => [r.id, r]));

/** a ▸ b ▸ c ▸ d, plus an unrelated root x. */
const CHAIN: Row[] = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: 'c' },
  { id: 'x', parentId: null },
];

describe('ancestorIds', () => {
  it('is empty at depth 0', () => {
    expect([...ancestorIds('a', byIdOf(CHAIN))]).toEqual([]);
  });

  it('holds the one parent at depth 1', () => {
    expect([...ancestorIds('b', byIdOf(CHAIN))]).toEqual(['a']);
  });

  it('holds every level, nearest first, at depth 3', () => {
    expect([...ancestorIds('d', byIdOf(CHAIN))]).toEqual(['c', 'b', 'a']);
  });

  it('stops at an orphan rather than inventing an ancestor', () => {
    const rows: Row[] = [{ id: 'o', parentId: 'gone' }];
    expect([...ancestorIds('o', byIdOf(rows))]).toEqual([]);
  });

  it('terminates on a malformed cycle', () => {
    const rows: Row[] = [
      { id: 'p', parentId: 'q' },
      { id: 'q', parentId: 'p' },
    ];
    expect([...ancestorIds('p', byIdOf(rows))]).toEqual(['q']);
  });
});

describe('subtreeSizes', () => {
  it('counts everything under an id at any depth', () => {
    const sizes = subtreeSizes(CHAIN);
    expect(sizes.get('a')).toBe(3);
    expect(sizes.get('b')).toBe(2);
    expect(sizes.get('c')).toBe(1);
  });

  it('omits an id with nothing under it', () => {
    const sizes = subtreeSizes(CHAIN);
    expect(sizes.has('d')).toBe(false);
    expect(sizes.has('x')).toBe(false);
  });

  it('does not count a child whose parent is not present', () => {
    expect(subtreeSizes([{ id: 'o', parentId: 'gone' }]).size).toBe(0);
  });

  it('terminates on a malformed cycle', () => {
    const sizes = subtreeSizes([
      { id: 'p', parentId: 'q' },
      { id: 'q', parentId: 'p' },
    ]);
    expect(sizes.get('p')).toBe(1);
  });
});

describe('wouldCloseLoop', () => {
  const ancestors = ancestorIds('d', byIdOf(CHAIN));

  it('refuses the target itself', () => {
    expect(wouldCloseLoop('d', 'd', ancestors)).toBe(true);
  });

  it('refuses a summary that already contains the target, at any depth', () => {
    expect(wouldCloseLoop('c', 'd', ancestors)).toBe(true);
    expect(wouldCloseLoop('a', 'd', ancestors)).toBe(true);
  });

  it('allows an unrelated row, and a row inside the target', () => {
    expect(wouldCloseLoop('x', 'd', ancestors)).toBe(false);
    expect(wouldCloseLoop('d', 'a', new Set())).toBe(false);
  });

  it('answers on a malformed tree without hanging', () => {
    const loop = byIdOf([
      { id: 'p', parentId: 'q' },
      { id: 'q', parentId: 'p' },
    ]);
    expect(wouldCloseLoop('q', 'p', ancestorIds('p', loop))).toBe(true);
  });
});

/**
 * SC-2: the client predicate never lets through a move the server's resulting-tree walk would
 * refuse. The oracle below is the server's rule (`assertNoParentCycles`) restated in the test only.
 */
describe('wouldCloseLoop property', () => {
  const closesCycle = (rows: Row[], move: { id: string; parentId: string }): boolean => {
    const next = new Map(rows.map((r) => [r.id, r.parentId]));
    next.set(move.id, move.parentId);
    for (const start of next.keys()) {
      const seen = new Set<string>();
      let cursor: string | null | undefined = start;
      while (cursor !== null && cursor !== undefined) {
        if (seen.has(cursor)) return true;
        seen.add(cursor);
        cursor = next.get(cursor);
      }
    }
    return false;
  };

  /** A deterministic pseudo-random forest — each node's parent is an earlier node or none. */
  const forest = (seed: number, size: number): Row[] => {
    let state = seed;
    const next = (): number => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    return Array.from({ length: size }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 || next() < 0.25 ? null : `n${Math.floor(next() * i)}`,
    }));
  };

  it('permits only moves that leave a forest, and refuses every move that would not', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const rows = forest(seed, 14);
      const byId = byIdOf(rows);
      for (const target of rows) {
        const ancestors = ancestorIds(target.id, byId);
        for (const candidate of rows) {
          const refused = wouldCloseLoop(candidate.id, target.id, ancestors);
          const cyclic = closesCycle(rows, { id: candidate.id, parentId: target.id });
          expect(refused, `seed ${seed}: ${candidate.id} under ${target.id}`).toBe(cyclic);
        }
      }
    }
  });
});
