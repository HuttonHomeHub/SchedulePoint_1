import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateDependency, useDeleteDependency, useUpdateDependency } from './use-dependencies';

import { apiFetch } from '@/lib/api/client';
import { activityHistoryKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

/**
 * A link write is recorded on BOTH of its activities (ADR-0174), and the mutation does not know which
 * two are open in a History tab, so every link write drops the organisation's history cache.
 */
describe('link writes invalidate the activity history', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue({}));

  it.each([
    [
      'create',
      () => useCreateDependency('acme'),
      (m: ReturnType<typeof useCreateDependency>) =>
        m.mutateAsync({
          planId: 'p1',
          predecessorId: 'a',
          successorId: 'b',
          type: 'FS',
          lagDays: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
    ],
    [
      'update',
      () => useUpdateDependency('acme'),
      (m: ReturnType<typeof useUpdateDependency>) =>
        m.mutateAsync({
          dependencyId: 'd1',
          type: 'FS',
          lagDays: 1,
          lagCalendar: 'PROJECT_DEFAULT',
          version: 1,
        }),
    ],
    [
      'delete',
      () => useDeleteDependency('acme'),
      (m: ReturnType<typeof useDeleteDependency>) => m.mutateAsync('d1'),
    ],
  ] as const)('%s', async (_name, useHook, run) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useHook() as never, { wrapper: wrapper(qc) });
    await (run as (m: unknown) => Promise<unknown>)(result.current);
    const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toContain(JSON.stringify(activityHistoryKeys.all('acme')));
  });
});
