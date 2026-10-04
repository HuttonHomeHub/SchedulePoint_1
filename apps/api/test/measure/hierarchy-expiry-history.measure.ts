import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it } from 'vitest';

import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * ADR-0174 M3-T1 — what does ADR-0096 expiry cost when the plan carries history rows?
 *
 * Run against a DISPOSABLE database that has had `prisma migrate deploy` applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure_expiry MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/hierarchy-expiry-history.measure.ts
 *
 * Each case seeds one client → project → plan scope of 2,000 activities with a chain of links, plus
 * `K` history rows per activity written by SQL (not the API: the point is the delete, and 500k
 * recorded saves would take hours), then times `deleteExpiredScope` inside one transaction with the
 * 60 s batch timeout lifted so a slow case reports its real duration rather than a timeout. The
 * result is a set of numbers for a human to read; the harness asserts nothing.
 *
 * Two things the figures do NOT cover, stated here so a reader does not assume them: the rows are
 * bulk-loaded moments before the delete, so they are warm in the buffer cache (a scope that expires
 * after months in the bin would partly be read from disk), and the history is spread evenly over
 * the activities rather than concentrated on hubs.
 */
const ACTIVITIES = 2000;
/** History rows per activity, one case each. 250 × 2,000 is the 500,000-row case the plan names. */
const ROWS_PER_ACTIVITY = (process.env.MEASURE_K ?? '0,50,125,250,500')
  .split(',')
  .map((n) => Number(n));
const REPS = Number(process.env.MEASURE_ITER ?? 2);
const CASE_TIMEOUT_MS = 3_600_000;

interface Reading {
  historyRows: number;
  rep: number;
  ms: number;
  counts: Record<string, number>;
}

describe.skipIf(!process.env.DATABASE_URL)('hierarchy expiry with history measurement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deleteExpiredScope: typeof import('../../src/common/hierarchy/hierarchy-expiry.runner').deleteExpiredScope;
  const readings: Reading[] = [];

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../../src/app.module');
    const { PrismaService: Token } = await import('../../src/prisma/prisma.service');
    ({ deleteExpiredScope } = await import('../../src/common/hierarchy/hierarchy-expiry.runner'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    await app.init();
    prisma = app.get(Token);
  });

  afterAll(async () => {
    if (process.env.MEASURE_OUT)
      writeFileSync(process.env.MEASURE_OUT, JSON.stringify(readings, null, 2));
    await app?.close();
  });

  async function seedScope(
    orgId: string,
    rowsPerActivity: number,
    tag: string,
  ): Promise<{ clientId: string; projectId: string; planId: string }> {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: `C ${tag}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { organizationId: orgId, clientId: client.id, name: `P ${tag}` },
      select: { id: true },
    });
    const plan = await prisma.plan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        name: `Plan ${tag}`,
        plannedStart: new Date('2026-01-01'),
      },
      select: { id: true },
    });
    await prisma.activity.createMany({
      data: Array.from({ length: ACTIVITIES }, (_, i) => ({
        organizationId: orgId,
        planId: plan.id,
        name: `Activity ${i}`,
        durationMinutes: 1440,
      })),
    });
    const ids = (
      await prisma.activity.findMany({
        where: { planId: plan.id },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map((a) => a.id);
    await prisma.activityDependency.createMany({
      data: ids.slice(1).map((successorId, i) => ({
        organizationId: orgId,
        planId: plan.id,
        predecessorId: ids[i] as string,
        successorId,
      })),
    });
    if (rowsPerActivity > 0) {
      // ~0.4 KB per entry, the spec's estimate: a three-field change set with a long-ish string.
      await prisma.$executeRaw`
        INSERT INTO activity_history_entries
          (id, organization_id, activity_id, actor_user_id, scope, first_recorded_at,
           last_recorded_at, edit_count, has_non_cost_change, changes)
        SELECT gen_random_uuid(), ${orgId}::uuid, a.id, 'measure-actor', 'DEFINITION',
               timestamptz '2026-01-01' + (g * interval '1 minute'),
               timestamptz '2026-01-01' + (g * interval '1 minute'), 1, true,
               jsonb_build_object(
                 'name', jsonb_build_object('from', 'Excavate ' || g, 'to', 'Excavate ' || (g + 1)),
                 'durationMinutes', jsonb_build_object('from', g, 'to', g + 1),
                 'notes', jsonb_build_object('from', repeat('x', 120), 'to', repeat('y', 120)))
        FROM activities a CROSS JOIN generate_series(1, ${rowsPerActivity}::int) AS g
        WHERE a.plan_id = ${plan.id}::uuid`;
    }
    await prisma.$executeRawUnsafe('ANALYZE activity_history_entries');
    await prisma.$executeRawUnsafe('ANALYZE activities');
    await prisma.$executeRawUnsafe('ANALYZE dependencies');
    return { clientId: client.id, projectId: project.id, planId: plan.id };
  }

  it('times the delete at each history density', { timeout: CASE_TIMEOUT_MS }, async () => {
    const org = await prisma.organization.create({
      data: { name: 'Measure', slug: `measure-${Date.now()}` },
      select: { id: true },
    });
    for (const k of ROWS_PER_ACTIVITY) {
      for (let rep = 1; rep <= REPS; rep += 1) {
        const scope = await seedScope(org.id, k, `k${k}r${rep}`);
        const t0 = performance.now();
        const counts = await prisma.$transaction(
          (tx) =>
            deleteExpiredScope(tx, {
              clientIds: [scope.clientId],
              projectIds: [scope.projectId],
              planIds: [scope.planId],
            }),
          { timeout: CASE_TIMEOUT_MS, maxWait: 60_000 },
        );
        const ms = performance.now() - t0;
        readings.push({ historyRows: k * ACTIVITIES, rep, ms, counts: { ...counts } });
        console.warn(
          `history=${k * ACTIVITIES} rep=${rep} ms=${ms.toFixed(0)} counts=${JSON.stringify(counts)}`,
        );
      }
    }
  });
});
