import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Prisma, PrismaClient } from '@prisma/client';
import { describe, it } from 'vitest';

import { EXPORT_FILES } from '../../src/modules/organization-export/export-columns';
import {
  csvHeader,
  csvRecord,
  jsonLine,
} from '../../src/modules/organization-export/export-serialise';
import { createExportWriter } from '../../src/modules/organization-export/export-writer';
import { OrganizationExportRepository } from '../../src/modules/organization-export/organization-export.repository';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * ADR-0194 M2-T4 — where does an export's time go? Three passes over the same organisation inside one
 * read-only snapshot, each adding one stage: (1) read every page, (2) read and serialise to JSON and
 * CSV text, (3) the whole writer into a stream that discards its bytes. The differences are the cost
 * of serialising and of the ZIP; (1) is the database and Prisma.
 *
 *   DATABASE_URL=postgresql://…  EXPORT_ORG=measure-co \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts organization-export-stages
 */
describe('organisation export — stage costs', () => {
  it('times read, read+serialise and the full writer', async () => {
    const client = new PrismaClient();
    const org = await client.organization.findFirstOrThrow({
      where: { slug: process.env.EXPORT_ORG ?? 'measure-co' },
    });
    const repository = new OrganizationExportRepository(client as unknown as PrismaService);
    const results: string[] = [];

    await client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SET TRANSACTION READ ONLY`;
        const scope = await repository.loadScope(tx, org.id);
        const signal = new AbortController().signal;

        let started = performance.now();
        let rows = 0;
        for (const file of EXPORT_FILES) {
          const fileStarted = performance.now();
          let fileRows = 0;
          let fileChars = 0;
          for await (const page of repository.pages(tx, file, scope, signal)) {
            fileRows += page.length;
            for (const row of page)
              fileChars += jsonLine(file, row).length + csvRecord(file, row).length;
          }
          rows += fileRows;
          results.push(
            `   ${file.file}: ${fileRows} rows, ${fileChars} chars (json+csv), read+serialise ${Math.round(performance.now() - fileStarted)} ms`,
          );
        }
        results.push(
          `1. read + serialise once, per file (above): ${rows} rows in ${Math.round(performance.now() - started)} ms`,
        );
        started = performance.now();
        rows = 0;
        for (const file of EXPORT_FILES) {
          for await (const page of repository.pages(tx, file, scope, signal)) rows += page.length;
        }
        results.push(
          `1b. read only: ${rows} rows in ${Math.round(performance.now() - started)} ms`,
        );

        started = performance.now();
        let chars = 0;
        for (const file of EXPORT_FILES) {
          chars += csvHeader(file).length;
          for await (const page of repository.pages(tx, file, scope, signal)) {
            for (const row of page) {
              chars += jsonLine(file, row).length + csvRecord(file, row).length;
            }
          }
        }
        results.push(
          `2. read + serialise (once each): ${chars} chars in ${Math.round(performance.now() - started)} ms`,
        );

        started = performance.now();
        let bytes = 0;
        const writer = createExportWriter({
          source: { pages: (file, s) => repository.pages(tx, file, scope, s) },
          signal,
          manifest: {
            generatedAt: new Date(),
            apiVersion: 'measure',
            organization: { id: org.id, slug: org.slug, name: org.name },
            exportedBy: { userId: 'measure', name: 'measure' },
          },
        });
        await pipeline(
          writer.output,
          new Writable({
            write(chunk: Buffer, _enc, cb) {
              bytes += chunk.length;
              cb();
            },
          }),
        );
        results.push(
          `3. full writer to a discarding sink: ${bytes} bytes in ${Math.round(performance.now() - started)} ms (${JSON.stringify(writer.summary().entries.reduce((n, e) => n + e.bytes, 0))} uncompressed)`,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 600_000 },
    );
    process.stdout.write(`${results.join('\n')}\n`);
    await client.$disconnect();
  });
});
