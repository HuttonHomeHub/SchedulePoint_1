import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { FinishMilestoneRederiveService } from '../src/modules/schedule/finish-milestone-rederive.service';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **FC-6 — the placement rewrite keeps every placed instant, proved through the real engine** (#381,
 * `docs/specs/finish-milestone-date/conditions.md`, ADR-0155), and **D5 — the one-shot boot
 * re-derivation replaces the old rule's stored dates exactly once.**
 *
 * CI provisions an empty database, on which the rewrite is a silent no-op (ADR-0107), so a green
 * `migrate deploy` proves nothing about it. This seeds a finish milestone placed where the OLD engine
 * drew it, runs the migration's own rewrite statement (read from the shipped file, never restated),
 * recalculates through the API, and asserts nothing moved.
 *
 * **The fixture, and why it discriminates.** A new plan takes the organisation's default Monday to
 * Friday calendar. Task `A` runs Mon 5 – Fri 9 Jan. Under the old rule a finish milestone after it
 * read the next working day, Mon 12 Jan, so a planner who placed it on `A`'s end stored
 * `2026-01-12`. The new engine reads a finish milestone's placement as the END of that day, so an
 * unrewritten `12` would mean the end of Monday: the milestone would report the 12th and push its
 * successor `B` to Tuesday the 13th. The rewrite stores `2026-01-11` — a Sunday, and that is fine:
 * the end of Sunday rolls forward to Monday's first working minute, the exact instant the old rule
 * read — so the milestone reports Fri 9 Jan and `B` still starts Monday the 12th. **Verified red** by
 * skipping `rewrite()`: the milestone reads `2026-01-12` and `B` reads `2026-01-13`.
 *
 * The TASK `P` carries a placement too, and must be left alone: the rewrite is keyed on the type.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260923120000_finish_milestone_end_of_day_placements',
    'migration.sql',
  ),
  'utf8',
);

/** The rewrite: the file's last statement. The earlier ones create the record table, which exists. */
function rewriteStatement(sql: string): string {
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const last = statements.at(-1)!;
  if (!last.startsWith('WITH recorded AS'))
    throw new Error('the rewrite is not the last statement');
  return last;
}

interface Row {
  id: string;
  code: string;
  type: string;
  version: number;
  visualStart: string | null;
  earlyStart: string | null;
  visualEffectiveStart: string | null;
  visualConflict: boolean;
}

describe.skipIf(!hasDatabase)(
  'finish-milestone date rule: migration and re-derivation (e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let rederive: FinishMilestoneRederiveService;

    beforeAll(async () => {
      process.env.LOG_LEVEL ??= 'silent';
      const { AppModule } = await import('../src/app.module');
      const { PrismaService: Token } = await import('../src/prisma/prisma.service');
      const { FinishMilestoneRederiveService: Rederive } =
        await import('../src/modules/schedule/finish-milestone-rederive.service');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication<NestExpressApplication>({
        bufferLogs: false,
        bodyParser: false,
      });
      configureHttpApp(app as NestExpressApplication);
      await app.init();
      prisma = app.get(Token);
      rederive = app.get(Rederive);
    });

    beforeEach(async () => {
      // The record's organisation FK is RESTRICT, so it goes before the domain data.
      await prisma.$executeRawUnsafe('DELETE FROM "finish_milestone_date_migrations"');
      await clearDomainData(prisma);
    });

    afterAll(async () => {
      await prisma.$executeRawUnsafe('DELETE FROM "finish_milestone_date_migrations"');
      await clearDomainData(prisma);
      await app?.close();
    });

    async function seed() {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/auth/sign-up/email')
        .set('Origin', ORIGIN)
        .send({ name: 'fm', email: 'fm-admin@example.com', password: PASSWORD })
        .expect(200);
      await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
      const client = await agent
        .post('/api/v1/organizations/acme/clients')
        .send({ name: 'Northgate' })
        .expect(201);
      const project = await agent
        .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
        .send({ name: 'Riverside' })
        .expect(201);
      const plan = await agent
        .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
        .send({ name: 'Milestones', plannedStart: '2026-01-05' })
        .expect(201);
      const planId = plan.body.data.id as string;
      const base = `/api/v1/organizations/acme/plans/${planId}/activities`;
      const create = async (body: object): Promise<string> =>
        (await agent.post(base).send(body).expect(201)).body.data.id as string;
      const link = (predecessorId: string, successorId: string) =>
        agent
          .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
          .send({ predecessorId, successorId, type: 'FS' })
          .expect(201);

      const a = await create({ name: 'Frame', code: 'A', durationDays: 5 });
      // Where the OLD rule drew a finish milestone after A: the day after A's last day.
      const m = await create({
        name: 'Frame complete',
        code: 'M',
        type: 'FINISH_MILESTONE',
        durationDays: 0,
        visualStart: '2026-01-12',
      });
      const b = await create({ name: 'Fit-out', code: 'B', durationDays: 1 });
      await create({ name: 'Placed task', code: 'P', durationDays: 2, visualStart: '2026-01-07' });
      const gone = await create({
        name: 'Deleted milestone',
        code: 'GONE',
        type: 'FINISH_MILESTONE',
        durationDays: 0,
        visualStart: '2026-01-20',
      });
      await link(a, m);
      await link(m, b);
      await agent.delete(`/api/v1/organizations/acme/activities/${gone}`).expect(200);

      const recalculate = () =>
        agent
          .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
          .send({})
          .expect(200);
      const read = async (): Promise<Map<string, Row>> => {
        const list = await agent.get(`${base}?limit=100`).expect(200);
        return new Map((list.body.data as Row[]).map((r) => [r.code, r]));
      };
      return { planId, recalculate, read, gone };
    }

    const rewrite = () => prisma.$executeRawUnsafe(rewriteStatement(MIGRATION_SQL));

    it('moves a finish milestone’s stored placement one day earlier and nothing on screen moves (FC-6)', async () => {
      const { recalculate, read, gone } = await seed();
      const before = await read();
      expect(before.get('M')!.visualStart).toBe('2026-01-12');

      const changed = await rewrite();
      await recalculate();
      const after = await read();

      // Exactly the two finish-milestone placements, including the soft-deleted one.
      expect(changed).toBe(2);
      expect(after.get('M')!.visualStart).toBe('2026-01-11');
      expect(after.get('M')!.version).toBe(before.get('M')!.version + 1);
      const deleted = await prisma.activity.findUniqueOrThrow({ where: { id: gone } });
      expect(deleted.visualStart?.toISOString().slice(0, 10)).toBe('2026-01-19');

      // The instant is kept: the milestone reads A's last day with no conflict, and B — which would
      // move a day if the placement had been read at its old date — starts where it always did.
      expect(after.get('M')!.visualEffectiveStart).toBe('2026-01-09');
      expect(after.get('M')!.visualConflict).toBe(false);
      expect(after.get('B')!.visualEffectiveStart).toBe('2026-01-12');

      // A placed TASK is not a finish milestone and is left exactly as it was.
      expect(after.get('P')!.visualStart).toBe('2026-01-07');
      expect(after.get('P')!.version).toBe(before.get('P')!.version);

      // The record names each rewritten row with its prior date, and a second run changes nothing.
      const record = await prisma.fmDateMigration.findMany({
        orderBy: { priorVisualStart: 'asc' },
      });
      expect(record.map((r) => r.priorVisualStart.toISOString().slice(0, 10))).toEqual([
        '2026-01-12',
        '2026-01-20',
      ]);
      expect(await rewrite()).toBe(0);
    });

    it('re-derives a plan computed before the migration, once, and leaves a current plan alone (D5)', async () => {
      const { planId, recalculate, read } = await seed();
      await rewrite();
      await recalculate();
      const current = await read();
      expect(await rederive.pendingPlans()).toEqual([]);

      // Simulate a plan last computed under the old rule: its stored milestone dates are the old
      // reading (the working day after A's last day), and its freshness stamp predates the migration.
      await prisma.$executeRawUnsafe(
        `UPDATE "activities" SET "early_start" = '2026-01-12', "early_finish" = '2026-01-12',
         "visual_effective_start" = '2026-01-12', "visual_effective_finish" = '2026-01-12'
       WHERE "plan_id" = $1::uuid AND "code" = 'M'`,
        planId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "plans" SET "schedule_computed_at" = TIMESTAMPTZ '2000-01-01' WHERE "id" = $1::uuid`,
        planId,
      );
      expect((await rederive.pendingPlans()).map((p) => p.id)).toEqual([planId]);

      expect(await rederive.rederive()).toBe(1);
      const after = await read();
      expect(after.get('M')!.earlyStart).toBe(current.get('M')!.earlyStart);
      expect(after.get('M')!.visualEffectiveStart).toBe('2026-01-09');

      // Once: the recalculation stamped the plan, so it has left the set.
      expect(await rederive.pendingPlans()).toEqual([]);
      expect(await rederive.rederive()).toBe(0);
    });
  },
);
