import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The single Prisma entry point. The **only** place the app talks to the
 * database (see docs/BACKEND_ARCHITECTURE.md). Repositories/services inject
 * this; nothing builds raw SQL strings.
 */
/**
 * How long an interactive transaction may run before Prisma aborts it with P2028
 * (`docs/TECH_DEBT.md` #74/#109).
 *
 * **There was no explicit timeout anywhere in `apps/api` until this**, so every transaction in the
 * application ran on Prisma's 5-second default — including the ones that take the plan-wide
 * advisory lock and sweep thousands of rows. That default is a sensible ceiling for an ordinary
 * write and far too tight for a batch, and nothing said so; the first symptom would have been a
 * P2028 mid-cascade on a large plan, which reads as a random failure rather than a limit.
 *
 * 15 s is the global ceiling: comfortably above every measured single-plan write, still low enough
 * that a wedged transaction releases its locks while somebody is still watching. The genuinely long
 * operations override it per call rather than dragging this number up — a global sized for the
 * worst case would stop protecting the common one, which is the whole reason CQ-6 chose
 * "global default plus per-operation overrides" over either alone.
 */
export const TRANSACTION_TIMEOUT_MS = 15_000;

/**
 * The ceiling for a deliberately batched write — a 2,000-activity bulk delete, an interchange
 * commit, a programme recalculation across a plan closure.
 *
 * Set against the batched sweep rather than the loop it replaced: #109 turned ~10,000 statements
 * into four, and ADR-0053 M6 measured the same shape at ~830 ms → ~13 ms for 2,000 rows. 60 s is
 * therefore ~4× headroom on a worst case that is itself now an order of magnitude cheaper — not a
 * number chosen to make a slow path fit.
 */
export const BATCH_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * The longest `onModuleDestroy` waits for registered drains before disconnecting anyway.
 *
 * **4 s, chosen against the host rather than the work.** `docker stop` (and Watchtower's recreate,
 * ADR-0047) sends SIGTERM and then SIGKILL after 10 s, and the other modules' destroy hooks, the
 * disconnect itself and the shutdown hooks all share that window. A drain is normally one batch
 * (milliseconds); 4 s is hundreds of times that, so it only ever fires for a statement stuck behind
 * a row lock — and leaves ~6 s of headroom. I considered a `statement_timeout` on the sweep's batch
 * delete instead and did not: it would turn a slow-but-healthy delete into a genuine
 * `retention.sweep_failed` on a busy host, i.e. reintroduce the alert noise this exists to remove.
 */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 4_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly shutdownDrains: Array<() => Promise<void>> = [];
  private destroying = false;

  constructor() {
    super({ transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Register work that must have finished with the database before the engine goes away.
   *
   * **The point is that the ordering lives here, where the disconnect is, rather than in Nest's
   * hook order.** A consumer that awaits its own in-flight query in `onModuleDestroy` is correct
   * only if its module is destroyed before this one — an implementation detail of `@nestjs/core`
   * (`docs/TECH_DEBT.md` #303) that a major bump can reverse without failing anything. Draining
   * from inside this hook makes it true whichever module Nest destroys first.
   */
  registerShutdownDrain(drain: () => Promise<void>): void {
    if (this.destroying) {
      // Shutdown has already collected its drains, so this one would never run. Said out loud
      // because the caller believes its work is protected.
      this.logger.warn('A shutdown drain was registered after shutdown began; it will not run');
      return;
    }
    this.shutdownDrains.push(drain);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    // `allSettled`, not `all`: a drain that fails must not leave the engine connected, and the
    // failure is logged rather than lost.
    const draining = Promise.allSettled(this.shutdownDrains.map((drain) => drain()));
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timed_out'>((resolve) => {
      timer = setTimeout(() => {
        resolve('timed_out');
      }, SHUTDOWN_DRAIN_TIMEOUT_MS);
      // Unref'd so the bound itself can never keep a process alive.
      timer.unref();
    });
    const outcome = await Promise.race([draining, timedOut]);
    clearTimeout(timer);

    if (outcome === 'timed_out') {
      this.logger.warn({
        event: 'prisma.shutdown_drain_timed_out',
        timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS,
        message: 'A shutdown drain did not finish in time; disconnecting anyway',
      });
    } else {
      for (const settled of outcome) {
        if (settled.status === 'rejected') {
          this.logger.error('A shutdown drain failed; disconnecting anyway', settled.reason);
        }
      }
    }
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
