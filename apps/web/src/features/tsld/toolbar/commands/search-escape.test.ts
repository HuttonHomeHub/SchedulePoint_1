import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearchNavigation } from './use-search-navigation';

import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import type { FilterAttr } from '@/features/tsld/render/lenses';
import type { SearchableActivity } from '@/features/tsld/render/search-matches';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
  CANVAS_SEARCH_NAV_ENABLED: true,
}));

/**
 * The **two-step Escape inside the search field** (`docs/specs/canvas-search-navigation/` §4.5,
 * M1-T4).
 *
 * This half exists because of the other half. The canvas's `window` Escape listener now ignores keys
 * typed into a text control, so an Escape in this field can no longer disarm a tool — which would be
 * a **dead end** for a keyboard planner if the field had nothing to hand them back to. Step 2 is
 * that hand-back, and it is why the guard is safe rather than merely quiet.
 *
 * Both steps were verified to fail against the pre-fix code: `escapeSearchField` did not exist, so
 * every assertion here failed at the type level and then at the call.
 */
const NO_ATTRS: ReadonlySet<FilterAttr> = new Set();

function activity(over: Partial<SearchableActivity> & { id: string }): SearchableActivity {
  return {
    name: '',
    code: null,
    isCritical: false,
    constraintType: null,
    constraintViolated: false,
    visualConflict: false,
    levelingWindowExceeded: false,
    earlyStart: null,
    laneIndex: 0,
    ...over,
  };
}

const PLAN: SearchableActivity[] = [
  activity({ id: 'a', name: 'Pile A', earlyStart: '2026-01-05', laneIndex: 0 }),
  activity({ id: 'b', name: 'Pile B', earlyStart: '2026-01-03', laneIndex: 1, isCritical: true }),
];

function setup(
  over: { query?: string; cursor?: string | null; attrs?: ReadonlySet<FilterAttr> } = {},
) {
  const setSearchCursorId = vi.fn();
  const setFilterQuery = vi.fn();
  const requestSelectActivity = vi.fn();
  const requestFocusDiagram = vi.fn();
  const announce = vi.fn();
  const canvasControlRef = {
    current: { centerOnDate: vi.fn() },
  } as unknown as React.RefObject<TsldCanvasHandle | null>;

  const view = renderHook(() =>
    useSearchNavigation({
      activities: PLAN,
      filterQuery: over.query ?? 'pile',
      filterAttrs: over.attrs ?? NO_ATTRS,
      searchCursorId: over.cursor ?? null,
      setSearchCursorId,
      setFilterQuery,
      canvasControlRef,
      requestSelectActivity,
      requestFocusDiagram,
      announce,
    }),
  );
  return { view, setFilterQuery, requestSelectActivity, requestFocusDiagram, announce };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the first Escape clears the query', () => {
  it('empties the field', () => {
    const { view, setFilterQuery } = setup({ query: 'pile' });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(setFilterQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('leaves the announcement to the panel, which owns the clear transition', () => {
    // "Search cleared." is announced by `TsldPanel`'s filter effect, not here. Announcing from this
    // callback looked right and was overwritten a tick later by that effect's own message — the
    // journey caught it, and this assertion pins the resolution so it cannot come back.
    const { view, announce } = setup({ query: 'pile' });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(announce).not.toHaveBeenCalled();
  });

  it('does not leave the field while there is still something to clear', () => {
    const { view, requestSelectActivity, requestFocusDiagram } = setup({ query: 'pile' });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(requestSelectActivity).not.toHaveBeenCalled();
    expect(requestFocusDiagram).not.toHaveBeenCalled();
  });
});

describe('the second Escape hands the planner to the diagram', () => {
  it('selects and focuses the current match when the cursor is still live', () => {
    // Reachable because an ATTRIBUTE filter keeps the search active with an empty text query — so a
    // planner filtering by "critical" can walk matches, empty the text field, and still have a match
    // under the cursor to be handed back to.
    const { view, requestSelectActivity, requestFocusDiagram } = setup({
      query: '',
      attrs: new Set<FilterAttr>(['critical']),
      cursor: 'b',
    });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(requestSelectActivity).toHaveBeenCalledExactlyOnceWith('b', { focusListbox: true });
    expect(requestFocusDiagram).not.toHaveBeenCalled();
  });

  it('does not re-select a stale cursor', () => {
    // The cursor names an activity the current match set no longer holds. Selecting it would move
    // the planner somewhere the search is not, which is worse than not moving the selection at all.
    const { view, requestSelectActivity, requestFocusDiagram } = setup({ query: '', cursor: 'b' });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(requestSelectActivity).not.toHaveBeenCalled();
    expect(requestFocusDiagram).toHaveBeenCalledOnce();
  });

  it('falls back to focus-only when nothing is under the cursor', () => {
    const { view, requestSelectActivity, requestFocusDiagram } = setup({ query: '', cursor: null });
    act(() => {
      view.result.current.escapeSearchField();
    });
    // Nothing to select, and the planner still has to be able to leave: without this the guard on
    // the canvas listener would be a dead end for anyone driving from the keyboard.
    expect(requestSelectActivity).not.toHaveBeenCalled();
    expect(requestFocusDiagram).toHaveBeenCalledOnce();
  });

  it('announces nothing — moving focus is its own feedback', () => {
    const { view, announce } = setup({ query: '', cursor: null });
    act(() => {
      view.result.current.escapeSearchField();
    });
    expect(announce).not.toHaveBeenCalled();
  });
});
