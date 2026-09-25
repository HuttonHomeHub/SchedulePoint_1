import { nearestFreeRow, type PackItem } from '@repo/layout';

import {
  compareObjectives,
  evaluateLayout,
  LAYOUT_REFERENCE_PX_PER_DAY,
  type LayoutObjective,
  type LayoutScene,
} from './layout-objective';
import { axisDayOf, type RenderActivity, type RenderEdge } from './render-model';

/**
 * **Tidy and Re-layout: a bounded search over lane layouts** (NetPoint-layout M4-T3, spec §4.5).
 *
 * The seed is the current rows (Tidy) or `packLanes` over the drawn spans (Re-layout); the caller
 * chooses by what it passes as `scene.activities[].laneIndex`. From the seed the search runs four
 * phases, each move scored on {@link evaluateLayout} at the reference zoom:
 *
 * 0. **Repair**: every overlap in the seed is resolved in drawn-start order by `nearestFreeRow`, the
 *    auto-resolve's derivation (ADR-0153), not a second one. Repair is the hard constraint, so it may
 *    need a row the budget does not have; the result says so.
 * 1. **Ordering**: adjacent-row swaps. Exchanging two whole rows never creates an overlap.
 * 2. **Alignment**: each bar, in drawn-start order, may move to its link neighbours' rows, its own row
 *    ± 1 or ± 2, or one new row while `rows < budget`, wherever its span fits. The best strict
 *    improvement among its candidates is taken.
 * 3. **Compaction**: empty rows are deleted.
 *
 * A move is accepted **only on a strict improvement** of the objective, so the result is never worse
 * than its repaired seed, by construction, at the reference zoom. Passes repeat until one accepts
 * nothing or the pass cap is reached, and each pass is bounded by an evaluation cap. **Both caps are
 * counts, never time**: a time budget would make the layout depend on the machine, and two planners
 * pressing the same button must get the same diagram.
 *
 * **The budget is the seed's row count** (CQ-1, answered 2026-09-23): the search may reorder rows and
 * move bars between them but does not add rows beyond what the seed used.
 *
 * **It takes `RenderActivity`, so `earlyStart`/`earlyFinish` are the DRAWN dates** (ADR-0148): the
 * caller builds them from `barDatesFor(…, 'visual')`, never from an `ActivitySummary`'s early dates.
 * That is why this file lives in `render/` beside the objective and not in `model/`, where
 * `drawn-span.structural.test.ts` holds files to `ActivitySummary`'s meaning of the same field names.
 *
 * Pure: no clock, no randomness, no engine, no DOM. Input order does not affect the result, because
 * activities and edges are sorted by id before anything is evaluated.
 */
export interface OptimiseLayoutOptions {
  /** The row cap. Defaults to the seed's row count (CQ-1). */
  budget?: number;
  /** Pass cap P. */
  passes?: number;
  /** Evaluation cap E per pass. */
  evaluationsPerPass?: number;
  /** Evaluation cap over the whole search. */
  maxEvaluations?: number;
  /** Called after each evaluation with the running count, so a worker can report progress. */
  onProgress?: (evaluations: number) => void;
}

export interface OptimiseLayoutResult {
  /** The final lane of every activity, including those not moved. */
  lanes: Map<string, number>;
  /** The objective of the seed as given, before repair. */
  seed: LayoutObjective;
  /** The objective after repair: the floor the search is never worse than. */
  repaired: LayoutObjective;
  final: LayoutObjective;
  /** Activities whose lane differs from the seed. */
  moved: string[];
  passes: number;
  evaluations: number;
  /** The search stopped at an evaluation cap rather than running out of moves. */
  capped: boolean;
  /** Repair needed more rows than the budget allows. */
  overBudget: boolean;
}

export const DEFAULT_PASSES = 8;
export const DEFAULT_EVALUATIONS_PER_PASS = 4_000;

/**
 * The whole search's evaluation cap, and the largest plan it is offered on (FC-N2 (b), measured
 * 2026-09-23 with `scripts/measure-netpoint-optimise.mjs`, node 22).
 *
 * The committed rule is keyed on `scale-2000`, where one evaluation costs about 250 ms (M0-T3), so a
 * whole Tidy there is far past 10,000 ms and the third branch applies: offered only below a measured
 * size, with the dialog saying why. Tidy on the generated plans took 0.5 s at 100 activities, 4.7 s at
 * 200, 4.5 s at 300, **10.5 s at 400** and 12.2 s at 500; Unit 300 (144) took 4.2 s over 1,726
 * evaluations. So the limit is **300 drawn activities**, the largest measured size inside 10,000 ms.
 *
 * The evaluation cap bounds the worst case as a count: evaluations cost 4.73 ms each at 300, so 2,000
 * of them is about 9.5 s there. No measured run needed more than 1,726.
 *
 * **Those figures are from the router before ADR-0158.** Re-measured 2026-09-25 after its decisions
 * 7–10 (the opposed-link pass): 15.6 s at 300 generated activities over 1,980 evaluations
 * (7.87 ms each), against 10.9 s for `web-v0.150.0` in the same sitting. The limit was kept on the
 * product owner's decision to accept the cost (ADR-0158, "Cost, and a miss accepted").
 *
 * These are node figures: they bound the algorithm, not the product owner's hardware (#75). Every run
 * that is offered goes to a worker with progress, because the measured runs are past 2,000 ms.
 */
export const DEFAULT_MAX_EVALUATIONS = 2_000;
export const OPTIMISE_MAX_ACTIVITIES = 300;

interface Bar {
  id: string;
  startDay: number;
  endDay: number;
}

export function optimiseLayout(
  input: LayoutScene,
  options: OptimiseLayoutOptions = {},
): OptimiseLayoutResult {
  const activities = [...input.activities].sort(byId);
  const edges = [...input.edges].sort((a, b) => byKey(edgeKey(a), edgeKey(b)));
  const passCap = options.passes ?? DEFAULT_PASSES;
  const evalCap = options.evaluationsPerPass ?? DEFAULT_EVALUATIONS_PER_PASS;
  const totalCap = options.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS;

  // Only drawn bars take part. An activity with no drawn start is not on the canvas and keeps its
  // lane, so a later recalculation that does draw it finds it where it was.
  const bars: Bar[] = [];
  for (const a of activities) {
    if (a.earlyStart === null) continue;
    const startDay = axisDayOf(a.type, input.dataDate, a.earlyStart);
    const endDay =
      a.earlyFinish === null ? startDay : axisDayOf(a.type, input.dataDate, a.earlyFinish);
    bars.push({ id: a.id, startDay, endDay });
  }
  const order = [...bars].sort((a, b) => a.startDay - b.startDay || byKey(a.id, b.id));
  const barOf = new Map(bars.map((b) => [b.id, b]));

  const seedLanes = new Map(activities.map((a) => [a.id, a.laneIndex]));
  const budget = options.budget ?? rowsOf(seedLanes);

  let evaluations = 0;
  const evaluate = (lanes: ReadonlyMap<string, number>): LayoutObjective => {
    evaluations += 1;
    options.onProgress?.(evaluations);
    return evaluateLayout(
      {
        activities: activities.map((a) => ({ ...a, laneIndex: lanes.get(a.id) ?? a.laneIndex })),
        edges,
        dataDate: input.dataDate,
        isWorkingDay: input.isWorkingDay,
      },
      LAYOUT_REFERENCE_PX_PER_DAY,
    );
  };

  const seed = evaluate(seedLanes);
  let lanes = repair(seedLanes, order);
  let current = evaluate(lanes);
  const repaired = current;
  const overBudget = rowsOf(lanes) > budget;

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    push(neighbours, e.predecessorId, e.successorId);
    push(neighbours, e.successorId, e.predecessorId);
  }

  let capped = false;
  let pass = 0;
  while (pass < passCap) {
    pass += 1;
    const passStart = evaluations;
    const budgetLeft = (): boolean => {
      if (evaluations - passStart < evalCap && evaluations < totalCap) return true;
      capped = true;
      return false;
    };
    let accepted = 0;
    const tryAdopt = (next: Map<string, number>): boolean => {
      const o = evaluate(next);
      if (compareObjectives(o, current) >= 0) return false;
      lanes = next;
      current = o;
      accepted += 1;
      return true;
    };

    // Phase 1: adjacent-row swaps.
    for (let r = 0; r + 1 < rowsOf(lanes) && budgetLeft(); r += 1) {
      tryAdopt(swapRows(lanes, r));
    }

    // Phase 2: single-bar moves, best of each bar's candidates.
    for (const bar of order) {
      if (!budgetLeft()) break;
      const cur = lanes.get(bar.id)!;
      const rows = rowsOf(lanes);
      const want = new Set([cur - 2, cur - 1, cur + 1, cur + 2]);
      for (const n of neighbours.get(bar.id) ?? []) {
        const lane = lanes.get(n);
        if (lane !== undefined) want.add(lane);
      }
      if (rows < budget) want.add(rows);
      const candidates = [...want]
        .filter((lane) => lane >= 0 && lane !== cur && lane < budget && lane <= rows)
        .filter((lane) => fits(lanes, barOf, bar, lane))
        .sort((a, b) => a - b);
      let best: { lanes: Map<string, number>; objective: LayoutObjective } | null = null;
      for (const lane of candidates) {
        if (!budgetLeft()) break;
        const next = new Map(lanes);
        next.set(bar.id, lane);
        const o = evaluate(next);
        if (compareObjectives(o, best?.objective ?? current) < 0)
          best = { lanes: next, objective: o };
      }
      if (best) {
        lanes = best.lanes;
        current = best.objective;
        accepted += 1;
      }
    }

    // Phase 3: compaction.
    const packed = compacted(lanes);
    if (packed && budgetLeft()) tryAdopt(packed);

    if (accepted === 0) break;
  }

  const moved = activities.filter((a) => lanes.get(a.id) !== a.laneIndex).map((a) => a.id);
  return {
    lanes,
    seed,
    repaired,
    final: current,
    moved,
    passes: pass,
    evaluations,
    capped,
    overBudget,
  };
}

/** Phase 0: settle bars in drawn-start order, each in the nearest free row to where it is. */
function repair(seed: ReadonlyMap<string, number>, order: readonly Bar[]): Map<string, number> {
  const lanes = new Map(seed);
  const settled: PackItem[] = [];
  for (const bar of order) {
    const item: PackItem = { ...bar, laneIndex: lanes.get(bar.id) ?? 0 };
    const lane = nearestFreeRow(item, settled);
    lanes.set(bar.id, lane);
    settled.push({ ...item, laneIndex: lane });
  }
  return lanes;
}

/** Does `bar` fit in `lane` beside every other bar there (inclusive finish, as `packLanes`)? */
function fits(
  lanes: ReadonlyMap<string, number>,
  barOf: ReadonlyMap<string, Bar>,
  bar: Bar,
  lane: number,
): boolean {
  for (const [id, l] of lanes) {
    if (l !== lane || id === bar.id) continue;
    const other = barOf.get(id);
    if (other && !(other.endDay < bar.startDay || bar.endDay < other.startDay)) return false;
  }
  return true;
}

function swapRows(lanes: ReadonlyMap<string, number>, r: number): Map<string, number> {
  return new Map(
    [...lanes].map(([id, lane]) => [id, lane === r ? r + 1 : lane === r + 1 ? r : lane]),
  );
}

/** The layout with its empty rows deleted, or null when there are none. */
function compacted(lanes: ReadonlyMap<string, number>): Map<string, number> | null {
  const used = [...new Set(lanes.values())].sort((a, b) => a - b);
  if (used.every((lane, i) => lane === i)) return null;
  const to = new Map(used.map((lane, i) => [lane, i]));
  return new Map([...lanes].map(([id, lane]) => [id, to.get(lane)!]));
}

function rowsOf(lanes: ReadonlyMap<string, number>): number {
  let rows = 0;
  for (const lane of lanes.values()) rows = Math.max(rows, lane + 1);
  return rows;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byId(a: RenderActivity, b: RenderActivity): number {
  return byKey(a.id, b.id);
}

function edgeKey(e: RenderEdge): string {
  return `${e.id ?? ''}|${e.predecessorId}|${e.successorId}|${e.type}`;
}
