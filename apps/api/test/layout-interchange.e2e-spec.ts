import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { importSchedule } from '@repo/interchange';
import { SeedClient, seedPlan } from '@repo/seed-http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant.js';
import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearBaselineTree } from './clear-baseline-tree';

/**
 * **Layout interchange: does a plan's picture survive XER export and re-import?**
 * (`docs/specs/layout-interchange/`, FC-1; M0-T1 characterises it, M3 turns it green.)
 *
 * The NetPoint reference plan is seeded through the real seeder, exported through the real export
 * route, and imported through the real **commit** route into a second project — the path a planner
 * takes, which the sibling `interchange-roundtrip.e2e-spec.ts` deliberately does not (it stops at the
 * pure parser). The source and the re-import are then compared per activity CODE, because the two
 * plans share no ids.
 *
 * **Today the network survives and the picture does not.** The first test pins the network half and
 * prints the measurement M0-T1 asks for. The second is `it.fails` on purpose: it states FC-1's
 * layout half and passes only while that half is still broken. M3 turns it into `it`, and a green
 * `it.fails` before then would mean the layout started surviving by accident.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const TRUSTED_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'layout-interchange@example.com';

interface Row {
  code: string;
  type: string;
  laneIndex: number;
  visualStart: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
  visualConflictReason: string | null;
  isCritical: boolean;
}

/** The only genuine P6 export in the repository (the ADR-0034 torture fixture). */
const TORTURE_XER = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'packages',
    'engine-conformance',
    'fixtures',
    'p6_torture_test_v1.xer',
  ),
);

/**
 * The M0 baseline FC-2 and FC-5 are judged against (M0-T4). Written by hand from the first run and
 * never regenerated: a change to any figure is a finding to explain, not a snapshot to update.
 */
const BASELINE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'layout-interchange-m0-baseline.json'), 'utf8'),
) as {
  tortureGraphDigest: string;
  tortureReportDigest: string;
  netpointReimportOverlaps: number;
};

const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const dayOf = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * How many activities share a row with another they overlap in time, under the web's DRAWN span
 * (`apps/web/src/features/tsld/model/drawn-span.ts`: the visual-effective dates, with a finish
 * milestone moved to the end of its day, ADR-0155). A port, not the function: M1 moves the span into
 * `@repo/layout` and this harness then imports it.
 */
function overlappingActivities(side: Side): number {
  const byLane = new Map<number, { code: string; start: number; end: number }[]>();
  for (const r of side.rows.values()) {
    if (r.visualEffectiveStart === null) continue;
    const shift = r.type === 'FINISH_MILESTONE' ? 1 : 0;
    const start = dayOf(r.visualEffectiveStart) + shift;
    const end = r.visualEffectiveFinish === null ? start : dayOf(r.visualEffectiveFinish) + shift;
    const lane = byLane.get(r.laneIndex) ?? [];
    lane.push({ code: r.code, start, end });
    byLane.set(r.laneIndex, lane);
  }
  const overlapping = new Set<string>();
  for (const lane of byLane.values()) {
    for (let i = 0; i < lane.length; i += 1) {
      for (let j = i + 1; j < lane.length; j += 1) {
        const a = lane[i]!;
        const b = lane[j]!;
        if (a.start <= b.end && b.start <= a.end) {
          overlapping.add(a.code);
          overlapping.add(b.code);
        }
      }
    }
  }
  return overlapping.size;
}

interface Side {
  planId: string;
  rows: Map<string, Row>;
  finish: string | null;
}

describe.skipIf(!hasDatabase)('Layout interchange: NetPoint XER round trip (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: SeedClient;
  const orgSlug = 'layout-interchange-co';
  let source: Side;
  let reimported: Side;
  let foreign: Side;

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

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ name: 'Layout', email: EMAIL, password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Layout Interchange Co' }).expect(201);
    const clientId = (
      await agent.post(`/api/v1/organizations/${orgSlug}/clients`).send({ name: 'C' }).expect(201)
    ).body.data.id as string;
    const project = async (name: string): Promise<string> =>
      (
        await agent
          .post(`/api/v1/organizations/${orgSlug}/clients/${clientId}/projects`)
          .send({ name })
          .expect(201)
      ).body.data.id as string;
    const sourceProject = await project('Source');
    const importProject = await project('Import');

    client = new SeedClient({ baseUrl: await app.getUrl(), origin: TRUSTED_ORIGIN });
    await client.authenticate({ email: EMAIL, password: PASSWORD });
    const seeded = await seedPlan(
      client,
      { orgSlug, projectId: sourceProject },
      netpointReferencePlan(),
    );
    expect(seeded.planId, JSON.stringify(seeded.findings)).not.toBeNull();
    source = await read(seeded.planId!);

    const bytes = (
      await agent
        .get(`/api/v1/organizations/${orgSlug}/plans/${source.planId}/interchange/export/xer`)
        .responseType('blob')
        .expect(200)
    ).body as Buffer;
    const committed = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${importProject}/interchange/commit`)
      .attach('file', bytes, 'netpoint-power-plant.xer')
      .expect(201);
    reimported = await read(committed.body.data.planId as string);

    const foreignProject = await project('Foreign');
    const foreignCommit = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${foreignProject}/interchange/commit`)
      .attach('file', TORTURE_XER, 'p6_torture_test_v1.xer')
      .expect(201);
    foreign = await read(foreignCommit.body.data.planId as string);
  }, 240_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  async function read(planId: string): Promise<Side> {
    const rows = await client.get<Row[]>(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100`,
    );
    const summary = await client.get<{ projectFinish: string | null }>(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/schedule/summary`,
    );
    return { planId, rows: new Map(rows.map((r) => [r.code, r])), finish: summary.projectFinish };
  }

  const critical = (side: Side): string[] =>
    [...side.rows.values()]
      .filter((r) => r.isCritical)
      .map((r) => r.code)
      .sort();
  const distinctLanes = (side: Side): number =>
    new Set([...side.rows.values()].map((r) => r.laneIndex)).size;
  const differing = (field: keyof Row): string[] =>
    [...source.rows.values()]
      .filter((r) => reimported.rows.get(r.code)?.[field] !== r[field])
      .map((r) => r.code);

  it('keeps the network: every activity, the finish and the critical set (M0-T1)', () => {
    const placed = [...source.rows.values()].filter((r) => r.visualStart !== null).length;
    const placedAfter = [...reimported.rows.values()].filter((r) => r.visualStart !== null).length;
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '[layout-interchange M0-T1] NetPoint XER round trip through export + commit:',
        `  activities  ${String(reimported.rows.size)}/${String(source.rows.size)}`,
        `  finish      ${String(source.finish)} → ${String(reimported.finish)}`,
        `  critical    ${String(critical(source).length)} → ${String(critical(reimported).length)}`,
        `  placements  ${String(placed)} → ${String(placedAfter)}`,
        `  rows        ${String(distinctLanes(source))} distinct → ${String(distinctLanes(reimported))} distinct`,
        `  lane moved  ${String(differing('laneIndex').length)} activities`,
        '',
      ].join('\n'),
    );
    expect([...reimported.rows.keys()].sort()).toEqual([...source.rows.keys()].sort());
    expect(reimported.finish).toBe(source.finish);
    expect(critical(reimported)).toEqual(critical(source));
  });

  // FC-1's layout half. Fails today by design; M3 turns this into `it`.
  it.fails('restores every placement and row (FC-1; fails until M3)', () => {
    expect(differing('visualStart')).toEqual([]);
    expect(differing('laneIndex')).toEqual([]);
    expect(differing('visualEffectiveStart')).toEqual([]);
    expect(differing('visualEffectiveFinish')).toEqual([]);
    expect(differing('visualConflictReason')).toEqual([]);
  });

  it('matches the M0 baseline: foreign import graph, report and row overlaps (M0-T4)', () => {
    const parsed = importSchedule({
      content: new Uint8Array(TORTURE_XER),
      filename: 'p6_torture_test_v1.xer',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const measured = {
      tortureGraphDigest: digest(parsed.graph),
      tortureReportDigest: digest(parsed.report),
      netpointReimportOverlaps: overlappingActivities(reimported),
    };
    const tortureOverlaps = overlappingActivities(foreign);
    // eslint-disable-next-line no-console
    console.log(
      `\n[layout-interchange M0-T4] ${JSON.stringify({ ...measured, tortureOverlaps }, null, 2)}\n`,
    );
    expect(measured).toEqual(BASELINE);
    // The torture import's count is NOT pinned, because it is not reproducible: phase 3 orders its
    // packer input by activity id, ids are UUIDv7 minted during the import, and their random bits
    // decide the tie-breaks — 8 to 23 over seven imports of one file (m0-measurement.md). What is
    // stable, and what M1 must turn to zero, is that the drawn picture overlaps at all.
    expect(tortureOverlaps).toBeGreaterThan(0);
  });

  /** Children before parents; the database is shared with every other e2e file. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.planLock.deleteMany();
    await clearBaselineTree(prisma);
    await prisma.planShare.deleteMany();
    await prisma.plan.deleteMany();
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
});
