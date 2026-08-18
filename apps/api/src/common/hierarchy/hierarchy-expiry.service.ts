import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../modules/audit/audit.service';
import { BATCH_TRANSACTION_TIMEOUT_MS, PrismaService } from '../../prisma/prisma.service';

import { deleteExpiredScope, type ExpiryCounts } from './hierarchy-expiry.runner';

/**
 * Activities permanently deleted per run before the sweep stops and waits for the next tick.
 *
 * **Measured in ACTIVITIES, not batches**, because a batch is one activity or forty thousand and a
 * batch count therefore bounds nothing. At ~59 µs/activity with the FK indexes in place, 20,000 is
 * about 1.1 s of database work an hour.
 *
 * **No cap bounds the largest single batch, and that is stated rather than promised away.** A batch
 * cannot be split — expiring half of one leaves an unrestorable remnant — so a 200,000-activity
 * client cascade extrapolates to roughly 12 s in one transaction. The cap limits how many batches
 * follow it, never how big the first one is.
 */
const ACTIVITY_BUDGET_PER_RUN = 20_000;

/**
 * The most scopes one run will expire, however small each one is.
 *
 * The activity budget bounds the **big-batch** case and says nothing about the mirror one, which is
 * the shape a real backlog actually has: hundreds of ordinary deletions carrying no activities at
 * all. Measured at ~10.2 ms per empty plan-scope (one transaction, one audit insert, the real
 * client) — so 100,000 of them would run for about **17 minutes** with the activity budget never
 * moving, on a job whose interval can be configured down to five. That is the case D3 guarantees
 * happens on every installation's first armed tick.
 *
 * 2,000 scopes is about 20 s. The remainder is not lost — the next tick takes it — and the two caps
 * are deliberately different quantities rather than one fudged number, because they bound different
 * failure modes. Found by the ADR-0096 backend-performance review.
 */
const SCOPE_BUDGET_PER_RUN = 2_000;

/**
 * The most candidate rows one scan will pull into memory, per level.
 *
 * Two caps are useless without this one: the scans had no `take`, so a 100,000-row backlog was
 * fully materialised and sorted every tick (measured: an external merge sort on disk) to reach at
 * most `SCOPE_BUDGET_PER_RUN` of them. Ordered oldest-first, so the rows nearest their deadline are
 * always the ones taken.
 */
const CANDIDATE_SCAN_LIMIT = 5_000;

/** Postgres foreign-key violation. See {@link HierarchyExpiryService.sweepNow}. */
const FK_VIOLATION = 'P2003';

/**
 * Prisma's "assertion violation on the database" — in practice, too many bind parameters.
 *
 * Grouped with the foreign-key violation rather than with ordinary failures because it shares the
 * property that matters: **retrying is deterministic and will never succeed**, so the batch is
 * stuck forever while the generic message says the next tick will retry it. The chunking in
 * `hierarchy-expiry.runner.ts` is what makes this unreachable; it is caught anyway, because a
 * silent permanent stall is the failure this whole class is dangerous for.
 */
const BIND_PARAMETER_CEILING = 'P2035';

/**
 * **The retention expiry: soft-deleted hierarchy passing its period is permanently removed**
 * (ADR-0096 D2).
 *
 * The product's first hard delete that can be AIMED at existing data — interchange's compensation
 * hard-deletes too, but only a plan it created seconds earlier and nobody has seen.
 *
 * Shaped after `RetentionSweepService` (ADR-0087): one `setInterval`, `.unref()`'d, no timer when
 * disabled, no queue and no Redis. Its costs are accepted for the same reasons — the job is
 * idempotent and time-predicated, so a second run finds nothing and a restart is repaired by the
 * next tick. What does NOT transfer is that sweep's sizing: a mis-sized `csp_reports` batch costs
 * single-digit milliseconds either way, and a mis-sized hierarchy batch costs seconds.
 */
@Injectable()
export class HierarchyExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  /**
   * **A run must never overlap itself**, the guard `RetentionSweepService` carries and this service
   * originally did not — despite copying everything else about that job's shape, and despite its
   * own docblock arguing that this one's batches cost seconds rather than milliseconds. Two
   * concurrent sweeps fetch overlapping candidates, contend on the same rows, and the loser writes
   * a second `hierarchy.expired` row with all-zero counts for a subtree the winner already took: a
   * permanent, misleading record in the one table that refuses `DELETE`.
   */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    @InjectPinoLogger(HierarchyExpiryService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.retentionHierarchyEnabled) {
      // No timer at all when disabled — the ADR-0087 D5 shape. This is also the M3 state: the
      // countdown ships one release before anything is deleted (ADR-0096 D4).
      this.logger.info({ event: 'hierarchy_expiry.disabled' }, 'hierarchy expiry is not armed');
      return;
    }
    this.logger.warn(
      {
        event: 'hierarchy_expiry.armed',
        retentionDays: this.config.retentionHierarchyDays,
        activityBudgetPerRun: ACTIVITY_BUDGET_PER_RUN,
      },
      // WARN, not INFO: this is the moment an installation starts permanently destroying customer
      // work, and it should be legible in a log an operator skims rather than one they grep.
      'hierarchy expiry ARMED — deleted work past its retention period will be permanently removed',
    );
    this.timer = setInterval(
      () => void this.sweepNow(),
      this.config.retentionSweepIntervalMinutes * 60 * 1000,
    );
    this.timer.unref();
    void this.sweepNow();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * One sweep: expire whole batches, newest cap first, until the activity budget is spent.
   *
   * **One transaction per batch, never per run.** An interrupted run leaves whole batches gone and
   * whole batches present, never half of one — which is what makes a restore of the survivors still
   * meaningful.
   */
  async sweepNow(now: Date = new Date()): Promise<void> {
    if (this.running) {
      this.logger.warn(
        { event: 'hierarchy_expiry.overlapped' },
        'a hierarchy expiry sweep is still running; skipping this tick',
      );
      return;
    }
    this.running = true;
    try {
      await this.sweep(now);
    } finally {
      this.running = false;
    }
  }

  private async sweep(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - this.config.retentionHierarchyDays * 86_400_000);
    let activityBudget = ACTIVITY_BUDGET_PER_RUN;
    let scopeBudget = SCOPE_BUDGET_PER_RUN;

    // **All three levels, not just clients.** A plan deleted on its own never had a deleted client
    // above it, so a client-only scan would leave it in the bin forever while its countdown said
    // otherwise — a screen that lies rather than a sweep that misses.
    //
    // A descendant whose ancestor is ALSO expiring is skipped: the ancestor's own pass takes it,
    // and selecting both would attempt the same rows twice. The second attempt is harmless (the
    // rows are gone) but the counts a reader sees would be wrong.
    const [clients, projects, plans] = await Promise.all([
      this.prisma.client.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: {
          id: true,
          name: true,
          organizationId: true,
          deletedAt: true,
          deleteBatchId: true,
        },
        orderBy: { deletedAt: 'asc' },
        take: CANDIDATE_SCAN_LIMIT,
      }),
      this.prisma.project.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: {
          id: true,
          name: true,
          organizationId: true,
          deletedAt: true,
          deleteBatchId: true,
          clientId: true,
        },
        orderBy: { deletedAt: 'asc' },
        take: CANDIDATE_SCAN_LIMIT,
      }),
      this.prisma.plan.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: {
          id: true,
          name: true,
          organizationId: true,
          deletedAt: true,
          deleteBatchId: true,
          projectId: true,
        },
        orderBy: { deletedAt: 'asc' },
        take: CANDIDATE_SCAN_LIMIT,
      }),
    ]);

    const expiringClients = new Set(clients.map((c) => c.id));
    const expiringProjects = new Set(projects.map((p) => p.id));

    for (const client of clients) {
      if (activityBudget <= 0 || scopeBudget <= 0) return;
      scopeBudget -= 1;
      const projectRows = await this.prisma.project.findMany({
        where: { clientId: client.id },
        select: { id: true },
      });
      const projectIds = projectRows.map((p) => p.id);
      const planRows =
        projectIds.length === 0
          ? []
          : await this.prisma.plan.findMany({
              where: { projectId: { in: projectIds } },
              select: { id: true },
            });
      const counts = await this.expireScope(client, 'client', {
        clientIds: [client.id],
        projectIds,
        planIds: planRows.map((p) => p.id),
      });
      if (counts) activityBudget -= counts.activities;
    }

    for (const project of projects) {
      if (activityBudget <= 0 || scopeBudget <= 0) return;
      if (expiringClients.has(project.clientId)) continue; // its client's pass takes it
      scopeBudget -= 1;
      const planRows = await this.prisma.plan.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      const counts = await this.expireScope(project, 'project', {
        clientIds: [],
        projectIds: [project.id],
        planIds: planRows.map((p) => p.id),
      });
      if (counts) activityBudget -= counts.activities;
    }

    for (const plan of plans) {
      if (activityBudget <= 0 || scopeBudget <= 0) return;
      if (expiringProjects.has(plan.projectId)) continue; // its project's pass takes it
      scopeBudget -= 1;
      const counts = await this.expireScope(plan, 'plan', {
        clientIds: [],
        projectIds: [],
        planIds: [plan.id],
      });
      if (counts) activityBudget -= counts.activities;
    }
  }

  private async expireScope(
    root: {
      id: string;
      name: string;
      organizationId: string;
      deletedAt: Date | null;
      deleteBatchId: string | null;
    },
    kind: 'client' | 'project' | 'plan',
    scope: { clientIds: string[]; projectIds: string[]; planIds: string[] },
  ): Promise<ExpiryCounts | null> {
    const startedAt = Date.now();
    try {
      const counts = await this.prisma.$transaction(
        async (tx) => {
          const result = await deleteExpiredScope(tx, scope);

          // **Inside the transaction, with the tx passed**, so an unwritable audit row rolls the
          // deletion back. ADR-0073 C4 recorded the inverse mistake — a producer written OUTSIDE a
          // transaction, whose failure broke its caller. Here the failure mode we want is "neither
          // happened", because a permanent deletion with no record of it is the thing this event
          // exists to prevent.
          await this.audit.record(
            {
              action: 'hierarchy.expired',
              outcome: 'SUCCESS',
              // No person did this. SYSTEM is the honest actor and is why the event matters: a
              // planner who finds their work gone has no other way to learn what happened.
              actorType: 'SYSTEM',
              organizationId: root.organizationId,
              subjectType: kind,
              subjectId: root.id,
              subjectLabel: root.name,
              after: {
                name: root.name,
                deleteBatchId: root.deleteBatchId,
                deletedAt: root.deletedAt?.toISOString() ?? null,
                retentionDays: this.config.retentionHierarchyDays,
                // Flattened scalars, never nested: the redactor reduces any non-scalar to a type
                // marker by design, so a nested shape would record that a batch happened and nothing
                // about its size (the ADR-0073 C3.1 finding).
                clientCount: result.clients,
                projectCount: result.projects,
                planCount: result.plans,
                activityCount: result.activities,
              },
            },
            tx,
          );
          return result;
        },
        { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
      );

      // The count WITH the duration, so the cap can be re-derived from production rather than from
      // a seeded bench — the only place the real distribution of batch sizes exists.
      this.logger.info(
        {
          event: 'hierarchy_expiry.batch',
          rootKind: kind,
          rootId: root.id,
          durationMs: Date.now() - startedAt,
          ...counts,
        },
        'expired a deleted subtree',
      );
      return counts;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === FK_VIOLATION || code === BIND_PARAMETER_CEILING) {
        // **Escalated, never absorbed.** A wrong order does not corrupt anything — the transaction
        // rolls back — but the batch is then never deleted and is retried every hour forever, with
        // nothing user-facing saying so. Logged at ERROR precisely because the symptom is silence.
        this.logger.error(
          {
            err: error,
            event: 'hierarchy_expiry.permanent_failure',
            code,
            rootKind: kind,
            rootId: root.id,
          },
          'hierarchy expiry hit a deterministic failure — this batch can NEVER expire, and will be ' +
            'retried hourly forever, until the delete order or the statement size is corrected',
        );
        return null;
      }
      this.logger.error(
        { err: error, event: 'hierarchy_expiry.failed', rootKind: kind, rootId: root.id },
        'hierarchy expiry failed for one batch; the next tick will retry it',
      );
      return null;
    }
  }
}
