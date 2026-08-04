import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Env from '@/config/env';

/**
 * The rollback contract for `VITE_AUDIT_FILTERS` (ADR-0073 C1).
 *
 * **Kept, never weakened, once the flag flips** — the ADR-0053 M6 rule. The day somebody needs the
 * rollback is the day this suite has to still mean something, and the thing it proves is narrower
 * and more useful than "the bar is hidden": it proves the client sends **the request it sent
 * before the filter existed**, byte for byte. A bar that renders nothing while the hook quietly
 * appends `action=` would look rolled back and would not be.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  AUDIT_FILTERS_ENABLED: false,
  AUDIT_LOG_ENABLED: true,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme' }),
  // A filter IS present in the URL, which is the case that matters: a rolled-back build must
  // ignore a link somebody saved while the flag was on rather than half-honour it.
  useSearch: () => ({ categories: 'access,deletions', outcome: 'DENIED', from: '2026-08-01' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/organizations', () => ({
  useOrganizations: () => ({ isPending: false, data: [] }),
}));

vi.mock('@/hooks/use-org-role', () => ({ useOrgRole: () => 'ORG_ADMIN' }));

const fetchMock = vi.fn();

function renderScreen(Screen: () => React.ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>,
  );
}

/** Every URL the client asked for during this test. */
function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('audit filter, flag OFF (rollback contract)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [], meta: { hasMore: false, nextCursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders no filter bar on the organisation log', async () => {
    const { AuditLogScreen } = await import('@/routes/audit-log');
    renderScreen(AuditLogScreen);
    await waitFor(() => {
      expect(requestedUrls().length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('radiogroup', { name: 'Outcome' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('renders no filter bar on My activity', async () => {
    const { MyActivityScreen } = await import('@/routes/my-activity');
    renderScreen(MyActivityScreen);
    await waitFor(() => {
      expect(requestedUrls().length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('radiogroup', { name: 'Outcome' })).not.toBeInTheDocument();
  });

  it('sends NO filter parameter, even with a filter sitting in the URL', async () => {
    // The assertion that makes this suite worth keeping. A saved link from a flag-on build must
    // change nothing about the request a rolled-back build makes.
    const { AuditLogScreen } = await import('@/routes/audit-log');
    renderScreen(AuditLogScreen);
    await waitFor(() => {
      expect(requestedUrls().length).toBeGreaterThan(0);
    });

    for (const url of requestedUrls()) {
      expect(url).not.toMatch(/[?&]action=/);
      expect(url).not.toMatch(/[?&]outcome=/);
      expect(url).not.toMatch(/[?&]from=/);
      expect(url).not.toMatch(/[?&]to=/);
    }
  });

  it('sends exactly the pre-filter request — limit and nothing else', async () => {
    const { AuditLogScreen } = await import('@/routes/audit-log');
    renderScreen(AuditLogScreen);
    await waitFor(() => {
      expect(requestedUrls().length).toBeGreaterThan(0);
    });

    const [url] = requestedUrls();
    expect(url).toContain('/organizations/acme/audit-events?limit=50');
    expect(new URL(url ?? '', 'http://localhost').searchParams.size).toBe(1);
  });
});
