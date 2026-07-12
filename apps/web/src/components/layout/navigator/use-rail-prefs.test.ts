import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RAIL_DEFAULT_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  clampRailWidth,
  useRailPrefs,
} from './use-rail-prefs';

const STORAGE_KEY = 'schedulepoint-nav-rail';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('clampRailWidth', () => {
  it('clamps to the allowed range and rounds', () => {
    expect(clampRailWidth(10)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(9999)).toBe(RAIL_MAX_WIDTH);
    expect(clampRailWidth(300.6)).toBe(301);
  });
});

describe('useRailPrefs', () => {
  it('defaults to expanded at the default width when nothing is stored', () => {
    const { result } = renderHook(() => useRailPrefs());
    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(RAIL_DEFAULT_WIDTH);
  });

  it('collapses, expands, and persists across remounts', () => {
    const first = renderHook(() => useRailPrefs());
    act(() => first.result.current.collapse());
    expect(first.result.current.collapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).collapsed).toBe(true);

    // A fresh mount reads the persisted preference.
    const second = renderHook(() => useRailPrefs());
    expect(second.result.current.collapsed).toBe(true);
    act(() => second.result.current.expand());
    expect(second.result.current.collapsed).toBe(false);
  });

  it('clamps width on set and persists it', () => {
    const { result } = renderHook(() => useRailPrefs());
    act(() => result.current.setWidth(9999));
    expect(result.current.width).toBe(RAIL_MAX_WIDTH);
    act(() => result.current.setWidth(0));
    expect(result.current.width).toBe(RAIL_MIN_WIDTH);
  });

  it('ignores corrupt stored state and falls back to defaults', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const { result } = renderHook(() => useRailPrefs());
    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(RAIL_DEFAULT_WIDTH);
  });

  it('clamps an out-of-range persisted width on read', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: false, width: 5000 }));
    const { result } = renderHook(() => useRailPrefs());
    expect(result.current.width).toBe(RAIL_MAX_WIDTH);
  });
});
