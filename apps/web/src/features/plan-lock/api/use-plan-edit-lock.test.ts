import type { PlanEditLockStatus } from '@repo/types';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  planEditLockQueryOptions,
  planLockKeys,
  useAcquireLock,
  useHandoff,
  useLockHeartbeat,
  usePlanPen,
  useReleaseLock,
  useRequestControl,
} from './use-plan-edit-lock';

import {
  UnsavedWorkProvider,
  useRegisterUnsavedWork,
} from '@/components/layout/unsaved-work/unsaved-work-provider';
import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

const FREE: PlanEditLockStatus = {
  planId: 'p1',
  state: 'FREE',
  holder: null,
  expiresAt: null,
  heartbeatAt: null,
  requestedBy: null,
  graceEndsAt: null,
  canAcquire: true,
  canRequest: false,
  canTakeOver: false,
  canOverride: false,
};

const HELD_BY_ME: PlanEditLockStatus = {
  planId: 'p1',
  state: 'HELD_BY_ME',
  holder: { id: 'u1', name: 'Me', email: 'me@x.com' },
  expiresAt: null,
  heartbeatAt: null,
  requestedBy: null,
  graceEndsAt: null,
  canAcquire: false,
  canRequest: false,
  canTakeOver: false,
  canOverride: false,
};

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('useAcquireLock / useReleaseLock', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it('POSTs the acquire with { takeover: false } by default', async () => {
    vi.mocked(apiFetch).mockResolvedValue(HELD_BY_ME);
    const { result } = renderHook(() => useAcquireLock('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync(undefined);
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/edit-lock');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ takeover: false });
  });

  it('POSTs a take-over with { takeover: true }', async () => {
    vi.mocked(apiFetch).mockResolvedValue(HELD_BY_ME);
    const { result } = renderHook(() => useAcquireLock('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync({ takeover: true });
    expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string)).toEqual({
      takeover: true,
    });
  });

  it('releases with DELETE', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { result } = renderHook(() => useReleaseLock('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync();
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/edit-lock');
    expect(init?.method).toBe('DELETE');
  });
});

describe('useLockHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockReset().mockResolvedValue(HELD_BY_ME);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fires the heartbeat every 30s while holding, and stops on unmount', async () => {
    const onLost = vi.fn();
    const { unmount } = renderHook(
      () => useLockHeartbeat('acme', 'p1', { holding: true, onLost }),
      { wrapper: wrapper() },
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      '/organizations/acme/plans/p1/edit-lock/heartbeat',
      expect.objectContaining({ method: 'POST' }),
    );
    const afterFirst = vi.mocked(apiFetch).mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    // No further heartbeats after the interval is cleared on unmount.
    expect(vi.mocked(apiFetch).mock.calls.length).toBe(afterFirst);
  });

  it('does NOT heartbeat when not holding', async () => {
    renderHook(() => useLockHeartbeat('acme', 'p1', { holding: false, onLost: vi.fn() }), {
      wrapper: wrapper(),
    });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it('stops the heartbeat when holding flips false via re-render (the Stop-editing path)', async () => {
    const { rerender } = renderHook(
      ({ h }: { h: boolean }) => useLockHeartbeat('acme', 'p1', { holding: h, onLost: vi.fn() }),
      { wrapper: wrapper(), initialProps: { h: true } },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const afterHolding = vi.mocked(apiFetch).mock.calls.length;
    expect(afterHolding).toBeGreaterThan(0);

    rerender({ h: false }); // Stop editing — holding→false without unmounting
    await vi.advanceTimersByTimeAsync(90_000);
    expect(vi.mocked(apiFetch).mock.calls.length).toBe(afterHolding);
  });

  it('calls onLost on a 423 PLAN_EDIT_LOCK_LOST heartbeat', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(423, {
        code: 'LOCKED',
        message: 'lost',
        details: { reason: 'PLAN_EDIT_LOCK_LOST' },
      }),
    );
    const onLost = vi.fn();
    renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost }), {
      wrapper: wrapper(),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(0); // flush the mutation rejection → onError → onLost
    expect(onLost).toHaveBeenCalledWith('PLAN_EDIT_LOCK_LOST');
  });

  describe('a hidden tab lets go (ADR-0220 D5)', () => {
    const beats = (): number =>
      vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/heartbeat')).length;
    const MINUTE = 60_000;

    beforeEach(() => setVisibility('visible'));
    afterEach(() => setVisibility('visible'));

    it('keeps beating for a tab hidden less than 15 minutes', async () => {
      renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
        wrapper: wrapper(),
      });
      act(() => setVisibility('hidden'));
      await vi.advanceTimersByTimeAsync(14 * MINUTE);
      expect(beats()).toBeGreaterThan(20);
    });

    it('stops beating once hidden for 15 minutes, and never releases', async () => {
      renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
        wrapper: wrapper(),
      });
      act(() => setVisibility('hidden'));
      await vi.advanceTimersByTimeAsync(15 * MINUTE);
      const atThreshold = beats();
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(beats()).toBe(atThreshold);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled(); // the keepalive DELETE is the release
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
        false,
      );
    });

    it('measures from when it was hidden, not from the ticks it managed to fire', async () => {
      renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
        wrapper: wrapper(),
      });
      act(() => setVisibility('hidden'));
      // A throttled timer fires once, late: one tick after 16 minutes is already past the threshold.
      vi.setSystemTime(Date.now() + 16 * MINUTE);
      const before = beats();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(beats()).toBe(before);
    });

    it('beats at once when the tab is shown again, and keeps beating', async () => {
      renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
        wrapper: wrapper(),
      });
      act(() => setVisibility('hidden'));
      await vi.advanceTimersByTimeAsync(20 * MINUTE);
      const paused = beats();
      act(() => setVisibility('visible'));
      await vi.advanceTimersByTimeAsync(0);
      expect(beats()).toBe(paused + 1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(beats()).toBe(paused + 2);
    });

    it('a short hide resets: hidden 10 minutes, shown, hidden again, still beats at minute 20', async () => {
      renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
        wrapper: wrapper(),
      });
      act(() => setVisibility('hidden'));
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      act(() => setVisibility('visible'));
      await vi.advanceTimersByTimeAsync(0);
      act(() => setVisibility('hidden'));
      const before = beats();
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(beats()).toBeGreaterThan(before + 15);
    });
  });

  describe('a visible tab nobody touches lets go (ADR-0220 D8)', () => {
    const beats = (): number =>
      vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/heartbeat')).length;
    const MINUTE = 60_000;
    const hold = (extra: Partial<Parameters<typeof useLockHeartbeat>[2]>) =>
      renderHook(
        () => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn(), ...extra }),
        {
          wrapper: wrapper(),
        },
      );

    beforeEach(() => setVisibility('visible'));

    it('stops beating after 30 idle minutes, never releases, and rests', async () => {
      const resting = { current: false };
      hold({ resting });
      await vi.advanceTimersByTimeAsync(29 * MINUTE);
      expect(resting.current).toBe(false);
      await vi.advanceTimersByTimeAsync(MINUTE);
      expect(resting.current).toBe(true);
      const atThreshold = beats();
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(beats()).toBe(atThreshold);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
        false,
      );
    });

    it('keeps beating while the pointer moves before the 30 minutes are up', async () => {
      const resting = { current: false };
      hold({ resting });
      await vi.advanceTimersByTimeAsync(29 * MINUTE);
      window.dispatchEvent(new Event('pointermove'));
      await vi.advanceTimersByTimeAsync(29 * MINUTE);
      expect(resting.current).toBe(false);
      const before = beats();
      await vi.advanceTimersByTimeAsync(MINUTE);
      expect(beats()).toBeGreaterThan(before);
    });

    it.each(['pointerdown', 'keydown', 'wheel', 'focus'])(
      'a %s counts as input, even from a handler that stops propagation',
      async (type) => {
        const resting = { current: false };
        hold({ resting });
        const target = document.createElement('div');
        target.addEventListener(type, (e) => e.stopPropagation());
        document.body.append(target);
        await vi.advanceTimersByTimeAsync(29 * MINUTE);
        target.dispatchEvent(new Event(type, { bubbles: true }));
        await vi.advanceTimersByTimeAsync(2 * MINUTE);
        expect(resting.current).toBe(false);
        target.remove();
      },
    );

    it('a scroll event alone is not input', async () => {
      const resting = { current: false };
      hold({ resting });
      await vi.advanceTimersByTimeAsync(29 * MINUTE);
      window.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(2 * MINUTE);
      expect(resting.current).toBe(true);
    });

    it('the first input after resting beats at once, wakes the caller and re-reads the status', async () => {
      const resting = { current: false };
      const onWake = vi.fn();
      hold({ resting, onWake });
      await vi.advanceTimersByTimeAsync(31 * MINUTE);
      expect(resting.current).toBe(true);
      const paused = beats();
      act(() => {
        window.dispatchEvent(new Event('pointermove'));
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(resting.current).toBe(false);
      expect(onWake).toHaveBeenCalledTimes(1);
      expect(beats()).toBe(paused + 1);
      // A second move in the same breath is not another wake.
      act(() => {
        window.dispatchEvent(new Event('pointermove'));
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(beats()).toBe(paused + 1);
      expect(onWake).toHaveBeenCalledTimes(1);
    });

    it('keeps beating for ever while an editor in this tab holds unsaved work', async () => {
      const resting = { current: false };
      const Dirty = (): null => {
        useRegisterUnsavedWork({
          subject: 'Activity',
          scopes: [{ key: 'details', label: 'Details', savable: true }],
        });
        return null;
      };
      const Wrapper = ({ children }: { children: ReactNode }) => {
        const Query = wrapper();
        return createElement(
          Query,
          null,
          createElement(UnsavedWorkProvider, null, createElement(Dirty), children),
        );
      };
      renderHook(
        () => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn(), resting }),
        { wrapper: Wrapper },
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2 * 60 * MINUTE);
      expect(resting.current).toBe(false);
      expect(beats()).toBeGreaterThan(200);
    });

    describe('unsaved work is read at tick time', () => {
      let setDirty: (dirty: boolean) => void = () => {};
      const Dirty = (): null => {
        const [dirty, set] = useState(false);
        setDirty = set;
        useRegisterUnsavedWork(
          dirty
            ? { subject: 'Activity', scopes: [{ key: 'details', label: 'Details', savable: true }] }
            : null,
        );
        return null;
      };
      const mount = (resting: { current: boolean }) => {
        const Wrapper = ({ children }: { children: ReactNode }) =>
          createElement(
            wrapper(),
            null,
            createElement(UnsavedWorkProvider, null, createElement(Dirty), children),
          );
        renderHook(
          () => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn(), resting }),
          {
            wrapper: Wrapper,
          },
        );
      };

      it('clean, then dirty at minute 29 → never rests', async () => {
        const resting = { current: false };
        mount(resting);
        await vi.advanceTimersByTimeAsync(29 * MINUTE);
        act(() => setDirty(true));
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        expect(resting.current).toBe(false);
      });

      it('dirty, then clean at minute 20 → rests once 30 idle minutes are up', async () => {
        const resting = { current: false };
        mount(resting);
        act(() => setDirty(true));
        await vi.advanceTimersByTimeAsync(20 * MINUTE);
        expect(resting.current).toBe(false);
        act(() => setDirty(false));
        await vi.advanceTimersByTimeAsync(11 * MINUTE);
        expect(resting.current).toBe(true);
      });
    });

    it('keeps the listeners attached while resting and clears resting when it stops holding', async () => {
      const resting = { current: false };
      const { rerender } = renderHook(
        ({ holding }) => useLockHeartbeat('acme', 'p1', { holding, onLost: vi.fn(), resting }),
        { wrapper: wrapper(), initialProps: { holding: true } },
      );
      await vi.advanceTimersByTimeAsync(31 * MINUTE);
      expect(resting.current).toBe(true);
      rerender({ holding: false });
      expect(resting.current).toBe(false);
    });

    it('a re-render of the host does not wake a resting tab', async () => {
      const resting = { current: false };
      const { rerender } = renderHook(
        () => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn(), resting }),
        { wrapper: wrapper() },
      );
      await vi.advanceTimersByTimeAsync(31 * MINUTE);
      expect(resting.current).toBe(true);
      const before = { beats: beats(), calls: vi.mocked(apiFetch).mock.calls.length };
      for (let i = 0; i < 5; i += 1) {
        rerender();
        // At once, before the next tick could set it again: the poll reads this flag when it re-arms.
        expect(resting.current).toBe(true);
        await vi.advanceTimersByTimeAsync(20_000);
      }
      expect(resting.current).toBe(true);
      expect(beats()).toBe(before.beats);
      expect(vi.mocked(apiFetch).mock.calls.length).toBe(before.calls);
      // Only a real input wakes it.
      act(() => {
        window.dispatchEvent(new Event('keydown'));
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(resting.current).toBe(false);
      expect(beats()).toBe(before.beats + 1);
    });

    it('a hidden tab that returns beats once and is awake', async () => {
      const resting = { current: false };
      const onWake = vi.fn();
      hold({ resting, onWake });
      await vi.advanceTimersByTimeAsync(31 * MINUTE);
      act(() => setVisibility('hidden'));
      await vi.advanceTimersByTimeAsync(MINUTE);
      const before = beats();
      act(() => setVisibility('visible'));
      await vi.advanceTimersByTimeAsync(0);
      expect(beats()).toBe(before + 1);
      expect(onWake).toHaveBeenCalledTimes(1);
      expect(resting.current).toBe(false);
      // The clock restarted when the tab was shown, so it is not at once resting again.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(resting.current).toBe(false);
    });

    it('a stream of pointer moves does not render the consumer', async () => {
      let renders = 0;
      renderHook(
        () => {
          renders += 1;
          useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() });
        },
        { wrapper: wrapper() },
      );
      await vi.advanceTimersByTimeAsync(0);
      const before = renders;
      for (let i = 0; i < 100; i += 1) window.dispatchEvent(new Event('pointermove'));
      expect(renders).toBe(before);
    });
  });

  it('releases via a keepalive DELETE on pagehide (while holding)', () => {
    renderHook(() => useLockHeartbeat('acme', 'p1', { holding: true, onLost: vi.fn() }), {
      wrapper: wrapper(),
    });
    window.dispatchEvent(new Event('pagehide'));
    const del = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(del).toBeDefined();
    expect(del![0]).toBe('/api/v1/organizations/acme/plans/p1/edit-lock');
    expect((del![1] as RequestInit).keepalive).toBe(true);
  });

  it('does NOT release on pagehide when not holding', () => {
    renderHook(() => useLockHeartbeat('acme', 'p1', { holding: false, onLost: vi.fn() }), {
      wrapper: wrapper(),
    });
    window.dispatchEvent(new Event('pagehide'));
    const del = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(del).toBeUndefined();
  });
});

describe('planEditLockQueryOptions', () => {
  it('polls at 15s', () => {
    expect(planEditLockQueryOptions('acme', 'p1').refetchInterval).toBe(15_000);
  });

  it('pauses the poll while the tab is resting, and resumes when it is not', () => {
    const resting = { current: false };
    const interval = planEditLockQueryOptions('acme', 'p1', resting).refetchInterval;
    expect(typeof interval).toBe('function');
    const read = (): unknown => (interval as () => unknown)();
    expect(read()).toBe(15_000);
    resting.current = true;
    expect(read()).toBe(false);
    resting.current = false;
    expect(read()).toBe(15_000);
  });
});

describe('useRequestControl / useHandoff', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue(FREE));

  it('requests control via POST …/request', async () => {
    const { result } = renderHook(() => useRequestControl('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync();
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/edit-lock/request');
    expect(init?.method).toBe('POST');
  });

  it('hands off via POST …/handoff', async () => {
    const { result } = renderHook(() => useHandoff('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync();
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/edit-lock/handoff');
    expect(init?.method).toBe('POST');
  });
});

describe('usePlanPen', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it('derives holdsPen from a HELD_BY_ME status', async () => {
    vi.mocked(apiFetch).mockResolvedValue(HELD_BY_ME);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
  });

  it('onWriteRejected classifies a 423 as a lock event and raises lostControl', async () => {
    vi.mocked(apiFetch).mockResolvedValue(FREE);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBeDefined());
    let outcome: { kind: string } | undefined;
    act(() => {
      outcome = result.current.onWriteRejected(
        new ApiFetchError(423, {
          code: 'LOCKED',
          message: 'lost',
          details: { reason: 'PLAN_EDIT_LOCK_LOST' },
        }),
      );
    });
    expect(outcome).toEqual({ kind: 'lock' });
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
  });

  it('onWriteRejected passes a 409 through (the conflict-banner path)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(FREE);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBeDefined());
    const outcome = result.current.onWriteRejected(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    expect(outcome).toEqual({ kind: 'passthrough' });
    expect(result.current.lostControl).toBeNull();
  });
});

// --- the pen on opening (ADR-0220) -------------------------------------------

const ME = { id: 'u1', name: 'Me', email: 'me@x.com' };

const HELD_BY_OTHER: PlanEditLockStatus = {
  ...FREE,
  state: 'HELD_BY_OTHER',
  holder: { id: 'u2', name: 'Holder A', email: 'a@x.com' },
  canAcquire: false,
  canRequest: true,
  canTakeOver: false,
  canOverride: false,
};

const LOCKED_HELD = new ApiFetchError(423, {
  code: 'LOCKED',
  message: 'held',
  details: { reason: 'PLAN_EDIT_LOCK_HELD' },
});
const LOCKED_LOST = new ApiFetchError(423, {
  code: 'LOCKED',
  message: 'lost',
  details: { reason: 'PLAN_EDIT_LOCK_LOST' },
});

const posts = (suffix = ''): unknown[][] =>
  vi
    .mocked(apiFetch)
    .mock.calls.filter(
      ([path, init]) => init?.method === 'POST' && path.endsWith(`/edit-lock${suffix}`),
    );

/** Answer the status GET from `reads` in turn (the last repeats) and every POST per `post`. */
function serve(reads: PlanEditLockStatus[], post: (path: string) => unknown = () => HELD_BY_ME) {
  let n = 0;
  vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST' || init?.method === 'DELETE') {
      const out = post(path);
      return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
    }
    const next = reads[Math.min(n, reads.length - 1)];
    n += 1;
    return Promise.resolve(next);
  });
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePlanPen — the pen on opening', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    setVisibility('visible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens FREE → one acquire, and never a take-over', async () => {
    serve([FREE, HELD_BY_ME], () => HELD_BY_ME);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(JSON.parse((posts()[0]![1] as RequestInit).body as string)).toEqual({ takeover: false });
  });

  it('opens EXPIRED → one acquire', async () => {
    serve([{ ...FREE, state: 'EXPIRED', holder: HELD_BY_OTHER.holder }, HELD_BY_ME]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
  });

  it('mounted under StrictMode → still exactly one acquire', async () => {
    serve([FREE, HELD_BY_ME]);
    const Plain = wrapper();
    const Strict = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, createElement(Plain, null, children));
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Strict });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(1);
  });

  it('unmounting while the automatic acquire is in the air → no second acquire, no rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    let rejectPost: (e: Error) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<PlanEditLockStatus>((_resolve, reject) => {
            rejectPost = reject;
          })
        : Promise.resolve(FREE),
    );
    const { result, unmount } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(result.current.autoAcquiring).toBe(true);
    unmount();
    rejectPost(LOCKED_HELD);
    await new Promise((r) => setTimeout(r, 50));
    process.off('unhandledRejection', unhandled);
    expect(posts()).toHaveLength(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('is busy from the first render that has the free status, before the POST resolves', async () => {
    let resolvePost: (s: PlanEditLockStatus) => void = () => {};
    let posted = false;
    vi.mocked(apiFetch).mockImplementation((_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<PlanEditLockStatus>((r) => {
            posted = true;
            resolvePost = r;
          })
        : Promise.resolve(posted ? HELD_BY_ME : FREE),
    );
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.autoAcquiring).toBe(true));
    expect(result.current.isPending).toBe(true);
    act(() => resolvePost(HELD_BY_ME));
    await waitFor(() => expect(result.current.autoAcquiring).toBe(false));
    expect(result.current.holdsPen).toBe(true);
  });

  it('opens HELD_BY_ME → zero acquires', async () => {
    serve([HELD_BY_ME]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(0);
  });

  it('opens HELD_BY_OTHER → zero acquires, even when the server offers an override', async () => {
    serve([{ ...HELD_BY_OTHER, canOverride: true }]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    expect(posts()).toHaveLength(0);
    expect(result.current.autoAcquiring).toBe(false);
  });

  it('opens with canAcquire false (Viewer, Contributor) → zero acquires', async () => {
    serve([{ ...FREE, canAcquire: false }]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(posts()).toHaveLength(0);
    expect(result.current.autoAcquiring).toBe(false);
  });

  it('opens in a hidden tab → waits; one acquire when first shown', async () => {
    setVisibility('hidden');
    serve([FREE, HELD_BY_ME]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(posts()).toHaveLength(0);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
  });

  it('absorbs a 423 HELD from the automatic acquire — no lostControl, the refetch shows the holder', async () => {
    let held = false;
    vi.mocked(apiFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        held = true;
        return Promise.reject(LOCKED_HELD);
      }
      return Promise.resolve(held ? HELD_BY_OTHER : FREE);
    });
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    await waitFor(() => expect(result.current.autoAcquiring).toBe(false));
    expect(result.current.lostControl).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('Stop editing is respected: the pen freeing up again sends no further acquire', async () => {
    serve([FREE, HELD_BY_ME, FREE, FREE], (path) =>
      path.endsWith('/edit-lock') ? HELD_BY_ME : undefined,
    );
    const { result, rerender } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    act(() => result.current.stopEditing());
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(1);
  });

  it('a pen that frees up while a reader is watching is not taken from the poll', async () => {
    serve([HELD_BY_OTHER, FREE]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(result.current.autoAcquiring).toBe(false);
    expect(posts()).toHaveLength(0);
  });
});

describe('usePlanPen — a loss nobody caused', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    setVisibility('visible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  /** HELD_BY_ME at first; the heartbeat is refused; later reads follow `after`. */
  function lose(after: PlanEditLockStatus, retake: () => unknown = () => HELD_BY_ME) {
    let lost = false;
    vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/heartbeat')) {
        lost = true;
        return Promise.reject(LOCKED_LOST);
      }
      if (init?.method === 'POST') {
        const out = retake();
        if (out instanceof Error) return Promise.reject(out);
        lost = false;
        return Promise.resolve(out);
      }
      return Promise.resolve(lost ? after : HELD_BY_ME);
    });
  }

  it('heartbeat 423 then FREE → one silent acquire, no banner', async () => {
    lose(FREE);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    // The immediate beat a tab owes when it returns to the foreground — no 30 s wait.
    act(() => setVisibility('visible'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(result.current.autoAcquiring).toBe(false));
    expect(result.current.lostControl).toBeNull();
    expect(result.current.holdsPen).toBe(true);
  });

  it('heartbeat 423 then HELD_BY_OTHER → today’s lostControl, and no acquire', async () => {
    lose(HELD_BY_OTHER);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    // The immediate beat a tab owes when it returns to the foreground — no 30 s wait.
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
    expect(posts()).toHaveLength(0);
  });

  it('a retake that is itself refused shows the banner rather than looping', async () => {
    lose(FREE, () => LOCKED_HELD);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    // The immediate beat a tab owes when it returns to the foreground — no 30 s wait.
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
    expect(posts()).toHaveLength(1);
  });

  /** HELD_BY_ME; every heartbeat is answered from `beats` in turn (the last repeats). */
  function scripted(beats: ('lost' | 'ok')[], retakes: Promise<PlanEditLockStatus>[] = []) {
    let lost = false;
    let beat = 0;
    let retake = 0;
    vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/heartbeat')) {
        const outcome = beats[Math.min(beat, beats.length - 1)];
        beat += 1;
        if (outcome === 'ok') return Promise.resolve(HELD_BY_ME);
        lost = true;
        return Promise.reject(LOCKED_LOST);
      }
      if (init?.method === 'POST') {
        const out = retakes[retake] ?? Promise.resolve(HELD_BY_ME);
        retake += 1;
        return out.then((v) => {
          lost = false;
          return v;
        });
      }
      return Promise.resolve(lost ? FREE : HELD_BY_ME);
    });
  }

  it('keeps showing the held lease while the silent retake is in the air', async () => {
    let finish: (s: PlanEditLockStatus) => void = () => {};
    scripted(
      ['lost'],
      [
        new Promise<PlanEditLockStatus>((r) => {
          finish = r;
        }),
      ],
    );
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    // The refetch has said FREE; the status a view is built from has not changed, and the opening
    // flag stays down so the view is never the loading one.
    expect(result.current.status?.state).toBe('HELD_BY_ME');
    expect(result.current.autoAcquiring).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(result.current.lostControl).toBeNull();
    act(() => {
      finish(HELD_BY_ME);
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.status?.state).toBe('HELD_BY_ME');
  });

  it('two refused beats close together run one retake and show no banner', async () => {
    let finish: (s: PlanEditLockStatus) => void = () => {};
    scripted(
      ['lost'],
      [
        new Promise<PlanEditLockStatus>((r) => {
          finish = r;
        }),
      ],
    );
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    act(() => {
      setVisibility('visible');
      setVisibility('visible');
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    // While the retake is still in the air: the second beat must not have shown a banner (the first
    // retake's success would clear it afterwards, which is why this is read before `finish`).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.lostControl).toBeNull();
    act(() => {
      finish(HELD_BY_ME);
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(posts()).toHaveLength(1);
    expect(result.current.lostControl).toBeNull();
  });

  it('a second loss with no accepted beat between shows the banner', async () => {
    scripted(['lost']);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
    expect(posts()).toHaveLength(1);
  });

  it('an accepted beat resets the cap, so a later loss is retaken again', async () => {
    scripted(['lost', 'ok', 'lost']);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.length).toBeGreaterThan(4));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(posts()).toHaveLength(2));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.lostControl).toBeNull();
  });
});

describe('usePlanPen — a requester takes the freed pen', () => {
  const HELD_BY_OTHER_2: PlanEditLockStatus = {
    ...HELD_BY_OTHER,
    holder: { id: 'u3', name: 'Holder B', email: 'b@x.com' },
  };
  // What the server reads once this person (u1) has asked: the memory follows that record (D7).
  const ASKED: PlanEditLockStatus = { ...HELD_BY_OTHER, requestedBy: ME };
  const client = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    setVisibility('visible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  function mount(reads: PlanEditLockStatus[]) {
    // The request answers with the held status; the acquire answers with the pen.
    serve(reads, (path) => (path.endsWith('/request') ? ASKED : HELD_BY_ME));
    const qc = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const hook = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    return { ...hook, qc };
  }

  it('request, then the holder leaves → exactly one acquire, never a take-over', async () => {
    const { result, qc } = mount([HELD_BY_OTHER, ASKED, FREE, HELD_BY_ME]);
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    act(() => result.current.requestControl());
    await waitFor(() => expect(posts('/request')).toHaveLength(1));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(JSON.parse((posts()[0]![1] as RequestInit).body as string)).toEqual({ takeover: false });
  });

  it('keeps showing the holder while the freed pen is taken, never a free or loading status', async () => {
    const seen: string[] = [];
    serve([HELD_BY_OTHER, ASKED, FREE, HELD_BY_ME], (path) =>
      path.endsWith('/request') ? ASKED : HELD_BY_ME,
    );
    const qc = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(
      () => {
        const pen = usePlanPen('acme', 'p1', 'u1');
        seen.push(`${pen.status?.state ?? 'none'}${pen.autoAcquiring ? '+auto' : ''}`);
        return pen;
      },
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    act(() => result.current.requestControl());
    await waitFor(() => expect(posts('/request')).toHaveLength(1));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(seen.filter((s) => s.startsWith('FREE') || s.includes('+auto'))).toEqual([]);
    expect(seen.at(-1)).toBe('HELD_BY_ME');
  });

  it('no request → a freed pen is not taken', async () => {
    const { result, qc } = mount([HELD_BY_OTHER, FREE]);
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(posts()).toHaveLength(0);
  });

  it('request, then a different holder, then free → zero acquires', async () => {
    const { result, qc } = mount([HELD_BY_OTHER, ASKED, HELD_BY_OTHER_2, FREE]);
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    act(() => result.current.requestControl());
    await waitFor(() => expect(posts('/request')).toHaveLength(1));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.holder?.id).toBe('u3'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it('request in a hidden tab → waits until shown, then one acquire', async () => {
    const { result, qc } = mount([HELD_BY_OTHER, ASKED, FREE, HELD_BY_ME]);
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    act(() => result.current.requestControl());
    await waitFor(() => expect(posts('/request')).toHaveLength(1));
    act(() => setVisibility('hidden'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(posts()).toHaveLength(0);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
  });

  const del = (): unknown[][] =>
    vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'DELETE');

  it('Cancel request sends DELETE …/request and the memory is gone: a later FREE sends no acquire', async () => {
    const CANCELLED = { ...HELD_BY_OTHER, requestedBy: null };
    serve([HELD_BY_OTHER, ASKED, CANCELLED, FREE], (path) =>
      path.endsWith('/request') &&
      vi.mocked(apiFetch).mock.calls.some(([, i]) => i?.method === 'DELETE')
        ? CANCELLED
        : path.endsWith('/request')
          ? ASKED
          : HELD_BY_ME,
    );
    const qc = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    act(() => result.current.requestControl());
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(del()).toHaveLength(1));
    expect(del()[0]![0]).toBe('/organizations/acme/plans/p1/edit-lock/request');
    await waitFor(() => expect(result.current.status?.requestedBy).toBeNull());
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it('a read that left before the cancel cannot re-arm the memory while it is in flight', async () => {
    const CANCELLED = { ...HELD_BY_OTHER, requestedBy: null };
    let release: (v: PlanEditLockStatus) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Promise((r) => (release = r));
      if (init?.method === 'POST') return Promise.resolve(HELD_BY_ME);
      return Promise.resolve(path ? (reads.shift() ?? ASKED) : ASKED);
    });
    const reads: PlanEditLockStatus[] = [ASKED, ASKED, FREE];
    const qc = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(del()).toHaveLength(1));
    // A stale read still naming me lands while the DELETE is pending, then the pen frees.
    await act(async () => {
      await qc.refetchQueries();
    });
    await act(async () => {
      await qc.refetchQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
    act(() => release(CANCELLED));
  });

  it('reload: a fresh mount that reads my own request adopts it, and FREE then sends exactly one acquire (Q1)', async () => {
    const { result, qc } = mount([ASKED, FREE, HELD_BY_ME]);
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(JSON.parse((posts()[0]![1] as RequestInit).body as string)).toEqual({ takeover: false });
  });

  it('another requester replaces mine → FREE then sends nothing', async () => {
    const CAROL = { ...HELD_BY_OTHER, requestedBy: { id: 'u9', name: 'Carol', email: 'c@x.com' } };
    const { result, qc } = mount([ASKED, CAROL, FREE]);
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u9'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it('a request withdrawn in a sibling tab (a read with no requester) drops the memory', async () => {
    const { result, qc } = mount([ASKED, HELD_BY_OTHER, FREE]);
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.requestedBy).toBeNull());
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it('a cancel answered HELD_BY_ME leaves the tab holding', async () => {
    serve([ASKED, HELD_BY_ME], () => HELD_BY_ME);
    const qc = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
  });

  it('a failed cancel re-adopts the request, says so, and a later FREE still sends exactly one acquire', async () => {
    serve([ASKED, ASKED, FREE, HELD_BY_ME], (path) => {
      const isDelete = vi.mocked(apiFetch).mock.calls.some(([, i]) => i?.method === 'DELETE');
      if (isDelete && path.endsWith('/request')) return new Error('network down');
      return HELD_BY_ME;
    });
    const { result, qc } = (() => {
      const q = client();
      const Wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: q }, children);
      return {
        result: renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper }).result,
        qc: q,
      };
    })();
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    expect(result.current.cancelFailed).toBe(false);
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(result.current.cancelFailed).toBe(true));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    // The request is still on record, so the tab asked for it again: the free read takes the pen once.
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(result.current.cancelFailed).toBe(false);
  });

  it('a status read that left before the cancel cannot put the request back', async () => {
    const CANCELLED = { ...HELD_BY_OTHER, requestedBy: null };
    let staleRead: (v: PlanEditLockStatus) => void = () => {};
    let n = 0;
    vi.mocked(apiFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(CANCELLED);
      if (init?.method === 'POST') return Promise.resolve(HELD_BY_ME);
      n += 1;
      if (n === 1) return Promise.resolve(ASKED);
      if (n === 2) return new Promise<PlanEditLockStatus>((r) => (staleRead = r));
      return Promise.resolve(CANCELLED);
    });
    const q = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: q }, children);
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    act(() => {
      void q.refetchQueries(); // the read that leaves before the cancel
    });
    await waitFor(() => expect(n).toBe(2));
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(result.current.status?.requestedBy).toBeNull());
    act(() => staleRead(ASKED));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.status?.requestedBy).toBeNull();
  });

  it('adopts a reloaded request under StrictMode: FREE sends exactly one acquire', async () => {
    serve([ASKED, FREE, HELD_BY_ME]);
    const q = client();
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, createElement(QueryClientProvider, { client: q }, children));
    const { result } = renderHook(() => usePlanPen('acme', 'p1', 'u1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    await act(async () => {
      await q.invalidateQueries();
    });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
  });

  it('the freed-pen acquire already sent, then Cancel runs: the tab keeps the one pen it took', async () => {
    serve([ASKED, FREE, HELD_BY_ME], () => HELD_BY_ME);
    const { result, qc } = mount([ASKED, FREE, HELD_BY_ME]);
    await waitFor(() => expect(result.current.status?.requestedBy?.id).toBe('u1'));
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    act(() => result.current.cancelRequest());
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(result.current.cancelFailed).toBe(false);
  });
});

// --- a tab that rested wakes (ADR-0220 D8) -----------------------------------

describe('usePlanPen — waking after the tab rested', () => {
  const MINUTE = 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockReset();
    setVisibility('visible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const announcing = (Inner: ReturnType<typeof wrapper>) =>
    function Announcing({ children }: { children: ReactNode }) {
      return createElement(Inner, null, createElement(AnnouncerProvider, null, children));
    };

  const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  interface Server {
    /** The lease lapsed while the tab rested. */
    lapse: (after: PlanEditLockStatus) => void;
    /** Hold the next heartbeat until `release` is called. */
    holdBeat: () => (outcome: 'ok' | 'lost') => void;
    /** Hold the next acquire until the returned function is called. */
    holdAcquire: () => () => void;
    beats: () => number;
  }

  /** Reads follow the lease; the heartbeat is refused once it has lapsed; an acquire restores it. */
  function server(): Server {
    let lapsed: PlanEditLockStatus | null = null;
    let gate: Promise<'ok' | 'lost'> | null = null;
    let acquireGate: Promise<void> | null = null;
    let beats = 0;
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/heartbeat')) {
        beats += 1;
        const forced = gate ? await gate : null;
        gate = null;
        if (forced === 'ok') return HELD_BY_ME;
        if (forced === 'lost' || lapsed) throw LOCKED_LOST;
        return HELD_BY_ME;
      }
      if (init?.method === 'POST') {
        if (acquireGate) await acquireGate;
        acquireGate = null;
        lapsed = null;
        return HELD_BY_ME;
      }
      return lapsed ?? HELD_BY_ME;
    });
    return {
      lapse: (after) => {
        lapsed = after;
      },
      holdBeat: () => {
        let release: (outcome: 'ok' | 'lost') => void = () => {};
        gate = new Promise((r) => {
          release = r;
        });
        return release;
      },
      holdAcquire: () => {
        let release: () => void = () => {};
        acquireGate = new Promise((r) => {
          release = r;
        });
        return release;
      },
      beats: () => beats,
    };
  }

  /** Mount holding, let the tab rest for 31 minutes, and record every status the view is given. */
  async function rest() {
    const seen: (string | undefined)[] = [];
    let queryClient: QueryClient | undefined;
    const hook = renderHook(
      () => {
        queryClient = useQueryClient();
        const pen = usePlanPen('acme', 'p1', 'u1');
        seen.push(pen.status?.state);
        return pen;
      },
      { wrapper: announcing(wrapper()) },
    );
    await flush();
    expect(hook.result.current.holdsPen).toBe(true);
    await flush(31 * MINUTE);
    seen.length = 0;
    return { ...hook, seen, queryClient: queryClient as QueryClient };
  }

  const wake = () => {
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
  };

  it('a resting tab polls no more, and sends no beats', async () => {
    const api = server();
    await rest();
    const reads = (): number =>
      vi.mocked(apiFetch).mock.calls.filter(([, init]) => !init?.method).length;
    const before = { reads: reads(), beats: api.beats() };
    await flush(10 * MINUTE);
    expect(reads()).toBe(before.reads);
    expect(api.beats()).toBe(before.beats);
  });

  it('wake, beat refused, plan free → a silent retake, and the view is never the free one', async () => {
    const api = server();
    const { result, seen } = await rest();
    api.lapse(FREE);
    wake();
    await flush();
    await flush();
    expect(posts()).toHaveLength(1);
    expect(result.current.lostControl).toBeNull();
    expect(result.current.holdsPen).toBe(true);
    expect(seen).not.toContain('FREE');
    expect(seen).not.toContain('EXPIRED');
  });

  it('wake, a status read lands FREE before the refused beat does → still not painted free', async () => {
    const api = server();
    const { result, seen } = await rest();
    const settle = api.holdBeat();
    api.lapse(FREE);
    wake();
    await flush(); // the fresh read has said FREE; the beat is still in the air
    expect(result.current.status?.state).toBe('HELD_BY_ME');
    expect(seen).not.toContain('FREE');
    act(() => settle('lost'));
    await flush();
    await flush();
    expect(result.current.lostControl).toBeNull();
    expect(seen).not.toContain('FREE');
  });

  it('wake, beat refused, a colleague holds it → the existing lost-control reason', async () => {
    const api = server();
    const { result } = await rest();
    api.lapse(HELD_BY_OTHER);
    wake();
    await flush();
    await flush();
    expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST');
    expect(posts()).toHaveLength(0);
  });

  it('wake with a beat that succeeds → nothing changes', async () => {
    const api = server();
    const { result, seen } = await rest();
    const before = api.beats();
    wake();
    await flush();
    await flush();
    expect(api.beats()).toBe(before + 1);
    expect(result.current.lostControl).toBeNull();
    expect(result.current.holdsPen).toBe(true);
    expect(seen.every((s) => s === 'HELD_BY_ME')).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it('a write refused while waking, with the plan free → looks first, retakes, no lost sentence', async () => {
    const api = server();
    const { result } = await rest();
    const settle = api.holdBeat();
    api.lapse(FREE);
    wake();
    await flush();
    let outcome: { kind: string } | undefined;
    act(() => {
      outcome = result.current.onWriteRejected(LOCKED_LOST);
    });
    expect(outcome).toEqual({ kind: 'lock' });
    act(() => settle('lost'));
    await flush();
    await flush();
    expect(result.current.lostControl).toBeNull();
    expect(posts()).toHaveLength(1);
    expect(result.current.holdsPen).toBe(true);
    await flush(50); // the announcer writes on the next animation frame
    // The change was dropped, so the person is told once, and it is not sent again. The banner is the
    // one channel; the shared live region must not also speak it.
    expect(result.current.awayWrite).toBe(true);
    expect(document.querySelector('[data-testid="announcer"]')?.textContent).toBe('');
    act(() => result.current.dismissAwayWrite());
    expect(result.current.awayWrite).toBe(false);
  });

  it('a write refused while waking, when a colleague took the plan → the lost sentence, no away notice', async () => {
    const api = server();
    const { result } = await rest();
    const settle = api.holdBeat();
    api.lapse(HELD_BY_OTHER);
    wake();
    await flush();
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    act(() => settle('lost'));
    await flush();
    await flush();
    expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST');
    expect(result.current.awayWrite).toBe(false);
  });

  it('a refused beat with no write behind it retakes without any notice', async () => {
    const api = server();
    const { result } = await rest();
    api.lapse(FREE);
    wake();
    await flush();
    await flush();
    expect(result.current.holdsPen).toBe(true);
    expect(result.current.awayWrite).toBe(false);
  });

  it('wake with a colleague holding the plan → the view goes straight from held to the lost sentence', async () => {
    const api = server();
    const { result, seen } = await rest();
    const views: string[] = [];
    const record = (): void => {
      views.push(`${result.current.status?.state}/${result.current.lostControl ?? '-'}`);
    };
    record();
    // The fresh read lands while the beat is still in the air, as it does in a browser.
    const settle = api.holdBeat();
    api.lapse(HELD_BY_OTHER);
    wake();
    await flush(20);
    record();
    act(() => settle('lost'));
    for (let i = 0; i < 4; i += 1) {
      await flush(20);
      record();
    }
    // Never "{Name} is editing" first, and never "editing" again after it: held, then the lost sentence.
    expect([...new Set(views)]).toEqual(['HELD_BY_ME/-', 'HELD_BY_OTHER/PLAN_EDIT_LOCK_LOST']);
    expect(seen.filter((s, i) => s !== seen[i - 1])).toEqual(['HELD_BY_ME', 'HELD_BY_OTHER']);
  });

  it('beat refused first, retake in the air, then the write refused → no lost sentence, one notice', async () => {
    const api = server();
    const { result } = await rest();
    const finish = api.holdAcquire();
    api.lapse(FREE);
    wake();
    await flush(); // the beat is refused and the retake is now waiting on its acquire
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    act(() => finish());
    await flush();
    await flush();
    expect(result.current.lostControl).toBeNull();
    expect(result.current.holdsPen).toBe(true);
    expect(result.current.awayWrite).toBe(true);
  });

  it('beat refused and the retake done, then a write refused for the same lapse → a notice, not the lost banner', async () => {
    const api = server();
    const { result } = await rest();
    api.lapse(FREE);
    wake();
    await flush();
    await flush();
    expect(result.current.holdsPen).toBe(true);
    expect(result.current.awayWrite).toBe(false);
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    await flush();
    await flush();
    expect(result.current.lostControl).toBeNull();
    expect(result.current.awayWrite).toBe(true);
    expect(posts()).toHaveLength(1); // nothing was retaken a second time
  });

  it('a write refused after the retake, when a colleague has since taken the plan → the lost banner', async () => {
    const api = server();
    const { result } = await rest();
    api.lapse(FREE);
    wake();
    await flush();
    await flush();
    api.lapse(HELD_BY_OTHER);
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    await flush();
    await flush();
    expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST');
    expect(result.current.awayWrite).toBe(false);
  });

  it('a write refused while declined leaves nothing behind for a later, unrelated retake', async () => {
    const api = server();
    const { result } = await rest();
    const settle = api.holdBeat();
    api.lapse(FREE);
    wake();
    await flush();
    act(() => result.current.stopEditing());
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    await flush();
    act(() => result.current.startEditing());
    await flush();
    await flush();
    expect(result.current.awayWrite).toBe(false);
    act(() => settle('lost'));
    await flush();
    await flush();
    expect(result.current.awayWrite).toBe(false);
  });

  describe('the away notice goes away', () => {
    async function withNotice(before?: (queryClient: QueryClient) => void) {
      const api = server();
      const hook = await rest();
      before?.(hook.queryClient);
      await flush(10);
      const settle = api.holdBeat();
      api.lapse(FREE);
      wake();
      await flush();
      act(() => {
        hook.result.current.onWriteRejected(LOCKED_LOST);
      });
      act(() => settle('lost'));
      await flush();
      await flush();
      expect(hook.result.current.awayWrite).toBe(true);
      return hook;
    }

    it('on Stop editing', async () => {
      const { result } = await withNotice();
      act(() => result.current.stopEditing());
      expect(result.current.awayWrite).toBe(false);
    });

    it('when the next write is accepted, but not when a lock verb succeeds', async () => {
      const { result, queryClient } = await withNotice();
      // A heartbeat or an acquire succeeding is not a write.
      await act(async () => {
        await queryClient
          .getMutationCache()
          .build(queryClient, { mutationKey: ['plan-lock'], mutationFn: () => Promise.resolve(1) })
          .execute(undefined);
      });
      expect(result.current.awayWrite).toBe(true);
      await flush(10); // a write submitted after the notice, not in the same instant
      await act(async () => {
        await queryClient
          .getMutationCache()
          .build(queryClient, { mutationFn: () => Promise.resolve(1) })
          .execute(undefined);
      });
      expect(result.current.awayWrite).toBe(false);
    });

    it('a write already in flight when the refusal landed does not clear it when it succeeds', async () => {
      let finish: () => void = () => {};
      let sibling: Promise<unknown> = Promise.resolve();
      const { result } = await withNotice((queryClient) => {
        sibling = queryClient
          .getMutationCache()
          .build(queryClient, {
            mutationFn: () =>
              new Promise<number>((resolve) => {
                finish = () => resolve(1);
              }),
          })
          .execute(undefined);
      });
      expect(result.current.awayWrite).toBe(true);
      await act(async () => {
        finish();
        await sibling;
      });
      expect(result.current.awayWrite).toBe(true);
    });
  });

  it('a reconnect that delivers FREE to a resting tab shows the honest state and retakes nothing', async () => {
    const api = server();
    const { result, queryClient } = await rest();
    const beatsBefore = api.beats();
    api.lapse(FREE);
    // What a reconnect's refetch does: a read arrives with no input behind it.
    act(() => {
      void queryClient.invalidateQueries({ queryKey: planLockKeys.status('acme', 'p1') });
    });
    await flush();
    await flush();
    expect(result.current.status?.state).toBe('FREE');
    expect(result.current.holdsPen).toBe(false);
    expect(result.current.lostControl).toBeNull();
    expect(posts()).toHaveLength(0);
    expect(api.beats()).toBe(beatsBefore);
  });

  it('a write refused when the tab is not waking still says so at once', async () => {
    server();
    const { result } = await rest();
    act(() => {
      result.current.onWriteRejected(LOCKED_LOST);
    });
    expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST');
  });

  it('a hidden tab returning after its lease lapsed is not painted free either', async () => {
    const api = server();
    const seen: (string | undefined)[] = [];
    const { result } = renderHook(
      () => {
        const pen = usePlanPen('acme', 'p1', 'u1');
        seen.push(pen.status?.state);
        return pen;
      },
      { wrapper: wrapper() },
    );
    await flush();
    act(() => setVisibility('hidden'));
    await flush(20 * MINUTE);
    api.lapse(FREE);
    seen.length = 0;
    act(() => setVisibility('visible'));
    await flush();
    await flush();
    expect(seen).not.toContain('FREE');
    expect(result.current.lostControl).toBeNull();
    expect(result.current.holdsPen).toBe(true);
  });
});
