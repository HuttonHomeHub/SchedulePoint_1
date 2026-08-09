import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

import type { CspReportRowDto } from './dto/staff-csp-reports.dto';
import type { StaffHealthDto } from './dto/staff-health.dto';

/** How many recent failures the panel shows. Enough to see a pattern, not a data export. */
const RECENT_LIMIT = 20;

/**
 * How many distinct violations the Security panel shows.
 *
 * Bounded rather than paginated, deliberately: a correct policy yields tens of distinct violations,
 * and pagination on a table that should be nearly empty is machinery serving the case where the
 * policy is already wrong in a way the first fifty rows have made obvious.
 */
const CSP_LIMIT = 50;

/**
 * The installation's mail health (ADR-0086).
 *
 * **It reads `mail_events` and nothing else.** No customer entity is touched — asserted structurally
 * by the boundary suite, which scans for `prisma.plan` and its siblings, because `PrismaService` is
 * global and an import-only rule would not have caught the shortcut.
 *
 * The three `*Configured` booleans are the part that is easy to leave out and the part an operator
 * most needs. Zero failures with **no transport configured** is not health: it means every send is
 * being written to a log rather than delivered, which looks identical in a count and is the state a
 * stock deployment is actually in. A panel that showed the number alone would report a broken
 * installation as a healthy one.
 */
@Injectable()
export class StaffHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async read(): Promise<StaffHealthDto> {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const hourAgo = new Date(now - 60 * 60 * 1000);

    const [failuresLast24h, failuresLastHour, latest, recent] = await Promise.all([
      this.prisma.mailEvent.count({ where: { occurredAt: { gte: dayAgo } } }),
      this.prisma.mailEvent.count({ where: { occurredAt: { gte: hourAgo } } }),
      this.prisma.mailEvent.findFirst({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { occurredAt: true },
      }),
      this.prisma.mailEvent.findMany({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: RECENT_LIMIT,
      }),
    ]);

    return {
      failuresLast24h,
      failuresLastHour,
      lastFailureAt: latest?.occurredAt.toISOString() ?? null,
      transportConfigured: this.config.mailSmtpUrl !== undefined,
      alertingConfigured: this.config.mailAlertUrl !== undefined,
      heartbeatConfigured: this.config.heartbeatUrl !== undefined,
      recentFailures: recent.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        kind: row.kind,
        outcome: row.outcome,
        recipient: row.recipient,
        errorClass: row.errorClass,
      })),
    };
  }

  /**
   * The distinct CSP violations, most recent activity first.
   *
   * `lastSeenAt DESC` because "is it still happening" is what an operator asks before "how often" —
   * and it is the one index this table has. A `count DESC` index was measured and deliberately not
   * shipped: 1.16 ms unindexed at 5,000 rows, on a staff-only throttled read, against a table whose
   * realistic size is tens of rows.
   */
  async cspReports(): Promise<CspReportRowDto[]> {
    const rows = await this.prisma.cspReport.findMany({
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      take: CSP_LIMIT,
    });

    return rows.map((row) => ({
      id: row.id,
      effectiveDirective: row.effectiveDirective,
      blockedUri: row.blockedUri,
      documentUri: row.documentUri,
      disposition: row.disposition,
      count: row.count,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      sourceFile: row.sourceFile,
      lineNumber: row.lineNumber,
      columnNumber: row.columnNumber,
    }));
  }
}
