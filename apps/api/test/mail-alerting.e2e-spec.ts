import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import { MailService } from '../src/common/mail/mail.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * **The M1 gate: a failing send reaches a channel, and does not carry an address there.**
 *
 * Its sibling `mail-failure.e2e-spec.ts` replaces `MailService` wholesale with a stub, which is
 * right for what that suite proves (what a *caller* can observe) and structurally blind to this
 * one — the alerting lives inside `SmtpMailService`, below the port that suite overrides. So this
 * suite overrides **nothing**: it boots the real `AppModule`, lets `MailModule`'s factory build the
 * real SMTP adapter against an unroutable port, and points `MAIL_ALERT_URL` at a real HTTP server
 * on localhost.
 *
 * That is the whole reason it exists rather than another unit test. The unit suite proves the
 * service's logic with a mocked `fetch` and a mocked Prisma; it cannot prove that the adapter is
 * *wired* to it — and this epic's own plan records `bulk` being wired into one host and not its
 * neighbour, unit-green throughout (ADR-0080/0081). The wiring is the claim.
 *
 * **`docs/TECH_DEBT.md` #100 still does not close on this suite passing**, and that is not modesty.
 * It proves the mechanism works; the row asks whether a signal reaches a person, which needs
 * `MAIL_ALERT_URL` set on the deployed host and observed alerting on a genuinely broken relay.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** A recipient with a distinctive local part, so "is the address in the alert body?" is unambiguous. */
const RECIPIENT = 'alert-canary@example.test';

describe.skipIf(!hasDatabase)('Mail failure alerting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alertServer: Server;
  const received: string[] = [];
  /** Every `process.env` key this suite writes, with the value it had before — see `beforeAll`. */
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    for (const key of [
      'MAIL_SMTP_URL',
      'MAIL_FROM',
      'MAIL_ALERT_URL',
      'MAIL_ALERT_WINDOW_MINUTES',
    ]) {
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

    // Port 1 on loopback refuses instantly, so the adapter's `catch` fires on a real ECONNREFUSED
    // rather than after SEND_TIMEOUT_MS — the failure this records is a transport failure, and
    // waiting ten seconds to produce one would make the suite slow for no extra proof.
    //
    // **Every variable this suite sets is captured and restored in `afterAll`**, and that is not
    // housekeeping — `vitest.e2e.config.mts` sets `fileParallelism: false`, so all 36 suites share
    // ONE process and one `process.env`. Leaving `MAIL_SMTP_URL` set makes every later suite boot
    // the real SMTP adapter against a refusing port instead of the logging stub, which is exactly
    // what happened on the first full run: 235 failures across 8 files, none of them in this one,
    // presenting as an unrelated foreign-key violation in `schedule.e2e-spec`'s reset. The suite
    // that breaks is never the suite that is wrong.
    process.env.MAIL_SMTP_URL = 'smtp://127.0.0.1:1';
    process.env.MAIL_FROM = 'SchedulePoint <no-reply@example.test>';
    process.env.MAIL_ALERT_URL = `http://127.0.0.1:${String(port)}/alerts`;
    process.env.MAIL_ALERT_WINDOW_MINUTES = '60';

    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(PrismaServiceToken);
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => alertServer.close(() => resolve()));
    // Restore rather than delete: a sibling suite may legitimately have set one of these before us,
    // and deleting would break it just as surely as leaving ours behind did.
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma?.mailEvent.deleteMany({});
  });

  beforeEach(async () => {
    await prisma.mailEvent.deleteMany({});
  });

  /**
   * The record and the POST are both deliberately un-awaited, so wait for them.
   *
   * **On the row count, never on a fixed delay** (`docs/TECH_DEBT.md` #132). The previous version
   * waited for the first alert POST and then slept 50 ms, which is not a wait for five writes at
   * all: in CI it returned with one row on disk, test 1 failed asserting five, the other four
   * landed during test 2, and test 2 then failed asserting one and seeing five. Both cases red,
   * neither of them the defect — and the pattern that fixes it was already in this file, applied to
   * one case and not its neighbour.
   *
   * It throws rather than falling through to the assertion, because "expected 5, got 1" sends the
   * next reader looking at the service.
   */
  const settleRows = async (expected: number): Promise<void> => {
    for (let i = 0; i < 100 && (await prisma.mailEvent.count()) < expected; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const landed = await prisma.mailEvent.count();
    if (landed < expected) {
      throw new Error(
        `mail_events did not reach ${expected} rows within 2s (saw ${landed}) — the writes are ` +
          'fire-and-forget, so this is a wait that gave up, not necessarily a missing write.',
      );
    }
  };

  /** The alert POST leaves the process, so it is waited for separately from the durable rows. */
  const settleAlert = async (): Promise<void> => {
    for (let i = 0; i < 50 && received.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // A short tail so a SECOND alert — the thing "alerts exactly once" is about — has a chance to
    // arrive and be caught, rather than being counted as absent because nothing waited for it.
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  /**
   * **One test, deliberately, and the reason is a real property of the service.**
   *
   * The coalescing window is process-lifetime state on a singleton — it has to be, or a broken
   * relay would alert once per request rather than once per outage. So the *first* failure in the
   * process opens a 60-minute window and every later one is correctly silent, which means a second
   * test cannot assume a fresh window and a `beforeEach` cannot give it one. Splitting this into
   * three readable tests produced exactly that: two of them asserting on an alert that had already
   * been coalesced away, failing against a perfectly correct service.
   *
   * Adding a `reset()` for the tests to call was the other option and was rejected — it would put a
   * method on the service that exists for no production caller, to make an assertion that is only
   * true because the test called it.
   */
  it('records every failure, alerts exactly once, and never names the recipient', async () => {
    const mail = app.get(MailService);

    // The adapter swallows — that IS the ADR-0075 contract, and it is why this is not asserted with
    // `rejects`: a throw here would mean the enumeration guarantee had regressed.
    for (let i = 0; i < 5; i += 1) {
      await mail.sendPasswordReset({ to: RECIPIENT, resetUrl: 'https://example.test/reset/abc' });
    }
    await settleRows(5);
    await settleAlert();

    // Five rows: every failure is recorded, because the history is what the staff panel reads.
    const rows = await prisma.mailEvent.findMany({});
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      kind: 'password_reset',
      outcome: 'FAILED',
      recipient: RECIPIENT,
    });
    // A real errno from a real refused connection, not a constructor name — which is the whole
    // point of preferring `code` in `errorClassOf`, and it satisfies the DB's shape CHECK.
    expect(rows[0]?.errorClass).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);

    // One alert: the window is an hour here, so the summary cannot have fired. An alert channel
    // that cries wolf gets muted, and a muted channel is worth less than no channel.
    expect(received).toHaveLength(1);

    // The row holds the address (CQ-1) and a staff member may read it behind the guard, audited.
    // This POST left the process for a third party. Asserted against the real body that crossed a
    // socket, which is the only place the distinction is actually observable.
    expect(received.join('')).not.toContain('alert-canary');
    expect(received.join('')).not.toContain(RECIPIENT);
  });

  it('does not fail the caller when the alert endpoint is down', async () => {
    // The failure mode that matters most: this runs inside a `catch` block that has already handled
    // a failed send, so a throw from the alerter converts one handled failure into an unhandled one.
    await new Promise<void>((resolve) => alertServer.close(() => resolve()));
    const mail = app.get(MailService);

    await expect(
      mail.sendPasswordReset({ to: RECIPIENT, resetUrl: 'https://example.test/reset/abc' }),
    ).resolves.toBeUndefined();

    // And the durable record still lands — the row does not depend on the channel.
    //
    // Through the SHARED waiter, which is the second half of #132: this case used to poll for
    // `count() === 0` to become false, and a row leaked from test 1 satisfies that immediately — so
    // its wait could not tell its own write from its predecessor's, and it reported a confident 5
    // rather than timing out. With test 1 now waiting on all five before it asserts, nothing leaks
    // past `beforeEach`; sharing the waiter keeps the two cases from drifting apart again.
    await settleRows(1);
    expect(await prisma.mailEvent.count()).toBe(1);
  });
});
