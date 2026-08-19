import type { MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionKeys, useSignIn, useSignOut, useSignUp } from './use-session';

import { rememberPlan, readRecentPlanIds } from '@/features/overview/model/recent-plans';
import { apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

const ME: MeResponse = {
  user: { id: 'u1', email: 'a@b.com', name: 'Ada', emailVerified: true, image: null },
  memberships: [],
};

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seed the stale, pre-login value the `_authed` guard would have cached.
  queryClient.setQueryData(sessionKeys.session, null);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

afterEach(() => vi.clearAllMocks());

describe('useSignIn', () => {
  it('refetches /me into the session cache after a successful sign-in', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });
    vi.mocked(apiFetch).mockResolvedValue(ME);
    const { queryClient, wrapper } = harness();

    const { result } = renderHook(() => useSignIn(), { wrapper });
    await result.current.mutateAsync({ email: 'a@b.com', password: 'correct-horse' });

    // The (inactive) session query must be refetched — not merely invalidated —
    // so the router guard reads the logged-in user instead of the stale null.
    expect(apiFetch).toHaveBeenCalledWith('/me');
    await waitFor(() => expect(queryClient.getQueryData(sessionKeys.session)).toEqual(ME));
  });

  it('propagates a sign-in error and leaves the session unchanged', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Invalid email or password' },
    });
    const { queryClient, wrapper } = harness();

    const { result } = renderHook(() => useSignIn(), { wrapper });
    await expect(
      result.current.mutateAsync({ email: 'a@b.com', password: 'nope' }),
    ).rejects.toThrow('Invalid email or password');
    expect(apiFetch).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(sessionKeys.session)).toBeNull();
  });
});

describe('useSignUp', () => {
  it('refetches /me into the session cache after a successful sign-up', async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({ error: null });
    vi.mocked(apiFetch).mockResolvedValue(ME);
    const { queryClient, wrapper } = harness();

    const { result } = renderHook(() => useSignUp(), { wrapper });
    await result.current.mutateAsync({ name: 'Ada', email: 'a@b.com', password: 'correct-horse' });

    await waitFor(() => expect(queryClient.getQueryData(sessionKeys.session)).toEqual(ME));
  });
});

describe('useSignOut', () => {
  /**
   * **The query cache dies with the tab; `localStorage` does not.**
   *
   * Without this sweep a shared machine hands the next account the previous one's plan names —
   * commercially sensitive strings, on the first screen after sign-in, caused by nothing they did
   * (ADR-0098 §4.9 D10a). The other half of the same guarantee is the key carrying the user id,
   * which `recent-plans.test.ts` pins.
   */
  it("clears this account's remembered plans, and nobody else's", async () => {
    const { queryClient, wrapper } = harness();
    queryClient.setQueryData(sessionKeys.session, ME);
    rememberPlan(window.localStorage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    rememberPlan(window.localStorage, { userId: 'u2', orgSlug: 'acme', planId: 'p2', at: 2 });
    vi.mocked(authClient.signOut).mockResolvedValue(undefined);

    const { result } = renderHook(() => useSignOut(), { wrapper });
    result.current.mutate();

    await waitFor(() => {
      expect(readRecentPlanIds(window.localStorage, { userId: 'u1', orgSlug: 'acme' })).toEqual([]);
    });
    expect(readRecentPlanIds(window.localStorage, { userId: 'u2', orgSlug: 'acme' })).toEqual([
      'p2',
    ]);
  });

  it('clears them even when the sign-out request itself failed', async () => {
    // `onSettled`, not `onSuccess` — the ADR-0075 security review's ruling, and it applies to the
    // store for the same reason it applies to the cache: the person pressed Sign out, and whether
    // the server-side session survived is not knowable from here.
    const { queryClient, wrapper } = harness();
    queryClient.setQueryData(sessionKeys.session, ME);
    rememberPlan(window.localStorage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    vi.mocked(authClient.signOut).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useSignOut(), { wrapper });
    result.current.mutate();

    await waitFor(() => {
      expect(readRecentPlanIds(window.localStorage, { userId: 'u1', orgSlug: 'acme' })).toEqual([]);
    });
  });
});
