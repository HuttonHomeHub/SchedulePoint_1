import { describe, expect, it } from 'vitest';

import {
  CHECK_IDS,
  CHECK_SECTION_ID,
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

const NOW = new Date('2026-09-14T03:00:00.000Z');
const derive = (input: ConsoleStatusInput) => deriveConsoleStatus(input, NOW);
const valueOf = (status: ReturnType<typeof derive>, id: (typeof CHECK_IDS)[number]) =>
  status.checks.find((check) => check.id === id)?.value;

describe('deriveConsoleStatus', () => {
  it('reports every check, always, even when all are healthy', () => {
    const status = derive(allHealthy());

    expect(status.checks).toHaveLength(CHECK_IDS.length);
    expect(status.allHealthy).toBe(true);
    expect(status.problems).toEqual([]);
    expect(status.sentence).toBe('Nothing needs attention.');
  });

  /**
   * **The rows keep the page's order in every state** (ADR-0178 D-11, amending ADR-0143 D1). The
   * severity sort moved the same row to a different place from one visit to the next — measured in
   * M0, where Failure alerting went from second to last between two states — so a reader could not
   * find a row by where it was. Verified red against the severity sort.
   */
  it('keeps one fixed order whatever the states', () => {
    const order = CHECK_IDS.map((id) => id);
    const mixed = derive({
      health: pending,
      security: failed,
      accounts: settled(accounts({ unverifiedTotal: 4 })),
      installation: settled(installation()),
    });

    expect(mixed.checks.map((check) => check.id)).toEqual(order);
    expect(derive(allHealthy()).checks.map((check) => check.id)).toEqual(order);
    expect(
      derive({
        health: failed,
        security: failed,
        accounts: failed,
        installation: failed,
      }).checks.map((check) => check.id),
    ).toEqual(order);
  });

  it('gives each check its own destination (SC-3)', () => {
    const ids = CHECK_IDS.map((id) => CHECK_SECTION_ID[id]);
    expect(new Set(ids).size).toBe(CHECK_IDS.length);
  });

  describe('the headline is grammatical and counted', () => {
    it('says "1 thing needs attention."', () => {
      const status = derive({
        ...allHealthy(),
        accounts: settled(accounts({ unverifiedTotal: 3 })),
      });
      expect(status.sentence).toBe('1 thing needs attention.');
    });

    it('says "2 things need attention." rather than "2 of 5 checks needs attention: …"', () => {
      const status = derive({
        ...allHealthy(),
        health: settled(health({ transportConfigured: false })),
        accounts: settled(accounts({ unverifiedTotal: 3 })),
      });
      expect(status.sentence).toBe('2 things need attention.');
    });

    /**
     * **Still checking is not "everything needs attention".** The first paint of an ordinary load
     * once read "5 of 5 checks need attention" before any query had settled (M6 UX review).
     */
    it('says it is checking rather than that everything needs attention', () => {
      const status = derive({
        health: pending,
        security: pending,
        accounts: pending,
        installation: pending,
      });

      expect(status.sentence).toBe('Checking…');
    });

    it('says a failed read could not be checked, which is not the same as needing attention', () => {
      const status = derive({
        health: failed,
        security: failed,
        accounts: failed,
        installation: failed,
      });

      expect(status.sentence).toBe('5 could not be checked.');
      expect(status.unreadableCount).toBe(5);
    });

    /** A mixed page says all three things rather than picking the loudest and hiding the rest. */
    it('states attention, unreadable and pending together when all are present', () => {
      const status = derive({
        ...allHealthy(),
        health: settled(health({ transportConfigured: false })),
        security: failed,
        accounts: pending,
      });

      expect(status.sentence).toBe(
        '1 thing needs attention; 1 could not be checked; 1 still being checked.',
      );
    });
  });

  // The ADR-0125 `?? 'HEALTHY'` lie, in the two costumes it actually wears. A console that answers
  // "is anything wrong?" with "no" while a request is in flight, or while one failed, is worse than
  // one that says nothing — it answers the question the reader came with, wrongly.
  it('never calls a pending check healthy', () => {
    const status = derive({ ...allHealthy(), health: pending });

    expect(status.allHealthy).toBe(false);
    expect(status.checks.find((check) => check.id === 'mail')?.state).toBe('PENDING');
    expect(valueOf(status, 'mail')).toBe('Checking…');
  });

  it('never calls a failed check healthy, and says where to look', () => {
    const status = derive({ ...allHealthy(), security: failed });

    expect(status.allHealthy).toBe(false);
    expect(status.checks.find((check) => check.id === 'security')?.state).toBe('UNREADABLE');
    expect(valueOf(status, 'security')).toBe("Couldn't load. See the box below");
  });

  it('treats settled-but-absent data as unreadable rather than healthy', () => {
    const status = derive({
      ...allHealthy(),
      accounts: { isPending: false, isError: false, data: undefined },
    });

    expect(status.checks.find((check) => check.id === 'accounts')?.state).toBe('UNREADABLE');
  });

  describe('every state states a value (SC-12, US-2)', () => {
    it('says what is wrong with mail, with the number the claim rests on', () => {
      expect(
        valueOf(
          derive({ ...allHealthy(), health: settled(health({ transportConfigured: false })) }),
          'mail',
        ),
      ).toBe("Not set up: emails aren't being sent");
      expect(
        valueOf(
          derive({ ...allHealthy(), health: settled(health({ failuresLast24h: 4 })) }),
          'mail',
        ),
      ).toBe('4 failed in the last 24 hours');
      expect(valueOf(derive(allHealthy()), 'mail')).toBe(
        'Working: none failed in the last 24 hours',
      );
    });

    /**
     * Zero failures with no transport is not health: every send is being logged instead of
     * delivered, which looks identical in a count. Not-set-up is therefore reported first.
     */
    it('reads a missing transport as attention even with zero failures', () => {
      const status = derive({
        ...allHealthy(),
        health: settled(health({ transportConfigured: false, failuresLast24h: 0 })),
      });
      expect(status.checks.find((check) => check.id === 'mail')?.state).toBe('ATTENTION');
    });

    it('reports a switched-off sweep, failing runs, overdue kinds and a healthy last run', () => {
      const retention = (over: Partial<StaffHealth['retention']>) =>
        valueOf(
          derive({
            ...allHealthy(),
            health: settled(health({ retention: { ...health().retention, ...over } })),
          }),
          'retention',
        );

      expect(retention({ enabled: false })).toBe('Switched off: old records are piling up');
      expect(retention({ consecutiveFailures: 3 })).toBe('Last 3 runs failed');
      expect(retention({ consecutiveFailures: 1 })).toBe('Last 1 run failed');
      expect(
        retention({
          tables: [
            {
              table: 'csp_reports',
              retentionDays: 30,
              oldestAt: null,
              oldestAgeDays: 40,
              overdue: true,
              lastDeleted: 0,
              cappedOut: false,
              failed: false,
            },
          ],
        }),
      ).toBe('1 kind of record overdue');
      expect(retention({})).toBe('Ran 2 hours ago');
      expect(retention({ lastRunAt: null })).toBe('Has not run yet');
    });

    it('counts security kinds and times', () => {
      const row = (count: number): CspReportRow => ({
        id: String(count),
        effectiveDirective: 'script-src',
        blockedUri: 'https://x.test',
        documentUri: 'https://app.test',
        disposition: 'report',
        count,
        firstSeenAt: '2026-09-14T00:00:00.000Z',
        lastSeenAt: '2026-09-14T00:00:00.000Z',
        sourceFile: null,
        lineNumber: null,
        columnNumber: null,
      });
      expect(valueOf(derive(allHealthy()), 'security')).toBe('None received');
      expect(
        valueOf(derive({ ...allHealthy(), security: settled([row(2), row(3)]) }), 'security'),
      ).toBe('2 kinds blocked, 5 times');
      expect(valueOf(derive({ ...allHealthy(), security: settled([row(1)]) }), 'security')).toBe(
        '1 kind blocked, 1 time',
      );
    });

    it('counts people who cannot sign in', () => {
      expect(valueOf(derive(allHealthy()), 'accounts')).toBe('None');
      expect(
        valueOf(
          derive({ ...allHealthy(), accounts: settled(accounts({ unverifiedTotal: 68 })) }),
          'accounts',
        ),
      ).toBe("68 people can't sign in yet");
      expect(
        valueOf(
          derive({ ...allHealthy(), accounts: settled(accounts({ unverifiedTotal: 1 })) }),
          'accounts',
        ),
      ).toBe("1 person can't sign in yet");
    });

    // Alerting is its own check, because it is the one condition invisible by construction: with
    // neither webhook set, everything else can go wrong and the first anybody hears of it is
    // somebody opening this console.
    it('says which half of alerting is off', () => {
      const alerting = (over: Partial<StaffInstallation>) =>
        valueOf(derive({ ...allHealthy(), installation: settled(installation(over)) }), 'alerting');

      expect(alerting({ mailAlertingConfigured: false, heartbeatConfigured: false })).toBe(
        'Off: nobody is told when something fails',
      );
      expect(alerting({ heartbeatConfigured: false })).toBe('Partly on: uptime check off');
      expect(alerting({ mailAlertingConfigured: false })).toBe('Partly on: mail alerts off');
      expect(alerting({})).toBe('On');
    });
  });

  // The verdict is a WORD, never a colour alone (WCAG 1.4.1) — `health-rows.ts:20`'s rule, carried
  // here so the two surfaces cannot describe the same four states differently.
  it('gives every check a verdict word and a tone', () => {
    const status = derive({ ...allHealthy(), health: failed });

    for (const check of status.checks) {
      expect(check.verdictLabel.length).toBeGreaterThan(0);
      expect(['pass', 'fail', 'muted', 'info']).toContain(check.tone);
    }
    expect(status.checks.find((check) => check.id === 'mail')?.verdictLabel).toBe(
      'Could not be read',
    );
  });
});
