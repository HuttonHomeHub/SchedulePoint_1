import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useExpansionState } from './use-expansion-state';

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('useExpansionState', () => {
  it('starts empty and toggles ids in and out', () => {
    const { result } = renderHook(() => useExpansionState('acme'));
    expect(result.current.isExpanded('c1')).toBe(false);
    act(() => result.current.toggle('c1'));
    expect(result.current.isExpanded('c1')).toBe(true);
    act(() => result.current.toggle('c1'));
    expect(result.current.isExpanded('c1')).toBe(false);
  });

  it('expand/collapse are idempotent', () => {
    const { result } = renderHook(() => useExpansionState('acme'));
    act(() => result.current.expand('c1'));
    act(() => result.current.expand('c1'));
    expect([...result.current.expanded]).toEqual(['c1']);
    act(() => result.current.collapse('c1'));
    act(() => result.current.collapse('c1'));
    expect([...result.current.expanded]).toEqual([]);
  });

  it('expandPath opens every id in a deep-link ancestor chain', () => {
    const { result } = renderHook(() => useExpansionState('acme'));
    act(() => result.current.expandPath(['c1', 'p1']));
    expect(result.current.isExpanded('c1')).toBe(true);
    expect(result.current.isExpanded('p1')).toBe(true);
  });

  it('persists per-org in sessionStorage and reloads it on remount', () => {
    const first = renderHook(() => useExpansionState('acme'));
    act(() => first.result.current.expand('c1'));
    const second = renderHook(() => useExpansionState('acme'));
    expect(second.result.current.isExpanded('c1')).toBe(true);
    // A different org has its own (empty) expansion.
    const other = renderHook(() => useExpansionState('other'));
    expect(other.result.current.isExpanded('c1')).toBe(false);
  });

  it('ignores corrupt stored state', () => {
    sessionStorage.setItem('schedulepoint-nav-expanded:acme', '{bad json');
    const { result } = renderHook(() => useExpansionState('acme'));
    expect([...result.current.expanded]).toEqual([]);
  });
});
