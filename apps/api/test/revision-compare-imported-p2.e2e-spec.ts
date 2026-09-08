import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { BaselineRepository } from '../src/modules/baselines/baseline.repository';
import { classifyRevisionChanges } from '../src/modules/baselines/revision-changes';
import {
  computeRevisionDelta,
  type RevisionEdge,
  type RevisionRow,
} from '../src/modules/baselines/revision-delta';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **M0 probe P2 — what does the correlate-and-compare path cost at 2,000 activities per side?**
 *
 * Condition and verdict rule committed before this file existed
 * (`docs/specs/revision-compare-imported/m0-condition.md`): **p95 ≤ 250 ms**, the bar ADR-0125
 * committed and met at 65.8 ms for a ONE-sided comparison. The new work here is the second side plus
 * the correlation.
 *
 * **What this measures, stated precisely so the figure is not over-read.** It calls the **real
 * loaders** the shipped route already uses — `loadActiveActivitiesForDelta` and
 * `loadActiveDependenciesForDelta` — twice, once per plan, and then the **real pure functions**,
 * `computeRevisionDelta` and `classifyRevisionChanges`. The one thing it does NOT use is the shipped
 * correlation, **because that is M1's work and does not exist yet**; the probe supplies its own
 * `code`-keyed join of the same shape.
 *
 * So this is the dominant cost with a stand-in for the cheapest step. **M1-T4 re-derives it
 * end-to-end against the real route, and both numbers are recorded with any divergence stated
 * rather than smoothed** — ADR-0125's F3 lesson, where a second run agreeing to the decimal would
 * have been more suspicious than one that did not.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

const REPO_ROOT = join(__dirname, '..', '..', '..');
/**
 * **25, not 7 — and the reason is a defect in the first version of this probe, recorded rather than
 * quietly fixed.** With 7 samples `sorted[floor(0.95 × n)]` is `sorted[6]`, i.e. the **maximum**: the
 * estimator reported the worst sample and called it a p95. The first run failed the bar at 277.8 ms
 * on exactly that — a single cold sample of 278 against a median of 220. The bar is NOT moved; the
 * instrument is corrected, and both figures are reported so the correction cannot hide a real result.
 */
const ITERATIONS = 25;

/** The bar, inherited from ADR-0125 rather than invented for this epic. */
const P2_BAR_MS = 250;

/**
 * What `loadActiveActivitiesForDelta` selects. Deliberately NOT re-declared field by field: the
 * repository's own return type is the contract, and a hand-copied mirror is exactly the second
 * opinion that drifts (ADR-0065's `routeOrthogonal` argument).
 */
type LoadedActivity = Awaited<
  ReturnType<BaselineRepository['loadActiveActivitiesForDelta']>
>[number];

const day = (d: Date | null): string | null => (d === null ? null : d.toISOString().slice(0, 10));

describe.skipIf(!hasDatabase)('M0 P2 — the cross-plan compare path at scale', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await app.init();
    prisma = app.get(Token);
    await clearDomainData(prisma);
  }, 120_000);

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  it('measures both sides at 2,000 activities and judges against the committed bar', async () => {
    // ── Two 2,000-activity sides, from the generator the plan names ─────────────────────────────
    const dir = mkdtempSync(join(tmpdir(), 'rev-compare-p2-'));
    const revB = join(dir, 'rev-b.xer');
    execFileSync(
      'node',
      [join(REPO_ROOT, 'packages/interchange/scripts/generate-scale-xer.mjs'), '2000', revB],
      { cwd: REPO_ROOT, stdio: 'ignore' },
    );

    // Rev C is Rev B with the project renamed (so it lands as a SECOND plan in one project — plan
    // names are unique per project) and a slice of durations changed, so the two sides genuinely
    // differ. A benchmark over two identical schedules reports the fastest number the mechanism
    // can produce and says nothing about the case it exists for (ADR-0125 F3).
    const source = readFileSync(revB, 'utf8');
    let edits = 0;
    const revCText = source
      .replace('Scale programme', 'Scale programme REV C')
      .split('\n')
      .map((line) => {
        if (!line.startsWith('%R\t') || !line.includes('TT_Task') || edits >= 200) return line;
        edits += 1;
        // Widen this task's duration. The column order comes from the generator's own %F row.
        return line.replace(/\t24\t/, '\t48\t');
      })
      .join('\n');
    const revC = join(dir, 'rev-c.xer');
    writeFileSync(revC, revCText, 'utf8');

    // ── Import both through the real commit endpoint ─────────────────────────────────────────────
    const agent = request.agent(app.getHttpServer() as never);
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'p2@example.com', password: PASSWORD })
      .expect(200);
    const org = await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const orgId = org.body.data.id as string;
    const client = await agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Riverside Holdings' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;

    const commit = async (file: string): Promise<string> => {
      const res = await agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/interchange/commit`)
        .attach('file', readFileSync(file), 'rev.xer')
        .expect(201);
      return res.body.data.planId as string;
    };
    const planB = await commit(revB);
    const planC = await commit(revC);
    expect(planB).not.toBe(planC);

    // ── The path under measurement ──────────────────────────────────────────────────────────────
    const { BaselineRepository: RepoToken } =
      await import('../src/modules/baselines/baseline.repository');
    const baselines = app.get<BaselineRepository>(RepoToken);

    // The live-side projection, copied from `schedule.service.ts:1641-1655` — the one the shipped
    // route already builds. M1 moves this into the correlation module rather than leaving two.
    const project_ = (rows: readonly LoadedActivity[]): RevisionRow[] =>
      rows.map((r) => ({
        activityId: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        durationMinutes: r.durationMinutes,
        isCritical: r.isCritical,
        totalFloatDays: r.totalFloat,
        earlyStart: day(r.earlyStart),
        earlyFinish: day(r.earlyFinish),
        laneIndex: r.laneIndex,
        parentId: r.parentId,
        calendarId: r.calendarId,
        constraintType: r.constraintType,
        constraintDate: day(r.constraintDate),
        secondaryConstraintType: r.secondaryConstraintType,
        secondaryConstraintDate: day(r.secondaryConstraintDate),
        percentComplete: r.percentComplete === null ? null : Number(r.percentComplete),
        actualStart: day(r.actualStart),
        actualFinish: day(r.actualFinish),
      }));

    /**
     * The correlation M1 will ship, written here so P2 measures its shape rather than omitting it.
     * Keys on `code`, matched EXACTLY — no case folding, because `uq_activities_plan_code` is a
     * case-sensitive btree and folding would manufacture a collision the product permits.
     */
    const correlate = (from: RevisionRow[], to: RevisionRow[]): [RevisionRow[], RevisionRow[]] => {
      const toByCode = new Map(to.filter((r) => r.code !== null).map((r) => [r.code as string, r]));
      const outFrom: RevisionRow[] = [];
      const outTo: RevisionRow[] = [];
      for (const f of from) {
        if (f.code === null) continue;
        const t = toByCode.get(f.code);
        if (t === undefined) {
          outFrom.push(f);
          continue;
        }
        // The shared key: the correlated pair is presented to the pure delta under ONE id, which
        // is the whole of what makes a cross-plan comparison a change of what fills that slot.
        outFrom.push({ ...f, activityId: f.code });
        outTo.push({ ...t, activityId: f.code });
      }
      for (const t of to) {
        if (t.code !== null && !from.some((f) => f.code === t.code)) {
          outTo.push({ ...t, activityId: t.code });
        }
      }
      return [outFrom, outTo];
    };

    const samples: number[] = [];
    let lastMatched = 0;
    let lastChanges = 0;

    for (let i = 0; i < ITERATIONS; i += 1) {
      const t0 = performance.now();

      const [aRows, bRows, aEdges, bEdges] = await Promise.all([
        baselines.loadActiveActivitiesForDelta(orgId, planB),
        baselines.loadActiveActivitiesForDelta(orgId, planC),
        baselines.loadActiveDependenciesForDelta(orgId, planB),
        baselines.loadActiveDependenciesForDelta(orgId, planC),
      ]);

      const [fromSide, toSide] = correlate(project_(aRows), project_(bRows));
      const delta = computeRevisionDelta(fromSide, toSide, 500, (a, b) => {
        const ms = new Date(b).getTime() - new Date(a).getTime();
        return Math.round(ms / 86_400_000);
      });
      // `liveEdges`'s normalisation, from `schedule.service.ts` — the loader returns `id` and the
      // pure function wants `dependencyId`. Normalised HERE for the reason that service records:
      // one type downstream, so nothing needs a cast to tell the two branches apart.
      const asEdges = (
        rows: readonly {
          id: string;
          predecessorId: string;
          successorId: string;
          type: RevisionEdge['type'];
          lagMinutes: number;
          lagCalendar: RevisionEdge['lagCalendar'];
        }[],
      ): RevisionEdge[] =>
        rows.map((e) => ({
          dependencyId: e.id,
          predecessorId: e.predecessorId,
          successorId: e.successorId,
          type: e.type,
          lagMinutes: e.lagMinutes,
          lagCalendar: e.lagCalendar,
        }));

      const changes = classifyRevisionChanges(
        { rows: fromSide, edges: asEdges(aEdges) },
        { rows: toSide, edges: asEdges(bEdges) },
        {
          fromScheduled: true,
          toScheduled: true,
          // Both sides are live imported plans, so every paid class IS recorded — which is the
          // cross-plan case's one advantage over a pre-ADR-0126 baseline.
          bothSnapshotted: true,
          includeProgress: true,
          calendarName: () => null,
          cap: 500,
        },
      );

      samples.push(performance.now() - t0);
      lastMatched = toSide.length;
      lastChanges = changes.classes.reduce((n, c) => n + c.rows.length, 0);
      void delta;
    }

    // ── NON-VACUITY, checked before the verdict ─────────────────────────────────────────────────
    expect(lastMatched, 'both sides must be non-empty').toBeGreaterThan(1_000);
    expect(
      lastChanges,
      'the two sides must genuinely differ, or this measures the fastest path',
    ).toBeGreaterThan(0);

    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    const worst = sorted[sorted.length - 1] ?? 0;
    // Reported beside the judged figure because the first sample is a cold one — the trend in the
    // failing run was monotonically downward — and a reader deserves to see whether the verdict
    // turns on warming rather than on the path.
    const firstSample = samples[0] ?? 0;

    /**
     * **Written to a FILE, not to the console, and that is not a preference.**
     *
     * Reading it from stdout needs `--disable-console-intercept`, and that flag **breaks vitest's
     * path filter**: the run collects all 52 e2e files instead of one, so the probe times itself
     * while ~600 other tests hammer the same database. Measured — the first seven samples came
     * back at ~7,000 ms and then fell to ~150 ms as the rest of the suite drained, and that same
     * contention is what made an earlier run's change-row count look bimodal. Every P2 figure
     * taken through the console was therefore measuring the suite, not the path.
     *
     * A file needs no flag, so the probe can run alone. `P2_REPORT` overrides the location.
     */
    const report = [
      '',
      'M0 PROBE P2 — the cross-plan compare path',
      `  sides      ${String(lastMatched)} correlated rows, ${String(lastChanges)} change rows`,
      `  iterations ${String(ITERATIONS)}`,
      `  p50        ${p50.toFixed(1)} ms`,
      `  p95        ${p95.toFixed(1)} ms   vs  <= ${String(P2_BAR_MS)} ms`,
      `  worst      ${worst.toFixed(1)} ms   (first sample ${firstSample.toFixed(1)} ms — cold)`,
      `  all        ${samples.map((s) => s.toFixed(0)).join(', ')} ms`,
      '',
      '  Measures the real loaders (twice, once per plan) and the real pure functions.',
      "  The correlation is the probe's own — M1 has not shipped one yet. M1-T4 re-derives",
      '  this end-to-end against the shipped route and states any divergence.',
      '',
    ].join('\n');
    writeFileSync(process.env.P2_REPORT ?? join(tmpdir(), 'm0-p2-result.txt'), report, 'utf8');

    expect(p95).toBeLessThanOrEqual(P2_BAR_MS);
  }, 600_000);
});
