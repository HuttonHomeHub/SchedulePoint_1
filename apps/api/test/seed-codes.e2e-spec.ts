import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PenHolder, SeedClient, SeedHttpError, seedPlan } from '@repo/seed-http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { codesWidePlan } from '../../seed-cli/src/capabilities/codes-wide.js';
import { codesPlan } from '../../seed-cli/src/capabilities/codes.js';
import { swimlanesPlan } from '../../seed-cli/src/capabilities/swimlanes.js';
import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearActivityTree } from './clear-activity-tree';
import { clearBaselineTree } from './clear-baseline-tree';
import { clearPlanTree } from './clear-plan-tree';

/**
 * **The coded seeded plan lands through the public REST API** (p6-activity-codes M2-T6, ADR-0066).
 *
 * The seeder is an ordinary REST client, so this is the first thing that exercises the code-types
 * routes and `PATCH …/activities/codes` as a client sends them, rather than as a test of the module
 * writes them. It reads the plan back the way a reader of `docs/TEST_PLAYBOOK.md` would — the
 * code-types list and the activity list — and compares it with the SPEC, not with the seeder's own
 * bookkeeping, so a seeder that dropped a value would fail here instead of agreeing with itself.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'seed-codes@example.com';
const ORG = 'seed-codes-co';

interface CodeValueRow {
  id: string;
  shortCode: string;
  description: string | null;
  position: number;
}
interface CodeTypeRow {
  id: string;
  name: string;
  position: number;
  values: CodeValueRow[];
}
interface ActivityRow {
  code: string;
  earlyStart: string | null;
  codes?: { codeTypeId: string; codeValueId: string }[];
}

describe.skipIf(!hasDatabase)('The coded seeded plan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: SeedClient;
  let projectId: string;

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
    await app.listen(0);
    prisma = app.get(Token);
    await resetDatabase();

    const request = (await import('supertest')).default;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Codes', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Seed Codes Co' }).expect(201);
    const clientRes = await agent
      .post(`/api/v1/organizations/${ORG}/clients`)
      .send({ name: 'Codes' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/${ORG}/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Codes' })
      .expect(201);
    projectId = projectRes.body.data.id as string;

    client = new SeedClient({ baseUrl: await app.getUrl(), origin: TRUSTED_ORIGIN });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
  }, 300_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  /** Children before parents. The database is shared between specs, so this clears others' rows too. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await clearActivityTree(prisma);
    await prisma.planLock.deleteMany();
    await clearBaselineTree(prisma);
    await prisma.planShare.deleteMany();
    await clearPlanTree(prisma);
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  const activities = async (planId: string): Promise<ActivityRow[]> =>
    (await client.getPage<ActivityRow>(`/api/v1/organizations/${ORG}/plans/${planId}/activities`))
      .rows;

  it('creates the three types and their values, in the spec order', async () => {
    const spec = codesPlan();
    const seeded = await seedPlan(client, { orgSlug: ORG, projectId }, spec);
    expect(seeded.findings, JSON.stringify(seeded.findings)).toEqual([]);
    expect(seeded.planId).not.toBeNull();

    const types = await client.get<CodeTypeRow[]>(
      `/api/v1/organizations/${ORG}/plans/${seeded.planId!}/code-types`,
    );
    const want = spec.codes!.types;
    expect(types.map((t) => t.name)).toEqual(want.map((t) => t.name));
    expect(types.map((t) => t.position)).toEqual([0, 1, 2]);
    for (const [index, type] of types.entries()) {
      expect(
        type.values.map((v) => [v.shortCode, v.description]),
        type.name,
      ).toEqual(want[index]!.values.map((v) => [v.shortCode, v.description ?? null]));
    }
    expect(
      types.map((t) => t.values.map((v) => v.position)),
      'value positions',
    ).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3, 4],
      [0, 1, 2],
    ]);
    // Phase has values and no activity will be given one.
    expect(types[2]!.values).toHaveLength(3);
  });

  it('puts exactly the spec’s values on the activity list, and no value where the spec gives none', async () => {
    const spec = codesPlan();
    const planId = (
      await client.get<{ id: string; name: string }[]>(
        `/api/v1/organizations/${ORG}/projects/${projectId}/plans`,
      )
    ).find((p) => p.name === spec.plan.name)!.id;
    const types = await client.get<CodeTypeRow[]>(
      `/api/v1/organizations/${ORG}/plans/${planId}/code-types`,
    );
    const typeByName = new Map(types.map((t) => [t.name, t]));
    const specTypes = new Map(spec.codes!.types.map((t) => [t.key, t]));

    const rows = new Map((await activities(planId)).map((a) => [a.code, a]));
    expect(rows.size).toBe(spec.activities.length);
    for (const seeded of spec.activities) {
      // The expectation is built from the spec's own keys, resolved to the ids the API issued.
      const expected = Object.entries(seeded.codes ?? {}).map(([typeKey, valueKey]) => {
        const type = typeByName.get(specTypes.get(typeKey)!.name)!;
        const shortCode = specTypes.get(typeKey)!.values.find((v) => v.key === valueKey)!.shortCode;
        return {
          codeTypeId: type.id,
          codeValueId: type.values.find((v) => v.shortCode === shortCode)!.id,
        };
      });
      const actual = rows.get(seeded.code)?.codes ?? [];
      const byType = (list: { codeTypeId: string }[]) =>
        [...list].sort((a, b) => a.codeTypeId.localeCompare(b.codeTypeId));
      expect(byType(actual), seeded.code).toEqual(byType(expected));
    }
    // No activity carries a Phase value; CD_8 carries nothing at all.
    const phaseId = typeByName.get('Phase')!.id;
    for (const row of rows.values()) {
      expect(row.codes?.some((c) => c.codeTypeId === phaseId) ?? false, row.code).toBe(false);
    }
    expect(rows.get('CD_8')).toHaveProperty('codes', []);
  });

  it('moves no date, and leaves every other plan’s activity list without `codes`', async () => {
    const codedPlan = (
      await client.get<{ id: string; name: string }[]>(
        `/api/v1/organizations/${ORG}/projects/${projectId}/plans`,
      )
    ).find((p) => p.name === codesPlan().plan.name)!;
    // The chain CD_1 → CD_2 starts on the data date and a five-day task later.
    const rows = new Map((await activities(codedPlan.id)).map((a) => [a.code, a]));
    expect(rows.get('CD_1')?.earlyStart).toBe('2026-03-02');
    expect(rows.get('CD_2')?.earlyStart).toBe('2026-03-09');

    const other = await seedPlan(client, { orgSlug: ORG, projectId }, swimlanesPlan());
    expect(other.planId, JSON.stringify(other.findings)).not.toBeNull();
    const otherRows = await activities(other.planId!);
    expect(otherRows.length).toBeGreaterThan(0);
    for (const row of otherRows) expect(row, row.code).not.toHaveProperty('codes');
  });

  it('reads a deleted value as no value, and a restored one as it was', async () => {
    const spec = codesPlan();
    const planId = (
      await client.get<{ id: string; name: string }[]>(
        `/api/v1/organizations/${ORG}/projects/${projectId}/plans`,
      )
    ).find((p) => p.name === spec.plan.name)!.id;
    const [area] = await client.get<CodeTypeRow[]>(
      `/api/v1/organizations/${ORG}/plans/${planId}/code-types`,
    );
    const level1 = area!.values.find((v) => v.shortCode === 'L1')!;
    const carriers = ['CD_3', 'CD_4', 'CD_5'];
    const areaOf = async (code: string): Promise<string | undefined> =>
      (await activities(planId))
        .find((a) => a.code === code)
        ?.codes?.find((c) => c.codeTypeId === area!.id)?.codeValueId;
    for (const code of carriers) expect(await areaOf(code), code).toBe(level1.id);

    const base = `/api/v1/organizations/${ORG}/plans/${planId}/code-values/${level1.id}`;
    await PenHolder.withPen(client, ORG, planId, async () => {
      await client.del(base);
      for (const code of carriers)
        expect(await areaOf(code), `${code} after delete`).toBeUndefined();
      await client.postNoContent(`${base}/restore`);
    });
    for (const code of carriers) expect(await areaOf(code), `${code} restored`).toBe(level1.id);
  });
  it('seeds the wide plan with Room one over the swimlane limit and Zone exactly at it (M4-T6)', async () => {
    const spec = codesWidePlan();
    const seeded = await seedPlan(client, { orgSlug: ORG, projectId }, spec);
    expect(seeded.findings, JSON.stringify(seeded.findings)).toEqual([]);
    const planId = seeded.planId!;
    const planPath = `/api/v1/organizations/${ORG}/plans/${planId}`;
    const types = await client.get<CodeTypeRow[]>(`${planPath}/code-types`);
    const byName = new Map(types.map((t) => [t.name, t]));
    expect(byName.get('Room')!.values).toHaveLength(101);
    expect(byName.get('Zone')!.values).toHaveLength(100);

    const rows = await activities(planId);
    expect(rows).toHaveLength(101);
    const inUse = (typeName: string): number =>
      new Set(
        rows
          .flatMap((r) => (r.codes ?? []).filter((c) => c.codeTypeId === byName.get(typeName)!.id))
          .map((c) => c.codeValueId),
      ).size;
    expect(inUse('Room')).toBe(101);
    expect(inUse('Zone')).toBe(100);

    // The rule the picker states: refused over the limit with its reason, accepted at it.
    const choose = async (typeId: string): Promise<unknown> => {
      const plan = await client.get<{ version: number }>(planPath);
      return client.patch(planPath, {
        version: plan.version,
        swimlaneSource: 'ACTIVITY_CODE',
        swimlaneCodeTypeId: typeId,
      });
    };
    await PenHolder.withPen(client, ORG, planId, async () => {
      const refused = await choose(byName.get('Room')!.id).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(SeedHttpError);
      expect((refused as SeedHttpError).status).toBe(422);
      expect((refused as SeedHttpError).details).toMatchObject({
        reason: 'SWIMLANE_CODE_TYPE_INELIGIBLE',
        valuesInUse: 101,
        limit: 100,
      });
      await expect(choose(byName.get('Zone')!.id)).resolves.toBeDefined();
    });
  });
});
