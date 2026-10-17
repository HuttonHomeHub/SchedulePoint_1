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
import type { RenderActivity } from '../src/features/tsld/render/render-model';
import { tableMeasure } from '../src/features/tsld/render/row-text-layout';
import { textWidthTable } from '../src/features/tsld/render/text-width-table';
import { makeWorkingDayPredicate } from '../src/features/tsld/render/time-scale';
import { DEFAULT_VIEW_TOGGLES } from '../src/features/tsld/render/view-toggles';

import { bendCount, criticalSpine, travelStats, type CriticalSpine } from './relayout-metrics';
import { detectProduct } from './relayout-product';
import type { CorpusPlan } from './relayout-scene';
import { START_NAMES, startSeed, type StartId } from './relayout-start-prototypes';

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

const { arrangeRequest, changesBetween } = arrangeModule;

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
}

export interface BenchOptions {
  budgets: BudgetMode[];
  starts: StartId[];
  /** How many times each search runs (timing spread, and the repeatability check). */
  runs: number;
  /** Take the reversed-input check on plans of at most this many drawn activities. */
  reverseUpTo: number;
}

const rowsOf = (lanes: ReadonlyMap<string, number>): number => {
  let rows = 0;
  for (const lane of lanes.values()) rows = Math.max(rows, lane + 1);
  return rows;
};

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

export function scorePlan(plan: CorpusPlan, options: BenchOptions): PlanResult {
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

  const packed = startSeed(0, { ...plan });
  const today = search(plan, widths, 'Re-layout (today)', 0, 'seed', packed, bounded, options);

  const variants: Run[] = [];
  if (!bounded) {
    for (const budget of options.budgets) {
      for (const start of options.starts) {
        if (budget === 'seed' && start === 0) continue;
        const seed = startSeed(start, { ...plan });
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
