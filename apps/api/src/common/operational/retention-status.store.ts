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
  }

  snapshot(): {
    processStartedAt: Date;
    lastRunAt: Date | null;
    tables: RetentionTableStatus[];
    consecutiveFailures: number;
  } {
    return {
      processStartedAt: this.processStartedAt,
      lastRunAt: this.lastRunAt,
      tables: this.lastTables,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
