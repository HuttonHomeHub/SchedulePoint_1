import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Env from '@/config/env';

/**
 * The flag-**ON** half of ADR-0073 C2.4 — an actor-less row rendering beside the reader's own.
 *
 * This file exists because the milestone shipped with only its rollback contract covered. The
 * parity suite proves what the screen does **not** do; nothing proved that an attempt row reaches
 * the reader with the column and the sentence that make it legible — which is the entire feature,
 * on the one screen whose copy tells somebody they may be under attack.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  AUDIT_SELF_SECURITY_ENABLED: true,
  AUDIT_LOG_ENABLED: true,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme' }),
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/organizations', () => ({
  useOrganizations: () => ({ isPending: false, data: [] }),
}));

vi.mock('@/hooks/use-org-role', () => ({ useOrgRole: () => 'ORG_ADMIN' }));

const fetchMock = vi.fn();

/** One row the reader performed, and one performed by nobody against them. */
const ROWS = [
  {
    id: '1',
    occurredAt: '2026-08-04T10:00:00.000Z',
    action: 'auth.signed_in',
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorLabel: 'me@example.com',
    subjectType: 'USER',
    subjectId: 'u1',
    subjectLabel: 'me@example.com',
    changes: null,
    correlationId: null,
  },
  {
    id: '2',
    occurredAt: '2026-08-04T09:00:00.000Z',
    action: 'auth.sign_in_failed',
    outcome: 'FAILURE',
    actorType: 'ANONYMOUS',
    actorLabel: null,
    subjectType: 'USER',
    subjectId: 'u1',
    subjectLabel: 'me@example.com',
    changes: null,
    correlationId: null,
  },
];

describe('self-security surface, flag ON (ADR-0073 C2.4)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: ROWS, meta: { hasMore: false, nextCursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderMyActivity(): Promise<void> {
    const { MyActivityScreen } = await import('@/routes/my-activity');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MyActivityScreen />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Sign-in failed')).toBeInTheDocument();
    });
  }

  it('asks the server for the projection', async () => {
    await renderMyActivity();
    expect(fetchMock.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(
      /[?&]include=attempts/,
    );
  });

  it('renders the actor-less row with the actor column, reading "Not signed in"', async () => {
    await renderMyActivity();
    expect(screen.getByRole('columnheader', { name: 'By' })).toBeInTheDocument();

    // Scoped to the ROW, not the document: the explanatory note deliberately quotes "Not signed in"
    // and "By" too, so a document-wide query passes on the prose alone and proves nothing about
    // the table.
    const attempt = screen.getByRole('row', { name: /Sign-in failed/ });
    expect(within(attempt).getByText('Not signed in')).toBeInTheDocument();

    // Beside a row the reader DID perform — the mixed feed is the reason the column exists at all.
    const signedIn = screen.getByRole('row', { name: /Signed in/ });
    expect(within(signedIn).getAllByText('me@example.com').length).toBeGreaterThan(0);
  });

  it('says what the row does and does not prove, in the same view as the row', async () => {
    await renderMyActivity();
    const note = screen.getByText(/Failed sign-ins against your email address/);
    // The correction the ux review caught: the commonest cause is the reader's own mistyped
    // password, and copy that opens with "someone tried to sign in as you" alarms them about it.
    expect(note).toHaveTextContent(/mistyped or out-of-date password/);
    expect(note).toHaveTextContent(/does not mean anyone got in/);
    expect(note).toHaveTextContent(/does not identify who tried/);
  });

  it('associates that note with the table rather than merely placing it above', async () => {
    // A landmark-navigating screen-reader user lands inside the table region; without this the
    // caveat is reachable only by reading serially.
    await renderMyActivity();
    const region = screen.getByRole('region', { name: 'My audit events' });
    const describedBy = region.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      /Failed sign-ins against your email address/,
    );
  });

  it('marks the failure as failed in text, not by colour alone', async () => {
    await renderMyActivity();
    const attempt = screen.getByRole('row', { name: /Sign-in failed/ });
    expect(within(attempt).getByText('Failed')).toBeInTheDocument();
  });
});
