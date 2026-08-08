import { describe, expect, it } from 'vitest';

import {
  chainEdges,
  chainWouldCycle,
  MAX_CHAIN_LINKS,
  orderChain,
  planChain,
  type ChainCandidate,
} from './chain-order';

const at = (id: string, start: string | null, name = id.toUpperCase()): ChainCandidate => ({
  id,
  name,
  start,
});

describe('orderChain', () => {
  it('orders by start date, not by the order the ids arrived in', () => {
    // The selection order is deliberately the reverse of the time order: a marquee expresses no
    // sequence, so honouring pick order would produce a chain that reads as random.
    const ordered = orderChain([
      at('c', '2026-03-01'),
      at('a', '2026-01-01'),
      at('b', '2026-02-01'),
    ]);
    expect(ordered.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a same-day tie by name, then by id — a total order', () => {
    const ordered = orderChain([
      at('z', '2026-01-01', 'Pour'),
      at('a', '2026-01-01', 'Excavate'),
      at('m', '2026-01-01', 'Excavate'),
    ]);
    expect(ordered.map((o) => o.id)).toEqual(['a', 'm', 'z']);
  });

  it('sorts undated activities last, so an undated bar never drives dated work', () => {
    const ordered = orderChain([at('u', null), at('a', '2026-01-01'), at('v', null)]);
    expect(ordered.map((o) => o.id)).toEqual(['a', 'u', 'v']);
  });

  it('does not mutate its input', () => {
    const input = [at('c', '2026-03-01'), at('a', '2026-01-01')];
    orderChain(input);
    expect(input.map((o) => o.id)).toEqual(['c', 'a']);
  });
});

describe('chainEdges', () => {
  it('is one edge per adjacent pair, in order', () => {
    expect(chainEdges([at('a', null), at('b', null), at('c', null)])).toEqual([
      { predecessorId: 'a', successorId: 'b' },
      { predecessorId: 'b', successorId: 'c' },
    ]);
  });

  it('is empty for fewer than two', () => {
    expect(chainEdges([at('a', null)])).toEqual([]);
    expect(chainEdges([])).toEqual([]);
  });
});

describe('chainWouldCycle', () => {
  it('passes a chain that adds no loop', () => {
    expect(chainWouldCycle(chainEdges([at('a', null), at('b', null)]), [])).toBe(false);
  });

  /**
   * **The case edge-by-edge checking misses**, and the reason the pre-check runs over the resulting
   * graph. A→B and B→C are each individually legal against a plan holding C→A; together they close
   * a loop. Checked one at a time, the write loop would get two edges in and then be refused by the
   * server, leaving a partial chain nobody asked for.
   */
  it('catches a loop that only exists once the WHOLE chain is added', () => {
    const edges = chainEdges([at('a', null), at('b', null), at('c', null)]);
    expect(chainWouldCycle(edges, [{ predecessorId: 'c', successorId: 'a' }])).toBe(true);
    expect(chainWouldCycle([edges[0]!], [{ predecessorId: 'c', successorId: 'a' }])).toBe(false);
  });

  it('does not report a cycle for a diamond — two paths are not a loop', () => {
    expect(
      chainWouldCycle(
        [{ predecessorId: 'a', successorId: 'd' }],
        [
          { predecessorId: 'a', successorId: 'b' },
          { predecessorId: 'a', successorId: 'c' },
          { predecessorId: 'b', successorId: 'd' },
          { predecessorId: 'c', successorId: 'd' },
        ],
      ),
    ).toBe(false);
  });
});

describe('planChain', () => {
  it('refuses fewer than two', () => {
    expect(planChain({ candidates: [at('a', null)], existing: [] }).refusal).toEqual({
      kind: 'tooFew',
    });
  });

  it('refuses above the cap, and says by how much rather than truncating', () => {
    const many = Array.from({ length: MAX_CHAIN_LINKS + 2 }, (_, i) =>
      at(`a${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`),
    );
    const { refusal, edges } = planChain({ candidates: many, existing: [] });
    expect(refusal).toEqual({
      kind: 'tooMany',
      limit: MAX_CHAIN_LINKS,
      requested: many.length - 1,
    });
    // The edges are still returned: a refusal that hides its own subject leaves the planner
    // guessing at what was going to happen.
    expect(edges).toHaveLength(many.length - 1);
  });

  it('reverses the whole order, so Reverse is one control and not a second ordering rule', () => {
    const forward = planChain({
      candidates: [at('a', '2026-01-01'), at('b', '2026-02-01')],
      existing: [],
    });
    const back = planChain({
      candidates: [at('a', '2026-01-01'), at('b', '2026-02-01')],
      existing: [],
      reversed: true,
    });
    expect(forward.edges).toEqual([{ predecessorId: 'a', successorId: 'b' }]);
    expect(back.edges).toEqual([{ predecessorId: 'b', successorId: 'a' }]);
  });

  it('refuses a chain that would close a cycle against the plan as it stands', () => {
    const { refusal } = planChain({
      candidates: [at('a', '2026-01-01'), at('b', '2026-02-01'), at('c', '2026-03-01')],
      existing: [{ predecessorId: 'c', successorId: 'a' }],
    });
    expect(refusal).toEqual({ kind: 'cycle' });
  });
});
