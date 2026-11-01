import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { CrashReportService, describeWriteFailure } from './crash-report.service';

/**
 * The unit half of the service: the paths that need no database. The statement itself, the burst
 * and the cap are proven against a real Postgres in `test/crash-reports.e2e-spec.ts`, because a
 * mocked Prisma accepts any SQL.
 */
function build(executeRaw: () => Promise<number>) {
  const logger = { warn: vi.fn() } as unknown as PinoLogger;
  const prisma = { $executeRaw: vi.fn(executeRaw) } as unknown as PrismaService;
  const config = { corsOrigins: ['https://app.example/'] } as unknown as AppConfigService;
  return { service: new CrashReportService(prisma, config, logger), logger, prisma };
}

const BODY = { name: 'TypeError', message: 'boom', boundary: 'route' };

describe('CrashReportService.record', () => {
  it('answers the reference when a row was stored or counted', async () => {
    const { service } = build(() => Promise.resolve(1));
    const { reference } = await service.record(BODY, 'Chrome/141');
    expect(reference).toMatch(/^[0-9A-F]{6}$/);
  });

  it('answers null for an unusable body without touching the database', async () => {
    const { service, prisma } = build(() => Promise.resolve(1));
    expect(await service.record('nope', undefined)).toEqual({ reference: null });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('answers null and warns once when a new fingerprint meets the cap', async () => {
    const { service, logger } = build(() => Promise.resolve(0));
    expect(await service.record(BODY, undefined)).toEqual({ reference: null });
    await service.record(BODY, undefined);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toMatchObject({
      event: 'crash_report.cap_reached',
    });
  });

  it('answers null on a failed write and logs the SQLSTATE and constraint, never the error whole', async () => {
    const failure = Object.assign(new Error('Failing row contains (secret message)'), {
      code: 'P2010',
      meta: {
        code: '23514',
        message:
          'ERROR: new row violates check constraint "ck_crash_reports_message_length"\nDETAIL: Failing row contains (secret message)',
      },
    });
    const { service, logger } = build(() => Promise.reject(failure));

    expect(await service.record(BODY, undefined)).toEqual({ reference: null });

    const [fields] = vi.mocked(logger.warn).mock.calls[0] ?? [];
    expect(fields).toEqual({
      event: 'crash_report.persist_failed',
      prismaCode: 'P2010',
      sqlstate: '23514',
      constraint: 'ck_crash_reports_message_length',
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret');
  });
});

describe('describeWriteFailure', () => {
  it('says nothing about an error it does not recognise', () => {
    expect(describeWriteFailure(new Error('Failing row contains (x)'))).toEqual({});
    expect(describeWriteFailure('x')).toEqual({});
    expect(describeWriteFailure(null)).toEqual({});
  });

  it('refuses a constraint name that is not this table’s', () => {
    expect(describeWriteFailure({ message: 'violates check constraint "ck_other_thing"' })).toEqual(
      {},
    );
  });
});
