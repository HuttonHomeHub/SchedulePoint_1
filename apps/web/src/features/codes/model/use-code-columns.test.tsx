import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCodeColumns } from './use-code-columns';

import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { CodeColumnsUnavailableError, NO_CODE_COLUMNS } from '@/lib/code-columns';
import { anActivity } from '@/test/activity-fixture';
import { codesServer, type CodesServer } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

let server: CodesServer;
let queryClient: QueryClient;
const write = vi.fn();

beforeEach(() => {
  server = codesServer();
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch).mockReset().mockImplementation(server.api.apiFetch);
  write.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

function render(requestedIds: readonly string[]) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    (props: { ids: readonly string[] }) =>
      useCodeColumns({ orgSlug: 'acme', planId: 'p1', requestedIds: props.ids, write }),
    { wrapper, initialProps: { ids: requestedIds } },
  );
}

describe('useCodeColumns', () => {
  it('shows nothing by default and asks for no values at all', async () => {
    const { result } = render([]);
    await waitFor(() => expect(result.current.choice.status).toBe('ready'));
    expect(result.current.columns).toBe(NO_CODE_COLUMNS);
    expect(result.current.choice.types.map((t) => t.name)).toEqual(['Area', 'Trade', 'Phase']);
    // The types list is the one request; a hidden type costs no values request.
    expect(server.readCount(/\/values/)).toBe(0);
  });

  it('loads only the shown types’ values, one request each, and then reads their names', async () => {
    const { result } = render(['trade', 'area']);
    await waitFor(() =>
      expect(result.current.columns.map((c) => c.status)).toEqual(['ready', 'ready']),
    );
    // Type order, whatever order the URL named them in.
    expect(result.current.columns.map((c) => c.label)).toEqual(['Area', 'Trade']);
    expect(server.readCount(/code-types\/area\/values/)).toBe(1);
    expect(server.readCount(/code-types\/trade\/values/)).toBe(1);
    expect(server.readCount(/code-types\/phase\/values/)).toBe(0);

    const [area, trade] = result.current.columns;
    const withBoth = anActivity({
      codes: [
        { codeTypeId: 'area', codeValueId: 'gf' },
        { codeTypeId: 'trade', codeValueId: 'mep' },
      ],
    });
    expect(area?.text(withBoth)).toBe('Ground floor');
    expect(trade?.text(withBoth)).toBe('Mechanical, electrical and plumbing');
    // None, and a value that is not among the live ones, read an em dash — never an id.
    expect(area?.text(anActivity())).toBe('—');
    expect(area?.text(anActivity({ codes: [{ codeTypeId: 'area', codeValueId: 'ghost' }] }))).toBe(
      '—',
    );
  });

  it('reads a value with no description by its short code', async () => {
    const { result } = render(['phase']);
    await waitFor(() => expect(result.current.columns[0]?.status).toBe('ready'));
    expect(
      result.current.columns[0]?.text(
        anActivity({ codes: [{ codeTypeId: 'phase', codeValueId: 'ph2' }] }),
      ),
    ).toBe('PH2');
  });

  it('drops a type that no longer exists and caps at ten', async () => {
    const many = {
      types: Array.from({ length: 12 }, (_, i) => ({
        ...server.types[0]!,
        id: `t${String(i)}`,
        name: `Type ${String(i)}`,
        position: i,
      })),
      values: [],
    };
    server = codesServer(many);
    vi.mocked(apiFetchAllPages).mockImplementation(server.api.apiFetchAllPages);
    vi.mocked(apiFetchEnvelope).mockImplementation(server.api.apiFetchEnvelope);
    const { result } = render(['gone', ...many.types.map((t) => t.id)]);
    await waitFor(() => expect(result.current.columns).toHaveLength(10));
    expect(result.current.choice.shownIds).toHaveLength(10);
    expect(result.current.choice.shownIds).not.toContain('gone');
  });

  it('keeps the same columns array across a render that changes nothing it reads', async () => {
    const { result, rerender } = render(['area']);
    await waitFor(() => expect(result.current.columns[0]?.status).toBe('ready'));
    const before = result.current.columns;
    const choice = result.current.choice;
    rerender({ ids: ['area'] });
    expect(result.current.columns).toBe(before);
    expect(result.current.choice).toBe(choice);
  });

  it('reads Loading… while a type’s values load', async () => {
    vi.mocked(apiFetchEnvelope).mockImplementation(() => new Promise(() => undefined));
    const { result } = render(['area']);
    await waitFor(() => expect(result.current.columns).toHaveLength(1));
    expect(result.current.columns[0]?.status).toBe('loading');
  });

  it('reads Unavailable when a type’s values could not be loaded', async () => {
    vi.mocked(apiFetchEnvelope).mockRejectedValue(new Error('offline'));
    const { result } = render(['area']);
    await waitFor(() => expect(result.current.columns[0]?.status).toBe('error'), { timeout: 5000 });
  });

  it('reports the types list failing, rather than an empty list', async () => {
    vi.mocked(apiFetchAllPages).mockRejectedValue(new Error('offline'));
    const { result } = render([]);
    await waitFor(() => expect(result.current.choice.status).toBe('error'), { timeout: 5000 });
  });

  it('writes the chosen ids in type order, capped', async () => {
    const { result } = render([]);
    await waitFor(() => expect(result.current.choice.status).toBe('ready'));
    act(() => result.current.choice.setShown(['phase', 'area']));
    expect(write).toHaveBeenCalledExactlyOnceWith('area,phase');
  });

  describe('resolving the columns for print', () => {
    it('hands back ready columns without a request when the values are cached', async () => {
      const { result } = render(['area']);
      await waitFor(() => expect(result.current.columns[0]?.status).toBe('ready'));
      const before = server.readCount(/values/);
      const printable = await result.current.resolvePrintColumns();
      expect(printable.map((c) => [c.label, c.status])).toEqual([['Area', 'ready']]);
      expect(server.readCount(/values/)).toBe(before);
    });

    it('waits for a type that is still loading rather than printing Loading…', async () => {
      const { result } = render(['area']);
      await waitFor(() => expect(result.current.columns).toHaveLength(1));
      const printable = await result.current.resolvePrintColumns();
      expect(printable[0]?.status).toBe('ready');
      expect(
        printable[0]?.text(anActivity({ codes: [{ codeTypeId: 'area', codeValueId: 'rf' }] })),
      ).toBe('Roof');
    });

    it('rejects naming every type whose values could not be loaded, so nothing prints', async () => {
      vi.mocked(apiFetchEnvelope).mockRejectedValue(new Error('offline'));
      const { result } = render(['area', 'trade']);
      await waitFor(
        () => expect(result.current.columns.map((c) => c.status)).toEqual(['error', 'error']),
        { timeout: 5000 },
      );
      const failure = await result.current.resolvePrintColumns().catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(CodeColumnsUnavailableError);
      expect((failure as CodeColumnsUnavailableError).typeNames).toEqual(['Area', 'Trade']);
    });
  });
});
