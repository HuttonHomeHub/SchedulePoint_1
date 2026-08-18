import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * End-to-end tests for the organisation overview (`GET .../overview`) — the screen every
 * sign-in lands on.
 *
 * **The case this file exists for is "ranks a plan by its newest activity".** The ordering
 * key is `GREATEST(plan, newest activity, newest dependency)` and not `plans.updated_at`,
 * because editing an activity does not stamp its plan (spec §0.1). That is unprovable
 * anywhere but here: the query is raw SQL, so a unit test with a mocked repository asserts
 * the mapping and never the ordering, and the structural spec reads the text and cannot
 * make Postgres answer. This case builds the exact situation — a plan created early and
 * edited late, against a plan created late and never touched — and fails against the naive
 * ordering.
 *
 * The other half is the section-omission matrix across all four roles: the two attention
 * counts are OMITTED for readers who may not see them rather than sent as `0`, because a
 * zero is a fact about the organisation and an absence is a fact about the reader.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

interface OverviewBody {
  organisationName: string;
  isNewOrganisation: boolean;
  hasPlans: boolean;
  recentlyChanged: Array<{
    planId: string;
    planName: string;
    projectName: string;
    clientName: string;
    status: string;
    changedAt: string;
    changedBy: { kind: string; name?: string };
  }>;
  attention: {
    heldLocks: Array<{ planId: string; planName: string; requestedBy: { kind: string } | null }>;
    pendingInvitationCount?: number;
    expiringDeletedCount?: number;
  };
}

describe.skipIf(!hasDatabase)('Organisation overview API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // The shared-database teardown order (TECH_DEBT #119): link tables and `activities`
    // before `plans`, whatever this spec itself creates.
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  });

  const server = () => app.getHttpServer();
  const OVERVIEW = '/api/v1/organizations/acme/overview';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(): Promise<{ actor: Actor; orgId: string }> {
    const actor = await signUp('admin@example.com');
    const res = await actor.agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    return { actor, orgId: res.body.data.id as string };
  }

  async function memberWith(
    orgId: string,
    role: 'PLANNER' | 'CONTRIBUTOR' | 'VIEWER',
    email: string,
  ): Promise<Actor> {
    const actor = await signUp(email);
    await prisma.orgMember.create({ data: { organizationId: orgId, userId: actor.userId, role } });
    return actor;
  }

  async function createPlan(actor: Actor, name: string, clientName = 'Northgate'): Promise<string> {
    const client = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: clientName })
      .expect(201);
    const project = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: `${name} project` })
      .expect(201);
    const plan = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return plan.body.data.id as string;
  }

  async function fetchOverview(actor: Actor): Promise<OverviewBody> {
    const res = await actor.agent.get(OVERVIEW).expect(200);
    return res.body.data as OverviewBody;
  }

  describe('the ordering key', () => {
    it('ranks a plan by its newest activity, not by plans.updated_at', async () => {
      const { actor } = await adminWithOrg();

      // `stale` is created FIRST and never touched again at plan level. `fresh` is created
      // SECOND, so a `plans.updated_at` ordering puts `fresh` on top and looks right.
      const stalePlanId = await createPlan(actor, 'Worked in all morning', 'Client A');
      const freshPlanId = await createPlan(actor, 'Renamed last week', 'Client B');

      // Now edit an activity inside the OLDER plan. This does not stamp `plans.updated_at`
      // — which is the whole finding — so only a `GREATEST(...)` ordering notices.
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${stalePlanId}/activities`)
        .send({ name: 'Excavate' })
        .expect(201);

      const overview = await fetchOverview(actor);

      // Against a naive ordering this array is [fresh, stale] and every value in it is real.
      expect(overview.recentlyChanged.map((row) => row.planId)).toEqual([stalePlanId, freshPlanId]);
    });

    it('ranks a plan that has never had an activity by its own row', async () => {
      // The plan-created-only case: both laterals return nothing, so `GREATEST` falls back
      // to `p.updated_at` through the `epoch` coalesce. A `GREATEST` over NULLs would
      // return NULL and drop the plan off the screen entirely.
      const { actor } = await adminWithOrg();
      const planId = await createPlan(actor, 'Untouched');

      const overview = await fetchOverview(actor);

      expect(overview.recentlyChanged).toHaveLength(1);
      expect(overview.recentlyChanged[0]?.planId).toBe(planId);
      expect(overview.recentlyChanged[0]?.changedAt).toEqual(expect.any(String));
    });

    it('carries the plan’s project and client so a row can say where it is', async () => {
      const { actor } = await adminWithOrg();
      await createPlan(actor, 'Substructure', 'Riverside Developments');

      const overview = await fetchOverview(actor);

      expect(overview.recentlyChanged[0]).toMatchObject({
        planName: 'Substructure',
        projectName: 'Substructure project',
        clientName: 'Riverside Developments',
        status: 'DRAFT',
      });
    });

    it('leaves archived and deleted plans off the list', async () => {
      const { actor } = await adminWithOrg();
      const keptId = await createPlan(actor, 'Kept', 'Client A');
      const archivedId = await createPlan(actor, 'Archived', 'Client B');
      const deletedId = await createPlan(actor, 'Deleted', 'Client C');

      await prisma.plan.update({ where: { id: archivedId }, data: { status: 'ARCHIVED' } });
      await actor.agent.delete(`/api/v1/organizations/acme/plans/${deletedId}`).expect(204);

      const overview = await fetchOverview(actor);

      expect(overview.recentlyChanged.map((row) => row.planId)).toEqual([keptId]);
    });
  });

  describe('attribution', () => {
    it('names the member who made the change', async () => {
      const { actor, orgId } = await adminWithOrg();
      const planId = await createPlan(actor, 'Tower B');
      const planner = await memberWith(orgId, 'PLANNER', 'planner@example.com');

      await planner.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Excavate' })
        .expect(201);

      const overview = await fetchOverview(actor);

      expect(overview.recentlyChanged[0]?.changedBy).toEqual({ kind: 'MEMBER', name: 'planner' });
    });

    it('reports a departed member as FORMER_MEMBER rather than a name', async () => {
      const { actor, orgId } = await adminWithOrg();
      const planId = await createPlan(actor, 'Tower B');
      const planner = await memberWith(orgId, 'PLANNER', 'planner@example.com');
      await planner.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/activities`)
        .send({ name: 'Excavate' })
        .expect(201);

      // They leave. The `updated_by` stamp stays — attribution outlives membership.
      await prisma.orgMember.deleteMany({
        where: { organizationId: orgId, userId: planner.userId },
      });

      const overview = await fetchOverview(actor);

      // Resolved through membership, never through `users` — which is what stops this
      // endpoint turning any user id in the system into a display name.
      expect(overview.recentlyChanged[0]?.changedBy).toEqual({ kind: 'FORMER_MEMBER' });
    });
  });

  describe('the section-omission matrix', () => {
    it('sends the invitation count to an Org Admin', async () => {
      const { actor } = await adminWithOrg();
      await createPlan(actor, 'Tower B');
      await actor.agent
        .post('/api/v1/organizations/acme/invitations')
        .send({ email: 'newcomer@example.com', role: 'PLANNER' })
        .expect(201);

      const overview = await fetchOverview(actor);

      expect(overview.attention.pendingInvitationCount).toBe(1);
    });

    it('omits the invitation count entirely for a Planner', async () => {
      const { actor, orgId } = await adminWithOrg();
      await createPlan(actor, 'Tower B');
      await actor.agent
        .post('/api/v1/organizations/acme/invitations')
        .send({ email: 'newcomer@example.com', role: 'PLANNER' })
        .expect(201);
      const planner = await memberWith(orgId, 'PLANNER', 'planner@example.com');

      const overview = await fetchOverview(planner);

      // Omitted, not zeroed. Sending `0` would tell a Planner there is an answer they may
      // not have, which is exactly the leak the omission exists to close.
      expect(overview.attention).not.toHaveProperty('pendingInvitationCount');
    });

    it('omits both counts for a Viewer and a Contributor', async () => {
      const { actor, orgId } = await adminWithOrg();
      await createPlan(actor, 'Tower B');
      const viewer = await memberWith(orgId, 'VIEWER', 'viewer@example.com');
      const contributor = await memberWith(orgId, 'CONTRIBUTOR', 'contributor@example.com');

      for (const reader of [viewer, contributor]) {
        const overview = await fetchOverview(reader);
        expect(overview.attention).not.toHaveProperty('pendingInvitationCount');
        expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
      }
    });

    it('still serves the hierarchy read to every role', async () => {
      const { actor, orgId } = await adminWithOrg();
      const planId = await createPlan(actor, 'Tower B');
      const planner = await memberWith(orgId, 'PLANNER', 'planner@example.com');
      const contributor = await memberWith(orgId, 'CONTRIBUTOR', 'contributor@example.com');
      const viewer = await memberWith(orgId, 'VIEWER', 'viewer@example.com');

      for (const reader of [actor, planner, contributor, viewer]) {
        const overview = await fetchOverview(reader);
        expect(overview.recentlyChanged.map((row) => row.planId)).toEqual([planId]);
        expect(overview.organisationName).toBe('Acme');
      }
    });
  });

  describe('held pens', () => {
    it('lists only the calling user’s own pens, and names who is waiting', async () => {
      const { actor, orgId } = await adminWithOrg();
      const planId = await createPlan(actor, 'Tower B');
      const planner = await memberWith(orgId, 'PLANNER', 'planner@example.com');

      // The planner takes the pen; the admin asks for it.
      await planner.agent.post(`/api/v1/organizations/acme/plans/${planId}/edit-lock`).expect(200);
      await actor.agent
        .post(`/api/v1/organizations/acme/plans/${planId}/edit-lock/request`)
        .expect(200);

      const holderView = await fetchOverview(planner);
      expect(holderView.attention.heldLocks).toHaveLength(1);
      expect(holderView.attention.heldLocks[0]).toMatchObject({
        planId,
        requestedBy: { kind: 'MEMBER', name: 'admin' },
      });

      // The admin holds nothing — a pen you asked for is not a pen you hold.
      const requesterView = await fetchOverview(actor);
      expect(requesterView.attention.heldLocks).toHaveLength(0);
    });
  });

  describe('the empty states', () => {
    it('calls an organisation with no clients new', async () => {
      const { actor } = await adminWithOrg();

      const overview = await fetchOverview(actor);

      expect(overview).toMatchObject({
        isNewOrganisation: true,
        hasPlans: false,
        recentlyChanged: [],
      });
    });

    it('distinguishes "set up but no plans yet" from "brand new"', async () => {
      const { actor } = await adminWithOrg();
      await actor.agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);

      const overview = await fetchOverview(actor);

      // Two situations, two different next steps. One flag could not tell them apart.
      expect(overview.isNewOrganisation).toBe(false);
      expect(overview.hasPlans).toBe(false);
    });
  });

  describe('scoping', () => {
    it('404s for a member of another organisation', async () => {
      await adminWithOrg();
      const outsider = await signUp('outsider@example.com');
      await outsider.agent.post('/api/v1/organizations').send({ name: 'Other' }).expect(201);

      // Uniform 404, not 403 — no existence oracle for organisation slugs.
      await outsider.agent.get(OVERVIEW).expect(404);
    });

    it('never shows another organisation’s plans', async () => {
      const { actor } = await adminWithOrg();
      await createPlan(actor, 'Acme plan');

      const other = await signUp('other@example.com');
      await other.agent.post('/api/v1/organizations').send({ name: 'Other Co' }).expect(201);

      const overview = await other.agent.get('/api/v1/organizations/other-co/overview').expect(200);

      expect((overview.body.data as OverviewBody).recentlyChanged).toHaveLength(0);
    });

    it('401s without a session', async () => {
      await request(server()).get(OVERVIEW).expect(401);
    });
  });
});
