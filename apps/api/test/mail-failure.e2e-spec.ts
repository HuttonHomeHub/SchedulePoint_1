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
 * **What actually happens when the mail transport is broken** (`docs/TECH_DEBT.md` #94).
 *
 * That row's central claim — a failed send does not fail the request, because Better Auth calls the
 * port through `runInBackgroundOrAwait`, which catches and never rethrows — was established by
 * READING `better-auth`'s source. This suite establishes it by driving the real HTTP endpoints
 * against a real Postgres with a port that rejects, because the row's own closing paragraph says the
 * gap is exactly that "the unit tests call the adapter directly and structurally cannot see the
 * layer that swallows".
 *
 * It is deliberately a **characterisation** suite: it pins today's behaviour, including the parts
 * that are wrong. That is its value. The open half of #94 is a design change — sending from
 * application code before handing off, so a failure can abort the request — and that change needs
 * something that fails the moment the behaviour moves. Written the other way round (asserting what
 * we wish happened) it would be red on arrival and deleted within a week, which is ADR-0058's
 * "a gate that fails on day one gets deleted rather than fixed".
 *
 * **Neither path may report the failure to its caller, and the first version of this docblock said
 * otherwise.** It read: "Sign-up hiding the failure is a defect. The caller is the person who owns
 * the address, there is no enumeration concern." That is **false under enforcement**, and the error
 * is preserved here rather than quietly overwritten because it is the reason ADR-0075 exists.
 *
 * `sign-up.mjs:162,169-207`: with `requireEmailVerification`, an address that **already exists**
 * gets a synthetic `200` carrying a fabricated user id and **no send at all** — and Better Auth
 * hashes the submitted password anyway, purely to equalise the timing. That is a deliberate
 * anti-enumeration control, and it inverts the argument: surface a delivery failure and, during an
 * outage, an **error** means "that address was free" while a **200** means "that address is taken".
 * The abort is inadmissible unless the duplicate branch also sends, which defeats its own purpose.
 *
 * So the two paths reach the same destination by different routes:
 *
 * - **Reset request** — uniform by construction, and the uniformity is the point
 *   (`MailService.sendPasswordReset`'s docblock).
 * - **Sign-up** — uniform by a control that is easy to miss, because the branch that makes it
 *   uniform is the one that does nothing.
 *
 * The remedy on both is therefore **operator-facing only**: `event: 'mail.send_failed'` in the Pino
 * stream (ADR-0075). Anyone who "fixes" either case by surfacing the error to the caller has
 * reintroduced an oracle. The `stays uniform …` cases below say so at the two points of temptation.
 *
 * The claim was asserted in three places before anyone checked `sign-up.mjs` — this docblock, a
 * commit message, and `docs/TECH_DEBT.md` #94. Repetition is not verification; that is ADR-0058's
 * rule, and it was broken by the same person who had just applied it two commits earlier.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

class MailTransportDown extends Error {
  constructor() {
    super('Connection refused: the relay is down');
    this.name = 'MailTransportDown';
  }
}

/**
 * Every method rejects — a relay that is down, refusing credentials, or misconfigured. The adapter's
 * own contract is to throw (`SmtpMailService`), so this is the shape a real failure has at this seam;
 * what is under test is the layer ABOVE it.
 */
class FailingMailService extends MailService {
  invitationAttempts = 0;
  verificationAttempts = 0;
  resetAttempts = 0;

  sendInvitation(_email: InvitationEmail): Promise<void> {
    this.invitationAttempts += 1;
    return Promise.reject(new MailTransportDown());
  }

  sendEmailVerification(_email: EmailVerificationEmail): Promise<void> {
    this.verificationAttempts += 1;
    return Promise.reject(new MailTransportDown());
  }

  sendPasswordReset(_email: PasswordResetEmail): Promise<void> {
    this.resetAttempts += 1;
    return Promise.reject(new MailTransportDown());
  }
}

describe.skipIf(!hasDatabase)('A broken mail transport (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: FailingMailService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    // The condition #94 is about is enforcement ON with delivery broken: without enforcement an
    // undelivered verification is cosmetic, and the account still works. `env.validation.ts` refuses
    // to boot with enforcement on and no `MAIL_SMTP_URL`, so a URL is set to satisfy that cross-field
    // rule — the provider override below replaces the adapter it would otherwise construct, so
    // nothing ever dials it.
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
    process.env.MAIL_SMTP_URL ??= 'smtp://127.0.0.1:1025';
    process.env.MAIL_FROM ??= 'SchedulePoint <no-reply@example.test>';

    const { AppModule } = await import('../src/app.module');
    const { PrismaService: PrismaServiceToken } = await import('../src/prisma/prisma.service');
    mail = new FailingMailService();
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
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
    mail.invitationAttempts = 0;
    mail.verificationAttempts = 0;
    mail.resetAttempts = 0;
  });

  const server = () => app.getHttpServer();

  describe('sign-up', () => {
    it('reports success and leaves an account nobody can get into', async () => {
      const email = `stranded-${Date.now()}@example.test`;

      const response = await request(server())
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'Someone', email, password: PASSWORD });

      // THE finding, in one assertion: the send threw and the request still succeeded.
      expect(mail.verificationAttempts).toBe(1);
      expect(response.status).toBe(200);

      // …and it is not a hollow success that leaves nothing behind. The row is committed, so the
      // address is now taken: signing up again will not work, and neither will signing in.
      const user = await prisma.user.findFirst({ where: { email } });
      expect(user, 'the account was created despite the failed send').not.toBeNull();
      expect(user?.emailVerified).toBe(false);

      // No session either — `requireEmailVerification` overrides `autoSignIn` (ADR-0074 M2). So the
      // person is left holding an unverified, unusable, un-signed-in account, having been told the
      // sign-up worked. Everything they can see says it did.
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('refuses the sign-in that follows, with nothing pointing at the real cause', async () => {
      const email = `locked-out-${Date.now()}@example.test`;
      await request(server())
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'Someone', email, password: PASSWORD })
        .expect(200);

      const signIn = await request(server())
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email, password: PASSWORD });

      // 403 with the right password. The user's own explanation for this is "I typed it wrong",
      // which is the loop #94 describes: nothing on the path from here says an email failed to send,
      // so nobody knows to use the resend endpoint that would recover them.
      expect(signIn.status).toBe(403);
    });
  });

  describe('the sign-up guarantee that decides the design (ADR-0075)', () => {
    /**
     * **A guarantee, not a characterisation** — the only case in this file asserting something that
     * must never change, and it reads as unrelated to a broken relay until you see what it forbids.
     *
     * Under enforcement, Better Auth answers a sign-up for an address that ALREADY EXISTS with a
     * synthetic 200 carrying a fabricated user id, and sends nothing (`sign-up.mjs:162,169-207`). It
     * hashes the submitted password regardless, purely so the timing matches. That is what makes
     * "abort the sign-up when the send fails" inadmissible: during an outage the error would mean
     * "that address was free" and the 200 would mean "that address is taken" — an enumeration oracle
     * on an unauthenticated endpoint, created by the very change meant to help the caller.
     *
     * Nothing tested this. The property lives entirely in a library file this repo does not own, and
     * a `better-auth` upgrade that changed it would move a security boundary with no failing test.
     */
    it('answers a duplicate address exactly like a new one, and sends nothing', async () => {
      const email = `taken-${Date.now()}@example.test`;
      const first = await request(server())
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'Someone', email, password: PASSWORD });
      expect(first.status).toBe(200);
      expect(mail.verificationAttempts).toBe(1);

      const second = await request(server())
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'Someone Else', email, password: PASSWORD });

      // Same status, same shape — and NOT because the second attempt also mailed. It mailed nothing,
      // which is precisely why a delivery-failure signal would tell the caller these two cases apart.
      expect(second.status).toBe(first.status);
      expect(Object.keys(second.body as object).sort()).toEqual(
        Object.keys(first.body as object).sort(),
      );
      expect(mail.verificationAttempts).toBe(1);

      // No second account, despite the 200 the caller just received.
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });
  });

  describe('password reset', () => {
    it('stays uniform when the send fails — the enumeration guarantee outranks the signal', async () => {
      // Arrange a real, verified account so the ONLY thing failing is delivery.
      const email = `recoverable-${Date.now()}@example.test`;
      await request(server())
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'Someone', email, password: PASSWORD })
        .expect(200);
      await prisma.user.updateMany({ where: { email }, data: { emailVerified: true } });

      const known = await request(server())
        .post('/api/auth/request-password-reset')
        .set('Origin', ORIGIN)
        .send({ email, redirectTo: `${ORIGIN}/reset-password` });

      const unknown = await request(server())
        .post('/api/auth/request-password-reset')
        .set('Origin', ORIGIN)
        .send({
          email: `no-such-${Date.now()}@example.test`,
          redirectTo: `${ORIGIN}/reset-password`,
        });

      expect(mail.resetAttempts).toBe(1); // only the real address is even attempted

      // This is the assertion to read before "fixing" the invisibility here. A failed send for a
      // KNOWN address must stay indistinguishable from a NO-OP for an unknown one — otherwise the
      // difference tells an attacker which addresses hold accounts. Surfacing the error to the
      // caller trades a lockout nobody can see for an oracle everybody can use. The remedy on this
      // path is operator-facing only (#94's cheap half, already paid).
      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
    });
  });
});
