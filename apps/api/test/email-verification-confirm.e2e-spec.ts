import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * The verification link confirms on a press, not on a fetch (TECH_DEBT #88).
 *
 * The scanner case is the reason this suite exists: Better Auth's own `GET /verify-email` verifies
 * on arrival, so a mail scanner that fetches the emailed link used to verify the address on the
 * recipient's behalf. Every test here drives the real HTTP stack against a real Postgres, because
 * the property is "what a request leaves in the `users` row", not what a handler returns.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

class CapturingMailService extends MailService {
  readonly verifyUrls: string[] = [];

  sendInvitation(_email: InvitationEmail): Promise<void> {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    this.verifyUrls.push(email.verifyUrl);
  }

  sendPasswordReset(_email: PasswordResetEmail): Promise<void> {
    return Promise.resolve();
  }
}

describe.skipIf(!hasDatabase)('Email verification confirm (e2e)', () => {
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
    mail.verifyUrls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<string> {
    await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email, password: PASSWORD })
      .expect(200);
    const url = mail.verifyUrls.at(-1);
    expect(url, 'no verification email was sent').toBeDefined();
    return url as string;
  }

  /** The token as the page reads it: out of the fragment of the emailed link. */
  const tokenOf = (emailedUrl: string): string =>
    decodeURIComponent(new URL(emailedUrl).hash.replace(/^#token=/, ''));

  const verified = async (email: string): Promise<boolean | undefined> =>
    (await prisma.user.findUnique({ where: { email } }))?.emailVerified;

  const confirm = (body: unknown) =>
    request(server())
      .post('/api/v1/email-verification/confirm')
      .set('Origin', ORIGIN)
      .send(body as object);

  /** The shape a sign-up emailed before the confirm page existed. */
  const legacyUrl = (token: string) =>
    `/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(`${ORIGIN}/verify-email?verified=1`)}`;

  it('emails a link to the confirm page with the token in the fragment, not the query', async () => {
    const url = await signUp('shape@example.com');

    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${ORIGIN}/verify-email`);
    expect(parsed.search).toBe('');
    expect(parsed.hash).toMatch(/^#token=.+/);
  });

  it.each(['get', 'head'] as const)(
    'does not verify when a scanner %s-s the legacy API link; it redirects to the page',
    async (method) => {
      const token = tokenOf(await signUp('legacy@example.com'));

      const res = await request(server())[method](legacyUrl(token));

      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(
        `${ORIGIN}/verify-email#token=${encodeURIComponent(token)}`,
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(await verified('legacy@example.com')).toBe(false);
    },
  );

  it('builds the redirect from the configured app URL, whatever Host the request claims', async () => {
    const token = tokenOf(await signUp('hostile@example.com'));

    const res = await request(server()).get(legacyUrl(token)).set('Host', 'evil.example');

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${ORIGIN}/verify-email#token=${encodeURIComponent(token)}`);
    expect(await verified('hostile@example.com')).toBe(false);
  });

  it('sends a legacy link with no usable token to the page with an error, still verifying nothing', async () => {
    await signUp('notoken@example.com');

    const res = await request(server()).get('/api/auth/verify-email');

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${ORIGIN}/verify-email?error=INVALID_TOKEN`);
    expect(await verified('notoken@example.com')).toBe(false);
  });

  it('verifies on POST, answers 200, and records one audit row with the forwarded user agent', async () => {
    const token = tokenOf(await signUp('press@example.com'));

    const res = await confirm({ token }).set('User-Agent', 'press-test/1.0').expect(200);

    expect(res.body).toEqual({ data: { verified: true } });
    expect(await verified('press@example.com')).toBe(true);
    const rows = await prisma.auditEvent.findMany({ where: { action: 'auth.email_verified' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userAgent).toBe('press-test/1.0');
  });

  it('issues no session: confirming does not sign the person in', async () => {
    const token = tokenOf(await signUp('nosession@example.com'));

    const res = await confirm({ token }).expect(200);

    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers a second press with the same 200 — a verified address takes the success branch', async () => {
    const token = tokenOf(await signUp('twice@example.com'));
    await confirm({ token }).expect(200);

    const again = await confirm({ token }).expect(200);

    expect(again.body).toEqual({ data: { verified: true } });
    expect(await prisma.auditEvent.count({ where: { action: 'auth.email_verified' } })).toBe(1);
  });

  it('answers 410 VERIFICATION_LINK_EXPIRED for a token older than an hour, and verifies nothing', async () => {
    const token = tokenOf(await signUp('stale@example.com'));

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 60 * 60 * 1000 });
    const res = await confirm({ token });
    vi.useRealTimers();

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('VERIFICATION_LINK_EXPIRED');
    expect(await verified('stale@example.com')).toBe(false);
  });

  it('answers 400 VERIFICATION_LINK_INVALID for a token that is not one', async () => {
    const res = await confirm({ token: 'garbage' }).expect(400);

    expect(res.body.error.code).toBe('VERIFICATION_LINK_INVALID');
  });

  it('answers 400 VERIFICATION_LINK_INVALID for a token whose account no longer exists', async () => {
    const token = tokenOf(await signUp('gone@example.com'));
    await prisma.user.delete({ where: { email: 'gone@example.com' } });

    const res = await confirm({ token }).expect(400);

    expect(res.body.error.code).toBe('VERIFICATION_LINK_INVALID');
  });

  it.each([
    ['no token', {}],
    ['an empty token', { token: '' }],
    ['a non-string token', { token: 42 }],
    ['a token over 2048 characters', { token: 'x'.repeat(2049) }],
  ])('rejects %s with the standard validation envelope', async (_name, body) => {
    const res = await confirm(body).expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
