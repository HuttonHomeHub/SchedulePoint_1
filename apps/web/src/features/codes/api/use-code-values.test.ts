import type { CodeValueSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCodeValues, useDeletedCodeValues } from './use-code-values';

import { apiFetchEnvelope } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchEnvelope: vi.fn(),
}));

const value = (id: string, deletedAt: string | null = null): CodeValueSummary => ({
  id,
  codeTypeId: 'area',
  shortCode: id,
  description: null,
  position: 0,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt,
});

function wrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

const client = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useCodeValues', () => {
  beforeEach(() => vi.mocked(apiFetchEnvelope).mockReset());

  it('reads a type’s whole live list in ONE request, asking for the per-type cap rather than 100', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [value('l1'), value('l2')],
      meta: { nextCursor: null, hasMore: false },
    });
    const { result } = renderHook(() => useCodeValues('acme', 'p1', 'area'), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['l1', 'l2']));
    expect(apiFetchEnvelope).toHaveBeenCalledTimes(1);
    expect(apiFetchEnvelope).toHaveBeenCalledWith(
      '/organizations/acme/plans/p1/code-types/area/values?limit=1000',
    );
  });

  it('follows the cursor to the end when a page says there is more', async () => {
    vi.mocked(apiFetchEnvelope)
      .mockResolvedValueOnce({ data: [value('l1')], meta: { nextCursor: 'c1', hasMore: true } })
      .mockResolvedValueOnce({ data: [value('l2')], meta: { nextCursor: null, hasMore: false } });
    const { result } = renderHook(() => useCodeValues('acme', 'p1', 'area'), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['l1', 'l2']));
    expect(vi.mocked(apiFetchEnvelope).mock.calls[1]?.[0]).toBe(
      '/organizations/acme/plans/p1/code-types/area/values?limit=1000&cursor=c1',
    );
  });

  it('fetches nothing without a type, or while disabled', () => {
    const none = renderHook(() => useCodeValues('acme', 'p1', undefined), {
      wrapper: wrapper(client()),
    });
    const off = renderHook(() => useCodeValues('acme', 'p1', 'area', false), {
      wrapper: wrapper(client()),
    });
    expect(none.result.current.fetchStatus).toBe('idle');
    expect(off.result.current.fetchStatus).toBe('idle');
    expect(apiFetchEnvelope).not.toHaveBeenCalled();
  });

  it('reads only the types that are asked for: two types, two requests, none for a third', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { nextCursor: null, hasMore: false },
    });
    const qc = client();
    const a = renderHook(() => useCodeValues('acme', 'p1', 'a'), { wrapper: wrapper(qc) });
    const b = renderHook(() => useCodeValues('acme', 'p1', 'b'), { wrapper: wrapper(qc) });
    await waitFor(() =>
      expect(a.result.current.isSuccess && b.result.current.isSuccess).toBe(true),
    );
    expect(apiFetchEnvelope).toHaveBeenCalledTimes(2);
  });
});

describe('useDeletedCodeValues', () => {
  it('asks include=deleted and keeps only the deleted rows', async () => {
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockResolvedValue({
        data: [value('l1'), value('old', '2026-10-01T00:00:00Z')],
        meta: { nextCursor: null, hasMore: false },
      });
    const { result } = renderHook(() => useDeletedCodeValues('acme', 'p1', 'area', true), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['old']));
    expect(apiFetchEnvelope).toHaveBeenCalledWith(
      '/organizations/acme/plans/p1/code-types/area/values?include=deleted&limit=1000',
    );
  });
});
