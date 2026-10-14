import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';

import { configureHttpApp } from '../src/app-setup';
import { EXPORT_FILES, csvPath, jsonPath } from '../src/modules/organization-export/export-columns';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';
import { resetThrottleCounters } from './throttle-reset';

/**
 * **The whole-organisation export, end to end (ADR-0194 M2)**: the real route, a real database, the
 * ZIP read back with an independent reader (`yauzl`, which also checks every entry's CRC).
 *
 * The fixture is built through the public REST API (ADR-0066) wherever the API can make the row, and
 * directly only for the three `records-*` tables, which are written by one-off migrations and have no
 * route. Each test names the defect it guards: a test that only checked "some files exist" would pass
 * for an export that leaked another organisation or dropped a table, so the completeness test compares
 * every file's rows to a count taken from the database by a different path than the export uses.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EXPORT_URL = '/api/v1/organizations/acme/export';
const MAX_DECIMAL = '99999999999999.9999';
const BIG_COST = 9007199254740993n; // 2^53 + 1: not representable as a JS number
const FORMULA = '=HYPERLINK("http://example.invalid/steal","click")';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
  email: string;
}

interface Fixture {
  admin: Actor;
  organizationId: string;
  other: { admin: Actor; organizationId: string; markers: string[] };
  invitationTokens: string[];
}

type Json = Record<string, unknown>;

describe.skipIf(!hasDatabase)('Organisation export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerStorage: ThrottlerStorage;

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
    // A real socket: the abort test needs a connection it can half-read and then drop.
    await app.listen(0);
    prisma = app.get(Token);
    throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
  }, 60_000);

  afterAll(async () => {
    await clearDomainData(prisma).catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    // Isolation, not a weakened bound (`throttle-reset.ts`): the throttle test below runs its own
    // four requests under the real limit.
    resetThrottleCounters(throttlerStorage);
    await clearDomainData(prisma);
  });

  const server = () => app.getHttpServer();

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id, email };
  }

  const data = <T = Json>(res: request.Response): T => (res.body as { data: T }).data;

  async function createOrg(actor: Actor, name: string): Promise<string> {
    return data<{ id: string }>(
      await actor.agent.post('/api/v1/organizations').send({ name }).expect(201),
    ).id;
  }

  /** One client → project → plan chain in `slug`, returning the ids. */
  async function createPlanChain(
    actor: Actor,
    slug: string,
    names: { client: string; project: string; plan: string },
  ): Promise<{ clientId: string; projectId: string; planId: string }> {
    const base = `/api/v1/organizations/${slug}`;
    const clientId = data<{ id: string }>(
      await actor.agent.post(`${base}/clients`).send({ name: names.client }).expect(201),
    ).id;
    const projectId = data<{ id: string }>(
      await actor.agent
        .post(`${base}/clients/${clientId}/projects`)
        .send({ name: names.project })
        .expect(201),
    ).id;
    const planId = data<{ id: string }>(
      await actor.agent
        .post(`${base}/projects/${projectId}/plans`)
        .send({ name: names.plan, plannedStart: '2026-03-02' })
        .expect(201),
    ).id;
    return { clientId, projectId, planId };
  }

  async function createActivity(
    actor: Actor,
    slug: string,
    planId: string,
    name: string,
  ): Promise<{ id: string; version: number }> {
    return data<{ id: string; version: number }>(
      await actor.agent
        .post(`/api/v1/organizations/${slug}/plans/${planId}/activities`)
        .send({ name })
        .expect(201),
    );
  }

  /**
   * An organisation with a row in every one of the 28 exported tables, and a second organisation
   * beside it whose every name carries a marker the export must never contain.
   */
  async function seedFixture(): Promise<Fixture> {
    const admin = await signUp('admin@example.com');
    const organizationId = await createOrg(admin, 'Acme');
    const base = '/api/v1/organizations/acme';

    // — Another organisation, with its own admin, hierarchy, activity, note and audit trail. -------
    const otherAdmin = await signUp('other-admin@example.com');
    const otherOrgId = await createOrg(otherAdmin, 'Other Co');
    const otherChain = await createPlanChain(otherAdmin, 'other-co', {
      client: 'OTHER-ORG-CLIENT-MARKER',
      project: 'OTHER-ORG-PROJECT-MARKER',
      plan: 'OTHER-ORG-PLAN-MARKER',
    });
    const otherActivity = await createActivity(
      otherAdmin,
      'other-co',
      otherChain.planId,
      'OTHER-ORG-ACTIVITY-MARKER',
    );
    await otherAdmin.agent
      .post(`/api/v1/organizations/other-co/plans/${otherChain.planId}/notes`)
      .send({ body: 'OTHER-ORG-NOTE-MARKER' })
      .expect(201);

    // — Members: one of each role, and one removed. ------------------------------------------------
    const planner = await signUp('planner@example.com');
    const contributor = await signUp('contributor@example.com');
    const viewer = await signUp('viewer@example.com');
    const removed = await signUp('removed@example.com');
    for (const [actor, role] of [
      [planner, 'PLANNER'],
      [contributor, 'CONTRIBUTOR'],
      [viewer, 'VIEWER'],
      [removed, 'VIEWER'],
    ] as const) {
      await prisma.orgMember.create({
        data: { organizationId, userId: actor.userId, role },
      });
    }
    const roster = data<{ id: string; user: { email: string } }[]>(
      await admin.agent.get(`${base}/members`).expect(200),
    );
    const removedMember = roster.find((m) => m.user.email === removed.email)!;
    await admin.agent.delete(`${base}/members/${removedMember.id}`).expect(204);

    // — Invitations: one pending, one revoked. -----------------------------------------------------
    const invitationTokens: string[] = [];
    for (const email of ['pending@example.com', 'revoked@example.com']) {
      const res = await admin.agent
        .post(`${base}/invitations`)
        .send({ email, role: 'VIEWER' })
        .expect(201);
      invitationTokens.push(
        new URL(data<{ acceptUrl: string }>(res).acceptUrl).searchParams.get('token') ?? '',
      );
    }
    const invitations = data<{ id: string; email: string }[]>(
      await admin.agent.get(`${base}/invitations`).expect(200),
    );
    await admin.agent
      .delete(
        `${base}/invitations/${invitations.find((i) => i.email === 'revoked@example.com')!.id}`,
      )
      .expect(204);

    // — Hierarchy, work and logic. -----------------------------------------------------------------
    const chain = await createPlanChain(admin, 'acme', {
      client: 'ACME-CLIENT-MARKER',
      project: 'ACME-PROJECT-MARKER',
      plan: 'ACME-PLAN-MARKER',
    });
    const upstream = await createPlanChain(admin, 'acme', {
      client: 'ACME-UPSTREAM-CLIENT',
      project: 'ACME-UPSTREAM-PROJECT',
      plan: 'ACME-UPSTREAM-PLAN',
    });
    const a = await createActivity(admin, 'acme', chain.planId, 'Excavate');
    const b = await createActivity(admin, 'acme', chain.planId, 'Foundations');
    const c = await createActivity(admin, 'acme', chain.planId, 'Frame');
    const u = await createActivity(admin, 'acme', upstream.planId, 'Deliver steel');
    for (const [from, to] of [
      [a, b],
      [b, c],
    ] as const) {
      await admin.agent
        .post(`${base}/plans/${chain.planId}/dependencies`)
        .send({ predecessorId: from.id, successorId: to.id, type: 'FS', lagMinutes: 0 })
        .expect(201);
    }
    await admin.agent
      .post(`${base}/cross-plan-dependencies`)
      .send({ predecessorActivityId: u.id, successorActivityId: a.id, lagDays: 2 })
      .expect(201);

    // — Calendar exception with a window, resources, assignments, steps, notes, history. -----------
    const calendars = data<{ id: string }[]>(
      await admin.agent.get(`${base}/calendars`).expect(200),
    );
    await admin.agent
      .post(`${base}/calendars/${calendars[0]!.id}/exceptions`)
      .send({
        date: '2026-12-24',
        label: 'Christmas Eve, morning only',
        windows: [{ startMinute: 480, endMinute: 720 }],
      })
      .expect(201);
    const resource = data<{ id: string }>(
      await admin.agent
        .post(`${base}/resources`)
        .send({ name: 'Crane crew', kind: 'LABOUR', costPerUnit: 52.375 })
        .expect(201),
    );
    await admin.agent
      .post(`${base}/activities/${a.id}/assignments`)
      .send({ resourceId: resource.id, budgetedUnits: 8 })
      .expect(201);
    // An edit after creation, so the activity has a history entry and a fresh version for the steps.
    const edited = data<{ version: number }>(
      await admin.agent
        .patch(`${base}/activities/${a.id}`)
        .send({ version: a.version, name: 'Excavate site' })
        .expect(200),
    );
    await admin.agent
      .put(`${base}/activities/${a.id}/steps`)
      .send({
        version: edited.version,
        steps: [
          { name: 'Strip topsoil', weight: 1, percentComplete: 100 },
          { name: 'Dig', weight: 3, percentComplete: 25 },
        ],
      })
      .expect(200);
    await admin.agent
      .post(`${base}/plans/${chain.planId}/notes`)
      .send({ body: FORMULA })
      .expect(201);
    await admin.agent
      .post(`${base}/activities/${b.id}/notes`)
      .send({ body: 'ACME-ACTIVITY-NOTE, with a "quote",\nand a line break' })
      .expect(201);
    await admin.agent
      .post(`${base}/plans/${chain.planId}/shares`)
      .send({ label: 'ACME-SHARE-LABEL' })
      .expect(201);
    const revokedShare = data<{ share: { id: string } }>(
      await admin.agent
        .post(`${base}/plans/${chain.planId}/shares`)
        .send({ label: 'ACME-REVOKED-SHARE' })
        .expect(201),
    );
    await admin.agent
      .delete(`${base}/plans/${chain.planId}/shares/${revokedShare.share.id}`)
      .expect(204);
    // A baseline snapshots computed dates, so the plan is calculated first.
    await admin.agent
      .post(`${base}/plans/${chain.planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    await admin.agent
      .post(`${base}/plans/${chain.planId}/baselines`)
      .send({ name: 'ACME-BASELINE' })
      .expect(201);

    // — A plan in the recycle bin, with its own activity. ------------------------------------------
    const binned = await createPlanChain(admin, 'acme', {
      client: 'ACME-BINNED-CLIENT',
      project: 'ACME-BINNED-PROJECT',
      plan: 'ACME-BINNED-PLAN',
    });
    await createActivity(admin, 'acme', binned.planId, 'Binned activity');
    await admin.agent.delete(`${base}/plans/${binned.planId}`).expect(204);

    // — Exact-value probes the type test reads back. -----------------------------------------------
    await prisma.resource.update({
      where: { id: resource.id },
      data: { costPerUnit: new Prisma.Decimal(MAX_DECIMAL) },
    });
    await prisma.activity.update({ where: { id: c.id }, data: { budgetedExpense: BIG_COST } });

    // — The three records written by one-off migrations (no route makes them). ---------------------
    await prisma.placementMigration.create({
      data: {
        organizationId,
        planId: chain.planId,
        activityId: a.id,
        activityName: 'Excavate',
        priorConstraintType: 'SNET',
        priorConstraintDate: new Date('2026-03-09T00:00:00.000Z'),
      },
    });
    await prisma.fmDateMigration.create({
      data: {
        organizationId,
        planId: chain.planId,
        activityId: c.id,
        activityName: 'Frame',
        priorVisualStart: new Date('2026-03-16T00:00:00.000Z'),
      },
    });
    const cross = await prisma.crossPlanDependency.findFirstOrThrow({ where: { organizationId } });
    await prisma.crossPlanLagMigration.create({
      data: {
        organizationId,
        planId: chain.planId,
        crossPlanDependencyId: cross.id,
        lagCalendar: 'PROJECT_DEFAULT',
        dayFactorMinutes: 480,
        priorLagMinutes: 960,
        newLagMinutes: 960,
      },
    });

    return {
      admin,
      organizationId,
      invitationTokens,
      other: {
        admin: otherAdmin,
        organizationId: otherOrgId,
        markers: [
          otherOrgId,
          otherAdmin.userId,
          otherAdmin.email,
          otherChain.clientId,
          otherChain.projectId,
          otherChain.planId,
          otherActivity.id,
          'OTHER-ORG',
          'Other Co',
          'other-co',
        ],
      },
    };
  }

  /** The `Buffer` body of a binary response; superagent only buffers text types by itself. */
  const binary = (
    res: IncomingMessage & NodeJS.ReadableStream,
    done: (error: Error | null, body: Buffer) => void,
  ): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  };

  async function download(actor: Actor, slug = 'acme'): Promise<request.Response> {
    return actor.agent
      .post(`/api/v1/organizations/${slug}/export`)
      .buffer(true)
      .parse(binary as never);
  }

  /** Every entry of a ZIP, by name. `yauzl` verifies each entry's CRC-32 and size while reading. */
  function unzip(buffer: Buffer): Promise<Map<string, Buffer>> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
        if (error) return reject(error);
        const files = new Map<string, Buffer>();
        zip.on('error', reject);
        zip.on('end', () => resolve(files));
        zip.on('entry', (entry: yauzl.Entry) => {
          zip.openReadStream(entry, (openError, stream) => {
            if (openError) return reject(openError);
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => {
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      });
    });
  }

  async function exportOf(actor: Actor): Promise<{ raw: Buffer; files: Map<string, Buffer> }> {
    const res = await download(actor);
    expect(res.status).toBe(200);
    const raw = res.body as Buffer;
    return { raw, files: await unzip(raw) };
  }

  const text = (files: Map<string, Buffer>, path: string): string => {
    const file = files.get(path);
    if (file === undefined) throw new Error(`${path} is not in the archive`);
    return file.toString('utf8');
  };

  const jsonRows = (files: Map<string, Buffer>, path: string): Json[] =>
    JSON.parse(text(files, path)) as Json[];

  /** An RFC 4180 reader, written here so the test does not trust the code that wrote the file. */
  function csvRecords(source: string): string[][] {
    const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const records: string[][] = [];
    let field = '';
    let record: string[] = [];
    let quoted = false;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i]!;
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        record.push(field);
        field = '';
      } else if (ch === '\r' && input[i + 1] === '\n') {
        record.push(field);
        records.push(record);
        field = '';
        record = [];
        i += 1;
      } else field += ch;
    }
    if (field !== '' || record.length > 0) {
      record.push(field);
      records.push(record);
    }
    return records;
  }

  const csvRows = (files: Map<string, Buffer>, path: string): Record<string, string>[] => {
    const [header, ...rows] = csvRecords(text(files, path));
    return rows.map((row) => Object.fromEntries(header!.map((name, i) => [name, row[i] ?? ''])));
  };

  const everything = (files: Map<string, Buffer>): string =>
    [...files.values()].map((f) => f.toString('utf8')).join('\n');

  /** The audit rows of one action for an organisation, waiting for the write that follows the stream. */
  async function auditRows(organizationId: string, count: number) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const rows = await prisma.auditEvent.findMany({
        where: { organizationId, action: 'privacy.exported' },
        orderBy: { occurredAt: 'asc' },
      });
      if (rows.length >= count || Date.now() > deadline) return rows;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  it('is complete: every file holds exactly the rows the database holds, and the manifest agrees', async () => {
    const { admin, organizationId } = await seedFixture();

    // The database's own count for each file, taken before the export runs (the export records
    // itself in the audit log afterwards, so a count taken later would include its own row) and
    // without the export's readers.
    const planIds = (await prisma.plan.findMany({ where: { organizationId } })).map((p) => p.id);
    const calendarIds = (await prisma.calendar.findMany({ where: { organizationId } })).map(
      (c) => c.id,
    );
    const exceptionIds = (
      await prisma.calendarException.findMany({ where: { organizationId } })
    ).map((e) => e.id);
    const where = { organizationId };
    const expected: Record<string, number> = {
      people: await prisma.user.count({ where: { memberships: { some: where } } }),
      organization: 1,
      members: await prisma.orgMember.count({ where }),
      invitations: await prisma.invitation.count({ where }),
      clients: await prisma.client.count({ where }),
      projects: await prisma.project.count({ where }),
      plans: await prisma.plan.count({ where }),
      activities: await prisma.activity.count({ where }),
      dependencies: await prisma.activityDependency.count({ where }),
      'cross-plan-dependencies': await prisma.crossPlanDependency.count({ where }),
      calendars: await prisma.calendar.count({ where }),
      'calendar-exceptions': await prisma.calendarException.count({ where }),
      'calendar-shifts': await prisma.calendarShift.count({
        where: { calendarId: { in: calendarIds } },
      }),
      'calendar-exception-windows': await prisma.calendarExceptionWindow.count({
        where: { calendarExceptionId: { in: exceptionIds } },
      }),
      baselines: await prisma.baseline.count({ where }),
      'baseline-activities': await prisma.baselineActivity.count({ where }),
      'baseline-assignments': await prisma.baselineAssignment.count({ where }),
      'baseline-dependencies': await prisma.baselineDependency.count({ where }),
      shares: await prisma.planShare.count({ where }),
      'records-placement-migrations': await prisma.placementMigration.count({ where }),
      'records-finish-milestone-dates': await prisma.fmDateMigration.count({ where }),
      'records-cross-plan-lags': await prisma.crossPlanLagMigration.count({ where }),
      resources: await prisma.resource.count({ where }),
      assignments: await prisma.resourceAssignment.count({ where }),
      'activity-steps': await prisma.activityStep.count({ where }),
      'activity-history': await prisma.activityHistoryEntry.count({ where }),
      notes: await prisma.note.count({ where }),
      'audit-events': await prisma.auditEvent.count({ where }),
    };
    const { files } = await exportOf(admin);
    expect(planIds.length).toBeGreaterThan(1);
    expect(Object.keys(expected).sort()).toEqual(EXPORT_FILES.map((f) => f.file).sort());

    const manifest = JSON.parse(text(files, 'manifest.json')) as {
      files: {
        path: string;
        file: string;
        kind: string;
        rows: number;
        bytes: number;
        sha256: string;
      }[];
    };
    for (const file of EXPORT_FILES) {
      const want = expected[file.file]!;
      // A fixture that leaves a table empty would let that table's export pass vacuously.
      expect(want, `${file.file} has a row in the fixture`).toBeGreaterThan(0);

      expect(jsonRows(files, jsonPath(file)), `${file.file} json`).toHaveLength(want);
      expect(csvRows(files, csvPath(file)), `${file.file} csv`).toHaveLength(want);
      for (const path of [jsonPath(file), csvPath(file)]) {
        const entry = manifest.files.find((f) => f.path === path);
        const bytes = files.get(path)!;
        expect(entry, `${path} is listed`).toBeDefined();
        expect(entry!.rows, `${path} rows`).toBe(want);
        expect(entry!.bytes, `${path} bytes`).toBe(bytes.length);
        expect(entry!.sha256, `${path} sha256`).toBe(
          createHash('sha256').update(bytes).digest('hex'),
        );
      }
    }
    expect([...files.keys()].sort()).toEqual(
      [
        'README.txt',
        'manifest.json',
        ...EXPORT_FILES.flatMap((f) => [jsonPath(f), csvPath(f)]),
      ].sort(),
    );
    expect(manifest.files).toHaveLength(EXPORT_FILES.length * 2);

    // The recycle bin, the member who left and the withdrawn invitation are in it.
    expect(jsonRows(files, 'json/plans.json').filter((p) => p.deletedAt !== null)).toHaveLength(1);
    expect(jsonRows(files, 'json/members.json').filter((m) => m.deletedAt !== null)).toHaveLength(
      1,
    );
    expect(
      jsonRows(files, 'json/invitations.json').filter((i) => i.status === 'REVOKED'),
    ).toHaveLength(1);
  });

  it('holds nothing of another organisation: none of its ids, names or emails occur anywhere', async () => {
    const { admin, other } = await seedFixture();

    const { files } = await exportOf(admin);
    const bytes = everything(files);

    // Not vacuous: the export does contain this organisation's own markers.
    expect(bytes).toContain('ACME-PLAN-MARKER');
    expect(bytes).toContain('planner@example.com');
    for (const marker of other.markers) {
      expect(bytes, `the export must not contain ${marker}`).not.toContain(marker);
    }
    // …and the other organisation's admin, who is a member only there, is not among the people.
    const people = jsonRows(files, 'json/people.json').map((p) => p.email);
    expect(people).not.toContain('other-admin@example.com');
    expect(people).toContain('admin@example.com');
  });

  it('carries no credential and no IP address or browser detail', async () => {
    const { admin, organizationId, invitationTokens } = await seedFixture();
    const account = await prisma.account.findFirstOrThrow({ where: { userId: admin.userId } });
    const session = await prisma.session.findFirstOrThrow({ where: { userId: admin.userId } });
    const invitations = await prisma.invitation.findMany({ where: { organizationId } });
    const shares = await prisma.planShare.findMany({ where: { organizationId } });
    const audited = await prisma.auditEvent.findMany({
      where: { organizationId, ipAddress: { not: null } },
    });
    expect(account.password, 'the fixture user has a password hash').toBeTruthy();
    expect(invitations.length).toBeGreaterThan(0);
    expect(shares.length).toBeGreaterThan(0);
    // Not vacuous: the audit log the export copies does hold an address and a browser.
    expect(audited.length).toBeGreaterThan(0);

    const { files } = await exportOf(admin);
    const bytes = everything(files);

    const secrets = [
      account.password!,
      session.token,
      ...invitations.map((i) => i.tokenHash),
      ...shares.map((s) => s.tokenHash),
      ...invitationTokens,
    ];
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(8);
      expect(bytes).not.toContain(secret);
    }
    for (const path of ['json/audit-events.json', 'csv/audit-events.csv']) {
      const body = text(files, path);
      expect(body).not.toMatch(/ipAddress|userAgent/);
      for (const row of audited) expect(body).not.toContain(row.ipAddress!);
    }
    expect(Object.keys(jsonRows(files, 'json/audit-events.json')[0]!)).not.toContain('ipAddress');
  });

  it('answers each role as it should: Org Admin 200, other members 403, a stranger 404, no session 401', async () => {
    const { admin, other } = await seedFixture();
    const login = async (email: string): Promise<Actor> => {
      const agent = request.agent(server());
      const res = await agent
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
      return { agent, userId: (res.body as { user: { id: string } }).user.id, email };
    };
    const status = async (actor: { agent: Actor['agent'] }, slug = 'acme'): Promise<number> => {
      // Each call counts toward the route's throttle; this test is about authorisation.
      resetThrottleCounters(throttlerStorage);
      return (
        await actor.agent
          .post(`/api/v1/organizations/${slug}/export`)
          .buffer(true)
          .parse(binary as never)
      ).status;
    };

    expect(await status(admin)).toBe(200);
    for (const email of ['planner@example.com', 'contributor@example.com', 'viewer@example.com']) {
      expect(await status(await login(email)), email).toBe(403);
    }
    // Another organisation's Org Admin passes the coarse permission check and then fails to resolve
    // this organisation: the organisation is not disclosed.
    expect(await status(other.admin)).toBe(404);
    // …and a slug that does not exist answers the same.
    expect(await status(admin, 'no-such-org')).toBe(404);
    resetThrottleCounters(throttlerStorage);
    await request(server()).post(EXPORT_URL).expect(401);
  });

  it('refuses a second export of the same organisation while one holds its lock (409), then allows it once released', async () => {
    const { admin, organizationId } = await seedFixture();

    // Hold the organisation's export lock exactly as a running export does.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let acquired!: () => void;
    const acquiredLock = new Promise<void>((resolve) => (acquired = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('org-export'), hashtext(${organizationId}))`;
        acquired();
        await held;
      },
      { timeout: 30_000 },
    );
    await acquiredLock;
    try {
      const refused = await admin.agent.post(EXPORT_URL).buffer(true);
      expect(refused.status).toBe(409);
      expect(refused.headers['content-type']).toMatch(/json/);
      expect(refused.headers['content-disposition']).toBeUndefined();
      expect(
        (refused.body as { error: { details: { reason: string } } }).error.details.reason,
      ).toBe('EXPORT_IN_PROGRESS');
      // A refusal before the first byte is not recorded.
      expect(await prisma.auditEvent.count({ where: { action: 'privacy.exported' } })).toBe(0);
    } finally {
      release();
      await holder;
    }

    resetThrottleCounters(throttlerStorage);
    expect((await download(admin)).status).toBe(200);
  });

  it('refuses the fourth export in ten minutes (429)', async () => {
    const { admin } = await seedFixture();
    resetThrottleCounters(throttlerStorage);

    for (let i = 0; i < 3; i += 1)
      expect((await download(admin)).status, `export ${i + 1}`).toBe(200);

    const refused = await admin.agent.post(EXPORT_URL);
    expect(refused.status).toBe(429);
  });

  it('writes each value type exactly: a maximal Decimal(18,4), a BigInt past 2^53, a calendar day, and a guarded formula', async () => {
    const { admin } = await seedFixture();

    const { files } = await exportOf(admin);

    const resource = jsonRows(files, 'json/resources.json')[0]!;
    expect(resource.costPerUnit).toBe(MAX_DECIMAL);
    expect(csvRows(files, 'csv/resources.csv')[0]!.costPerUnit).toBe(MAX_DECIMAL);

    const frame = jsonRows(files, 'json/activities.json').find((a) => a.name === 'Frame')!;
    expect(frame.budgetedExpense).toBe(BIG_COST.toString());
    expect(
      csvRows(files, 'csv/activities.csv').find((a) => a.name === 'Frame')!.budgetedExpense,
    ).toBe(BIG_COST.toString());

    const plan = jsonRows(files, 'json/plans.json').find((p) => p.name === 'ACME-PLAN-MARKER')!;
    expect(plan.plannedStart).toBe('2026-03-02');
    expect(plan.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // JSON keeps the exact text; the spreadsheet view neutralises it.
    const note = jsonRows(files, 'json/notes.json').find((n) => String(n.body).startsWith('='))!;
    expect(note.body).toBe(FORMULA);
    const csvNote = csvRows(files, 'csv/notes.csv').find((n) => n.id === note.id)!;
    expect(csvNote.body).toBe(`'${FORMULA}`);
    // …and a newline and quote inside a note survive both.
    const multi = jsonRows(files, 'json/notes.json').find((n) =>
      String(n.body).startsWith('ACME-ACTIVITY-NOTE'),
    )!;
    expect(csvRows(files, 'csv/notes.csv').find((n) => n.id === multi.id)!.body).toBe(multi.body);

    // Absent values are `null` in JSON and an empty cell in CSV.
    expect(jsonRows(files, 'json/clients.json')[0]!.description).toBeNull();
    expect(csvRows(files, 'csv/clients.csv')[0]!.description).toBe('');
  });

  it('records a finished export: one privacy.exported SUCCESS row naming the admin, the counts and the bytes handed over', async () => {
    const { admin, organizationId } = await seedFixture();

    const { raw, files } = await exportOf(admin);

    const rows = await auditRows(organizationId, 1);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: admin.userId,
      subjectType: 'ORGANIZATION',
      subjectId: organizationId,
      subjectLabel: 'Acme',
    });
    const manifest = JSON.parse(text(files, 'manifest.json')) as {
      files: { kind: string; rows: number }[];
    };
    expect(row.changes).toEqual({
      before: {},
      after: {
        formatVersion: '1.0',
        files: EXPORT_FILES.length * 2,
        rows: manifest.files.filter((f) => f.kind === 'json').reduce((n, f) => n + f.rows, 0),
        bytes: raw.length,
        includesDeleted: true,
      },
    });
  });

  it('records an export the client abandoned: FAILURE client_aborted, the lock released, and a second request refused meanwhile', async () => {
    const { admin, organizationId } = await seedFixture();
    // Incompressible text, enough that the output cannot fit in the socket buffers of a client that
    // has stopped reading — otherwise the server could finish before the client ever drops.
    const plan = await prisma.plan.findFirstOrThrow({
      where: { organizationId, name: 'ACME-PLAN-MARKER' },
    });
    await prisma.note.createMany({
      data: Array.from({ length: 5_000 }, () => ({
        organizationId,
        entityType: 'PLAN' as const,
        planId: plan.id,
        body: randomBytes(2_500).toString('hex'),
      })),
    });

    let response: IncomingMessage | undefined;
    const firstChunk = new Promise<void>((resolve) => {
      void admin.agent
        .post(EXPORT_URL)
        .buffer(false)
        .parse(((res: IncomingMessage) => {
          response = res;
          res.once('data', () => {
            res.pause();
            resolve();
          });
        }) as never)
        .then(
          () => undefined,
          () => undefined,
        );
    });
    await firstChunk;

    // The first export is mid-stream, so a second is refused rather than queued.
    const second = await admin.agent.post(EXPORT_URL).buffer(true);
    expect(second.status).toBe(409);

    // The client goes away after the first chunk.
    response!.destroy();

    const rows = await auditRows(organizationId, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'FAILURE', actorUserId: admin.userId });
    expect((rows[0]!.changes as { after: Json }).after).toMatchObject({
      reason: 'client_aborted',
      formatVersion: '1.0',
    });

    // The snapshot and its lock ended with the connection: the next export goes through.
    resetThrottleCounters(throttlerStorage);
    const deadline = Date.now() + 10_000;
    let status = 409;
    while (status === 409 && Date.now() < deadline) {
      resetThrottleCounters(throttlerStorage);
      status = (await download(admin)).status;
    }
    expect(status).toBe(200);
  }, 60_000);
});
