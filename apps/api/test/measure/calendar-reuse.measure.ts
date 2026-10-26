/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access --
   `EXPLAIN` rows are untyped and this is a measurement script, not a contract test. */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import { afterAll, describe, it } from 'vitest';

import { CalendarRepository } from '../../src/modules/calendars/calendar.repository';
import {
  calendarIdentityKey,
  identityAggregate,
  identityKeysFromFlatRows,
  sameAggregate,
} from '../../src/modules/interchange/calendar-identity';
import {
  resolveCalendarReuse,
  type ReuseCandidate,
} from '../../src/modules/interchange/calendar-reuse';
import { importedNameProbePrefix } from '../../src/modules/interchange/imported-name';

/**
 * ADR-0208 T1.6 — what does the calendar-reuse candidate read add to an import's dry-run, and does it
 * need an index? Measured BEFORE it is decided (ADR-0142), against the rule in the plan: an added p95
 * over 50 ms (a quarter of the 200 ms read target, CLAUDE.md §15) goes to database-architect with the
 * numbers, and no index or fingerprint column is added on a guess.
 *
 * Run against a DISPOSABLE database with migrations applied:
 *
 *   DATABASE_URL=postgresql://…/app_measure MEASURE_OUT=/path/run.json \
 *     pnpm --filter @repo/api exec vitest run --config vitest.measure.config.mts \
 *     test/measure/calendar-reuse.measure.ts
 *
 * **The seed is synthetic and worse than a real tenant on purpose**: ONE project holds
 * `VARIANTS` lineage variants of one name (`Site 6-Day (imported …)`), each with `EXCEPTIONS`
 * exceptions, and the organisation holds `LIBRARY` calendars in all (ADR-0053's ceiling of 1,000),
 * most of them ORG-tier with a different name. A real project that re-imported a programme fifty
 * times is already the unusual case this is bounding.
 *
 * "Before" is what the dry-run did on main: the taken-names probe for each tier in the graph. "After"
 * is that probe plus the candidate read (calendars, shifts, active exceptions, windows), the identity
 * keys, and the pure resolver. The graph carries one PROJECT calendar and one ORG calendar, so both
 * tiers are probed.
 */
const VARIANTS = Number(process.env.MEASURE_VARIANTS ?? 50);
const EXCEPTIONS = Number(process.env.MEASURE_EXCEPTIONS ?? 300);
const LIBRARY = Number(process.env.MEASURE_LIBRARY ?? 1000);
const RUNS = Number(process.env.MEASURE_RUNS ?? 15);

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

describe.skipIf(!process.env.DATABASE_URL)('calendar reuse candidate read (measurement)', () => {
  const prisma = new PrismaClient();
  const out: Record<string, unknown> = {};

  afterAll(async () => {
    if (process.env.MEASURE_OUT)
      writeFileSync(process.env.MEASURE_OUT, JSON.stringify(out, null, 2));
    await prisma.$disconnect();
  });

  it('measures', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Measure', slug: `measure-${Date.now()}` },
    });
    const organizationId = org.id;
    const client = await prisma.client.create({ data: { organizationId, name: 'C' } });
    const project = await prisma.project.create({
      data: { organizationId, clientId: client.id, name: 'P' },
    });
    const projectId = project.id;

    // The lineage: VARIANTS calendars named like the importer's own variants of "Site 6-Day".
    const lineage = Array.from({ length: VARIANTS }, (_, i) => ({
      id: randomUUID(),
      name:
        i === 0
          ? 'Site 6-Day'
          : `Site 6-Day (imported 2026-09-${String((i % 28) + 1).padStart(2, '0')})${i >= 28 ? ` (${String(Math.floor(i / 28) + 1)})` : ''}`,
    }));
    await prisma.calendar.createMany({
      data: lineage.map((c) => ({
        id: c.id,
        organizationId,
        name: c.name,
        scope: 'PROJECT' as const,
        projectId,
        hoursPerDayMinutes: 480,
      })),
    });
    // The library: the rest of the org's calendars, ORG tier, none of them in the lineage.
    const orgCalendars = Array.from({ length: Math.max(LIBRARY - VARIANTS, 0) }, (_, i) => ({
      id: randomUUID(),
      organizationId,
      name:
        i < 2 ? `Crew Shift${i === 0 ? '' : ' (imported 2026-09-01)'}` : `Library calendar ${i}`,
      scope: 'ORG' as const,
      hoursPerDayMinutes: 480,
    }));
    await prisma.calendar.createMany({ data: orgCalendars });

    const everyCalendar = [...lineage.map((c) => c.id), ...orgCalendars.map((c) => c.id)];
    await prisma.calendarShift.createMany({
      data: everyCalendar.flatMap((calendarId) =>
        [0, 1, 2, 3, 4].map((weekday) => ({
          calendarId,
          weekday,
          startMinute: 480,
          endMinute: 960,
        })),
      ),
    });
    // EXCEPTIONS single-day exceptions per lineage calendar (and per ORG "Crew Shift" pair).
    const heavy = [...lineage.map((c) => c.id), orgCalendars[0]!.id, orgCalendars[1]!.id];
    const exceptionRows = heavy.flatMap((calendarId) =>
      Array.from({ length: EXCEPTIONS }, (_, i) => {
        const day = new Date(Date.UTC(2026, 0, 1 + i));
        return {
          id: randomUUID(),
          organizationId,
          calendarId,
          startDate: day,
          endDate: day,
          label: `Day ${i}`,
        };
      }),
    );
    for (let at = 0; at < exceptionRows.length; at += 5000) {
      await prisma.calendarException.createMany({ data: exceptionRows.slice(at, at + 5000) });
    }
    for (const table of ['calendars', 'calendar_shifts', 'calendar_exceptions'])
      await prisma.$executeRawUnsafe(`ANALYZE ${table}`);
    out.seed = {
      variants: VARIANTS,
      exceptionsPerCalendar: EXCEPTIONS,
      libraryCalendars: LIBRARY,
      exceptionRows: exceptionRows.length,
    };

    const calendars = new CalendarRepository(prisma as never);
    const graph = [
      { name: 'Site 6-Day', scope: 'PROJECT' as const },
      { name: 'Crew Shift', scope: 'ORG' as const },
    ];
    const where = (scope: 'PROJECT' | 'ORG') => ({
      organizationId,
      scope,
      projectId: scope === 'PROJECT' ? projectId : null,
      prefixes: graph
        .filter((c) => c.scope === scope)
        .map((c) => importedNameProbePrefix(c.name, 120)),
    });

    const before = async (): Promise<void> => {
      await calendars.findTakenNamesWithPrefixes(where('PROJECT'));
      await calendars.findTakenNamesWithPrefixes(where('ORG'));
    };
    // The incoming calendar. "match" is the worst case for the read: it is identical to every
    // lineage variant, so every candidate survives the aggregate pre-filter and has its content
    // loaded. "differ" is the common re-import of a changed calendar: the pre-filter drops them all.
    const sourceShape = {
      hoursPerDayMinutes: 480,
      shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
      exceptions: Array.from(
        { length: process.env.MEASURE_SOURCE === 'differ' ? EXCEPTIONS - 1 : EXCEPTIONS },
        (_, i) => {
          const day = new Date(Date.UTC(2026, 0, 1 + i));
          return { startDate: day, endDate: day, label: `Day ${i}`, windows: [] };
        },
      ),
    };
    out.source = process.env.MEASURE_SOURCE === 'differ' ? 'differ' : 'match';
    const readMs: number[] = [];
    const after = async (): Promise<void> => {
      const candidatesByScope = new Map<'PROJECT' | 'ORG', ReuseCandidate[]>();
      const takenByScope = new Map<'PROJECT' | 'ORG', Set<string>>();
      const sourceAggregate = identityAggregate(sourceShape);
      for (const scope of ['ORG', 'PROJECT'] as const) {
        takenByScope.set(scope, await calendars.findTakenNamesWithPrefixes(where(scope)));
        const readStart = performance.now();
        const headers = await calendars.findReuseCandidates(where(scope));
        const survivors = headers.filter((h) => sameAggregate(sourceAggregate, h));
        const content = await calendars.loadReuseContent(survivors.map((h) => h.id));
        const keys = identityKeysFromFlatRows(
          new Map(survivors.map((h) => [h.id, h.hoursPerDayMinutes])),
          content,
        );
        readMs.push(performance.now() - readStart);
        candidatesByScope.set(
          scope,
          survivors.map((h) => ({
            id: h.id,
            name: h.name,
            createdAt: h.createdAt,
            identityKey: keys.get(h.id) ?? '',
          })),
        );
      }
      resolveCalendarReuse({
        calendars: graph.map((c, i) => ({
          key: `C${i}`,
          name: c.name,
          scope: c.scope,
          identityKey: calendarIdentityKey(sourceShape),
        })),
        candidatesByScope,
        takenByScope,
        today: '2026-10-26',
        maxNameLength: 120,
        onNoFreeName: () => {
          throw new Error('no free name');
        },
      });
    };

    await before();
    await after();
    const time = async (fn: () => Promise<void>): Promise<number[]> => {
      const ms: number[] = [];
      for (let i = 0; i < RUNS; i += 1) {
        const t0 = performance.now();
        await fn();
        ms.push(performance.now() - t0);
      }
      return ms;
    };
    const beforeMs = await time(before);
    readMs.length = 0;
    const afterMs = await time(after);
    out.before = { p50: percentile(beforeMs, 0.5), p95: percentile(beforeMs, 0.95), runs: RUNS };
    // Two tiers per run, so the read time per RUN is the sum of each pair.
    const readPerRun = Array.from(
      { length: RUNS },
      (_, i) => (readMs[2 * i] ?? 0) + (readMs[2 * i + 1] ?? 0),
    );
    out.readOnly = { p50: percentile(readPerRun, 0.5), p95: percentile(readPerRun, 0.95) };
    out.after = { p50: percentile(afterMs, 0.5), p95: percentile(afterMs, 0.95), runs: RUNS };
    out.addedP95Ms = percentile(afterMs, 0.95) - percentile(beforeMs, 0.95);
    out.addedP50Ms = percentile(afterMs, 0.5) - percentile(beforeMs, 0.5);

    // The candidate query's own plan, PROJECT tier (the heavy one: the lineage lives here).
    const plan = async (sql: string): Promise<string[]> =>
      (await prisma.$queryRawUnsafe<any[]>(sql)).map((r) => r['QUERY PLAN'] as string);
    out.explainCandidates = await plan(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id, name FROM calendars
       WHERE organization_id = '${organizationId}'::uuid AND scope = 'PROJECT'
         AND project_id = '${projectId}'::uuid AND deleted_at IS NULL AND archived_at IS NULL
         AND name LIKE 'Site 6-Day%'`);
    out.explainExceptions = await plan(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM calendar_exceptions
       WHERE calendar_id IN (${lineage.map((c) => `'${c.id}'::uuid`).join(',')}) AND deleted_at IS NULL
       ORDER BY start_date`);
    out.explainShifts = await plan(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM calendar_shifts
       WHERE calendar_id IN (${lineage.map((c) => `'${c.id}'::uuid`).join(',')})
       ORDER BY weekday, start_minute`);

    console.warn(
      JSON.stringify({ ...out, explainExceptions: undefined, explainShifts: undefined }, null, 2),
    );
  });
});
