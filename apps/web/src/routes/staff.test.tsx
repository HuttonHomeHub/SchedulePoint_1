import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaffConsoleScreen } from './staff';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * A note on the paths below, because this suite got it wrong and could not tell.
 *
 * `apiFetch` prefixes `API_BASE_URL`, which is already `/api/v1` — so a caller passes `/staff/me`,
 * not `/api/v1/staff/me`. The first version of this feature passed the full path, producing
 * `/api/v1/api/v1/staff/me`, and **these tests agreed with it**: they mock `apiFetch` and branch on
 * whatever string the code under test happens to pass, so a wrong path is self-consistent and
 * invisible here. Only the Playwright journey, which lets a real request reach a real API, could
 * see it — which is the argument for that journey landing with this milestone.
 *
 * **The gate is the test.** ADR-0086's whole surface argument is that a non-staff caller cannot
 * tell this console exists — so the assertions that matter are about what a 404 renders, not about
 * what a staff member sees.
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function notFound(): ApiFetchError {
  return new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Not found' });
}

/** Render the console with staff identity resolved and the given panel payloads. */
function renderStaffWith(payloads: Record<string, unknown>): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/staff/me') {
      return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test' });
    }
    if (path in payloads) return Promise.resolve(payloads[path]);
    return Promise.resolve({
      failuresLast24h: 0,
      failuresLastHour: 0,
      lastFailureAt: null,
      transportConfigured: true,
      alertingConfigured: true,
      heartbeatConfigured: true,
      recentFailures: [],
    });
  });
  renderScreen();
}

function renderScreen(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StaffConsoleScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('StaffConsoleScreen', () => {
  it('shows a plain "not found" to a non-staff caller — never "access denied"', async () => {
    // The API answers a non-staff caller with the same 404 it gives a route that does not exist.
    // The screen must say the same thing: "access denied" would confirm the surface exists and is
    // worth attacking, which is the oracle the guard's uniform 404 exists to close.
    vi.mocked(apiFetch).mockRejectedValue(notFound());

    renderScreen();

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.queryByText(/denied|permission|staff console/i)).not.toBeInTheDocument();
  });

  it('shows the same thing when the identity request fails outright', async () => {
    // A 500 must not become a more informative screen than a 404 — that would make "is this
    // address staff?" answerable by knocking the API over.
    vi.mocked(apiFetch).mockRejectedValue(new ApiFetchError(500, { code: 'X', message: 'boom' }));

    renderScreen();

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('renders the console and the mail panel for a staff caller', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test' });
      }
      if (path === '/staff/csp-reports') {
        return Promise.resolve([
          {
            id: 'c1',
            effectiveDirective: 'script-src-elem',
            blockedUri: 'inline',
            documentUri: 'https://app.example/sign-in',
            disposition: 'report',
            count: 12,
            firstSeenAt: '2026-08-09T09:00:00.000Z',
            lastSeenAt: '2026-08-09T10:00:00.000Z',
            sourceFile: 'https://app.example/assets/index-abc.js',
            lineNumber: 42,
            columnNumber: 7,
          },
        ]);
      }
      return Promise.resolve({
        failuresLast24h: 3,
        failuresLastHour: 1,
        lastFailureAt: '2026-08-09T10:00:00.000Z',
        transportConfigured: true,
        alertingConfigured: true,
        heartbeatConfigured: false,
        recentFailures: [
          {
            id: 'e1',
            occurredAt: '2026-08-09T10:00:00.000Z',
            kind: 'password_reset',
            outcome: 'FAILED',
            recipient: 'someone@example.test',
            errorClass: 'ECONNREFUSED',
          },
        ],
      });
    });

    renderScreen();

    expect(await screen.findByRole('heading', { name: 'Staff console' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mail' })).toBeInTheDocument();
    });
    expect(screen.getByText('ECONNREFUSED')).toBeInTheDocument();
    // CQ-1: a staff member may read the address. Asserted so a later "tidy-up" that domain-masks it
    // has to argue with a test rather than with a paragraph.
    expect(screen.getByText('someone@example.test')).toBeInTheDocument();
  });

  it('shows what the policy is blocking, and where the code is', async () => {
    renderStaffWith({
      '/staff/csp-reports': [
        {
          id: 'c1',
          effectiveDirective: 'script-src-elem',
          blockedUri: 'inline',
          documentUri: 'https://app.example/sign-in',
          disposition: 'report',
          count: 12,
          firstSeenAt: '2026-08-09T09:00:00.000Z',
          lastSeenAt: '2026-08-09T10:00:00.000Z',
          sourceFile: 'https://app.example/assets/index-abc.js',
          lineNumber: 42,
          columnNumber: 7,
        },
      ],
    });

    expect(await screen.findByRole('heading', { name: 'Content-Security-Policy' })).toBeVisible();
    expect(screen.getByText('script-src-elem')).toBeInTheDocument();
    // The source location is the part that names what to CHANGE — the blocked URI often cannot.
    expect(screen.getByText(/index-abc\.js:42/)).toBeInTheDocument();
  });

  it('says an empty policy table is NOT proof the policy is clean', async () => {
    // The assertion that matters most on this panel. Delivery from a browser to the sink has never
    // been verified end to end (TECH_DEBT #102), so silence means "nothing arrived", not "nothing
    // happened" — and a reader who took an empty table as evidence would be misled on exactly the
    // decision the panel exists to inform.
    renderStaffWith({ '/staff/csp-reports': [] });

    expect(await screen.findByText(/No violations recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/not yet proof the policy is clean/i)).toBeInTheDocument();
  });

  it('says a missing transport is NOT health', async () => {
    // Zero failures with no transport configured means every send is being logged rather than
    // delivered — identical in a count, and the state a stock deployment is actually in. A panel
    // that showed the number alone would report a broken installation as a healthy one.
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test' });
      }
      if (path === '/staff/csp-reports') return Promise.resolve([]);
      return Promise.resolve({
        failuresLast24h: 0,
        failuresLastHour: 0,
        lastFailureAt: null,
        transportConfigured: false,
        alertingConfigured: false,
        heartbeatConfigured: false,
        recentFailures: [],
      });
    });

    renderScreen();

    expect(await screen.findByText(/No mail transport is configured/i)).toBeInTheDocument();
    expect(screen.getByText('Failure alerting: off')).toBeInTheDocument();
    expect(screen.getByText('Heartbeat: off')).toBeInTheDocument();
  });
});
