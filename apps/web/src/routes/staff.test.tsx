import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/**
 * Empty-but-valid payloads for the panels a given test is not about.
 *
 * The console renders five panels, and a test interested in one of them should not have to know the
 * shape of the other four — but it does have to return something valid, because a query that
 * resolves to the wrong shape renders an error state and fails the test for a reason that has
 * nothing to do with what it asserts. Two existing tests broke exactly that way when the M5 panels
 * landed, which is what this is for.
 */
function otherPanels(path: string): Promise<unknown> {
  if (path === '/staff/csp-reports' || path === '/staff/activity') return Promise.resolve([]);
  if (path === '/staff/accounts') {
    return Promise.resolve({
      unverifiedTotal: 0,
      unverified: [],
      hasMore: false,
      nextCursor: null,
    });
  }
  return Promise.resolve({
    apiVersion: '0.47.1',
    environment: 'production',
    requireEmailVerification: true,
    planEditLockEnforced: false,
    mailHost: 'smtp.example:465',
    mailAlertingConfigured: true,
    heartbeatConfigured: false,
    staffCount: 2,
  });
}

/** Render the console with staff identity resolved and the given panel payloads. */
function renderStaffWith(payloads: Record<string, unknown>): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/staff/me') {
      return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test', dualHatted: false });
    }
    if (path in payloads) return Promise.resolve(payloads[path]);
    if (path !== '/staff/health') return otherPanels(path);
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
        return Promise.resolve({
          userId: 'u1',
          email: 'ops@schedulepoint.test',
          dualHatted: false,
        });
      }
      if (path !== '/staff/health' && path !== '/staff/csp-reports') return otherPanels(path);
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
    expect(await screen.findByText('script-src-elem')).toBeInTheDocument();
    // The source location is the part that names what to CHANGE — the blocked URI often cannot.
    expect(screen.getByText(/index-abc\.js:42/)).toBeInTheDocument();
  });

  it('shows the installation without ever showing a credential', async () => {
    // The panel's whole design constraint. `MAIL_SMTP_URL` is `smtps://user:PASSWORD@host:port`;
    // the API sends host and port as named scalars, so the password cannot reach the screen even if
    // somebody later adds a field to the config object.
    renderStaffWith({});

    expect(await screen.findByRole('heading', { name: 'Installation' })).toBeVisible();
    expect(await screen.findByText('smtp.example:465')).toBeInTheDocument();
    expect(screen.queryByText(/PASSWORD|password@/i)).not.toBeInTheDocument();
    expect(screen.getByText('Email verification: enforced')).toBeInTheDocument();
  });

  it('lists unverified accounts with the total beside the page', async () => {
    // The total answers a different question from the page — "deployment-wide, or one person?" —
    // and a reader should not have to page to the end to learn it.
    renderStaffWith({
      '/staff/accounts': {
        unverifiedTotal: 3,
        hasMore: false,
        nextCursor: null,
        unverified: [
          { id: 'u1', email: 'stuck@example.test', createdAt: '2026-08-01T00:00:00.000Z' },
        ],
      },
    });

    expect(await screen.findByRole('heading', { name: 'Unverified accounts' })).toBeVisible();
    expect(await screen.findByText(/3 accounts cannot complete/i)).toBeInTheDocument();
    expect(await screen.findByText('stuck@example.test')).toBeInTheDocument();
  });

  it('shows staff activity, which is the console holding itself to account', async () => {
    renderStaffWith({
      '/staff/activity': [
        {
          id: 'a1',
          occurredAt: '2026-08-09T10:00:00.000Z',
          action: 'staff.panel_read',
          actorLabel: 'ops@schedulepoint.test',
          subjectLabel: 'accounts',
        },
      ],
    });

    expect(await screen.findByRole('heading', { name: 'Staff activity' })).toBeVisible();
    expect(await screen.findByText(/panel read · accounts/i)).toBeInTheDocument();
  });

  it('says an empty policy table is NOT proof the policy is clean', async () => {
    // The assertion that matters most on this panel. Delivery from a browser to the sink has never
    // been verified end to end (TECH_DEBT #117), so silence means "nothing arrived", not "nothing
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
        return Promise.resolve({
          userId: 'u1',
          email: 'ops@schedulepoint.test',
          dualHatted: false,
        });
      }
      if (path !== '/staff/health') return otherPanels(path);
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

  it('names itself in the document title, on both landable states', async () => {
    // `/staff` is reached only by typing the address — there is deliberately no link to it — so the
    // title is the first thing a screen reader announces on arrival (WCAG 2.4.2). This was the one
    // sibling of the authenticated shell that skipped the hook every other public route calls.
    renderStaffWith({});
    expect(await screen.findByRole('heading', { name: 'Staff console' })).toBeVisible();
    expect(document.title).toContain('Staff console');
  });

  it('says which hat is active when the account is also a member', async () => {
    // ADR-0086 D4 permits dual-hatting rather than refusing it, and the compensation it named was
    // that the console says so. That was decided and never built until the UX review found it.
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test', dualHatted: true });
      }
      if (path === '/staff/health') {
        return Promise.resolve({
          failuresLast24h: 0,
          failuresLastHour: 0,
          lastFailureAt: null,
          transportConfigured: true,
          alertingConfigured: true,
          heartbeatConfigured: true,
          recentFailures: [],
        });
      }
      return otherPanels(path);
    });

    renderScreen();

    expect(await screen.findByText(/also an organisation member/i)).toBeInTheDocument();
  });

  it('offers a way to reach the accounts it says exist', async () => {
    // The API declared `hasMore` and the screen printed "More exist" with no way to get there — a
    // capability declared and not honoured, found independently by the API and UX reviews.
    const pages: Record<string, unknown> = {
      '/staff/accounts': {
        unverifiedTotal: 30,
        hasMore: true,
        nextCursor: 'u25',
        unverified: [
          { id: 'u1', email: 'first@example.test', createdAt: '2026-08-01T00:00:00.000Z' },
        ],
      },
      '/staff/accounts?cursor=u25': {
        unverifiedTotal: 30,
        hasMore: false,
        nextCursor: null,
        unverified: [
          { id: 'u26', email: 'later@example.test', createdAt: '2026-08-02T00:00:00.000Z' },
        ],
      },
    };
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({
          userId: 'u1',
          email: 'ops@schedulepoint.test',
          dualHatted: false,
        });
      }
      if (path in pages) return Promise.resolve(pages[path]);
      if (path === '/staff/health') {
        return Promise.resolve({
          failuresLast24h: 0,
          failuresLastHour: 0,
          lastFailureAt: null,
          transportConfigured: true,
          alertingConfigured: true,
          heartbeatConfigured: true,
          recentFailures: [],
        });
      }
      return otherPanels(path);
    });

    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /show older/i }));

    expect(await screen.findByText('later@example.test')).toBeInTheDocument();
  });
});
