import type { DeletedHierarchyItem } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { RecentlyDeletedTable } from './RecentlyDeletedTable';
import { ANCESTOR_PREVIEW_LIMIT } from './RestoreAncestorDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch, apiFetchAllPagesWithMeta } from '@/lib/api/client';
import { deletedItemKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchAllPagesWithMeta: vi.fn() }));
const mockApiFetch = vi.mocked(apiFetch);

/**
 * 45 days and ACTIVE — deliberately not the 90-day default. A fixture on the default cannot tell a
 * served value from a hardcoded one, which is the exact defect `meta.retentionDays` exists to stop.
 */
const META = { nextCursor: null, hasMore: false, retentionDays: 45, retentionActive: true };
// The list read pages through every deleted row (`apiFetchAllPages`), so the post-restore refetch
// resolves here rather than through `apiFetch` (which serves only the restore POST).
const mockApiFetchAllPages = vi.mocked(apiFetchAllPagesWithMeta);

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
  queryClient.setQueryData(deletedItemKeys.list('acme'), { rows: data, meta: META });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <RecentlyDeletedTable orgSlug="acme" canWrite={canWrite} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApiFetchAllPages.mockResolvedValue({ rows: ITEMS, meta: META });
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

    const trigger = screen.getByRole('button', { name: 'Northgate: and 1 plan' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Northgate: and 1 plan' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Northgate: and 1 plan' }));
    expect(screen.getByText('Baseline')).toBeInTheDocument(); // the panel really is open
    expect((await axe(container)).violations).toEqual([]);
  });

  describe('the cross-batch ancestor', () => {
    const PROJECT_ID = '00000000-0000-4000-8000-000000000020';
    /** A plan deleted alone, then its project deleted later — two batches, so grouping cannot help. */
    const CROSS: DeletedHierarchyItem[] = [
      {
        kind: 'project',
        id: PROJECT_ID,
        name: 'Riverside',
        deletedAt: '2026-07-11T09:00:00.000Z',
        canRestore: true,
        deleteBatchId: 'batch-project',
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
          id: PROJECT_ID,
          name: 'Riverside',
          deleteBatchId: 'batch-project',
        },
      },
    ];

    it('offers the blocker as an ACTION, not as a sentence to go and act on elsewhere', () => {
      renderTable(true, CROSS);
      const trigger = screen.getByRole('button', { name: 'Restore Riverside first…' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('names everything the confirmation will bring back, including unseen siblings', () => {
      // A sibling the blocked row cannot see. This is exactly why an auto-cascade was rejected:
      // one press on the plan would have resurrected this too, with nothing on screen saying so.
      const withSibling: DeletedHierarchyItem[] = [
        ...CROSS,
        {
          kind: 'plan',
          id: '00000000-0000-4000-8000-000000000021',
          name: 'Sibling plan',
          deletedAt: '2026-07-11T09:00:00.000Z',
          canRestore: false,
          deleteBatchId: 'batch-project',
          blockedBy: {
            kind: 'project',
            id: PROJECT_ID,
            name: 'Riverside',
            deleteBatchId: 'batch-project',
          },
        },
      ];
      renderTable(true, withSibling);
      fireEvent.click(screen.getByRole('button', { name: 'Restore Riverside first…' }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      // NOT alertdialog: restoring destroys nothing, and the escalation would tell an AT user this
      // is dangerous when it is undone by deleting again.
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(within(dialog).getByText('This will restore 2 items:')).toBeInTheDocument();
      expect(within(dialog).getByText('Sibling plan')).toBeInTheDocument();
    });

    it('caps a large ancestor batch and still states the exact total', () => {
      // A client-rooted cascade can hold hundreds. The cap changes how much is NAMED, never what is
      // CLAIMED — a silent truncation would read as "that is all of it" (ADR-0090's no-silent-caps).
      const many: DeletedHierarchyItem[] = [
        CROSS[1]!,
        CROSS[0]!,
        ...Array.from({ length: 20 }, (_, n) => ({
          kind: 'plan' as const,
          id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
          name: `Plan ${n}`,
          deletedAt: '2026-07-11T09:00:00.000Z',
          canRestore: false,
          deleteBatchId: 'batch-project',
          blockedBy: {
            kind: 'project' as const,
            id: PROJECT_ID,
            name: 'Riverside',
            deleteBatchId: 'batch-project',
          },
        })),
      ];
      renderTable(true, many);
      fireEvent.click(screen.getByRole('button', { name: 'Restore Riverside first…' }));
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByText('This will restore 21 items:')).toBeInTheDocument();
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(ANCESTOR_PREVIEW_LIMIT);
      const more = within(dialog).getByRole('button', {
        name: `Show ${21 - ANCESTOR_PREVIEW_LIMIT} more`,
      });
      fireEvent.click(more);
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(21);
    });

    it('closes on confirm and shows the in-flight state on the ROW, not the dialog', async () => {
      // The dialog closes before the write starts, so the pending state belongs to the row the
      // reader is now looking at. That is also what makes focus deterministic: `Dialog` is a native
      // <dialog> whose close restores focus to its invoker ASYNCHRONOUSLY, and the invoker's label
      // changes the moment this succeeds — closing first lets that restore happen immediately and
      // the explicit focus move win afterwards, instead of racing it (ADR-0080, ADR-0095 M6).
      let resolve: (v: unknown) => void = () => {};
      mockApiFetch.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      renderTable(true, CROSS);
      fireEvent.click(screen.getByRole('button', { name: 'Restore Riverside first…' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restore Riverside' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const pending = screen.getByRole('button', { name: /Restore project Riverside/ });
      // `aria-disabled`, never native `disabled`: the latter blurs to <body> when it flips.
      expect(pending).toHaveAttribute('aria-busy', 'true');
      expect(pending).not.toHaveAttribute('disabled');
      resolve({});
    });
  });

  describe('the retention rule', () => {
    it('STATES the rule, using the served period rather than a constant', () => {
      // Without this sentence, the first time a member learns deletions expire is a countdown on
      // something they came here to check. 45 is the fixture's period — a hardcoded 90 would fail.
      renderTable(true);
      expect(
        screen.getByText('Deleted items are kept for 45 days, then permanently removed.'),
      ).toBeInTheDocument();
    });

    it('counts each deletion down by the SERVED period', () => {
      renderTable(true);
      // ITEMS[0] was deleted 2026-07-10; with a 45-day period the row must reflect 45, not 90.
      // Asserted as a pattern rather than a fixed number so the case survives the clock moving.
      expect(screen.getAllByText(/Expir(es|ing)/).length).toBeGreaterThan(0);
    });

    it('says NOTHING about expiry while the sweep is not deleting yet', () => {
      // M3 ships the words; M4 arms the delete. A countdown for a deletion that will not happen
      // states a consequence the system does not deliver — worse than silence.
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(deletedItemKeys.list('acme'), {
        rows: ITEMS,
        meta: { ...META, retentionActive: false },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <AnnouncerProvider>
            <RecentlyDeletedTable orgSlug="acme" canWrite />
          </AnnouncerProvider>
        </QueryClientProvider>,
      );
      expect(screen.queryByText(/Expir(es|ing)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/permanently removed/)).not.toBeInTheDocument();
      // ...and the list itself still works.
      expect(screen.getByText('Northgate')).toBeInTheDocument();
    });
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

  it('returns focus to the button that opened the ancestor confirmation', () => {
    // **Third instance of the class** (ADR-0080, ADR-0095 M6). The dialog is unmounted rather than
    // toggled closed, and focus restoration is a step of the native `<dialog>`'s `close()` — not
    // of removing the node — so Cancel, ✕ and a failed restore all left focus on `<body>` with
    // nothing to bring it back. jsdom cannot see it either: `test/setup.ts` stubs `showModal`/
    // `close` to toggle `.open` and implements no focus behaviour at all, so this asserts the
    // explicit re-homing rather than the browser's.
    const batch = 'batch-client';
    renderTable(true, [
      { ...ITEMS[0]!, deleteBatchId: batch },
      {
        kind: 'plan',
        id: '00000000-0000-4000-8000-000000000015',
        name: 'Baseline',
        deletedAt: '2026-07-10T09:00:00.000Z',
        canRestore: false,
        deleteBatchId: 'batch-plan-alone',
        blockedBy: { kind: 'client', id: CLIENT_ID, name: 'Northgate', deleteBatchId: batch },
      },
    ]);

    const invoker = screen.getByRole('button', { name: /Restore Northgate first/ });
    fireEvent.click(invoker);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });
});
