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
 * Password reset, end to end (ADR-0074 M0).
 *
 * **Why this suite exists rather than a unit test on the options object.** `better-auth.spec.ts`
 * pins that the two security keys are present; only a real request against a real Postgres can say
 * what actually lands in the `verifications` table and what happens to a second live session. The
 * ADR's whole B1 claim is about a column's contents, and a column is not something a mocked adapter
 * has.
 *
 * The mail port is replaced with a capture, because the reset URL exists **nowhere else** — that is
 * the property the port's own docblock is about. Reading it out of a log line would work today and
 * would break the moment somebody tightens what the stub logs, which is a change this epic
 * explicitly wants people to be free to make.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-different-horse-entirely';

/** Captures what the port was asked to send, and hands back the most recent reset URL. */
class CapturingMailService extends MailService {
  readonly resetUrls: string[] = [];

  sendInvitation(_email: InvitationEmail): Promise<void> {
    return Promise.resolve();
  }

  sendEmailVerification(_email: EmailVerificationEmail): Promise<void> {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    this.resetUrls.push(email.resetUrl);
  }
}

describe.skipIf(!hasDatabase)('Password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: CapturingMailService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    mail = new CapturingMailService();
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
    mail.resetUrls.length = 0;
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email, password: PASSWORD })
      .expect(200);
    return agent;
  }

  const requestReset = (email: string, redirectTo = `${ORIGIN}/reset-password`) =>
    request(server())
      .post('/api/auth/request-password-reset')
      .set('Origin', ORIGIN)
      .send({ email, redirectTo });

  /** The raw token as it travels in the emailed link — the thing that must never be stored. */
  function tokenFromLastEmail(): string {
    const url = mail.resetUrls.at(-1);
    expect(url, 'no reset email was sent').toBeDefined();
    // `{authBaseURL}/reset-password/{token}?callbackURL=…`
    const token = new URL(url as string).pathname.split('/').at(-1);
    expect(token).toBeTruthy();
    return token as string;
  }

  const resetPassword = (token: string, newPassword = NEW_PASSWORD) =>
    request(server())
      .post('/api/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ token, newPassword });

  it('is enabled at all — the endpoint no longer answers RESET_PASSWORD_DISABLED', async () => {
    // The regression that names the whole gap. Before `sendResetPassword` was configured, Better
    // Auth refused this request outright (`api/routes/password.mjs:53-59`), so the product had no
    // recovery path rather than merely no screen for one.
    await signUp('locked-out@example.com');

    const res = await requestReset('locked-out@example.com').expect(200);

    expect(res.body).toMatchObject({ status: true });
    expect(mail.resetUrls).toHaveLength(1);
  });

  it('answers identically for a known and an unknown address', async () => {
    // Better Auth equalises this itself, with a dummy lookup on the unknown branch. The assertion
    // is here because the property is ours to lose: any layer we add that pre-checks the address,
    // or renders a different state per branch, reopens the oracle the library closed.
    await signUp('known@example.com');

    const known = await requestReset('known@example.com');
    const unknown = await requestReset('absent@example.com');

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    // And only the real address produced an email, which is the difference that must stay invisible
    // to the caller.
    expect(mail.resetUrls).toHaveLength(1);
  });

  describe('B1 — the token is not stored in the clear', () => {
    it('stores no verification row containing the raw token', async () => {
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);
      const token = tokenFromLastEmail();

      const rows = await prisma.verification.findMany();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // Not `!== identifier` — `contains`, because the stored identifier is
        // `reset-password:<token>` and a substring match is what a leak would actually exploit.
        expect(row.identifier).not.toContain(token);
      }
    });

    it('still accepts the raw token, so hashing did not break the lookup', async () => {
      // The other half. A hash that is never compared the same way would "fix" B1 by making reset
      // permanently broken, and the previous test alone would pass.
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);

      await resetPassword(tokenFromLastEmail()).expect(200);

      await request(server())
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email: 'locked-out@example.com', password: NEW_PASSWORD })
        .expect(200);
    });

    it('refuses a token that was already used', async () => {
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);
      const token = tokenFromLastEmail();

      await resetPassword(token).expect(200);
      await resetPassword(token, 'yet-another-password').expect(400);
    });
  });

  describe('B2 — a completed reset ends every other session', () => {
    it('invalidates a session established before the reset', async () => {
      const elsewhere = await signUp('locked-out@example.com');
      // The session works before the reset, so the assertion after it cannot pass vacuously.
      await elsewhere.get('/api/v1/me').expect(200);

      await requestReset('locked-out@example.com').expect(200);
      await resetPassword(tokenFromLastEmail()).expect(200);

      // The attacker's browser, in the case this exists for.
      await elsewhere.get('/api/v1/me').expect(401);
    });

    it('issues no session to the resetting caller either', async () => {
      // `/reset-password` returns `{ status: true }` and nothing else, so "sign in afterwards" is
      // the correct thing for a UI to say. A screen that navigated into the app on success would be
      // wrong, and this is where that is written down.
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);

      const res = await resetPassword(tokenFromLastEmail()).expect(200);

      expect(res.body).toEqual({ status: true });
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('audit coverage (ADR-0074 §5)', () => {
    // Nothing gates these. `audit-coverage.structural.spec.ts:45-47` records that the route census
    // structurally cannot see Better Auth's routes, in either direction — so no PR omitting these
    // producers would have failed. That is the argument for asserting them here rather than the
    // argument for skipping them.
    const rows = (action: string) => prisma.auditEvent.findMany({ where: { action } });

    it('records a password change against the user who made it', async () => {
      const agent = await signUp('locked-out@example.com');

      await agent
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      const [row] = await rows('auth.password_changed');
      expect(row?.actorType).toBe('USER');
      expect(row?.actorLabel).toBe('locked-out@example.com');
    });

    it('records nothing when the current password was wrong', async () => {
      const agent = await signUp('locked-out@example.com');

      await agent
        .post('/api/auth/change-password')
        .set('Origin', ORIGIN)
        .send({ currentPassword: 'not-the-right-one', newPassword: NEW_PASSWORD })
        .expect(400);

      expect(await rows('auth.password_changed')).toHaveLength(0);
    });

    it('records a reset request for a known and an unknown address alike', async () => {
      // The row exists either way — an unrequested reset is the signal an account holder gets that
      // somebody is probing their address, and a probe at an address nobody owns is still worth
      // seeing. Only `subjectId` differs, and only its own holder can read that.
      await signUp('locked-out@example.com');

      await requestReset('locked-out@example.com').expect(200);
      await requestReset('nobody@example.com').expect(200);

      const requests = await rows('auth.password_reset_requested');
      expect(requests).toHaveLength(2);
      expect(requests.every((r) => r.actorType === 'ANONYMOUS')).toBe(true);
      expect(requests.filter((r) => r.subjectId !== null)).toHaveLength(1);
      // No organisation, so the organisation feed cannot reach it — the same shape as a failed
      // sign-in, and the reason `?include=attempts` exists.
      expect(requests.every((r) => r.organizationId === null)).toBe(true);
    });

    it('records a completed reset naming whose password changed', async () => {
      // The row the after-hook could not have written: `/reset-password` returns `{ status: true }`
      // and nothing else, so this comes from `onPasswordReset` instead.
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);

      await resetPassword(tokenFromLastEmail()).expect(200);

      const [row] = await rows('auth.password_reset_completed');
      expect(row?.actorType).toBe('USER');
      expect(row?.actorLabel).toBe('locked-out@example.com');
    });

    it('never puts a token or a URL in a recorded payload', async () => {
      await signUp('locked-out@example.com');
      await requestReset('locked-out@example.com').expect(200);
      const token = tokenFromLastEmail();
      await resetPassword(token).expect(200);

      const credentialRows = await prisma.auditEvent.findMany({
        where: { action: { startsWith: 'auth.password' } },
      });
      expect(credentialRows.length).toBeGreaterThan(0);
      for (const row of credentialRows) {
        const serialised = JSON.stringify(row);
        expect(serialised).not.toContain(token);
        expect(serialised).not.toContain(NEW_PASSWORD);
      }
    });
  });

  it('rejects a redirectTo outside the trusted origins', async () => {
    // `originCheck` validates `redirectTo` against `trustedOrigins`, which is bound to
    // `CORS_ORIGINS`. The failure mode this pins is a deployment one: if the app's own origin is
    // missing from that list, EVERY reset fails here with nothing on screen to explain it
    // (ADR-0074, `docs/DEPLOYMENT.md`). Better a known, tested rejection than a surprise.
    await signUp('locked-out@example.com');

    const res = await requestReset('locked-out@example.com', 'https://attacker.example/steal');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mail.resetUrls).toHaveLength(0);
  });
});
