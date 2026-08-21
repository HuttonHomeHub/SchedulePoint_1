import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMinimapPanelPrefs } from './use-minimap-panel-prefs';

const KEY = 'schedulepoint-tsld-minimap';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useMinimapPanelPrefs', () => {
  it('defaults to closed (product Q1: default off)', () => {
    const { result } = renderHook(() => useMinimapPanelPrefs());
    expect(result.current.open).toBe(false);
  });

  it('toggles, persists across remounts, and closes', () => {
    const first = renderHook(() => useMinimapPanelPrefs());
    act(() => first.result.current.toggle());
    expect(first.result.current.open).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).open).toBe(true);

    const second = renderHook(() => useMinimapPanelPrefs());
    expect(second.result.current.open).toBe(true);
    act(() => second.result.current.close());
    expect(second.result.current.open).toBe(false);
  });

  it('ignores corrupt stored state and falls back to the default', () => {
    localStorage.setItem(KEY, '{ not json');
    const { result } = renderHook(() => useMinimapPanelPrefs());
    expect(result.current.open).toBe(false);
  });

  it('treats a non-boolean payload as closed rather than truthy', () => {
    localStorage.setItem(KEY, JSON.stringify({ open: 'yes' }));
    const { result } = renderHook(() => useMinimapPanelPrefs());
    expect(result.current.open).toBe(false);
  });
});
