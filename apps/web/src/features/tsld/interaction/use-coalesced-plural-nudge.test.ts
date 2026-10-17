import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startFrozenPluralReason, summaryNotMovablePluralReason } from '../render/hit-test';

import { NUDGE_DEBOUNCE_MS } from './use-coalesced-nudge';
import {
  useCoalescedPluralNudge,
  type CoalescedPluralNudgeDeps,
} from './use-coalesced-plural-nudge';

import { anActivity } from '@/test/activity-fixture';

function activity(id: string, lane: number, over: Partial<ActivitySummary> = {}): ActivitySummary {
  return anActivity({
    id,
    name: id,
    code: null,
    laneIndex: lane,
    durationDays: 3,
    durationMinutes: 1440,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    visualEffectiveStart: '2026-01-01',
    visualEffectiveFinish: '2026-01-03',
    accrualType: 'UNIFORM',
    ...over,
  });
}

const ROWS = [activity('a', 1), activity('b', 2), activity('c', 3)];
const IDS = ROWS.map((r) => r.id);
type MoveMany = NonNullable<CoalescedPluralNudgeDeps['moveMany']>;

function makeDeps(over: Partial<CoalescedPluralNudgeDeps> = {}): CoalescedPluralNudgeDeps {
  return {
    moveMany: vi.fn<MoveMany>(() => Promise.resolve({ applied: true, conflict: null })),
    activities: ROWS,
    dataDate: '2026-01-01',
    setGhost: vi.fn(),
    setConflict: vi.fn(),
    announce: vi.fn(),
    isOtherWriteBusy: () => false,
    busyRef: { current: false },
    barDateSource: 'visual',
    ...over,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const settle = () => act(() => vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS));
const [A] = ROWS as [ActivitySummary];

describe('useCoalescedPluralNudge', () => {
  it('coalesces a burst into ONE moveMany carrying the summed delta, and announces it', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => {
      result.current(IDS, A, 'time', 1);
      result.current(IDS, A, 'time', 1);
      result.current(IDS, A, 'time', 1);
    });
    await settle();
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
    expect(deps.moveMany).toHaveBeenCalledWith(
      ROWS,
      { dayDelta: 3, laneDelta: 0 },
      { coalesce: true },
    );
    expect(deps.announce).toHaveBeenCalledWith(
      '3 activities moved 3 days later; dates will update.',
    );
    expect(deps.setGhost).toHaveBeenLastCalledWith(null);
  });

  it('ghosts the anchor only, tracking the burst', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => {
      result.current(IDS, A, 'time', 1);
      result.current(IDS, A, 'lane', 1);
    });
    expect(deps.setGhost).toHaveBeenLastCalledWith({ startDay: 1, endDay: 3, laneIndex: 2 });
  });

  it('writes nothing and says nothing when the burst nets to zero', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => {
      result.current(IDS, A, 'time', 1);
      result.current(IDS, A, 'time', -1);
    });
    await settle();
    expect(deps.moveMany).not.toHaveBeenCalled();
    expect(deps.announce).not.toHaveBeenCalled();
    expect(deps.setGhost).toHaveBeenLastCalledWith(null);
  });

  it('flushes the old set as its own write when the selection changes mid-burst', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => {
      result.current(['a', 'b'], A, 'time', 1);
      result.current(['a', 'c'], A, 'time', 1);
    });
    await settle();
    // The sets share row `a`, so the second write waits for the first to show in the props.
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(deps.moveMany).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(deps.moveMany!).mock.calls.map(([rows]) => rows.map((r) => r.id));
    expect(ids).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });

  it('refuses a sideways burst whole when any selected bar has started, and writes nothing', async () => {
    const rows = [activity('a', 1), activity('b', 2, { actualStart: '2026-01-01' })];
    const deps = makeDeps({ activities: rows });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(['a', 'b'], rows[0]!, 'time', 1));
    await settle();
    expect(deps.setConflict).toHaveBeenCalledWith(startFrozenPluralReason(1), false);
    expect(deps.moveMany).not.toHaveBeenCalled();
  });

  it('refuses the whole burst, on either axis, when a WBS summary is selected', async () => {
    const rows = [activity('a', 1), activity('b', 2, { type: 'WBS_SUMMARY' })];
    const deps = makeDeps({ activities: rows });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => {
      result.current(['a', 'b'], rows[0]!, 'time', 1);
      result.current(['a', 'b'], rows[0]!, 'lane', 1);
    });
    await settle();
    expect(deps.setConflict).toHaveBeenCalledWith(summaryNotMovablePluralReason(1), false);
    expect(deps.moveMany).not.toHaveBeenCalled();
  });

  it('lets a lane move through when a selected bar has started', async () => {
    const rows = [activity('a', 1), activity('b', 2, { actualStart: '2026-01-01' })];
    const deps = makeDeps({ activities: rows });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(['a', 'b'], rows[0]!, 'lane', 1));
    await settle();
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
  });

  it('refuses Alt+Up aloud when a selected bar is in the top lane, keeping the set shape', async () => {
    const rows = [activity('a', 0), activity('b', 0), activity('c', 3)];
    const deps = makeDeps({ activities: rows });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, rows[0]!, 'lane', -1));
    await settle();
    expect(deps.announce).toHaveBeenCalledWith(
      '2 of the selected activities are already in the top lane.',
    );
    expect(deps.moveMany).not.toHaveBeenCalled();
  });

  it('does not drop a burst typed behind an in-flight write (#25c analogue)', async () => {
    let resolveFirst: () => void = () => {};
    const moveMany = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => (resolveFirst = () => r({ applied: true, conflict: null }))),
      )
      .mockResolvedValue({ applied: true, conflict: null });
    const deps = makeDeps({ moveMany });
    const { result, rerender } = renderHook((d) => useCoalescedPluralNudge(d), {
      initialProps: deps,
    });
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(moveMany).toHaveBeenCalledTimes(1);
    act(() => result.current(IDS, A, 'time', 2));
    await settle();
    expect(moveMany).toHaveBeenCalledTimes(1); // queued, not dropped and not racing
    resolveFirst();
    // The props show the first write (versions advanced), so the second goes out at once.
    rerender({ ...deps, activities: ROWS.map((r) => ({ ...r, version: r.version + 1 })) });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(moveMany).toHaveBeenCalledTimes(2);
    expect(moveMany.mock.calls[1]?.[1]).toEqual({ dayDelta: 2, laneDelta: 0 });
  });

  it('waits for the props to show the previous write, then proceeds at the bound', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    // Versions never advance: the second commit is held…
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
    // …and goes anyway once the bound passes, where a stale version surfaces as the normal 409.
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(deps.moveMany).toHaveBeenCalledTimes(2);
  });

  it('announces nothing as moved when the write was not applied (a lost pen)', async () => {
    const deps = makeDeps({
      moveMany: vi.fn(() => Promise.resolve({ applied: false, conflict: null })),
    });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.announce).not.toHaveBeenCalled();
    expect(deps.setConflict).not.toHaveBeenCalledWith(expect.any(String));
    expect(deps.setGhost).toHaveBeenLastCalledWith(null);
  });

  it('shows a conflict from moveMany and does not announce a move', async () => {
    const deps = makeDeps({
      moveMany: vi.fn(() => Promise.resolve({ applied: false, conflict: 'stale' })),
    });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.setConflict).toHaveBeenCalledWith('stale');
    expect(deps.announce).not.toHaveBeenCalled();
  });

  it('shows the thrown message', async () => {
    const deps = makeDeps({ moveMany: vi.fn(() => Promise.reject(new Error('Boom'))) });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.setConflict).toHaveBeenCalledWith('Boom');
    expect(deps.setGhost).toHaveBeenLastCalledWith(null);
  });

  it('bails while another write is busy', async () => {
    const deps = makeDeps({ isOtherWriteBusy: () => true });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.moveMany).not.toHaveBeenCalled();
    expect(deps.setGhost).not.toHaveBeenCalled();
  });

  it('flushes an UNCOMMITTED burst on unmount', async () => {
    const deps = makeDeps();
    const { result, unmount } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
  });

  it('does not replay a COMMITTED burst on unmount (#448 analogue)', async () => {
    const deps = makeDeps();
    const { result, unmount } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(deps.moveMany).toHaveBeenCalledTimes(1);
  });

  it('holds busyRef while a burst is pending or writing, and releases it after', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    expect(deps.busyRef.current).toBe(true);
    await settle();
    expect(deps.busyRef.current).toBe(false);
  });

  it('is inert without a moveMany or a data date', async () => {
    const deps = makeDeps({ moveMany: undefined });
    const { result } = renderHook(() => useCoalescedPluralNudge(deps));
    act(() => result.current(IDS, A, 'time', 1));
    await settle();
    expect(deps.setGhost).not.toHaveBeenCalled();
  });
});
