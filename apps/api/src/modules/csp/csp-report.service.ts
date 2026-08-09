import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';

import type { NormalisedCspReport } from './csp-report-body';

/**
 * The dedup key: SHA-256 of the three identifying values.
 *
 * **Hashed rather than indexed directly**, because a btree index row caps near 2704 bytes and both
 * URI values arrive from an unauthenticated POST. An 8 KB `blocked_uri` indexed directly would make
 * the INSERT *fail* rather than deduplicate — so a hostile report could deny the reporting this
 * table exists to collect. Verified against the real database: two 8 KB reports produce one row
 * with `count = 2`.
 *
 * The separator is `|`, which can appear in a URL. That is harmless here — a collision would need
 * two *different* triples to produce the same joined string, and the fields are ordered and
 * fixed in number, so the worst case is two violations that differ only by where a `|` fell being
 * counted together. Escaping would buy nothing an operator could observe.
 */
export function dedupeHashOf(report: NormalisedCspReport): string {
  return createHash('sha256')
    .update(`${report.effectiveDirective}|${report.blockedUri}|${report.documentUri}`)
    .digest('hex');
}

/**
 * Records violation reports, deduplicated.
 *
 * **Swallows everything.** The endpoint answers 204 regardless of what happens here, so a failed
 * write must not become a 500 on a public route — that is both an availability problem and a signal
 * to a prober that their input was interesting. A dropped report costs one row of telemetry; a 500
 * on an unauthenticated endpoint costs more.
 */
@Injectable()
export class CspReportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CspReportService.name) private readonly logger: PinoLogger,
  ) {}

  async record(reports: readonly NormalisedCspReport[]): Promise<void> {
    for (const report of reports) {
      try {
        const dedupeHash = dedupeHashOf(report);
        await this.prisma.cspReport.upsert({
          where: { dedupeHash },
          // A repeat moves the clock and the counter, and nothing else — `first_seen_at` is the
          // fact that makes "this started when we deployed X" answerable, so it must never move.
          update: { count: { increment: 1 }, lastSeenAt: new Date() },
          create: { dedupeHash, ...report },
        });
      } catch (error) {
        this.logger.warn(
          // The directive only. The URIs are the untrusted part, and a log line is a second copy
          // of them in a stream with different retention from the table this decides not to write.
          { event: 'csp_report.persist_failed', err: error, directive: report.effectiveDirective },
          'could not record a CSP violation report',
        );
      }
    }
  }
}
