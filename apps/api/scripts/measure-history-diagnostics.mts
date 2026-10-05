/**
 * **#443 / ADR-0174 M3-T2, M1-T1: what the three history diagnostics cost, measured before they ship.**
 *
 *   HD_COST_URL=postgresql://…/app_cost_hist HD_ROWS=100000 HD_OUT=/path/out.json \
 *     pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-history-diagnostics.mts
 *
 * ADR-0140's bar: no query whose cost is unknown ships, and each statement must run in ≤ 500 ms. The
 * estate is `docs/specs/zero-duration-task/m0-dilute.sql` (102,000 activities) applied to a THROWAWAY
 * database built by `prisma migrate deploy`. This file tops `activity_history_entries` up to
 * `HD_ROWS` rows — written by SQL, physically INTERLEAVED (random order across all activities, the
 * bound `hierarchy-expiry-history.measure.ts` established for real history that accrues over time),
 * with `first_recorded_at` spread over the previous 90 days so the 28-day window holds about 31 %,
 * 40 % of rows in `LOGIC` / `RESOURCES`, and about 10 % above 512 bytes — then measures.
 *
 * **The SQL is read from the shipped registry, never retyped.** The six statements are measured
 * round-robin (the `m3-measurement.md` interleaved order) so a warm-cache bias does not favour
 * whichever ran last, each warmed once and then run five times under `EXPLAIN (ANALYZE, BUFFERS,
 * FORMAT JSON)`; the median, max and plan node types are recorded with the counts the real query
 * returns. The whole press — every registry statement, run once each in registry order — is timed
 * ten times, so the figure ADR-0140 D7's reopen trigger is stated against is read directly.
 *
 * Skips unless `HD_COST_URL` is set: it is not a test, and the measure config never runs in CI.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';

import { DIAGNOSTICS } from '../src/modules/staff/staff-diagnostics.registry.js';

const URL = process.env.HD_COST_URL;
const ROWS = Number(process.env.HD_ROWS ?? 100_000);
const IDS = [
  'history-entries-last-28-days',
  'history-entries-links-and-resources-28-days',
  'history-entries-over-512-bytes',
] as const;
const RUNS = 5;
const PRESSES = 10;

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

it.skipIf(!URL)(
  'costs the three history diagnostics at HD_ROWS history rows',
  { timeout: 3_600_000 },
  async () => {
    const prisma = new PrismaClient({ datasourceUrl: URL });
    try {
      const have = Number(
        (
          await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            'SELECT count(*) AS n FROM activity_history_entries',
          )
        )[0]!.n,
      );
      if (have < ROWS) {
        // Interleaved: the sort by random() makes the write order independent of the activity, so
        // an activity's rows end up scattered across the heap as months of real saves would leave them.
        await prisma.$executeRawUnsafe(`
          INSERT INTO activity_history_entries
            (id, organization_id, activity_id, actor_user_id, scope, first_recorded_at,
             last_recorded_at, edit_count, has_non_cost_change, changes)
          SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000001'::uuid,
                 ('00000000-0000-4000-9000-' || lpad((1 + floor(random() * 102000))::int::text, 12, '0'))::uuid,
                 'measure-actor',
                 (ARRAY['DEFINITION','PROGRESS','PLACEMENT','LOGIC','RESOURCES'])[1 + (g % 5)]::activity_history_scope,
                 now() - (random() * interval '90 days'),
                 now() - (random() * interval '90 days') + interval '1 day',
                 1, true,
                 jsonb_build_object(
                   'name', jsonb_build_object('from', 'Excavate ' || g, 'to', 'Excavate ' || (g + 1)),
                   'durationMinutes', jsonb_build_object('from', g, 'to', g + 1),
                   'notes', jsonb_build_object('from', repeat('x', CASE WHEN g % 10 = 0 THEN 400 ELSE 40 END),
                                               'to', repeat('y', CASE WHEN g % 10 = 0 THEN 400 ELSE 40 END)))
          FROM generate_series(1, ${ROWS - have}) g
          ORDER BY random()`);
        await prisma.$executeRawUnsafe('ANALYZE activity_history_entries');
      }

      const statements = IDS.flatMap((id) => {
        const entry = DIAGNOSTICS.find((d) => d.id === id);
        if (!entry) throw new Error(`registry has no ${id}`);
        return (
          [
            ['denominator', entry.denominator],
            ['numerator', entry.numerator],
          ] as const
        ).map(([part, sql]) => {
          if (sql.values.length !== 0) throw new Error(`${id} ${part} takes parameters`);
          return { key: `${id} ${part}`, text: sql.sql };
        });
      });

      for (const s of statements) await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE) ${s.text}`);
      const times = new Map<string, number[]>(statements.map((s) => [s.key, []]));
      const plans = new Map<string, string[]>();
      for (let i = 0; i < RUNS; i++) {
        for (const s of statements) {
          const rows = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': unknown }[]>(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${s.text}`,
          );
          const doc = rows[0]!['QUERY PLAN'] as [{ 'Execution Time': number; Plan: PlanNode }];
          times.get(s.key)!.push(doc[0]['Execution Time']);
          if (!plans.has(s.key)) plans.set(s.key, nodes(doc[0].Plan));
        }
      }

      const out: Record<string, unknown> = { historyRows: have < ROWS ? ROWS : have };
      for (const s of statements) {
        const t = times.get(s.key)!;
        const result = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(s.text);
        out[s.key] = {
          medianMs: Number(median(t).toFixed(2)),
          maxMs: Number(Math.max(...t).toFixed(2)),
          runsMs: t.map((x) => Number(x.toFixed(2))),
          plan: plans.get(s.key),
          result: Object.fromEntries(Object.entries(result[0]!).map(([k, v]) => [k, Number(v)])),
        };
      }

      // The whole press, as the service runs it: every registry statement, one at a time. Measured
      // twice — without and with the three new entries — so the cost they add is a difference.
      const press = async (skipNew: boolean): Promise<number> => {
        const t0 = performance.now();
        for (const e of DIAGNOSTICS) {
          if (skipNew && (IDS as readonly string[]).includes(e.id)) continue;
          await prisma.$queryRawUnsafe(e.denominator.sql);
          await prisma.$queryRawUnsafe(e.numerator.sql);
        }
        return performance.now() - t0;
      };
      await press(false);
      const without: number[] = [];
      const withNew: number[] = [];
      for (let i = 0; i < PRESSES; i++) {
        without.push(await press(true));
        withNew.push(await press(false));
      }
      out.pressWithoutHistoryMedianMs = Number(median(without).toFixed(1));
      out.pressWithHistoryMedianMs = Number(median(withNew).toFixed(1));
      out.pressWithHistoryMaxMs = Number(Math.max(...withNew).toFixed(1));
      if (process.env.HD_OUT) writeFileSync(process.env.HD_OUT, JSON.stringify(out, null, 2));
      expect(Object.keys(out).length).toBeGreaterThan(6);
    } finally {
      await prisma.$disconnect();
    }
  },
);
