import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssignmentFormValues } from '../schemas/resource-schemas';

import { useCreateAssignment, useDeleteAssignment } from './use-resources';

import { apiFetch } from '@/lib/api/client';
import { activityKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

function spiedClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
  const keys = () => invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
  return { qc, keys };
}

const ASSIGN = {
  resourceId: 'r1',
  budgetedUnits: 8,
  isDriving: false,
} as unknown as AssignmentFormValues;

/**
 * **An assignment write refreshes the plan's activity list, and nothing wider** (ADR-0162 decision 6,
 * spec E28). `resourceAssignmentCount` rides on the activity rows and gates Make milestone, so a stale
 * list would keep offering the action on a task that has just been resourced (or keep refusing it on
 * one that was just unassigned). The refresh is the plan's list only: `activityKeys.all` is
 * organisation-wide, and re-paging every plan in the organisation for one assignment is the cost the
 * plan rules out.
 */
describe('assignment writes refresh the resourced fact (ADR-0162)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue({}));

  it('useCreateAssignment invalidates the plan activity list, never activityKeys.all', async () => {
    const { qc, keys } = spiedClient();
    const { result } = renderHook(() => useCreateAssignment('acme', 'a1', 'p1'), {
      wrapper: wrapper(qc),
    });

    await result.current.mutateAsync(ASSIGN);

    expect(keys()).toContain(JSON.stringify(activityKeys.listByPlan('acme', 'p1')));
    expect(keys()).not.toContain(JSON.stringify(activityKeys.all('acme')));
  });

  it('useDeleteAssignment invalidates the plan activity list, never activityKeys.all', async () => {
    const { qc, keys } = spiedClient();
    const { result } = renderHook(() => useDeleteAssignment('acme', 'p1'), {
      wrapper: wrapper(qc),
    });

    await result.current.mutateAsync({ assignmentId: 'as1', activityId: 'a1' });

    expect(keys()).toContain(JSON.stringify(activityKeys.listByPlan('acme', 'p1')));
    expect(keys()).not.toContain(JSON.stringify(activityKeys.all('acme')));
  });
});
