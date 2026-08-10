import { Injectable } from '@nestjs/common';

import { smtpEndpoint } from '../../common/mail/mail-bootstrap.service';
import {
  ageInWholeDays,
  isRetentionOverdue,
  RETENTION_POLICIES,
  type RetentionTable,
} from '../../common/operational/retention-policy';
import { RetentionStatusStore } from '../../common/operational/retention-status.store';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VersionService } from '../../version/version.service';

import type { CspReportRowDto } from './dto/staff-csp-reports.dto';
import type { RetentionDto, StaffHealthDto } from './dto/staff-health.dto';
import type {
  StaffAccountsDto,
  StaffActivityRowDto,
  StaffInstallationDto,
} from './dto/staff-installation.dto';

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
    private readonly retentionStatus: RetentionStatusStore,
  ) {}

  async read(): Promise<StaffHealthDto> {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const hourAgo = new Date(now - 60 * 60 * 1000);

    const [failuresLast24h, failuresLastHour, latest, recent, retention] = await Promise.all([
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
      this.retention(new Date(now)),
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
      retention,
    };
  }

  /**
   * Is retention being honoured? (ADR-0087, M3)
   *
   * **No `COUNT(*)`.** The obvious panel — "how many rows are expired" — is a full scan of a table
   * this feature exists because it grows without bound, run on every page load. The question it
   * answers is also the wrong one: an operator does not need a backlog size, they need to know
   * whether anything is surviving longer than it should. That is one index-forward `LIMIT 1` per
   * table on the column the sweep already orders by.
   *
   * **The leading signal is derived rather than reported**, which is the decision worth keeping.
   * `RetentionStatusStore` is in memory and resets on restart, so its `lastRunAt` cannot separate
   * "the sweep is working" from "the sweep never armed" — the inverted-signal problem
   * `HeartbeatService` exists to solve one layer out. `overdue` is computed from the age of the
   * oldest surviving row and is therefore true of the database, not of this process's bookkeeping.
   * The store's numbers are carried too, but as detail behind that answer.
   *
   * Read on a **separate connection concurrently with the mail counts** by the caller's
   * `Promise.all`; both are bounded single-row or single-page reads on this staff-only route.
   */
  private async retention(now: Date): Promise<RetentionDto> {
    const status = this.retentionStatus.snapshot();
    const days: Record<RetentionTable, number> = {
      csp_reports: this.config.retentionCspReportsDays,
      mail_events: this.config.retentionMailEventsDays,
    };
    const intervalMinutes = this.config.retentionSweepIntervalMinutes;

    const oldest = await Promise.all(
      RETENTION_POLICIES.map(async (policy) => {
        // One `findFirst` per policy, dispatched by table because Prisma's delegates are distinct
        // types — the same reason `RetentionSweepRunner` uses a `switch` rather than interpolating a
        // table name into SQL. Two tables is not a scaling problem; a dynamic accessor would be.
        const row =
          policy.table === 'csp_reports'
            ? await this.prisma.cspReport.findFirst({
                orderBy: [{ lastSeenAt: 'asc' }, { id: 'asc' }],
                select: { lastSeenAt: true },
              })
            : await this.prisma.mailEvent.findFirst({
                orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
                select: { occurredAt: true },
              });

        const at = row === null ? null : 'lastSeenAt' in row ? row.lastSeenAt : row.occurredAt;
        return { table: policy.table, at };
      }),
    );

    return {
      enabled: this.config.retentionSweepEnabled,
      intervalMinutes,
      processStartedAt: status.processStartedAt.toISOString(),
      lastRunAt: status.lastRunAt?.toISOString() ?? null,
      consecutiveFailures: status.consecutiveFailures,
      tables: oldest.map(({ table, at }) => {
        const last = status.tables.find((entry) => entry.table === table);
        return {
          table,
          retentionDays: days[table],
          // Null for an EMPTY table, and the surface must keep that distinct from an age of zero.
          // "0 days" reads as a measurement of something; there is nothing here to measure.
          oldestAt: at?.toISOString() ?? null,
          oldestAgeDays: at === null ? null : ageInWholeDays(at, now),
          overdue: isRetentionOverdue({
            oldestAt: at,
            now,
            retentionDays: days[table],
            intervalMinutes,
          }),
          // Null rather than 0 when this process has not swept: "deleted nothing" and "has not run"
          // are different facts, and the panel has to be able to say which.
          lastDeleted: last?.deleted ?? null,
          cappedOut: last?.cappedOut ?? false,
          failed: last?.failed ?? false,
        };
      }),
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
    const hasMore = rows.length > ACCOUNTS_PAGE;
    return {
      unverifiedTotal,
      hasMore,
      // The cursor a caller needs to reach page two. Without it `hasMore: true` was a statement
      // that more existed and no way to ask for them.
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      unverified: page.map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * What has happened on the staff surface — including what was refused.
   *
   * **Filtered on the `staff.` action namespace in the repository, not by a query parameter**, and
   * pinned by a test asserting a member's row is never returned. This is the route most likely to
   * become a customer-data leak by accident: `audit_events` holds every organisation's activity,
   * and one caller-supplied filter would turn a staff self-audit into a cross-tenant read.
   *
   * The namespace rather than `actorType: 'STAFF'`, which is what this filtered on until the
   * security review: a **denial** is by definition not a staff actor (`staff.guard.ts` types the
   * prober honestly as `USER`), so an actor filter would have hidden the one row on this surface
   * that a reader most needs to see. The namespace is equally repository-side and equally
   * incapable of returning a member's own work, whose actions are `plan.*`, `activity.*` and so on.
   */
  async activity(): Promise<StaffActivityRowDto[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { action: { startsWith: 'staff.' } },
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

  /**
   * Whether a staff account also holds an organisation membership.
   *
   * ADR-0086 D4 permits dual-hatting rather than refusing it — refusing would lock the only staff
   * member out on day one, and staff-ness confers nothing inside any organisation by construction.
   * The compensation D4 named was that the console **says which hat is active**. That was decided
   * and never built; the UX review found it. This is the fact the banner needs.
   */
  async isDualHatted(userId: string): Promise<boolean> {
    return (await this.prisma.orgMember.count({ where: { userId } })) > 0;
  }
}
