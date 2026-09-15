import type { InvitationSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { invitationKeys } from '../api/use-invitations';

import { InvitationsSection } from './InvitationsSection';

const HOUR = 60 * 60 * 1000;

/** One live, one expired — the distinction the whole milestone exists to make. */
const INVITATIONS: InvitationSummary[] = [
  {
    id: 'i-live',
    email: 'priya@example.com',
    role: 'PLANNER',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    createdAt: '2026-09-10T09:00:00Z',
  },
  {
    id: 'i-expired',
    email: 'tom@example.com',
    role: 'CONTRIBUTOR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() - 48 * HOUR).toISOString(),
    createdAt: '2026-09-01T09:00:00Z',
  },
];

function renderSection(data: InvitationSummary[] | undefined = INVITATIONS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (data !== undefined) queryClient.setQueryData(invitationKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <InvitationsSection orgSlug="acme" />
    </QueryClientProvider>,
  );
}

describe('InvitationsSection', () => {
  it('lists every outstanding invitation with its address, role and when it was sent', () => {
    renderSection();

    expect(screen.getByRole('table', { name: 'Pending invitations' })).toBeVisible();
    expect(screen.getByText('priya@example.com')).toBeVisible();
    expect(screen.getByText('tom@example.com')).toBeVisible();
    expect(screen.getByText('Planner')).toBeVisible();
    expect(screen.getByText('Contributor')).toBeVisible();
  });

  /**
   * The load-bearing case. An expired invitation is still `PENDING` and still listed, and the
   * reader's action differs: chasing somebody who cannot accept achieves nothing. Both states are
   * asserted in ONE render, because two separate tests each pass against a component that renders
   * only the row that test looks for.
   */
  it('marks the expired one and leaves the live one showing when it expires', () => {
    renderSection();

    expect(screen.getByText('Expired')).toBeVisible();
    expect(screen.getAllByText(/^Expires /)).toHaveLength(1);
  });

  it('offers a distinctly-named revoke action per row', () => {
    renderSection();

    // Named by address, not "Revoke" four times — the accessible name has to say which one.
    expect(
      screen.getByRole('button', { name: 'Revoke the invitation to priya@example.com' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Revoke the invitation to tom@example.com' }),
    ).toBeVisible();
  });

  it('confirms before revoking, naming the address and what it costs', async () => {
    renderSection();

    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke the invitation to priya@example.com' }),
    );

    // **Scoped to the dialog, not to the document.** An unscoped `getByText` says the copy exists
    // somewhere, not that it is inside the thing the reader is looking at — which is exactly the
    // gap that let `e2e-overview/members.spec.ts` fail on its first run while this passed.
    // `ConfirmDialog` is `role="alertdialog"` (`confirm-dialog.tsx:46`), which OVERRIDES the native
    // `<dialog>`'s implicit `dialog` role; naming it here is what keeps the unit suite and the
    // journey talking about the same element.
    const confirm = await screen.findByRole('alertdialog');
    expect(
      within(confirm).getByText(/Revoke the invitation to priya@example\.com\?/),
    ).toBeVisible();
    expect(within(confirm).getByText(/The link they were sent will stop working\./)).toBeVisible();
  });

  /**
   * **Focus must not drop to `<body>`.** The revoked row unmounts with the button that was
   * focused inside it, which is WCAG 2.2 §2.4.3 and the class recorded in ADR-0096, ADR-0099 M10
   * and ADR-0143. Asserted on the CANCEL path, which unmounts the dialog without a network call,
   * so the test pins the focus contract without pinning a mocked fetch.
   */
  it('returns focus into the section when the confirmation closes', async () => {
    renderSection();

    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke the invitation to priya@example.com' }),
    );
    await screen.findByText(/Revoke the invitation to priya@example\.com\?/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
    expect(document.activeElement?.textContent).toContain('Pending invitations');
  });

  it('says so plainly when there is nothing outstanding', () => {
    renderSection([]);

    expect(screen.getByText('No invitations are outstanding.')).toBeVisible();
    // And offers no revoke control at all, rather than a shaded one over an empty table.
    expect(screen.queryByRole('button', { name: /^Revoke the invitation/ })).toBeNull();
  });

  it('reports a failed read without pretending the list is empty', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderSection(undefined);

    expect(await screen.findByText('Couldn’t load invitations. Please try again.')).toBeVisible();
    // "No invitations are outstanding" would be a false statement about the organisation.
    expect(screen.queryByText('No invitations are outstanding.')).toBeNull();

    vi.unstubAllGlobals();
    error.mockRestore();
  });
});
