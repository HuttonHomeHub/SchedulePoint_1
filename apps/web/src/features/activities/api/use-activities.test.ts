import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActivityFormValues } from '../schemas/activity-schemas';

import { useCreateActivity, useDeleteActivity, useUpdateActivity } from './use-activities';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, baselineKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

/** A minimal valid-enough activity form for the mutation body builders (apiFetch is mocked). */
const FORM = { name: 'Excavate', type: 'TASK', durationDays: 3 } as unknown as ActivityFormValues;

describe('use-activities invalidation shapes (#24e)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue({}));

  it('useUpdateActivity invalidates the list + that activity’s detail', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useUpdateActivity('acme', 'p1'), { wrapper: wrapper(qc) });

    await result.current.mutateAsync({ activityId: 'a1', version: 1, ...FORM });

    const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(activityKeys.listByPlan('acme', 'p1')),
        JSON.stringify(activityKeys.detail('acme', 'a1')),
      ]),
    );
  });

  it('useCreateActivity invalidates the list + baseline variance', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useCreateActivity('acme', 'p1'), { wrapper: wrapper(qc) });

    await result.current.mutateAsync(FORM);

    const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(activityKeys.listByPlan('acme', 'p1')),
        JSON.stringify(baselineKeys.variance('acme', 'p1')),
      ]),
    );
  });

  it('useDeleteActivity invalidates the list + baseline variance', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDeleteActivity('acme', 'p1'), { wrapper: wrapper(qc) });

    await result.current.mutateAsync('a1');

    const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(activityKeys.listByPlan('acme', 'p1')),
        JSON.stringify(baselineKeys.variance('acme', 'p1')),
      ]),
    );
  });
});
