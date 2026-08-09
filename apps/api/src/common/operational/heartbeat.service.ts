import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

/**
 * How long one heartbeat POST may take before it is abandoned.
 *
 * Generous relative to the work — a dead-man's-switch receiver answers in milliseconds — because
 * the only cost of waiting is a held socket, and the only cost of giving up too early is a missed
 * ping that looks exactly like the outage this exists to report.
 */
export const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * A dead-man's-switch: POST on an interval so an external service can alert on the **absence** of
 * the ping.
 *
 * **This is the one honest thing an application can do about its own liveness.** Everything else in
 * this milestone is a signal the API sends when something is wrong; the API can send nothing when
 * the API is what is wrong. `scripts/watch-mail-failures.sh` has the same defect one layer out and
 * does not escape it — its "cannot read logs" branch runs on the very host it is meant to be
 * watching, so a host outage silences the watcher and the thing watched together. Inverting the
 * signal is the only construction that survives the failure it reports: silence *is* the alarm.
 *
 * **Nothing watches this yet.** The product owner chose to build it and wire a receiver later
 * (CQ-4, 2026-08-09) rather than take the spec's own fallback of not building it at all — the
 * fallback existed because shipping a signal nobody receives is verbatim the failure
 * `docs/TECH_DEBT.md` #100 records ADR-0075 making. That choice is defensible **only if the
 * dormancy is real**, so it is a requirement rather than an optimisation: with `HEARTBEAT_URL`
 * absent, {@link onApplicationBootstrap} creates **no timer at all**, and a unit test asserts it —
 * because once both are silent, nothing observable distinguishes "not configured" from "configured
 * and posting into a void". #100's operator half stays **open** until a receiver exists; merging
 * this does not close it.
 *
 * **Deliberately not part of `/health/ready`**, and this is the same reason `MailBootstrapService`
 * gives for the same refusal: readiness is consumed by the container healthcheck, so folding an
 * outbound network call into it converts a receiver outage into a restart loop — the failure it
 * reports, with more moving parts. It will be re-proposed; that is why the reason is written here.
 *
 * With more than one replica this is N pings per interval rather than one. Harmless for a switch
 * that asks "did *anything* ping?", and stated because the arithmetic looks wrong to a reader who
 * assumes one.
 */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(HeartbeatService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    const url = this.config.heartbeatUrl;
    // The rollback contract, and the whole basis on which CQ-4 was answered "build it anyway":
    // absent config starts NOTHING. Not a timer that posts nowhere — no timer.
    if (url === undefined) return;

    this.timer = setInterval(() => {
      void this.ping(url);
    }, this.config.heartbeatIntervalMs);

    // `unref` so the interval cannot hold the process open. Without it Node stays alive for the
    // full period after everything else has finished, which in a test run reads as a hang rather
    // than as a bug — the `SEND_TIMEOUT_MS`/`VERIFY_TIMEOUT_MS` lesson, one timer along.
    this.timer.unref();

    // Ping once at boot rather than waiting a full period. A container that crash-loops faster than
    // the interval would otherwise never ping at all, and the switch would report an outage that is
    // real but for the wrong reason — which costs an operator the one thing the signal is for.
    void this.ping(url);
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * One bounded POST, swallowed.
   *
   * A failure here is **not** worth escalating: a missed ping is exactly what the receiver is
   * watching for, so the receiver will say so far more usefully than a log line nobody is reading.
   * Logging at `debug` rather than `warn` for that reason — a flapping receiver would otherwise
   * fill the log with warnings about the health of the *monitoring*, which is noise that trains an
   * operator to ignore the stream carrying the real signal.
   *
   * The URL is never logged. `hc-ping.com/<uuid>` is a bearer credential in path form: anyone
   * holding it can suppress the alarm.
   */
  private async ping(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.debug(
          { event: 'heartbeat.rejected', status: response.status },
          'the heartbeat receiver rejected the ping',
        );
      }
    } catch (error) {
      this.logger.debug(
        { event: 'heartbeat.failed', err: error },
        'could not deliver a heartbeat; a missed ping is what the receiver watches for',
      );
    }
  }
}
