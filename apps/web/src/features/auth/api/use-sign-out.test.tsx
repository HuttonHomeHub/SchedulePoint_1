import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionKeys, useSession, useSignOut } from '@/features/auth';
import { apiFetch } from '@/lib/api/client';

/**
 * Signing out must not ask the server whether we are signed in.
 *
 * **Reported from the deployed app's console:** clicking Sign out logged
 * `GET …/api/v1/me 401 (Unauthorized)`. Nothing was broken — `sessionQueryOptions` catches the 401
 * and resolves to `null` — but the browser reports the failed request at the network layer, and the
 * request should never have been made: `useSignOut` set the session to `null` and then invalidated
 * that same key, forcing a refetch with no cookie.
 *
 * The first assertion fails against the pre-fix hook. The second pins the other half of the fix —
 * the docblock always claimed sign-out clears all cached data, and only the session key was dropped,
 * leaving the previous person's plans in memory for whoever signs in next on that machine.
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn().mockResolvedValue({}) } }));

function harness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

afterEach(() => vi.clearAllMocks());

describe('signing out', () => {
  it('does not re-request /me to learn what it just decided', async () => {
    const { queryClient, wrapper } = harness();
    queryClient.setQueryData(sessionKeys.session, { user: { id: 'u1' } });

    // `useSession` is mounted alongside, and that is load-bearing rather than set dressing:
    // `invalidateQueries` only refetches a query that has an ACTIVE OBSERVER. Without this the old
    // code issues no request either, and this test passes against the defect it exists to catch —
    // which is how it was first written.
    const { result } = renderHook(
      () => {
        useSession();
        return useSignOut();
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isIdle).toBe(true));
    vi.mocked(apiFetch).mockClear();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(sessionKeys.session)).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('drops the previous session’s cached data', async () => {
    const { queryClient, wrapper } = harness();
    queryClient.setQueryData(['plans', 'acme'], [{ id: 'p1', name: 'Unit 300' }]);

    const { result } = renderHook(() => useSignOut(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['plans', 'acme'])).toBeUndefined();
  });
});
