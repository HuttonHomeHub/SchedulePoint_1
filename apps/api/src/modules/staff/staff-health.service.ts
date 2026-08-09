import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

import { smtpEndpoint } from '../../common/mail/mail-bootstrap.service';
import { VersionService } from '../../version/version.service';

import type { CspReportRowDto } from './dto/staff-csp-reports.dto';
import type {
  StaffAccountsDto,
  StaffActivityRowDto,
  StaffInstallationDto,
} from './dto/staff-installation.dto';
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

/** One page of unverified accounts. Bounded because the page carries addresses. */
const ACCOUNTS_PAGE = 25;

/** How much staff history the panel shows. */
const ACTIVITY_PAGE = 50;

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
    private readonly version: VersionService,
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

  /**
   * What this installation is running and how it is configured.
   *
   * **Built field by field from named scalars, never by omission from the config object.** See
   * {@link StaffInstallationDto} — `MAIL_SMTP_URL` carries a live password, and a response
   * assembled by spreading config and removing what somebody remembered leaks it the first time a
   * field is added. `smtpEndpoint` returns host and port only, and returns `null` rather than
   * throwing on a URL that will not parse.
   */
  installation(): StaffInstallationDto {
    const smtpUrl = this.config.mailSmtpUrl;
    const endpoint = smtpUrl === undefined ? null : smtpEndpoint(smtpUrl);

    return {
      apiVersion: this.version.getVersion(),
      environment: this.config.nodeEnv,
      requireEmailVerification: this.config.requireEmailVerification,
      planEditLockEnforced: this.config.planEditLockEnforced,
      mailHost: endpoint === null ? null : `${endpoint.host}:${endpoint.port}`,
      mailAlertingConfigured: this.config.mailAlertUrl !== undefined,
      heartbeatConfigured: this.config.heartbeatUrl !== undefined,
      // The COUNT, never the addresses. An operator needs to know whether the allowlist is what
      // they think it is; a log or a screen listing the most valuable accounts in the installation
      // is a different thing entirely.
      staffCount: this.config.staffEmails.length,
    };
  }

  /**
   * Accounts that cannot sign in once verification is enforced.
   *
   * **Scoped to `emailVerified: false` in the repository, never by a query parameter.** A parameter
   * would make "show me every account" one edit away on a surface whose entire justification is
   * that it does not read customer data beyond this one operational question — the `ADR-0073 C2`
   * shape, where the filter must not be the caller's to choose.
   *
   * Paginated and bounded: "every unverified address in the installation" arriving in one response
   * is a bulk export of customer PII however legitimate the reader (CQ-1's consequence).
   */
  async accounts(cursor?: string): Promise<StaffAccountsDto> {
    const [unverifiedTotal, rows] = await Promise.all([
      this.prisma.user.count({ where: { emailVerified: false } }),
      this.prisma.user.findMany({
        where: { emailVerified: false },
        // Oldest first: the account stuck longest is the one somebody is waiting on.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ACCOUNTS_PAGE + 1,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: { id: true, email: true, createdAt: true },
      }),
    ]);

    const page = rows.slice(0, ACCOUNTS_PAGE);
    return {
      unverifiedTotal,
      hasMore: rows.length > ACCOUNTS_PAGE,
      unverified: page.map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * What staff have done.
   *
   * **Filtered to `actorType: 'STAFF'` in the repository, not by a query parameter**, and pinned by
   * a test asserting a member's row is never returned. This is the route most likely to become a
   * customer-data leak by accident: `audit_events` holds every organisation's activity, and one
   * caller-supplied filter would turn a staff self-audit into a cross-tenant read.
   */
  async activity(): Promise<StaffActivityRowDto[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { actorType: 'STAFF' },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_PAGE,
      select: {
        id: true,
        occurredAt: true,
        action: true,
        actorLabel: true,
        subjectLabel: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      actorLabel: row.actorLabel,
      subjectLabel: row.subjectLabel,
    }));
  }
}
