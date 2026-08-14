import { describe, expect, it } from 'vitest';

import { type FilterAttr, matchesActivityFilter } from './lenses';
import { orderedMatches, type SearchableActivity, stepMatchIndex } from './search-matches';

const NO_ATTRS: ReadonlySet<FilterAttr> = new Set();

function row(over: Partial<SearchableActivity> & { id: string }): SearchableActivity {
  return {
    name: over.id,
    code: null,
    isCritical: false,
    constraintType: null,
    constraintViolated: false,
    visualConflict: false,
    levelingWindowExceeded: false,
    earlyStart: '2026-01-01',
    laneIndex: 0,
    ...over,
  };
}

describe('orderedMatches', () => {
  it('returns nothing when the filter is inactive', () => {
    // Deliberately not "everything": a search that asks nothing has nothing to cycle, which is what
    // keeps the n-of-m readout hidden until the planner has actually typed.
    expect(orderedMatches([row({ id: 'a' })], '', NO_ATTRS)).toEqual([]);
    expect(orderedMatches([row({ id: 'a' })], '   ', NO_ATTRS)).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(orderedMatches([row({ id: 'a', name: 'Piling' })], 'zzz', NO_ATTRS)).toEqual([]);
  });

  it('returns the single match with the fields a caller needs to select and announce it', () => {
    const hits = orderedMatches(
      [row({ id: 'a', name: 'Piling', code: 'A100', earlyStart: '2026-02-03' })],
      'pil',
      NO_ATTRS,
    );
    expect(hits).toEqual([{ id: 'a', name: 'Piling', code: 'A100', earlyStart: '2026-02-03' }]);
  });

  it('walks the plan in the shared reading order, not input order', () => {
    const hits = orderedMatches(
      [
        row({ id: 'c', name: 'Fix c', earlyStart: '2026-01-05', laneIndex: 0 }),
        row({ id: 'a', name: 'Fix a', earlyStart: '2026-01-01', laneIndex: 3 }),
        row({ id: 'b', name: 'Fix b', earlyStart: '2026-01-01', laneIndex: 1 }),
        row({ id: 'd', name: 'Fix d', earlyStart: null }),
      ],
      'fix',
      NO_ATTRS,
    );
    expect(hits.map((h) => h.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('does not mutate the caller’s array', () => {
    const activities = [
      row({ id: 'b', name: 'Fix b', earlyStart: '2026-02-01' }),
      row({ id: 'a', name: 'Fix a', earlyStart: '2026-01-01' }),
    ];
    orderedMatches(activities, 'fix', NO_ATTRS);
    expect(activities.map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('is exactly the complement of the dimmed set for the same query', () => {
    // The one assertion that would fail if a second matching predicate ever crept in here: the
    // canvas dims what does not match, and Enter must land only on what it left un-dimmed.
    const activities = [
      row({ id: 'a', name: 'Piling', isCritical: true }),
      row({ id: 'b', name: 'Excavate' }),
      row({ id: 'c', name: 'Pile cap', code: 'P-1' }),
      row({ id: 'd', name: 'Steel', visualConflict: true }),
    ];
    for (const [query, attrs] of [
      ['pil', NO_ATTRS],
      ['', new Set<FilterAttr>(['critical'])],
      ['p', new Set<FilterAttr>(['critical'])],
      ['steel', new Set<FilterAttr>(['conflict'])],
    ] as const) {
      const matched = new Set(orderedMatches(activities, query, attrs).map((h) => h.id));
      const dimmed = new Set(
        activities.filter((a) => !matchesActivityFilter(a, query, attrs)).map((a) => a.id),
      );
      expect([...matched].sort()).toEqual(
        activities
          .map((a) => a.id)
          .filter((id) => !dimmed.has(id))
          .sort(),
      );
    }
  });
});

describe('stepMatchIndex', () => {
  const hits = orderedMatches(
    [
      row({ id: 'a', name: 'Fix a', earlyStart: '2026-01-01' }),
      row({ id: 'b', name: 'Fix b', earlyStart: '2026-01-02' }),
      row({ id: 'c', name: 'Fix c', earlyStart: '2026-01-03' }),
    ],
    'fix',
    NO_ATTRS,
  );

  it('returns -1 for an empty list', () => {
    expect(stepMatchIndex(null, [], 1)).toBe(-1);
    expect(stepMatchIndex('a', [], -1)).toBe(-1);
  });

  it('starts at 0 when there is no cursor', () => {
    expect(stepMatchIndex(null, hits, 1)).toBe(0);
    expect(stepMatchIndex(null, hits, -1)).toBe(0);
  });

  it('resumes at 0 when the cursor is no longer in the list', () => {
    // The planner edited the query, or a recalculation moved the activity out of the match set. A
    // stale cursor is not a position, so the walk restarts rather than guessing a neighbour.
    expect(stepMatchIndex('gone', hits, 1)).toBe(0);
  });

  it('steps forwards and wraps', () => {
    expect(stepMatchIndex('a', hits, 1)).toBe(1);
    expect(stepMatchIndex('b', hits, 1)).toBe(2);
    expect(stepMatchIndex('c', hits, 1)).toBe(0);
  });

  it('steps backwards and wraps', () => {
    expect(stepMatchIndex('c', hits, -1)).toBe(1);
    expect(stepMatchIndex('b', hits, -1)).toBe(0);
    expect(stepMatchIndex('a', hits, -1)).toBe(2);
  });

  it('re-selects the only hit each press', () => {
    const one = orderedMatches([row({ id: 'a', name: 'Fix a' })], 'fix', NO_ATTRS);
    expect(stepMatchIndex('a', one, 1)).toBe(0);
    expect(stepMatchIndex('a', one, -1)).toBe(0);
  });
});
