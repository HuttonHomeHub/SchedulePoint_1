import * as arrangeModule from '../src/features/tsld/components/use-arrange-search';
import {
  compareObjectives,
  layoutLines,
  type LayoutObjective,
} from '../src/features/tsld/render/layout-objective';
import { OPTIMISE_MAX_ACTIVITIES } from '../src/features/tsld/render/optimise-layout';
import {
  handleOptimiseRequest,
  type OptimiseMessage,
  type OptimiseRequest,
} from '../src/features/tsld/render/optimise-layout-protocol';
import { runPool, type RunOne } from '../src/features/tsld/render/optimise-pool';
import {
  pickBestStart,
  relayoutSeeds,
  START_NAMES,
  type StartId,
} from '../src/features/tsld/render/relayout-starts';
import type { RenderActivity } from '../src/features/tsld/render/render-model';
import { tableMeasure } from '../src/features/tsld/render/row-text-layout';
import { poolConcurrency } from '../src/features/tsld/render/run-optimise-layout';
import { textWidthTable } from '../src/features/tsld/render/text-width-table';
import { makeWorkingDayPredicate } from '../src/features/tsld/render/time-scale';
import { DEFAULT_VIEW_TOGGLES } from '../src/features/tsld/render/view-toggles';

import { bendCount, criticalSpine, travelStats, type CriticalSpine } from './relayout-metrics';
import { detectProduct } from './relayout-product';
import type { CorpusPlan } from './relayout-scene';

/**
 * **The benchmark's browser half** (spec `docs/specs/relayout-quality`, plan M0-T3).
 *
 * Bundled by `measure-relayout.mjs` and loaded into headless Chromium with the repo's woff2, so the
 * text widths are the ones the dialog measures (`textWidthTable`, through the painter's own memo).
 * Everything that scores a layout is the product's: `arrangeRequest` builds the request exactly as
 * `useArrangeSearch` does, and `handleOptimiseRequest` is the function the worker runs. The search
 * therefore runs on this thread, not in a worker — the same code, so the same lanes; only the thread
 * differs, and the timing is labelled accordingly.
 */

const { arrangeRequest, changesBetween, relayoutRuns } = arrangeModule;

export type BudgetMode = 'seed' | 'current';

export interface Measure {
  objective: LayoutObjective;
  bends: number;
  spine: CriticalSpine;
  travelMean: number;
  travelMax: number;
}

export interface Run {
  name: string;
  /** Which start seeded it, or null for Tidy. */
  start: StartId | null;
  budget: BudgetMode | null;
  measure: Measure;
  moved: number;
  evaluations: number;
  passes: number;
  capped: boolean;
  /** Wall time of each repeat, ms (this thread, no worker, widths excluded). */
  ms: number[];
  /** Identical lanes on every repeat. */
  repeatable: boolean;
  /** Identical lanes with the input reversed; null when not taken (large plans). */
  reversible: boolean | null;
  lanes: [string, number][];
}

export interface PlanResult {
  seedName: string;
  planName: string;
  drawn: number;
  activities: number;
  edges: number;
  bounded: boolean;
  widths: number;
  widthsMs: number;
  hand: Measure;
  tidy: Run | null;
  /** Today's Re-layout: the pack seed, the seed's row count as the budget. */
  today: Run;
  variants: Run[];
  /**
   * The Re-layout the product's dialog shows: `relayoutRuns` (the hook's own function) searched
   * start by start on this thread, the best picked by `pickBestStart`. `ms` is the serial sum.
   */
  product: Run;
  productStarts: ProductStart[];
  /** Real module workers, taken only for the plans the caller asks for. */
  pool: PoolTiming | null;
}

export interface ProductStart {
  id: StartId;
  evaluations: number;
  ms: number[];
  final: LayoutObjective;
}

/** Wall time of Re-layout in real workers, against today's single search in one worker. */
export interface PoolTiming {
  starts: number[];
  concurrency: number;
  /** Today's search alone in one worker, per run. */
  todayMs: number[];
  /** The product's starts in `concurrency` workers, per run. */
  poolMs: number[];
  /** The same starts in one worker, once: what a single-core device waits. */
  serialMs: number;
  /** The pick and its lanes are identical with one worker and with `concurrency` (FC-R7). */
  identical: boolean;
}

export interface BenchOptions {
  budgets: BudgetMode[];
  starts: StartId[];
  /** How many times each search runs (timing spread, and the repeatability check). */
  runs: number;
  /** Take the reversed-input check on plans of at most this many drawn activities. */
  reverseUpTo: number;
  /** Time the product in real workers: the bundled worker script and a worker-count override. */
  pool: { workerSource: string; workers: number | null } | null;
}

const rowsOf = (lanes: ReadonlyMap<string, number>): number => {
  let rows = 0;
  for (const lane of lanes.values()) rows = Math.max(rows, lane + 1);
  return rows;
};

const packedOf = (plan: CorpusPlan): Map<string, number> => {
  const lanes = new Map(plan.activities.map((a) => [a.id, a.laneIndex]));
  for (const c of plan.packChanges) lanes.set(c.id, c.laneIndex);
  return lanes;
};

/** One start's seed, by the product's own builders. */
function seedFor(plan: CorpusPlan, start: StartId): Map<string, number> {
  const seed = relayoutSeeds(
    {
      activities: plan.activities,
      edges: plan.edges,
      dataDate: plan.dataDate,
      packed: packedOf(plan),
    },
    [start],
  )[0];
  if (seed === undefined) throw new Error(`start ${String(start)} produced no seed`);
  return seed.lanes;
}

const lanesKey = (lanes: ReadonlyMap<string, number>): string =>
  JSON.stringify([...lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

function inputOf(plan: CorpusPlan, activities: RenderActivity[], edges = plan.edges) {
  return {
    activities,
    edges,
    dataDate: plan.dataDate,
    isWorkingDay: plan.calendar
      ? makeWorkingDayPredicate(plan.dataDate, {
          workingWeekdays: plan.calendar.workingWeekdays,
          exceptions: new Map(plan.calendar.exceptions),
        })
      : null,
    packChanges: plan.packChanges,
    textToggles: DEFAULT_VIEW_TOGGLES,
  };
}

function execute(request: OptimiseRequest): {
  lanes: Map<string, number>;
  seed: LayoutObjective;
  final: LayoutObjective;
  evaluations: number;
  passes: number;
  capped: boolean;
  ms: number;
} {
  let message: OptimiseMessage | null = null;
  const started = performance.now();
  handleOptimiseRequest(request, (m) => {
    if (m.type !== 'progress') message = m;
  });
  const ms = performance.now() - started;
  const done = message as OptimiseMessage | null;
  if (done === null || done.type === 'progress') throw new Error('the search posted no result');
  if (done.type === 'failed') throw new Error(`the search failed: ${done.message}`);
  const r = done.result;
  return {
    lanes: r.lanes,
    seed: r.seed,
    final: r.final,
    evaluations: r.evaluations,
    passes: r.passes,
    capped: r.capped,
    ms,
  };
}

function measureOf(
  plan: CorpusPlan,
  lanes: ReadonlyMap<string, number>,
  objective: LayoutObjective,
  widths: [string, number][],
): Measure {
  const activities = plan.activities.map((a) => ({
    ...a,
    laneIndex: lanes.get(a.id) ?? a.laneIndex,
  }));
  const input = inputOf(plan, activities);
  const lines = layoutLines({
    activities,
    edges: plan.edges,
    dataDate: plan.dataDate,
    isWorkingDay: input.isWorkingDay ?? undefined,
    text: { measure: tableMeasure(widths), toggles: DEFAULT_VIEW_TOGGLES },
  });
  const travel = travelStats(activities, plan.edges);
  return {
    objective,
    bends: bendCount(lines),
    spine: criticalSpine(activities, plan.edges),
    travelMean: travel.mean,
    travelMax: travel.max,
  };
}

/** The activities and edges in reverse order: `optimiseLayout` sorts both, so nothing may change. */
function reversed(plan: CorpusPlan): { activities: RenderActivity[]; edges: CorpusPlan['edges'] } {
  return { activities: [...plan.activities].reverse(), edges: [...plan.edges].reverse() };
}

function search(
  plan: CorpusPlan,
  widths: [string, number][],
  name: string,
  start: StartId | null,
  budget: BudgetMode | null,
  seed: ReadonlyMap<string, number>,
  bounded: boolean,
  options: BenchOptions,
): Run {
  const current = new Map(plan.activities.map((a) => [a.id, a.laneIndex]));
  const budgetRows = Math.max(rowsOf(current), rowsOf(seed));
  const opts: OptimiseRequest['options'] = bounded
    ? { passes: 0 }
    : budget === 'current'
      ? { budget: budgetRows }
      : {};
  const request = (activities: RenderActivity[], edges = plan.edges): OptimiseRequest =>
    arrangeRequest(inputOf(plan, activities, edges), seed, opts, widths);

  const ms: number[] = [];
  let first: ReturnType<typeof execute> | null = null;
  let repeatable = true;
  for (let i = 0; i < options.runs; i += 1) {
    const r = execute(request(plan.activities));
    ms.push(r.ms);
    if (first === null) first = r;
    else if (lanesKey(r.lanes) !== lanesKey(first.lanes)) repeatable = false;
  }
  if (first === null) throw new Error('runs must be at least 1');

  let reversible: boolean | null = null;
  if (plan.drawn <= options.reverseUpTo) {
    const rev = reversed(plan);
    const r = execute(request(rev.activities, rev.edges));
    reversible = lanesKey(r.lanes) === lanesKey(first.lanes);
  }

  return {
    name,
    start,
    budget,
    measure: measureOf(plan, first.lanes, first.final, widths),
    moved: changesBetween(plan.activities, first.lanes).length,
    evaluations: first.evaluations,
    passes: first.passes,
    capped: first.capped,
    ms,
    repeatable,
    reversible,
    lanes: [...first.lanes],
  };
}

/** The product's Re-layout for a plan: the hook's own `relayoutRuns`, then its own pick. */
function productRuns(
  plan: CorpusPlan,
  widths: [string, number][],
  activities: RenderActivity[],
  edges = plan.edges,
) {
  const current = new Map(plan.activities.map((a) => [a.id, a.laneIndex]));
  return relayoutRuns(inputOf(plan, activities, edges), current, packedOf(plan), widths);
}

function productSearch(
  plan: CorpusPlan,
  widths: [string, number][],
  options: BenchOptions,
): { run: Run; starts: ProductStart[] } {
  const ms: number[] = [];
  const perStart: ProductStart[] = [];
  let first: { lanes: Map<string, number>; final: LayoutObjective; id: StartId } | null = null;
  let totalEvaluations = 0;
  let passes = 0;
  let capped = false;
  let repeatable = true;
  for (let i = 0; i < options.runs; i += 1) {
    const { starts, requests } = productRuns(plan, widths, plan.activities);
    const results = requests.map((r) => execute(r));
    ms.push(results.reduce((n, r) => n + r.ms, 0));
    const picked = pickBestStart(results);
    const best = results[picked]!;
    const id = starts[picked]!.id;
    if (first === null) {
      first = { lanes: best.lanes, final: best.final, id };
      totalEvaluations = results.reduce((n, r) => n + r.evaluations, 0);
      passes = best.passes;
      capped = results.some((r) => r.capped);
      starts.forEach((start, k) =>
        perStart.push({
          id: start.id,
          evaluations: results[k]!.evaluations,
          ms: [],
          final: results[k]!.final,
        }),
      );
    } else if (lanesKey(best.lanes) !== lanesKey(first.lanes)) repeatable = false;
    results.forEach((r, k) => perStart[k]!.ms.push(r.ms));
  }
  if (first === null) throw new Error('runs must be at least 1');

  let reversible: boolean | null = null;
  if (plan.drawn <= options.reverseUpTo) {
    const rev = reversed(plan);
    const { requests } = productRuns(plan, widths, rev.activities, rev.edges);
    const results = requests.map((r) => execute(r));
    reversible = lanesKey(results[pickBestStart(results)]!.lanes) === lanesKey(first.lanes);
  }

  return {
    starts: perStart,
    run: {
      name: `Re-layout (product: start ${String(first.id)}, ${START_NAMES[first.id]})`,
      start: first.id,
      budget: 'current',
      measure: measureOf(plan, first.lanes, first.final, widths),
      moved: changesBetween(plan.activities, first.lanes).length,
      evaluations: totalEvaluations,
      passes,
      capped,
      ms,
      repeatable,
      reversible,
      lanes: [...first.lanes],
    },
  };
}

/** A module worker from the bundled worker script, as `runOptimiseLayout` makes one. */
function blobRunner(workerSource: string): { run: RunOne; dispose: () => void } {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const run: RunOne = (request, handlers) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(url);
      handlers.signal?.addEventListener('abort', () => {
        worker.terminate();
        reject(new DOMException('cancelled', 'AbortError'));
      });
      worker.onmessage = (event: MessageEvent<OptimiseMessage>) => {
        const message = event.data;
        if (message.type === 'progress') handlers.onProgress?.(message.evaluations);
        else {
          worker.terminate();
          if (message.type === 'done') resolve(message.result);
          else reject(new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage(request);
    });
  return { run, dispose: () => URL.revokeObjectURL(url) };
}

/**
 * Re-layout's wait in real workers (FC-R6, FC-R7): today's single search in one worker, against the
 * product's starts in `concurrency` workers, and the same starts in one. The workers are the
 * product's `optimise-layout.worker.ts`, so what is timed is the code that ships, with the thread
 * start-up and the structured-clone of every request and result that a projection leaves out.
 */
async function poolTiming(
  plan: CorpusPlan,
  widths: [string, number][],
  options: BenchOptions,
  pool: NonNullable<BenchOptions['pool']>,
): Promise<PoolTiming> {
  const { run, dispose } = blobRunner(pool.workerSource);
  try {
    const { starts, requests } = productRuns(plan, widths, plan.activities);
    const concurrency = pool.workers ?? poolConcurrency(requests.length);
    const todayRequest = arrangeRequest(
      inputOf(plan, plan.activities),
      seedFor(plan, 0),
      {},
      widths,
    );
    const todayMs: number[] = [];
    const poolMs: number[] = [];
    let parallelKey: string | null = null;
    let identical = true;
    for (let i = 0; i < options.runs; i += 1) {
      let t = performance.now();
      await run(todayRequest, {});
      todayMs.push(performance.now() - t);

      t = performance.now();
      const results = await runPool(run, requests, { concurrency });
      poolMs.push(performance.now() - t);
      const key = lanesKey(results[pickBestStart(results)]!.lanes);
      if (parallelKey === null) parallelKey = key;
      else if (key !== parallelKey) identical = false;
    }
    const t = performance.now();
    const serial = await runPool(run, requests, { concurrency: 1 });
    const serialMs = performance.now() - t;
    if (lanesKey(serial[pickBestStart(serial)]!.lanes) !== parallelKey) identical = false;
    return {
      starts: starts.map((s) => s.id),
      concurrency,
      todayMs,
      poolMs,
      serialMs,
      identical,
    };
  } finally {
    dispose();
  }
}

export async function scorePlan(plan: CorpusPlan, options: BenchOptions): Promise<PlanResult> {
  const bounded = plan.drawn > OPTIMISE_MAX_ACTIVITIES;
  const t0 = performance.now();
  const widths = textWidthTable(plan.activities, DEFAULT_VIEW_TOGGLES);
  const widthsMs = performance.now() - t0;
  if (widths.length === 0 && plan.activities.length > 0) {
    throw new Error(
      `${plan.seedName}: the width table is empty, so every route would be text-blind`,
    );
  }

  const current = new Map(plan.activities.map((a) => [a.id, a.laneIndex]));
  // The diagram as it stands, scored: Tidy's seed is exactly that, and when Tidy is bounded one
  // evaluation with no search supplies it — as the dialog does.
  const tidy = bounded ? null : search(plan, widths, 'Tidy', null, null, current, false, options);
  const probe = execute(
    arrangeRequest(inputOf(plan, plan.activities), current, { passes: 0 }, widths),
  );
  const hand = measureOf(plan, current, probe.seed, widths);

  const packed = seedFor(plan, 0);
  const today = search(plan, widths, 'Re-layout (today)', 0, 'seed', packed, bounded, options);

  const variants: Run[] = [];
  if (!bounded) {
    for (const budget of options.budgets) {
      for (const start of options.starts) {
        if (budget === 'seed' && start === 0) continue;
        const seed = seedFor(plan, start);
        variants.push(
          search(
            plan,
            widths,
            `start ${String(start)} (${START_NAMES[start]}), budget ${budget}`,
            start,
            budget,
            seed,
            false,
            options,
          ),
        );
      }
    }
  }

  const productResult = productSearch(plan, widths, options);
  const pool =
    options.pool !== null && !bounded
      ? await poolTiming(plan, widths, options, options.pool)
      : null;

  return {
    seedName: plan.seedName,
    planName: plan.planName,
    drawn: plan.drawn,
    activities: plan.activities.length,
    edges: plan.edges.length,
    bounded,
    widths: widths.length,
    widthsMs,
    hand,
    tidy,
    today,
    variants,
    product: productResult.run,
    productStarts: productResult.starts,
    pool,
  };
}

/** The best of several runs by the product's own order; ties go to the earlier run. */
export function bestOf(runs: readonly Run[]): Run {
  let best = runs[0];
  if (best === undefined) throw new Error('no runs to choose from');
  for (const run of runs) {
    if (compareObjectives(run.measure.objective, best.measure.objective) < 0) best = run;
  }
  return best;
}

(globalThis as unknown as { relayoutBench: unknown }).relayoutBench = {
  scorePlan,
  bestOf,
  detectProduct: () => detectProduct(arrangeModule),
};
