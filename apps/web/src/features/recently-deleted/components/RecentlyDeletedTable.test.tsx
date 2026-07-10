import type { DeletedHierarchyItem } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { deletedItemKeys } from '../api/use-deleted-items';

import { RecentlyDeletedTable } from './RecentlyDeletedTable';

const ITEMS: DeletedHierarchyItem[] = [
  {
    kind: 'client',
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Northgate',
    deletedAt: '2026-07-10T09:00:00.000Z',
    canRestore: true,
  },
  {
    kind: 'plan',
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Baseline',
    deletedAt: '2026-07-10T08:00:00.000Z',
    canRestore: false,
  },
];

function renderTable(canWrite: boolean, data: DeletedHierarchyItem[] = ITEMS) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(deletedItemKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <RecentlyDeletedTable orgSlug="acme" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

describe('RecentlyDeletedTable', () => {
  it('lists deleted items with their type and name', () => {
    renderTable(true);
    expect(screen.getByText('Northgate')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });

  it('offers Restore for a restorable item', () => {
    renderTable(true);
    expect(screen.getByRole('button', { name: 'Restore client Northgate' })).toBeInTheDocument();
  });

  it('guides the user to restore the parent first when an ancestor is still deleted', () => {
    renderTable(true);
    expect(screen.queryByRole('button', { name: 'Restore plan Baseline' })).not.toBeInTheDocument();
    expect(screen.getByText('Restore its parent first')).toBeInTheDocument();
  });

  it('hides restore actions entirely for non-writers', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Restore its parent first')).not.toBeInTheDocument();
    // The read-only list still shows the items.
    expect(screen.getByText('Northgate')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is deleted', () => {
    renderTable(true, []);
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
  });
});
