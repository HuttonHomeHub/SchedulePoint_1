import type { DeletedItem } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { RecentlyDeletedTable } from './RecentlyDeletedTable';
import { BLOCKER_PREVIEW_LIMIT } from './RestoreBlockerDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch, apiFetchAllPagesWithMeta } from '@/lib/api/client';
import { deletedItemKeys } from '@/lib/query/hierarchy-keys';

// `ApiFetchError` stays real: the refusals below are classified by `instanceof`, so a mock class would
// make every one of them read as a plain Error.
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPagesWithMeta: vi.fn(),
}));
// The clash alert links to a library; a bare anchor is enough to read its target here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
const mockApiFetch = vi.mocked(apiFetch);

/**
 * 45 days and ACTIVE — deliberately not the 90-day default. A fixture on the default cannot tell a
 * served value from a hardcoded one, which is the exact defect `meta.retentionDays` exists to stop.
 */
const META = { nextCursor: null, hasMore: false, retentionDays: 45, retentionActive: true };
// The list read pages through every deleted row (`apiFetchAllPages`), so the post-restore refetch
// resolves here rather than through `apiFetch` (which serves only the restore POST).
const mockApiFetchAllPages = vi.mocked(apiFetchAllPagesWithMeta);

/**
 * A fixture row. `subtype`, `expiresAt` and a blocker's `relation` are filled in by {@link serve} the
 * way the API would, so the cascade cases below stay about what they are about.
 */
type Fixture = Omit<DeletedItem, 'subtype' | 'expiresAt' | 'blockedBy'> &
  Partial<Pick<DeletedItem, 'subtype' | 'expiresAt'>> & {
    blockedBy:
      | (Omit<NonNullable<DeletedItem['blockedBy']>, 'relation'> &
          Partial<Pick<NonNullable<DeletedItem['blockedBy']>, 'relation'>>)
      | null;
  };

const DAY_MS = 86_400_000;

/** What the API serves: a timer for the hierarchy only, and every blocker a parent unless stated. */
function serve(row: Fixture): DeletedItem {
  const hierarchy = row.kind === 'client' || row.kind === 'project' || row.kind === 'plan';
  return {
    subtype: null,
    expiresAt: hierarchy
      ? new Date(new Date(row.deletedAt).getTime() + META.retentionDays * DAY_MS).toISOString()
      : null,
    ...row,
    blockedBy: row.blockedBy === null ? null : { relation: 'parent', ...row.blockedBy },
  };
}

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const PLAN_ID = '00000000-0000-4000-8000-000000000002';

/**
 * Two SEPARATE deletions, deliberately — a restorable client and a plan blocked from outside its
 * own batch. Grouping (ADR-0096) collapses a cascade into one row, so a fixture whose rows shared a
 * batch id would render one entry and quietly stop exercising most of these cases.
 */
const ITEMS: Fixture[] = [
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

function renderTable(canWrite: boolean, data: Fixture[] = ITEMS) {
  // staleTime Infinity: the seeded list is fresh, so it doesn't refetch on mount
  // (which would otherwise consume a mocked-once response before the restore call).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(deletedItemKeys.list('acme'), { rows: data.map(serve), meta: META });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <RecentlyDeletedTable orgSlug="acme" canWrite={canWrite} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApiFetchAllPages.mockResolvedValue({ rows: ITEMS.map(serve), meta: META });
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
    //
    // **Page-composition M6 moved WHERE it is named, not whether.** It was the action's own label
    // — `Restore Riverside first…`, with the variable part mid-sentence, so the trailing ellipsis
    // read as a truncation. A fact about a row now sits under that row, and the action beside it is
    // bounded. The assertion is deliberately on the blocker's NAME, because that is the invariant;
    // the sentence around it is copy.
    renderTable(true);
    expect(screen.queryByRole('button', { name: 'Restore plan Baseline' })).not.toBeInTheDocument();
    expect(screen.getByText(/Blocked by a deleted project, .Riverside./)).toBeInTheDocument();
    expect(screen.getByText('Restore its project first')).toBeInTheDocument();
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
    const CROSS: Fixture[] = [
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
      const trigger = screen.getByRole('button', { name: 'Restore project first…: Riverside' });
      // The blocker is named under the row it blocks, and in the action's accessible name — the
      // visible label is contiguous at the start of that name (WCAG 2.5.3).
      expect(trigger).toHaveTextContent('Restore project first…');
      expect(screen.getByText(/Blocked by a deleted project, .Riverside./)).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('names everything the confirmation will bring back, including unseen siblings', () => {
      // A sibling the blocked row cannot see. This is exactly why an auto-cascade was rejected:
      // one press on the plan would have resurrected this too, with nothing on screen saying so.
      const withSibling: Fixture[] = [
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
      fireEvent.click(screen.getByRole('button', { name: 'Restore project first…: Riverside' }));

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
      const many: Fixture[] = [
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
      fireEvent.click(screen.getByRole('button', { name: 'Restore project first…: Riverside' }));
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).getByText('This will restore 21 items:')).toBeInTheDocument();
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(BLOCKER_PREVIEW_LIMIT);
      const more = within(dialog).getByRole('button', {
        name: `Show ${21 - BLOCKER_PREVIEW_LIMIT} more`,
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
      fireEvent.click(screen.getByRole('button', { name: 'Restore project first…: Riverside' }));
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
        screen.getByText(
          'Deleted clients, projects and plans are kept for 45 days, then permanently removed, ' +
            'and a project’s own calendars go with it. Deleted resources and organisation ' +
            'calendars are kept until you restore them.',
        ),
      ).toBeInTheDocument();
    });

    it('does not claim a deadline for the library rows (they never expire)', () => {
      // ADR-0195 D4. The old sentence said "Deleted items are kept for N days" over a list that now
      // holds rows no timer removes.
      renderTable(true);
      expect(screen.queryByText(/^Deleted items are kept for/)).not.toBeInTheDocument();
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
        rows: ITEMS.map(serve),
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

    const invoker = screen.getByRole('button', { name: /Restore client first….*Northgate/ });
    fireEvent.click(invoker);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });

  describe('resources and calendars (ADR-0195)', () => {
    const GROUP_ID = '00000000-0000-4000-8000-000000000030';
    const CAL_ID = '00000000-0000-4000-8000-000000000031';
    const T = '2026-07-12T09:00:00.000Z';

    /** A group deleted with two members: one deletion, one row. */
    const GROUP_BATCH: Fixture[] = [
      {
        kind: 'resource',
        subtype: 'GROUP',
        id: GROUP_ID,
        name: 'Groundworks',
        deletedAt: T,
        canRestore: true,
        deleteBatchId: 'batch-group',
        blockedBy: null,
      },
      ...['Crew A', 'Crew B'].map((name, n): Fixture => ({
        kind: 'resource',
        subtype: 'LABOUR',
        id: `00000000-0000-4000-8000-00000000004${String(n)}`,
        name,
        deletedAt: T,
        canRestore: false,
        deleteBatchId: 'batch-group',
        blockedBy: {
          kind: 'resource',
          id: GROUP_ID,
          name: 'Groundworks',
          deleteBatchId: 'batch-group',
        },
      })),
    ];

    it('shows a resource group as ONE row named for everything a press brings back', () => {
      renderTable(true, GROUP_BATCH);
      expect(screen.getByText('Resource group')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Restore resource group Groundworks and 2 resources' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/first/)).not.toBeInTheDocument();
    });

    it('calls a deleted group with nothing in its deletion an EMPTY resource group (Q3)', async () => {
      // A dissolved group is the common case: the same soft delete as a delete, with no members. The
      // label says what a restore brings back, and the announcement says it too.
      mockApiFetch.mockResolvedValue(undefined);
      renderTable(true, [{ ...GROUP_BATCH[0]!, deleteBatchId: 'b-dissolved' }]);
      expect(screen.getByText('Empty resource group')).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Restore empty resource group Groundworks' }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent(
          'Empty resource group “Groundworks” restored.',
        ),
      );
    });

    it('does NOT call a group with members empty', () => {
      renderTable(true, GROUP_BATCH);
      expect(screen.queryByText('Empty resource group')).not.toBeInTheDocument();
      expect(screen.getByText('Resource group')).toBeInTheDocument();
    });

    it('labels a leaf resource and both calendar tiers by what they are', () => {
      renderTable(true, [
        { ...GROUP_BATCH[1]!, canRestore: true, blockedBy: null, deleteBatchId: 'b1' },
        {
          kind: 'calendar',
          subtype: 'ORG',
          id: CAL_ID,
          name: 'Crane hours',
          deletedAt: T,
          canRestore: true,
          deleteBatchId: 'b2',
          blockedBy: null,
        },
        {
          kind: 'calendar',
          subtype: 'PROJECT',
          id: '00000000-0000-4000-8000-000000000032',
          name: 'Riverside week',
          deletedAt: T,
          canRestore: true,
          deleteBatchId: 'b3',
          blockedBy: null,
        },
      ]);
      expect(screen.getByText('Resource')).toBeInTheDocument();
      expect(screen.getByText('Calendar (organisation)')).toBeInTheDocument();
      expect(screen.getByText('Calendar (project)')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Restore calendar Crane hours' }),
      ).toBeInTheDocument();
    });

    it('prints NO countdown on a row no timer removes, even while the sweep is armed', () => {
      // The fixture's hierarchy rows get `deletedAt + 45 days`; a resource and an organisation
      // calendar get none, so the only "Expires" in the document belongs to the client.
      renderTable(true, [
        ITEMS[0]!,
        { ...GROUP_BATCH[0]!, deleteBatchId: 'b-res', deletedAt: '2026-07-11T09:00:00.000Z' },
      ]);
      expect(screen.getAllByText(/Expir(es|ing)/)).toHaveLength(1);
    });

    it('counts a project calendar down from its PROJECT’s clock, as the server serves it', () => {
      const soon = new Date(Date.now() + 3 * DAY_MS + 3_600_000).toISOString();
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(deletedItemKeys.list('acme'), {
        rows: [
          {
            ...serve({
              kind: 'calendar',
              subtype: 'PROJECT',
              id: CAL_ID,
              name: 'Riverside week',
              deletedAt: '2020-01-01T00:00:00.000Z',
              canRestore: true,
              deleteBatchId: 'b-cal',
              blockedBy: null,
            }),
            expiresAt: soon,
          },
        ],
        meta: META,
      });
      render(
        <QueryClientProvider client={queryClient}>
          <AnnouncerProvider>
            <RecentlyDeletedTable orgSlug="acme" canWrite />
          </AnnouncerProvider>
        </QueryClientProvider>,
      );
      // Deleted in 2020 yet "in 3 days": the sentence follows `expiresAt`, never `deletedAt`.
      expect(screen.getByText('Expires in 3 days')).toBeInTheDocument();
    });

    it('says a resource USES a deleted calendar, and offers to restore the calendar first', () => {
      renderTable(true, [
        {
          kind: 'resource',
          subtype: 'EQUIPMENT',
          id: '00000000-0000-4000-8000-000000000033',
          name: 'Crane A',
          deletedAt: T,
          canRestore: false,
          deleteBatchId: 'b-res',
          blockedBy: {
            kind: 'calendar',
            relation: 'calendar',
            id: CAL_ID,
            name: 'Crane hours',
            deleteBatchId: 'b-cal',
          },
        },
        {
          kind: 'calendar',
          subtype: 'ORG',
          id: CAL_ID,
          name: 'Crane hours',
          deletedAt: '2026-07-11T09:00:00.000Z',
          canRestore: true,
          deleteBatchId: 'b-cal',
          blockedBy: null,
        },
      ]);
      // A dependency, not a parent: "Blocked by a deleted calendar" would say the calendar holds it.
      expect(screen.getByText('Uses deleted calendar “Crane hours”')).toBeInTheDocument();
      expect(screen.queryByText(/Blocked by a deleted/)).not.toBeInTheDocument();
      const trigger = screen.getByRole('button', { name: 'Restore calendar first…: Crane hours' });
      expect(trigger).toHaveTextContent('Restore calendar first…');

      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Resource “Crane A” uses the calendar “Crane hours”');
      expect(dialog).not.toHaveTextContent('sits inside');
    });

    it.each([
      {
        kind: 'plan',
        name: 'Tower A',
        subLine: 'Uses deleted calendar “Mon-Wed”',
        dialog: 'Plan “Tower A” uses the calendar “Mon-Wed”, which is also deleted.',
      },
      {
        kind: 'project',
        name: 'Tower',
        subLine: 'Work in it uses deleted calendar “Mon-Wed”',
        dialog: 'Work in project “Tower” uses the calendar “Mon-Wed”, which is also deleted.',
      },
      {
        kind: 'client',
        name: 'Northgate',
        subLine: 'Work in it uses deleted calendar “Mon-Wed”',
        dialog: 'Work in client “Northgate” uses the calendar “Mon-Wed”, which is also deleted.',
      },
    ] as const)(
      'says a $kind row’s work uses a deleted calendar, in words true of that row (ADR-0200)',
      ({ kind, name, subLine, dialog }) => {
        renderTable(true, [
          {
            kind,
            subtype: null,
            id: '00000000-0000-4000-8000-000000000044',
            name,
            deletedAt: T,
            canRestore: false,
            deleteBatchId: 'b-root',
            blockedBy: {
              kind: 'calendar',
              relation: 'calendar',
              id: CAL_ID,
              name: 'Mon-Wed',
              deleteBatchId: 'b-cal',
            },
          },
          {
            kind: 'calendar',
            subtype: 'ORG',
            id: CAL_ID,
            name: 'Mon-Wed',
            deletedAt: '2026-07-11T09:00:00.000Z',
            canRestore: true,
            deleteBatchId: 'b-cal',
            blockedBy: null,
          },
        ]);
        expect(screen.getByText(subLine)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Restore calendar first…: Mon-Wed' }));
        expect(screen.getByRole('dialog')).toHaveTextContent(dialog);
      },
    );

    it('offers “Restore resource group first…” for a child blocked by a later-deleted group', () => {
      renderTable(true, [
        {
          kind: 'resource',
          subtype: 'LABOUR',
          id: '00000000-0000-4000-8000-000000000034',
          name: 'Crew A',
          deletedAt: T,
          canRestore: false,
          deleteBatchId: 'b-child',
          blockedBy: {
            kind: 'resource',
            id: GROUP_ID,
            name: 'Groundworks',
            deleteBatchId: 'b-group',
          },
        },
        { ...GROUP_BATCH[0]!, deleteBatchId: 'b-group', deletedAt: '2026-07-13T09:00:00.000Z' },
      ]);
      expect(
        screen.getByText(/Blocked by a deleted resource group, .Groundworks./),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Restore resource group first…: Groundworks' }),
      );
      expect(screen.getByRole('dialog')).toHaveTextContent('sits inside');
    });

    it('restores a resource through ITS route, announcing the whole branch', async () => {
      mockApiFetch.mockResolvedValue(undefined);
      renderTable(true, GROUP_BATCH);
      fireEvent.click(
        screen.getByRole('button', { name: 'Restore resource group Groundworks and 2 resources' }),
      );
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          `/organizations/acme/resources/${GROUP_ID}/restore`,
          { method: 'POST' },
        ),
      );
      await waitFor(() =>
        expect(screen.getByTestId('announcer')).toHaveTextContent(
          'Resource group “Groundworks” and 2 resources restored.',
        ),
      );
    });

    it('restores a calendar through ITS route', async () => {
      mockApiFetch.mockResolvedValue(undefined);
      renderTable(true, [
        {
          kind: 'calendar',
          subtype: 'ORG',
          id: CAL_ID,
          name: 'Crane hours',
          deletedAt: T,
          canRestore: true,
          deleteBatchId: 'b-cal',
          blockedBy: null,
        },
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Restore calendar Crane hours' }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          `/organizations/acme/calendars/${CAL_ID}/restore`,
          { method: 'POST' },
        ),
      );
    });

    describe('a refused restore', () => {
      const refuse = (status: number, message: string, details?: unknown) =>
        new ApiFetchError(status, { code: 'CONFLICT', message, ...(details ? { details } : {}) });

      it('names the live holder of a clashing name and links to the library to rename it', async () => {
        mockApiFetch.mockRejectedValueOnce(
          refuse(
            409,
            'A resource named “Crane A” already exists. Rename or delete that one, then restore this.',
            { reason: 'NAME_TAKEN', conflicts: [], total: 1 },
          ),
        );
        mockApiFetch.mockResolvedValue([]);
        const stays: Fixture = {
          ...GROUP_BATCH[1]!,
          canRestore: true,
          blockedBy: null,
          deleteBatchId: 'b1',
        };
        // The post-failure refetch still lists it: a refused restore changes nothing.
        mockApiFetchAllPages.mockResolvedValue({ rows: [serve(stays)], meta: META });
        renderTable(true, [stays]);
        fireEvent.click(screen.getByRole('button', { name: 'Restore resource Crew A' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('A resource named “Crane A” already exists.');
        expect(
          within(alert).getByRole('link', { name: 'Open the resources library' }),
        ).toHaveAttribute('href', '/orgs/$orgSlug/resources');
        // The row stays, so the reader can rename and retry.
        expect(screen.getByRole('button', { name: 'Restore resource Crew A' })).toBeInTheDocument();
      });

      it('links a calendar clash to the calendars library', async () => {
        mockApiFetch.mockRejectedValueOnce(
          refuse(409, 'A calendar named “Hours” already exists.', { reason: 'NAME_TAKEN' }),
        );
        mockApiFetch.mockResolvedValue([]);
        renderTable(true, [
          {
            kind: 'calendar',
            subtype: 'ORG',
            id: CAL_ID,
            name: 'Hours',
            deletedAt: T,
            canRestore: true,
            deleteBatchId: 'b-cal',
            blockedBy: null,
          },
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Restore calendar Hours' }));
        const alert = await screen.findByRole('alert');
        expect(
          within(alert).getByRole('link', { name: 'Open the calendars library' }),
        ).toHaveAttribute('href', '/orgs/$orgSlug/calendars');
      });

      it('names the parent that is no longer a group', async () => {
        mockApiFetch.mockRejectedValueOnce(
          refuse(422, 'Only a group can contain resources.', {
            reason: 'RESOURCE_PARENT_NOT_GROUP',
            parentName: 'Old group',
          }),
        );
        mockApiFetch.mockResolvedValue([]);
        renderTable(true, [
          { ...GROUP_BATCH[1]!, canRestore: true, blockedBy: null, deleteBatchId: 'b1' },
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Restore resource Crew A' }));
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('“Old group” is no longer a resource group');
        expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
      });

      it('says a 404 means the item is gone, not that a retry might work', async () => {
        mockApiFetch.mockRejectedValueOnce(refuse(404, 'Resource not found.'));
        mockApiFetch.mockResolvedValue([]);
        renderTable(true, [
          { ...GROUP_BATCH[1]!, canRestore: true, blockedBy: null, deleteBatchId: 'b1' },
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Restore resource Crew A' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('This item no longer exists.');
      });
    });

    it('has no axe violations with library rows, a blocked row and an alert present', async () => {
      const { container } = renderTable(true, [
        ...GROUP_BATCH,
        {
          kind: 'resource',
          subtype: 'EQUIPMENT',
          id: '00000000-0000-4000-8000-000000000035',
          name: 'Crane A',
          deletedAt: '2026-07-10T09:00:00.000Z',
          canRestore: false,
          deleteBatchId: 'b-res',
          blockedBy: {
            kind: 'calendar',
            relation: 'calendar',
            id: CAL_ID,
            name: 'Crane hours',
            deleteBatchId: 'b-cal',
          },
        },
        {
          kind: 'calendar',
          subtype: 'ORG',
          id: CAL_ID,
          name: 'Crane hours',
          deletedAt: '2026-07-09T09:00:00.000Z',
          canRestore: true,
          deleteBatchId: 'b-cal',
          blockedBy: null,
        },
      ]);
      expect((await axe(container)).violations).toEqual([]);
    });
  });

  describe('the Show filter (ADR-0195 D8)', () => {
    const T = '2026-07-12T09:00:00.000Z';
    const MIXED: Fixture[] = [
      ITEMS[0]!,
      {
        kind: 'resource',
        subtype: 'EQUIPMENT',
        id: '00000000-0000-4000-8000-000000000050',
        name: 'Crane A',
        deletedAt: T,
        canRestore: true,
        deleteBatchId: 'b-res',
        blockedBy: null,
      },
      {
        kind: 'calendar',
        subtype: 'ORG',
        id: '00000000-0000-4000-8000-000000000051',
        name: 'Crane hours',
        deletedAt: T,
        canRestore: true,
        deleteBatchId: 'b-cal',
        blockedBy: null,
      },
    ];

    /** The number in the section header — what the heading says there are. */
    const sectionCount = (): string | null =>
      document.querySelector('.tabular-nums')?.textContent ?? null;

    it('offers the four alternatives as a named radiogroup, opening on All', () => {
      renderTable(true, MIXED);
      const group = screen.getByRole('radiogroup', { name: 'Show' });
      expect(
        within(group)
          .getAllByRole('radio')
          .map((r) => r.textContent),
      ).toEqual(['All', 'Clients, projects & plans', 'Resources', 'Calendars']);
      expect(within(group).getByRole('radio', { name: 'All' })).toBeChecked();
      expect(sectionCount()).toBe('3');
    });

    it('narrows to one kind of deletion and counts what is SHOWN', () => {
      renderTable(true, MIXED);
      fireEvent.click(screen.getByRole('radio', { name: 'Resources' }));

      expect(screen.getByText('Crane A')).toBeInTheDocument();
      expect(screen.queryByText('Northgate')).not.toBeInTheDocument();
      expect(screen.queryByText('Crane hours')).not.toBeInTheDocument();
      expect(sectionCount()).toBe('1');
    });

    it('moves the selection with the arrow keys, as an APG radiogroup does', () => {
      renderTable(true, MIXED);
      const all = screen.getByRole('radio', { name: 'All' });
      all.focus();
      fireEvent.keyDown(all, { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('radio', { name: 'Clients, projects & plans' }), {
        key: 'ArrowRight',
      });
      expect(screen.getByRole('radio', { name: 'Resources' })).toBeChecked();
      expect(screen.queryByText('Northgate')).not.toBeInTheDocument();
    });

    it('is controlled by the route when it is given one, and reports a change', () => {
      const onShowChange = vi.fn();
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(deletedItemKeys.list('acme'), {
        rows: MIXED.map(serve),
        meta: META,
      });
      render(
        <QueryClientProvider client={queryClient}>
          <AnnouncerProvider>
            <RecentlyDeletedTable
              orgSlug="acme"
              canWrite
              show="calendars"
              onShowChange={onShowChange}
            />
          </AnnouncerProvider>
        </QueryClientProvider>,
      );
      expect(screen.getByText('Crane hours')).toBeInTheDocument();
      expect(screen.queryByText('Crane A')).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Calendars' })).toBeChecked();

      fireEvent.click(screen.getByRole('radio', { name: 'Resources' }));
      expect(onShowChange).toHaveBeenCalledWith('resources');
    });

    it('says WHAT is empty in a narrowed view, not that nothing was ever deleted', () => {
      renderTable(true, [ITEMS[0]!]);
      fireEvent.click(screen.getByRole('radio', { name: 'Calendars' }));
      expect(screen.getByText('No deleted calendars.')).toBeInTheDocument();
      expect(screen.queryByText(/Nothing has been deleted/)).not.toBeInTheDocument();
      expect(sectionCount()).toBe('0');
    });

    it('keeps the filter on screen over an empty bin, but says the bin is empty', () => {
      // Once the list has loaded the control is always there, so it does not appear and vanish as
      // rows are restored; the sentence stays the whole-bin one, because "No deleted resources."
      // over an empty bin would be a half-truth.
      renderTable(true, []);
      expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
      expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
    });

    it('still finds a blocker that is filtered out of view', () => {
      // The resource is blocked by a calendar; narrowing to Resources hides the calendar's row, and
      // "Restore calendar first…" must still open its confirmation — the lookup reads ALL groups.
      renderTable(true, [
        {
          kind: 'resource',
          subtype: 'EQUIPMENT',
          id: '00000000-0000-4000-8000-000000000052',
          name: 'Crane B',
          deletedAt: T,
          canRestore: false,
          deleteBatchId: 'b-res',
          blockedBy: {
            kind: 'calendar',
            relation: 'calendar',
            id: '00000000-0000-4000-8000-000000000051',
            name: 'Crane hours',
            deleteBatchId: 'b-cal',
          },
        },
        MIXED[2]!,
      ]);
      fireEvent.click(screen.getByRole('radio', { name: 'Resources' }));
      expect(screen.queryByRole('cell', { name: 'Crane hours' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Restore calendar first…: Crane hours' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('uses the calendar “Crane hours”');
    });

    it('has no axe violations with the filter present', async () => {
      const { container } = renderTable(true, MIXED);
      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
