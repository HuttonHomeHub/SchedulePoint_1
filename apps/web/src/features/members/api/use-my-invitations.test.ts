import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { myInvitationKeys, useAcceptMyInvitation, useMyInvitations } from './use-my-invitations';

import { sessionKeys } from '@/features/auth';
import { organizationKeys } from '@/features/organizations';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn(), apiFetchAllPages: vi.fn() };
});

function wrapperFor(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

afterEach(() => vi.restoreAllMocks());

describe('useMyInvitations', () => {
  it('reads every page of /me/invitations', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([{ id: 'i1' }]);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useMyInvitations(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'i1' }]));
    expect(apiFetchAllPages).toHaveBeenCalledWith('/me/invitations');
  });

  it('settles a failed read as none, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(apiFetchAllPages).mockRejectedValue(new Error('down'));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useMyInvitations(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(log).toHaveBeenCalled();
  });
});

describe('useAcceptMyInvitation', () => {
  it('posts the id with no body and refreshes session, organisations and the list', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ slug: 'acme' });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAcceptMyInvitation(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate('i1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith('/me/invitations/i1/accept', { method: 'POST' });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([organizationKeys.all, sessionKeys.session, myInvitationKeys.all]),
    );
  });
});
