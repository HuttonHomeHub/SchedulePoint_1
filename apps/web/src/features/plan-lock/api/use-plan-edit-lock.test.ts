import type { PlanEditLockStatus } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAcquireLock, useLockHeartbeat, useReleaseLock } from './use-plan-edit-lock';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

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
