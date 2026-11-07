import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { describe, it } from 'vitest';

import type { AppConfigService } from '../../src/config/app-config.service';
import { CrashReportService } from '../../src/modules/crash-reports/crash-report.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Browser crash reports M1-T2 — the figures `docs/DATABASE.md` "CrashReport" asked for and could not
 * take when the table was authored without a database:
 *
 * 1. `EXPLAIN (ANALYZE, BUFFERS)` of the real upsert at 0, 999 and 1,000 rows, for a NEW hash and an
 *    EXISTING one (the cap check is a unique-key probe plus a count bounded by `LIMIT 1000`, so the
 *    claim to test is that its cost does not grow with the table).
 * 2. The HOT check: after 1,000 repeats of one row, `n_tup_hot_upd` and `n_dead_tup`. `last_seen_at`
 *    is indexed and rewritten on every repeat, so no repeat is expected to be a HOT update
 *    (`csp_reports` measured `n_tup_hot_upd = 0`); the figure to read is how little that costs.
 *
 * **DESTRUCTIVE: it empties `crash_reports`.** Run it on a throwaway database:
 *
 *   DATABASE_URL=postgresql://…  MEASURE_OUT=/path/crash-reports-upsert.txt \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts crash-reports-upsert
 *
 * The statement explained is the one the service really issues: it is captured from Prisma's query
 * log by calling `CrashReportService.record`, then re-run under EXPLAIN with its parameters
 * substituted, inside a transaction that is rolled back so the explained write leaves nothing behind.
 * Every figure is printed, and written to `MEASURE_OUT` when set.
 */
const ROLLBACK = new Error('rollback after EXPLAIN');
const RUNS = 3;

const bodyOf = (message: string) => ({
  name: 'TypeError',
  message,
  stack: 'TypeError: x\n    at PlanView (/assets/plan-Ab12.jsx:10:20)',
  componentStack: '\n    at PlanView (/assets/plan-Ab12.jsx:10:20)',
  routeId: '/_authed/orgs/$orgSlug/plans/$planId',
  boundary: 'route',
  webVersion: '0.200.7',
});

describe('crash reports — upsert plans and update churn', () => {
  it('explains the upsert at 0, 999 and 1,000 rows and counts HOT updates', async () => {
    const captured: { sql: string; params: string }[] = [];
    const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', (event) => {
      captured.push({ sql: event.query, params: event.params });
    });
    const service = new CrashReportService(
      client as unknown as PrismaService,
      { corsOrigins: [] } as unknown as AppConfigService,
      { warn: () => undefined } as unknown as PinoLogger,
    );
    const out: string[] = [];
    const say = (line: string) => {
      out.push(line);
    };

    const NEW = bodyOf('a brand new crash');
    const EXISTING = bodyOf('a crash already stored');

    const clear = () => client.crashReport.deleteMany();
    const filler = (rows: number) =>
      rows === 0
        ? Promise.resolve(0)
        : client.$executeRaw`
            INSERT INTO crash_reports (id, dedupe_hash, boundary, error_name, message, web_version,
                                       browser, count, first_seen_at, last_seen_at)
            SELECT gen_random_uuid(), encode(sha256(('seed' || g)::bytea), 'hex'), 'route', 'Error',
                   '', '1.0.0', 'other', 1, now(), now()
            FROM generate_series(1, ${rows}::int) g`;

    /** The INSERT the service issues for `body`, as text plus its bound parameters. */
    const statementFor = async (body: unknown) => {
      await clear();
      captured.length = 0;
      await service.record(body, 'Chrome/141');
      const insert = captured.find((q) => /INSERT INTO\s+"?crash_reports/i.test(q.sql));
      if (!insert) throw new Error('the service issued no INSERT');
      await clear();
      const params = JSON.parse(insert.params) as unknown[];
      return insert.sql.replace(/\$(\d+)/g, (_m, n: string) => {
        const value = params[Number(n) - 1];
        if (value === null || value === undefined) return 'NULL';
        // Prisma logs every bound value as a JSON string or number.
        if (typeof value === 'number') return String(value);
        return `'${(value as string).replace(/'/g, "''")}'`;
      });
    };

    const explain = async (label: string, text: string) => {
      const times: string[] = [];
      let last: string[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        try {
          await client.$transaction(async (tx) => {
            const plan = await tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
              `EXPLAIN (ANALYZE, BUFFERS) ${text}`,
            );
            last = plan.map((row) => row['QUERY PLAN']);
            throw ROLLBACK;
          });
        } catch (error) {
          if (error !== ROLLBACK) throw error;
        }
        times.push(last.find((line) => /^Execution Time/.test(line)) ?? 'no execution time');
      }
      say(`== ${label}`);
      say(`   ${times.join(' | ')}`);
      say(last.map((line) => `   ${line}`).join('\n'));
      say('');
    };

    const newText = await statementFor(NEW);
    const existingText = await statementFor(EXISTING);

    say('crash_reports upsert — EXPLAIN (ANALYZE, BUFFERS), three runs each, last plan printed');
    say('');
    for (const rows of [0, 999, 1_000]) {
      // NEW hash: the table holds `rows` unrelated rows.
      await clear();
      await filler(rows);
      await explain(`${String(rows)} rows, NEW hash`, newText);

      // EXISTING hash: the target is one of the `rows`.
      if (rows > 0) {
        await clear();
        await service.record(EXISTING, 'Chrome/141');
        await filler(rows - 1);
        await explain(`${String(rows)} rows, EXISTING hash`, existingText);
      }
    }

    // The HOT check: 1,000 sequential repeats of one row in a 1,000-row table.
    await clear();
    await service.record(EXISTING, 'Chrome/141');
    await filler(999);
    const stats = () =>
      client.$queryRaw<{ upd: bigint; hot: bigint; dead: bigint; live: bigint }[]>`
        SELECT n_tup_upd AS upd, n_tup_hot_upd AS hot, n_dead_tup AS dead, n_live_tup AS live
        FROM pg_stat_user_tables WHERE relname = 'crash_reports'`;
    const flush = async () => {
      // PostgreSQL 15+ flushes this backend's pending statistics on request; older servers need the
      // pause. Either way the counters are eventually consistent, which is why both are read late.
      await client.$queryRaw`SELECT pg_stat_force_next_flush()`.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    };
    await flush();
    const before = (await stats())[0];
    const started = Date.now();
    for (let i = 0; i < 1_000; i += 1) await service.record(EXISTING, 'Chrome/141');
    const elapsed = Date.now() - started;
    await flush();
    const after = (await stats())[0];
    const [row] = await client.crashReport.findMany({ where: { message: EXISTING.message } });
    const delta = (key: 'upd' | 'hot' | 'dead') =>
      Number(after?.[key] ?? 0n) - Number(before?.[key] ?? 0n);

    say('== HOT check: 1,000 sequential repeats of one row in a 1,000-row table');
    say(`   stored count of the repeated row: ${String(row?.count)} (expected 1001)`);
    say(
      `   wall time: ${String(elapsed)} ms (${(elapsed / 1_000).toFixed(2)} ms per report, through Prisma)`,
    );
    say(`   n_tup_upd +${String(delta('upd'))}   n_tup_hot_upd +${String(delta('hot'))}`);
    say(`   n_dead_tup before ${String(before?.dead)} -> after ${String(after?.dead)}`);
    say(`   n_live_tup after ${String(after?.live)}`);

    await clear();
    await client.$disconnect();

    const text = out.join('\n');
    process.stdout.write(`${text}\n`);
    writeFileSync(process.env.MEASURE_OUT ?? 'crash-reports-upsert.txt', text);
  }, 600_000);
});
