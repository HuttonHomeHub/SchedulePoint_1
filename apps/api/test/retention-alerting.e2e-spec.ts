import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **The M4 gate: a sweep that keeps failing reaches a channel, and carries nothing from a row.**
 *
 * Its unit sibling proves the threshold's logic against a mocked runner and a stubbed `fetch`. This
 * one exists because that is not the claim: it constructs the service by hand, so it says nothing
 * about whether the producer is **wired** to the transport. ADR-0080 shipped `bulk` wired into one
 * host and not its neighbour, unit-green throughout, and ADR-0086 M2 shipped a route that could not
 * serve a single request with 1,589 unit tests passing. So this boots the real `AppModule`, lets
 * Nest construct the real service, points `MAIL_ALERT_URL` at a real HTTP server on localhost, and
 * makes the delete genuinely fail — by revoking `DELETE` from the application role, which is also
 * the closest thing to the production failure this threshold exists to report.
 *
 * The failure is induced in the **database** rather than by a mock for the same reason
 * `retention-sweep.e2e-spec.ts` exists at all: whether a `PrismaClientKnownRequestError` is caught,
 * reported as a per-table `error` and counted as a failed run — rather than thrown, which would take
 * the process down through the `void`ed call site — is a question only a real Postgres answers.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('Retention alerting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sweep: import('../src/common/operational/retention-sweep.service').RetentionSweepService;
  let alertServer: Server;
  const received: string[] = [];
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    for (const key of ['MAIL_ALERT_URL', 'RETENTION_SWEEP_ENABLED']) {
      originalEnv[key] = process.env[key];
    }

    // A real server, not a mocked `fetch`: the point is that a genuine outbound POST leaves the
    // process and arrives somewhere.
    alertServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push(body);
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => alertServer.listen(0, '127.0.0.1', resolve));
    const { port } = alertServer.address() as AddressInfo;

    // **Captured and restored in `afterAll`.** `vitest.e2e.config.ts` sets `fileParallelism: false`,
    // so every suite shares ONE process and one `process.env`. Leaving `MAIL_ALERT_URL` set would
    // point every later suite's mail alerter at a server this one has already closed — and the
    // suite that breaks is never the suite that is wrong (`mail-alerting.e2e-spec.ts` records the
    // run where that cost 235 failures across 8 files).
    process.env.MAIL_ALERT_URL = `http://127.0.0.1:${String(port)}/alerts`;
    // Disabled, so `onApplicationBootstrap` creates no timer and this suite is the only thing that
    // ever calls the sweep. A background tick firing mid-assertion would make the received count
    // depend on how long `app.init()` took.
    process.env.RETENTION_SWEEP_ENABLED = 'false';

    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const { RetentionSweepService } =
      await import('../src/common/operational/retention-sweep.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
    // `strict: false` searches the whole container. `OperationalModule` deliberately does NOT export
    // this service — a controller must not be able to start, stop or re-run the sweep from a
    // request — and that refusal is exactly what makes this the only way to reach the real instance.
    sweep = app.get(RetentionSweepService, { strict: false });

    // **Repair before use, not only after.** The test below revokes a role-level privilege, which
    // is not session state: it takes effect immediately and outlives this process. A hard kill
    // (OOM, a cancelled CI job) between the revoke and `afterAll` would leave `DELETE` revoked for
    // every later step in the same job — the pairwise differential and the Playwright suites run
    // afterwards against the same database and the same role — producing failures with no visible
    // connection to this file. That is `docs/TECH_DEBT.md` #119's shape exactly, and the security
    // review raised it. A `GRANT` here means the next run self-heals; the residual is a crash
    // within one job, which is accepted and stated rather than left to be discovered.
    await prisma.$executeRawUnsafe('GRANT DELETE ON csp_reports TO CURRENT_USER');
  });

  afterAll(async () => {
    // Restore the privilege first, whatever happened: leaving `DELETE` revoked would break every
    // later suite in this shared process, in a way whose cause is nowhere near the failure.
    await prisma?.$executeRawUnsafe('GRANT DELETE ON csp_reports TO CURRENT_USER');
    await app?.close();
    await new Promise<void>((resolve) => alertServer.close(() => resolve()));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('stays silent for two failed runs, alerts once on the third, and names no row', async () => {
    // **One test, deliberately.** The threshold's counter and its "already alerted" latch are
    // process-lifetime state on a singleton — they have to be, or an outage would alert once per
    // tick — so a second test could not assume a fresh count and a `beforeEach` could not give it
    // one. The mail suite records the same reasoning, and records what splitting it cost.
    await prisma.$executeRawUnsafe('REVOKE DELETE ON csp_reports FROM CURRENT_USER');

    await sweep.sweepNow();
    expect(received, 'one failed sweep is not news — the next tick is the retry').toHaveLength(0);

    await sweep.sweepNow();
    expect(received).toHaveLength(0);

    await sweep.sweepNow();
    expect(received, 'three consecutive failures IS news').toHaveLength(1);

    const body = received[0] ?? '';
    expect(body).toContain('retention.sweep_failing');
    expect(body).toContain('csp_reports');
    // The alert leaves the system for a third-party chat service, which is data egress. `csp_reports`
    // holds attacker-controlled strings and `mail_events` holds a customer's address; a table name
    // and a count are enough to act on and say nothing about a person.
    expect(body).not.toMatch(/@|document_uri|recipient/);

    // A fourth failure adds nothing: without the latch a relay outage sends one message per tick,
    // forever — the failure the threshold exists to prevent, reintroduced by the reporting.
    await sweep.sweepNow();
    expect(received).toHaveLength(1);

    // And the process is still standing. The call site in production is `void this.sweepNow()`, so a
    // sweep that threw rather than caught would be an unhandled rejection, which Node treats as
    // fatal — a database permission error is precisely the shape that would do it.
    await prisma.$executeRawUnsafe('GRANT DELETE ON csp_reports TO CURRENT_USER');
    await sweep.sweepNow();
    expect(received, 'a clean run says nothing').toHaveLength(1);
  });
});
