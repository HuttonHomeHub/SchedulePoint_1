import type { DependencySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCoalescedLagNudge, type CoalescedLagNudgeDeps } from './use-coalesced-lag-nudge';
import { NUDGE_DEBOUNCE_MS } from './use-coalesced-nudge';

function dependency(over: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'p1',
    type: 'SS',
    lagDays: 2,
    lagMinutes: 960,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'a2', code: 'A20', name: 'Pour' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeDeps(over: Partial<CoalescedLagNudgeDeps> = {}): CoalescedLagNudgeDeps {
  return {
    onLag: vi.fn().mockResolvedValue({ applied: true, conflict: null }),
    dependencies: [dependency()],
    announce: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCoalescedLagNudge (ADR-0052 M3)', () => {
  it('coalesces a held-key burst into one net absolute write', async () => {
    const deps = makeDeps();
    const d = deps.dependencies[0]!;
    const { result } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => {
      result.current(d, 1);
      result.current(d, 1);
      result.current(d, 1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onLag).toHaveBeenCalledTimes(1);
    expect(deps.onLag).toHaveBeenCalledWith({ dependencyId: 'd1', lagDays: 5 });
  });

  it('nudges down into a lead (negative) and announces the net lagPhrase on commit', async () => {
    const deps = makeDeps();
    const d = deps.dependencies[0]!;
    const { result } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => {
      result.current(d, -1);
      result.current(d, -1);
      result.current(d, -1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onLag).toHaveBeenCalledWith({ dependencyId: 'd1', lagDays: -1 });
    expect(deps.announce).toHaveBeenCalledWith(
      'Set the link “Excavate” → “Pour” to SS - 1 working day; dates will update.',
    );
  });

  it('announces "(no lag)" when the net lag lands on zero', async () => {
    const deps = makeDeps();
    const d = deps.dependencies[0]!;
    const { result } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => {
      result.current(d, -1);
      result.current(d, -1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onLag).toHaveBeenCalledWith({ dependencyId: 'd1', lagDays: 0 });
    expect(deps.announce).toHaveBeenCalledWith(
      'Set the link “Excavate” → “Pour” to SS (no lag); dates will update.',
    );
  });

  it('skips the write when the target lands back on the persisted lag', async () => {
    const deps = makeDeps();
    const d = deps.dependencies[0]!;
    const { result } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => {
      result.current(d, 1);
      result.current(d, -1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onLag).not.toHaveBeenCalled();
  });

  it('announces a conflict outcome and re-seeds from props on the next nudge', async () => {
    const onLag = vi
      .fn()
      .mockResolvedValueOnce({ applied: false, conflict: 'stale' })
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ onLag });
    const d = deps.dependencies[0]!;
    const { result } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => result.current(d, 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.announce).toHaveBeenCalledWith('stale');
    // Truth won — the next nudge starts again from the persisted lag (2), not the lost 3.
    act(() => result.current(d, 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onLag).toHaveBeenLastCalledWith({ dependencyId: 'd1', lagDays: 3 });
  });

  it('flushes a queued nudge on unmount rather than dropping it', () => {
    const deps = makeDeps();
    const d = deps.dependencies[0]!;
    const { result, unmount } = renderHook(() => useCoalescedLagNudge(deps));
    act(() => result.current(d, 1)); // queued, debounce not yet elapsed
    expect(deps.onLag).not.toHaveBeenCalled();
    act(() => unmount());
    expect(deps.onLag).toHaveBeenCalledWith({ dependencyId: 'd1', lagDays: 3 });
  });

  describe('a committed edit is not replayed or extended once the props move on (#448)', () => {
    const rowAt = (lagDays: number): DependencySummary[] => [dependency({ lagDays })];

    async function committedThenUndone() {
      const deps = makeDeps({ dependencies: rowAt(1) });
      const hook = renderHook((d: CoalescedLagNudgeDeps) => useCoalescedLagNudge(d), {
        initialProps: deps,
      });
      act(() => hook.result.current(deps.dependencies[0]!, 1));
      await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
      expect(deps.onLag).toHaveBeenCalledTimes(1);
      expect(deps.onLag).toHaveBeenLastCalledWith({ dependencyId: 'd1', lagDays: 2 });
      // The refetch reflects the write, then Undo restores the old value.
      hook.rerender({ ...deps, dependencies: rowAt(2) });
      const undone = { ...deps, dependencies: rowAt(1) };
      hook.rerender(undone);
      return { deps, undone, hook };
    }

    it('does not re-send the committed write on unmount after an undo', async () => {
      const { deps, hook } = await committedThenUndone();
      act(() => hook.unmount());
      expect(deps.onLag).toHaveBeenCalledTimes(1);
    });

    it('starts the next nudge from the current row, not the surviving target', async () => {
      const { deps, undone, hook } = await committedThenUndone();
      act(() => hook.result.current(undone.dependencies[0]!, 1));
      await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
      expect(deps.onLag).toHaveBeenCalledTimes(2);
      expect(deps.onLag).toHaveBeenLastCalledWith({ dependencyId: 'd1', lagDays: 2 });
    });

    it('still flushes a pending (debounced) nudge on unmount after an earlier commit', async () => {
      const { deps, undone, hook } = await committedThenUndone();
      act(() => hook.result.current(undone.dependencies[0]!, 1));
      act(() => hook.unmount());
      expect(deps.onLag).toHaveBeenCalledTimes(2);
      expect(deps.onLag).toHaveBeenLastCalledWith({ dependencyId: 'd1', lagDays: 2 });
    });

    it('flushes a delta queued behind an in-flight write on unmount', async () => {
      let resolveFirst: () => void = () => {};
      const onLag = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise((r) => (resolveFirst = () => r({ applied: true, conflict: null }))),
        )
        .mockResolvedValue({ applied: true, conflict: null });
      const deps = makeDeps({ onLag, dependencies: rowAt(1) });
      const d = deps.dependencies[0]!;
      const { result, unmount } = renderHook(() => useCoalescedLagNudge(deps));
      act(() => result.current(d, 1));
      await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
      act(() => result.current(d, 1)); // queued behind the in-flight write
      await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
      act(() => unmount());
      await act(async () => {
        resolveFirst();
        await Promise.resolve();
      });
      expect(onLag).toHaveBeenNthCalledWith(2, { dependencyId: 'd1', lagDays: 3 });
    });
  });
});
