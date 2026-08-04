import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * Attribution of a failed sign-in, end to end (ADR-0073 C2).
 *
 * **This began as C2.1's throwaway spike and is kept**, because what it observed is exactly what
 * C2.2's normaliser depends on. If Better Auth ever stopped lowercasing on the way in, or started
 * normalising the hook's `ctx.body`, attribution would break — and it would break **silently**, in
 * the direction that looks like good news: an empty feed reads as "nobody has tried", not as "the
 * lookup stopped matching". A throwaway spec would have proved that once, on the day nobody needed
 * it proved.
 *
 * The three questions it was written to answer, each of which changed the design:
 *
 * 1. What exactly lands in `subject_label` — the raw address or a normalised one. Our lookup has to
 *    agree with Better Auth's own or it silently fails to match for `Jane@…`, and a lookup that
 *    silently never matches is indistinguishable from "nobody has ever been probed".
 * 2. Whether a row is written **at all** when the body is malformed, and what it carries. If the
 *    endpoint's schema rejects before the handler runs, the after-hook may never fire — in which
 *    case there is no row to attribute and the "hostile body" case is moot.
 * 3. Whether an attempt against an address nobody has registered still produces a row (it must —
 *    that is the probe worth seeing) and what distinguishes it from an attributable one.
 *
 * Read from `better-auth@1.6.25`'s source alongside this: `internalAdapter.findUserByEmail` looks
 * up `email.toLowerCase()` with **no trimming**, and `/sign-up/email` stores `email.toLowerCase()`.
 * So the normaliser C2.2 needs is `toLowerCase()` and nothing else — trimming would match a user
 * whose account Better Auth would never have matched with that input, which is over-attribution:
 * telling someone they were probed when they were not.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(!hasDatabase)('Failed sign-in attribution (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
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
  });

  // The shared sweep, not a local list: audit rows hold an ON DELETE RESTRICT FK to their
  // organisation and org members hold one to their user, so a narrower teardown passes on an empty
  // database and fails against leftovers from any other suite — which is exactly how this file
  // first ran, and how the three audit specs later collided with each other.
  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email, password: PASSWORD })
      .expect(200);
    return (res.body as { user: { id: string } }).user.id;
  }

  /** Sign up and keep the session, for the reads that need one. */
  async function signUpAgent(email: string): Promise<{ agent: ReturnType<typeof request.agent> }> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Someone', email, password: PASSWORD })
      .expect(200);
    return { agent };
  }

  const selfLog = (agent: ReturnType<typeof request.agent>, query = '') =>
    agent
      .get(`/api/v1/me/audit-events${query === '' ? '' : `?${query}`}`)
      .expect(200)
      .then((r) => (r.body as { data: { action: string; actorType: string }[] }).data);

  async function attemptSignIn(body: unknown): Promise<{ status: number; body: unknown }> {
    const res = await request(server())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send(body as object);
    return { status: res.status, body: res.body as unknown };
  }

  const failures = () => prisma.auditEvent.findMany({ where: { action: 'auth.sign_in_failed' } });

  it('Q1: stores the address EXACTLY as typed, and still attributes it', async () => {
    // The finding that drives C2.2's normaliser, and the proof that the normaliser works. Better
    // Auth lowercases before it looks the user up, but the after-hook sees `ctx.body` — the raw
    // request — so the recorded label keeps the caller's casing. A lookup written against the
    // stored label without lowercasing would miss every mixed-case attempt, silently.
    const victimId = await signUp('victim@example.com');
    await attemptSignIn({ email: 'Victim@Example.COM', password: 'wrong-password-entirely' });

    const rows = await failures();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectLabel).toBe('Victim@Example.COM');
    expect(rows[0]?.subjectId).toBe(victimId);
    // A subject is not an actor. `ck_audit_events_actor_shape` rejects an ANONYMOUS row carrying
    // an actor id, so filling the wrong one would not be untidy — it would lose the row.
    expect(rows[0]?.actorType).toBe('ANONYMOUS');
    expect(rows[0]?.actorUserId).toBeNull();
  });

  it('C2.2: the sign-in response is identical whether or not the address exists', async () => {
    // The oracle argument, asserted rather than reasoned about. The same lookup runs on both
    // branches and neither its result nor its timing reaches the caller — the only place the
    // answer surfaces is that account holder's own feed.
    await signUp('known@example.com');

    const known = await attemptSignIn({ email: 'known@example.com', password: 'wrong-entirely' });
    const unknown = await attemptSignIn({
      email: 'absent@example.com',
      password: 'wrong-entirely',
    });

    // Status AND body. Comparing only the status was the first version, and it would have passed
    // against a response that leaked the difference in an error code or message — the security
    // review asked for the wider assertion and it costs one line.
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it('Q1b: a stored user is found by the lowercased address, and only by it', async () => {
    // The other half of the same fact, asserted against the real column rather than inferred from
    // reading the library: sign-up stored the address lowercased, so `toLowerCase()` is the whole
    // normalisation C2.2 needs. Trimming would be over-reach — see the file docblock.
    await signUp('MiXeD@Example.com');
    const stored = await prisma.user.findMany({ select: { email: true } });
    expect(stored.map((u) => u.email)).toEqual(['mixed@example.com']);
  });

  it('Q2: a malformed body still produces a row, with a null label', async () => {
    // Whether the after-hook survives schema rejection, not just handler rejection. If it did not,
    // there would be no row here at all and the hostile-body case would be moot.
    const { status } = await attemptSignIn({ password: 'no-email-at-all' });
    expect(status).toBeGreaterThanOrEqual(400);

    const rows = await failures();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectLabel).toBeNull();
    expect(rows[0]?.actorType).toBe('ANONYMOUS');
  });

  it('Q2b: a non-string email is recorded as no label rather than as a coerced one', async () => {
    await attemptSignIn({ email: { $ne: null }, password: 'object-injection-shaped' });

    const rows = await failures();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectLabel).toBeNull();
  });

  describe('C2.3: the widened /me read', () => {
    it('withholds the attempt unless it is asked for, and returns it when it is', async () => {
      // The parity property AND the feature, in one test, because they are the same query taking
      // two branches: absent `include`, the `where` is exactly what it was before C2 existed.
      const victim = await signUpAgent('victim@example.com');
      await attemptSignIn({ email: 'victim@example.com', password: 'wrong-password-entirely' });

      const before = await selfLog(victim.agent);
      expect(before.map((r) => r.action)).not.toContain('auth.sign_in_failed');

      const after = await selfLog(victim.agent, 'include=attempts');
      expect(after.map((r) => r.action)).toContain('auth.sign_in_failed');
    });

    it('never returns one person’s attempts to another, however they ask', async () => {
      // The row has no organisation and no actor, so the only thing that could leak it is the
      // subject clause — which is the caller's own id from the session, not a request parameter.
      await signUpAgent('victim@example.com');
      const bystander = await signUpAgent('bystander@example.com');
      await attemptSignIn({ email: 'victim@example.com', password: 'wrong-password-entirely' });

      const theirs = await selfLog(bystander.agent, 'include=attempts');
      expect(theirs.map((r) => r.action)).not.toContain('auth.sign_in_failed');
    });

    it('does not widen to rows where somebody else acted ON the caller', async () => {
      // `subjectId = me` alone would sweep in every administrative action taken against this
      // account — a role change an Org Admin made, say. Those are the ADMIN's actions, and they
      // belong in the organisation log. The `actorUserId: null` clause is what keeps them out.
      const victim = await signUpAgent('victim@example.com');
      await attemptSignIn({ email: 'victim@example.com', password: 'wrong-password-entirely' });

      const rows = await selfLog(victim.agent, 'include=attempts');
      for (const row of rows) {
        const isOwn = row.actorType === 'USER';
        const isAttempt = row.action === 'auth.sign_in_failed';
        expect(isOwn || isAttempt).toBe(true);
      }
    });

    it('refuses an unknown projection rather than silently ignoring it', async () => {
      const victim = await signUpAgent('victim@example.com');
      await victim.agent.get('/api/v1/me/audit-events?include=everything').expect(422);
    });
  });

  it('Q3: an unregistered address still produces a row — the probe worth seeing', async () => {
    await attemptSignIn({ email: 'nobody@example.com', password: 'wrong-password-entirely' });

    const rows = await failures();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectLabel).toBe('nobody@example.com');
    // Nothing can attribute this one, and that is the honest answer rather than a defect: no such
    // user exists. C2.3's read must therefore not assume every attempt row has a subject.
    expect(rows[0]?.subjectId).toBeNull();
  });
});
