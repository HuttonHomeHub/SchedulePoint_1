import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clampSize, useResizablePanelPrefs } from './use-resizable-panel-prefs';

const OPTS = { storageKey: 'test-panel', min: 100, max: 400, defaultSize: 200 };

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('clampSize', () => {
  it('clamps to the range and rounds', () => {
    expect(clampSize(10, 100, 400)).toBe(100);
    expect(clampSize(9999, 100, 400)).toBe(400);
    expect(clampSize(250.6, 100, 400)).toBe(251);
  });
});

describe('useResizablePanelPrefs', () => {
  it('defaults to expanded at the default size when nothing is stored', () => {
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.collapsed).toBe(false);
    expect(result.current.size).toBe(200);
  });

  it('collapses, expands, and persists across remounts', () => {
    const first = renderHook(() => useResizablePanelPrefs(OPTS));
    act(() => first.result.current.collapse());
    expect(first.result.current.collapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem('test-panel')!).collapsed).toBe(true);

    const second = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(second.result.current.collapsed).toBe(true);
    act(() => second.result.current.expand());
    expect(second.result.current.collapsed).toBe(false);
  });

  it('clamps size on set and persists it', () => {
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    act(() => result.current.setSize(9999));
    expect(result.current.size).toBe(400);
    act(() => result.current.setSize(0));
    expect(result.current.size).toBe(100);
  });

  it('ignores corrupt stored state and falls back to defaults', () => {
    localStorage.setItem('test-panel', '{ not json');
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.collapsed).toBe(false);
    expect(result.current.size).toBe(200);
  });

  it('clamps an out-of-range persisted size on read', () => {
    localStorage.setItem('test-panel', JSON.stringify({ collapsed: false, size: 5000 }));
    const { result } = renderHook(() => useResizablePanelPrefs(OPTS));
    expect(result.current.size).toBe(400);
  });
});
