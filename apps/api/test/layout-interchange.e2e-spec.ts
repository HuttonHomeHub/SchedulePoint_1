import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { encodeLayoutFields, importSchedule, parseXer } from '@repo/interchange';
import { drawnSpanDays } from '@repo/layout';
import { SeedClient, seedPlan } from '@repo/seed-http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant.js';
import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearAuditEvents } from './audit-reset';
import { clearActivityTree } from './clear-activity-tree';
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
 * **Both survive since M3.** The export writes each activity's placed start and row as two P6
 * user-defined fields and the import restores them, so FC-1 is an ordinary `it` — it was `it.fails`
 * through M0–M2 and passing then would have meant the layout survived by accident. The M2 block below
 * injects hand-built layout fields into the export (stripping the ones the export now writes) to reach
 * the partial, IGNORE and conflict cases a clean export never produces; FC-3 mutates the real export.
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
  version: number;
  swimlaneId: string | null;
  swimlaneLanes: { basis: string; swimlaneId: string | null; laneIndex: number }[];
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
 * The M0 baseline FC-2 is judged against (M0-T4). Written by hand from the first run and
 * never regenerated: a change to any figure is a finding to explain, not a snapshot to update.
 */
const BASELINE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'layout-interchange-m0-baseline.json'), 'utf8'),
) as {
  tortureGraphDigest: string;
  tortureReportDigest: string;
};

const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const dayOf = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * How many activities share a row with another they overlap in time, under the DRAWN span — the
 * shared `drawnSpanDays` (`@repo/layout`) the web draws with and phase 3 now packs by (M1). This was a
 * port at M0; importing the function is what the plan said M1 would change it to.
 */
function overlappingActivities(side: Side): number {
  return overlappingCodes(side).length;
}

function overlappingCodes(side: Side): string[] {
  const byLane = new Map<number, { code: string; start: number; end: number }[]>();
  for (const r of side.rows.values()) {
    const span = drawnSpanDays(
      { type: r.type, start: r.visualEffectiveStart, finish: r.visualEffectiveFinish },
      dayOf,
    );
    if (span === null) continue;
    const lane = byLane.get(r.laneIndex) ?? [];
    lane.push({ code: r.code, start: span.startDay, end: span.endDay });
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
  return [...overlapping];
}

const lanesByCode = (side: Side): Record<string, number> =>
  Object.fromEntries([...side.rows.values()].map((r) => [r.code, r.laneIndex]));

interface Finding {
  detail: string;
}
interface Report {
  mapped: { placements?: number; lanes?: number; swimlanes?: number; swimlaneMembers?: number };
  approximations: Finding[];
  repairs: Finding[];
  drops: Finding[];
}

interface Side {
  planId: string;
  rows: Map<string, Row>;
  finish: string | null;
}

interface SwimlaneRow {
  id: string;
  name: string;
  position: number;
}

/** What a plan holds after a file with swimlane fields is committed (M4-T4). */
interface SwimlanePlan {
  names: string[];
  assign: Record<string, string>;
  lanes: Record<string, number>;
  civil: string[];
  mechanical: string[];
  carriedCode: string;
  carriedLane: number;
}

interface SwimlaneSide {
  side: Side;
  report: Report;
  swimlanes: SwimlaneRow[];
  source: string;
}

describe.skipIf(!hasDatabase)('Layout interchange: NetPoint XER round trip (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: SeedClient;
  const orgSlug = 'layout-interchange-co';
  let source: Side;
  let reimported: Side;
  let foreign: Side;
  let foreignAgain: Side;
  // M2 — files carrying the layout, built by injecting the fields into the real export (the exporter
  // writes them only from M3), each committed through the real route.
  let restored: Side;
  let restoredReport: Report;
  let partial: Side;
  let partialOmitted: string[];
  let ignored: Side;
  let ignoredReport: Report;
  let conflicted: Report;
  let conflictedSide: Side;
  let conflictedCodes: { early: string; stacked: [string, string] };
  let dryRunReport: Report;
  let badOption: request.Response;
  // M3 — the export with its layout tables removed (a foreign-looking file), and FC-3's edited file.
  let stripped: Side;
  let edited: Side;
  let editedReport: Report;
  let editedCorrupt: string;
  let editedNew: string;
  let exportedHasLayout: boolean;
  let editedText: string;
  // M4-T4 — files carrying swimlane fields, built by injecting them (no release writes them yet).
  let swimlaned: SwimlaneSide;
  let swimlanedDry: Report;
  let swimlanedIgnored: SwimlaneSide;
  let swimlanedClipped: SwimlaneSide;
  let swimlanedPlan: SwimlanePlan;

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
    const againProject = await project('Foreign again');
    const againCommit = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${againProject}/interchange/commit`)
      .attach('file', TORTURE_XER, 'p6_torture_test_v1.xer')
      .expect(201);
    foreignAgain = await read(againCommit.body.data.planId as string);

    // --- M2: SchedulePoint files that carry their layout ------------------------------------------
    const commitInto = async (
      name: string,
      file: Buffer,
      restoreLayout?: string,
    ): Promise<{ side: Side; report: Report }> => {
      const target = await project(name);
      const post = agent
        .post(`/api/v1/organizations/${orgSlug}/projects/${target}/interchange/commit`)
        .attach('file', file, 'netpoint-power-plant.xer');
      const res = await (
        restoreLayout === undefined ? post : post.field('restoreLayout', restoreLayout)
      ).expect(201);
      return {
        side: await read(res.body.data.planId as string),
        report: res.body.data.report as Report,
      };
    };

    const full = withLayout(bytes, source, () => true);
    ({ side: restored, report: restoredReport } = await commitInto('Restored', full));

    // Six activities lose their row: the rest are carried, those six are placed around them.
    partialOmitted = [...source.rows.keys()]
      .filter((code) => source.rows.get(code)!.type !== 'WBS_SUMMARY')
      .sort()
      .slice(0, 6);
    ({ side: partial } = await commitInto(
      'Partial',
      withLayout(bytes, source, (code) => !partialOmitted.includes(code)),
    ));

    ({ side: ignored, report: ignoredReport } = await commitInto('Ignored', full, 'IGNORE'));

    // One placement pulled before its logic, and two overlapping bars stacked into one row.
    const drawn = [...source.rows.values()].filter(
      (r) => r.type !== 'WBS_SUMMARY' && r.visualEffectiveStart !== null,
    );
    const latest = [...drawn].sort((a, b) =>
      a.visualEffectiveStart! < b.visualEffectiveStart! ? 1 : -1,
    )[0]!;
    const earliestStart = [...drawn].map((r) => r.visualEffectiveStart!).sort()[0]!;
    const pair = overlappingPairInDifferentRows(drawn.filter((r) => r.code !== latest.code));
    conflictedCodes = { early: latest.code, stacked: pair };
    const conflictedFile = withLayout(bytes, source, () => true, {
      [latest.code]: { placedStart: earliestStart },
      [pair[1]]: { lane: source.rows.get(pair[0])!.laneIndex },
    });
    ({ side: conflictedSide, report: conflicted } = await commitInto('Conflicted', conflictedFile));

    exportedHasLayout = /^%T\tUDFVALUE$/m.test(bytes.toString('utf8'));
    ({ side: stripped } = await commitInto(
      'Stripped',
      Buffer.from(stripLayoutTables(bytes.toString('utf8')), 'utf8'),
    ));

    // FC-3 — the exported file as if edited in P6: a critical-spine duration lengthened, a new TASK
    // with no layout values, and one UDFVALUE row corrupted.
    ({
      text: editedText,
      corruptCode: editedCorrupt,
      newCode: editedNew,
    } = editInP6(bytes.toString('utf8')));
    ({ side: edited, report: editedReport } = await commitInto(
      'Edited in P6',
      Buffer.from(editedText, 'utf8'),
    ));

    // --- M4-T4: SchedulePoint files that carry swimlane fields ----------------------------------------
    const swimlaneCommit = async (
      name: string,
      file: Buffer,
      restoreLayout?: string,
    ): Promise<SwimlaneSide> => {
      const { side, report } = await commitInto(name, file, restoreLayout);
      const lanes = await client.getPage<SwimlaneRow>(
        `/api/v1/organizations/${orgSlug}/plans/${side.planId}/swimlanes?limit=100`,
      );
      const plan = await client.get<{ swimlaneSource: string }>(
        `/api/v1/organizations/${orgSlug}/plans/${side.planId}`,
      );
      return { side, report, swimlanes: lanes.rows, source: plan.swimlaneSource };
    };
    swimlanedPlan = planSwimlanes(source);
    const swimlaneFile = withSwimlaneFields(bytes, swimlanedPlan);
    swimlaned = await swimlaneCommit('Swimlaned', swimlaneFile);
    swimlanedIgnored = await swimlaneCommit('Swimlaned ignored', swimlaneFile, 'IGNORE');
    swimlanedClipped = await swimlaneCommit(
      'Swimlaned clipped',
      withSwimlaneFields(bytes, {
        names: Array.from({ length: 101 }, (_, i) => `Lane ${String(i + 1).padStart(3, '0')}`),
        assign: {},
        lanes: {},
      }),
    );
    const swimlaneDryProject = await project('Swimlane dry run');
    swimlanedDry = (
      await agent
        .post(`/api/v1/organizations/${orgSlug}/projects/${swimlaneDryProject}/interchange/dry-run`)
        .attach('file', swimlaneFile, 'netpoint-power-plant.xer')
        .expect(200)
    ).body.data as Report;

    // A fresh project: the source plan's own project already holds its name, which the dry-run
    // refuses before any report (#541).
    const dryProject = await project('Dry run');
    const dry = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${dryProject}/interchange/dry-run`)
      .attach('file', full, 'netpoint-power-plant.xer')
      .expect(200);
    dryRunReport = dry.body.data as Report;
    badOption = await agent
      .post(`/api/v1/organizations/${orgSlug}/projects/${dryProject}/interchange/dry-run`)
      .field('restoreLayout', 'MAYBE')
      .attach('file', full, 'netpoint-power-plant.xer');
  }, 360_000);

  afterAll(async () => {
    await resetDatabase();
    await app?.close();
  });

  async function read(planId: string): Promise<Side> {
    // EVERY page. The torture import has 144 activities (126 tasks, 18 WBS summaries), and a single `limit=100` read returned a
    // different 100 each time (ordered by UUIDv7), which is how M0-T4 first mis-measured it as a
    // non-reproducible layout (m0-measurement.md records the correction).
    const rows: Row[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
      const page = await client.getPage<Row>(
        `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100${query}`,
      );
      rows.push(...page.rows);
      cursor = page.meta.hasMore ? page.meta.nextCursor : null;
    } while (cursor !== null);
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

  // FC-1's layout half: the export carries the picture and the import restores it (M3).
  it('restores every placement and row (FC-1)', () => {
    expect(differing('visualStart')).toEqual([]);
    expect(differing('laneIndex')).toEqual([]);
    expect(differing('visualEffectiveStart')).toEqual([]);
    expect(differing('visualEffectiveFinish')).toEqual([]);
    expect(differing('visualConflictReason')).toEqual([]);
  });

  it('a foreign import keeps its M0 graph and report (FC-2)', () => {
    const parsed = importSchedule({
      content: new Uint8Array(TORTURE_XER),
      filename: 'p6_torture_test_v1.xer',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // ADR-0162 M5 added one thing to this report, and only additively: an `advisories` key naming
    // the file's one zero-duration task. So the M0 baseline is not regenerated; the report WITHOUT
    // that key must still hash to it, and the key must hold exactly that advisory. A digest of the
    // whole report would hide which part moved.
    const { advisories, ...withoutAdvisories } = parsed.report;
    expect(advisories?.map((a) => [a.code, a.sourceRef])).toEqual([
      ['ZERO_DURATION_TASK', 'A7550'],
    ]);
    // #542 changed one drop's wording and nothing else: hours-per-day IS imported, so the calendar
    // drop stopped claiming it was not. The report is hashed with the M0 wording put back, so any
    // OTHER change still moves the digest.
    const calendarDrop = withoutAdvisories.drops.find((d) =>
      d.detail.includes('base-calendar inheritance'),
    );
    expect(calendarDrop?.detail).toContain('(hours-per-week, base-calendar inheritance)');
    const m0Wording = JSON.parse(
      JSON.stringify(withoutAdvisories).replace(
        '(hours-per-week, base-calendar',
        '(hours-per-day/-week, base-calendar',
      ),
    ) as unknown;
    expect({
      tortureGraphDigest: digest(parsed.graph),
      tortureReportDigest: digest(m0Wording),
    }).toEqual(BASELINE);
  });

  it('an import opens with no row overlap on the canvas, and the same file lays out the same way twice (FC-5)', () => {
    // M0-T4 measured 8 to 23 overlapping activities on the torture file and 2 on the NetPoint
    // re-import, because phase 3 packed EARLY dates and broke ties on random ids.
    expect(overlappingActivities(foreign)).toBe(0);
    expect(overlappingActivities(reimported)).toBe(0);
    const again = lanesByCode(foreignAgain);
    const moved = Object.entries(lanesByCode(foreign))
      .filter(([code, lane]) => again[code] !== lane)
      .map(([code, lane]) => `${code}: ${String(lane)} vs ${String(again[code])}`);
    expect(moved).toEqual([]);
  });

  describe('a SchedulePoint XER carrying its layout (M2)', () => {
    const differ = (side: Side, field: keyof Row, codes = [...source.rows.keys()]): string[] =>
      codes.filter((code) => side.rows.get(code)?.[field] !== source.rows.get(code)?.[field]);

    it('restores every placement and row, and writes no row in phase 3 (carried)', () => {
      expect(differ(restored, 'visualStart')).toEqual([]);
      expect(differ(restored, 'laneIndex')).toEqual([]);
      expect(differ(restored, 'visualEffectiveStart')).toEqual([]);
      expect(differ(restored, 'visualConflictReason')).toEqual([]);
      const placed = [...source.rows.values()].filter((r) => r.visualStart !== null).length;
      expect(restoredReport.mapped).toMatchObject({ placements: placed, lanes: source.rows.size });
      // Phase 3 wrote nothing: no activity's version moved past the one the import created it at.
      expect(new Set([...restored.rows.values()].map((r) => r.version))).toEqual(new Set([1]));
    });

    it('the dry-run reports the same counts the commit restores', () => {
      expect(dryRunReport.mapped).toMatchObject({
        placements: restoredReport.mapped.placements,
        lanes: restoredReport.mapped.lanes,
      });
    });

    it('keeps every carried row and places only the rest around them (partial, FC-3)', () => {
      const carried = [...source.rows.keys()].filter((code) => !partialOmitted.includes(code));
      expect(differ(partial, 'laneIndex', carried)).toEqual([]);
      expect(overlappingActivities(partial)).toBe(overlappingActivities(source));
    });

    it('IGNORE imports the network as a foreign file would, and says what it left out', () => {
      expect([...ignored.rows.values()].filter((r) => r.visualStart !== null)).toEqual([]);
      expect(lanesByCode(ignored)).toEqual(lanesByCode(stripped));
      expect(ignoredReport.mapped.placements).toBeUndefined();
      expect(ignoredReport.drops.map((f) => f.detail)).toContain(
        `The file carries a SchedulePoint layout for ${String(source.rows.size)} activities; it was not applied`,
      );
    });

    it('names a restored placement the logic no longer allows, and carried rows that overlap', () => {
      expect(conflictedSide.rows.get(conflictedCodes.early)?.visualConflictReason).not.toBeNull();
      const [a, b] = conflictedCodes.stacked;
      expect(conflictedSide.rows.get(b)?.laneIndex).toBe(conflictedSide.rows.get(a)?.laneIndex);
      const details = conflicted.approximations.map((f) => f.detail);
      expect(details).toContainEqual(
        expect.stringMatching(/^\d+ restored placed starts? (is|are) no longer allowed/),
      );
      expect(details).toContainEqual(
        expect.stringMatching(
          /^\d+ activit(y|ies) overlaps? another in (its|their) lane — Arrange/,
        ),
      );
    });

    it('refuses an unknown restoreLayout value', () => {
      expect(badOption.status).toBe(422);
    });
  });

  describe('a SchedulePoint XER carrying swimlanes (M4-T4)', () => {
    const byName = (side: SwimlaneSide): Map<string, string> =>
      new Map(side.swimlanes.map((l) => [l.name, l.id]));
    const membersOf = (side: SwimlaneSide, name: string): string[] =>
      [...side.side.rows.values()]
        .filter((r) => r.swimlaneId === byName(side).get(name))
        .map((r) => r.code)
        .sort();

    it('creates the swimlanes by name, in the file’s order, and sets the source', () => {
      expect(swimlaned.swimlanes.map((l) => [l.name, l.position])).toEqual([
        ['Civil', 0],
        ['Mechanical', 1],
        ['Empty', 2],
      ]);
      expect(swimlaned.source).toBe('MANUAL');
    });

    it('puts each activity in its swimlane, case variants in the one swimlane', () => {
      expect(membersOf(swimlaned, 'Civil')).toEqual([...swimlanedPlan.civil].sort());
      expect(membersOf(swimlaned, 'Mechanical')).toEqual([...swimlanedPlan.mechanical].sort());
      expect(membersOf(swimlaned, 'Empty')).toEqual([]);
      const assigned = new Set([...swimlanedPlan.civil, ...swimlanedPlan.mechanical]);
      const stray = [...swimlaned.side.rows.values()].filter(
        (r) => r.swimlaneId !== null && !assigned.has(r.code),
      );
      expect(stray.map((r) => r.code)).toEqual([]);
    });

    it('counts what it created and what it refused, once each', () => {
      expect(swimlaned.report.mapped).toMatchObject({
        swimlanes: 3,
        swimlaneMembers: swimlanedPlan.civil.length + swimlanedPlan.mechanical.length,
      });
      const repairs = swimlaned.report.repairs.map((f) => f.detail);
      expect(repairs).toContain(
        '1 swimlane name(s) matched an earlier name ignoring case and were merged into it',
      );
      expect(repairs).toContain(
        '2 swimlane name(s) were not 1 to 80 characters without control characters and were discarded',
      );
    });

    it('the dry-run reports the counts the commit produced', () => {
      expect(swimlanedDry.mapped).toMatchObject({
        swimlanes: swimlaned.report.mapped.swimlanes,
        swimlaneMembers: swimlaned.report.mapped.swimlaneMembers,
      });
    });

    it('keeps the lane the file carried and packs the rest inside their swimlane', () => {
      const laneIn = (code: string, name: string): number | undefined =>
        swimlaned.side.rows
          .get(code)
          ?.swimlaneLanes.find(
            (l) => l.basis === 'SWIMLANE' && l.swimlaneId === byName(swimlaned).get(name),
          )?.laneIndex;
      expect(laneIn(swimlanedPlan.carriedCode, 'Civil')).toBe(swimlanedPlan.carriedLane);
      // Every drawn member has a stored lane, and no two members of one swimlane share a lane while
      // overlapping in time.
      for (const name of ['Civil', 'Mechanical']) {
        const members = membersOf(swimlaned, name);
        const stored = members.map((code) => ({ code, lane: laneIn(code, name) }));
        expect(stored.filter((m) => m.lane === undefined)).toEqual([]);
        const rows = members.map((code) => {
          const r = swimlaned.side.rows.get(code)!;
          return { ...r, laneIndex: laneIn(code, name) ?? -1 };
        });
        expect(
          overlappingCodes({ ...swimlaned.side, rows: new Map(rows.map((r) => [r.code, r])) }),
        ).toEqual([]);
      }
    });

    it('leaves the swimlane-free picture exactly as a file without swimlanes would', () => {
      expect(overlappingActivities(swimlaned.side)).toBe(0);
      expect(lanesByCode(swimlaned.side)).toEqual(lanesByCode(stripped));
    });

    it('creates none of it when the planner declines the layout', () => {
      expect(swimlanedIgnored.swimlanes).toEqual([]);
      expect(swimlanedIgnored.source).toBe('NONE');
      expect([...swimlanedIgnored.side.rows.values()].filter((r) => r.swimlaneId !== null)).toEqual(
        [],
      );
      expect(swimlanedIgnored.report.mapped.swimlanes).toBeUndefined();
    });

    it('keeps the first 100 names and reports the rest, instead of aborting the import', () => {
      expect(swimlanedClipped.swimlanes).toHaveLength(100);
      expect(swimlanedClipped.swimlanes.at(-1)?.name).toBe('Lane 100');
      expect(swimlanedClipped.report.repairs.map((f) => f.detail)).toContain(
        '1 swimlane name(s) past the limit of 100 were not imported',
      );
    });
  });

  describe('an exported SchedulePoint XER (M3)', () => {
    it('carries the layout tables', () => {
      expect(exportedHasLayout).toBe(true);
    });

    it('an edited-elsewhere file keeps every carried row, places the new activity, and reports the corrupt value (FC-3)', () => {
      // Every activity that still carried a row is exactly where the source had it.
      const carried = [...source.rows.keys()].filter((code) => code !== editedCorrupt);
      const moved = carried.filter(
        (code) => edited.rows.get(code)?.laneIndex !== source.rows.get(code)?.laneIndex,
      );
      expect(moved).toEqual([]);
      // The new activity is in a row free at its drawn span.
      expect(edited.rows.has(editedNew)).toBe(true);
      expect(overlappingCodes(edited)).not.toContain(editedNew);
      // The activity whose lane value was corrupted lost only that value: its placement is restored,
      // and it was given a lane free at its drawn span like any activity the file left without one.
      expect(edited.rows.get(editedCorrupt)?.visualStart).toBe(
        source.rows.get(editedCorrupt)?.visualStart,
      );
      expect(overlappingCodes(edited)).not.toContain(editedCorrupt);
      // The conflict count reported equals the engine's among restored placements.
      const conflicting = [...edited.rows.values()].filter(
        (r) => r.visualStart !== null && r.visualConflictReason !== null,
      ).length;
      const finding = editedReport.approximations.find((f) =>
        /restored placed starts? (is|are) no longer allowed/.test(f.detail),
      );
      if (conflicting === 0) expect(finding).toBeUndefined();
      else expect(finding?.detail).toMatch(new RegExp(`^${String(conflicting)} `));
      // One repair for the corrupt value.
      expect(
        editedReport.repairs.filter((f) =>
          /lane value\(s\) were not a whole number/.test(f.detail),
        ),
      ).toHaveLength(1);
    });
  });

  /**
   * The exported file with SchedulePoint's layout fields injected from the SOURCE plan's rows, keyed
   * through the file's own TASK/PROJWBS ids. `keep(code)` decides which activities carry a row;
   * `override` replaces a value, for the cases that need a picture the source does not have.
   */
  function withLayout(
    file: Buffer,
    from: Side,
    keep: (code: string) => boolean,
    override: Record<string, { placedStart?: string; lane?: number }> = {},
  ): Buffer {
    const parsed = parseXer(new Uint8Array(file));
    if (!parsed.ok) throw new Error('the export did not parse');
    const project = parsed.document.tables.get('PROJECT')!.rows[0]!.get('proj_id')!;
    const ids = new Map<string, { id: string; type: string }>();
    for (const row of parsed.document.tables.get('TASK')?.rows ?? []) {
      ids.set(row.get('task_code')!, { id: row.get('task_id')!, type: 'TASK' });
    }
    for (const row of parsed.document.tables.get('PROJWBS')?.rows ?? []) {
      ids.set(row.get('wbs_short_name')!, { id: `wbs:${row.get('wbs_id')!}`, type: 'WBS_SUMMARY' });
    }
    const activities = [...from.rows.values()].flatMap((r) => {
      const target = ids.get(r.code);
      if (target === undefined) return [];
      const o = override[r.code] ?? {};
      return [
        {
          id: target.id,
          type: target.type as 'TASK',
          layout: {
            placedStart: o.placedStart ?? r.visualStart,
            lane: keep(r.code) ? (o.lane ?? r.laneIndex) : null,
          },
        },
      ];
    });
    // The export writes its own layout tables since M3; replace them rather than add a second pair.
    const text = stripLayoutTables(file.toString('utf8'));
    const tables = encodeLayoutFields(activities, project)
      .map((t) =>
        [
          `%T\t${t.name}`,
          `%F\t${t.fields.join('\t')}`,
          ...t.rows.map((row) => `%R\t${t.fields.map((f) => row[f] ?? '').join('\t')}`),
        ].join('\n'),
      )
      .join('\n');
    const end = text.lastIndexOf('%E');
    return Buffer.from(`${text.slice(0, end)}${tables}\n${text.slice(end)}`, 'utf8');
  }

  /**
   * The swimlane picture M4-T4's file carries, chosen from the source plan's own activities: six in
   * `Civil` (one spelled `CIVIL`, one with a carried lane), four in `Mechanical`, an empty `Empty`, and
   * two whose names the database would refuse (81 characters; a control character).
   */
  function planSwimlanes(from: Side): SwimlanePlan {
    const codes = [...from.rows.values()]
      .filter((r) => r.type !== 'WBS_SUMMARY' && r.visualEffectiveStart !== null)
      .map((r) => r.code)
      .sort();
    const civil = codes.slice(0, 6);
    const mechanical = codes.slice(6, 10);
    const assign: Record<string, string> = {};
    civil.forEach((code, i) => {
      assign[code] = i === 1 ? 'CIVIL' : 'Civil';
    });
    for (const code of mechanical) assign[code] = 'Mechanical';
    assign[codes[10]!] = 'x'.repeat(81);
    assign[codes[11]!] = 'Bad\u0007Name';
    return {
      names: ['Civil', 'Mechanical', 'Empty'],
      assign,
      lanes: { [civil[0]!]: 5 },
      civil,
      mechanical,
      carriedCode: civil[0]!,
      carriedLane: 5,
    };
  }

  /**
   * The exported file with SchedulePoint's swimlane fields injected, keyed through the file's own TASK
   * ids and replacing the layout tables the export writes. `names` is the project field's ordered list.
   */
  function withSwimlaneFields(
    file: Buffer,
    plan: { names: string[]; assign: Record<string, string>; lanes: Record<string, number> },
  ): Buffer {
    const parsed = parseXer(new Uint8Array(file));
    if (!parsed.ok) throw new Error('the export did not parse');
    const project = parsed.document.tables.get('PROJECT')!.rows[0]!.get('proj_id')!;
    const taskIds = new Map<string, string>();
    for (const row of parsed.document.tables.get('TASK')?.rows ?? []) {
      taskIds.set(row.get('task_code')!, row.get('task_id')!);
    }
    const value = (typeId: string, fk: string, number: string, text: string): string =>
      ['%R', typeId, fk, project, '', number, text, ''].join('\t');
    const rows = [
      value('3', project, '', JSON.stringify({ source: 'MANUAL', level: null, names: plan.names })),
      ...Object.entries(plan.assign).map(([code, name]) =>
        value('1', taskIds.get(code)!, '', name),
      ),
      ...Object.entries(plan.lanes).map(([code, lane]) =>
        value('2', taskIds.get(code)!, String(lane), ''),
      ),
    ];
    const tables = [
      '%T\tUDFTYPE',
      '%F\tudf_type_id\ttable_name\tudf_type_name\tudf_type_label\tlogical_data_type',
      '%R\t1\tTASK\tuser_field_sp_1\tSchedulePoint layout v1: swimlane\tFT_TEXT',
      '%R\t2\tTASK\tuser_field_sp_2\tSchedulePoint layout v1: swimlane lane\tFT_INT',
      '%R\t3\tPROJECT\tuser_field_sp_3\tSchedulePoint layout v1: swimlanes\tFT_TEXT',
      '%T\tUDFVALUE',
      '%F\tudf_type_id\tfk_id\tproj_id\tudf_date\tudf_number\tudf_text\tudf_code_id',
      ...rows,
    ].join('\n');
    const text = stripLayoutTables(file.toString('utf8'));
    const end = text.lastIndexOf('%E');
    return Buffer.from(`${text.slice(0, end)}${tables}\n${text.slice(end)}`, 'utf8');
  }

  /**
   * FC-3's edits, made to the exported text the way P6 would leave them: `B_ERECT` (on the critical
   * spine) takes twice its hours, a new `TASK` row arrives with no layout values, and the first row
   * value is overwritten with something that is not a number.
   */
  function editInP6(text: string): { text: string; corruptCode: string; newCode: string } {
    const lines = text.split('\n');
    const fieldsOf = (table: string): string[] => {
      const at = lines.indexOf(`%T\t${table}`);
      return lines[at + 1]!.split('\t').slice(1);
    };
    const task = fieldsOf('TASK');
    const col = (name: string): number => task.indexOf(name) + 1;
    const taskRows = lines.filter(
      (l, i) => l.startsWith('%R\t') && lastTableBefore(lines, i) === 'TASK',
    );
    const erect = taskRows.find((l) => l.split('\t')[col('task_code')] === 'B_ERECT')!;
    const erectCells = erect.split('\t');
    erectCells[col('target_drtn_hr_cnt')] = String(
      Number(erectCells[col('target_drtn_hr_cnt')]) * 2,
    );
    lines[lines.indexOf(erect)] = erectCells.join('\t');
    // The new activity: a copy of B_ERECT under a fresh id and code, with no layout values.
    const added = [...erectCells];
    added[col('task_id')] = '999999';
    added[col('task_code')] = 'P6_NEW';
    added[col('task_name')] = 'Added in P6';
    lines.splice(lines.indexOf(erectCells.join('\t')) + 1, 0, added.join('\t'));
    // Corrupt the first row value.
    const udfv = fieldsOf('UDFVALUE');
    const vcol = (name: string): number => udfv.indexOf(name) + 1;
    const taskIdCol = col('task_id');
    const firstRow = lines.findIndex(
      (l, i) =>
        l.startsWith('%R\t') &&
        lastTableBefore(lines, i) === 'UDFVALUE' &&
        l.split('\t')[vcol('udf_number')] !== '',
    );
    const cells = lines[firstRow]!.split('\t');
    const fk = cells[vcol('fk_id')]!;
    cells[vcol('udf_number')] = 'not-a-row';
    lines[firstRow] = cells.join('\t');
    const owner = taskRows.find((l) => l.split('\t')[taskIdCol] === fk);
    if (owner === undefined) throw new Error('the first row value is not on a TASK');
    return {
      text: lines.join('\n'),
      corruptCode: owner.split('\t')[col('task_code')]!,
      newCode: 'P6_NEW',
    };
  }

  function lastTableBefore(lines: string[], index: number): string | undefined {
    for (let i = index; i >= 0; i -= 1) {
      if (lines[i]!.startsWith('%T\t')) return lines[i]!.slice(3);
    }
    return undefined;
  }

  /** The XER text without its `UDFTYPE`/`UDFVALUE` blocks: what a file from another tool looks like. */
  function stripLayoutTables(text: string): string {
    return text.replace(/%T\t(UDFTYPE|UDFVALUE)\n[\s\S]*?(?=%T\t|%E)/g, '');
  }

  /** Two drawn activities that overlap in time and sit in different rows in the source. */
  function overlappingPairInDifferentRows(rows: Row[]): [string, string] {
    for (const a of rows) {
      for (const b of rows) {
        if (a.code >= b.code || a.laneIndex === b.laneIndex) continue;
        if (
          a.visualEffectiveStart! <= b.visualEffectiveFinish! &&
          b.visualEffectiveStart! <= a.visualEffectiveFinish!
        ) {
          return [a.code, b.code];
        }
      }
    }
    throw new Error('the NetPoint plan has no two overlapping activities in different rows');
  }

  /** Children before parents; the database is shared with every other e2e file. */
  async function resetDatabase(): Promise<void> {
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.activityDependency.deleteMany();
    await prisma.note.deleteMany();
    await prisma.crossPlanDependency.deleteMany();
    await clearActivityTree(prisma);
    // RESTRICT from activities and lane rows, both gone by now; before the plan (swimlanes M4-T4).
    await prisma.swimlane.deleteMany();
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
