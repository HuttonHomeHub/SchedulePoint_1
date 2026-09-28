import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import {
  type EmailVerificationEmail,
  type InvitationEmail,
  MailService,
  type PasswordResetEmail,
} from '../src/common/mail/mail.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * `advanced.backgroundTasks.handler` takes the mail send off the request path
 * (`docs/TECH_DEBT.md` #99, `apps/api/src/common/auth/better-auth.ts`).
 *
 * **Why this is its own suite rather than an assertion in `password-reset.e2e-spec.ts`.** That
 * file's `CapturingMailService` resolves with no internal `await`, so its capture happens
 * synchronously — before `runInBackgroundOrAwait` is even called, as a matter of JavaScript's
 * argument-evaluation order rather than anything about the handler. It could never have shown the
 * defect #99 names either, because a send with nothing to wait for holds the response open for
 * zero milliseconds whether or not it is awaited. Only a send that genuinely takes time can prove
 * the response stopped waiting on it — which is what `SlowMailService` below exists to be.
 *
 * **What this does NOT re-prove.** `better-auth.spec.ts` already pins that
 * `advanced.backgroundTasks.handler` is configured and swallows a rejection that escapes the mail
 * adapter's own catch; `mail-failure.e2e-spec.ts` already pins that a rejecting send never reaches
 * the caller. This suite is the one thing neither of those can be: a real HTTP round trip proving
 * the response returns before a real-shaped send finishes, against a real Postgres.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

/** Comfortably inside `SEND_TIMEOUT_MS` (10 s) — this proves the response stops WAITING on the
 * send, not that a slow send eventually times out, which is `SmtpMailService`'s own concern and
 * already covered where that class is tested directly. */
const SLOW_SEND_MS = 2_000;

/**
 * A send that actually takes time before resolving, and records when it lands.
 *
 * Unlike `CapturingMailService` (`password-reset.e2e-spec.ts`) or `FailingMailService`
 * (`mail-failure.e2e-spec.ts`), both of which settle with no internal `await`, this one genuinely
 * yields — so whether the caller is still waiting on it when the HTTP response returns is an
 * observable fact rather than a coincidence of how fast a stub resolves.
 */
class SlowMailService extends MailService {
  readonly landedResetUrls: string[] = [];

  sendInvitation(_email: InvitationEmail): Promise<void> {
    return Promise.resolve();
  }

  sendEmailVerification(_email: EmailVerificationEmail): Promise<void> {
    return Promise.resolve();
  }

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SLOW_SEND_MS));
    this.landedResetUrls.push(email.resetUrl);
  }
}

describe.skipIf(!hasDatabase)('Mail dispatch stays off the request path (e2e, #99)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: SlowMailService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    mail = new SlowMailService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
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
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
    mail.landedResetUrls.length = 0;
  });

  const server = () => app.getHttpServer();

  /** Poll rather than sleep a fixed amount — the send is fire-and-forget, so waiting exactly
   * `SLOW_SEND_MS` is a race against the scheduler's own jitter on a busy CI runner. */
  async function waitForLandedReset(timeoutMs = SLOW_SEND_MS * 2): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (mail.landedResetUrls.length === 0) {
      if (Date.now() > deadline) {
        throw new Error(`the slow send never landed within ${String(timeoutMs)}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  it('answers well before a slow send completes, and the send still lands afterwards', async () => {
    await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email: 'slow-send@example.com', password: PASSWORD })
      .expect(200);

    const startedAt = Date.now();
    const response = await request(server())
      .post('/api/auth/request-password-reset')
      .set('Origin', ORIGIN)
      .send({ email: 'slow-send@example.com', redirectTo: `${ORIGIN}/reset-password` });
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    // THE assertion: well under the send's own delay. Before `backgroundTasks.handler` existed,
    // `runInBackgroundOrAwait` took the `else await promise` branch and this would have taken at
    // least `SLOW_SEND_MS` — the exact timing oracle #99 is about, made visible on the one endpoint
    // whose whole design is that a known and an unknown address must answer alike.
    expect(elapsedMs).toBeLessThan(SLOW_SEND_MS / 2);
    // Not merely fast — genuinely still in flight when the caller was answered. If this were 1 it
    // would mean the send is fast rather than deferred, and the test would be proving nothing.
    expect(mail.landedResetUrls).toHaveLength(0);

    // And it is not dropped, only deferred: the same process that answered the request goes on to
    // finish the send, exactly as an abandoned `SEND_TIMEOUT_MS` send in `SmtpMailService` does.
    await waitForLandedReset();
    expect(mail.landedResetUrls).toHaveLength(1);
  });

  it('answers a known and an unknown address in comparable time while a send is in flight', async () => {
    // The oracle #99 names precisely: before this fix a known address waited for the send and an
    // unknown one did not, so the CLOCK told a caller what the identical body would not.
    await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email: 'known-slow@example.com', password: PASSWORD })
      .expect(200);

    const knownStartedAt = Date.now();
    await request(server())
      .post('/api/auth/request-password-reset')
      .set('Origin', ORIGIN)
      .send({ email: 'known-slow@example.com', redirectTo: `${ORIGIN}/reset-password` })
      .expect(200);
    const knownElapsedMs = Date.now() - knownStartedAt;

    const unknownStartedAt = Date.now();
    await request(server())
      .post('/api/auth/request-password-reset')
      .set('Origin', ORIGIN)
      .send({ email: 'nobody-at-all@example.com', redirectTo: `${ORIGIN}/reset-password` })
      .expect(200);
    const unknownElapsedMs = Date.now() - unknownStartedAt;

    // Both comfortably under the send's own delay, and neither dominated by it — the gap this
    // asserts against is the one `SEND_TIMEOUT_MS` narrowed from ten minutes to ten seconds and
    // this handler closes outright.
    expect(knownElapsedMs).toBeLessThan(SLOW_SEND_MS / 2);
    expect(unknownElapsedMs).toBeLessThan(SLOW_SEND_MS / 2);

    await waitForLandedReset();
  });
});
