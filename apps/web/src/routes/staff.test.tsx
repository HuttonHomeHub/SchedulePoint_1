import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaffConsoleScreen } from './staff';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
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
      if (path === '/api/v1/staff/me') {
        return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test' });
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

  it('says a missing transport is NOT health', async () => {
    // Zero failures with no transport configured means every send is being logged rather than
    // delivered — identical in a count, and the state a stock deployment is actually in. A panel
    // that showed the number alone would report a broken installation as a healthy one.
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/staff/me') {
        return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test' });
      }
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
