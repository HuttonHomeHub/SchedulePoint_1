import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('ClientsTable', () => {
  it('renders each client as a link, with edit/delete actions for writers', () => {
    renderTable(true);

    expect(screen.getByRole('link', { name: 'Northgate' })).toBeInTheDocument();
    expect(screen.getByText('Retail fit-out')).toBeInTheDocument();
    // Null description renders a placeholder.
    expect(screen.getByRole('button', { name: 'Edit Harbour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Northgate' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers', () => {
    renderTable(false);

    expect(screen.getByRole('link', { name: 'Northgate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Harbour' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Northgate' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no clients', () => {
    renderTable(true, []);
    expect(screen.getByText(/No clients yet/)).toBeInTheDocument();
  });

  it('confirms before deleting (no immediate destructive action)', () => {
    renderTable(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Northgate' }));
    // A confirm dialog appears rather than deleting straight away.
    expect(screen.getByRole('heading', { name: 'Delete client' })).toBeInTheDocument();
    expect(
      screen.getByText(/Delete .*Northgate.* and all its projects and plans/),
    ).toBeInTheDocument();
  });
});
