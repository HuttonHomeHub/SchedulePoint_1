import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTableCodeColumns } from './use-table-code-columns';

import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { codesServer } from '@/test/codes-server';

/**
 * The URL is the one place the table's choice lives, so the round trip is the contract: what
 * `setShown` writes is what the next read resolves to. The router-bound filter hook is replaced by a
 * small in-memory one with the same signature, because the hook under test needs a router only for
 * that storage.
 */
let stored: Record<string, string> = {};
const listeners = new Set<() => void>();

vi.mock('@/hooks/use-url-filter-state', async () => {
  const { useState, useEffect } = await import('react');
  return {
    useUrlFilterState: (
      defaults: Record<string, string>,
      parse: (raw: Record<string, unknown>) => Record<string, string>,
    ) => {
      const [, bump] = useState(0);
      useEffect(() => {
        const l = () => bump((n) => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
      }, []);
      const set = (next: Record<string, string>) => {
        stored = { ...stored, ...next };
        listeners.forEach((l) => l());
      };
      return [parse({ ...defaults, ...stored }), set];
    },
  };
});

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

beforeEach(() => {
  stored = {};
  const server = codesServer();
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch).mockReset().mockImplementation(server.api.apiFetch);
});

function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useTableCodeColumns('acme', 'p1'), { wrapper });
}

describe('useTableCodeColumns', () => {
  it('shows nothing when acodes is absent', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.choice.status).toBe('ready'));
    expect(result.current.choice.shownIds).toEqual([]);
  });

  it('reads acodes, in type order, ignoring what is not a live type', async () => {
    stored = { acodes: 'trade,gone,area' };
    const { result } = render();
    await waitFor(() => expect(result.current.choice.shownIds).toEqual(['area', 'trade']));
  });

  it('writes the shown ids to acodes in type order and reads them back', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.choice.status).toBe('ready'));

    act(() => result.current.choice.setShown(['trade', 'area']));

    expect(stored['acodes']).toBe('area,trade');
    await waitFor(() => expect(result.current.choice.shownIds).toEqual(['area', 'trade']));

    act(() => result.current.choice.setShown([]));
    expect(stored['acodes']).toBe('');
    await waitFor(() => expect(result.current.choice.shownIds).toEqual([]));
  });
});
