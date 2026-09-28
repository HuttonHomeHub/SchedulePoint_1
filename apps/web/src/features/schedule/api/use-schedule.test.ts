import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRecalculate, useRecalculateCommand } from './use-schedule';

import { apiFetch } from '@/lib/api/client';
import {
  activityKeys,
  baselineKeys,
  dependencyKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

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

    // A recalc rewrites the engine-owned columns across the whole plan, so it invalidates the
    // summary, the activities list, the baseline variance, and the dependencies (where the M3
    // `isDriving` flag lives — else driving styling is stale after a reposition/create).
    const invalidatedKeys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    // It also sweeps the org-wide schedule namespace so a downstream cross-plan plan's pull-computed
    // staleness (ADR-0045 §5) refreshes after an upstream recalc.
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        JSON.stringify(scheduleKeys.summary('acme', 'p1')),
        JSON.stringify(scheduleKeys.all('acme')),
        JSON.stringify(activityKeys.listByPlan('acme', 'p1')),
        JSON.stringify(baselineKeys.variance('acme', 'p1')),
        JSON.stringify(dependencyKeys.byPlan('acme', 'p1')),
      ]),
    );
  });
});

describe('useRecalculateCommand', () => {
  it('keeps its identity across an unrelated re-render (the toolbar context lists it)', () => {
    // `useMutation` returns a fresh object every render, so a command that closed over it re-identified
    // every render and rebuilt the whole TSLD toolbar context with it (#353's performance review). Every
    // consumer test mocks this hook to a stable literal, so only a real QueryClient can show it.
    const queryClient = new QueryClient();
    const { result, rerender } = renderHook(() => useRecalculateCommand('acme', 'p1'), {
      wrapper: wrapper(queryClient),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.run).toBe(first.run);
  });
});
