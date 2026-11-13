import type { OrgMemberSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { memberKeys } from '../api/use-members';

import { MembersTable } from './MembersTable';

import { sessionKeys } from '@/features/auth';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

// `apiFetchAllPages` is the refetch a saved change triggers; it must answer, or the mutation's
// own `onSuccess` waits on retries and the confirmation never appears inside the test.
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchAllPages: vi.fn() }));

const MEMBERS: OrgMemberSummary[] = [
  {
    id: 'm1',
    user: { id: 'u1', name: 'Ada Admin', email: 'ada@example.com' },
    role: 'ORG_ADMIN',
    joinedAt: '2026-01-01T00:00:00Z',
    version: 1,
  },
  {
    id: 'm2',
    user: { id: 'u2', name: 'Val Viewer', email: 'val@example.com' },
    role: 'VIEWER',
    joinedAt: '2026-01-02T00:00:00Z',
    version: 3,
  },
];

function renderTable(canAdminister = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(memberKeys.list('acme'), MEMBERS);
  queryClient.setQueryData(sessionKeys.session, {
    user: { id: 'u1', name: 'Ada Admin', email: 'ada@example.com' },
    memberships: [],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersTable orgSlug="acme" canAdminister={canAdminister} />
    </QueryClientProvider>,
  );
}

describe('MembersTable', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue(MEMBERS);
  });

  /**
   * **M5-T3, the eleventh site** — the one the ten-dialog submit-guard milestone left behind, and
   * the answer accessibility-reviewer gave to CQ-3 at the M8 gate.
   *
   * A native `disabled` select leaves the tab order the instant the request starts and returns when
   * it settles, so an Org Admin changing a colleague's role with the keyboard is thrown to `<body>`
   * and back, twice, per change (`docs/TECH_DEBT.md` #17a). The two halves are asserted separately
   * because they fail separately: the attribute swap is what keeps focus, and the `onChange` guard
   * is what stops a second change being sent — the select is **controlled**, so ignoring the change
   * re-renders it at the stored role with no manual revert.
   */
  it('keeps focus and discards a second role change while the first is in flight', async () => {
    let settle: () => void = () => {};
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve(undefined);
      }),
    );
    renderTable();

    const select = screen.getByLabelText('Role for Val Viewer');
    select.focus();
    fireEvent.change(select, { target: { value: 'PLANNER' } });

    await waitFor(() => expect(select).toHaveAttribute('aria-busy', 'true'));
    expect(select).toHaveAttribute('aria-disabled', 'true');
    // The property the swap was made for. A natively disabled control could not be the focused one.
    expect(select).not.toBeDisabled();
    expect(document.activeElement).toBe(select);

    // The second change a reader makes when nothing appears to have happened.
    fireEvent.change(select, { target: { value: 'CONTRIBUTOR' } });
    settle();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    // Controlled, so the displayed value is the stored role rather than either attempt.
    expect(select).toHaveValue('VIEWER');
  });

  it('renders each member with an accessible role control and remove action', () => {
    renderTable();

    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.getByText('val@example.com')).toBeInTheDocument();

    // The role control reflects the member's current role and is labelled.
    expect(screen.getByLabelText('Role for Val Viewer')).toHaveValue('VIEWER');
    expect(screen.getByRole('button', { name: 'Remove Ada Admin' })).toBeInTheDocument();
  });

  it('frames itself as the Roster section and states how many people are in it', () => {
    // **Specified and never built** — `docs/specs/page-composition/feature-spec.md` §4.6's
    // composition is `SectionCard( "Roster", count, … )` and `members.tsx` passed no count, with
    // nothing recording a decision either way (`docs/TECH_DEBT.md` #343(b)).
    //
    // The count lives here rather than at the route because `useMembers` pages through
    // `apiFetchAllPages`, so `data.length` IS the total rather than "rows loaded so far" — the
    // precondition that makes stating it honest at all.
    renderTable();

    // Named by element rather than by taking the first match: a `SectionCard` and the scrollable
    // table region inside it can both carry the section's name.
    const card = screen
      .getAllByRole('region', { name: /Roster/ })
      .find((el) => el.tagName === 'SECTION');
    expect(card).toBeDefined();
    expect(within(card!).getByText('2')).toBeInTheDocument();
  });

  it('declares the Actions column fit so the Remove button is never the thing that shrinks', () => {
    // "Remove" was clipped to "Rem" at 1024 px because the column declared no width; the clip itself
    // needs a browser (e2e-overview/members.spec.ts), so this pins the declaration that prevents it.
    renderTable();

    const cell = screen.getByRole('button', { name: 'Remove Ada Admin' }).closest('td');
    expect(cell).toHaveAttribute('data-col-width', 'fit');
  });

  it('says so on screen and aloud when a role change has been saved', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderTable();

    fireEvent.change(screen.getByLabelText('Role for Val Viewer'), {
      target: { value: 'PLANNER' },
    });
    expect(
      await screen.findByText(
        'Val Viewer is now a Planner. They may need to reload the page to see the change.',
      ),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Role for Val Viewer'), {
      target: { value: 'ORG_ADMIN' },
    });
    expect(
      await screen.findByText(
        'Val Viewer is now an Org Admin. They may need to reload the page to see the change.',
      ),
    ).toBeVisible();
  });

  it('shows no confirmation when the change is refused', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Not allowed'));
    renderTable();

    fireEvent.change(screen.getByLabelText('Role for Val Viewer'), {
      target: { value: 'PLANNER' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed');
    expect(screen.queryByText(/is now a/)).toBeNull();
  });

  it('offers no role select and no Remove to anyone but an Org Admin', () => {
    // A Contributor or Viewer used to reach the select and the Remove confirmation before the
    // server refused. They read the roster, with each role as plain text.
    renderTable(false);

    expect(screen.getByText('Val Viewer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Val Viewer')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    const row = screen.getByText('val@example.com').closest('tr');
    expect(within(row!).getByText('Viewer')).toBeInTheDocument();
  });

  it('speaks to the signed-in person directly when their own role changes', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderTable();

    fireEvent.change(screen.getByLabelText('Role for Ada Admin'), { target: { value: 'PLANNER' } });
    expect(
      await screen.findByText('You are now a Planner. Reload the page to see what changed.'),
    ).toBeVisible();
  });

  it('clears the visible line after a few seconds, without announcing again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(apiFetch).mockResolvedValue(undefined);
      renderTable();

      fireEvent.change(screen.getByLabelText('Role for Val Viewer'), {
        target: { value: 'PLANNER' },
      });
      const line =
        'Val Viewer is now a Planner. They may need to reload the page to see the change.';
      expect(await screen.findByText(line)).toBeVisible();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      expect(screen.queryByText(line)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
