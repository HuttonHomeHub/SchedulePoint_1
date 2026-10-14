import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../modules/audit/audit.service';
import { BATCH_TRANSACTION_TIMEOUT_MS, PrismaService } from '../../prisma/prisma.service';

import {
  ACTIVITY_BUDGET_PER_RUN,
  SCOPE_BUDGET_PER_RUN,
  resolveExpiryScope,
  selectExpiryCandidates,
  selectExpiryCandidatesBounded,
  type ExpiryRoot,
} from './hierarchy-expiry.candidates';
import { claimExpiredRoot } from './hierarchy-expiry.claim';
import { deleteExpiredScope, type ExpiryCounts } from './hierarchy-expiry.runner';

/**
 * How many history rows cost as much, in the activity budget, as one activity (ADR-0174 D8).
 *
 * **Measured 2026-10-04 (M3-T1), on a shared 4-vCPU container, not the deployed host** —
 * `docs/specs/activity-change-history/m3-measurement.md`, `test/measure/hierarchy-expiry-history.measure.ts`.
 * One 2,000-activity scope with a link chain deleted in 65–90 µs per activity. A history row cost
 * 3.6–4.7 µs when the rows were written in activity order, and **5–7.8 µs when they were interleaved
 * across the activities in time**, which is how real history lands on disk. The quotient is 17–25
 * clustered and **8.3–10.4 interleaved**, both warm. Rows cold in the cache cost more per row still,
 * which pushes the quotient lower and was not measured, so **5 leaves about 1.7–2× headroom** for it.
 * Charging too much only slows a backlog's drain (an hourly run is 20,000 activity-equivalents, now
 * 100,000 history rows, against a busy plan's 18k–190k rows a year); charging too little overruns
 * the 60 s batch transaction, so a higher constant is the unsafe move. TECH_DEBT #443: re-measure
 * cold and interleaved on the deployed host.
 */
export const HISTORY_ROWS_PER_ACTIVITY = 5;

/** What one expired scope costs the run's activity budget: its activities plus its history rows. */
function budgetCharge(counts: ExpiryCounts): number {
  return counts.activities + Math.ceil(counts.activityHistoryEntries / HISTORY_ROWS_PER_ACTIVITY);
}

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
      // No timer at all when disabled — the ADR-0087 D5 shape.
      void this.logDisabled();
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

  /**
   * The not-armed boot line, with how many roots are already past their period, so an operator
   * reading Dockge sees a number before switching on. **Counts only, never a name**: the log is a
   * rotated file on the host and customer names have no business in it (the preview command prints
   * them to the terminal instead). A failed count is logged and the line still goes out — this
   * must never be the reason an API does not start.
   */
  private async logDisabled(): Promise<void> {
    let pastPeriod: { clients: number; projects: number; plans: number } | undefined;
    let atLeast = false;
    try {
      // **Bounded, like the sweep**: this runs at every boot, forever, on every host that has not
      // armed — the one place a large bin must not be pulled into memory. The count is then "at
      // least N" when a scan hit the limit, and says so; the preview command lists everything.
      const { roots, truncated } = await selectExpiryCandidatesBounded(this.prisma, {
        cutoff: this.cutoff(new Date()),
        limit: CANDIDATE_SCAN_LIMIT,
      });
      atLeast = truncated;
      pastPeriod = { clients: 0, projects: 0, plans: 0 };
      for (const root of roots) {
        if (root.kind === 'client') pastPeriod.clients += 1;
        else if (root.kind === 'project') pastPeriod.projects += 1;
        else pastPeriod.plans += 1;
      }
    } catch (error) {
      this.logger.warn(
        { err: error, event: 'hierarchy_expiry.past_period_count_failed' },
        'could not count deleted work past its retention period; continuing',
      );
    }
    this.logger.info(
      {
        event: 'hierarchy_expiry.disabled',
        ...(pastPeriod ? { pastPeriod, ...(atLeast ? { pastPeriodIsAtLeast: true } : {}) } : {}),
      },
      'hierarchy expiry is not armed',
    );
  }

  private cutoff(now: Date): Date {
    return new Date(now.getTime() - this.config.retentionHierarchyDays * 86_400_000);
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

  /**
   * Selection lives in {@link selectExpiryCandidates}, shared with the operator's preview; this
   * method owns only the budgets and the loop.
   */
  private async sweep(now: Date): Promise<void> {
    const cutoff = this.cutoff(now);
    let activityBudget = ACTIVITY_BUDGET_PER_RUN;
    let scopeBudget = SCOPE_BUDGET_PER_RUN;

    const roots = await selectExpiryCandidates(this.prisma, {
      cutoff,
      limit: CANDIDATE_SCAN_LIMIT,
    });
    for (const root of roots) {
      if (activityBudget <= 0 || scopeBudget <= 0) return;
      scopeBudget -= 1;
      const counts = await this.expireScope(root, cutoff);
      if (counts) activityBudget -= budgetCharge(counts);
    }
  }

  private async expireScope(root: ExpiryRoot, cutoff: Date): Promise<ExpiryCounts | null> {
    const kind = root.kind;
    const startedAt = Date.now();
    try {
      const counts = await this.prisma.$transaction(
        async (tx) => {
          // **First statement, before anything is deleted**: the scan was a while ago, and a planner
          // may have restored this root since. Nothing has been written when the claim fails, so
          // there is nothing to undo and no audit row to retract.
          if (!(await claimExpiredRoot(tx, root, cutoff))) return null;

          // **Resolved here, after the claim**, so the descendant ids are read in the same
          // transaction that deletes them rather than seconds earlier: a project or plan created or
          // moved under the root in the gap is neither missed (a foreign-key failure) nor stale.
          const scope = await resolveExpiryScope(tx, root);
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
                deletedAt: root.deletedAt.toISOString(),
                retentionDays: this.config.retentionHierarchyDays,
                // Flattened scalars, never nested: the redactor reduces any non-scalar to a type
                // marker by design, so a nested shape would record that a batch happened and nothing
                // about its size (the ADR-0073 C3.1 finding).
                clientCount: result.clients,
                projectCount: result.projects,
                planCount: result.plans,
                activityCount: result.activities,
                activityHistoryCount: result.activityHistoryEntries,
              },
            },
            tx,
          );
          return result;
        },
        { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
      );

      if (counts === null) {
        this.logger.debug(
          { event: 'hierarchy_expiry.skipped_restored', rootKind: kind, rootId: root.id },
          'a deleted root was restored or re-deleted since the scan; nothing was removed',
        );
        return null;
      }

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
