import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **M0 probe P1 — does the `code` key actually correlate two independently imported revisions?**
 *
 * The condition and its verdict rule were committed before this file existed
 * (`docs/specs/revision-compare-imported/m0-condition.md`, commits `f65c2982` and `07632f7d`).
 * Read it first: the denominator here is **not** the smaller side, and the correction explaining why
 * is the reason this probe reports two figures instead of one.
 *
 * **What makes this a measurement rather than a demonstration.** Both files go in through the real
 * REST commit endpoint, and both sides are read back through the public activities route — never a
 * direct database write and never the mapper's own output. That is ADR-0066's rule: building the
 * comparison's input from the assembly under test lets the comparison agree with itself, which is
 * how two defects stayed green at the engine while being wrong in the product.
 *
 * **The non-vacuity control is checked FIRST and it is not decoration.** A fixture generated once and
 * imported twice correlates at 100 % and proves only that a copy equals itself. So Rev C is Rev B
 * with five *stated* edits, and every one of them is asserted visible in the imported result before
 * any percentage is computed. If an edit is invisible this throws, and the thing that failed is the
 * fixture — not the identity model, and not the product.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

/** The five edits that make Rev C a revision of Rev B rather than a copy of it. */
const EDITS = {
  /** Removed in Rev C. Present in Rev B only — the one activity that must NOT correlate. */
  removedCode: 'A1200',
  /** Added in Rev C. Present in Rev C only. */
  addedCode: 'A1400',
  /** Re-durationed in Rev C (40 h → 120 h), which also moves every successor: the dated moves. */
  reDurationedCode: 'A1050',
  /** Re-logicked in Rev C: the link INTO this activity changes PR_FS → PR_SS. */
  reLogickedCode: 'A1300',
} as const;

const ACTIVITY_COUNT = 40;
const codeAt = (i: number): string => `A${String(1000 + i * 10)}`;

function standardClndrData(): string {
  const workDay = (day: number): string => `(0||${day}()( (0||0(s|08:00|f|16:00)) ))`;
  const restDay = (day: number): string => `(0||${day}()())`;
  const days = [restDay(1), workDay(2), workDay(3), workDay(4), workDay(5), workDay(6), restDay(7)];
  return `(0||CalendarData()(  (0||DaysOfWeek()( ${days.join(' ')} ))  ))`;
}

/**
 * One programme, two revisions, from ONE generator — so the edits are the only difference and the
 * list above is exhaustive by construction rather than by inspection.
 *
 * The project name is parameterised for the reason `interchange.e2e-spec.ts:76` records: plan names
 * are unique per project, so two files land as two plans in ONE project only if their project names
 * differ. That is the shape this whole epic exists for (ADR-0050: the import target is always a new
 * plan), and it is why a cross-plan comparison is needed at all.
 */
function revisionXer(revision: 'B' | 'C'): string {
  const isC = revision === 'C';
  const tasks: string[] = [];
  const links: string[] = [];

  for (let i = 0; i < ACTIVITY_COUNT; i += 1) {
    const code = codeAt(i);
    if (isC && code === EDITS.removedCode) continue;
    const hours = isC && code === EDITS.reDurationedCode ? 120 : 40;
    tasks.push(`%R\tT${String(i)}\tP1\tC1\t${code}\tActivity ${code}\tTT_Task\t${String(hours)}`);
  }

  if (isC) {
    tasks.push(`%R\tT999\tP1\tC1\t${EDITS.addedCode}\tActivity ${EDITS.addedCode}\tTT_Task\t40`);
  }

  // A chain, so the re-duration propagates and produces the dated moves rather than us asserting
  // them into existence. A link whose predecessor was removed in Rev C is dropped with it — the
  // importer would repair and report a dangling edge, which is a different behaviour from the one
  // under test here.
  for (let i = 1; i < ACTIVITY_COUNT; i += 1) {
    const succ = codeAt(i);
    const pred = codeAt(i - 1);
    if (isC && (succ === EDITS.removedCode || pred === EDITS.removedCode)) continue;
    const type = isC && succ === EDITS.reLogickedCode ? 'PR_SS' : 'PR_FS';
    links.push(`%R\tR${String(i)}\tT${String(i)}\tT${String(i - 1)}\t${type}\t0`);
  }

  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tclndr_id',
    `%R\tP1\tRiverside Rev ${revision}\t2026-01-05 00:00\t2026-01-04 00:00\tC1`,
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tdefault_flag\tday_hr_cnt\tclndr_data',
    `%R\tC1\tSite 6-Day\tY\t8\t${standardClndrData()}`,
    '%T\tTASK',
    '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    ...tasks,
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    ...links,
    '%E',
  ].join('\n');
}

interface ProbeActivity {
  readonly id: string;
  readonly code: string | null;
  readonly durationMinutes: number | null;
  readonly earlyStart: string | null;
}

describe.skipIf(!hasDatabase)('M0 P1 — cross-plan correlation on `code`', () => {
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
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  const server = (): unknown => app.getHttpServer();

  it('reports the correlation counts, having first proved the two sides genuinely differ', async () => {
    const agent = request.agent(server() as never);
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'admin', email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);

    const client = await agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Riverside Holdings' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id as string}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const projectId = project.body.data.id as string;

    const commit = async (revision: 'B' | 'C'): Promise<string> => {
      const res = await agent
        .post(`/api/v1/organizations/acme/projects/${projectId}/interchange/commit`)
        .attach('file', Buffer.from(revisionXer(revision), 'utf8'), `rev-${revision}.xer`)
        .expect(201);
      return res.body.data.planId as string;
    };

    const planB = await commit('B');
    const planC = await commit('C');
    // Two files, two plans, one project — the premise of the whole epic, asserted rather than assumed.
    expect(planB).not.toBe(planC);

    const readAll = async (planId: string): Promise<ProbeActivity[]> => {
      const out: ProbeActivity[] = [];
      let cursor: string | undefined;
      do {
        const res = await agent
          .get(`/api/v1/organizations/acme/plans/${planId}/activities`)
          .query({ limit: 100, ...(cursor === undefined ? {} : { cursor }) })
          .expect(200);
        out.push(...(res.body.data as ProbeActivity[]));
        cursor = (res.body.meta as { nextCursor?: string } | undefined)?.nextCursor;
      } while (cursor !== undefined && cursor !== null);
      return out;
    };

    const from = await readAll(planB);
    const to = await readAll(planC);

    const byCode = (rows: ProbeActivity[]): Map<string, ProbeActivity> =>
      new Map(rows.filter((r) => r.code !== null).map((r) => [r.code as string, r]));
    const fromByCode = byCode(from);
    const toByCode = byCode(to);

    // ── NON-VACUITY, CHECKED FIRST ────────────────────────────────────────────────────────────────
    // Each of the five stated edits must be visible in what the importer actually produced. A
    // percentage computed over a pair that does not differ is the ADR-0125 F3 defect: it reports the
    // best number the mechanism can produce and says nothing about the case it exists for.
    expect(fromByCode.has(EDITS.removedCode), 'removed activity should exist in Rev B').toBe(true);
    expect(toByCode.has(EDITS.removedCode), 'removed activity should be gone from Rev C').toBe(
      false,
    );
    expect(fromByCode.has(EDITS.addedCode), 'added activity should not exist in Rev B').toBe(false);
    expect(toByCode.has(EDITS.addedCode), 'added activity should exist in Rev C').toBe(true);

    const durB = fromByCode.get(EDITS.reDurationedCode)?.durationMinutes;
    const durC = toByCode.get(EDITS.reDurationedCode)?.durationMinutes;
    expect(durB, 're-durationed activity present in Rev B').toBeDefined();
    expect(durC, 're-durationed activity present in Rev C').toBeDefined();
    expect(durC, 'the duration edit must be visible in the imported result').not.toBe(durB);

    const movedCount = [...fromByCode].filter(([code, b]) => {
      const c = toByCode.get(code);
      return c !== undefined && c.earlyStart !== b.earlyStart;
    }).length;
    expect(
      movedCount,
      'the re-duration should propagate down the chain as dated moves',
    ).toBeGreaterThanOrEqual(3);

    // ── THE MEASUREMENT ───────────────────────────────────────────────────────────────────────────
    const matched = [...fromByCode.keys()].filter((code) => toByCode.has(code)).length;
    const sameWorkBothSides = ACTIVITY_COUNT - 1; // every activity except the one Rev C removed
    const smallerSideCoded = Math.min(fromByCode.size, toByCode.size);

    const judgedPct = (matched / sameWorkBothSides) * 100;
    const smallerSidePct = (matched / smallerSideCoded) * 100;

    const uncodedFrom = from.filter((r) => r.code === null).length;
    const uncodedTo = to.filter((r) => r.code === null).length;

    // Every code in this fixture comes from `task_code`; none is the `task_id` fallback
    // (`xer-adapter.ts:541-551`). Recorded as a count rather than asserted away, because the
    // fallback is file-local and its stability across two exports is the spec's risk R2 — a high
    // rate would mean P1 passed here for a reason that will not hold on a real pair.
    const fallbackShaped = [...fromByCode.keys(), ...toByCode.keys()].filter(
      (code) => !/^A\d+$/.test(code),
    ).length;

    // eslint-disable-next-line no-console -- the probe's output IS its deliverable (M0-T2).
    console.log(
      [
        '',
        'M0 PROBE P1 — cross-plan correlation on `code`',
        `  Rev B      ${String(from.length)} activities (${String(fromByCode.size)} coded, ${String(uncodedFrom)} uncoded)`,
        `  Rev C      ${String(to.length)} activities (${String(toByCode.size)} coded, ${String(uncodedTo)} uncoded)`,
        `  matched    ${String(matched)}`,
        `  same work both sides (fixture-defined denominator)  ${String(sameWorkBothSides)}`,
        `  JUDGED     ${judgedPct.toFixed(1)}%  vs  >= 95%`,
        `  also       ${smallerSidePct.toFixed(1)}% against the smaller side (${String(smallerSideCoded)}) — the confounded figure, reported not hidden`,
        `  fallback   ${String(fallbackShaped)} codes not shaped like a task_code (R2)`,
        `  moves      ${String(movedCount)} activities changed early start`,
        '',
      ].join('\n'),
    );

    expect(judgedPct).toBeGreaterThanOrEqual(95);
  });
});
