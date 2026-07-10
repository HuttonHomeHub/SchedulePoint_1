import { describe, expect, it } from 'vitest';

import { ScheduleGraphNotADagError, UnknownActivityError } from './errors';
import { buildGraph } from './graph';
import type { EngineActivity, EngineEdge } from './types';

const task = (id: string): EngineActivity => ({ id, durationDays: 1, type: 'TASK' });
const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  predecessorId,
  successorId,
  type: 'FS',
  lagDays: 0,
});

describe('buildGraph', () => {
  it('orders a linear chain predecessors-first', () => {
    // a → b → c
    const graph = buildGraph([task('a'), task('b'), task('c')], [fs('a', 'b'), fs('b', 'c')]);
    expect(graph.order).toEqual(['a', 'b', 'c']);
  });

  it('indexes incoming and outgoing edges per node', () => {
    const graph = buildGraph([task('a'), task('b'), task('c')], [fs('a', 'c'), fs('b', 'c')]);
    expect(graph.outgoing.get('a')).toHaveLength(1);
    expect(graph.outgoing.get('c')).toHaveLength(0);
    expect(graph.incoming.get('c')).toHaveLength(2);
    expect(graph.incoming.get('a')).toHaveLength(0);
  });

  it('is deterministic: ties break on the smallest id regardless of input order', () => {
    // Two independent roots (b, a) both feeding c. Whatever order the nodes and
    // edges arrive in, the ready set is drained smallest-id-first.
    const forward = buildGraph([task('b'), task('a'), task('c')], [fs('b', 'c'), fs('a', 'c')]);
    const shuffled = buildGraph([task('c'), task('a'), task('b')], [fs('a', 'c'), fs('b', 'c')]);
    expect(forward.order).toEqual(['a', 'b', 'c']);
    expect(shuffled.order).toEqual(['a', 'b', 'c']);
  });

  it('orders a diamond so both middle nodes precede the join', () => {
    // a → {b, c} → d
    const graph = buildGraph(
      [task('a'), task('b'), task('c'), task('d')],
      [fs('a', 'b'), fs('a', 'c'), fs('b', 'd'), fs('c', 'd')],
    );
    expect(graph.order[0]).toBe('a');
    expect(graph.order[3]).toBe('d');
    expect(graph.order.indexOf('b')).toBeLessThan(graph.order.indexOf('d'));
    expect(graph.order.indexOf('c')).toBeLessThan(graph.order.indexOf('d'));
  });

  it('orders islands (disconnected components) by id', () => {
    const graph = buildGraph([task('a'), task('b')], []);
    expect(graph.order).toEqual(['a', 'b']);
  });

  it('handles the empty plan', () => {
    const graph = buildGraph([], []);
    expect(graph.order).toEqual([]);
    expect(graph.activities.size).toBe(0);
  });

  describe('the defensive DAG guard', () => {
    it('throws on an injected 2-node cycle (a→b, b→a)', () => {
      expect(() => buildGraph([task('a'), task('b')], [fs('a', 'b'), fs('b', 'a')])).toThrow(
        ScheduleGraphNotADagError,
      );
    });

    it('throws on an injected 3-node cycle (a→b→c→a)', () => {
      const act = () =>
        buildGraph([task('a'), task('b'), task('c')], [fs('a', 'b'), fs('b', 'c'), fs('c', 'a')]);
      expect(act).toThrow(ScheduleGraphNotADagError);
    });

    it('reports the unresolved activity ids on the error', () => {
      try {
        buildGraph([task('a'), task('b')], [fs('a', 'b'), fs('b', 'a')]);
        expect.unreachable('expected the DAG guard to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ScheduleGraphNotADagError);
        expect((error as ScheduleGraphNotADagError).unresolvedActivityIds).toEqual(['a', 'b']);
      }
    });

    it('still orders the acyclic part but throws because a cycle remains', () => {
      // d is a clean root; the a↔b↔c tangle behind it cannot be ordered.
      expect(() =>
        buildGraph(
          [task('a'), task('b'), task('c'), task('d')],
          [fs('d', 'a'), fs('a', 'b'), fs('b', 'c'), fs('c', 'a')],
        ),
      ).toThrow(ScheduleGraphNotADagError);
    });
  });

  it('fails loud when an edge references an unknown activity', () => {
    expect(() => buildGraph([task('a')], [fs('a', 'ghost')])).toThrow(UnknownActivityError);
  });
});
