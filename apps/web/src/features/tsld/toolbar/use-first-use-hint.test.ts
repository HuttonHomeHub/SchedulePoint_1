import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useFirstUseHint } from './use-first-use-hint';

const KEY = 'schedulepoint-hints';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useFirstUseHint', () => {
  it('starts unseen with no persisted state', () => {
    const { result } = renderHook(() => useFirstUseHint('go-to-date'));
    expect(result.current.unseen).toBe(true);
  });

  it('marks seen and persists across remounts', () => {
    const first = renderHook(() => useFirstUseHint('go-to-date'));
    act(() => first.result.current.markSeen());
    expect(first.result.current.unseen).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ 'go-to-date': true });

    const second = renderHook(() => useFirstUseHint('go-to-date'));
    expect(second.result.current.unseen).toBe(false);
  });

  it('keeps hints independent by key', () => {
    const a = renderHook(() => useFirstUseHint('go-to-date'));
    act(() => a.result.current.markSeen());

    const b = renderHook(() => useFirstUseHint('some-other-hint'));
    expect(b.result.current.unseen).toBe(true);
  });

  it('fails open on corrupt storage — the hint reads as unseen', () => {
    localStorage.setItem(KEY, '{ not json');
    const { result } = renderHook(() => useFirstUseHint('go-to-date'));
    expect(result.current.unseen).toBe(true);
  });
});
