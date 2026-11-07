/**
 * **#565 M0-T3 / M2-T2 — the cost of `writeResults`, before and after the four instant columns**
 * (`docs/specs/cross-plan-instants/`, FC-10).
 *
 * The same harness runs against two databases in ONE sitting: a database migrated WITHOUT
 * `20261107120000_schedule_instants` driven by the pre-M2 `schedule.repository.ts`, and one with it
 * driven by the M2 file. The harness itself is identical for both — the pre-M2 repository ignores the
 * four instant fields on each result — so a difference is the statement and the wider rows, nothing
 * else. Cross-sitting figures are not comparable (CLAUDE.md §17), which is why both run back to back.
 *
 * **What it measures:** `ScheduleRepository.writeResults` plus `stampScheduleComputedAt` for one plan of
 * N activities, inside one transaction as a recalculation runs them, `RUNS` samples after `WARMUPS`,
 * nearest-rank p50/p95. The engine, the loads and HTTP are not in the figure.
 *
 * **Where it bypasses the product, stated rather than left to be discovered** (ADR-0081 §3): the rows
 * are inserted directly with SQL and the results are synthetic (dates and minutes that satisfy the
 * CHECKs), not engine output, so it times the statement and not the engine.
 *
 * Run from `apps/api` against a migrated database:
 *   DATABASE_URL=… N=2000 npx vitest run --config scripts/vitest.measure.config.mts \
 *     scripts/measure-schedule-write.mts
 */
import { randomUUID } from 'node:crypto';

import { it } from 'vitest';

import { PrismaClient } from '@prisma/client';

import type { EngineResult } from '../src/modules/schedule/engine/index.js';
import { ScheduleRepository } from '../src/modules/schedule/schedule.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const RUNS = Number(process.env.RUNS ?? 40);
const WARMUPS = 5;
const SIZES = (process.env.N ?? '2000,5000').split(',').map(Number);

function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { p50: at(50), p95: at(95), min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

it('times writeResults', async () => {
  const prisma = new PrismaClient();
  const repo = new ScheduleRepository(prisma as unknown as PrismaService);
  const org = randomUUID();
  const client = randomUUID();
  const project = randomUUID();
  await prisma.$executeRaw`INSERT INTO organizations(id,name,slug,updated_at) VALUES (${org}::uuid, 'w', ${'w' + org}, now())`;
  await prisma.$executeRaw`INSERT INTO clients(id,organization_id,name,updated_at) VALUES (${client}::uuid, ${org}::uuid, 'c', now())`;
  await prisma.$executeRaw`INSERT INTO projects(id,organization_id,client_id,name,updated_at) VALUES (${project}::uuid, ${org}::uuid, ${client}::uuid, 'p', now())`;

  for (const n of SIZES) {
    const plan = randomUUID();
    await prisma.$executeRaw`INSERT INTO plans(id,organization_id,project_id,name,planned_start,updated_at) VALUES (${plan}::uuid, ${org}::uuid, ${project}::uuid, ${'pl' + n}, '2027-01-04', now())`;
    await prisma.$executeRaw`
      INSERT INTO activities(id,organization_id,plan_id,name,updated_at)
      SELECT gen_random_uuid(), ${org}::uuid, ${plan}::uuid, 'a' || g, now()
      FROM generate_series(1, ${n}::int) g`;
    const ids = (
      await prisma.$queryRaw<
        { id: string }[]
      >`SELECT id FROM activities WHERE plan_id = ${plan}::uuid`
    ).map((r) => r.id);
    const criticality = {
      criticalPathDefinition: 'TOTAL_FLOAT',
      criticalFloatThresholdMinutes: 0,
      totalFloatMode: 'FINISH',
      makeOpenEndsCritical: false,
    } as never;

    const results = (salt: number): EngineResult[] =>
      ids.map((id, i) => {
        const base = 28_000_000 + i * 480 + salt;
        return {
          activityId: id,
          earlyStart: '2027-01-04',
          earlyFinish: '2027-01-08',
          lateStart: '2027-01-05',
          lateFinish: '2027-01-09',
          totalFloat: 1440,
          freeFloat: 0,
          isCritical: i % 7 === 0,
          isNearCritical: false,
          constraintViolated: false,
          loeNoSpan: false,
          resourceDriverMissing: false,
          visualEffectiveStart: '2027-01-04',
          visualEffectiveFinish: '2027-01-08',
          visualConflict: false,
          visualConflictReason: null,
          visualDriftMinutes: null,
          remainingFloatMinutes: 1440,
          leveledStart: null,
          leveledFinish: null,
          levelingDelayMinutes: null,
          levelingWindowExceeded: false,
          selfOverAllocated: false,
          placedStartInstant: base,
          placedFinishInstant: base + 2400,
          lateStartInstant: base + 1440,
          lateFinishInstant: base + 3840,
        } as unknown as EngineResult;
      });

    const samples: number[] = [];
    for (let r = 0; r < WARMUPS + RUNS; r++) {
      const batch = results(r);
      const t0 = performance.now();
      await prisma.$transaction(
        async (tx) => {
          await repo.writeResults(org, plan, batch, new Map(), tx);
          await repo.stampScheduleComputedAt(plan, criticality, tx);
        },
        { timeout: 120_000, maxWait: 120_000 },
      );
      const dt = performance.now() - t0;
      if (r >= WARMUPS) samples.push(dt);
    }
    const p = percentiles(samples);
    console.log(
      `writeResults n=${n} runs=${RUNS} p50=${p.p50.toFixed(1)} p95=${p.p95.toFixed(1)} min=${p.min.toFixed(1)} max=${p.max.toFixed(1)} ms`,
    );
  }
  await prisma.$disconnect();
});
