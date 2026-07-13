import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTO_RECALC_DEBOUNCE_MS, usePlanAutoRecalc } from './use-plan-auto-recalc';

/**
 * The auto-recalc coalescer (ADR-0032 M3) is the timing-sensitive core, so it's unit-tested in
 * isolation with the recalc command mocked and fake timers driving the debounce/single-flight.
 */

interface RunHandlers {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}
const recalcMock = vi.hoisted(() => ({
  isPending: false,
  run: vi.fn<(h?: RunHandlers) => void>(),
}));

vi.mock('./use-schedule', () => ({ useRecalculateCommand: () => recalcMock }));

beforeEach(() => {
  vi.useFakeTimers();
  recalcMock.run.mockReset();
  recalcMock.isPending = false;
});
afterEach(() => vi.useRealTimers());

describe('usePlanAutoRecalc', () => {
  it('coalesces a burst of notify() into a single recalc after the debounce', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
      result.current.notify();
      result.current.notify();
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('flush() fires immediately, cancelling the pending debounce', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
      result.current.flush();
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // The cancelled debounce doesn't fire a second recalc.
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled (no start date / no pen)', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: false }));
    act(() => {
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
  });

  it('single-flights: an edit during an in-flight recalc queues exactly one more run', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.flush(); // fire #1 (in flight, not resolved)
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // A second edit while #1 is in flight → queued, not a second concurrent run.
    act(() => {
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // #1 settles → the queued run fires exactly once.
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.());
    expect(recalcMock.run).toHaveBeenCalledTimes(2);
  });

  it('best-effort flushes a queued recalc on unmount', () => {
    const { result, unmount } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true }),
    );
    act(() => result.current.notify());
    expect(recalcMock.run).not.toHaveBeenCalled();
    unmount();
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });
});
