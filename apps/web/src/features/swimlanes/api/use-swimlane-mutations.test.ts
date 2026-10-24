import type { SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateSwimlane,
  useDeleteSwimlane,
  useRenameSwimlane,
  useReorderSwimlanes,
  useRestoreSwimlane,
  useSetPlanSwimlaneSource,
} from './use-swimlane-mutations';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, planKeys, swimlaneKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

const ROW: SwimlaneSummary = {
  id: 's1',
  planId: 'p1',
  name: 'Mechanical',
  position: 0,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false, throwOnError: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, invalidate, wrapper };
}

const BASE = '/organizations/acme/plans/p1/swimlanes';

describe('the swimlane writes', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue(ROW));

  it.each([
    [
      'create',
      () => useCreateSwimlane('acme', 'p1'),
      { name: 'Civil', after: 's0' },
      BASE,
      { method: 'POST', body: JSON.stringify({ name: 'Civil', after: 's0' }) },
    ],
    [
      'rename',
      () => useRenameSwimlane('acme', 'p1'),
      { swimlaneId: 's1', name: 'Civil', version: 3 },
      `${BASE}/s1`,
      { method: 'PATCH', body: JSON.stringify({ name: 'Civil', version: 3 }) },
    ],
    [
      'reorder',
      () => useReorderSwimlanes('acme', 'p1'),
      { order: [{ id: 's1', version: 3 }] },
      `${BASE}/order`,
      { method: 'PATCH', body: JSON.stringify({ order: [{ id: 's1', version: 3 }] }) },
    ],
    [
      'delete (versioned)',
      () => useDeleteSwimlane('acme', 'p1'),
      { swimlaneId: 's1', version: 3 },
      `${BASE}/s1?version=3`,
      { method: 'DELETE' },
    ],
    [
      'delete (unversioned)',
      () => useDeleteSwimlane('acme', 'p1'),
      { swimlaneId: 's1' },
      `${BASE}/s1`,
      { method: 'DELETE' },
    ],
    [
      'restore',
      () => useRestoreSwimlane('acme', 'p1'),
      { swimlaneId: 's1' },
      `${BASE}/s1/restore`,
      { method: 'POST' },
    ],
  ] as const)(
    '%s calls the endpoint and refreshes the list AND the activities',
    async (_n, hook, input, path, init) => {
      const { invalidate, wrapper } = setup();
      const { result } = renderHook(hook as () => { mutateAsync: (i: never) => Promise<unknown> }, {
        wrapper,
      });
      await act(() => result.current.mutateAsync(input as never));
      expect(apiFetch).toHaveBeenCalledWith(path, init);
      const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey);
      // The activity list too: membership counts and the "No swimlane" stack are derived from it.
      expect(keys).toContainEqual(swimlaneKeys.byPlan('acme', 'p1'));
      expect(keys).toContainEqual(activityKeys.listByPlan('acme', 'p1'));
    },
  );

  it('still refreshes after a refusal, so the list shows what the server holds', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('409'));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRenameSwimlane('acme', 'p1'), { wrapper });
    const outcome = await result.current
      .mutateAsync({ swimlaneId: 's1', name: 'x', version: 1 })
      .then(
        () => 'ok',
        () => 'refused',
      );
    expect(outcome).toBe('refused');
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(
      swimlaneKeys.byPlan('acme', 'p1'),
    );
  });

  it('writes the plan source as a targeted PATCH and caches the returned plan', async () => {
    const plan = { id: 'p1', version: 8 };
    vi.mocked(apiFetch).mockResolvedValue(plan);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSetPlanSwimlaneSource('acme'), { wrapper });
    await act(() => result.current.mutateAsync({ planId: 'p1', version: 7, source: 'MANUAL' }));
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/plans/p1', {
      method: 'PATCH',
      body: JSON.stringify({ swimlaneSource: 'MANUAL', version: 7 }),
    });
    expect(queryClient.getQueryData(planKeys.detail('acme', 'p1'))).toEqual(plan);
  });
});
