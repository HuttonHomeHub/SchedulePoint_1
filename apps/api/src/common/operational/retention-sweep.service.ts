import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { postAlert } from './alert-dispatch';
import { RetentionStatusStore } from './retention-status.store';
import { RetentionSweepRunner } from './retention-sweep.runner';

/**
 * How many consecutive failed runs earn an alert (ADR-0087 M4).
 *
 * **Three, not one**, and the reason is ADR-0075's: an alert channel that cries wolf gets muted, and
 * a muted channel is worth less than no channel because it is believed to be working. A single
 * failed sweep is usually a connection this process will have again by the next tick, and the next
 * tick IS the retry — so one failure is not yet news. Three at the default hourly interval is three
 * hours of a table not being swept, which is.
 *
 * **What this cannot detect, stated plainly: a sweep that never armed.** No runs means no failures
 * means no alert, forever — the inverted-signal problem, and exactly why the staff console's
 * `overdue` is derived from the age of the oldest surviving row rather than from this counter. That
 * panel is the primary detector; this is the secondary one, for a sweep that is running and losing.
 */
const ALERT_AFTER_CONSECUTIVE_FAILURES = 3;

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
  /**
   * Set once an alert has been sent for the current run of failures; cleared by any clean run.
   *
   * Without it a relay outage would send one message per tick, forever — the failure the threshold
   * exists to prevent, reintroduced by the mechanism meant to report it.
   */
  private alerted = false;

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
        void this.sweepNow();
      },
      this.config.retentionSweepIntervalMinutes * 60 * 1000,
    );

    // `unref` so the interval cannot hold the process open — without it Node stays alive for the
    // full period after everything else has finished, which reads as a hang rather than a bug.
    this.timer.unref();

    // One run at boot rather than waiting a full period, and **unawaited**: `onApplicationBootstrap`
    // is on the boot path, and a sweep that finds a large backlog would otherwise delay readiness.
    // Nothing waits on this result.
    void this.sweepNow();
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
   *
   * **Public, and the module still refuses to export this service.** Both production call sites are
   * here — boot and the tick — so this widens nothing that was not already reachable; what it buys
   * is an API e2e that drives the real, DI-constructed service against a real Postgres and a real
   * alert endpoint. That is the claim worth testing: ADR-0080 shipped `bulk` wired into one host and
   * not its neighbour, unit-green throughout, and a unit spec that constructs this class by hand
   * proves its logic and says nothing about its wiring. A caller in another module still cannot
   * reach it — `OperationalModule` exports the store and not the timer — so the "a controller could
   * start, stop or re-run the sweep from a request" objection is answered by the module, where it
   * belongs, rather than by a keyword.
   */
  async sweepNow(): Promise<void> {
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
        await this.alertIfSustained(failed.map((r) => r.table));
        return;
      }

      // A clean run closes the incident. Re-arming here rather than on the next failure means an
      // outage that recovers and returns hours later alerts again, which is the right answer: it is
      // a new incident to whoever is reading, not a continuation of one they already saw.
      this.alerted = false;

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
      // call sites are `void this.sweepNow()` — deliberately, so boot and the timer are never blocked on
      // a delete — and a `void`ed promise that rejects is an unhandled rejection, which Node treats
      // as fatal. `HeartbeatService` avoids the same trap by catching inside `ping`; this did not,
      // and its own "releases the overlap guard" test surfaced it as an unhandled error rather than
      // a failure, which is the quiet way that class of defect usually arrives.
      //
      // The runner already catches per policy, so reaching here means something outside the
      // statement broke. The next tick retries, which is the whole reason this design needs no
      // retry of its own.
      // `recordFailedRun`, not `record([], at)`. The latter finds no failed table and therefore
      // RESETS the counter — so a sweep that threw on every tick was filed as a clean run, which
      // silenced the threshold below and painted the staff console healthy during the one failure
      // mode nobody anticipated. The alert test found it by expecting a message and getting silence.
      this.status.recordFailedRun(at);
      this.logger.error(
        { err: error, event: 'retention.sweep_failed' },
        'the retention sweep threw; the next run will retry it',
      );
      // A throw is a failed run too. `status.record([], at)` above counts it, and leaving the alert
      // out of this branch would mean the one failure mode nobody anticipated is also the one that
      // never reaches anybody.
      await this.alertIfSustained([]);
    } finally {
      // In `finally` so a throw cannot leave the guard set — which would silently disable every
      // later tick and present as "retention stopped working" with nothing in the log to explain it.
      this.running = false;
    }
  }

  /**
   * Tell the operator once, after {@link ALERT_AFTER_CONSECUTIVE_FAILURES} failed runs in a row.
   *
   * **The body carries counts and table names and nothing else.** One of these tables holds
   * attacker-controlled strings and the other a customer's email address, and this POST leaves the
   * system for a third-party chat service — which is data egress. A table name and a count are
   * enough to act on and say nothing about a person.
   *
   * Awaited rather than `void`ed, unlike the mail alerter's: this is already inside the `try` of an
   * unawaited `run()`, so awaiting here couples nothing to a request and keeps the failure inside
   * the catch that exists two frames up. `postAlert` swallows its own errors regardless.
   */
  private async alertIfSustained(tables: readonly string[]): Promise<void> {
    const failures = this.status.snapshot().consecutiveFailures;
    if (failures < ALERT_AFTER_CONSECUTIVE_FAILURES || this.alerted) return;

    this.alerted = true;
    const named = tables.length > 0 ? ` (${[...tables].sort().join(', ')})` : '';
    await postAlert({
      url: this.config.mailAlertUrl,
      text: `SchedulePoint: the retention sweep has failed ${String(failures)} runs in a row${named}. Rows are not being deleted.`,
      event: 'retention.sweep_failing',
      alertName: 'retention_alert',
      context: { failures, tables: tables.length },
      logger: this.logger,
    });
  }
}
