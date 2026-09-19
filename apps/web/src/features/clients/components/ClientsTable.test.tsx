import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { clientKeys } from '../api/use-clients';

import { ClientsTable } from './ClientsTable';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { formatTimestamp } from '@/lib/format-date';
import { clickRowAction, openRowActions } from '@/test/row-actions';

// Stub the router Link so the table renders without a full router context.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  }) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

const CLIENTS: ClientSummary[] = [
  {
    id: 'c1',
    name: 'Northgate',
    description: 'Retail fit-out',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c2',
    name: 'Harbour',
    description: null,
    version: 2,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function renderTable(canWrite: boolean, data: ClientSummary[] = CLIENTS) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(clientKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientsTable orgSlug="acme" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

/**
 * The searched table, with the screen's URL-backed filter state played by `useState` — the table
 * is deliberately router-free and takes `filters`/`onFiltersChange` as props, so this is the real
 * contract rather than a stand-in. Two cache entries are seeded because a searched view and the
 * full list are **separate keys** (`clientsQueryOptions`), which is what stops the rail and the
 * pickers inheriting somebody's search term.
 */
function renderSearchable(matches: ClientSummary[]) {
  // `staleTime: Infinity` so the seeded entries are FRESH and no request is made. Without it the
  // query refetches against an unmocked `fetch`, `isFetching` never settles, and the result-count
  // hook — which deliberately speaks only once a query has settled — correctly says nothing. The
  // first version of this test failed for exactly that reason, against a working product.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(clientKeys.list('acme'), CLIENTS);
  queryClient.setQueryData([...clientKeys.list('acme'), 'q', 'zzz'], matches);

  function Harness(): React.ReactElement {
    const [q, setQ] = useState('');
    return (
      <ClientsTable
        orgSlug="acme"
        canWrite
        filters={{ q }}
        onFiltersChange={(patch) => setQ(patch.q)}
      />
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <Harness />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('ClientsTable', () => {
  /**
   * **WCAG 4.1.3 Status Messages**, and the reason it is asserted here rather than assumed: both
   * sibling library tables have announced their settled result count since ADR-0053 M6 and this one
   * did not, so a screen-reader user typing into Search clients heard nothing at all — one correct
   * pattern applied to a control and not its neighbour, found by the M8 accessibility gate.
   */
  it('announces the settled result count when the search narrows the list', async () => {
    renderSearchable([]);

    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'zzz' } });

    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('No clients match this search.'),
    );
  });

  /**
   * **A control that removes itself by succeeding must hand focus somewhere.**
   *
   * The empty state's `Clear filters` unmounts the instant rows return, and focus fell to `<body>`
   * — which on this screen silently ends keyboard navigation. The bar's copy does NOT have this
   * problem, because it is always mounted and shaded; the reasoning had been applied to that one
   * and never to this one (M8 accessibility gate, reproduced in a browser before it was believed).
   */
  it('hands focus to the list when the empty state\u2019s Clear filters brings the rows back', async () => {
    renderSearchable([]);

    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'zzz' } });
    const clear = await screen.findByRole('button', {
      name: 'Clear filters and show all clients',
    });

    clear.focus();
    fireEvent.click(clear);

    await waitFor(() => expect(screen.getByText('Northgate')).toBeInTheDocument());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
  });

  it('renders each client as a link, with edit/delete actions for writers', () => {
    renderTable(true);

    expect(screen.getByRole('link', { name: 'Northgate' })).toBeInTheDocument();
    expect(screen.getByText('Retail fit-out')).toBeInTheDocument();
    // Null description renders a placeholder.
    expect(screen.getByRole('button', { name: 'Edit Harbour' })).toBeInTheDocument();
    expect(
      within(openRowActions('Northgate', 'Clients')).getByRole('menuitem', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);

    expect(screen.getByRole('link', { name: 'Northgate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Harbour' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Northgate in Clients' }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no clients', () => {
    renderTable(true, []);
    expect(screen.getByText(/No clients yet/)).toBeInTheDocument();
  });

  it('confirms before deleting (no immediate destructive action)', async () => {
    renderTable(true);
    await clickRowAction('Northgate', 'Delete', 'Clients');
    // A confirm dialog appears rather than deleting straight away.
    expect(screen.getByRole('heading', { name: 'Delete client' })).toBeInTheDocument();
    expect(
      screen.getByText(/Delete .*Northgate.* and all its projects and plans/),
    ).toBeInTheDocument();
  });
});

/**
 * **The column set is a property of the SCREEN, never of the page of data in front of you.**
 *
 * ADR-0146 D4 moved `Description` off this table and under the row's name, because on a real
 * installation every cell in it read "—" while the columns beside it wrapped. The obvious next
 * thought — show the column only when some row has a description — is the trap: a table whose
 * shape changes between page one and page two makes a reader re-learn it each time, and a column
 * that appears when you search and vanishes when you clear looks like a bug.
 *
 * So the assertion is a comparison rather than a list: the same headers with descriptions and
 * without. A test that merely named today's headers would pass just as well against a
 * data-dependent implementation that happened to agree on one fixture.
 */
describe('ClientsTable — the column set does not depend on the data', () => {
  const headersFor = (data: ClientSummary[]): string[] => {
    const view = renderTable(true, data);
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent ?? '');
    view.unmount();
    return headers;
  };

  it('is the same whether or not any row carries a description', () => {
    const withDescriptions = CLIENTS.map((c) => ({ ...c, description: 'Retail fit-out' }));
    const withNone = CLIENTS.map((c) => ({ ...c, description: null }));

    expect(headersFor(withNone)).toEqual(headersFor(withDescriptions));
  });

  it('shows a description under the name when there is one, and nothing when there is not', () => {
    renderTable(true, [
      { ...CLIENTS[0]!, name: 'Northgate', description: 'Retail fit-out' },
      { ...CLIENTS[1]!, name: 'Harbour', description: null },
    ]);
    const rows = screen.getAllByRole('row');
    const northgate = rows.find((r) => r.textContent?.includes('Northgate'))!;
    const harbour = rows.find((r) => r.textContent?.includes('Harbour'))!;

    expect(within(northgate).getByText('Retail fit-out')).toBeInTheDocument();
    // Not "—": an em dash on a secondary line is the same defect one row lower down.
    expect(harbour.textContent).not.toContain('—');
  });
});

describe('ClientsTable — Created', () => {
  /**
   * **`createdAt` was on the wire and unrendered**, on the sparsest table in the product: after
   * ADR-0146 D4 moved the description under the name this table rendered `Name` at 870px for 177px
   * of content and `Actions` at 401px for 82px, inside 1271px — 1012px of slack and a `factSpread`
   * of literally `0` (`docs/specs/unrendered-row-facts/m1/README.md` §2).
   */
  it('renders a Created column carrying the date, between Name and Actions', () => {
    renderTable(true, [
      { ...CLIENTS[0]!, name: 'Northgate', createdAt: '2026-03-04T09:00:00.000Z' },
    ]);

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent ?? '');
    expect(headers).toEqual(['Name', 'Created', 'Actions']);

    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Northgate'))!;
    expect(within(row).getByText(formatTimestamp('2026-03-04T09:00:00.000Z'))).toBeInTheDocument();
  });

  it('renders it for a Viewer too, who otherwise sees a table of ONE column', () => {
    // `Actions` is inside `if (canWrite)`, so before this column a Viewer's Clients table had a
    // single column — the state the spec's "exactly two columns" reading missed, and the reader
    // with the least on screen.
    renderTable(false, [{ ...CLIENTS[0]!, name: 'Northgate' }]);

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent ?? '');
    expect(headers).toEqual(['Name', 'Created']);
  });

  it('uses the shared formatter rather than the browser locale', () => {
    // ADR-0144's gate pass records the real defect this prevents: a date beside a date, one
    // formatted by a per-render `Intl.DateTimeFormat` in the browser's locale and one in en-GB.
    // Asserting the shared helper's own output is what makes that checkable rather than asserted.
    const iso = '2026-12-25T13:45:00.000Z';
    renderTable(true, [{ ...CLIENTS[0]!, name: 'Northgate', createdAt: iso }]);

    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Northgate'))!;
    expect(row.textContent).toContain(formatTimestamp(iso));
  });
});
