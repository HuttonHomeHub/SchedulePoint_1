import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NUDGE_DEBOUNCE_MS,
  useCoalescedNudge,
  type CoalescedNudgeDeps,
} from './use-coalesced-nudge';

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeDeps(over: Partial<CoalescedNudgeDeps> = {}): CoalescedNudgeDeps {
  return {
    onReposition: vi.fn().mockResolvedValue({ applied: true, conflict: null }),
    activities: [activity()],
    dataDate: '2026-01-01',
    setGhost: vi.fn(),
    setConflict: vi.fn(),
    announce: vi.fn(),
    isPointerBusy: () => false,
    ...over,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCoalescedNudge', () => {
  it('coalesces a burst into a single net write', async () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedNudge(deps));
    act(() => {
      result.current(a, 'lane', 1);
      result.current(a, 'lane', 1);
      result.current(a, 'lane', 1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onReposition).toHaveBeenCalledTimes(1);
    expect(deps.onReposition).toHaveBeenCalledWith({ activityId: 'a1', laneIndex: 3 });
  });

  it('does NOT clobber across burst boundaries — a re-nudge before the first write settles keeps the net delta', async () => {
    let resolveFirst: () => void = () => {};
    const onReposition = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => (resolveFirst = () => r({ applied: true, conflict: null }))),
      )
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ onReposition });
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedNudge(deps));

    // Burst 1: +2 lanes → commit fires (write in flight, not yet resolved).
    act(() => {
      result.current(a, 'lane', 1);
      result.current(a, 'lane', 1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onReposition).toHaveBeenNthCalledWith(1, { activityId: 'a1', laneIndex: 2 });

    // Burst 2 while the first write is STILL in flight (props not refetched). The target continues
    // from 2 (not re-seeded from the stale lane-0 prop), and the commit serializes behind burst 1.
    act(() => result.current(a, 'lane', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onReposition).toHaveBeenCalledTimes(1); // still serialized behind the in-flight write

    // Resolve burst 1, then let the serialize retry fire burst 2.
    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(100));
    // The net absolute target (lane 3) is written — NOT a value re-derived from the stale prop.
    expect(onReposition).toHaveBeenNthCalledWith(2, { activityId: 'a1', laneIndex: 3 });
  });

  it('nudges the start day on the time axis', async () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedNudge(deps));
    act(() => result.current(a, 'time', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onReposition).toHaveBeenCalledWith({ activityId: 'a1', startDay: 1 });
  });

  it('announces the top-lane boundary and issues no write', async () => {
    const deps = makeDeps();
    const a = deps.activities[0]!; // lane 0
    const { result } = renderHook(() => useCoalescedNudge(deps));
    act(() => result.current(a, 'lane', -1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.announce).toHaveBeenCalledWith('Already in the top lane.');
    expect(deps.onReposition).not.toHaveBeenCalled();
  });

  it('does not fire while a pointer reposition is in flight', async () => {
    const deps = makeDeps({ isPointerBusy: () => true });
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedNudge(deps));
    act(() => result.current(a, 'lane', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onReposition).not.toHaveBeenCalled();
    expect(deps.setGhost).not.toHaveBeenCalled();
  });

  it('flushes a queued nudge on unmount rather than dropping it', () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result, unmount } = renderHook(() => useCoalescedNudge(deps));
    act(() => result.current(a, 'lane', 1)); // queued, debounce not yet elapsed
    expect(deps.onReposition).not.toHaveBeenCalled();
    act(() => unmount());
    expect(deps.onReposition).toHaveBeenCalledWith({ activityId: 'a1', laneIndex: 1 });
  });

  it('flushes a delta queued behind an in-flight write on unmount (#25c)', async () => {
    let resolveFirst: () => void = () => {};
    const onReposition = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => (resolveFirst = () => r({ applied: true, conflict: null }))),
      )
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ onReposition });
    const a = deps.activities[0]!;
    const { result, unmount } = renderHook(() => useCoalescedNudge(deps));

    // Burst 1: +1 lane → commit fires; the write is in flight (unresolved).
    act(() => result.current(a, 'lane', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onReposition).toHaveBeenNthCalledWith(1, { activityId: 'a1', laneIndex: 1 });

    // Burst 2 while burst 1 is STILL in flight: the target advances to lane 2, commit serializes.
    act(() => result.current(a, 'lane', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onReposition).toHaveBeenCalledTimes(1); // queued behind the in-flight write

    // Unmount now — a write is in flight AND lane 2 is queued. The old `!busyRef` guard dropped it.
    act(() => unmount());
    expect(onReposition).toHaveBeenCalledTimes(1); // nothing sent yet — awaiting the in-flight write

    // Resolve the in-flight write → the queued absolute target (lane 2) is flushed on unmount.
    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });
    expect(onReposition).toHaveBeenNthCalledWith(2, { activityId: 'a1', laneIndex: 2 });
  });

  it('flushes the queued delta on unmount even if the in-flight write REJECTS (#25c)', async () => {
    let rejectFirst: () => void = () => {};
    const onReposition = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => (rejectFirst = () => reject(new Error('boom')))),
      )
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ onReposition });
    const a = deps.activities[0]!;
    const { result, unmount } = renderHook(() => useCoalescedNudge(deps));

    act(() => result.current(a, 'lane', 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    act(() => result.current(a, 'lane', 1)); // burst 2 queued behind the in-flight write
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    act(() => unmount());

    // The in-flight write fails — the cleanup still flushes the queued target
    // (`inFlight.then(flushFinal, flushFinal)` handles both settle outcomes).
    await act(async () => {
      rejectFirst();
      await Promise.resolve();
    });
    expect(onReposition).toHaveBeenNthCalledWith(2, { activityId: 'a1', laneIndex: 2 });
  });
});
