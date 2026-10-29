import type { CodeTypeSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCodeTypes, useDeletedCodeTypes } from './use-code-types';

import { apiFetchAllPages } from '@/lib/api/client';
import { codeKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: vi.fn(),
}));

const type = (id: string, deletedAt: string | null = null): CodeTypeSummary => ({
  id,
  planId: 'p1',
  name: id,
  position: 0,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt,
  valueCount: 4,
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

const client = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useCodeTypes', () => {
  beforeEach(() =>
    vi
      .mocked(apiFetchAllPages)
      .mockReset()
      .mockResolvedValue([type('area')]),
  );

  it('reads the types without their values, under the plan-scoped key', async () => {
    const qc = client();
    const { result } = renderHook(() => useCodeTypes('acme', 'p1'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data).toEqual([type('area')]));
    // `values=none` is the point: the default nests every value of every type, 2.6 s at the caps.
    expect(apiFetchAllPages).toHaveBeenCalledWith(
      '/organizations/acme/plans/p1/code-types?values=none',
    );
    expect(qc.getQueryData(codeKeys.types('acme', 'p1'))).toEqual([type('area')]);
  });

  it('fetches nothing while it is not enabled', () => {
    const { result } = renderHook(() => useCodeTypes('acme', 'p1', false), {
      wrapper: wrapper(client()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiFetchAllPages).not.toHaveBeenCalled();
  });
});

describe('useDeletedCodeTypes', () => {
  it('asks for the deleted rows and keeps only those, since include=deleted adds them to the live ones', async () => {
    vi.mocked(apiFetchAllPages)
      .mockReset()
      .mockResolvedValue([type('area'), type('old', '2026-10-01T00:00:00Z')]);
    const { result } = renderHook(() => useDeletedCodeTypes('acme', 'p1', true), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['old']));
    expect(apiFetchAllPages).toHaveBeenCalledWith(
      '/organizations/acme/plans/p1/code-types?values=none&include=deleted',
    );
  });

  it('is not read until the disclosure is open', () => {
    vi.mocked(apiFetchAllPages).mockReset();
    const { result } = renderHook(() => useDeletedCodeTypes('acme', 'p1', false), {
      wrapper: wrapper(client()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiFetchAllPages).not.toHaveBeenCalled();
  });
});

describe('codeKeys', () => {
  it('keys a type’s values apart from the type list and from another type’s values', () => {
    expect(codeKeys.values('acme', 'p1', 'a')).not.toEqual(codeKeys.values('acme', 'p1', 'b'));
    expect(codeKeys.values('acme', 'p1', 'a').slice(0, 4)).toEqual(codeKeys.byPlan('acme', 'p1'));
    expect(codeKeys.types('acme', 'p1').slice(0, 4)).toEqual(codeKeys.byPlan('acme', 'p1'));
  });

  it('sorts the ids of a name lookup so the same set is the same key', () => {
    expect(codeKeys.names('acme', 'p1', ['b', 'a'])).toEqual(
      codeKeys.names('acme', 'p1', ['a', 'b']),
    );
  });
});
