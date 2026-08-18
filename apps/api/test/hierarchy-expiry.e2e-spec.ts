import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * **The retention expiry against a real Postgres** (ADR-0096 D2/D5/D7).
 *
 * This is the only place the delete order can be proven, and the ONE case that matters is the one
 * no unit suite can produce: a plan that owns rows the soft-delete cascade never stamps —
 * `resource_assignments` and `cross_plan_dependencies` (`docs/TECH_DEBT.md` #139). A
 * `delete_batch_id`-keyed expiry passes on a bare plan and violates a foreign key on exactly the
 * plans a real customer has. Deriving the scope from **ownership** is what fixes it, and only a
 * real database can tell the two apart.
 *
 * It drives the runner **directly**. No timer is created and none is needed: the service is a
 * provider its own module deliberately does not export (`hierarchy-expiry.structural.spec.ts`),
 * and the schedule is proven with a faked clock in `hierarchy-expiry.service.spec.ts`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Hierarchy expiry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deleteExpiredScope: typeof import('../src/common/hierarchy/hierarchy-expiry.runner').deleteExpiredScope;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    ({ deleteExpiredScope } = await import('../src/common/hierarchy/hierarchy-expiry.runner'));
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
    // The `docs/TECH_DEBT.md` #119 order: link tables and activities first, or a sibling spec's
    // leftovers make this a foreign-key violation naming a table this file never touches.
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.activityStep.deleteMany();
    await prisma.note.deleteMany();
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.resource.deleteMany();
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

  async function createClient(actor: Actor, name: string): Promise<string> {
    const res = await actor.agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createProject(actor: Actor, clientId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/clients/${clientId}/projects`)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createPlan(actor: Actor, projectId: string, name: string): Promise<string> {
    const res = await actor.agent
      .post(`/api/v1/organizations/acme/projects/${projectId}/plans`)
      .send({ name, plannedStart: '2026-01-01' })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createActivity(orgId: string, planId: string, name: string): Promise<string> {
    const row = await prisma.activity.create({
      data: { organizationId: orgId, planId, name, durationMinutes: 1440 },
      select: { id: true },
    });
    return row.id;
  }

  it('permanently deletes a subtree carrying rows the cascade never stamps', async () => {
    // **The case that decides D5.** Both link tables below are left unstamped by the soft-delete
    // cascade, so a `delete_batch_id`-keyed delete would find nothing to remove and then fail the
    // foreign key on `activities` — on a resourced or programme-linked plan, i.e. a real one.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Baseline');
    const activityId = await createActivity(orgId, planId, 'Excavate');

    // A live plan under a DIFFERENT client, so the cross-plan edge survives the expiring side.
    const otherClientId = await createClient(actor, 'Southgate');
    const otherProjectId = await createProject(actor, otherClientId, 'Hillside');
    const otherPlanId = await createPlan(actor, otherProjectId, 'Live');
    const otherActivityId = await createActivity(orgId, otherPlanId, 'Pour');

    const resource = await prisma.resource.create({
      data: { organizationId: orgId, name: 'Excavator', kind: 'EQUIPMENT' },
      select: { id: true },
    });
    await prisma.resourceAssignment.create({
      data: { organizationId: orgId, activityId, resourceId: resource.id, budgetedUnits: 8 },
    });
    await prisma.activityStep.create({
      data: { organizationId: orgId, activityId, seq: 1, name: 'Strip topsoil' },
    });
    await prisma.note.create({
      data: { organizationId: orgId, entityType: 'ACTIVITY', planId, activityId, body: 'Watch it' },
    });
    await prisma.crossPlanDependency.create({
      data: {
        organizationId: orgId,
        predecessorPlanId: planId,
        successorPlanId: otherPlanId,
        predecessorId: activityId,
        successorId: otherActivityId,
      },
    });
    const baseline = await prisma.baseline.create({
      data: { organizationId: orgId, planId, name: 'BL1' },
      select: { id: true },
    });
    await prisma.baselineActivity.create({
      data: {
        organizationId: orgId,
        baselineId: baseline.id,
        sourceActivityId: activityId,
        name: 'Excavate',
        durationMinutes: 1440,
      },
    });
    await prisma.planShare.create({
      data: { organizationId: orgId, planId, tokenHash: 'a'.repeat(64), label: 'QS' },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const counts = await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [planId] }),
    );

    expect(counts).toEqual({ clients: 1, projects: 1, plans: 1, activities: 1 });
    expect(await prisma.client.findUnique({ where: { id: clientId } })).toBeNull();
    expect(await prisma.plan.findUnique({ where: { id: planId } })).toBeNull();
    expect(await prisma.activity.findUnique({ where: { id: activityId } })).toBeNull();
    expect(await prisma.resourceAssignment.count()).toBe(0);
    expect(await prisma.crossPlanDependency.count()).toBe(0);
    expect(await prisma.note.count()).toBe(0);
    expect(await prisma.baseline.count()).toBe(0);
    expect(await prisma.planShare.count()).toBe(0);

    // The other side of the link is untouched: an expiry may only ever reach what its scope owns.
    expect(await prisma.plan.findUnique({ where: { id: otherPlanId } })).not.toBeNull();
    expect(await prisma.activity.findUnique({ where: { id: otherActivityId } })).not.toBeNull();
    // The org-scoped resource is a LIBRARY row, not part of the subtree.
    expect(await prisma.resource.count()).toBe(1);
  });

  it('deletes a WBS chain in one statement, whatever its depth (D7)', async () => {
    // `activities.parent_id` is `onDelete: Restrict`, and the spec claimed that forced a repeated
    // leaves-first loop. RESTRICT is an AFTER ROW trigger evaluated at the END of the statement, so
    // every row the statement targets is already gone before any check runs.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');
    const planId = await createPlan(actor, projectId, 'Deep');

    let parentId: string | null = null;
    for (let depth = 0; depth < 40; depth += 1) {
      const row: { id: string } = await prisma.activity.create({
        data: {
          organizationId: orgId,
          planId,
          name: `L${depth}`,
          durationMinutes: 1440,
          type: 'WBS_SUMMARY',
          parentId,
        },
        select: { id: true },
      });
      parentId = row.id;
    }

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    const counts = await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [planId] }),
    );
    expect(counts.activities).toBe(40);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('leaves an ORG calendar alone and takes the project-scoped one', async () => {
    // ADR-0053: an ORG calendar is shared and outlives the project entirely. Expiring one would
    // silently take working time away from every other project that binds it.
    const { actor, orgId } = await adminWithOrg();
    const clientId = await createClient(actor, 'Northgate');
    const projectId = await createProject(actor, clientId, 'Riverside');

    const orgCalendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Standard week', scope: 'ORG' },
      select: { id: true },
    });
    const projectCalendar = await prisma.calendar.create({
      data: { organizationId: orgId, name: 'Site week', scope: 'PROJECT', projectId },
      select: { id: true },
    });

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${clientId}`).expect(204);

    await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, { clientIds: [clientId], projectIds: [projectId], planIds: [] }),
    );

    expect(await prisma.calendar.findUnique({ where: { id: orgCalendar.id } })).not.toBeNull();
    expect(await prisma.calendar.findUnique({ where: { id: projectCalendar.id } })).toBeNull();
  });

  it('leaves the surviving downstream plan recalculable after its upstream vanishes', async () => {
    // **The ADR's own M4 obligation** (ADR-0096, Consequences): expiring a plan that is a live
    // cross-plan dependency endpoint changes the SURVIVING downstream plan's next input, and the
    // parity sentence about the CPM engine does not cover it. ADR-0045 derives the downstream
    // bound from the upstream plan's persisted dates; with the upstream row gone, the closure it
    // walks has one fewer node — which either works or 500s, and only a real database says which.
    const { actor, orgId } = await adminWithOrg();
    const upClientId = await createClient(actor, 'Northgate');
    const upProjectId = await createProject(actor, upClientId, 'Riverside');
    const upPlanId = await createPlan(actor, upProjectId, 'Enabling works');
    const upActivityId = await createActivity(orgId, upPlanId, 'Demolish');

    const downClientId = await createClient(actor, 'Southgate');
    const downProjectId = await createProject(actor, downClientId, 'Hillside');
    const downPlanId = await createPlan(actor, downProjectId, 'Main works');
    const downActivityId = await createActivity(orgId, downPlanId, 'Pour slab');

    await prisma.crossPlanDependency.create({
      data: {
        organizationId: orgId,
        predecessorPlanId: upPlanId,
        successorPlanId: downPlanId,
        predecessorId: upActivityId,
        successorId: downActivityId,
      },
    });

    // Green before, so the assertion after is about the expiry and not about the fixture.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate-programme`)
      .expect(200);

    await actor.agent.delete(`/api/v1/organizations/acme/clients/${upClientId}`).expect(204);
    await prisma.$transaction((tx) =>
      deleteExpiredScope(tx, {
        clientIds: [upClientId],
        projectIds: [upProjectId],
        planIds: [upPlanId],
      }),
    );

    const after = await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate-programme`)
      .expect(200);
    expect(after.body.data).toBeDefined();

    // And the single-plan route, which is what the canvas actually calls.
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${downPlanId}/schedule/recalculate`)
      .expect(200);
  });
});
