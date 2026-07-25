import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCoalescedDurationNudge,
  type CoalescedDurationNudgeDeps,
} from './use-coalesced-duration-nudge';
import { NUDGE_DEBOUNCE_MS } from './use-coalesced-nudge';

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
    laneIndex: 2,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-07',
    lateStart: null,
    lateFinish: null,
    totalFloat: 0,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeDeps(over: Partial<CoalescedDurationNudgeDeps> = {}): CoalescedDurationNudgeDeps {
  return {
    onResize: vi.fn().mockResolvedValue({ applied: true, conflict: null }),
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

describe('useCoalescedDurationNudge (ADR-0052 M2)', () => {
  it('coalesces a held-key burst into one net absolute write', async () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => {
      result.current(a, 1);
      result.current(a, 1);
      result.current(a, 1);
    });
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onResize).toHaveBeenCalledTimes(1);
    expect(deps.onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 6 });
  });

  it('nudges down one day and announces the net result on commit', async () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, -1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 2 });
    expect(deps.announce).toHaveBeenCalledWith('Resized “Excavate” to 2 days; dates will update.');
  });

  it('tracks the optimistic ghost at the bar’s fixed start + lane with the tentative finish', () => {
    const deps = makeDeps();
    const a = deps.activities[0]!; // startDay 4 (Jan 5 about Jan 1), lane 2, duration 3
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, 1));
    expect(deps.setGhost).toHaveBeenLastCalledWith({ startDay: 4, endDay: 7, laneIndex: 2 });
  });

  it('clamps at one day: the floor announces and issues no write', async () => {
    const deps = makeDeps({ activities: [activity({ durationDays: 1 })] });
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, -1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.announce).toHaveBeenCalledWith('Duration is already one day.');
    expect(deps.onResize).not.toHaveBeenCalled();
  });

  it('does not fire while a pointer edit is in flight (shared busy gate)', async () => {
    const deps = makeDeps({ isPointerBusy: () => true });
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.onResize).not.toHaveBeenCalled();
    expect(deps.setGhost).not.toHaveBeenCalled();
  });

  it('surfaces a conflict outcome and re-seeds from props on the next nudge', async () => {
    const onResize = vi
      .fn()
      .mockResolvedValueOnce({ applied: false, conflict: 'stale' })
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ onResize });
    const a = deps.activities[0]!;
    const { result } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(deps.setConflict).toHaveBeenCalledWith('stale');
    // Truth won — the next nudge starts again from the persisted duration (3), not the lost 4.
    act(() => result.current(a, 1));
    await act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
    expect(onResize).toHaveBeenLastCalledWith({ activityId: 'a1', durationDays: 4 });
  });

  it('flushes a queued nudge on unmount rather than dropping it', () => {
    const deps = makeDeps();
    const a = deps.activities[0]!;
    const { result, unmount } = renderHook(() => useCoalescedDurationNudge(deps));
    act(() => result.current(a, 1)); // queued, debounce not yet elapsed
    expect(deps.onResize).not.toHaveBeenCalled();
    act(() => unmount());
    expect(deps.onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 4 });
  });
});
