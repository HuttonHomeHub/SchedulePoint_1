import { describe, expect, it } from 'vitest';

import {
  CHECK_IDS,
  deriveConsoleStatus,
  type ConsoleStatusInput,
  type QueryFacts,
} from './console-status';

import type { CspReportRow } from '@/features/staff/api/staff-csp-reports';
import type { StaffHealth } from '@/features/staff/api/staff-health';
import type { StaffAccounts, StaffInstallation } from '@/features/staff/api/staff-panels';

function settled<T>(data: T): QueryFacts<T> {
  return { isPending: false, isError: false, data };
}
const pending = { isPending: true, isError: false, data: undefined };
const failed = { isPending: false, isError: true, data: undefined };

function health(overrides: Partial<StaffHealth> = {}): StaffHealth {
  return {
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
      ...overrides.retention,
    },
    ...overrides,
  };
}

function installation(overrides: Partial<StaffInstallation> = {}): StaffInstallation {
  return {
    apiVersion: '0.64.0',
    environment: 'development',
    requireEmailVerification: false,
    planEditLockEnforced: false,
    mailHost: 'smtp.example.test',
    mailAlertingConfigured: true,
    heartbeatConfigured: true,
    staffCount: 2,
    ...overrides,
  };
}

function accounts(overrides: Partial<StaffAccounts> = {}): StaffAccounts {
  return { unverifiedTotal: 0, unverified: [], hasMore: false, nextCursor: null, ...overrides };
}

function allHealthy(): ConsoleStatusInput {
  return {
    health: settled(health()),
    security: settled<CspReportRow[]>([]),
    accounts: settled(accounts()),
    installation: settled(installation()),
  };
}

describe('deriveConsoleStatus', () => {
  it('reports every check, always, even when all are healthy', () => {
    const status = deriveConsoleStatus(allHealthy());

    expect(status.checks).toHaveLength(CHECK_IDS.length);
    expect(status.allHealthy).toBe(true);
    expect(status.problems).toEqual([]);
  });

  // The healthy sentence's whole job is that "nothing needs attention" cannot quietly come to cover
  // less than it claims. Asserting the CONTENT would let a check be dropped from the vocabulary with
  // the sentence still reading plausibly; asserting that the sentence NAMES each subject is what
  // makes a removal visible. `health-rows.ts` carries the same rule for the same reason.
  it('enumerates what was checked, so removing a check would change the sentence', () => {
    const status = deriveConsoleStatus(allHealthy());

    for (const id of CHECK_IDS) {
      const label = status.checks.find((check) => check.id === id)?.label ?? '';
      expect(status.sentence.toLowerCase()).toContain(label.toLowerCase());
    }
  });

  // The ADR-0125 `?? 'HEALTHY'` lie, in the two costumes it actually wears. A console that answers
  // "is anything wrong?" with "no" while a request is in flight, or while one failed, is worse than
  // one that says nothing — it answers the question the reader came with, wrongly.
  it('never calls a pending check healthy', () => {
    const status = deriveConsoleStatus({ ...allHealthy(), health: pending });

    expect(status.allHealthy).toBe(false);
    expect(status.checks.find((check) => check.id === 'mail')?.state).toBe('PENDING');
    expect(status.checks.find((check) => check.id === 'retention')?.state).toBe('PENDING');
  });

  it('never calls a failed check healthy', () => {
    const status = deriveConsoleStatus({ ...allHealthy(), security: failed });

    expect(status.allHealthy).toBe(false);
    expect(status.checks.find((check) => check.id === 'security')?.state).toBe('UNREADABLE');
  });

  it('treats settled-but-absent data as unreadable rather than healthy', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      accounts: { isPending: false, isError: false, data: undefined },
    });

    expect(status.checks.find((check) => check.id === 'accounts')?.state).toBe('UNREADABLE');
  });

  it('orders attention before unreadable before pending before healthy', () => {
    const status = deriveConsoleStatus({
      health: pending,
      security: failed,
      accounts: settled(accounts({ unverifiedTotal: 4 })),
      installation: settled(installation()),
    });

    expect(status.checks.map((check) => check.state)).toEqual([
      'ATTENTION',
      'UNREADABLE',
      'PENDING',
      'PENDING',
      'HEALTHY',
    ]);
  });

  it('names the number the claim rests on, not just that there is a problem', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      accounts: settled(accounts({ unverifiedTotal: 68 })),
    });

    expect(status.problems[0]?.sentence).toBe(
      '68 accounts cannot complete verification-gated sign-in.',
    );
  });

  it('says account rather than accounts for one', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      accounts: settled(accounts({ unverifiedTotal: 1 })),
    });

    expect(status.problems[0]?.sentence).toContain('1 account cannot');
  });

  // Mail's two failure modes are not the same fact, and the more alarming one is the quieter: zero
  // failures with NO TRANSPORT is not health, it means every send is being logged instead of
  // delivered — which looks identical in a count.
  it('reads a missing transport as attention even with zero failures', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      health: settled(health({ transportConfigured: false, failuresLast24h: 0 })),
    });

    expect(status.checks.find((check) => check.id === 'mail')?.state).toBe('ATTENTION');
    expect(status.checks.find((check) => check.id === 'mail')?.sentence).toContain(
      'No mail transport is configured',
    );
  });

  it('reports a disabled sweep ahead of overdue tables, since nothing is being deleted at all', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      health: settled(
        health({
          retention: {
            enabled: false,
            intervalMinutes: 60,
            processStartedAt: '2026-09-14T00:00:00.000Z',
            lastRunAt: null,
            consecutiveFailures: 0,
            tables: [],
          },
        }),
      ),
    });

    expect(status.checks.find((check) => check.id === 'retention')?.sentence).toContain(
      'Retention sweeping is disabled',
    );
  });

  // Alerting is its own check rather than a clause on mail's, because it is the one condition here
  // that is invisible by construction: with neither webhook set, everything else can go wrong and
  // the first anybody hears of it is somebody opening this console.
  it('reports unconfigured alerting as its own check, naming both halves', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      installation: settled(
        installation({ mailAlertingConfigured: false, heartbeatConfigured: false }),
      ),
    });

    const alerting = status.checks.find((check) => check.id === 'alerting');
    expect(alerting?.state).toBe('ATTENTION');
    expect(alerting?.sentence).toContain('mail failures or the API going down');
  });

  it('reports only the missing half when one webhook is set', () => {
    const status = deriveConsoleStatus({
      ...allHealthy(),
      installation: settled(
        installation({ mailAlertingConfigured: true, heartbeatConfigured: false }),
      ),
    });

    expect(status.checks.find((check) => check.id === 'alerting')?.sentence).toBe(
      'Nothing will report the API going down — only this screen will.',
    );
  });

  // The verdict is a WORD, never a colour alone (WCAG 1.4.1) — `health-rows.ts:20`'s rule, carried
  // here so the two surfaces cannot describe the same four states differently.
  it('gives every check a verdict word and a tone', () => {
    const status = deriveConsoleStatus({ ...allHealthy(), health: failed });

    for (const check of status.checks) {
      expect(check.verdictLabel.length).toBeGreaterThan(0);
      expect(['pass', 'fail', 'muted', 'info']).toContain(check.tone);
    }
    expect(status.checks.find((check) => check.id === 'mail')?.verdictLabel).toBe(
      'Could not be read',
    );
  });

  it('gives every check a section to link to', () => {
    const status = deriveConsoleStatus(allHealthy());

    for (const check of status.checks) expect(check.sectionId.length).toBeGreaterThan(0);
  });

  it('says nothing about a healthy check', () => {
    const status = deriveConsoleStatus(allHealthy());

    for (const check of status.checks) expect(check.sentence).toBeNull();
  });
});
