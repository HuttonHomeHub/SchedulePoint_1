import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCreatePlan, useUpdatePlan } from './use-plans';

import { apiFetch } from '@/lib/api/client';
import { planKeys, projectKeys, scheduleKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

describe('useUpdatePlan', () => {
  it('refreshes the schedule summary, which the foot row’s Data date reads, with the plan', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'pl1' });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdatePlan('acme', 'p1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    act(() => {
      result.current.mutate({
        planId: 'pl1',
        version: 4,
        name: 'Baseline',
        status: 'ACTIVE',
        plannedStart: '2026-06-15',
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey);
    expect(keys).toContainEqual(scheduleKeys.summary('acme', 'pl1'));
    expect(keys).toContainEqual(planKeys.detail('acme', 'pl1'));
    expect(keys).toContainEqual(planKeys.listByProject('acme', 'p1'));
  });
});

describe('useCreatePlan', () => {
  it('refreshes the project read whose planCount the project page prints', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'pl2' });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreatePlan('acme', 'p1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    act(() => {
      result.current.mutate({ name: 'New', status: 'ACTIVE', plannedStart: '2026-06-15' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey);
    expect(keys).toContainEqual(projectKeys.detail('acme', 'p1'));
    expect(keys).toContainEqual(planKeys.listByProject('acme', 'p1'));
  });
});
