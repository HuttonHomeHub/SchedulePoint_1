import { describe, expect, it, vi } from 'vitest';

import { RetentionStatusStore } from '../../common/operational/retention-status.store';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VersionService } from '../../version/version.service';

import { StaffHealthService } from './staff-health.service';

/**
 * The retention half of `GET /staff/health` (ADR-0087 M3).
 *
 * These tests are about the **states the console has to be able to tell apart** — never about the
 * delete, which is proven against a real Postgres in `test/retention-sweep.e2e-spec.ts` because a
 * mocked Prisma accepts any statement (ADR-0086 M2 shipped a feature that could not serve a single
 * request with 1,589 unit tests green).
 *
 * Each state here corresponds to a row of the spec's §4.9 table, and each pair of them is a
 * distinction the surface has to make in words: empty vs. zero days, has-not-run vs. deleted-nothing,
 * disabled vs. idle.
 */
const DAY = 24 * 60 * 60 * 1000;

function build(
  options: {
    enabled?: boolean;
    oldestCsp?: Date | null;
    oldestMail?: Date | null;
  } = {},
) {
  const prisma = {
    mailEvent: {
      count: vi.fn(() => Promise.resolve(0)),
      findFirst: vi.fn(({ orderBy }: { orderBy: unknown[] }) =>
        // The retention read orders ASC; the mail-health read orders DESC. Distinguished here so
        // one mock can serve both without either quietly answering the other's question.
        Promise.resolve(
          JSON.stringify(orderBy).includes('asc')
            ? options.oldestMail === undefined || options.oldestMail === null
              ? null
              : { occurredAt: options.oldestMail }
            : null,
        ),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    cspReport: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.oldestCsp === undefined || options.oldestCsp === null
            ? null
            : { lastSeenAt: options.oldestCsp },
        ),
      ),
    },
  } as unknown as PrismaService;

  const config = {
    mailSmtpUrl: undefined,
    mailAlertUrl: undefined,
    heartbeatUrl: undefined,
    retentionSweepEnabled: options.enabled ?? true,
    retentionCspReportsDays: 30,
    retentionMailEventsDays: 365,
    retentionSweepIntervalMinutes: 60,
  } as unknown as AppConfigService;

  const store = new RetentionStatusStore();
  const service = new StaffHealthService(
    prisma,
    config,
    { getVersion: () => '0.0.0' } as unknown as VersionService,
    store,
  );
  return { service, store };
}

describe('StaffHealthService retention', () => {
  it('reports every configured table, even one that has never been swept', async () => {
    const { service } = build();

    const { retention } = await service.read();

    expect(retention.tables.map((t) => t.table)).toEqual(['csp_reports', 'mail_events']);
    expect(retention.enabled).toBe(true);
    expect(retention.intervalMinutes).toBe(60);
  });

  it('distinguishes an EMPTY table from a table whose oldest row is new', async () => {
    // The distinction spec §4.9 names: `oldestAgeDays: 0` is a measurement, `null` is the absence
    // of anything to measure, and rendering the first as "0 days" for the second is how a panel
    // states a fact it does not have.
    const { service } = build({ oldestCsp: null, oldestMail: new Date() });

    const { retention } = await service.read();

    const csp = retention.tables.find((t) => t.table === 'csp_reports');
    const mail = retention.tables.find((t) => t.table === 'mail_events');
    expect(csp?.oldestAt).toBeNull();
    expect(csp?.oldestAgeDays).toBeNull();
    expect(mail?.oldestAgeDays).toBe(0);
    expect(mail?.oldestAt).not.toBeNull();
  });

  it('marks a table overdue from the DATA, with no sweep ever having run', async () => {
    // The load-bearing property. The store is empty — this process has swept nothing — and the
    // answer is still correct, because it is derived from the age of the oldest surviving row
    // rather than from the sweep's own bookkeeping. A last-run timestamp cannot tell "working"
    // from "never armed"; this can.
    const { service, store } = build({ oldestCsp: new Date(Date.now() - 400 * DAY) });

    const { retention } = await service.read();

    expect(store.snapshot().lastRunAt).toBeNull();
    expect(retention.lastRunAt).toBeNull();
    expect(retention.tables.find((t) => t.table === 'csp_reports')?.overdue).toBe(true);
  });

  it('is not overdue for a row inside its period', async () => {
    const { service } = build({ oldestCsp: new Date(Date.now() - 10 * DAY) });

    const { retention } = await service.read();

    expect(retention.tables.find((t) => t.table === 'csp_reports')?.overdue).toBe(false);
  });

  it('separates "has not swept" from "swept and deleted nothing"', async () => {
    // `lastDeleted: null` and `lastDeleted: 0` are different facts about the same table, and the
    // panel has to be able to say which. Collapsing them would make a dead sweep indistinguishable
    // from an idle one — the single failure this milestone exists to prevent.
    const { service, store } = build();

    const before = await service.read();
    expect(before.retention.tables[0]?.lastDeleted).toBeNull();

    store.record(
      [{ table: 'csp_reports', deleted: 0, batches: 1, cappedOut: false, durationMs: 1 }],
      new Date(),
    );
    const after = await service.read();

    expect(after.retention.tables[0]?.lastDeleted).toBe(0);
    expect(after.retention.lastRunAt).not.toBeNull();
  });

  it('carries the cap and the failure through, per table', async () => {
    const { service, store } = build();
    store.record(
      [
        { table: 'csp_reports', deleted: 50_000, batches: 50, cappedOut: true, durationMs: 900 },
        {
          table: 'mail_events',
          deleted: 0,
          batches: 0,
          cappedOut: false,
          durationMs: 2,
          error: 'PrismaClientKnownRequestError',
        },
      ],
      new Date(),
    );

    const { retention } = await service.read();

    expect(retention.tables.find((t) => t.table === 'csp_reports')?.cappedOut).toBe(true);
    expect(retention.tables.find((t) => t.table === 'mail_events')?.failed).toBe(true);
    expect(retention.consecutiveFailures).toBe(1);
  });

  it('marks every table failed when the run CRASHED before reaching any of them', async () => {
    // A run that throws reports nothing per table, so every row fell back to `failed: false` /
    // `lastDeleted: null` — byte-identical to "this process has not swept yet" — while `lastRunAt`
    // and `consecutiveFailures` said the opposite two fields away. That is the state-collapse this
    // whole section exists to prevent, wearing the panel's own clothes. Raised by the API review.
    const { service, store } = build();

    store.recordFailedRun(new Date());
    const { retention } = await service.read();

    expect(retention.tables.every((t) => t.failed)).toBe(true);
    expect(retention.lastRunAt).not.toBeNull();
    expect(retention.consecutiveFailures).toBe(1);
  });

  it('says the sweep is disabled, and still answers the derived question', async () => {
    // Disabled is a statement about the schedule, not about the data: an operator who has just
    // turned the sweep off still needs to know what is sitting in the tables.
    const { service } = build({ enabled: false, oldestCsp: new Date(Date.now() - 400 * DAY) });

    const { retention } = await service.read();

    expect(retention.enabled).toBe(false);
    expect(retention.tables.find((t) => t.table === 'csp_reports')?.overdue).toBe(true);
  });

  it('reports when the process started, so a null last-run can be read against something', async () => {
    const { service } = build();

    const { retention } = await service.read();

    expect(new Date(retention.processStartedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
