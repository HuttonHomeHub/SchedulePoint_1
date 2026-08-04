import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { importSchedule } from '@repo/interchange';
import { scaleSpec, type SeedSpec } from '@repo/seed';
import { SeedClient, seedPlan } from '@repo/seed-http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';

/**
 * **Seed → export XER → re-import → diff** (ADR-0066 M5.4).
 *
 * ## What this adds that `interchange-export.e2e-spec.ts` does not
 *
 * That file proves specific fields survive: a code here, an FS link there, a constraint, a progress
 * value — each assertion a field somebody chose, on a plan built by hand for the purpose. This one
 * asks a different question: **how much of a real catalogue plan survives, and what exactly is
 * lost**, by sending a *generated* plan through and diffing everything.
 *
 * The distinction matters because the interesting losses are the ones nobody thought to assert. A
 * hand-built fixture can only lose what its author put in it. A catalogue plan carries WBS
 * summaries, milestones, LOE hammocks, constraints, a progressed front and resource assignments at
 * once, and the diff reports what happened to all of them as data.
 *
 * ## What a drop means here
 *
 * **A drop is not automatically a defect.** ADR-0050 is explicit that XER cannot carry about
 * seventeen of the things a `SeedSpec` can express, and that best-effort fidelity is *reported,
 * never silent*. So the suite splits the two:
 *
 * - The **core network** — activity codes, types, durations and the logic between them — must
 *   survive. That is what an interchange format is for, and losing it is a defect.
 * - Everything else is **measured and printed**, not asserted. Pinning it would turn every
 *   legitimate mapping improvement into a red build, and the number is the deliverable anyway.
 *
 * Re-import goes through the pure `importSchedule` parser rather than the HTTP commit endpoint, for
 * the same reason the export suite does: the bytes and the parser are the real ones, the commit
 * path already has its own coverage, and the question here is fidelity rather than persistence.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'roundtrip@example.com';

/** Small enough to seed inside one test, large enough to carry the whole activity mix. */
const SOURCE = (): SeedSpec => scaleSpec({ activities: 40 });

describe.skipIf(!hasDatabase)('Interchange round-trip fidelity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let client: SeedClient;
  let projectId: string;
  const orgSlug = 'round-trip-co';

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
    // A real socket, for the same reason the pairwise differential uses one: the seeder is a
    // `fetch` client, and reusing it verbatim is what stops a second seeder existing to drift.
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(Token);

    await resetDatabase();
    projectId = await bootstrapOrganisation();

    client = new SeedClient({ baseUrl, origin: baseUrl });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
  }, 180_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  /** Children before parents, so no FK restriction bites; the database is shared between specs. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    // Baselines and shares hold the plan too. The database is shared with every other e2e file, so
    // this must clear whatever THEY left as well as its own — the first run tripped on a baseline
    // from another suite, not from this one.
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.planShare.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.calendarExceptionWindow.deleteMany();
    await prisma.calendarException.deleteMany();
    await prisma.calendarShift.deleteMany();
    await prisma.calendar.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.orgMember.deleteMany();
    // Append-only + ON DELETE RESTRICT: audit rows must go before their org can.
    await clearAuditEvents(prisma);
    await prisma.organization.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.user.deleteMany();
  }

  async function bootstrapOrganisation(): Promise<string> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', baseUrl)
      .send({ name: 'Round Trip', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Round Trip Co' }).expect(201);
    const clientRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients`)
      .send({ name: 'Interchange' })
      .expect(201);
    const projectRes = await agent
      .post(`/api/v1/organizations/${orgSlug}/clients/${clientRes.body.data.id}/projects`)
      .send({ name: 'Round trip' })
      .expect(201);
    return projectRes.body.data.id as string;
  }

  it('round-trips a generated catalogue plan through XER, keeping the core network and reporting the drops', async () => {
    const spec = SOURCE();

    // 1. Seed the source through the ordinary public write path, using the same seeder the CLI
    //    uses — so what goes in is exactly what a real operator would have created.
    const seeded = await seedPlan(client, { orgSlug, projectId }, spec);
    expect(seeded.planId, `source plan failed: ${JSON.stringify(seeded.findings)}`).not.toBeNull();
    const sourceId = seeded.planId!;

    // What the application actually holds, which is what the export can draw on. Read back
    // rather than taken from the spec: the API is day-denominated and rounds (TECH_DEBT #78), so
    // comparing the export against the SPEC would report that rounding as an interchange loss.
    const persisted = await client.get<
      { id: string; code: string; type: string; durationDays: number; parentId: string | null }[]
    >(`/api/v1/organizations/${orgSlug}/plans/${sourceId}/activities?limit=100`);
    // The endpoints come back nested and already carry the code, so no id→code map is needed on
    // this side — which is just as well: the first attempt built one and produced `?->?` for
    // every link, an all-lost diff caused entirely by reading the wrong field.
    const links = await client.get<
      { predecessor: { code: string }; successor: { code: string }; type: string }[]
    >(`/api/v1/organizations/${orgSlug}/plans/${sourceId}/dependencies?limit=100`);
    expect(persisted.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);

    // 2. Export the bytes.
    const exported = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}/plans/${sourceId}/interchange/export/xer`)
      .set('Cookie', await sessionCookie())
      .responseType('blob')
      .expect(200);
    const bytes = exported.body as Buffer;
    expect(bytes.byteLength).toBeGreaterThan(0);

    // 3. Re-import them.
    const reimport = importSchedule({ content: new Uint8Array(bytes), filename: 'roundtrip.xer' });
    expect(reimport.ok, 'the exported bytes did not parse back').toBe(true);
    if (!reimport.ok) return;

    // 4. Diff, keyed on `code` — the re-imported graph has no database ids, so an id-based
    //    comparison would report every row as lost and prove nothing.
    const beforeCodes = persisted.map((row) => row.code).sort();
    const afterCodes = reimport.graph.activities.map((row) => row.code).sort();
    const lostActivities = beforeCodes.filter((code) => !afterCodes.includes(code));

    const beforeLinks = links
      .map((row) => `${row.predecessor.code}->${row.successor.code}:${row.type}`)
      .sort();
    // The parsed graph links by KEY, and a key is not a code. Resolve through the activity list
    // so both sides of the diff speak the same language.
    const keyToCode = new Map(
      reimport.graph.activities.map((row) => [(row as { key?: string }).key ?? row.code, row.code]),
    );
    const afterLinks = reimport.graph.dependencies
      .map(
        (row) =>
          `${keyToCode.get(row.predecessorKey) ?? row.predecessorKey}->${keyToCode.get(row.successorKey) ?? row.successorKey}:${row.type}`,
      )
      .sort();
    const lostLinks = beforeLinks.filter((link) => !afterLinks.includes(link));

    const afterByCode = new Map(reimport.graph.activities.map((row) => [row.code, row]));
    const changedType = persisted
      .filter((row) => afterByCode.has(row.code))
      .filter((row) => afterByCode.get(row.code)!.type !== row.type)
      .map((row) => `${row.code}: ${row.type} → ${String(afterByCode.get(row.code)!.type)}`);

    // 5. The measurement, printed whether or not the assertions pass. This is the deliverable —
    //    a number a reader can hold against the ADR-0050 mapping-contract table.
    const parentedBefore = persisted.filter((row) => row.parentId !== null).length;
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '[ADR-0066 M5.4] XER round-trip fidelity, generated catalogue plan:',
        `  activities   ${String(afterCodes.length)}/${String(beforeCodes.length)} recovered`,
        `  logic        ${String(afterLinks.length)}/${String(beforeLinks.length)} recovered`,
        `  types        ${String(changedType.length)} changed${
          changedType.length > 0 ? `: ${changedType.slice(0, 5).join(', ')}` : ''
        }`,
        `  calendars    ${String(reimport.graph.calendars.length)} recovered`,
        `  WBS parented ${String(parentedBefore)} in the source`,
        '',
        '  A drop is not automatically a defect — ADR-0050 records what XER cannot carry. It IS a',
        '  defect when the core network loses something, which is what the assertions below cover.',
        '',
      ].join('\n'),
    );

    // The assertions, deliberately narrow: the core network and nothing else.
    expect(lostActivities).toEqual([]);
    expect(lostLinks).toEqual([]);
    expect(changedType).toEqual([]);
  }, 180_000);

  /** The session cookie the seeder holds, borrowed for the supertest calls. */
  async function sessionCookie(): Promise<string> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', baseUrl)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const setCookie = res.headers['set-cookie'];
    return (Array.isArray(setCookie) ? setCookie : [setCookie])
      .map((entry) => String(entry).split(';')[0])
      .join('; ');
  }
});
