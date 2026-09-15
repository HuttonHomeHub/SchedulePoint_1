import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CspReportRow } from '@/features/staff/api/staff-csp-reports';
import type { StaffHealth } from '@/features/staff/api/staff-health';
import type { StaffAccounts, StaffInstallation } from '@/features/staff/api/staff-panels';
import {
  CHECK_IDS,
  CHECK_SECTION_ID,
  deriveConsoleStatus,
  type CheckId,
  type ConsoleStatusInput,
} from '@/features/staff/model/console-status';
import { StaffStatusSummary } from '@/features/staff/ui/status-summary';

/**
 * **A link goes to the section that ANSWERS the check, not to the one whose name sounds closest.**
 *
 * `CHECK_SECTION_ID.alerting` pointed at the Installation card until the M6 gate pass, and two
 * reviewers found it independently. Installation renders the API version, the environment, the mail
 * host and the staff count; the alerting badges and the two sentences naming `MAIL_ALERT_URL` and
 * `HEARTBEAT_URL` are in the health card. A reader who saw "Failure alerting — Needs attention" and
 * activated the row was moved to, and focused on, a section containing nothing about it.
 *
 * **Everything that existed checked the mechanism and nothing checked the outcome**: the model suite
 * asserted `sectionId.length > 0`, the component suite asserted the href matched
 * `/^#staff-section-/`, and the journey asserted the target carried `tabindex="-1"`. All three pass
 * against a link pointing anywhere at all.
 *
 * So this asserts the pairing itself, from a **subject vocabulary** rather than from a second copy
 * of the mapping — a test that restates `CHECK_SECTION_ID` agrees with whatever that file says and
 * proves nothing. Each check declares the words its destination must be about; the destinations are
 * spelled out here because the assertion has to be able to disagree with the code.
 *
 * Verified red against `alerting: 'staff-section-installation'` as it shipped.
 */

/** What each check's destination must be able to talk about. Written from the reader's question. */
const SUBJECT: Record<CheckId, RegExp> = {
  mail: /mail/i,
  retention: /retention/i,
  security: /content-security-policy/i,
  accounts: /unverified accounts/i,
  // The badges and the two `Set …_URL` sentences, which is what an operator has come to read.
  alerting: /mail|alerting|heartbeat/i,
};

/** The heading each section id actually carries, as the page renders it. */
const SECTION_HEADING: Record<string, string> = {
  'staff-section-health': 'Mail and retention',
  'staff-section-security': 'Content-Security-Policy',
  'staff-section-accounts': 'Unverified accounts',
  'staff-section-installation': 'Installation',
};

const HEALTH: StaffHealth = {
  failuresLast24h: 0,
  failuresLastHour: 0,
  lastFailureAt: null,
  transportConfigured: false,
  alertingConfigured: false,
  heartbeatConfigured: false,
  recentFailures: [],
  retention: {
    enabled: false,
    intervalMinutes: 60,
    processStartedAt: '2026-09-14T00:00:00.000Z',
    lastRunAt: null,
    consecutiveFailures: 0,
    tables: [],
  },
};

const INSTALLATION: StaffInstallation = {
  apiVersion: '0.64.0',
  environment: 'development',
  requireEmailVerification: false,
  planEditLockEnforced: false,
  mailHost: null,
  mailAlertingConfigured: false,
  heartbeatConfigured: false,
  staffCount: 2,
};

const ACCOUNTS: StaffAccounts = {
  unverifiedTotal: 68,
  unverified: [],
  hasMore: false,
  nextCursor: null,
};

const settled = <T,>(data: T) => ({ isPending: false, isError: false, data });

const UNHEALTHY: ConsoleStatusInput = {
  health: settled(HEALTH),
  security: settled<CspReportRow[]>([]),
  accounts: settled(ACCOUNTS),
  installation: settled(INSTALLATION),
};

describe('every summary row links to the section that answers it', () => {
  /**
   * The pinned positive case. "Every check's destination is about its subject" passes perfectly over
   * a vocabulary that has gone empty, or a summary that renders no links at all — the shape ADR-0093
   * records, where a green suite cannot tell "the defect is gone" from "the subject is gone".
   */
  it('has a destination for every check, and a check for every destination', () => {
    expect(CHECK_IDS.length).toBeGreaterThan(0);
    for (const id of CHECK_IDS) {
      const section = CHECK_SECTION_ID[id];
      expect(
        SECTION_HEADING[section],
        `${id} points at "${section}", which this test does not know a heading for — either the ` +
          `page gained a section or the mapping points at nothing`,
      ).toBeDefined();
    }
  });

  it.each(CHECK_IDS)('sends %s somewhere that is about it', (id) => {
    const heading = SECTION_HEADING[CHECK_SECTION_ID[id]] ?? '';
    expect(
      SUBJECT[id].test(heading),
      `the "${id}" row links to "${heading}", which is not about ${id}. A reader who activates it ` +
        `is moved to, and focused on, a section that does not answer what they were just told.`,
    ).toBe(true);
  });

  /** And the rendered link really carries that destination, rather than the model merely holding it. */
  it('renders each row with its own destination', () => {
    render(<StaffStatusSummary status={deriveConsoleStatus(UNHEALTHY)} />);

    for (const id of CHECK_IDS) {
      const row = screen.getAllByRole('listitem').find((item) => {
        const link = within(item).queryByRole('link');
        return link?.getAttribute('href') === `#${CHECK_SECTION_ID[id]}`;
      });
      expect(row, `no row links to #${CHECK_SECTION_ID[id]} for "${id}"`).toBeDefined();
    }
  });
});
