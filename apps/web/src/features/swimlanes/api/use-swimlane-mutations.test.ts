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
    '%s calls the endpoint and refreshes the swimlane list (and the activities only for a delete or restore)',
    async (_n, hook, input, path, init) => {
      const { invalidate, wrapper } = setup();
      const { result } = renderHook(hook as () => { mutateAsync: (i: never) => Promise<unknown> }, {
        wrapper,
      });
      await act(() => result.current.mutateAsync(input as never));
      expect(apiFetch).toHaveBeenCalledWith(path, init);
      const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey);
      expect(keys).toContainEqual(swimlaneKeys.byPlan('acme', 'p1'));
      // The activity list only where a member's swimlane changes under it: a delete and its restore.
      // A create, a rename and a reorder move no member, and the list can be thousands of rows.
      expect(keys).toHaveLength(/delete|restore/.test(_n) ? 2 : 1);
      expect(
        keys.some(
          (k) => JSON.stringify(k) === JSON.stringify(activityKeys.listByPlan('acme', 'p1')),
        ),
      ).toBe(/delete|restore/.test(_n));
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

  it('names the level only with a WBS source, which is the only source that has one', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'p1', version: 9 });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetPlanSwimlaneSource('acme'), { wrapper });
    await act(() =>
      result.current.mutateAsync({ planId: 'p1', version: 8, source: 'WBS', level: 2 }),
    );
    expect(apiFetch).toHaveBeenLastCalledWith('/organizations/acme/plans/p1', {
      method: 'PATCH',
      body: JSON.stringify({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2, version: 8 }),
    });
    // Back to hand-made: no level is sent, and the server clears the one it holds.
    await act(() =>
      result.current.mutateAsync({ planId: 'p1', version: 9, source: 'MANUAL', level: 2 }),
    );
    expect(apiFetch).toHaveBeenLastCalledWith('/organizations/acme/plans/p1', {
      method: 'PATCH',
      body: JSON.stringify({ swimlaneSource: 'MANUAL', version: 9 }),
    });
  });

  it('names the code type only with a code source, and sends no lane and no level with it', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'p1', version: 10 });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetPlanSwimlaneSource('acme'), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        planId: 'p1',
        version: 9,
        source: 'ACTIVITY_CODE',
        level: 2,
        codeTypeId: 'area',
      }),
    );
    expect(apiFetch).toHaveBeenLastCalledWith('/organizations/acme/plans/p1', {
      method: 'PATCH',
      body: JSON.stringify({
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: 'area',
        version: 9,
      }),
    });
    // Leaving the code names none; the server clears the one it holds.
    await act(() =>
      result.current.mutateAsync({
        planId: 'p1',
        version: 10,
        source: 'MANUAL',
        codeTypeId: 'area',
      }),
    );
    expect(apiFetch).toHaveBeenLastCalledWith('/organizations/acme/plans/p1', {
      method: 'PATCH',
      body: JSON.stringify({ swimlaneSource: 'MANUAL', version: 10 }),
    });
    // One request per switch: no activity list, lane or code is read or written by it.
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
