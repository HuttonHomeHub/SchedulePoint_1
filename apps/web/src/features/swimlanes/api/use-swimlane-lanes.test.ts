import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWriteSwimlaneLanes } from './use-swimlane-lanes';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, swimlaneKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

/** Both lists cached and fresh, so "invalidated" is a fact about the write and not the seed. */
function seed(qc: QueryClient): void {
  qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), []);
  qc.setQueryData(swimlaneKeys.byPlan('acme', 'p1'), []);
}

describe('useWriteSwimlaneLanes', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue([]));

  it('sends swimlane rows to the positions endpoint and never a swimlane-free laneIndex (SC-1)', async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useWriteSwimlaneLanes('acme', 'p1'), {
      wrapper: wrapper(qc),
    });

    await act(() =>
      result.current.mutateAsync({
        positions: [
          { id: 'a1', version: 3, swimlane: { swimlaneId: 's2', laneIndex: 1 } },
          { id: 'a2', version: 1, swimlane: { laneIndex: 0 } },
        ],
      }),
    );

    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/activities/positions');
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(init?.body as string) as { positions: Record<string, unknown>[] };
    expect(body.positions).toEqual([
      { id: 'a1', version: 3, swimlane: { swimlaneId: 's2', laneIndex: 1 } },
      { id: 'a2', version: 1, swimlane: { laneIndex: 0 } },
    ]);
    for (const row of body.positions) expect(row).not.toHaveProperty('laneIndex');
  });

  it('invalidates both the activities list and the plan’s swimlane list', async () => {
    const qc = new QueryClient();
    seed(qc);
    const { result } = renderHook(() => useWriteSwimlaneLanes('acme', 'p1'), {
      wrapper: wrapper(qc),
    });

    await act(() =>
      result.current.mutateAsync({
        positions: [{ id: 'a1', version: 1, swimlane: { laneIndex: 0 } }],
      }),
    );

    expect(qc.getQueryState(activityKeys.listByPlan('acme', 'p1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(swimlaneKeys.byPlan('acme', 'p1'))?.isInvalidated).toBe(true);
  });

  it('settles into both lists after a refused write too', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('409'));
    const qc = new QueryClient();
    seed(qc);
    const { result } = renderHook(() => useWriteSwimlaneLanes('acme', 'p1'), {
      wrapper: wrapper(qc),
    });

    await expect(
      result.current.mutateAsync({
        positions: [{ id: 'a1', version: 1, swimlane: { laneIndex: 0 } }],
      }),
    ).rejects.toThrow('409');

    expect(qc.getQueryState(activityKeys.listByPlan('acme', 'p1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(swimlaneKeys.byPlan('acme', 'p1'))?.isInvalidated).toBe(true);
  });
});
