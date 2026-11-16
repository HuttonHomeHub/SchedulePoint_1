import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCreateProject, useDeleteProject } from './use-projects';

import { apiFetch } from '@/lib/api/client';
import { clientKeys, projectKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

function setup<T>(useHook: () => T) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const rendered = renderHook(useHook, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  const keys = () => invalidate.mock.calls.map(([filter]) => filter?.queryKey);
  return { ...rendered, keys };
}

describe('useCreateProject', () => {
  it('refreshes the client read whose projectCount the client page prints', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'p2' });
    const { result, keys } = setup(() => useCreateProject('acme', 'c1'));

    act(() => {
      result.current.mutate({ name: 'New' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContainEqual(clientKeys.detail('acme', 'c1'));
    expect(keys()).toContainEqual(projectKeys.listByClient('acme', 'c1'));
  });
});

describe('useDeleteProject', () => {
  it('refreshes the client read whose projectCount the client page prints', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { result, keys } = setup(() => useDeleteProject('acme', 'c1'));

    act(() => {
      result.current.mutate('p1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContainEqual(clientKeys.detail('acme', 'c1'));
  });
});
