import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSearchNavigation } from './use-search-navigation';

import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import type { FilterAttr } from '@/features/tsld/render/lenses';
import type { SearchableActivity } from '@/features/tsld/render/search-matches';

/**
 * `VITE_CANVAS_SEARCH_NAV` is default-off, so these run under an explicit flag-on mock. The flag-off
 * behaviour is the epic's rollback contract and is asserted in its own parity suite, not here.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_SEARCH_NAV_ENABLED: true,
}));

const NO_ATTRS: ReadonlySet<FilterAttr> = new Set();

function activity(over: Partial<SearchableActivity> & { id: string }): SearchableActivity {
  return {
    name: over.id,
    code: null,
    isCritical: false,
    constraintType: null,
    visualConflict: false,
    earlyStart: '2026-01-01',
    laneIndex: 0,
    ...over,
  };
}

const PLAN: SearchableActivity[] = [
  activity({ id: 'a', name: 'Pile A', earlyStart: '2026-01-05', laneIndex: 0 }),
  activity({ id: 'b', name: 'Pile B', earlyStart: '2026-01-03', laneIndex: 1 }),
  activity({ id: 'c', name: 'Excavate', earlyStart: '2026-01-01', laneIndex: 2 }),
  activity({ id: 'd', name: 'Pile cap', earlyStart: null, laneIndex: 3 }),
];

function setup(
  over: { query?: string; attrs?: ReadonlySet<FilterAttr>; cursor?: string | null } = {},
) {
  const centerOnDate = vi.fn();
  const setSearchCursorId = vi.fn();
  const requestSelectActivity = vi.fn();
  const announce = vi.fn();
  const canvasControlRef = {
    current: { centerOnDate },
  } as unknown as React.RefObject<TsldCanvasHandle | null>;

  const view = renderHook(
    (props: { cursor: string | null }) =>
      useSearchNavigation({
        activities: PLAN,
        filterQuery: over.query ?? 'pile',
        filterAttrs: over.attrs ?? NO_ATTRS,
        searchCursorId: props.cursor,
        setSearchCursorId,
        canvasControlRef,
        requestSelectActivity,
        announce,
      }),
    { initialProps: { cursor: over.cursor ?? null } },
  );
  return { view, centerOnDate, setSearchCursorId, requestSelectActivity, announce };
}

describe('useSearchNavigation', () => {
  it('orders the matches by the shared plan walk, not input order', () => {
    const { view } = setup();
    expect(view.result.current.matchHits.map((h) => h.id)).toEqual(['b', 'a', 'd']);
  });

  it('reports the total before the first jump, and the position after', () => {
    const { view } = setup();
    expect(view.result.current.searchStatus).toEqual({ total: 3, index: null });
    view.rerender({ cursor: 'a' });
    expect(view.result.current.searchStatus).toEqual({ total: 3, index: 2 });
  });

  it('reports nothing at all when the search is inactive', () => {
    const { view } = setup({ query: '' });
    expect(view.result.current.matchHits).toEqual([]);
    expect(view.result.current.searchStatus).toBeNull();
  });

  it('centres, selects and announces the first match', () => {
    const { view, centerOnDate, setSearchCursorId, requestSelectActivity, announce } = setup();
    act(() => view.result.current.goToMatch('next'));
    expect(setSearchCursorId).toHaveBeenCalledWith('b');
    expect(centerOnDate).toHaveBeenCalledWith('2026-01-03');
    expect(announce).toHaveBeenCalledWith('Match 1 of 3: Pile B.');
    expect(requestSelectActivity).toHaveBeenCalledWith('b', { focusListbox: false });
  });

  it('never moves focus into the listbox — the planner is still typing', () => {
    const { view, requestSelectActivity } = setup();
    act(() => view.result.current.goToMatch('next'));
    // The one assertion that separates this cycle from Next-conflict. If it ever flips to true, the
    // second Enter goes to the listbox instead of the field and the search ends after one match.
    expect(requestSelectActivity.mock.calls[0]?.[1]).toEqual({ focusListbox: false });
  });

  it('wraps forwards past the last match', () => {
    const { view, setSearchCursorId } = setup({ cursor: 'd' });
    act(() => view.result.current.goToMatch('next'));
    expect(setSearchCursorId).toHaveBeenCalledWith('b');
  });

  it('wraps backwards past the first match', () => {
    const { view, setSearchCursorId, announce } = setup({ cursor: 'b' });
    act(() => view.result.current.goToMatch('previous'));
    expect(setSearchCursorId).toHaveBeenCalledWith('d');
    expect(announce).toHaveBeenCalledWith('Match 3 of 3: Pile cap.');
  });

  it('selects and announces an unscheduled match without panning', () => {
    // `d` has no `earlyStart`. Centring on nothing would be a jump to an arbitrary day; not centring
    // is the honest behaviour, and the planner still gets the selection and the announcement.
    const { view, centerOnDate, requestSelectActivity } = setup({ cursor: 'a' });
    act(() => view.result.current.goToMatch('next'));
    expect(centerOnDate).not.toHaveBeenCalled();
    expect(requestSelectActivity).toHaveBeenCalledWith('d', { focusListbox: false });
  });

  it('moves nothing when the search matches nothing', () => {
    const { view, centerOnDate, setSearchCursorId, requestSelectActivity, announce } = setup({
      query: 'zzz',
    });
    act(() => view.result.current.goToMatch('next'));
    expect(centerOnDate).not.toHaveBeenCalled();
    expect(setSearchCursorId).not.toHaveBeenCalled();
    expect(requestSelectActivity).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('is silent when the search is inactive', () => {
    const { view, announce } = setup({ query: '   ' });
    act(() => view.result.current.goToMatch('next'));
    expect(announce).not.toHaveBeenCalled();
  });

  it('restarts at the first match when the cursor is no longer in the set', () => {
    const { view, setSearchCursorId } = setup({ cursor: 'gone' });
    act(() => view.result.current.goToMatch('next'));
    expect(setSearchCursorId).toHaveBeenCalledWith('b');
  });

  it('narrows to the intersection when an attribute filter is also on', () => {
    // The match set is the text query AND the attributes — the same rule the canvas dims by, because
    // it is literally the same predicate.
    const { view } = setup({ query: 'pile', attrs: new Set<FilterAttr>(['critical']) });
    expect(view.result.current.matchHits).toEqual([]);
  });
});
