import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Env from '@/config/env';

/**
 * The rollback contract for `VITE_AUDIT_SELF_SECURITY` (ADR-0073 C2).
 *
 * **Kept, never weakened, once the flag flips** — the ADR-0053 M6 rule. What it proves is narrower
 * and more useful than "the sentence is hidden": that a rolled-back build sends **no `include`
 * parameter at all**, so the server returns the pre-C2 result set. A screen that hid the
 * explanation while the hook still asked for attempts would look rolled back and would not be —
 * and the rows it then showed would be actor-less rows in a table with no actor column, which is
 * the single most misleading state this feature can produce.
 *
 * The API half is deliberately NOT covered here and cannot be: write-time attribution is a
 * server-side record, and a `VITE_` constant is a client build-time value (the ADR-0060 M0 rule).
 * Its parity is structural instead — absent `include`, the repository's `where` is unchanged.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  AUDIT_SELF_SECURITY_ENABLED: false,
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

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('self-security surface, flag OFF (rollback contract)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // A row, not an empty page. An empty table renders no column headers at all, so the
    // "no actor column" assertion below would pass flag-ON as well and prove nothing — which is
    // exactly what it did on its first run.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: '1',
              occurredAt: '2026-08-04T10:00:00.000Z',
              action: 'auth.signed_in',
              outcome: 'SUCCESS',
              actorType: 'USER',
              actorLabel: 'actor-column@example.com',
              subjectType: 'USER',
              subjectId: 'u1',
              subjectLabel: 'subject-column@example.com',
              changes: null,
              correlationId: null,
            },
          ],
          meta: { hasMore: false, nextCursor: null },
        }),
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
      expect(requestedUrls().length).toBeGreaterThan(0);
    });
  }

  it('sends NO include parameter', async () => {
    // The assertion the whole suite exists for.
    await renderMyActivity();
    for (const url of requestedUrls()) expect(url).not.toMatch(/[?&]include=/);
  });

  it('does not explain a row it will never show', async () => {
    await renderMyActivity();
    expect(
      screen.queryByText(/Failed sign-ins against your email address/),
    ).not.toBeInTheDocument();
  });

  it('shows no actor column, because every row is still the reader', async () => {
    await renderMyActivity();
    // Asserted on the CELL, not the header. `queryByRole('columnheader')` passed with the flag on
    // as well — so it proved nothing, the same vacuous shape this epic has now hit twice. The
    // actor's email appearing in a row is the thing that is actually true only when the column is
    // rendered.
    // The two labels differ deliberately: the subject column renders on this screen either way,
    // so a fixture using one address for both cannot tell the columns apart — which is how the
    // first version of this assertion failed for the wrong reason.
    await waitFor(() => {
      expect(screen.getByText('subject-column@example.com')).toBeInTheDocument();
    });
    expect(screen.queryByText('actor-column@example.com')).not.toBeInTheDocument();
  });
});
