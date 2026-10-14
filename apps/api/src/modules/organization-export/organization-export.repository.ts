import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { chunkIds } from '../../common/db/id-chunks';
import { ConflictError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';

import type { ExportFile, ExportRead } from './export-columns';
import type { ExportRow } from './export-serialise';

/**
 * Every read the organisation export makes, inside one read-only repeatable-read snapshot
 * (ADR-0194 D3). `StaffDiagnosticsRepository.reading` is the precedent for the transaction shape;
 * what is different here is how long it lives, so the two limits below are this file's own.
 *
 * **Security stance, in the places a reviewer will look.** Every read below is reached from a
 * caller that resolved the organisation from the caller's own memberships (`resolveScope`), and
 * every table that has an `organization_id` column filters on it — in the `where`, never only on a
 * parent. The two tables that have none are reached through ids this file itself read from an
 * organisation-scoped query (`loadScope`), and people are reached only through THIS organisation's
 * `org_members` rows, removed ones included. No id arrives from the request.
 */

/** The number of rows one read returns. Small enough to bound memory, large enough to amortise the round trip. */
export const EXPORT_BATCH_ROWS = 1_000;

/**
 * The longest one export may hold its snapshot and its pooled connection, in milliseconds.
 *
 * Prisma's own default (5 s) would kill any export that is not trivial, and the global 15 s ceiling
 * is sized for a write. The plan's rule was "about five times the measured ten-plan time, capped at ten
 * minutes", which is two minutes (25 s measured). That would refuse the brief's upper bound, which the
 * same measurement extrapolates to 4.0 to 5.2 minutes (`docs/specs/organisation-export/m2-measurements.md`),
 * and a slow client holds the snapshot open as well, so the ceiling is the cap. It is there to free the
 * connection if something wedges, not as a budget the export is expected to approach: an export that
 * hits it fails loudly (`timeout` on the audit row) rather than hanging.
 */
export const EXPORT_TRANSACTION_TIMEOUT_MS = 10 * 60_000;

/** The first slot of the two-int advisory key: one export per organisation at a time. */
const EXPORT_LOCK_NAMESPACE = 'org-export';

/** What `loadScope` read: ids that came from organisation-scoped queries, never from the request. */
export interface ExportReadScope {
  readonly organizationId: string;
  readonly planIds: readonly string[];
  readonly calendarIds: readonly string[];
  readonly calendarExceptionIds: readonly string[];
}

interface PageQuery {
  readonly organizationId: string;
  /** Present for the `per-plan` strategy. */
  readonly planId?: string;
  /** Present for the `by-parent` strategy: a chunk of this organisation's parent ids. */
  readonly parentIds?: readonly string[];
  /** The last id of the previous page; absent for the first page. */
  readonly after?: string;
}

type Db = Prisma.TransactionClient;
type Select = Record<string, true>;

/** How a by-parent file reaches its parent ids in the {@link ExportReadScope}. */
type ParentKind = 'calendars' | 'calendarExceptions';

const ORDER = { id: 'asc' } as const;

/** `id > after`, or nothing for the first page. */
function cursor(query: PageQuery): { id?: { gt: string } } {
  return query.after === undefined ? {} : { id: { gt: query.after } };
}

/** The ids a by-parent read was handed, or a loud failure: an empty `in` would silently read nothing. */
function parents(query: PageQuery): string[] {
  if (query.parentIds === undefined) throw new Error('by-parent read without parent ids');
  return [...query.parentIds];
}

function plan(query: PageQuery): string {
  if (query.planId === undefined) throw new Error('per-plan read without a plan id');
  return query.planId;
}

/**
 * Which strategy reads each exported model, and for a by-parent file which parent supplies the ids.
 * A unit test pins this table to the registry's `read` for every file, so a file cannot be read one
 * way here while the registry promises another.
 */
export const EXPORT_STRATEGY: Readonly<Record<string, { read: ExportRead; parent?: ParentKind }>> =
  {
    User: { read: 'via-members' },
    Organization: { read: 'self' },
    OrgMember: { read: 'org' },
    Invitation: { read: 'org' },
    Client: { read: 'org' },
    Project: { read: 'org' },
    Plan: { read: 'org' },
    Activity: { read: 'per-plan' },
    ActivityDependency: { read: 'per-plan' },
    CrossPlanDependency: { read: 'org' },
    Calendar: { read: 'org' },
    CalendarException: { read: 'org' },
    CalendarShift: { read: 'by-parent', parent: 'calendars' },
    CalendarExceptionWindow: { read: 'by-parent', parent: 'calendarExceptions' },
    Baseline: { read: 'org' },
    BaselineActivity: { read: 'org' },
    BaselineAssignment: { read: 'org' },
    BaselineDependency: { read: 'org' },
    PlanShare: { read: 'org' },
    PlacementMigration: { read: 'per-plan' },
    FmDateMigration: { read: 'per-plan' },
    CrossPlanLagMigration: { read: 'per-plan' },
    Resource: { read: 'org' },
    ResourceAssignment: { read: 'org' },
    ActivityStep: { read: 'org' },
    ActivityHistoryEntry: { read: 'org' },
    Note: { read: 'per-plan' },
    AuditEvent: { read: 'org' },
  };

/**
 * One explicit read per exported model, so the organisation filter of every table can be read off
 * its own line: `org` is `organization_id = this organisation` and nothing else is ever substituted
 * for it. People are reached only through THIS organisation's `org_members` rows, soft-deleted ones
 * included — a removed member's name is still attributed on the work they did. The two tables with no
 * organisation column are reached by ids `loadScope` read from this organisation's own rows.
 *
 * soft-delete: any-state — the organisation export includes the recycle bin, removed members and
 * withdrawn invitations, each with its deletedAt set (spec §4.4, ADR-0194 D1)
 */
function readPage(db: Db, model: string, q: PageQuery, select: Select): Promise<ExportRow[]> {
  const org = { organizationId: q.organizationId, ...cursor(q) };
  const page = { select, orderBy: ORDER, take: EXPORT_BATCH_ROWS } as const;
  switch (model) {
    case 'User':
      return db.user.findMany({
        where: { memberships: { some: { organizationId: q.organizationId } }, ...cursor(q) },
        ...page,
      });
    case 'Organization':
      return db.organization.findMany({ where: { id: q.organizationId }, select, take: 1 });
    case 'OrgMember':
      return db.orgMember.findMany({ where: org, ...page });
    case 'Invitation':
      return db.invitation.findMany({ where: org, ...page });
    case 'Client':
      return db.client.findMany({ where: org, ...page });
    case 'Project':
      return db.project.findMany({ where: org, ...page });
    case 'Plan':
      return db.plan.findMany({ where: org, ...page });
    case 'Activity':
      return db.activity.findMany({ where: { ...org, planId: plan(q) }, ...page });
    case 'ActivityDependency':
      return db.activityDependency.findMany({ where: { ...org, planId: plan(q) }, ...page });
    case 'CrossPlanDependency':
      return db.crossPlanDependency.findMany({ where: org, ...page });
    case 'Calendar':
      return db.calendar.findMany({ where: org, ...page });
    case 'CalendarException':
      return db.calendarException.findMany({ where: org, ...page });
    case 'CalendarShift':
      return db.calendarShift.findMany({
        where: { calendarId: { in: parents(q) }, ...cursor(q) },
        ...page,
      });
    case 'CalendarExceptionWindow':
      return db.calendarExceptionWindow.findMany({
        where: { calendarExceptionId: { in: parents(q) }, ...cursor(q) },
        ...page,
      });
    case 'Baseline':
      return db.baseline.findMany({ where: org, ...page });
    case 'BaselineActivity':
      return db.baselineActivity.findMany({ where: org, ...page });
    case 'BaselineAssignment':
      return db.baselineAssignment.findMany({ where: org, ...page });
    case 'BaselineDependency':
      return db.baselineDependency.findMany({ where: org, ...page });
    case 'PlanShare':
      return db.planShare.findMany({ where: org, ...page });
    case 'PlacementMigration':
      return db.placementMigration.findMany({ where: { ...org, planId: plan(q) }, ...page });
    case 'FmDateMigration':
      return db.fmDateMigration.findMany({ where: { ...org, planId: plan(q) }, ...page });
    case 'CrossPlanLagMigration':
      return db.crossPlanLagMigration.findMany({ where: { ...org, planId: plan(q) }, ...page });
    case 'Resource':
      return db.resource.findMany({ where: org, ...page });
    case 'ResourceAssignment':
      return db.resourceAssignment.findMany({ where: org, ...page });
    case 'ActivityStep':
      return db.activityStep.findMany({ where: org, ...page });
    case 'ActivityHistoryEntry':
      return db.activityHistoryEntry.findMany({ where: org, ...page });
    case 'Note':
      return db.note.findMany({ where: { ...org, planId: plan(q) }, ...page });
    // Exactly the rows the Audit log screen reads: this organisation's, and none of the
    // organisation-less authentication rows.
    case 'AuditEvent':
      return db.auditEvent.findMany({ where: org, ...page });
    default:
      throw new Error(`no export reader for ${model}`);
  }
}

/** The Prisma `select` for a file: exactly its registry columns, so a column nobody decided on is never read. */
export function selectOf(file: ExportFile): Select {
  return Object.fromEntries(file.columns.map((c) => [c.source ?? c.field, true as const]));
}

@Injectable()
export class OrganizationExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run `read` inside the export's single, read-only, time-bounded snapshot, holding the
   * organisation's export lock for its whole length.
   *
   * The lock is taken first, so a second request for the same organisation answers 409 before the
   * caller has sent a header, and it is a transaction-scoped advisory lock so it frees itself on
   * commit, rollback or a dropped connection. It is `try`, not blocking: a queued export would
   * hold a pooled connection waiting. A different organisation hashes to a different key.
   */
  reading<T>(organizationId: string, read: (db: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SET TRANSACTION READ ONLY`;
        // A page read is a keyed lookup of at most EXPORT_BATCH_ROWS rows; anything near this is a
        // missing index or a wedged connection, and the export should fail loudly rather than hold
        // the snapshot open behind it. The setting dies with the transaction, so it never reaches
        // the pool.
        await tx.$queryRaw`SET LOCAL statement_timeout = '30s'`;
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtext(${EXPORT_LOCK_NAMESPACE}), hashtext(${organizationId})) AS locked`;
        if (lock?.locked !== true) {
          throw new ConflictError(
            'An export is already being prepared for this organisation. Try again when it finishes.',
            { reason: 'EXPORT_IN_PROGRESS' },
          );
        }
        return read(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: EXPORT_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  /**
   * The ids the per-plan and by-parent reads iterate, all read from this organisation's own rows.
   *
   * soft-delete: any-state — the export includes plans, calendars and exceptions in the recycle
   * bin, so their children must be reached too (spec §4.4)
   */
  async loadScope(db: Db, organizationId: string): Promise<ExportReadScope> {
    const plans = await db.plan.findMany({
      where: { organizationId },
      select: { id: true },
      orderBy: ORDER,
    });
    const calendars = await db.calendar.findMany({
      where: { organizationId },
      select: { id: true },
      orderBy: ORDER,
    });
    const exceptions = await db.calendarException.findMany({
      where: { organizationId },
      select: { id: true },
      orderBy: ORDER,
    });
    return {
      organizationId,
      planIds: plans.map((p) => p.id),
      calendarIds: calendars.map((c) => c.id),
      calendarExceptionIds: exceptions.map((e) => e.id),
    };
  }

  /**
   * The rows of one file, a page at a time, in id order. Keyset paging (`id > last`) so a page
   * neither skips nor repeats a row and the cost of page N does not grow with N. The snapshot makes
   * the pages one consistent read; the order carries no meaning (the format promises none).
   */
  async *pages(
    db: Db,
    file: ExportFile,
    scope: ExportReadScope,
    signal: AbortSignal,
  ): AsyncGenerator<ExportRow[]> {
    const strategy = EXPORT_STRATEGY[file.model];
    if (strategy === undefined) throw new Error(`no export reader for ${file.model}`);
    const select = selectOf(file);
    const base = { organizationId: scope.organizationId } as const;

    const keyset = async function* (query: Omit<PageQuery, 'after'>): AsyncGenerator<ExportRow[]> {
      let after: string | undefined;
      for (;;) {
        signal.throwIfAborted();
        const rows = await readPage(
          db,
          file.model,
          after === undefined ? query : { ...query, after },
          select,
        );
        if (rows.length > 0) yield rows;
        const last = rows.at(-1);
        if (rows.length < EXPORT_BATCH_ROWS || last === undefined) return;
        after = String(last.id);
      }
    };

    switch (file.read) {
      case 'self': {
        signal.throwIfAborted();
        yield await readPage(db, file.model, base, select);
        return;
      }
      case 'via-members':
      case 'org':
        yield* keyset(base);
        return;
      case 'per-plan':
        for (const planId of scope.planIds) yield* keyset({ ...base, planId });
        return;
      case 'by-parent': {
        const ids =
          strategy.parent === 'calendars' ? scope.calendarIds : scope.calendarExceptionIds;
        for (const chunk of chunkIds(ids)) yield* keyset({ ...base, parentIds: chunk });
        return;
      }
    }
  }
}
