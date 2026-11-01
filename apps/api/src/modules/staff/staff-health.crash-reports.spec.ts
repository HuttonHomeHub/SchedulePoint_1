import { describe, expect, it, vi } from 'vitest';

import { RetentionStatusStore } from '../../common/operational/retention-status.store';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VersionService } from '../../version/version.service';

import { StaffHealthService } from './staff-health.service';

/**
 * The Screen crashes read (ADR-0211). The statements themselves are proved against a real
 * Postgres in `test/staff.e2e-spec.ts`; these tests pin what the service DECIDES: how a row is
 * shown, and the cap verdict, which the panel turns into the sentence "new kinds of crash are not
 * being recorded".
 */
function build(total: number, seen: number, rows: unknown[] = []) {
  const findMany = vi.fn(() => Promise.resolve(rows));
  const prisma = {
    crashReport: {
      findMany,
      // The unfiltered count is the total; the one with a `where` is the 7-day count.
      count: vi.fn((args?: unknown) => Promise.resolve(args === undefined ? total : seen)),
    },
  } as unknown as PrismaService;
  const service = new StaffHealthService(
    prisma,
    {} as AppConfigService,
    { getVersion: () => '0.0.0' } as unknown as VersionService,
    new RetentionStatusStore(),
  );
  return { service, findMany };
}

const ROW = {
  id: '0196b0a0-0000-7000-8000-000000000001',
  dedupeHash: 'abcdef0123456789',
  boundary: 'route',
  errorName: 'TypeError',
  message: "Cannot read properties of null (reading 'startAt')",
  routePattern: '/_authed/orgs/$orgSlug/plans/$planId',
  webVersion: '0.200.7',
  browser: 'chrome',
  browserMajor: 131,
  stack: 'fn @ /assets/a',
  componentStack: null,
  count: 3,
  firstSeenAt: new Date('2026-11-01T10:00:00.000Z'),
  lastSeenAt: new Date('2026-11-01T11:00:00.000Z'),
};

describe('StaffHealthService.crashReports', () => {
  it('reads newest first, on the (last_seen_at, id) index, at most 50', async () => {
    const { service, findMany } = build(0, 0);

    await service.crashReports();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  });

  it('shows a row with its reference and ISO dates, and no hash', async () => {
    const { service } = build(1, 1, [ROW]);

    const { rows } = await service.crashReports();

    expect(rows).toEqual([
      {
        id: ROW.id,
        reference: 'ABCDEF',
        boundary: 'route',
        errorName: 'TypeError',
        message: ROW.message,
        routePattern: ROW.routePattern,
        webVersion: '0.200.7',
        browser: 'chrome',
        browserMajor: 131,
        stack: ROW.stack,
        componentStack: null,
        count: 3,
        firstSeenAt: '2026-11-01T10:00:00.000Z',
        lastSeenAt: '2026-11-01T11:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('abcdef0123456789');
  });

  it('turns the bigint counts into numbers a JSON response can carry', async () => {
    const { service } = build(12, 4);

    const { meta } = await service.crashReports();

    expect(meta).toEqual({ total: 12, cap: 1000, capReached: false, seenLast7Days: 4 });
  });

  it('says the cap is reached at exactly the cap, and not one below', async () => {
    expect((await build(999, 0).service.crashReports()).meta.capReached).toBe(false);
    expect((await build(1000, 0).service.crashReports()).meta.capReached).toBe(true);
    // The documented race can overshoot the cap by a few rows.
    expect((await build(1002, 0).service.crashReports()).meta.capReached).toBe(true);
  });
});
