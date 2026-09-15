import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StaffStatusSummary } from './status-summary';

import type { CspReportRow } from '@/features/staff/api/staff-csp-reports';
import type { StaffHealth } from '@/features/staff/api/staff-health';
import type { StaffAccounts, StaffInstallation } from '@/features/staff/api/staff-panels';
import {
  deriveConsoleStatus,
  type ConsoleStatusInput,
} from '@/features/staff/model/console-status';

function settled<T>(data: T) {
  return { isPending: false, isError: false, data };
}

const HEALTH: StaffHealth = {
  failuresLast24h: 0,
  failuresLastHour: 0,
  lastFailureAt: null,
  transportConfigured: true,
  alertingConfigured: true,
  heartbeatConfigured: true,
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

const INSTALLATION: StaffInstallation = {
  apiVersion: '0.64.0',
  environment: 'development',
  requireEmailVerification: false,
  planEditLockEnforced: false,
  mailHost: 'smtp.example.test',
  mailAlertingConfigured: true,
  heartbeatConfigured: true,
  staffCount: 2,
};

const ACCOUNTS: StaffAccounts = {
  unverifiedTotal: 0,
  unverified: [],
  hasMore: false,
  nextCursor: null,
};

function healthy(): ConsoleStatusInput {
  return {
    health: settled(HEALTH),
    security: settled<CspReportRow[]>([]),
    accounts: settled(ACCOUNTS),
    installation: settled(INSTALLATION),
  };
}

function renderSummary(input: ConsoleStatusInput = healthy()): HTMLElement {
  const { container } = render(<StaffStatusSummary status={deriveConsoleStatus(input)} />);
  return container;
}

describe('StaffStatusSummary', () => {
  /**
   * **The pinned decision: this is NOT a live region**, and the assertion covers both mechanisms.
   *
   * ADR-0132's discriminator is whether the sentence would read the same to somebody who arrived
   * five minutes later and did nothing — and every condition here is a standing fact about the
   * installation, so it would. Announcing one as an event says something happened when nothing did.
   *
   * The `aria-live` half is the accessibility review's (spec §8.11), and it is not redundant with
   * the `role` half: **`aria-live="polite"` with no `role` at all is still a live region.** `Alert`
   * never sets it, so the point would be moot if this component reused `Alert` — but it does not,
   * and nothing else stops a later author adding one to make the page "feel responsive".
   */
  it('is not a live region, by either mechanism', () => {
    const container = renderSummary();

    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  // Rows always, whatever the verdict. The first design rendered a sentence when healthy and rows
  // when not — two shapes for one component, which is the defect this epic exists to remove, and it
  // buries PENDING and UNREADABLE in a clause instead of giving each a line.
  it('renders a row per check when everything is healthy', () => {
    renderSummary();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Mail delivery' })).toBeInTheDocument();
  });

  it('renders the same rows when things are wrong', () => {
    renderSummary({
      ...healthy(),
      health: settled({ ...HEALTH, transportConfigured: false }),
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  // The verdict is a WORD, never a colour alone (WCAG 1.4.1).
  it('states each verdict in words', () => {
    renderSummary({
      ...healthy(),
      health: settled({ ...HEALTH, transportConfigured: false }),
    });

    expect(screen.getAllByText('OK').length).toBeGreaterThan(0);
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('puts what needs attention first', () => {
    renderSummary({
      ...healthy(),
      accounts: settled({ ...ACCOUNTS, unverifiedTotal: 68 }),
    });

    const first = screen.getAllByRole('listitem')[0];
    expect(within(first!).getByRole('link')).toHaveAccessibleName('Account verification');
  });

  it('names the number the claim rests on', () => {
    renderSummary({
      ...healthy(),
      accounts: settled({ ...ACCOUNTS, unverifiedTotal: 68 }),
    });

    expect(
      screen.getByText('68 accounts cannot complete verification-gated sign-in.'),
    ).toBeInTheDocument();
  });

  /**
   * Every row links to the section that answers it — and the link is what makes the summary a
   * navigation surface rather than a second place the same facts are written.
   *
   * A real `<a href="#…">` rather than a script-driven scroll: it is focusable, it has the keyboard
   * and middle-click contract the platform already provides, and `SectionCard` was widened with
   * `id` + `tabIndex={-1}` specifically so the destination can receive focus. An anchor that moves
   * the viewport without moving focus leaves a keyboard reader where they were, looking at
   * something else.
   */
  it('links every row to a section', () => {
    renderSummary();

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^#staff-section-/);
    }
  });
});
