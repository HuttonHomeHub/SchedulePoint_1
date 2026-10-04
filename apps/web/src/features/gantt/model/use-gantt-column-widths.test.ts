import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COLUMN_WIDTHS_STORAGE_KEY } from '../layout/column-widths';

import { useGanttColumnWidths } from './use-gantt-column-widths';

describe('useGanttColumnWidths', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads nothing and writes nothing on mount, so a default change still reaches the planner', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useGanttColumnWidths());
    expect(result.current.widths).toEqual({});
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)).toBeNull();
  });

  it('round-trips a width through storage into a fresh mount', () => {
    const first = renderHook(() => useGanttColumnWidths());
    act(() => {
      first.result.current.setWidth('code', 160);
    });
    expect(first.result.current.widths).toEqual({ code: 160 });
    expect(JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? 'null')).toEqual({
      v: 1,
      widths: { code: 160 },
    });

    const second = renderHook(() => useGanttColumnWidths());
    expect(second.result.current.widths).toEqual({ code: 160 });
  });

  it('clamps what it is given', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    act(() => {
      result.current.setWidth('code', 20);
    });
    expect(result.current.widths.code).toBe(48);
    act(() => {
      result.current.setWidth('code', 9000);
    });
    expect(result.current.widths.code).toBe(400);
  });

  it('builds a second change in one tick on the first rather than on a stale copy', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    act(() => {
      result.current.setWidth('code', 160);
      result.current.setWidth('duration', 120);
    });
    expect(result.current.widths).toEqual({ code: 160, duration: 120 });
  });

  it('applies the guard the panel published, and stops applying it when withdrawn', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    const withdraw = result.current.registerGuard((_key, candidate) => Math.min(candidate, 100));
    act(() => {
      result.current.setWidth('code', 300);
    });
    expect(result.current.widths.code).toBe(100);
    withdraw();
    act(() => {
      result.current.setWidth('code', 300);
    });
    expect(result.current.widths.code).toBe(300);
  });

  it('a drag stores exactly once: 30 transient moves write nothing, the commit writes one', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useGanttColumnWidths());
    for (let i = 1; i <= 30; i += 1) {
      act(() => {
        result.current.setTransient('code', 80 + i * 2);
      });
    }
    expect(result.current.widths.code).toBe(140);
    expect(setItem).not.toHaveBeenCalled();
    act(() => result.current.commit());
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? 'null')).toEqual({
      v: 1,
      widths: { code: 140 },
    });
  });

  it('a commit with nothing transient stores nothing (a double-click is a press and a release)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useGanttColumnWidths());
    act(() => result.current.commit());
    expect(setItem).not.toHaveBeenCalled();
  });

  it('a transient width is clamped and guarded like a typed one', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    result.current.registerGuard((_key, candidate) => Math.min(candidate, 200));
    act(() => {
      result.current.setTransient('code', 900);
    });
    expect(result.current.widths.code).toBe(200);
  });

  it('an older registration cleaning up does not withdraw a newer guard', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    const withdrawOld = result.current.registerGuard((_key, c) => Math.min(c, 100));
    result.current.registerGuard((_key, c) => Math.min(c, 150));
    withdrawOld();
    act(() => {
      result.current.setWidth('code', 300);
    });
    expect(result.current.widths.code).toBe(150);
  });

  it('reset REMOVES the stored key rather than writing the defaults', () => {
    const { result } = renderHook(() => useGanttColumnWidths());
    act(() => {
      result.current.setWidth('code', 160);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.widths).toEqual({});
    expect(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)).toBeNull();
  });

  it('survives corrupt storage', () => {
    localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useGanttColumnWidths());
    expect(result.current.widths).toEqual({});
  });

  it('keeps working for the session when storage throws on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useGanttColumnWidths());
    act(() => {
      result.current.setWidth('code', 160);
    });
    expect(result.current.widths.code).toBe(160);
    act(() => {
      result.current.reset();
    });
    expect(result.current.widths).toEqual({});
  });
});
