import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeleteActivity, useDissolveSummary } from '@/features/activities/api/use-activities';
import { useDeleteDependency } from '@/features/dependencies/api/use-dependencies';
import { useDeleteAssignment } from '@/features/resources/api/use-resources';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

/**
 * The wire shape of the optional version (`docs/API.md` "Single-row deletes take an optional
 * `version`"): a query parameter on the three `DELETE`s, a body on dissolve, and nothing at all when
 * the caller holds none — an unguarded delete must stay byte-identical to what it always was.
 */
describe('a guarded delete puts its version on the wire', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue({}));

  it('activity: ?version=N when given, nothing when not', async () => {
    const { result } = renderHook(() => useDeleteActivity('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync('a1');
    await result.current.mutateAsync({ activityId: 'a1', version: 4 });
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/organizations/acme/activities/a1',
      '/organizations/acme/activities/a1?version=4',
    ]);
  });

  it('dependency: ?version=N when given, nothing when not', async () => {
    const { result } = renderHook(() => useDeleteDependency('acme'), { wrapper: wrapper() });
    await result.current.mutateAsync('d1');
    await result.current.mutateAsync({ dependencyId: 'd1', version: 2 });
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/organizations/acme/dependencies/d1',
      '/organizations/acme/dependencies/d1?version=2',
    ]);
  });

  it('assignment: ?version=N when given, nothing when not', async () => {
    const { result } = renderHook(() => useDeleteAssignment('acme', 'p1'), {
      wrapper: wrapper(),
    });
    await result.current.mutateAsync({ assignmentId: 'as1', activityId: 'a1' });
    await result.current.mutateAsync({ assignmentId: 'as1', activityId: 'a1', version: 3 });
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/organizations/acme/assignments/as1',
      '/organizations/acme/assignments/as1?version=3',
    ]);
  });

  it('dissolve: { version } in the body when given, no body when not', async () => {
    const { result } = renderHook(() => useDissolveSummary('acme', 'p1'), { wrapper: wrapper() });
    await result.current.mutateAsync('s1');
    await result.current.mutateAsync({ activityId: 's1', version: 5 });
    const calls = vi.mocked(apiFetch).mock.calls;
    expect(calls[0]).toEqual(['/organizations/acme/activities/s1/dissolve', { method: 'POST' }]);
    expect(calls[1]).toEqual([
      '/organizations/acme/activities/s1/dissolve',
      { method: 'POST', body: JSON.stringify({ version: 5 }) },
    ]);
  });
});
