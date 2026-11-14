import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NARROW_DEFAULT_HIDDEN } from './gantt-view-state';
import { useGanttViewState } from './use-gantt-view-state';

/**
 * The real `useUrlFilterState` over a stand-in router: `navigate` applies the hook's own `search`
 * updater to an in-memory address, which is the one step that deletes a param equal to its default
 * and so the one a parser-only test cannot reach (the `ghide=none` defect `view-state.spec.ts`
 * found had exactly that shape).
 */
let address: Record<string, string> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => address,
  useNavigate:
    () =>
    (options: { search: (prev: Record<string, string | undefined>) => Record<string, string> }) => {
      address = options.search(address);
      return Promise.resolve();
    },
}));

beforeEach(() => {
  address = {};
});

describe('useGanttViewState and the column choice in the address', () => {
  it('reads an absent ghide as unstated, and keeps it absent when another param changes', () => {
    const { result, rerender } = renderHook(() => useGanttViewState());
    expect(result.current.hiddenStated).toBe(false);

    act(() => result.current.onSortChange({ key: 'name', direction: 'desc' }));
    rerender();
    expect(address.gsort).toBe('name:desc');
    expect(address).not.toHaveProperty('ghide');
    expect(result.current.hiddenStated).toBe(false);

    act(() => result.current.onCollapsedChange(new Set(['a'])));
    rerender();
    expect(address).not.toHaveProperty('ghide');
  });

  it('keeps ghide=predecessors in the address when a narrow default is ticked back to the standard set', () => {
    // The trap: on a narrow Gantt, ticking Code and Finish on leaves exactly the standard hidden
    // set. Written as the old default, it was deleted from the address, read as "say nothing" and
    // hid both columns again.
    const { result, rerender } = renderHook(() => useGanttViewState());
    act(() => result.current.onHiddenColumnsChange(new Set(['predecessors'])));
    rerender();
    expect(address.ghide).toBe('predecessors');
    expect(result.current.hiddenStated).toBe(true);
    expect([...result.current.hiddenColumns]).toEqual(['predecessors']);
  });

  it('writes the narrow default set when a choice is made from it', () => {
    const { result, rerender } = renderHook(() => useGanttViewState());
    act(() => result.current.onHiddenColumnsChange(new Set(NARROW_DEFAULT_HIDDEN)));
    rerender();
    expect(address.ghide).toBe('code,earlyFinish,predecessors');
  });

  it('carries "show all" as a stated choice', () => {
    const { result, rerender } = renderHook(() => useGanttViewState());
    act(() => result.current.onHiddenColumnsChange(new Set()));
    rerender();
    expect(address.ghide).toBe('none');
    expect(result.current.hiddenStated).toBe(true);
    expect(result.current.hiddenColumns.size).toBe(0);
  });

  it('reads a hand-typed ghide=auto as saying nothing', () => {
    address = { ghide: 'auto' };
    const { result } = renderHook(() => useGanttViewState());
    expect(result.current.hiddenStated).toBe(false);
  });
});
