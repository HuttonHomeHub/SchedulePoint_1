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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
