import type { SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { swimlaneKeys, useSwimlanes } from './use-swimlanes';

import { apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: vi.fn(),
}));

const ROW: SwimlaneSummary = {
  id: 's1',
  planId: 'p1',
  name: 'Mechanical',
  position: 0,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('useSwimlanes', () => {
  beforeEach(() => vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([ROW]));

  it('reads every page of the plan’s swimlanes under the plan-scoped key', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSwimlanes('acme', 'p1'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.data).toEqual([ROW]));
    expect(apiFetchAllPages).toHaveBeenCalledWith('/organizations/acme/plans/p1/swimlanes');
    expect(qc.getQueryData(swimlaneKeys.byPlan('acme', 'p1'))).toEqual([ROW]);
  });

  it('stays idle, fetching nothing, while it is not enabled', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSwimlanes('acme', 'p1', false), {
      wrapper: wrapper(qc),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiFetchAllPages).not.toHaveBeenCalled();
  });

  it('keys one plan apart from another, and both under the organisation prefix', () => {
    expect(swimlaneKeys.byPlan('acme', 'p1')).not.toEqual(swimlaneKeys.byPlan('acme', 'p2'));
    expect(swimlaneKeys.byPlan('acme', 'p1').slice(0, 2)).toEqual(swimlaneKeys.all('acme'));
  });
});
