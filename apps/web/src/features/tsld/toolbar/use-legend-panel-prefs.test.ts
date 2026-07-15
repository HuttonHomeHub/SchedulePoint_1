import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useLegendPanelPrefs } from './use-legend-panel-prefs';

const KEY = 'schedulepoint-tsld-legend';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useLegendPanelPrefs', () => {
  it('defaults to closed with no saved position', () => {
    const { result } = renderHook(() => useLegendPanelPrefs());
    expect(result.current.open).toBe(false);
    expect(result.current.position).toBeNull();
  });

  it('toggles/closes open state and persists across remounts', () => {
    const first = renderHook(() => useLegendPanelPrefs());
    act(() => first.result.current.toggle());
    expect(first.result.current.open).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).open).toBe(true);

    // A fresh mount reads the persisted open state.
    const second = renderHook(() => useLegendPanelPrefs());
    expect(second.result.current.open).toBe(true);
    act(() => second.result.current.close());
    expect(second.result.current.open).toBe(false);
  });

  it('persists a drag position and reads it back', () => {
    const first = renderHook(() => useLegendPanelPrefs());
    act(() => first.result.current.setPosition({ x: 24, y: 40 }));
    expect(first.result.current.position).toEqual({ x: 24, y: 40 });

    const second = renderHook(() => useLegendPanelPrefs());
    expect(second.result.current.position).toEqual({ x: 24, y: 40 });
  });

  it('ignores corrupt stored state and falls back to defaults', () => {
    localStorage.setItem(KEY, '{ not json');
    const { result } = renderHook(() => useLegendPanelPrefs());
    expect(result.current.open).toBe(false);
    expect(result.current.position).toBeNull();
  });

  it('rejects a non-finite / malformed persisted position', () => {
    localStorage.setItem(KEY, JSON.stringify({ open: true, position: { x: 'nope', y: null } }));
    const { result } = renderHook(() => useLegendPanelPrefs());
    // Open is honoured, but the bad position is dropped to null (the default corner).
    expect(result.current.open).toBe(true);
    expect(result.current.position).toBeNull();
  });
});
