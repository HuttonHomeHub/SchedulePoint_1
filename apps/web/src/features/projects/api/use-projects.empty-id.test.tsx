import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useClient } from '@/features/clients';
import { useProject } from '@/features/projects';
import { apiFetch } from '@/lib/api/client';

/**
 * The chained-detail reads must not fire with an empty id.
 *
 * **Found in production, in the browser console** (ADR-0074 M1 CSP observation window):
 * `GET …/organizations/wood-group/projects/ 404`. The plan workspace reads
 * `useProject(orgSlug, plan.data?.projectId ?? '')` and then `useClient(orgSlug,
 * project.data?.clientId ?? '')`, so on the first render — before the plan resolves — both ids are
 * `''`, the URL degrades to a collection path with a trailing slash, and the API answers 404. Two
 * wasted round trips and two console errors on every plan-workspace load.
 *
 * Both assertions fail against the pre-fix hooks, which passed the options straight to `useQuery`
 * with no `enabled`.
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function harness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

afterEach(() => vi.clearAllMocks());

describe('chained detail reads with an unresolved parent', () => {
  it('does not request a project until the id is known', async () => {
    const { result } = renderHook(() => useProject('acme', ''), { wrapper: harness().wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not request a client until the id is known', async () => {
    const { result } = renderHook(() => useClient('acme', ''), { wrapper: harness().wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('still requests once the id arrives', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'p1', name: 'Unit 300' });

    renderHook(() => useProject('acme', 'p1'), { wrapper: harness().wrapper });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/projects/p1'));
  });
});
