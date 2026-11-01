import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

import {
  browserOf,
  dedupeHashOf,
  normaliseCrashReport,
  referenceOf,
  type NormalisedCrashReport,
} from './crash-report-body';

/** At most this many distinct crashes are stored (spec §2 "Edge cases"). Repeats still count. */
export const CRASH_REPORT_CAP = 1_000;

/** `crash_report.cap_reached` is logged at most this often per process, so a flood is one line. */
const CAP_LOG_INTERVAL_MS = 60 * 60 * 1000;

/**
 * What a failed write is allowed to say about itself: a SQLSTATE and one of our own constraint
 * names. **Never the error whole.** A CHECK violation's DETAIL is `Failing row contains (…)`, which
 * is the cleaned message and both stacks, so logging `err` would copy the content this module exists
 * to keep small into a stream with different retention (`csp_report.persist_failed` logs `err`;
 * this one must not).
 */
export function describeWriteFailure(error: unknown): {
  prismaCode?: string;
  sqlstate?: string;
  constraint?: string;
} {
  if (typeof error !== 'object' || error === null) return {};
  const { code, meta, message } = error as {
    code?: unknown;
    meta?: { code?: unknown; message?: unknown } | null;
    message?: unknown;
  };
  // The driver error carries the SQLSTATE in `meta.code`; the rendered message repeats it as
  // "Code: `23514`", which is the fallback if a client version moves it.
  const metaCode =
    meta?.code ??
    (typeof message === 'string' ? /Code: `([0-9A-Z]{5})`/.exec(message)?.[1] : undefined);
  const text = `${typeof meta?.message === 'string' ? meta.message : ''}\n${
    typeof message === 'string' ? message : ''
  }`;
  const constraint = /\bconstraint "(ck_crash_reports_[a-z_]+|crash_reports_[a-z_]+)"/.exec(
    text,
  )?.[1];
  return {
    ...(typeof code === 'string' && /^P\d{4}$/.test(code) ? { prismaCode: code } : {}),
    ...(typeof metaCode === 'string' && /^[0-9A-Z]{5}$/.test(metaCode)
      ? { sqlstate: metaCode }
      : {}),
    ...(constraint ? { constraint } : {}),
  };
}

/**
 * Records one crash per request, deduplicated (browser crash reports M1-T2).
 *
 * **Swallows every write failure** and answers `reference: null`: the caller is a crashed screen
 * that cannot act on a 500, and a dropped report costs one row of telemetry. The difference from
 * the CSP sink is that the failure is visible to the caller (`null`, so the fallback never claims a
 * report was sent that was not) and to the operator (a warn).
 */
@Injectable()
export class CrashReportService {
  private lastCapLogAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @InjectPinoLogger(CrashReportService.name) private readonly logger: PinoLogger,
  ) {}

  async record(body: unknown, userAgent: unknown): Promise<{ reference: string | null }> {
    let report: NormalisedCrashReport | null;
    try {
      report = normaliseCrashReport(body, this.sameOrigins());
    } catch (error) {
      // `normaliseCrashReport` is written not to throw. If it ever does, the answer is the same as
      // for an unusable body, and the log carries the error class only: the input is untrusted.
      this.logger.warn(
        { event: 'crash_report.normalise_failed', errorClass: errorClassOf(error) },
        'could not normalise a crash report',
      );
      return { reference: null };
    }
    if (report === null) return { reference: null };

    const { browser, browserMajor } = browserOf(userAgent);
    const dedupeHash = dedupeHashOf(report, browser);

    try {
      // **One statement: the cap check and the write** (`docs/DATABASE.md` "CrashReport"). The
      // `WHERE` admits a repeat always (`EXISTS`) and a new fingerprint only below the cap, so the
      // affected-row count is the answer: 1 stored or counted, 0 a new fingerprint at the cap.
      // Two races are accepted, as the spec allows: two new hashes at 999 can both pass, and at the
      // cap a repeat whose first insert is still uncommitted elsewhere is dropped, not counted.
      //
      // Every parameter is cast. In `INSERT … SELECT` a bound NULL has no target column to take its
      // type from, and Prisma's numbers do not all arrive as int4.
      //
      // `clock_timestamp()` twice, and the update CLAMPED with `GREATEST(…, first_seen_at)`: the
      // #311 fix copied from `csp-report.service.ts`. `now()` is transaction-start time, so two
      // concurrent statements do not share a reading and the loser of an insert race can try to
      // write a `last_seen_at` older than the winner's `first_seen_at`, which
      // `ck_crash_reports_seen_order` refuses. Both timestamps are the database's, never the
      // service's.
      //
      // `count` saturates at int4's maximum instead of overflowing; `browser_major`, `stack` and
      // `component_stack` are last-writer-wins through COALESCE, so a later report cannot erase them.
      const affected = await this.prisma.$executeRaw`
        INSERT INTO crash_reports (
          id, dedupe_hash, boundary, error_name, message, route_pattern, web_version, browser,
          browser_major, stack, component_stack, count, first_seen_at, last_seen_at
        )
        SELECT
          gen_random_uuid(), ${dedupeHash}::text, ${report.boundary}::text,
          ${report.errorName}::text, ${report.message}::text, ${report.routePattern}::text,
          ${report.webVersion}::text, ${browser}::text, ${browserMajor}::int, ${report.stack}::text,
          ${report.componentStack}::text, 1, clock_timestamp(), clock_timestamp()
        WHERE EXISTS (SELECT 1 FROM crash_reports WHERE dedupe_hash = ${dedupeHash}::text)
           OR (SELECT count(*) FROM (SELECT 1 FROM crash_reports LIMIT ${CRASH_REPORT_CAP}) AS capped)
              < ${CRASH_REPORT_CAP}::int
        ON CONFLICT (dedupe_hash) DO UPDATE SET
          count = CASE WHEN crash_reports.count < 2147483647
                       THEN crash_reports.count + 1 ELSE crash_reports.count END,
          last_seen_at = GREATEST(clock_timestamp(), crash_reports.first_seen_at),
          browser_major = COALESCE(EXCLUDED.browser_major, crash_reports.browser_major),
          stack = COALESCE(EXCLUDED.stack, crash_reports.stack),
          component_stack = COALESCE(EXCLUDED.component_stack, crash_reports.component_stack)
      `;

      if (affected === 0) {
        this.logCapReached();
        return { reference: null };
      }
      return { reference: referenceOf(dedupeHash) };
    } catch (error) {
      this.logger.warn(
        { event: 'crash_report.persist_failed', ...describeWriteFailure(error) },
        'could not record a browser crash report',
      );
      return { reference: null };
    }
  }

  /** The origins whose stack frames keep their path: this installation's own web origins. */
  private sameOrigins(): string[] {
    return this.config.corsOrigins.map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase());
  }

  private logCapReached(): void {
    const now = Date.now();
    if (now - this.lastCapLogAt < CAP_LOG_INTERVAL_MS) return;
    this.lastCapLogAt = now;
    this.logger.warn(
      { event: 'crash_report.cap_reached', cap: CRASH_REPORT_CAP },
      'crash report table is full; new kinds of crash are not being recorded until old ones expire',
    );
  }
}

function errorClassOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}
