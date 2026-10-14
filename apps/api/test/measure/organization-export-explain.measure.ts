import { writeFileSync } from 'node:fs';

import { Prisma, PrismaClient } from '@prisma/client';
import { describe, it } from 'vitest';

import { EXPORT_FILES } from '../../src/modules/organization-export/export-columns';
import { OrganizationExportRepository } from '../../src/modules/organization-export/organization-export.repository';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * ADR-0194 M2-T4 — `EXPLAIN (ANALYZE, BUFFERS)` for every read the organisation export makes.
 *
 * Run against a database that already holds the organisation to be measured (the 1-plan or 10-plan
 * fixture of `docs/specs/organisation-export/m2-measurements.md`):
 *
 *   DATABASE_URL=postgresql://…  EXPORT_ORG=measure-co  MEASURE_OUT=/path/explain.txt \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts organization-export-explain
 *
 * It drives the real repository inside a read-only snapshot with Prisma's query log on, captures the
 * statement each page really issues (the first page, and the second page with its keyset cursor, where
 * the file has one), substitutes the bound parameters and explains that exact text. Nothing here
 * writes: `EXPLAIN ANALYZE` of a SELECT runs it and discards the rows.
 */
describe('organisation export — EXPLAIN of every read', () => {
  it('explains each file’s first and second page', async () => {
    const slug = process.env.EXPORT_ORG ?? 'measure-co';
    const captured: { sql: string; params: string }[] = [];
    const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', (event) => {
      captured.push({ sql: event.query, params: event.params });
    });

    const org = await client.organization.findFirstOrThrow({ where: { slug } });
    const repository = new OrganizationExportRepository(client as unknown as PrismaService);
    const out: string[] = [];

    await client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SET TRANSACTION READ ONLY`;
        const scope = await repository.loadScope(tx, org.id);
        for (const file of EXPORT_FILES) {
          captured.length = 0;
          let pageNumber = 0;
          const seen: { sql: string; params: string }[] = [];
          for await (const rows of repository.pages(
            tx,
            file,
            scope,
            new AbortController().signal,
          )) {
            pageNumber += 1;
            // The page's own statement is the last SELECT captured since the previous page.
            const select = [...captured].reverse().find((q) => /^SELECT/.test(q.sql));
            if (select && (pageNumber === 1 || pageNumber === 2)) seen.push(select);
            captured.length = 0;
            if (pageNumber >= 2) break;
            void rows;
          }
          for (const [i, statement] of seen.entries()) {
            const params = JSON.parse(statement.params) as unknown[];
            const text = statement.sql.replace(/\$(\d+)/g, (_m, n: string) => {
              const value = params[Number(n) - 1];
              return typeof value === 'number'
                ? String(value)
                : `'${String(value).replace(/'/g, "''")}'`;
            });
            const plan = await tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
              `EXPLAIN (ANALYZE, BUFFERS) ${text}`,
            );
            out.push(
              `== ${file.file} — page ${String(i + 1)}\n${plan.map((r) => r['QUERY PLAN']).join('\n')}\n`,
            );
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 600_000 },
    );

    writeFileSync(process.env.MEASURE_OUT ?? 'organization-export-explain.txt', out.join('\n'));
    await client.$disconnect();
  });
});
