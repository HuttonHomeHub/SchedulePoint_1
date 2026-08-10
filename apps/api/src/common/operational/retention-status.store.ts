import { Injectable } from '@nestjs/common';

import type { RetentionSweepResult } from './retention-sweep.runner';

/** What the last sweep did to one table. */
export interface RetentionTableStatus {
  readonly table: string;
  readonly deleted: number;
  readonly cappedOut: boolean;
  readonly failed: boolean;
}

/**
 * The sweep's last-run state, in memory (ADR-0087).
 *
 * **Separate from the scheduler, and that separation is the point.** `OperationalModule` exports
 * this and deliberately does **not** export `RetentionSweepService` — the same refusal it already
 * makes for `HeartbeatService`. A reader of the staff panel needs to know what happened; giving them
 * a handle on the timer would let a future controller start, stop or re-run it from a request, which
 * is a different feature with different consequences.
 *
 * **It resets on restart, and that is why it is not the panel's primary signal.** A last-run
 * timestamp alone cannot distinguish "the sweep is working" from "the sweep never armed" — the same
 * inverted-signal problem `HeartbeatService` exists to solve one layer out. The panel's leading
 * answer is therefore *derived*: the age of the oldest surviving row against the configured period,
 * which is true whether or not any sweep code has ever run.
 */
@Injectable()
export class RetentionStatusStore {
  /** When this process started — the window `lastRunAt === null` has to be read against. */
  readonly processStartedAt = new Date();

  private lastRunAt: Date | null = null;
  private lastTables: RetentionTableStatus[] = [];
  private consecutiveFailures = 0;
  /**
   * Set when the last run threw before it could report anything per table.
   *
   * **Reported rather than inferred**, because inferring it is exactly the state-collapse this
   * feature exists to prevent: after a crash `lastTables` is empty, so every table falls back to
   * `failed: false` / `lastDeleted: null` — byte-identical to "this process has not swept yet",
   * while `lastRunAt` and `consecutiveFailures` say the opposite. A reader would have to
   * cross-reference three fields to work out which. Raised by the API review.
   */
  private lastRunCrashed = false;

  record(results: readonly RetentionSweepResult[], at: Date): void {
    this.lastRunAt = at;
    this.lastTables = results.map((result) => ({
      table: result.table,
      deleted: result.deleted,
      cappedOut: result.cappedOut,
      failed: result.error !== undefined,
    }));
    // A run counts as failed if ANY table failed. One broken table is a broken sweep from an
    // operator's point of view, and treating it as a partial success is how a persistent failure on
    // one table stays invisible behind another table's success.
    this.consecutiveFailures = this.lastTables.some((table) => table.failed)
      ? this.consecutiveFailures + 1
      : 0;
    this.lastRunCrashed = false;
  }

  /**
   * A run that threw before it could report anything.
   *
   * **A separate method because inferring it from an empty result list was wrong**, and wrong in
   * the worst direction: `record([])` finds no failed table, so it reset `consecutiveFailures` to
   * zero — a sweep that crashed on every tick was filed as a clean run, silencing the M4 alert
   * threshold and painting the staff console healthy during the one failure mode nobody
   * anticipated. Found by the alert test, which expected a message and got silence.
   *
   * The table list is cleared rather than kept, because nothing is known about any table: the run
   * did not get far enough to have an opinion, and holding the previous run's numbers would show
   * last hour's deletions beside this hour's failure.
   */
  recordFailedRun(at: Date): void {
    this.lastRunAt = at;
    this.lastTables = [];
    this.consecutiveFailures += 1;
    this.lastRunCrashed = true;
  }

  snapshot(): {
    processStartedAt: Date;
    lastRunAt: Date | null;
    tables: RetentionTableStatus[];
    consecutiveFailures: number;
    lastRunCrashed: boolean;
  } {
    return {
      processStartedAt: this.processStartedAt,
      lastRunAt: this.lastRunAt,
      tables: this.lastTables,
      consecutiveFailures: this.consecutiveFailures,
      lastRunCrashed: this.lastRunCrashed,
    };
  }
}
