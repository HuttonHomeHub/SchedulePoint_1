import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { clickRowAction, openRowActions } from '@/test/row-actions';

import { AnnouncerProvider } from '@/components/ui/announcer';

import { clientKeys } from '../api/use-clients';

import { ClientsTable } from './ClientsTable';

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
