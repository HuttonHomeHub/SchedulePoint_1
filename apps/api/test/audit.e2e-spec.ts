import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the audit log (ADR-0072).
 *
 * **This is the only place most of it can be tested at all.** The producers fire inside real
 * transactions, the authentication events fire from Better Auth's hook chain outside Nest's
 * pipeline entirely, and the read endpoints' permission model depends on a real session and real
 * memberships. A mocked service proves the wiring compiles; it cannot prove a row was written or
 * that an Org Admin's log is closed to a Planner.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Agent {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface AuditRow {
  id: string;
  action: string;
  outcome: string;
  actorType: string;
  actorLabel: string | null;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  correlationId: string | null;
}

describe.skipIf(!hasDatabase)('Audit log (e2e)', () => {
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

  beforeEach(async () => {
    await prisma.invitation.deleteMany();
    // Share links hold a RESTRICT FK to their plan, so they go first — the same composition that
    // made `clearAuditEvents` necessary, one table along.
    await prisma.planShare.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Agent> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function setupOrg(): Promise<{ admin: Agent; planner: Agent; organizationId: string }> {
    const admin = await signUp('admin@example.com');
    const created = await admin.agent
      .post('/api/v1/organizations')
      .send({ name: 'Acme' })
      .expect(201);
    const organizationId = (created.body as { data: { id: string } }).data.id;

    const planner = await signUp('planner@example.com');
    await prisma.orgMember.create({
      data: { organizationId, userId: planner.userId, role: 'PLANNER' },
    });

    return { admin, planner, organizationId };
  }

  const orgLog = (agent: Agent['agent'], expected = 200) =>
    agent
      .get('/api/v1/organizations/acme/audit-events')
      .expect(expected)
      .then((r) => (r.body as { data?: AuditRow[] }).data ?? []);

  const selfLog = (agent: Agent['agent']) =>
    agent
      .get('/api/v1/me/audit-events')
      .expect(200)
      .then((r) => (r.body as { data: AuditRow[] }).data);

  describe('producers write real rows', () => {
    it('records organisation creation and the founding membership', async () => {
      const { admin } = await setupOrg();
      const rows = await orgLog(admin.agent);

      const actions = rows.map((r) => r.action);
      expect(actions).toContain('organization.created');
      expect(actions).toContain('member.joined');

      const created = rows.find((r) => r.action === 'organization.created')!;
      expect(created.actorLabel).toBe('admin@example.com');
      expect(created.changes?.after).toEqual({ name: 'Acme', slug: 'acme' });
      // The row joins the log line for the same request — the field that makes it investigable.
      expect(created.correlationId).not.toBeNull();
    });

    it('records a role change with the role it moved FROM', async () => {
      const { admin } = await setupOrg();
      const members = await admin.agent
        .get('/api/v1/organizations/acme/members')
        .expect(200)
        .then(
          (r) => r.body.data as Array<{ id: string; version: number; user: { email: string } }>,
        );
      const planner = members.find((m) => m.user.email === 'planner@example.com')!;

      await admin.agent
        .patch(`/api/v1/organizations/acme/members/${planner.id}`)
        .send({ role: 'VIEWER', version: planner.version })
        .expect(200);

      const row = (await orgLog(admin.agent)).find((r) => r.action === 'member.role_changed')!;
      expect(row.changes).toEqual({ before: { role: 'PLANNER' }, after: { role: 'VIEWER' } });
      expect(row.subjectLabel).toBe('planner@example.com');
    });

    it('records a client delete with the cascade batch id, and its restore', async () => {
      const { admin } = await setupOrg();
      const client = await admin.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201)
        .then((r) => r.body.data as { id: string });

      await admin.agent.delete(`/api/v1/organizations/acme/clients/${client.id}`).expect(204);
      await admin.agent.post(`/api/v1/organizations/acme/clients/${client.id}/restore`).expect(200);

      const rows = await orgLog(admin.agent);
      const deleted = rows.find((r) => r.action === 'client.deleted')!;
      const restored = rows.find((r) => r.action === 'client.restored')!;

      expect(deleted.subjectType).toBe('CLIENT');
      // The thread that makes forty vanished rows legible as one action.
      expect(deleted.changes?.before).toMatchObject({ name: 'Northgate' });
      expect(deleted.changes?.before?.deleteBatchId).toEqual(expect.any(String));
      // A restore records in the `after` direction — the name is what it now IS again. `before`
      // arrives EMPTY rather than absent: `AuditChanges` documents both sides as always present so
      // a reader can tell "set from nothing" from "unchanged" without knowing the action's
      // semantics, and the redactor normalises to that shape whatever the producer supplied.
      expect(restored.changes?.after).toMatchObject({ name: 'Northgate' });
      expect(restored.changes?.before).toEqual({});
    });

    it('records a share link being minted and revoked, and NEVER its token', async () => {
      // ADR-0072 M3 / TECH_DEBT #14: a guest link authorises reads of plan data by someone with
      // no account, so it is the widest permission change the product offers. The token assertion
      // is read from the TABLE, not the response: the redactor and the producer are two separate
      // controls and only the stored row proves both held.
      const { admin } = await setupOrg();
      const client = await admin.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201)
        .then((r) => r.body.data as { id: string });
      const project = await admin.agent
        .post(`/api/v1/organizations/acme/clients/${client.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201)
        .then((r) => r.body.data as { id: string });
      const plan = await admin.agent
        .post(`/api/v1/organizations/acme/projects/${project.id}/plans`)
        .send({ name: 'Programme', plannedStart: '2026-01-05' })
        .expect(201)
        .then((r) => r.body.data as { id: string });

      const share = await admin.agent
        .post(`/api/v1/organizations/acme/plans/${plan.id}/shares`)
        .send({ label: 'For the QS' })
        .expect(201)
        .then((r) => r.body.data as { url: string; share: { id: string } });
      const rawToken = share.url.split('#')[1]!;

      await admin.agent
        .delete(`/api/v1/organizations/acme/plans/${plan.id}/shares/${share.share.id}`)
        .expect(204);

      const rows = await orgLog(admin.agent);
      const created = rows.find((r) => r.action === 'share.created')!;
      const revoked = rows.find((r) => r.action === 'share.revoked')!;

      expect(created.subjectType).toBe('PLAN_SHARE');
      expect(created.subjectId).toBe(share.share.id);
      expect(created.changes?.after).toMatchObject({ planId: plan.id, label: 'For the QS' });
      // No expiry was asked for, and the row says so rather than staying silent — a link that
      // never dies is the fact a reader most needs.
      expect(created.changes?.after?.expiresAt).toBeNull();
      expect(revoked.changes?.before).toMatchObject({ planId: plan.id, label: 'For the QS' });

      // The credential, in both forms, against the STORED rows.
      const stored = await prisma.auditEvent.findMany({
        where: { action: { in: ['share.created', 'share.revoked'] } },
      });
      expect(stored).toHaveLength(2);
      const hash = (await prisma.planShare.findFirstOrThrow({ where: { id: share.share.id } }))
        .tokenHash;
      expect(JSON.stringify(stored)).not.toContain(rawToken);
      expect(JSON.stringify(stored)).not.toContain(hash);
    });

    it('records a FAILED sign-in as ANONYMOUS with the attempted address', async () => {
      // The event that only exists because Better Auth's after-hook still runs on a thrown
      // APIError. Nothing short of a real sign-in attempt proves that.
      await signUp('victim@example.com');
      await request(server())
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email: 'victim@example.com', password: 'wrong-password-entirely' })
        .expect((res) => {
          if (res.status < 400) throw new Error(`expected a rejection, got ${res.status}`);
        });

      const failures = await prisma.auditEvent.findMany({
        where: { action: 'auth.sign_in_failed' },
      });
      expect(failures).toHaveLength(1);
      expect(failures[0]?.actorType).toBe('ANONYMOUS');
      expect(failures[0]?.actorUserId).toBeNull();
      expect(failures[0]?.subjectLabel).toBe('victim@example.com');
      expect(failures[0]?.organizationId).toBeNull();
    });

    it('records a sign-up and a sign-out for the same user', async () => {
      const user = await signUp('leaver@example.com');
      await user.agent.post('/api/auth/sign-out').set('Origin', ORIGIN).expect(200);

      const rows = await prisma.auditEvent.findMany({
        where: { actorUserId: user.userId },
        orderBy: { occurredAt: 'asc' },
      });
      const actions = rows.map((r) => r.action);
      expect(actions).toContain('auth.signed_up');
      // The event an after-hook could not see: /sign-out never resolves a session onto the
      // context, so this only exists because it is recorded from a `before` hook.
      expect(actions).toContain('auth.signed_out');
    });
  });

  describe('the table is append-only', () => {
    it('refuses an UPDATE and a DELETE at the database', async () => {
      const { admin } = await setupOrg();
      const [row] = await orgLog(admin.agent);

      await expect(
        prisma.$executeRawUnsafe(`UPDATE "audit_events" SET action = 'tampered' WHERE id = $1`, [
          row!.id,
        ]),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "audit_events" WHERE id = $1`, [row!.id]),
      ).rejects.toThrow();

      // Still there, unchanged.
      const after = await prisma.auditEvent.findUnique({ where: { id: row!.id } });
      expect(after?.action).toBe(row!.action);
    });
  });

  describe('reading is gated', () => {
    it("lets an Org Admin read the organisation's log", async () => {
      const { admin } = await setupOrg();
      expect((await orgLog(admin.agent)).length).toBeGreaterThan(0);
    });

    it('403s a Planner — audit:read is Org Admin only', async () => {
      const { planner } = await setupOrg();
      await orgLog(planner.agent, 403);
    });

    it('404s a non-member before it can 403 (anti-enumeration)', async () => {
      await setupOrg();
      const outsider = await signUp('outsider@example.com');
      await orgLog(outsider.agent, 404);
    });

    it('401s without a session', async () => {
      await setupOrg();
      await request(server()).get('/api/v1/organizations/acme/audit-events').expect(401);
    });
  });

  describe('/me/audit-events is scoped by identity, not by a parameter', () => {
    it('returns only the caller’s own events, including the org-less auth rows', async () => {
      const { admin, planner } = await setupOrg();

      const mine = await selfLog(planner.agent);
      expect(mine.length).toBeGreaterThan(0);
      // Every row is the caller's. The admin created the org and joined it; none of that is here.
      expect(mine.every((r) => r.actorLabel === 'planner@example.com')).toBe(true);
      expect(mine.map((r) => r.action)).toContain('auth.signed_up');

      // And the admin's own view is a different set — proving the scope is the session, not a
      // shared org filter.
      const theirs = await selfLog(admin.agent);
      expect(theirs.every((r) => r.actorLabel === 'admin@example.com')).toBe(true);
    });

    it('needs no permission — a Planner reads their own history without audit:read', async () => {
      const { planner } = await setupOrg();
      await planner.agent.get('/api/v1/me/audit-events').expect(200);
    });

    it('401s without a session', async () => {
      await request(server()).get('/api/v1/me/audit-events').expect(401);
    });
  });

  describe('filtering (ADR-0073 C1)', () => {
    /** Give the org a known spread: two deletes, a restore, and the auth rows sign-up produced. */
    async function seedMixedEvents(admin: Agent): Promise<void> {
      const client = await admin.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201)
        .then((r) => r.body.data as { id: string });
      await admin.agent.delete(`/api/v1/organizations/acme/clients/${client.id}`).expect(204);
      await admin.agent.post(`/api/v1/organizations/acme/clients/${client.id}/restore`).expect(200);
    }

    const filtered = (agent: Agent['agent'], qs: string, expected = 200) =>
      agent
        .get(`/api/v1/organizations/acme/audit-events?${qs}`)
        .expect(expected)
        .then((r) => (r.body as { data?: AuditRow[] }).data ?? []);

    it('returns the same page as before when no filter is sent', async () => {
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const unfiltered = await orgLog(admin.agent);
      const explicitlyEmpty = await filtered(admin.agent, 'limit=20');
      expect(explicitlyEmpty.map((r) => r.id)).toEqual(unfiltered.map((r) => r.id));
    });

    it('narrows to one action', async () => {
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const rows = await filtered(admin.agent, 'action=client.deleted');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.action === 'client.deleted')).toBe(true);
    });

    it('unions repeated actions rather than intersecting them', async () => {
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const rows = await filtered(admin.agent, 'action=client.deleted&action=client.restored');
      expect(new Set(rows.map((r) => r.action))).toEqual(
        new Set(['client.deleted', 'client.restored']),
      );
    });

    it('narrows by outcome', async () => {
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const rows = await filtered(admin.agent, 'outcome=SUCCESS');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.outcome === 'SUCCESS')).toBe(true);
    });

    it('narrows by date range, and excludes what falls outside it', async () => {
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const all = await orgLog(admin.agent);
      expect(all.length).toBeGreaterThan(0);

      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      expect(await filtered(admin.agent, `from=${encodeURIComponent(future)}`)).toEqual([]);

      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const since = await filtered(admin.agent, `from=${encodeURIComponent(past)}`);
      expect(since.map((r) => r.id)).toEqual(all.map((r) => r.id));
    });

    it('honours the page size WITH a filter that excludes most rows', async () => {
      // The regression that a post-filter would cause: `take: limit + 1` counts rows the caller
      // never sees, so a filtered page comes back short while `hasMore` claims otherwise. Only
      // visible on a selective filter, which is to say the useful kind.
      const { admin } = await setupOrg();
      await seedMixedEvents(admin);

      const res = await admin.agent
        .get('/api/v1/organizations/acme/audit-events?action=client.deleted&limit=1')
        .expect(200);
      const body = res.body as { data: AuditRow[]; meta: { hasMore: boolean } };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.action).toBe('client.deleted');
      expect(body.meta.hasMore).toBe(false);
    });

    it('422s an unknown action instead of answering with an empty page', async () => {
      const { admin } = await setupOrg();
      await filtered(admin.agent, 'action=plan.exploded', 422);
    });

    it('422s an unknown outcome, a malformed instant, and an inverted range', async () => {
      const { admin } = await setupOrg();
      await filtered(admin.agent, 'outcome=MAYBE', 422);
      await filtered(admin.agent, 'from=yesterday', 422);
      await filtered(
        admin.agent,
        `from=${encodeURIComponent('2026-08-04T00:00:00.000Z')}&to=${encodeURIComponent('2026-08-01T00:00:00.000Z')}`,
        422,
      );
    });

    it('422s an auth.* action on the organisation route — unanswerable, and the slowest query there is', async () => {
      // Those rows carry no organisation, so the filter could only ever return an empty page; and
      // proving that absence means walking the whole organisation partition (measured 681–954 ms
      // at 1M rows). The one place it IS answerable is /me, asserted immediately below.
      const { admin } = await setupOrg();
      await filtered(admin.agent, 'action=auth.signed_in', 422);
      await filtered(admin.agent, 'action=plan.deleted&action=auth.sign_in_failed', 422);
    });

    it('applies the same filter on /me, scoped to the caller', async () => {
      const { planner } = await setupOrg();

      const rows = await planner.agent
        .get('/api/v1/me/audit-events?action=auth.signed_up')
        .expect(200)
        .then((r) => (r.body as { data: AuditRow[] }).data);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.action === 'auth.signed_up')).toBe(true);
      expect(rows.every((r) => r.actorLabel === 'planner@example.com')).toBe(true);
    });

    it('cannot widen past the organisation scope', async () => {
      // The tenant boundary is spread last in the WHERE, so no filter combination reaches another
      // org's rows. Asserted against a real second organisation rather than argued from the code.
      const { admin } = await setupOrg();
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Beta' }).expect(201);

      const rows = await filtered(admin.agent, 'action=organization.created');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.subjectLabel).toBe('Acme');
    });
  });

  describe('what the read surface withholds', () => {
    it('never returns ipAddress or userAgent, even though they are recorded', async () => {
      const { admin } = await setupOrg();
      // Supertest sends no User-Agent of its own, so one is set explicitly — otherwise the
      // "…and it IS in the table" half below would pass for the wrong reason. It goes on the
      // DELETE, which is the request that writes the row being read; setting it on the create
      // instead proves nothing, and that mistake was made here first.
      const client = await admin.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201)
        .then((r) => r.body.data as { id: string });
      await admin.agent
        .delete(`/api/v1/organizations/acme/clients/${client.id}`)
        .set('User-Agent', 'SchedulePointE2E/1.0')
        .expect(204);

      const row = (await orgLog(admin.agent)).find((r) => r.action === 'client.deleted')!;
      expect(row).not.toHaveProperty('ipAddress');
      expect(row).not.toHaveProperty('userAgent');

      // …and it IS in the table. A field absent from the DTO because nothing ever wrote it would
      // pass the two assertions above while proving nothing.
      const stored = await prisma.auditEvent.findUnique({ where: { id: row.id } });
      expect(stored?.userAgent).toBe('SchedulePointE2E/1.0');
    });
  });
});
