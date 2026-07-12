import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRecalculate } from './use-schedule';

import { apiFetch } from '@/lib/api/client';
import { dependencyKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('useRecalculate', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue({}));

  it('invalidates the dependency query on success so driving arrows re-style (M3)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useRecalculate('acme', 'p1'), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync();

    // `isDriving` lives on the dependency query; a recalc rewrites it, so recalc must
    // invalidate the dependency cache (else driving styling is stale after a reposition/create).
    const invalidatedKeys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(dependencyKeys.byPlan('acme', 'p1')));
  });
});
