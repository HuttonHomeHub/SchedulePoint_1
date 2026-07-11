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

// The pen layer is flag-gated; force it on so `usePlanPen` is exercised (only that
// hook reads the flag — the mutation/heartbeat hooks take `enabled`/`holding` args).
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, PLAN_EDIT_LOCK_ENABLED: true };
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
  it('polls at 15s only while enabled (no network when the pen layer is off)', () => {
    expect(planEditLockQueryOptions('acme', 'p1', true).refetchInterval).toBe(15_000);
    expect(planEditLockQueryOptions('acme', 'p1', false).refetchInterval).toBe(false);
    expect(planEditLockQueryOptions('acme', 'p1', false).enabled).toBe(false);
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

  it('reports penManaged and derives holdsPen from a HELD_BY_ME status', async () => {
    vi.mocked(apiFetch).mockResolvedValue(HELD_BY_ME);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    expect(result.current.penManaged).toBe(true);
    await waitFor(() => expect(result.current.holdsPen).toBe(true));
  });

  it('does not auto-acquire on mount/focus — acquire is a user action only', async () => {
    vi.mocked(apiFetch).mockResolvedValue(FREE);
    const { result } = renderHook(() => usePlanPen('acme', 'p1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status?.state).toBe('FREE'));
    const posts = vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(0);
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
