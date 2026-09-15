import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/**
 * The text of the panel's polite region — the `sr-only` `aria-live` sentence `Panel` renders.
 *
 * Read as text rather than queried by exact string, because the M2 merge made mail and retention
 * ONE card with ONE composed sentence, so each subject's clause is now a substring. Asserting on
 * the region rather than on the document is the part that must not be lost: the visible alerts say
 * the same words, so a document-wide query would stay green while the announced line went back to
 * claiming health during a failure — which is the exact defect the accessibility review found.
 *
 * Returns every polite region joined, so a future second one cannot silently drop out of the
 * assertion; today there is one per rendered `Panel`.
 */
/**
 * Assert a sentence inside a named section, not across the whole document.
 *
 * **Since the M3 summary, the console states each condition TWICE on purpose** — tersely at the top
 * ("No mail transport is configured, so nothing is being delivered.") and in full in the panel that
 * owns it ("… Every message is being written to the log instead of sent — which produces no
 * failures, and is why the counts below read as healthy."). A summary that did not name the
 * condition would not be a summary; FC-1 asks for exactly this. So five document-wide `getByText`
 * assertions became ambiguous, and scoping them is the fix rather than weakening them to `getAll`:
 * a `getAllByText(...).length > 0` would pass if the PANEL's sentence disappeared and only the
 * summary's remained, which is the half these tests are about.
 *
 * It is also the ADR-0073 C2.5 rule this file already cites one helper up: a document-scoped
 * assertion passed on a page's prose alone and proved nothing about the thing it named.
 */
function withinSection(name: string | RegExp): ReturnType<typeof within> {
  return within(screen.getByRole('region', { name }));
}

function politeRegionText(): string {
  return [...document.querySelectorAll('[aria-live="polite"]')]
    .map((node) => node.textContent ?? '')
    .join(' ');
}

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
  // `/staff/probe-results` joins the two list routes here. Named rather than left to the fallback:
  // the fallback returns the installation OBJECT, and a `DataTable` handed an object throws
  // `rows.map is not a function` — a failure that names neither the panel nor the route.
  if (
    path === '/staff/csp-reports' ||
    path === '/staff/activity' ||
    path === '/staff/probe-results'
  ) {
    return Promise.resolve([]);
  }
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
    await screen.findByRole('region', { name: 'Unverified accounts' });
    expect(
      withinSection('Unverified accounts').getByText(/3 accounts cannot complete/i),
    ).toBeInTheDocument();
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

  /**
   * **The grouping is wired, not merely written.** `groupActivity` has its own suite; this asserts
   * the panel actually renders through it, which is the seam ADR-0081 records milestones shipping
   * unreached — a pure model with unit tests and no caller looks finished from every angle except
   * the product.
   *
   * The fixture is one page load: six reads in the same second by one actor, which is what opening
   * this console writes. Before the grouping, fifty entries were seven of these and almost nothing
   * else.
   */
  it("collapses the console's own reads so the rows that matter are findable", async () => {
    const at = '2026-08-09T10:00:00.000Z';
    renderStaffWith({
      '/staff/activity': [
        ...['performance', 'installation', 'accounts', 'security', 'health', 'activity'].map(
          (panel, index) => ({
            id: `p${String(index)}`,
            occurredAt: at,
            action: 'staff.panel_read',
            actorLabel: 'ops@schedulepoint.test',
            subjectLabel: panel,
          }),
        ),
        {
          id: 'probe',
          occurredAt: '2026-08-09T09:59:00.000Z',
          action: 'staff.probe_recorded',
          actorLabel: 'ops@schedulepoint.test',
          subjectLabel: 'canvas-draw',
        },
      ],
    });

    // One row for the page load, naming every panel and its own size — nothing is hidden.
    expect(
      await screen.findByText(
        '6 panel reads · performance, installation, accounts, security, health, activity',
      ),
    ).toBeInTheDocument();
    // And the row that matters is no longer buried between six of them.
    expect(screen.getByText('probe recorded · canvas-draw')).toBeInTheDocument();
  });

  it('says an empty policy table is NOT proof the policy is clean', async () => {
    // The assertion that matters most on this panel. Delivery from a browser to the sink has never
    // been verified end to end (TECH_DEBT #117), so silence means "nothing arrived", not "nothing
    // happened" — and a reader who took an empty table as evidence would be misled on exactly the
    // decision the panel exists to inform.
    renderStaffWith({ '/staff/csp-reports': [] });

    expect(await screen.findByText(/No violations recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/not proof the policy is clean/i)).toBeInTheDocument();
  });

  /**
   * **The caveat qualifies the ROWS, so it renders when there are some.**
   *
   * It used to live in `DataTable`'s `empty` slot, which had it backwards in both directions: the
   * reader looking at three violations — the state where an under-count actually misleads — was
   * never told the list is a floor rather than a census, and the reader looking at none met the
   * message inside two frames, because a non-blank `empty` node is wrapped in `EMPTY_FRAME` and an
   * `Alert` brings its own. Only the second half was visible, and only in a photograph.
   *
   * Asserted with a row present, because the empty case above passes either way.
   */
  it('keeps the policy caveat when the table has rows, and wires it to the table', async () => {
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
          sourceFile: null,
          lineNumber: null,
          columnNumber: null,
        },
      ],
    });

    expect(await screen.findByText('script-src-elem')).toBeInTheDocument();
    const caveat = screen.getByText(/not proof the policy is clean/i).closest('[id]');
    expect(caveat).not.toBeNull();

    // A screen-reader user navigating by landmark lands INSIDE the table's region, so placement
    // above it is not enough (ADR-0073 C2.5). The link is what makes the caveat reachable there.
    const region = screen.getByRole('region', {
      name: /Distinct policy violations, most recent activity first/i,
    });
    expect(region.getAttribute('aria-describedby')).toBe(caveat?.getAttribute('id'));
  });

  /**
   * **Every caveat on this page is wired to the region it qualifies, and two were not.**
   *
   * `DataTable` is a focusable `role="region"`, so a screen-reader user navigating by landmark lands
   * INSIDE it having skipped whatever sits above — the ADR-0073 C2.5 finding. The retention notes
   * and the policy caveat were wired; the mail-transport note (which explains why the counts read as
   * healthy) and the `audit_events` note (which says the most sensitive table in the system is
   * deliberately not swept) were not, while the epic's own record listed all four as wired. Found by
   * the M6 accessibility review — an asserted-rather-than-checked claim about accessibility, which is
   * the one place this register has overstated before.
   *
   * Asserted as a resolution rather than as a string: every id a region names must be on the page.
   */
  it('wires every caveat to the region it qualifies, with nothing dangling', async () => {
    // No transport, so the note that explains why the counts read as healthy is on the page — it is
    // one of the two the review found unwired, and it renders only in this state.
    renderStaffWith({
      '/staff/health': {
        failuresLast24h: 0,
        failuresLastHour: 0,
        lastFailureAt: null,
        transportConfigured: false,
        alertingConfigured: true,
        heartbeatConfigured: true,
        // One failure, so the table renders as a `role="region"` rather than as its empty branch —
        // which is a plain `<div>` and therefore outside the sweep below.
        recentFailures: [
          {
            id: 'f1',
            occurredAt: '2026-09-14T10:00:00.000Z',
            kind: 'email_verification',
            recipient: 'someone@example.test',
            errorClass: 'ESOCKET',
          },
        ],
        retention: healthyRetention(),
      },
    });
    await screen.findByRole('heading', { name: 'Mail and retention' });

    const regions = screen.getAllByRole('region');
    const described = regions.filter((region) => region.hasAttribute('aria-describedby'));
    expect(described.length, 'no region carries a description at all').toBeGreaterThan(0);

    for (const region of described) {
      for (const id of (region.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)) {
        expect(
          document.getElementById(id),
          `a region points at "${id}", which is not on the page`,
        ).not.toBeNull();
      }
    }

    // The two the review found unwired, by the text each one carries.
    const ids = described.flatMap((region) =>
      (region.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
    );
    const text = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(text).toMatch(/written to the log instead of sent/i);
    expect(text).toMatch(/only tables swept on a schedule/i);
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

    await screen.findByRole('region', { name: 'Mail and retention' });
    expect(
      withinSection('Mail and retention').getByText(/No mail transport is configured/i),
    ).toBeInTheDocument();
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
describe('a failed refetch', () => {
  /**
   * **A failure must never render above the previous run's numbers** — the ADR-0140 M4 finding,
   * which applies to four panels here.
   *
   * `query.data` is NOT cleared by a failed refetch nor while one is in flight, so a panel written
   * as `{isError && <failure/>}` followed by `{data !== undefined && <content/>}` renders BOTH: a
   * red "could not read" sentence sitting directly above figures from the last successful read,
   * with nothing saying they are stale. It is the worst of the three possible states, because it
   * looks like a page that is partly working.
   *
   * Verified red against the code as it stood before this milestone, where both blocks rendered.
   */
  it('does not render stale figures beneath the failure message', async () => {
    let calls = 0;
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/staff/me') {
        return Promise.resolve({
          userId: 'u1',
          email: 'ops@schedulepoint.test',
          dualHatted: false,
        });
      }
      if (path !== '/staff/health') return otherPanels(path);
      calls += 1;
      // The first read succeeds and paints figures; every later one fails, which is what a refetch
      // after a transient outage looks like.
      if (calls > 1) return Promise.reject(new ApiFetchError(500, { code: 'X', message: 'boom' }));
      return Promise.resolve({
        failuresLast24h: 7,
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

    // The figures land.
    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    // Now make it fail, the way a reader would: the retry button.
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Could not read mail health.')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('7'),
      "the previous run's figures are still on screen beneath a failure message",
    ).toBeNull();
  });
});

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

    expect(
      withinSection('Mail and retention').getByText(/Retention sweeping is disabled/),
    ).toBeInTheDocument();
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

    expect(
      withinSection('Mail and retention').getByText(/The last 3 sweeps failed/),
    ).toBeInTheDocument();
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
    //
    // Read as the region's TEXT rather than by `getByText`, since the M2 merge: mail and retention
    // are one card and one polite sentence, so the retention clause is now a substring of it and an
    // exact-text query cannot see it. The property under test is unchanged — this region says the
    // sweep is failing and does not say everything is inside its period — and the discrimination
    // that matters is unchanged too, because it is still the sr-only region being read and not the
    // document.
    await waitFor(() => {
      expect(politeRegionText()).toContain('Retention: the last 3 sweeps failed.');
    });
    expect(politeRegionText()).not.toContain('Retention: every table is inside its period.');
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

    // **This asserted `getAllByRole('alert')` until ADR-0132**, using the live role as a proxy for
    // "which of the two treatments rendered". That proxy is gone deliberately: a stuck sweeper is a
    // standing condition, so its `Alert` is now `purpose="condition"` and carries no role — and a
    // test that went red here would otherwise read as the escalation having been lost.
    //
    // The discriminator is now the treatment itself, which is what the case was ever about: the
    // escalated rendering is an `Alert` — a bordered block with a leading icon — while the routine
    // just-booted case is a plain `<p>` with neither. Asserted in both directions so it cannot pass
    // against a third rendering that happens to have an icon.
    const escalated = screen.getByText(/has not swept yet/);
    expect(escalated.closest('p')).toBeNull();
    expect(escalated.parentElement?.querySelector('svg')).not.toBeNull();
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
      expect(politeRegionText()).toContain('Retention: every table is inside its period.');
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

  /**
   * **G3 — the standing conditions on this screen are not live regions** (ADR-0132, `#118` item 3).
   *
   * The console's caveats are facts about the installation: mail has no transport, retention is
   * disabled, the last sweeps failed. Each is rendered only once its query settles, so the region
   * and its content are inserted together — the unreliable case for a live region, and either way
   * it announces a standing condition as though something had just happened. Two of them were
   * `role="alert"`, i.e. **assertive**, produced by data arriving.
   *
   * **jsdom has no assistive technology.** These assertions are about rendered `role` attributes
   * and nothing else; nothing here establishes what a screen reader says. That limit is stated in
   * the file rather than only in the spec, because the file is what the next reader opens.
   *
   * **The pinned positive comes first, and it is not decoration.** Every assertion below is an
   * absence, and an absence is what a screen that rendered nothing also produces — so the caveat
   * sentences are asserted present before their roles are asserted gone. Without that this case
   * cannot tell "the conditions are correctly quiet" from "the panels never loaded", which is the
   * shape this repository keeps recording (ADR-0093; ADR-0120's own gate shipped it).
   */
  it('renders the installation caveats without making them live regions', async () => {
    renderStaffWith({
      '/staff/health': {
        failuresLast24h: 0,
        failuresLastHour: 0,
        lastFailureAt: null,
        // Four of the six conditions at once — as many as can coexist. `enabled: false` and a
        // stuck sweeper are mutually exclusive (a disabled sweeper computes no schedule sentence),
        // and `dualHatted` belongs to a different query. A screen showing one condition would pass
        // a weaker version of this case while leaving the rest unexercised.
        transportConfigured: false,
        alertingConfigured: false,
        heartbeatConfigured: false,
        recentFailures: [],
        retention: healthyRetention({ enabled: false, consecutiveFailures: 3 }),
      },
    });

    // ── The pinned positive: the conditions are on screen and readable.
    await screen.findByRole('region', { name: 'Mail and retention' });
    expect(
      withinSection('Mail and retention').getByText(/No mail transport is configured/),
    ).toBeInTheDocument();
    expect(
      withinSection('Mail and retention').getByText(/Retention sweeping is disabled/),
    ).toBeInTheDocument();

    // ── Nothing on this screen interrupts. `role="alert"` is assertive, and not one of the facts
    //    here is worth cutting across whatever a reader is doing.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // ── The panels' own polite regions survive, and they are the channel that should carry a
    //    change. Asserted by their live attribute rather than by role, because `Panel` uses
    //    `aria-live="polite"` on a paragraph and never `role="status"` — a role query would report
    //    zero here and read as "the announcements are gone".
    expect(document.querySelectorAll('[aria-live="polite"]').length).toBeGreaterThan(0);
  });
});
