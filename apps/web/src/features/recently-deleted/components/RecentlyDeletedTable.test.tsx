import type { DeletedHierarchyItem } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { deletedItemKeys } from '../api/use-deleted-items';

import { RecentlyDeletedTable } from './RecentlyDeletedTable';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchAllPages: vi.fn() }));
const mockApiFetch = vi.mocked(apiFetch);
// The list read pages through every deleted row (`apiFetchAllPages`), so the post-restore refetch
// resolves here rather than through `apiFetch` (which serves only the restore POST).
const mockApiFetchAllPages = vi.mocked(apiFetchAllPages);

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const PLAN_ID = '00000000-0000-4000-8000-000000000002';

/**
 * Two SEPARATE deletions, deliberately — a restorable client and a plan blocked from outside its
 * own batch. Grouping (ADR-0096) collapses a cascade into one row, so a fixture whose rows shared a
 * batch id would render one entry and quietly stop exercising most of these cases.
 */
const ITEMS: DeletedHierarchyItem[] = [
  {
    kind: 'client',
    id: CLIENT_ID,
    name: 'Northgate',
    deletedAt: '2026-07-10T09:00:00.000Z',
    canRestore: true,
    deleteBatchId: 'batch-client',
    blockedBy: null,
  },
  {
    kind: 'plan',
    id: PLAN_ID,
    name: 'Baseline',
    deletedAt: '2026-07-10T08:00:00.000Z',
    canRestore: false,
    deleteBatchId: 'batch-plan',
    blockedBy: {
      kind: 'project',
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Riverside',
      deleteBatchId: 'batch-project',
    },
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

beforeEach(() => {
  mockApiFetchAllPages.mockResolvedValue(ITEMS);
});

afterEach(() => {
  mockApiFetch.mockReset();
  mockApiFetchAllPages.mockReset();
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

  it('NAMES the blocker instead of telling the reader to go and find it', () => {
    // This asserted the bare "Restore its parent first" until ADR-0096. That sentence is correct
    // and useless: it states a rule the reader already inferred from the disabled control, and
    // withholds the one fact they need. The blocker rides the same join the list already makes, so
    // naming it costs nothing.
    renderTable(true);
    expect(screen.queryByRole('button', { name: 'Restore plan Baseline' })).not.toBeInTheDocument();
    expect(screen.getByText('Restore Riverside first')).toBeInTheDocument();
  });

  it('falls back to the generic sentence when no blocker is named', () => {
    // A row the server could not attribute — it should still say something true rather than
    // rendering an empty cell that reads as "nothing stops you".
    renderTable(true, [{ ...ITEMS[1]!, blockedBy: null, canRestore: false }]);
    expect(screen.getByText('Restore its parent first')).toBeInTheDocument();
  });

  it('shows ONE row for a cascade, naming what else it took', () => {
    // The epic's whole premise. Three rows sharing a batch id are one deletion: restoring the
    // client brings the other two back whatever the reader presses, so three separately-actionable
    // rows misrepresent what the button does.
    const batch = 'batch-cascade';
    renderTable(true, [
      { ...ITEMS[0]!, deleteBatchId: batch },
      {
        kind: 'project',
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Riverside',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: batch,
        blockedBy: { kind: 'client', id: CLIENT_ID, name: 'Northgate', deleteBatchId: batch },
      },
      {
        kind: 'plan',
        id: '00000000-0000-4000-8000-000000000011',
        name: 'Baseline',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: batch,
        blockedBy: {
          kind: 'project',
          id: '00000000-0000-4000-8000-000000000010',
          name: 'Riverside',
          deleteBatchId: batch,
        },
      },
    ]);

    // One Restore, named for everything it brings back — so the accessible name is the honest
    // description of the press, not just of the row it sits on.
    const restore = screen.getByRole('button', {
      name: 'Restore client Northgate and 1 project, 1 plan',
    });
    expect(restore).toBeInTheDocument();
    // And no "restore the parent first" anywhere: that situation no longer exists here.
    expect(screen.queryByText(/first/)).not.toBeInTheDocument();
  });

  it('discloses the members on request, and says nothing about them until then', () => {
    const batch = 'batch-cascade';
    renderTable(true, [
      { ...ITEMS[0]!, deleteBatchId: batch },
      {
        kind: 'plan',
        id: '00000000-0000-4000-8000-000000000012',
        name: 'Baseline',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: batch,
        blockedBy: { kind: 'client', id: CLIENT_ID, name: 'Northgate', deleteBatchId: batch },
      },
    ]);

    const trigger = screen.getByRole('button', { name: 'and 1 plan' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Baseline')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('puts the disclosed panel inside a CELL, not straight into the row', () => {
    // **The containment rule, asserted structurally — because the axe scan below does NOT catch
    // this and I checked.** Rendering the panel as a bare child of the `<tr>` (the exact ADR-0095
    // M5 violation, 110 critical) leaves axe green here: that rule fires on an explicit
    // `role="row"`, and this is a native `<table>` where the role is implicit. Verified by making
    // the break and watching the suite stay green.
    //
    // So the guard is the DOM shape itself. `closest('td')` is null the moment the panel stops
    // living in a cell, which is precisely the regression worth catching.
    const batch = 'batch-cascade';
    renderTable(true, [
      { ...ITEMS[0]!, deleteBatchId: batch },
      {
        kind: 'plan',
        id: '00000000-0000-4000-8000-000000000014',
        name: 'Baseline',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: batch,
        blockedBy: { kind: 'client', id: CLIENT_ID, name: 'Northgate', deleteBatchId: batch },
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'and 1 plan' }));

    const cell = screen.getByText('Baseline').closest('td');
    expect(cell, 'the disclosed panel is not inside a table cell').not.toBeNull();
    // And it spans the table rather than sitting in the first column.
    expect(cell?.getAttribute('colspan')).not.toBeNull();
  });

  it('has no axe violations WITH the disclosure open', async () => {
    // Expanded on purpose — a scan of the collapsed table would prove nothing about the panel.
    // What this DOES cover is the trigger's own semantics (a real button, `aria-expanded`,
    // `aria-controls`) and the surrounding table; the containment rule is the case above, because
    // this scan was verified NOT to catch it.
    const batch = 'batch-cascade';
    const { container } = renderTable(true, [
      { ...ITEMS[0]!, deleteBatchId: batch },
      {
        kind: 'plan',
        id: '00000000-0000-4000-8000-000000000013',
        name: 'Baseline',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: batch,
        blockedBy: { kind: 'client', id: CLIENT_ID, name: 'Northgate', deleteBatchId: batch },
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'and 1 plan' }));
    expect(screen.getByText('Baseline')).toBeInTheDocument(); // the panel really is open
    expect((await axe(container)).violations).toEqual([]);
  });

  it('hides restore actions entirely for non-writers', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Restore .* first/)).not.toBeInTheDocument();
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
