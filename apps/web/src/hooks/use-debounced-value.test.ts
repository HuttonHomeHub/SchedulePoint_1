import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_DEBOUNCE_MS, useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('crane'));
    expect(result.current).toBe('crane');
  });

  it('holds the previous value until the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    });

    rerender({ value: 'cra' });
    expect(result.current).toBe('');

    act(() => void vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS));
    expect(result.current).toBe('cra');
  });

  it('collapses a burst of changes into the last one', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    });

    for (const value of ['c', 'cr', 'cra', 'cran', 'crane']) {
      rerender({ value });
      act(() => void vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 50));
    }
    // Nothing has settled yet — every keystroke restarted the timer.
    expect(result.current).toBe('');

    act(() => void vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS));
    expect(result.current).toBe('crane');
  });

  it('honours a custom delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 1000), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => void vi.advanceTimersByTime(999));
    expect(result.current).toBe('a');

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe('b');
  });

  it('debounces a non-string value too', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: { q: '', archived: 'exclude' } },
    });

    const next = { q: 'crane', archived: 'include' };
    rerender({ value: next });
    act(() => void vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS));
    expect(result.current).toBe(next);
  });
});
