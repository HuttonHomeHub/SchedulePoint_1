import type { PlanEditLockStatus } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  planEditLockQueryOptions,
  useAcquireLock,
  useHandoff,
  useLockHeartbeat,
  usePlanPen,
  useReleaseLock,
  useRequestControl,
} from './use-plan-edit-lock';

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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
  });

  it('onWriteRejected classifies a 423 as a lock event and raises lostControl', async () => {
    vi.mocked(apiFetch).mockResolvedValue(FREE);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBeDefined());
    const outcome = result.current.onWriteRejected(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    expect(outcome).toEqual({ kind: 'passthrough' });
    expect(result.current.lostControl).toBeNull();
  });
});

// --- the pen on opening (ADR-0220) -------------------------------------------

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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(1);
    expect(JSON.parse((posts()[0]![1] as RequestInit).body as string)).toEqual({ takeover: false });
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.autoAcquiring).toBe(true));
    expect(result.current.isPending).toBe(true);
    act(() => resolvePost(HELD_BY_ME));
    await waitFor(() => expect(result.current.autoAcquiring).toBe(false));
    expect(result.current.holdsPen).toBe(true);
  });

  it('opens HELD_BY_ME → zero acquires', async () => {
    serve([HELD_BY_ME]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    expect(posts()).toHaveLength(0);
  });

  it('opens HELD_BY_OTHER → zero acquires, even when the server offers an override', async () => {
    serve([{ ...HELD_BY_OTHER, canOverride: true }]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    expect(posts()).toHaveLength(0);
    expect(result.current.autoAcquiring).toBe(false);
  });

  it('opens with canAcquire false (Viewer, Contributor) → zero acquires', async () => {
    serve([{ ...FREE, canAcquire: false }]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    expect(posts()).toHaveLength(0);
    expect(result.current.autoAcquiring).toBe(false);
  });

  it('opens in a hidden tab → waits; one acquire when first shown', async () => {
    setVisibility('hidden');
    serve([FREE, HELD_BY_ME]);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('HELD_BY_OTHER'));
    await waitFor(() => expect(result.current.autoAcquiring).toBe(false));
    expect(result.current.lostControl).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('Stop editing is respected: the pen freeing up again sends no further acquire', async () => {
    serve([FREE, HELD_BY_ME, FREE, FREE], (path) =>
      path.endsWith('/edit-lock') ? HELD_BY_ME : undefined,
    );
    const { result, rerender } = renderHook(() => usePlanPen('acme', 'p1'), {
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: Wrapper });
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
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
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    // The immediate beat a tab owes when it returns to the foreground — no 30 s wait.
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
    expect(posts()).toHaveLength(0);
  });

  it('a retake that is itself refused shows the banner rather than looping', async () => {
    lose(FREE, () => LOCKED_HELD);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
    // The immediate beat a tab owes when it returns to the foreground — no 30 s wait.
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.lostControl).toBe('PLAN_EDIT_LOCK_LOST'));
    expect(posts()).toHaveLength(1);
  });
});
