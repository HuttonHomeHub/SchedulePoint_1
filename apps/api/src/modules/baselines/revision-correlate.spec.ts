import { describe, expect, it } from 'vitest';

import { correlateByCode, correlateEdges } from './revision-correlate';
import type { RevisionEdge, RevisionRow } from './revision-delta';

/**
 * The five clauses of the matching contract (spec §2.4 D1a–D1e), one named case each.
 *
 * Each case's name carries the reason as well as the behaviour, because the behaviour alone reads as
 * arbitrary — most obviously D1a, where "matched exactly" looks like an omission until you know that
 * `uq_activities_plan_code` is case-sensitive and folding would invent a collision.
 */

const row = (over: Partial<RevisionRow> & Pick<RevisionRow, 'activityId'>): RevisionRow => ({
  code: null,
  name: 'Activity',
  type: 'TASK',
  durationMinutes: 480,
  isCritical: false,
  totalFloatDays: 0,
  earlyStart: '2026-01-05',
  earlyFinish: '2026-01-06',
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: null,
  actualStart: null,
  actualFinish: null,
  ...over,
});

const edge = (over: Partial<RevisionEdge> & Pick<RevisionEdge, 'dependencyId'>): RevisionEdge => ({
  predecessorId: 'a',
  successorId: 'b',
  type: 'FS',
  lagMinutes: 0,
  lagCalendar: 'PREDECESSOR',
  ...over,
});

describe('correlateByCode', () => {
  it('D1a — matches EXACTLY, so `EXC-100` and `exc-100` stay two keys (the index is case-sensitive)', () => {
    // `uq_activities_plan_code` is a plain btree on `text`, so both may exist in ONE plan. Folding
    // would map two distinct activities onto one key and manufacture a duplicate the database
    // deliberately allows — inventing the collision §0.1 establishes cannot otherwise occur.
    const result = correlateByCode(
      [row({ activityId: 'f1', code: 'EXC-100' })],
      [row({ activityId: 't1', code: 'exc-100' })],
    );

    expect(result.counts.matched).toBe(0);
    expect(result.counts.fromUnmatched).toBe(1);
    expect(result.counts.toUnmatched).toBe(1);
  });

  it('D1b — an uncoded row is counted, and is neither an addition nor a removal', () => {
    // The product does not know which it is. Silence would be the ADR-0126 D4 defect: an absence a
    // reader cannot distinguish from a fact.
    const result = correlateByCode(
      [row({ activityId: 'f1', code: null }), row({ activityId: 'f2', code: 'A10' })],
      [row({ activityId: 't1', code: 'A10' })],
    );

    expect(result.counts.fromUncoded).toBe(1);
    expect(result.counts.matched).toBe(1);
    // The uncoded row is in NEITHER side's correlated output, so it cannot reach the delta and be
    // reported as removed.
    expect(result.from.map((r) => r.activityId)).toEqual(['A10']);
    expect(result.counts.fromUnmatched).toBe(0);
  });

  it('D1c — a duplicate within one side cannot arrive, because the database refuses it', () => {
    // Not a branch: `uq_activities_plan_code` is the guarantee (spec §0.1), and the obligation that
    // leaves is an API e2e case asserting the index still exists. This case documents the reliance so
    // that a reader removing the index finds out what depends on it — and pins what WOULD happen,
    // which is that the last row silently wins.
    const result = correlateByCode(
      [row({ activityId: 'f1', code: 'A10' }), row({ activityId: 'f2', code: 'A10' })],
      [row({ activityId: 't1', code: 'A10' })],
    );
    expect(result.counts.matched).toBe(2);
  });

  it('D1d — present on one side only is one-sided, and the pair keeps its own key', () => {
    const result = correlateByCode(
      [row({ activityId: 'f1', code: 'GONE' }), row({ activityId: 'f2', code: 'KEPT' })],
      [row({ activityId: 't1', code: 'KEPT' }), row({ activityId: 't2', code: 'NEW' })],
    );

    expect(result.counts).toMatchObject({ matched: 1, fromUnmatched: 1, toUnmatched: 1 });
    // The correlated pair is presented under ONE id, which is the whole of what makes the existing
    // delta work across two plans without modification.
    expect(result.from.find((r) => r.activityId === 'KEPT')).toBeDefined();
    expect(result.to.find((r) => r.activityId === 'KEPT')).toBeDefined();
  });

  it('D1e — every count the reader verifies the match with is reported, including the zeroes', () => {
    const result = correlateByCode(
      [row({ activityId: 'f1', code: 'A10' })],
      [row({ activityId: 't1', code: 'A10' })],
    );
    // Reported as an exhaustive block rather than as present-when-nonzero: a missing count is
    // indistinguishable from a zero one, and the panel renders this BEFORE anything derived from it.
    expect(result.counts).toEqual({
      matched: 1,
      fromUnmatched: 0,
      toUnmatched: 0,
      fromUncoded: 0,
      toUncoded: 0,
    });
  });
});

describe('correlateEdges', () => {
  it('keys on (predecessorCode, successorCode, type) as JSON, so a code containing the separator cannot forge a collision', () => {
    const rows = [row({ activityId: 'f1', code: 'A10' }), row({ activityId: 'f2', code: 'A20' })];
    const { edges, sourceIdByKey } = correlateEdges(
      [edge({ dependencyId: 'dep-uuid', predecessorId: 'f1', successorId: 'f2', type: 'FS' })],
      rows,
    );

    expect(edges).toHaveLength(1);
    // The plan-local id is retained under the key, because the canvas resolves an ADDED or CHANGED
    // link by looking it up among the edges the diagram already draws — handed a correlation key it
    // matches nothing and silently draws nothing.
    expect(sourceIdByKey.get(JSON.stringify(['A10', 'A20', 'FS']))).toBe('dep-uuid');
    expect(edges[0]).toMatchObject({
      dependencyId: JSON.stringify(['A10', 'A20', 'FS']),
      predecessorId: 'A10',
      successorId: 'A20',
    });
  });

  it('drops an edge whose endpoint has no code, rather than inventing a key for it', () => {
    // An uncoded endpoint cannot be compared against anything on the other side. Keying it anyway
    // would assert a relationship between two activities that may not be the same work.
    const rows = [row({ activityId: 'f1', code: 'A10' }), row({ activityId: 'f2', code: null })];
    const { edges, sourceIdByKey } = correlateEdges(
      [edge({ dependencyId: 'dep', predecessorId: 'f1', successorId: 'f2' })],
      rows,
    );
    expect(edges).toEqual([]);
    // And it contributes no key either — an edge that cannot be placed must not leave a handle
    // behind that a consumer could resolve to something.
    expect(sourceIdByKey.size).toBe(0);
  });
});
