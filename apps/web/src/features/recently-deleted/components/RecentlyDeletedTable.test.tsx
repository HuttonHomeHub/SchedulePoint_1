import type { DeletedHierarchyItem } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deletedItemKeys } from '../api/use-deleted-items';

import { RecentlyDeletedTable } from './RecentlyDeletedTable';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const mockApiFetch = vi.mocked(apiFetch);

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const PLAN_ID = '00000000-0000-4000-8000-000000000002';

const ITEMS: DeletedHierarchyItem[] = [
  {
    kind: 'client',
    id: CLIENT_ID,
    name: 'Northgate',
    deletedAt: '2026-07-10T09:00:00.000Z',
    canRestore: true,
  },
  {
    kind: 'plan',
    id: PLAN_ID,
    name: 'Baseline',
    deletedAt: '2026-07-10T08:00:00.000Z',
    canRestore: false,
  },
];

function renderTable(canWrite: boolean, data: DeletedHierarchyItem[] = ITEMS) {
  // staleTime Infinity: the seeded list is fresh, so it doesn't refetch on mount
  // (which would otherwise consume a mocked-once response before the restore call).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(deletedItemKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <RecentlyDeletedTable orgSlug="acme" canWrite={canWrite} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockApiFetch.mockReset();
});

describe('RecentlyDeletedTable', () => {
  it('lists deleted items with their type, name and formatted deletion time', () => {
    renderTable(true);
    expect(screen.getByText('Northgate')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    // formatTimestamp renders a localized dd MMM yyyy, HH:mm string.
    expect(screen.getAllByText(/Jul 2026/).length).toBeGreaterThan(0);
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
    expect(screen.getByText('Northgate')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is deleted', () => {
    renderTable(true, []);
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
  });

  it('restores an item via its entity-specific endpoint and announces success', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    renderTable(true);

    fireEvent.click(screen.getByRole('button', { name: 'Restore client Northgate' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/organizations/acme/clients/${CLIENT_ID}/restore`,
        { method: 'POST' },
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Client “Northgate” restored.'),
    );
  });

  it('surfaces a restore error as an alert without dropping the row', async () => {
    // The restore POST (first call) rejects; the follow-up list refetch resolves,
    // so the row stays put and the user can retry.
    mockApiFetch.mockResolvedValue(ITEMS);
    mockApiFetch.mockRejectedValueOnce(new Error('A client with this name already exists.'));
    renderTable(true);

    fireEvent.click(screen.getByRole('button', { name: 'Restore client Northgate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A client with this name already exists.',
      ),
    );
    // The row (and its restore button) is still present so the user can retry.
    expect(screen.getByRole('button', { name: 'Restore client Northgate' })).toBeInTheDocument();
  });

  it('marks the in-flight button busy without natively disabling it (keeps focus)', async () => {
    let resolve: (() => void) | undefined;
    mockApiFetch.mockReturnValue(
      new Promise<undefined>((r) => {
        resolve = () => r(undefined);
      }),
    );
    renderTable(true);

    const button = screen.getByRole('button', { name: 'Restore client Northgate' });
    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, not the native attribute — so the control stays focusable.
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Restoring…');

    resolve?.();
  });
});
