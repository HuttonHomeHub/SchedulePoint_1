import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EmailVerificationEmail,
  InvitationEmail,
  PasswordResetEmail,
} from '../src/common/mail/mail.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * The second way into an organisation: an invitation waits for the address it was sent to
 * (ADR-0221). `GET /me/invitations` and `POST /me/invitations/:id/accept` act only where the host
 * enforces email verification AND the caller has confirmed their address; everywhere else the list is
 * empty and the accept is 404. Real HTTP stack, real Postgres, real Better Auth sessions, because
 * the properties are about what a request leaves in the database and who may ask.
 *
 * Two hosts are booted in turn, one per `AUTH_REQUIRE_EMAIL_VERIFICATION` setting. The setting is
 * read when the module graph is built, so each boot resets the module cache first.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface CapturingMail {
  readonly verifyUrls: string[];
}

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface Host {
  app: INestApplication;
  prisma: PrismaService;
  mail: CapturingMail;
  throttler: ThrottlerStorage;
}

async function boot(requireVerification: boolean): Promise<Host> {
  process.env.LOG_LEVEL ??= 'silent';
  if (requireVerification) {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
    // `env.validation.ts` refuses enforcement without a mail URL; the provider override below
    // replaces the adapter it would construct, so nothing ever dials it.
    process.env.MAIL_SMTP_URL ??= 'smtp://127.0.0.1:1025';
    process.env.MAIL_FROM ??= 'SchedulePoint <no-reply@example.test>';
  } else {
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  }
  vi.resetModules();
  // Imported after the reset too: `configureHttpApp` looks `AppConfigService` up by class, and the
  // class from before the reset is not the one the fresh module graph registered.
  const { configureHttpApp } = await import('../src/app-setup');
  const { AppModule } = await import('../src/app.module');
  const { PrismaService: Token } = await import('../src/prisma/prisma.service');
  // Defined here, after the reset: `overrideProvider` matches by class, and the `MailService` the
  // fresh module graph registered is not the one a top-level import would have given.
  const { MailService } = await import('../src/common/mail/mail.service');
  class CapturingMailService extends MailService implements CapturingMail {
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
  const mail = new CapturingMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: false,
    bodyParser: false,
  });
  configureHttpApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(Token),
    mail,
    throttler: app.get<ThrottlerStorage>(ThrottlerStorage),
  };
}

const tokenFrom = (acceptUrl: string): string => new URL(acceptUrl).searchParams.get('token') ?? '';

describe.skipIf(!hasDatabase)('My invitations, where verification is enforced (e2e)', () => {
  let host: Host;
  const server = () => host.app.getHttpServer();

  beforeAll(async () => {
    host = await boot(true);
  });

  afterAll(async () => {
    await host?.app.close();
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  });

  beforeEach(async () => {
    resetThrottleCounters(host.throttler);
    await clearDomainData(host.prisma);
    host.mail.verifyUrls.length = 0;
  });

  /** Sign up (the host emails a confirmation), have the address confirmed, then sign in. */
  async function confirmedUser(email: string): Promise<Actor> {
    await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    // The address is confirmed in the database, not through the confirm route: that route is
    // throttled to 10 a minute per IP and this file signs up two people per case. The route itself is
    // covered by `email-verification-confirm.e2e-spec.ts` and the account journey.
    await host.prisma.user.update({ where: { email }, data: { emailVerified: true } });
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<Actor> {
    const admin = await confirmedUser('admin@example.com');
    await admin.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return admin;
  }

  async function invite(
    admin: Actor,
    email: string,
    role = 'PLANNER',
  ): Promise<{ id: string; token: string }> {
    const res = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email, role })
      .expect(201);
    return {
      id: res.body.data.id as string,
      token: tokenFrom(res.body.data.acceptUrl as string),
    };
  }

  it('lists the invitation sent to a confirmed address and accepts it without the token', async () => {
    const admin = await adminWithOrg();
    const { id, token } = await invite(admin, 'invitee@example.com', 'CONTRIBUTOR');
    const invitee = await confirmedUser('invitee@example.com');

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([
      {
        id,
        organizationName: 'Acme',
        role: 'CONTRIBUTOR',
        expiresAt: expect.any(String),
      },
    ]);
    expect(list.body.meta).toMatchObject({ hasMore: false });
    // Nothing the server holds that could open the link door leaves it.
    expect(JSON.stringify(list.body)).not.toContain(token);
    expect(JSON.stringify(list.body)).not.toMatch(/token/i);

    const accepted = await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(200);
    expect(accepted.body.data).toMatchObject({ slug: 'acme', role: 'CONTRIBUTOR' });

    const after = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(after.body.data).toEqual([]);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(1);
  });

  it("writes the link door's two audit rows, marks the door, and records no secret", async () => {
    const admin = await adminWithOrg();
    const { id, token } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');

    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(200);

    const rows = await host.prisma.auditEvent.findMany({
      where: {
        action: { in: ['invitation.accepted', 'member.joined'] },
        subjectLabel: 'invitee@example.com',
      },
      orderBy: { action: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual(['invitation.accepted', 'member.joined']);
    for (const row of rows) {
      expect(row.changes).toMatchObject({ after: { acceptedVia: 'verified-address' } });
    }
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toMatch(/token/i);
    // No mail is sent by the new door beyond the confirmation the two sign-ups already caused.
    expect(host.mail.verifyUrls).toHaveLength(2);
  });

  it('leaves the link door as it was: it works, and its rows carry no acceptedVia', async () => {
    const admin = await adminWithOrg();
    const { token } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');

    await invitee.agent.post('/api/v1/invitations/accept').send({ token }).expect(200);

    const rows = await host.prisma.auditEvent.findMany({
      where: {
        action: { in: ['invitation.accepted', 'member.joined'] },
        subjectLabel: 'invitee@example.com',
      },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(JSON.stringify(row.changes)).not.toContain('acceptedVia');
  });

  it("does not show or accept another person's invitation: an empty list, and 404 not 403", async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'a@example.com');
    const other = await confirmedUser('b@example.com');

    const list = await other.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await other.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(404);

    expect(await host.prisma.orgMember.count({ where: { userId: other.userId } })).toBe(0);
    const stored = await host.prisma.invitation.findUnique({ where: { id } });
    expect(stored?.status).toBe('PENDING');
  });

  it("answers an unknown id with the same 404 as somebody else's", async () => {
    const other = await confirmedUser('b@example.com');
    await other.agent
      .post('/api/v1/me/invitations/0190f3a0-0000-7000-8000-000000000000/accept')
      .expect(404);
  });

  it('refuses a request with no session (401) on both routes', async () => {
    await request(server()).get('/api/v1/me/invitations').expect(401);
    await request(server())
      .post('/api/v1/me/invitations/0190f3a0-0000-7000-8000-000000000000/accept')
      .expect(401);
  });

  it('rejects an id that is not a UUID (400)', async () => {
    const user = await confirmedUser('b@example.com');
    await user.agent.post('/api/v1/me/invitations/not-a-uuid/accept').expect(400);
  });

  it('hides an expired invitation from the list and answers 410 to an accept', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    await host.prisma.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(410);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(0);
  });

  it('hides a revoked invitation and answers 410', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    await admin.agent.delete(`/api/v1/organizations/acme/invitations/${id}`).expect(204);

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(410);
  });

  it('hides an invitation already accepted by the link and answers 410', async () => {
    const admin = await adminWithOrg();
    const { id, token } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    await invitee.agent.post('/api/v1/invitations/accept').send({ token }).expect(200);

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(410);
  });

  it('offers nothing to a session whose address is no longer confirmed, and 404s the accept', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    // A session that predates the address losing its confirmation: the cookie still works.
    await host.prisma.user.update({
      where: { id: invitee.userId },
      data: { emailVerified: false },
    });

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(404);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(0);
  });

  it('matches a case-mixed address on the user side', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    // Stored upper-case, as an older or imported row could be: the lookup lower-cases it.
    await host.prisma.user.update({
      where: { id: invitee.userId },
      data: { email: 'Invitee@Example.COM' },
    });

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toHaveLength(1);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(200);
  });

  it('404s, and lists nothing, once the organisation is deleted', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');
    await host.prisma.organization.updateMany({ data: { deletedAt: new Date() } });

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent.post(`/api/v1/me/invitations/${id}/accept`).expect(404);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(0);
  });

  it('gives one membership and a 409 to a concurrent double accept', async () => {
    const admin = await adminWithOrg();
    const { id } = await invite(admin, 'invitee@example.com');
    const invitee = await confirmedUser('invitee@example.com');

    const [first, second] = await Promise.all([
      invitee.agent.post(`/api/v1/me/invitations/${id}/accept`),
      invitee.agent.post(`/api/v1/me/invitations/${id}/accept`),
    ]);

    // The loser is a 409 (the membership constraint, or the already-a-member check) or, if it read
    // after the winner committed, a 410: never a second membership and never a 5xx.
    expect([first.status, second.status].filter((s) => s === 200)).toHaveLength(1);
    const loser = first.status === 200 ? second : first;
    expect([409, 410]).toContain(loser.status);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(1);
  });

  it('pages the list by cursor', async () => {
    const admin = await adminWithOrg();
    await invite(admin, 'invitee@example.com');
    await admin.agent.post('/api/v1/organizations').send({ name: 'Beta' }).expect(201);
    await admin.agent
      .post('/api/v1/organizations/beta/invitations')
      .send({ email: 'invitee@example.com', role: 'VIEWER' })
      .expect(201);
    const invitee = await confirmedUser('invitee@example.com');

    const first = await invitee.agent.get('/api/v1/me/invitations?limit=1').expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta.hasMore).toBe(true);
    const second = await invitee.agent
      .get(`/api/v1/me/invitations?limit=1&cursor=${first.body.meta.nextCursor as string}`)
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(second.body.meta.hasMore).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('My invitations, where verification is not enforced (e2e)', () => {
  let host: Host;
  const server = () => host.app.getHttpServer();

  beforeAll(async () => {
    host = await boot(false);
  });

  afterAll(async () => {
    await host?.app.close();
  });

  beforeEach(async () => {
    resetThrottleCounters(host.throttler);
    await clearDomainData(host.prisma);
  });

  async function signedUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  it("shows nothing and refuses the accept, even for an invitation to the caller's own address", async () => {
    const admin = await signedUp('admin@example.com');
    await admin.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const created = await admin.agent
      .post('/api/v1/organizations/acme/invitations')
      .send({ email: 'invitee@example.com', role: 'PLANNER' })
      .expect(201);
    const invitee = await signedUp('invitee@example.com');

    const list = await invitee.agent.get('/api/v1/me/invitations').expect(200);
    expect(list.body.data).toEqual([]);
    await invitee.agent
      .post(`/api/v1/me/invitations/${created.body.data.id as string}/accept`)
      .expect(404);
    expect(await host.prisma.orgMember.count({ where: { userId: invitee.userId } })).toBe(0);

    // The token is still the key here, and it still works.
    await invitee.agent
      .post('/api/v1/invitations/accept')
      .send({ token: tokenFrom(created.body.data.acceptUrl as string) })
      .expect(200);
  });
});
