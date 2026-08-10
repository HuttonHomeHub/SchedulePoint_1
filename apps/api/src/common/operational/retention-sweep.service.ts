import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { RetentionStatusStore } from './retention-status.store';
import { RetentionSweepRunner } from './retention-sweep.runner';

/**
 * The schedule, and nothing else (ADR-0087 D1).
 *
 * **This application's first piece of scheduled work.** There was no scheduler at all — ADR-0009
 * chose BullMQ + Redis and was never implemented — so this is `HeartbeatService`'s shape
 * deliberately: one `setInterval`, `.unref()`'d, cleared on shutdown, and **no timer created at all**
 * when disabled. No Redis, no queue, no dependency.
 *
 * Its costs are stated in ADR-0087 D1 rather than discovered later: it runs **per replica**, it is
 * **not durable** across a restart, and it has **no retry**. Each is acceptable because of what this
 * job is — idempotent and time-predicated, so a second run finds nothing and an interrupted one is
 * repaired by the next tick. None of that would hold for a job that sends, charges or exports, which
 * is why ADR-0009 is narrowed rather than superseded and D2 names the trigger to reopen it.
 *
 * **It holds no logic.** The statement lives in {@link RetentionSweepRunner}, which takes an instant
 * rather than reading a clock, so the delete is proven against a real Postgres by the API e2e suite
 * without anything waiting for an interval. This class exists to be the only thing that is hard to
 * test, and to be small enough that reading it is enough.
 *
 * **Not exported from `OperationalModule`** — the store is. Same refusal that module already makes
 * for `HeartbeatService`: a reader of the staff panel needs to know what happened, and handing them
 * the timer would let a future controller start, stop or re-run the sweep from a request, which is a
 * different feature with different consequences.
 */
@Injectable()
export class RetentionSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  /** Guards against a second run starting while one is still going, at a short interval. */
  private running = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly runner: RetentionSweepRunner,
    private readonly status: RetentionStatusStore,
    @InjectPinoLogger(RetentionSweepService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.retentionSweepEnabled) {
      // The rollback contract: disabled starts NOTHING. Not a timer that deletes nothing — no
      // timer. Logged so an operator who set the variable can see it took effect, because the
      // observable difference between "off" and "on with nothing to delete" is otherwise nil.
      this.logger.info(
        { event: 'retention.disabled' },
        'retention sweep disabled; no rows will be deleted and no timer was created',
      );
      return;
    }

    // The effective values, at the one moment somebody is watching. A mistyped period is
    // irreversible — shortening deletes, and lengthening afterwards recovers nothing — so the
    // numbers are said out loud rather than left to be inferred from what disappears.
    this.logger.info(
      {
        event: 'retention.configured',
        cspReportsDays: this.config.retentionCspReportsDays,
        mailEventsDays: this.config.retentionMailEventsDays,
        intervalMinutes: this.config.retentionSweepIntervalMinutes,
      },
      'retention sweep armed',
    );

    this.timer = setInterval(
      () => {
        void this.run();
      },
      this.config.retentionSweepIntervalMinutes * 60 * 1000,
    );

    // `unref` so the interval cannot hold the process open — without it Node stays alive for the
    // full period after everything else has finished, which reads as a hang rather than a bug.
    this.timer.unref();

    // One run at boot rather than waiting a full period, and **unawaited**: `onApplicationBootstrap`
    // is on the boot path, and a sweep that finds a large backlog would otherwise delay readiness.
    // Nothing waits on this result.
    void this.run();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * One sweep.
   *
   * The log line carries **scalars only** — counts, durations, table names. Never row content: one
   * of these tables holds attacker-controlled strings and the other holds a customer's email
   * address, and a log is a second copy with different retention from the table this feature exists
   * to bound.
   */
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const at = new Date();

    try {
      const results = await this.runner.sweepAll(at);
      this.status.record(results, at);

      const failed = results.filter((result) => result.error !== undefined);
      if (failed.length > 0) {
        this.logger.warn(
          { event: 'retention.sweep_failed', tables: failed.map((r) => r.table) },
          'a retention sweep failed for at least one table; the next run will retry it',
        );
        return;
      }

      this.logger.info(
        {
          event: 'retention.swept',
          tables: results.map((r) => ({
            table: r.table,
            deleted: r.deleted,
            cappedOut: r.cappedOut,
            durationMs: r.durationMs,
          })),
        },
        'retention sweep complete',
      );
    } catch (error) {
      // **This catch is not defensive tidiness; without it a thrown sweep kills the API.** Both
      // call sites are `void this.run()` — deliberately, so boot and the timer are never blocked on
      // a delete — and a `void`ed promise that rejects is an unhandled rejection, which Node treats
      // as fatal. `HeartbeatService` avoids the same trap by catching inside `ping`; this did not,
      // and its own "releases the overlap guard" test surfaced it as an unhandled error rather than
      // a failure, which is the quiet way that class of defect usually arrives.
      //
      // The runner already catches per policy, so reaching here means something outside the
      // statement broke. The next tick retries, which is the whole reason this design needs no
      // retry of its own.
      this.status.record([], at);
      this.logger.error(
        { err: error, event: 'retention.sweep_failed' },
        'the retention sweep threw; the next run will retry it',
      );
    } finally {
      // In `finally` so a throw cannot leave the guard set — which would silently disable every
      // later tick and present as "retention stopped working" with nothing in the log to explain it.
      this.running = false;
    }
  }
}
