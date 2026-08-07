import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSearchNavigation } from './use-search-navigation';

import type { FilterAttr } from '@/features/tsld/render/lenses';
import { orderedMatches, type SearchableActivity } from '@/features/tsld/render/search-matches';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_SEARCH_NAV_ENABLED: true,
}));

/**
 * The M4 view-parity gate.
 *
 * Both the canvas and the Gantt narrow to "what the search matched". The whole point of lifting the
 * derivation is that there is **one** of it — so the failure this pins is not a wrong set, it is
 * **two** sets: a second derivation added later that agrees on ordinary queries and differs on the
 * edges. The only way to notice that in the product would be to switch views mid-search and spot
 * that one bar changed sides, which is the ADR-0062 `gating.logic === gating.general` shape.
 */
const NO_ATTRS: ReadonlySet<FilterAttr> = new Set();

const PLAN: SearchableActivity[] = [
  {
    id: 'a',
    name: 'Pile A',
    code: null,
    isCritical: true,
    constraintType: null,
    visualConflict: false,
    earlyStart: '2026-01-05',
    laneIndex: 0,
  },
  {
    id: 'b',
    name: 'Pile B',
    code: null,
    isCritical: false,
    constraintType: null,
    visualConflict: false,
    earlyStart: '2026-01-03',
    laneIndex: 1,
  },
  {
    id: 'c',
    name: 'Excavate',
    code: null,
    isCritical: false,
    constraintType: null,
    visualConflict: false,
    earlyStart: '2026-01-01',
    laneIndex: 2,
  },
];

function run(query: string, attrs: ReadonlySet<FilterAttr> = NO_ATTRS) {
  return renderHook(() =>
    useSearchNavigation({
      activities: PLAN,
      filterQuery: query,
      filterAttrs: attrs,
      searchCursorId: null,
      setSearchCursorId: vi.fn(),
      setFilterQuery: vi.fn(),
      canvasControlRef: { current: null },
      requestSelectActivity: vi.fn(),
      requestFocusDiagram: vi.fn(),
      announce: vi.fn(),
    }),
  );
}

describe('one match set, two views', () => {
  it('the set both views receive is exactly what Enter walks', () => {
    const { result } = run('pile');
    expect([...result.current.matchedIds].sort()).toEqual(
      result.current.matchHits.map((h) => h.id).sort(),
    );
  });

  it('and exactly what the pure model returns for the same query', () => {
    for (const [q, attrs] of [
      ['pile', NO_ATTRS],
      ['', new Set<FilterAttr>(['critical'])],
      ['exc', NO_ATTRS],
      ['zzz', NO_ATTRS],
    ] as const) {
      const { result } = run(q, attrs);
      expect([...result.current.matchedIds].sort()).toEqual(
        orderedMatches(PLAN, q, attrs)
          .map((h) => h.id)
          .sort(),
      );
    }
  });

  it('is empty when the search is inactive, so neither view narrows anything', () => {
    expect(run('').result.current.matchedIds.size).toBe(0);
  });
});
