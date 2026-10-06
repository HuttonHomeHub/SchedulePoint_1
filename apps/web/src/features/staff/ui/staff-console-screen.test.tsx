import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffConsoleScreen } from '@/features/staff/ui/staff-console-screen';

const apiFetch = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (path: string) => apiFetch(path),
  apiFetchEnvelope: (path: string) => apiFetch(path),
}));

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StaffConsoleScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  document.title = 'SchedulePoint';
  apiFetch.mockReset();
});
afterEach(() => {
  document.title = '';
});

describe('the console names itself only once it knows who is asking (M1-T5)', () => {
  it('keeps the document title while identity is pending', () => {
    // Verified red against `identity.data ? 'Staff console' : 'Not found'`, which set
    // "Not found · SchedulePoint" for the first moments of every staff visit.
    apiFetch.mockReturnValue(new Promise(() => undefined));
    mount();
    expect(document.title).toBe('SchedulePoint');
  });

  it('says "Not found" once a non-staff answer arrives', async () => {
    apiFetch.mockImplementation((path) =>
      path.endsWith('/staff/me') || path.includes('identity')
        ? Promise.resolve(null)
        : new Promise(() => undefined),
    );
    mount();
    await waitFor(() => {
      expect(document.title).toBe('Not found · SchedulePoint');
    });
  });
});

/**
 * **The audit cost is a unit-test property here as well as a journey one** (SC-4, SC-5). Every one
 * of these reads writes a `staff.panel_read` row to a table that refuses `DELETE`, so "six per load,
 * six per Refresh, and never Diagnostics" is asserted by counting the requests the real hooks make,
 * with the real cache, rather than by reading the code and believing it.
 */
const ME = { email: 'ops@schedulepoint.test', dualHatted: false };
const HEALTH = {
  failuresLast24h: 0,
  failuresLastHour: 0,
  lastFailureAt: null,
  transportConfigured: false,
  alertingConfigured: false,
  heartbeatConfigured: false,
  recentFailures: [],
  retention: {
    enabled: true,
    intervalMinutes: 60,
    processStartedAt: '2026-09-14T00:00:00.000Z',
    lastRunAt: '2026-09-14T01:00:00.000Z',
    consecutiveFailures: 0,
    tables: [],
  },
};
const INSTALLATION = {
  apiVersion: '0.88.0',
  environment: 'development',
  requireEmailVerification: false,
  planEditLockEnforced: true,
  mailHost: null,
  mailAlertingConfigured: false,
  heartbeatConfigured: false,
  staffCount: 1,
};
const person = (n: number) => ({
  id: `a${String(n)}`,
  email: `p${String(n)}@example.test`,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function answerStaff(path: string): Promise<unknown> {
  if (path.endsWith('/staff/me')) return Promise.resolve(ME);
  if (path === '/staff/health') return Promise.resolve(HEALTH);
  if (path === '/staff/csp-reports') return Promise.resolve([]);
  if (path === '/staff/installation') return Promise.resolve(INSTALLATION);
  if (path === '/staff/activity') return Promise.resolve([]);
  if (path === '/staff/probe-results') return Promise.resolve([]);
  if (path === '/staff/accounts') {
    return Promise.resolve({
      unverifiedTotal: 3,
      unverified: [person(1), person(2)],
      hasMore: true,
      nextCursor: 'c2',
    });
  }
  if (path.startsWith('/staff/accounts?cursor=')) {
    return Promise.resolve({
      unverifiedTotal: 3,
      unverified: [person(3)],
      hasMore: false,
      nextCursor: null,
    });
  }
  return Promise.reject(new Error(`unexpected request ${path}`));
}

const count = (path: string): number => apiFetch.mock.calls.filter(([p]) => p === path).length;
const SIX = [
  '/staff/health',
  '/staff/csp-reports',
  '/staff/accounts',
  '/staff/installation',
  '/staff/activity',
  '/staff/probe-results',
];

describe('the grouped console', () => {
  beforeEach(() => {
    apiFetch.mockImplementation(answerStaff);
  });

  it('reads each of the six once on load, and never runs diagnostics', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Conditions' });
    await waitFor(() => {
      expect(screen.getByText(/Read at/)).toBeInTheDocument();
    });

    for (const path of SIX) expect(count(path), path).toBe(1);
    expect(count('/staff/diagnostics')).toBe(0);
  });

  it('has one h1, an h2 per group in order, and no skipped level', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Conditions' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Status',
      'Conditions',
      'This installation',
      'Tools',
      'Record',
    ]);
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    levels.reduce((previous, level) => {
      expect(
        level - previous,
        `a heading jumps from h${String(previous)} to h${String(level)}`,
      ).toBeLessThanOrEqual(1);
      return level;
    }, 1);
  });

  it('keeps the setting name out of the DOM until How to fix is pressed', async () => {
    mount();
    const mail = await screen.findByRole('region', { name: 'Mail' });
    expect(mail.textContent).not.toContain('MAIL_SMTP_URL');

    const trigger = await within(mail).findByRole('button', { name: 'How to fix' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(mail).getByText('MAIL_SMTP_URL')).toBeInTheDocument();
  });

  it('speaks one sentence when the page settles, and none per box', async () => {
    mount();
    const announcer = await screen.findByTestId('announcer');
    await waitFor(() => {
      expect(announcer).toHaveTextContent(/^Staff console loaded\. 3 things need attention\.$/);
    });
    // The boxes' own regions hold nothing at rest: their resting sentences are plain text.
    const live = [...document.querySelectorAll('[aria-live="polite"]')].filter(
      (node) => node !== announcer,
    );
    expect(live.map((node) => node.textContent)).toEqual(live.map(() => ''));
  });

  /**
   * Refresh is six reads, however far the accounts list had been paged: an infinite query refetches
   * every page it holds, so without sending it back to page one a reader who pressed Show more would
   * make seven reads for one press. Verified red against a bare `refetchQueries` (accounts: 4).
   */
  it('refreshes exactly the six, with the accounts list back on its first page', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await screen.findByText('All 3 are shown.');
    expect(count('/staff/accounts?cursor=c2')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(count('/staff/health')).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    for (const path of SIX) expect(count(path), path).toBe(path === '/staff/accounts' ? 2 : 2);
    expect(count('/staff/accounts?cursor=c2')).toBe(1);
    expect(count('/staff/diagnostics')).toBe(0);
    expect(await screen.findByRole('button', { name: 'Show more' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Refreshed. 3 things need attention. Showing the first 2 unconfirmed accounts.',
      );
    });
  });

  it('offers Try again for all when two reads fail, and one retry heals both health boxes', async () => {
    apiFetch.mockImplementation((path) =>
      path === '/staff/health' ? Promise.reject(new Error('boom')) : answerStaff(path),
    );
    mount();
    await screen.findByText('2 things need attention; 2 could not be checked.');
    expect(screen.getByRole('button', { name: 'Try again for all' })).toBeInTheDocument();
    // Mail and Clearing old records are both unreadable and each says so; neither read is repeated
    // by showing it twice.
    expect(count('/staff/health')).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2);
  });
});
