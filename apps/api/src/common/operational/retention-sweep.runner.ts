import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../prisma/prisma.service';

import { cutoffFor, RETENTION_POLICIES, type RetentionPolicy } from './retention-policy';

/**
 * How many rows one statement deletes.
 *
 * **Measured, not chosen** (ADR-0087 D6), against `csp_reports` at 500,000 rows / 207 MB and
 * `mail_events` at 200,000 rows / 38 MB — the sizes the two migrations themselves measured, on
 * Postgres 17:
 *
 * | batch  | csp_reports | mail_events |
 * | ------ | ----------- | ----------- |
 * | 100    | 4.7 ms      | —           |
 * | 1,000  | **5.6 ms**  | **3.8 ms**  |
 * | 10,000 | 40.5 ms     | —           |
 *
 * Ten times the rows for 1.2× the time between 100 and 1,000; 10,000 holds locks eight times longer
 * for no throughput worth having.
 */
const BATCH_SIZE = 1000;

/**
 * The most rows one run will delete from one table before stopping and leaving the rest for the next
 * tick.
 *
 * 50 batches ≈ 0.3 s at the measured rate — enough to drain a day of ordinary growth in one run,
 * bounded so a pathological backlog cannot hold a connection for minutes. Hitting it is not an
 * error: the work is idempotent and time-predicated, so the next tick resumes it.
 */
const RUN_CAP = 50_000;

/** What one table's sweep did. */
export interface RetentionSweepResult {
  readonly table: string;
  readonly deleted: number;
  readonly batches: number;
  /** The cap was reached and rows remain. Not an error — the next run continues. */
  readonly cappedOut: boolean;
  readonly durationMs: number;
  /** Present only when the table's sweep threw; the other tables still ran. */
  readonly error?: string;
}

/**
 * Deletes rows past their retention period (ADR-0087).
 *
 * **It takes no timer and reads no clock of its own** — `sweep(now)` is called with an instant. That
 * is the seam: `RetentionSweepService` owns the schedule, this owns the statement, and the API e2e
 * suite drives this directly against a real Postgres without waiting for an interval.
 *
 * Three properties are decisions rather than implementation details:
 *
 * 1. **`ctid`, not `id`.** The obvious `WHERE id IN (SELECT id … LIMIT n)` was measured and rejected:
 *    the planner's OUTER lookup degrades to a sequential scan as the batch grows or the table
 *    shrinks — 160 ms over 499,000 rows at batch 10,000, and **10.8× slower on the smaller table** —
 *    so the delete costs O(table) rather than O(batch), which is the one property a batched delete
 *    exists to guarantee. `ctid IN (…)` is always a Tid Scan. It is used **inside one statement and
 *    never persisted or carried between statements**: a `ctid` is a physical row location and moves
 *    under `VACUUM`. Each batch re-selects, which is what makes that safe.
 * 2. **No `$transaction`.** A long transaction is precisely the thing being avoided on a table an
 *    unauthenticated endpoint writes to. Each batch is atomic on its own, and a run interrupted
 *    halfway leaves a consistent database with some expired rows still present — which the next tick
 *    takes, because the predicate is "older than X" and not a work queue.
 * 3. **One statement per policy, with the table and column as literals.** A policy selects a
 *    statement; it never builds one. There is no code path in which a table name reaches SQL from a
 *    variable, and `retention-boundary.structural.spec.ts` asserts that rather than trusting it.
 */
@Injectable()
export class RetentionSweepRunner {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(RetentionSweepRunner.name) private readonly logger: PinoLogger,
  ) {}

  /** Sweep every policy. One table's failure never stops another's. */
  async sweepAll(now: Date): Promise<RetentionSweepResult[]> {
    const results: RetentionSweepResult[] = [];
    for (const policy of RETENTION_POLICIES) {
      results.push(await this.sweep(policy, now));
    }
    return results;
  }

  async sweep(policy: RetentionPolicy, now: Date): Promise<RetentionSweepResult> {
    const cutoff = cutoffFor(policy.days, now);
    const started = Date.now();
    let deleted = 0;
    let batches = 0;

    try {
      for (;;) {
        const removed = await this.deleteBatch(policy, cutoff);
        deleted += removed;
        batches += 1;
        // A short batch means the table is drained: the statement asked for BATCH_SIZE and the
        // index had fewer to give.
        if (removed < BATCH_SIZE) break;
        if (deleted >= RUN_CAP) {
          return {
            table: policy.table,
            deleted,
            batches,
            cappedOut: true,
            durationMs: Date.now() - started,
          };
        }
      }
    } catch (error) {
      // Caught per policy so a broken table cannot stop its sibling — and logged rather than
      // rethrown, because the caller is a timer with nobody waiting on it. The next tick retries.
      this.logger.error(
        { err: error, event: 'retention.sweep_failed', table: policy.table },
        'a retention sweep failed; the next run will retry it',
      );
      return {
        table: policy.table,
        deleted,
        batches,
        cappedOut: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.constructor.name : 'UnknownError',
      };
    }

    return {
      table: policy.table,
      deleted,
      batches,
      cappedOut: false,
      durationMs: Date.now() - started,
    };
  }

  /**
   * One bounded delete.
   *
   * The `switch` is the mechanism that keeps table and column names out of the data path: each arm
   * is a tagged template with **literals**, so there is nothing for a caller to influence. It reads
   * as repetition and is the point — a single parameterised statement would need the identifiers
   * interpolated, and Prisma's tagged template cannot parameterise an identifier.
   */
  private async deleteBatch(policy: RetentionPolicy, cutoff: Date): Promise<number> {
    switch (policy.table) {
      case 'csp_reports':
        return await this.prisma.$executeRaw`
          DELETE FROM csp_reports WHERE ctid IN (
            SELECT ctid FROM csp_reports WHERE last_seen_at < ${cutoff}
            ORDER BY last_seen_at, id LIMIT ${BATCH_SIZE}
          )`;
      case 'mail_events':
        return await this.prisma.$executeRaw`
          DELETE FROM mail_events WHERE ctid IN (
            SELECT ctid FROM mail_events WHERE occurred_at < ${cutoff}
            ORDER BY occurred_at, id LIMIT ${BATCH_SIZE}
          )`;
    }
  }
}

export { BATCH_SIZE, RUN_CAP };
