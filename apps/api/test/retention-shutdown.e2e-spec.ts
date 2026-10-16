import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { RetentionSweepRunner } from '../src/common/operational/retention-sweep.runner';
import { RetentionSweepService } from '../src/common/operational/retention-sweep.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * **The gate `docs/TECH_DEBT.md` #303 said it needed: closing an app while its boot sweep is running
 * must not emit `retention.sweep_failed`.**
 *
 * That event is the one ADR-0087 M4's alert counts, and every API e2e run used to print it once or
 * twice because the boot sweep is deliberately unawaited and a suite closes its app promptly. The
 * evidence was a human reading a 600-second log; this makes it an assertion.
 *
 * **Opt-in capture, no shared harness change.** The two sweep loggers are replaced with recorders by
 * token for THIS spec's testing module only. Capturing real Pino output would need the transport the
 * other suites silence (`LOG_LEVEL=silent`), and would be the shared-infrastructure change #268
 * records deferring.
 *
 * **Deterministic rather than lucky.** Left alone, the race is the sweep losing by a few
 * milliseconds. `$executeRaw` is therefore made slow on this one Prisma instance, and the test waits
 * until the first statement is genuinely in flight before it closes — so without the fix the
 * disconnect lands under a running statement every time, not most runs.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const STATEMENT_SLEEP_SECONDS = 0.4;

interface Recorded {
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
}

describe.skipIf(!hasDatabase)('Retention sweep vs shutdown (e2e)', () => {
  const recorded: Recorded[] = [];
  let app: NestExpressApplication | undefined;
  let closed = false;
  const originalEnv = process.env.RETENTION_SWEEP_ENABLED;

  const recorder = () => {
    const record = (level: Recorded['level']) => (fields: unknown) => {
      recorded.push({ level, event: (fields as { event?: string }).event ?? '' });
    };
    return { info: record('info'), warn: record('warn'), error: record('error') };
  };

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    // Explicit: the boot sweep is the subject, so it must not depend on a default.
    process.env.RETENTION_SWEEP_ENABLED = 'true';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getLoggerToken(RetentionSweepRunner.name))
      .useValue(recorder())
      .overrideProvider(getLoggerToken(RetentionSweepService.name))
      .useValue(recorder())
      .compile();

    const prisma = moduleRef.get(PrismaService);
    const real = prisma.$executeRaw.bind(prisma);
    let markStarted!: () => void;
    const firstStatementStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    // The statement the sweep issues is replaced by one that is slow INSIDE the engine. Delaying it
    // in JS would not do: Prisma reconnects lazily, so a statement sent after the disconnect
    // succeeds and the race this spec exists for would never happen.
    vi.spyOn(prisma, '$executeRaw').mockImplementation((() => {
      markStarted();
      return real(Prisma.sql`SELECT pg_sleep(${STATEMENT_SLEEP_SECONDS})`);
    }) as never);

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app);
    await app.init();
    await firstStatementStarted;
    await app.close();
    closed = true;
  });

  afterAll(async () => {
    // Only if `beforeAll` threw before closing; a second `close()` would be a second teardown.
    if (!closed) await app?.close();
    if (originalEnv === undefined) delete process.env.RETENTION_SWEEP_ENABLED;
    else process.env.RETENTION_SWEEP_ENABLED = originalEnv;
  });

  it('emits no retention.sweep_failed when the app closes mid-sweep', () => {
    const failures = recorded.filter((entry) => entry.event === 'retention.sweep_failed');

    expect(failures).toEqual([]);
  });

  it('records that the sweep was abandoned, which proves it really was in flight', () => {
    // Without this the test above could pass because the sweep never started.
    expect(recorded).toContainEqual({ level: 'info', event: 'retention.sweep_abandoned' });
  });
});
