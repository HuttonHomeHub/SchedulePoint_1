import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaffConsoleScreen } from './staff';

import type { Retention } from '@/features/staff/api/staff-health';
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

/**
 * A retention block with nothing wrong with it, for the tests that are about another panel.
 *
 * Typed as `Partial<Retention>` rather than `Record<string, unknown>`: untyped, a typo in an
 * override compiled, did nothing, and left the test either passing for the wrong reason or failing
 * at an assertion nowhere near the mistake. The sibling copy-model suite already got this right
 * (`retention-copy.test.ts`'s `row(over: Partial<RetentionTable>)`); the component review caught
 * that this one had not.
 */
function healthyRetention(over: Partial<Retention> = {}): Retention {
  return {
    enabled: true,
    intervalMinutes: 60,
    processStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastRunAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    consecutiveFailures: 0,
    tables: [
      {
        table: 'csp_reports',
        retentionDays: 30,
        oldestAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        oldestAgeDays: 2,
        overdue: false,
        lastDeleted: 0,
        cappedOut: false,
        failed: false,
      },
      {
        table: 'mail_events',
        retentionDays: 365,
        oldestAt: null,
        oldestAgeDays: null,
        overdue: false,
        lastDeleted: 0,
        cappedOut: false,
        failed: false,
      },
    ],
    ...over,
  };
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
      retention: healthyRetention(),
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
        retention: healthyRetention(),
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
        retention: healthyRetention(),
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
          retention: healthyRetention(),
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
          retention: healthyRetention(),
        });
      }
      return otherPanels(path);
    });

    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /show older/i }));

    expect(await screen.findByText('later@example.test')).toBeInTheDocument();
  });
});

/**
 * The Retention section (ADR-0087 M3).
 *
 * Every state in spec §4.9 is rendered and asserted, because ADR-0059 M6, ADR-0062 M6 and
 * ADR-0064 §7 all record that this is precisely where the defects live — a control that renders,
 * looks right, and states something the response does not say.
 */
async function renderRetention(
  over: Partial<Retention>,
  options: { alertingConfigured?: boolean } = {},
): Promise<void> {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/staff/me') {
      return Promise.resolve({ userId: 'u1', email: 'ops@schedulepoint.test', dualHatted: false });
    }
    if (path !== '/staff/health') return otherPanels(path);
    return Promise.resolve({
      failuresLast24h: 0,
      failuresLastHour: 0,
      lastFailureAt: null,
      transportConfigured: true,
      alertingConfigured: options.alertingConfigured ?? true,
      heartbeatConfigured: true,
      recentFailures: [],
      retention: healthyRetention(over),
    });
  });
  renderScreen();
  // Waits for the panel's CONTENT, not its heading. The heading renders while the query is still
  // pending, so awaiting it and then reading synchronously asserts against the spinner — which is
  // how the first version of these six tests failed with the panel working perfectly.
  await screen.findByText('Retention by table');
}

describe('the Retention section', () => {
  it('names each table and its configured period', async () => {
    await renderRetention({});

    expect(screen.getByText('Policy violation reports')).toBeInTheDocument();
    expect(screen.getByText('Mail events')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('365 days')).toBeInTheDocument();
  });

  it('says "no rows" for an empty table, never "0 days"', async () => {
    // The fixture's `mail_events` is empty. Printing a measurement for a table with nothing to
    // measure states a fact the response does not carry.
    await renderRetention({});

    expect(screen.getByText('no rows')).toBeInTheDocument();
  });

  it('marks an overdue table in WORDS, with the number the claim rests on', async () => {
    // WCAG 1.4.1: the badge repeats the meaning, it never carries it alone.
    await renderRetention({
      tables: [
        {
          table: 'csp_reports',
          retentionDays: 30,
          oldestAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
          oldestAgeDays: 400,
          overdue: true,
          lastDeleted: null,
          cappedOut: false,
          failed: false,
        },
      ],
    });

    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/400 days old against a 30-day period/)).toBeInTheDocument();
  });

  it('shows NO last-run time when the sweep is disabled', async () => {
    // A timestamp beside "disabled" reads as health. The two facts are mutually exclusive in the
    // copy, not merely ordered — asserted through the DOM as well as in the copy unit test,
    // because the panel could reintroduce it beside the sentence rather than inside it.
    await renderRetention({ enabled: false, lastRunAt: new Date().toISOString() });

    expect(screen.getByText(/Retention sweeping is disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/Last swept/)).not.toBeInTheDocument();
  });

  it('tells a process that has not swept from one that swept and deleted nothing', async () => {
    await renderRetention({
      lastRunAt: null,
      processStartedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      tables: [
        {
          table: 'csp_reports',
          retentionDays: 30,
          oldestAt: null,
          oldestAgeDays: null,
          overdue: false,
          lastDeleted: null,
          cappedOut: false,
          failed: false,
        },
      ],
    });

    expect(screen.getByText(/has not swept yet/)).toBeInTheDocument();
    expect(screen.getByText(/started 3 days ago/)).toBeInTheDocument();
    expect(screen.getByText('Not swept yet')).toBeInTheDocument();
  });

  it('surfaces a run of failures, and says where the reason is', async () => {
    await renderRetention({ consecutiveFailures: 3 });

    expect(screen.getByText(/The last 3 sweeps failed/)).toBeInTheDocument();
    expect(screen.getByText(/retention\.sweep_failed/)).toBeInTheDocument();
  });

  it('says whether anyone OUTSIDE this screen was told', async () => {
    // The deployed host has no MAIL_ALERT_URL, so the commonest real reading of this alert is
    // "somebody has been paged" and the commonest truth is "you are the only one who knows". The
    // Mail panel above already discloses this for its own failures; the UX review found that the
    // panel most likely to be misread did not.
    await renderRetention({ consecutiveFailures: 3 }, { alertingConfigured: false });

    expect(screen.getByText(/Nobody has been notified/)).toBeInTheDocument();
  });

  it('says an alert WAS sent when a webhook is configured', async () => {
    await renderRetention({ consecutiveFailures: 3 }, { alertingConfigured: true });

    expect(screen.getByText(/An alert was sent to your webhook/)).toBeInTheDocument();
  });

  it('never announces "every table is inside its period" while the sweep is failing', async () => {
    // The accessibility review's finding, asserted through the DOM as well as in the copy unit
    // test: the polite region is the one channel that states the settled result, and it said the
    // opposite of the visible alert two elements away.
    await renderRetention({ consecutiveFailures: 3 });

    // Asserted on the POLITE REGION specifically, not on the document: the visible alert says the
    // same words, and matching either would let the sr-only line go back to claiming health while
    // the test stayed green — which is exactly the shape of the defect.
    await waitFor(() => {
      expect(screen.getByText('Retention: the last 3 sweeps failed.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Retention: every table is inside its period.')).toBeNull();
  });

  it('ties the disabled and failing caveats to the table they qualify', async () => {
    // `DataTable` is a focusable `role="region"`, so a reader navigating by landmark lands INSIDE
    // it and skips whatever sits above — which here is the sentence saying the ages below will keep
    // growing. `describedById` is the established fix; this pins that it is actually passed.
    await renderRetention({ enabled: false, consecutiveFailures: 3 });

    const region = screen.getByRole('region', { name: 'Retention by table' });
    const described = region.getAttribute('aria-describedby') ?? '';
    expect(described).toContain('retention-disabled-note');
    expect(described).toContain('retention-failing-note');
  });

  it('escalates a process that has gone a whole interval without sweeping', async () => {
    await renderRetention({
      lastRunAt: null,
      processStartedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // `role="alert"` is `Alert tone="error"`; the routine just-booted case renders a plain
    // paragraph, so this asserts the escalation rather than merely the words.
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes('has not swept yet'))).toBe(true);
  });

  it('states that audit_events is deliberately NOT swept', async () => {
    // "Every table is inside its period" otherwise invites the reader to conclude everything is
    // bounded, and the most sensitive table in the system is deliberately not.
    await renderRetention({});

    expect(screen.getByText(/refuses/)).toBeInTheDocument();
    expect(screen.getByText('audit_events')).toBeInTheDocument();
  });

  it('announces its settled state politely', async () => {
    // The ADR-0086 M6 accessibility fix, applied to the new panel rather than left to the next
    // review to find: each panel's `Spinner` unmounts silently, so without this a screen-reader
    // user has to re-explore the page to learn that a panel has finished.
    await renderRetention({});

    await waitFor(() => {
      expect(screen.getByText('Retention: every table is inside its period.')).toBeInTheDocument();
    });
  });

  it('offers a retry rather than a dead end when the read fails', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({
          userId: 'u1',
          email: 'ops@schedulepoint.test',
          dualHatted: false,
        });
      }
      if (path === '/staff/health') return Promise.reject(new Error('boom'));
      return otherPanels(path);
    });

    renderScreen();

    await screen.findByRole('heading', { name: 'Retention' });
    expect(await screen.findByText('Could not read retention state.')).toBeInTheDocument();
  });
});
