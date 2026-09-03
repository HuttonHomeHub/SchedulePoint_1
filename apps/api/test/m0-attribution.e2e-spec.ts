import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { afterAll, describe, it } from 'vitest';

import { AppModule } from '../src/app.module';
import {
  isPerturbableType,
  measureCarrierMovementDays,
  selectCompletionCarrier,
} from '../src/modules/schedule/completion-carrier';
import { computeSchedule, type ComputeOptions } from '../src/modules/schedule/engine/compute';
import type { EngineActivity, EngineEdge } from '../src/modules/schedule/engine/types';
import { buildWorkingTimeCalendar } from '../src/modules/schedule/engine/working-time-calendar';
import { ScheduleService } from '../src/modules/schedule/schedule.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * **M0-T3/T4 — the Revision Compare attribution measurement.**
 *
 * Judged against `docs/specs/revision-compare/m0-condition.md`, committed before this existed.
 *
 * **Where it bypasses the product (ADR-0081 §3):** it does not go through the REST API, the plan
 * edit-lock or any write path. It reads the seeded plan and calls `computeSchedule` directly. A PASS
 * says the METHOD works; it says nothing about a DTO, a guard, or the route's end-to-end cost.
 *
 * It builds its input with the service's own `buildEngineGraph` — verified in
 * `m0-engine-input.e2e-spec.ts` to reproduce the product's schedule exactly. An earlier harness used
 * `test/pairwise/spec-to-engine.ts` and scheduled a plan four and a half months different.
 *
 * **Skips when the fixture is not seeded**, so CI is unaffected.
 */
interface Input {
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
}

/**
 * Vitest buffers `console.log` per-task, so the run's numbers have to survive it — they are written
 * to a file as well as to stdout.
 *
 * **Every filesystem write here is best-effort and swallowed.** The first version wrote to a
 * hard-coded developer scratchpad path and did it BEFORE the fixture check, so on CI — where that
 * directory does not exist — the spec threw `ENOENT` and failed the whole e2e job. It looked
 * perfectly fine locally, and the PR that carried it claimed "skips cleanly when the fixture is
 * absent, so CI is unaffected". CI was affected. A measurement harness must never be able to fail a
 * build over where it puts its own notes.
 *
 * The path is **fixed**, under the OS temp directory. It was briefly configurable through an
 * `M0_REPORT` environment variable, and CodeQL was right to flag that as `js/path-injection`
 * (high): an environment value flowing unchecked into a filesystem write is a real sink, and the
 * configurability bought nothing — nobody needs to choose where a throwaway measurement log lands.
 * Removing the parameter removes the taint source outright, which beats sanitising it.
 */
const REPORT = join(tmpdir(), 'schedulepoint-m0-report.txt');
const write = (fn: typeof appendFileSync, body: string): void => {
  try {
    fn(REPORT, body);
  } catch {
    // The stdout copy below is the one that matters; a report file is a convenience.
  }
};
const say = (line: string): void => {
  write(appendFileSync, `${line}\n`);
  process.stdout.write(`${line}\n`);
};

const M0_CLASSES = ['SCOPE', 'DURATION', 'LOGIC', 'BOUNDS', 'CALENDAR', 'PROGRESS'] as const;
type M0Class = (typeof M0_CLASSES)[number];

const clone = (i: Input): Input => ({
  activities: i.activities.map((a) => ({ ...a })),
  edges: i.edges.map((e) => ({ ...e })),
  options: { ...i.options },
});

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Targets walked back from the carrier along **DRIVING edges only** (`EngineEdgeResult.isDriving`).
 *
 * The first version of this walked ordinary predecessors, and four of the six classes attributed
 * **exactly zero** — not because the class cannot act, but because an ancestor with float absorbs
 * whatever is done to it. C4-b asks for classes that "compete for the same float"; the driving
 * chain IS that set, by the engine's own definition, so it is read from the engine rather than
 * guessed at. Recorded rather than quietly corrected: the zero run is in `m0-measurement.md`.
 */
function drivingChainFromCarrier(i: Input, count: number): EngineActivity[] {
  const control = computeSchedule(i.activities, i.edges, i.options);
  const carrier = selectCompletionCarrier(i.activities, control.results);
  if (carrier === undefined) return [];
  const driving = new Set(control.edges.filter((e) => e.isDriving).map((e) => e.edgeId));
  const byId = new Map(i.activities.map((a) => [a.id, a]));
  const preds = new Map<string, EngineEdge[]>();
  for (const e of i.edges) {
    if (!driving.has(e.id)) continue;
    const l = preds.get(e.successorId);
    if (l) l.push(e);
    else preds.set(e.successorId, [e]);
  }
  const seen = new Set([carrier.activityId]);
  const queue = [carrier.activityId];
  const out: EngineActivity[] = [];
  while (queue.length > 0 && out.length < count) {
    const id = queue.shift()!;
    for (const e of preds.get(id) ?? []) {
      if (seen.has(e.predecessorId)) continue;
      seen.add(e.predecessorId);
      queue.push(e.predecessorId);
      const a = byId.get(e.predecessorId);
      if (a !== undefined && isPerturbableType(a.type)) out.push(a);
      if (out.length >= count) break;
    }
  }
  return out;
}

/** The driving edge immediately feeding an activity, if any — the LOGIC class's only useful target. */
function drivingEdgeInto(i: Input, activityId: string): EngineEdge | undefined {
  const control = computeSchedule(i.activities, i.edges, i.options);
  const driving = new Set(control.edges.filter((e) => e.isDriving).map((e) => e.edgeId));
  return i.edges.find((e) => e.successorId === activityId && driving.has(e.id));
}

/** Carrier movement between two inputs, measured on the CARRIER's own calendar. */
function movementDays(base: Input, next: Input): number {
  const control = computeSchedule(base.activities, base.edges, base.options);
  const carrier = selectCompletionCarrier(base.activities, control.results);
  if (carrier === undefined) return Number.NaN;
  const after = computeSchedule(next.activities, next.edges, next.options);
  const post = after.results.find((r) => r.activityId === carrier.activityId);
  if (post === undefined) return Number.NaN;
  const ca = base.activities.find((a) => a.id === carrier.activityId);
  return measureCarrierMovementDays({
    carrier,
    carrierPerturbed: post,
    calendar: ca?.calendar ?? base.options.calendar,
    dayFactorMinutes: 8 * 60,
  });
}

describe('M0 — attribution', () => {
  let close: (() => Promise<void>) | undefined;
  afterAll(async () => {
    if (close) await close();
  });

  it('runs C4 then C1 then C2 against the product graph', async () => {
    const app = await NestFactory.createApplicationContext(AppModule);
    close = () => app.close();
    const prisma = app.get(PrismaService);
    const schedule = app.get(ScheduleService);

    const plan = await prisma.plan.findFirst({
      where: { name: { contains: 'torture' }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (plan === null) {
      // The seeded fixture is a developer-machine artefact (ADR-0066 catalogue), not part of CI's
      // provisioning, so this is the normal path on a CI runner.
      console.warn('SKIP: fixture plan not seeded');
      return;
    }
    write(writeFileSync, `M0 attribution run ${new Date().toISOString()}\n`);
    const planned = (plan as { plannedStart?: Date | null }).plannedStart;
    const dataDate =
      planned instanceof Date ? planned.toISOString().slice(0, 10) : String(planned ?? '');
    const svc = schedule as unknown as {
      buildEngineGraph: (o: string, p: unknown, d: string, tx: unknown) => Promise<Input>;
    };
    const g = await prisma.$transaction((tx) =>
      svc.buildEngineGraph(plan.organizationId, plan, dataDate, tx),
    );
    const base: Input = { activities: g.activities, edges: g.edges, options: g.options };

    const control = computeSchedule(base.activities, base.edges, base.options);
    say(
      `base: ${base.activities.length} activities, finish ${control.summary.projectFinish}, critical ${control.summary.criticalCount}`,
    );

    const carrier0 = selectCompletionCarrier(base.activities, control.results);
    const ca0 = base.activities.find((a) => a.id === carrier0?.activityId);
    say(
      `carrier: ${ca0?.id ?? '(none)'} type=${ca0?.type ?? '?'} ` +
        `constraint=${ca0?.constraintType ?? 'none'} finish=${carrier0?.earlyFinish ?? '?'}`,
    );
    const t = drivingChainFromCarrier(base, 6);
    say(`driving-chain targets available: ${t.length}`);
    // Diagnostics before any verdict: the first run attributed zero for four classes and the
    // tempting explanation (the targets carry float) is a claim, not an observation — ADR-0076
    // Class 3. Print what the engine actually says about each target instead.
    for (const a of t) {
      const r = control.results.find((x) => x.activityId === a.id);
      say(
        `  target ${a.id.slice(-12)} type=${a.type} dur=${a.durationMinutes}m ` +
          `TF=${r?.totalFloat ?? '?'} crit=${r?.isCritical ?? '?'} ` +
          `ownCal=${a.calendar !== undefined} started=${a.actualStart != null} ` +
          `ES=${r?.earlyStart?.slice(0, 10) ?? '?'}`,
      );
    }
    const drivingIntoT0 = drivingEdgeInto(base, t[0]!.id);
    say(`driving edge into t0: ${drivingIntoT0 ? 'yes' : 'NONE'}`);
    say(
      `plan calendar minutes in one week = ${base.options.calendar.workingTimeBetween('2026-06-01T00:00', '2026-06-08T00:00')}`,
    );
    if (t.length < 6) {
      say(
        'C4 CANNOT BE SATISFIED: too few perturbable driving-chain targets — the predicate is vacuous.',
      );
      return;
    }
    const [, t1, t2, t3, t4] = t as [
      EngineActivity,
      EngineActivity,
      EngineActivity,
      EngineActivity,
      EngineActivity,
      EngineActivity,
    ];
    const ONE_DAY_WEEK = buildWorkingTimeCalendar(
      Array.from({ length: 7 }, (_, w) => (w === 3 ? [{ startMinute: 480, endMinute: 960 }] : [])),
      [],
    );

    // Every perturbation is sized at PERTURB_DAYS working days. The first run used 8-15 days and
    // four classes attributed exactly zero — the diagnostics above say why: `t0` carries 12,360
    // minutes (25.75 working days) of total float, so anything upstream of it smaller than that is
    // absorbed before it reaches the carrier. A class that cannot clear the slack on its own path
    // is not being exercised, which is precisely what C4-c forbids. The size is stated rather than
    // tuned until the numbers looked good.
    const PERTURB_DAYS = 40;
    const PERTURB_MIN = PERTURB_DAYS * 8 * 60;
    const SCOPE_INSERT_ID = 'm0-scope-inserted-activity';
    const boundsDate = addDays(
      control.results.find((r) => r.activityId === t2.id)!.earlyStart.slice(0, 10),
      PERTURB_DAYS + 14,
    );
    const carrierId = carrier0!.activityId;
    const feedEdge = drivingEdgeInto(base, carrierId);
    const engineDataDate = base.options.dataDate;

    const edits: Record<M0Class, (i: Input) => Input> = {
      LOGIC: (i) => {
        // Lag on the driving edge INTO THE CARRIER. Targeting the driving edge into t0 (the first
        // version) put the lag behind t0's 25.75 days of float and attributed zero.
        const o = clone(i);
        for (const e of o.edges) if (feedEdge && e.id === feedEdge.id) e.lagMinutes += PERTURB_MIN;
        return o;
      },
      DURATION: (i) => {
        const o = clone(i);
        for (const a of o.activities) if (a.id === t1.id) a.durationMinutes += PERTURB_MIN;
        return o;
      },
      BOUNDS: (i) => {
        // SNET is a forward bound: it only bites when it lands AFTER the activity's early start, so
        // the date is anchored on t2's position in R_old. Deliberately NOT re-derived from the
        // accumulated input: a planner's revision sets a specific date, and re-anchoring per step
        // would make this class order-dependent by construction — an artefact of the generator
        // rather than a property of the network, which is the thing C2 exists to measure.
        const o = clone(i);
        for (const a of o.activities)
          if (a.id === t2.id) {
            a.constraintType = 'SNET';
            a.constraintDate = boundsDate;
          }
        return o;
      },
      CALENDAR: (i) => {
        // A genuine ADR-0037 per-activity calendar change: t3 moves onto a one-day working week
        // (Wednesday 08:00-16:00 = 480 min/week against the plan's 2,400). Strictly more
        // restrictive, so the activity's span stretches in absolute time while its
        // `durationMinutes` is untouched — which is what makes this class distinct from DURATION.
        const o = clone(i);
        for (const a of o.activities) if (a.id === t3.id) a.calendar = ONE_DAY_WEEK;
        return o;
      },
      PROGRESS: (i) => {
        // No activity on this chain is in progress, so remaining-work alone is inert (ADR-0035 §4
        // — the engine ignores `remainingMinutes` unless the activity is started and unfinished).
        // The PROGRESS class IS actuals plus remaining, so the edit supplies both.
        //
        // Sized at 3x. Marking an activity started re-anchors it at the data date, which is months
        // before its planned start on this fixture, so a one-unit injection is spent getting back
        // to where the activity already was: measured, `+PERTURB_MIN` moved the target's own finish
        // by 13 calendar days and the carrier by zero. That is the class being under-exercised, not
        // the class being inert — the distinction C4-c exists to force.
        const o = clone(i);
        for (const a of o.activities)
          if (a.id === t4.id) {
            a.actualStart = engineDataDate;
            a.remainingMinutes = a.durationMinutes + PERTURB_MIN * 3;
          }
        return o;
      },
      SCOPE: (i) => {
        // An INSERTION, not a deletion. Deleting a driving-chain member was measured at exactly zero
        // on this network: the chain simply re-routes through another predecessor, so a delete is a
        // weak probe of the scope class here and would have satisfied C4's aggregate bar while
        // exercising nothing (C4-c). Inserting a new activity in series between t1 and the carrier
        // cannot be routed around.
        const o = clone(i);
        o.activities = [
          ...o.activities,
          { id: SCOPE_INSERT_ID, durationMinutes: PERTURB_MIN, type: 'TASK' },
        ];
        o.edges = [
          ...o.edges,
          {
            id: `${SCOPE_INSERT_ID}-in`,
            predecessorId: t1.id,
            successorId: SCOPE_INSERT_ID,
            type: 'FS',
            lagMinutes: 0,
          },
          {
            id: `${SCOPE_INSERT_ID}-out`,
            predecessorId: SCOPE_INSERT_ID,
            successorId: carrierId,
            type: 'FS',
            lagMinutes: 0,
          },
        ];
        return o;
      },
    };

    // C4 first — per class, alone, from R_old.
    say('--- C4 per class (alone) ---');
    const alone: Record<string, number> = {};
    const targetOf: Partial<Record<M0Class, string>> = {
      DURATION: t1.id,
      BOUNDS: t2.id,
      CALENDAR: t3.id,
      PROGRESS: t4.id,
      SCOPE: SCOPE_INSERT_ID,
    };
    for (const k of M0_CLASSES) {
      const next = edits[k](base);
      const d = movementDays(base, next);
      alone[k] = d;
      // A zero is ambiguous — the class did nothing, or it did something the network absorbed. Log
      // the target's OWN finish and the project finish so the two are distinguishable.
      const after = computeSchedule(next.activities, next.edges, next.options);
      const tid = targetOf[k];
      const b = tid !== undefined ? control.results.find((r) => r.activityId === tid) : undefined;
      const a = tid !== undefined ? after.results.find((r) => r.activityId === tid) : undefined;
      say(
        `  ${k.padEnd(11)} carrier ${Number.isNaN(d) ? 'removed' : `${d} d`}` +
          ` | projectFinish ${control.summary.projectFinish} -> ${after.summary.projectFinish}` +
          (tid === undefined
            ? ''
            : ` | target EF ${b?.earlyFinish?.slice(0, 10) ?? '-'} -> ${a?.earlyFinish?.slice(0, 10) ?? 'gone'}`),
      );
    }
    const rNew = M0_CLASSES.reduce<Input>((acc, k) => edits[k](acc), base);
    const total = movementDays(base, rNew);
    const nonTrivial = M0_CLASSES.filter((k) => Number.isNaN(alone[k]!) || Math.abs(alone[k]!) > 0);
    say(
      `C4 total=${total} d | non-trivial ${nonTrivial.length}/${M0_CLASSES.length} -> ${nonTrivial.join(',')}`,
    );
    const c4Logic = nonTrivial.includes('LOGIC');
    const c4Calendar = nonTrivial.includes('CALENDAR');
    say(
      `C4 verdict: ${Math.abs(total) >= 10 && nonTrivial.length >= 3 && c4Logic && c4Calendar && nonTrivial.length === M0_CLASSES.length ? 'PASS' : 'FAIL'}` +
        ` (>=10d: ${Math.abs(total) >= 10}, >=3 classes: ${nonTrivial.length >= 3},` +
        ` logic: ${c4Logic}, calendar: ${c4Calendar}, C4-c all non-zero: ${nonTrivial.length === M0_CLASSES.length})`,
    );

    // --- C1: completeness. The carrier is FIXED from the control run (m0-condition.md), so this is
    // an arithmetic self-check: it catches a dropped or double-counted class and accumulated
    // day-snapping, and it is NOT evidence that the attribution means anything.
    const replay = (order: readonly M0Class[]): { per: Record<string, number>; sum: number } => {
      const per: Record<string, number> = {};
      let acc = base;
      let prev = 0;
      for (const k of order) {
        acc = edits[k](acc);
        const here = movementDays(base, acc);
        per[k] = Number.isNaN(here) ? 0 : here - prev;
        if (!Number.isNaN(here)) prev = here;
      }
      return { per, sum: prev };
    };

    say('--- C1 sequential replay (canonical order) ---');
    const canonical = replay(M0_CLASSES);
    for (const k of M0_CLASSES) say(`  ${k.padEnd(11)} ${canonical.per[k]} d`);
    const sigma = M0_CLASSES.reduce((a, k) => a + (canonical.per[k] ?? 0), 0);
    say(`C1 sigma=${sigma} d total=${total} d residual=${Math.abs(sigma - total)} d`);
    say(`C1 verdict: ${Math.abs(sigma - total) <= 1 ? 'PASS' : 'FAIL'} (bar: <= 1 working day)`);

    // --- C2: order-stability over all 6 permutations of the three largest-contributing classes.
    const ranked = [...M0_CLASSES].sort(
      (a, b) => Math.abs(canonical.per[b] ?? 0) - Math.abs(canonical.per[a] ?? 0),
    );
    const top3 = ranked.slice(0, 3);
    const tail = ranked.slice(3);
    say(`--- C2 permutations of top-3 ${top3.join(',')} (tail fixed: ${tail.join(',')}) ---`);
    const perms: M0Class[][] = [];
    const permute = (rest: M0Class[], acc: M0Class[]): void => {
      if (rest.length === 0) perms.push(acc);
      else
        for (let n = 0; n < rest.length; n += 1)
          permute([...rest.slice(0, n), ...rest.slice(n + 1)], [...acc, rest[n]!]);
    };
    permute(top3, []);
    const shares: Record<string, number[]> = {};
    const orders: string[] = [];
    for (const perm of perms) {
      const r = replay([...perm, ...tail]);
      const denom = r.sum === 0 ? 1 : Math.abs(r.sum);
      const line = top3.map((k) => `${k}=${r.per[k]}d`).join(' ');
      say(`  [${perm.join('>')}] sum=${r.sum}d ${line}`);
      for (const k of M0_CLASSES) (shares[k] ??= []).push(((r.per[k] ?? 0) / denom) * 100);
      orders.push(
        [...M0_CLASSES]
          .sort((a, b) => Math.abs(r.per[b] ?? 0) - Math.abs(r.per[a] ?? 0))
          .slice(0, 3)
          .join('>'),
      );
    }
    const spread = Math.max(
      ...M0_CLASSES.map((k) => Math.max(...shares[k]!) - Math.min(...shares[k]!)),
    );
    const rankStable = new Set(orders).size === 1;
    say(`C2 max share spread=${spread.toFixed(1)}pp (bar: <= 10pp)`);
    say(`C2 top-3 rank orders seen: ${[...new Set(orders)].join(' | ')}`);
    say(`C2 verdict: ${spread <= 10 && rankStable ? 'PASS' : 'FAIL'}`);

    // --- C3: cost. A production implementation needs ONE control pass plus one pass per class
    // present — 7 here, not the 12 the cap allows. The harness calls `computeSchedule` far more
    // often than that (every `movementDays` re-derives the control), so the pass count is measured
    // against the minimal design rather than against this file's call count.
    const passes = 1 + M0_CLASSES.length;
    const timeOne = (a: EngineActivity[], e: EngineEdge[], o: ComputeOptions): number => {
      const t0ms = performance.now();
      computeSchedule(a, e, o);
      return performance.now() - t0ms;
    };
    const warm = () => timeOne(base.activities, base.edges, base.options);
    for (let n = 0; n < 3; n += 1) warm();
    const fixtureSamples = Array.from({ length: 15 }, warm).sort((x, y) => x - y);
    const p95 = (xs: number[]): number =>
      xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]!;
    const onePass = p95(fixtureSamples);
    say(`--- C3-a fixture (147 activities) ---`);
    say(
      `  one pass p95 = ${onePass.toFixed(1)} ms | ${passes} passes = ${(onePass * passes).toFixed(0)} ms`,
    );
    // The bar is END-TO-END. What is measured here is the engine alone, so the honest test is
    // whether the engine leaves room for HTTP, two snapshot hydrations, two graph builds and the
    // diff — not whether the engine alone fits. A budget consumed by one component is not a pass.
    const ENGINE_HEADROOM = 0.6; // engine may take at most 60% of the end-to-end budget
    const judge = (ms: number): string =>
      ms / 1000 <= 3.0 * ENGINE_HEADROOM
        ? 'PASS'
        : ms / 1000 <= 3.0
          ? 'FAIL (no headroom)'
          : 'FAIL';
    say(
      `  C3-a verdict: ${judge(onePass * passes)} (bar: <= 3.0 s end-to-end; engine budgeted at <= ${(3.0 * ENGINE_HEADROOM).toFixed(1)} s)`,
    );

    // C3-b — 2,000 activities. No scale plan is seeded, so the fixture graph is replicated and the
    // copies CHAINED IN SERIES: replicating as disjoint components shortens every critical path and
    // flatters the measurement, which the condition file already records as the flaw in one of the
    // two figures it quotes.
    const COPIES = Math.ceil(2000 / base.activities.length);
    const bigActs: EngineActivity[] = [];
    const bigEdges: EngineEdge[] = [];
    for (let c = 0; c < COPIES; c += 1) {
      const sfx = `~c${c}`;
      for (const a of base.activities)
        bigActs.push(
          a.parentId == null
            ? { ...a, id: `${a.id}${sfx}` }
            : { ...a, id: `${a.id}${sfx}`, parentId: `${a.parentId}${sfx}` },
        );
      for (const e of base.edges)
        bigEdges.push({
          ...e,
          id: `${e.id}${sfx}`,
          predecessorId: `${e.predecessorId}${sfx}`,
          successorId: `${e.successorId}${sfx}`,
        });
      if (c > 0)
        bigEdges.push({
          id: `chain-${c}`,
          predecessorId: `${carrierId}~c${c - 1}`,
          successorId: `${t.at(-1)!.id}${sfx}`,
          type: 'FS',
          lagMinutes: 0,
        });
    }
    const bigWarm = () => timeOne(bigActs, bigEdges, base.options);
    for (let n = 0; n < 2; n += 1) bigWarm();
    const bigSamples = Array.from({ length: 9 }, bigWarm).sort((x, y) => x - y);
    const bigPass = p95(bigSamples);
    say(
      `--- C3-b scale (${bigActs.length} activities, ${bigEdges.length} edges, ${COPIES} copies chained in series) ---`,
    );
    say(
      `  one pass p95 = ${bigPass.toFixed(1)} ms | ${passes} passes = ${(bigPass * passes).toFixed(0)} ms`,
    );
    say(`  C3-b verdict: ${judge(bigPass * passes)} (bar: <= 3.0 s end-to-end)`);
  }, 300_000);
});
