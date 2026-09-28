/**
 * **#384 M0-T4: what the two zero-duration staff diagnostics cost, measured before they ship.**
 *
 *   ZD_COST_URL=postgresql://…/app_cost_zd0 ZD_OUT=/path/out.json \
 *     pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-zero-duration-diagnostics.mts
 *
 * ADR-0140's bar: no query whose cost is unknown ships, and each must run in ≤ 500 ms on a diluted
 * estate. The estate is `docs/specs/zero-duration-task/m0-dilute.sql`, applied to a THROWAWAY
 * database built by `prisma migrate deploy` — never a shared test database, which other suites
 * clear underneath a run (found the hard way during this milestone: a plan insert failed on its
 * own project's foreign key because a neighbouring run had just deleted the project).
 *
 * **The SQL is read from the shipped registry, never retyped** — the one-planning-surface M0
 * lesson, where a costing document named a `dump-sql.mts` that had never been committed. This file
 * is that instrument, committed, for these two entries.
 *
 * Each statement is warmed once and then run five times under `EXPLAIN (ANALYZE, BUFFERS, FORMAT
 * JSON)`; the result records the median and max execution time and the plan's node types, and the
 * counts the real query returns, so a reading can be checked against the estate's arithmetic.
 *
 * Skips unless `ZD_COST_URL` is set: it is not a test, and the measure config never runs in CI.
 */
import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';

import { DIAGNOSTICS } from '../src/modules/staff/staff-diagnostics.registry.js';

const URL = process.env.ZD_COST_URL;
const IDS = ['zero-duration-tasks', 'zero-duration-tasks-resourced'] as const;
const RUNS = 5;

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function nodes(plan: PlanNode): string[] {
  const own =
    plan['Node Type'] +
    (plan['Relation Name'] ? ` on ${plan['Relation Name']}` : '') +
    (plan['Index Name'] ? ` using ${plan['Index Name']}` : '');
  return [own, ...(plan.Plans ?? []).flatMap(nodes)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

it.skipIf(!URL)('costs the two zero-duration diagnostics on the diluted estate', async () => {
  const prisma = new PrismaClient({ datasourceUrl: URL });
  try {
    const out: Record<string, unknown> = {};
    for (const id of IDS) {
      const entry = DIAGNOSTICS.find((d) => d.id === id);
      if (!entry) throw new Error(`registry has no ${id}`);
      for (const [part, sql] of [
        ['denominator', entry.denominator],
        ['numerator', entry.numerator],
      ] as const) {
        if (sql.values.length !== 0) throw new Error(`${id} ${part} takes parameters`);
        const text = sql.sql;
        const explain = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`;
        await prisma.$queryRawUnsafe(explain);
        const times: number[] = [];
        let plan: PlanNode | undefined;
        for (let i = 0; i < RUNS; i++) {
          const rows = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': unknown }[]>(explain);
          const doc = rows[0]!['QUERY PLAN'] as [{ 'Execution Time': number; Plan: PlanNode }];
          times.push(doc[0]['Execution Time']);
          plan ??= doc[0].Plan;
        }
        const result = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(text);
        out[`${id} ${part}`] = {
          medianMs: Number(median(times).toFixed(2)),
          maxMs: Number(Math.max(...times).toFixed(2)),
          runsMs: times.map((t) => Number(t.toFixed(2))),
          plan: nodes(plan!),
          result: Object.fromEntries(Object.entries(result[0]!).map(([k, v]) => [k, Number(v)])),
        };
      }
    }
    if (process.env.ZD_OUT) writeFileSync(process.env.ZD_OUT, JSON.stringify(out, null, 2));
    expect(Object.keys(out)).toHaveLength(4);
  } finally {
    await prisma.$disconnect();
  }
});
