import { nearestFreeRow, type PackItem } from '@repo/layout';

import {
  compareObjectives,
  evaluateLayout,
  LAYOUT_REFERENCE_PX_PER_DAY,
  type LayoutObjective,
  type LayoutScene,
} from './layout-objective';
import {
  bandRowsOf,
  displayLanesOf,
  offsetsOf,
  stackOf,
  swimlaneKeyOf,
  type LayoutPartition,
} from './layout-partition';
import { axisDayOf, type RenderActivity, type RenderEdge } from './render-model';
import type { PlacedText } from './row-text-layout';

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
 * **The budget defaults to the seed's row count** (CQ-1, answered 2026-09-23): the search may reorder
 * rows and move bars between them but does not add rows beyond what the seed used. That is Tidy's, whose
 * seed is the diagram. Re-layout's seed is the pack, the fewest rows time allows, so its caller passes
 * a budget of the rows the diagram has now (`relayoutBudget`, `docs/specs/relayout-quality` CQ-1,
 * answered 2026-10-17) and the "one new row" candidate below becomes reachable for it.
 *
 * **It takes `RenderActivity`, so `drawnStart`/`drawnFinish` are the DRAWN dates** (ADR-0148): the
 * caller builds them from `barDatesFor(…, 'visual')`, never from an `ActivitySummary`'s early dates.
 * That is why this file lives in `render/` beside the objective and not in `model/`, where
 * `drawn-span.structural.test.ts` holds files to `ActivitySummary`'s meaning of the same field names.
 *
 * **With a swimlane partition** (swimlanes M2-T6, feature-spec §4.5) the same four phases run with
 * the swimlane restrictions added, and the lanes in and out are **local to a swimlane**:
 *
 * - swaps exchange two rows of one swimlane;
 * - alignment candidates come from the bar's own swimlane, and "one new row" is a row at the bottom
 *   of it, allowed while the whole diagram is under the budget;
 * - compaction deletes empty rows inside a swimlane and keeps at least one row for each;
 * - repair is `nearestFreeRow` with the partition;
 * - the objective is scored on display lanes ({@link LayoutPartition}), so links between swimlanes
 *   count, and the budget is the diagram's height in rows.
 *
 * No bar ever leaves its swimlane: a lane is only ever read against the swimlane it was written for.
 * Absent, every branch below reduces to the unpartitioned search, byte for byte (ADR-0203 FC-R8; the
 * golden record in `test-support/optimise-parity.golden.json`).
 *
 * Pure: no clock, no randomness, no engine, no DOM. Input order does not affect the result, because
 * activities and edges are sorted by id before anything is evaluated.
 */
export interface OptimiseLayoutOptions {
  /**
   * The row cap. Defaults to the seed's row count (CQ-1); Re-layout passes its own. With a
   * {@link partition} it counts display rows: the swimlanes' heights added together.
   */
  budget?: number;
  /**
   * The swimlanes to search inside. Present only while swimlanes are shown; the input's
   * `laneIndex` and the result's `lanes` are then lanes local to each activity's swimlane.
   */
  partition?: LayoutPartition;
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
    if (a.drawnStart === null) continue;
    const startDay = axisDayOf(a.type, input.dataDate, a.drawnStart);
    const endDay =
      a.drawnFinish === null ? startDay : axisDayOf(a.type, input.dataDate, a.drawnFinish);
    bars.push({ id: a.id, startDay, endDay });
  }
  const order = [...bars].sort((a, b) => a.startDay - b.startDay || byKey(a.id, b.id));
  const barOf = new Map(bars.map((b) => [b.id, b]));

  const seedLanes = new Map(activities.map((a) => [a.id, a.laneIndex]));

  // The partition's geometry. Without one `shown` is `lanes` itself and every helper below is the
  // unpartitioned rule, which is what keeps the absent case byte-identical.
  const partition = options.partition;
  const barIds = bars.map((b) => b.id);
  const stack = partition ? stackOf(partition, barIds) : [];
  const keyOf = (id: string): string => (partition ? swimlaneKeyOf(partition, id) : '');
  const heightsOf = (lanes: ReadonlyMap<string, number>): Map<string, number> =>
    bandRowsOf(partition!, stack, lanes, barIds);
  const totalRowsOf = (lanes: ReadonlyMap<string, number>): number => {
    if (!partition) return rowsOf(lanes);
    let total = 0;
    for (const rows of heightsOf(lanes).values()) total += rows;
    return total;
  };
  const budget = options.budget ?? totalRowsOf(seedLanes);

  let evaluations = 0;
  // One text memo per search (spec §4.9): the view, widths and toggles are fixed here and only
  // lanes move, so a lane's text is laid out once per distinct content (links-and-labels M2-T6b).
  const text = { ...input.text, memo: new Map<string, readonly PlacedText[]>() };
  const evaluate = (lanes: ReadonlyMap<string, number>): LayoutObjective => {
    evaluations += 1;
    options.onProgress?.(evaluations);
    const shown = partition ? displayLanesOf(partition, stack, lanes, barIds) : lanes;
    return evaluateLayout(
      {
        activities: activities.map((a) => ({ ...a, laneIndex: shown.get(a.id) ?? a.laneIndex })),
        edges,
        dataDate: input.dataDate,
        isWorkingDay: input.isWorkingDay,
        text,
      },
      LAYOUT_REFERENCE_PX_PER_DAY,
    );
  };

  const seed = evaluate(seedLanes);
  let lanes = repair(seedLanes, order, partition?.swimlaneOf);
  let current = evaluate(lanes);
  const repaired = current;
  const overBudget = totalRowsOf(lanes) > budget;

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

    // Phase 1: adjacent-row swaps, inside one swimlane when there are swimlanes.
    if (partition) {
      for (const key of stack) {
        const inSwimlane = (id: string): boolean => barOf.has(id) && keyOf(id) === key;
        for (let r = 0; r + 1 < heightsOf(lanes).get(key)! && budgetLeft(); r += 1) {
          tryAdopt(swapRows(lanes, r, inSwimlane));
        }
      }
    } else {
      for (let r = 0; r + 1 < rowsOf(lanes) && budgetLeft(); r += 1) {
        tryAdopt(swapRows(lanes, r, () => true));
      }
    }

    // Phase 2: single-bar moves, best of each bar's candidates.
    for (const bar of order) {
      if (!budgetLeft()) break;
      const cur = lanes.get(bar.id)!;
      const key = keyOf(bar.id);
      // The bar's own band: its rows, where it starts in the diagram, and the diagram's height. With
      // no partition the band is the whole diagram.
      let rows: number;
      let total: number;
      let offset = 0;
      if (partition) {
        const heights = heightsOf(lanes);
        rows = heights.get(key)!;
        total = 0;
        for (const h of heights.values()) total += h;
        offset = offsetsOf(stack, heights).get(key)!;
      } else {
        rows = total = rowsOf(lanes);
      }
      const want = new Set([cur - 2, cur - 1, cur + 1, cur + 2]);
      for (const n of neighbours.get(bar.id) ?? []) {
        // A link into another swimlane says nothing about a lane here: its number means a lane there.
        if (partition && (!barOf.has(n) || keyOf(n) !== key)) continue;
        const lane = lanes.get(n);
        if (lane !== undefined) want.add(lane);
      }
      if (total < budget) want.add(rows);
      const candidates = [...want]
        // A row that exists is open while it lies inside the budget; the new row at the bottom of the
        // band, while the whole diagram is under it.
        .filter((lane) => lane >= 0 && lane !== cur && lane <= rows)
        .filter((lane) => (lane < rows ? offset + lane < budget : total < budget))
        .filter((lane) => fits(lanes, barOf, bar, lane, partition ? keyOf : null))
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
    const packed = partition ? compactedInSwimlanes(lanes, barOf, stack, keyOf) : compacted(lanes);
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
function repair(
  seed: ReadonlyMap<string, number>,
  order: readonly Bar[],
  partition: ReadonlyMap<string, string> | undefined,
): Map<string, number> {
  const lanes = new Map(seed);
  const settled: PackItem[] = [];
  for (const bar of order) {
    const item: PackItem = { ...bar, laneIndex: lanes.get(bar.id) ?? 0 };
    const lane = nearestFreeRow(item, settled, partition);
    lanes.set(bar.id, lane);
    settled.push({ ...item, laneIndex: lane });
  }
  return lanes;
}

/**
 * Does `bar` fit in `lane` beside every other bar there (inclusive finish, as `packLanes`)? With
 * swimlanes (`keyOf` given) only the bar's own swimlane's bars are beside it: a lane number in
 * another swimlane is a different row.
 */
function fits(
  lanes: ReadonlyMap<string, number>,
  barOf: ReadonlyMap<string, Bar>,
  bar: Bar,
  lane: number,
  keyOf: ((id: string) => string) | null,
): boolean {
  const key = keyOf?.(bar.id);
  for (const [id, l] of lanes) {
    if (l !== lane || id === bar.id) continue;
    if (keyOf && keyOf(id) !== key) continue;
    const other = barOf.get(id);
    if (other && !(other.endDay < bar.startDay || bar.endDay < other.startDay)) return false;
  }
  return true;
}

/** Rows `r` and `r + 1` exchanged for every activity `inScope` names (the whole diagram, or one swimlane). */
function swapRows(
  lanes: ReadonlyMap<string, number>,
  r: number,
  inScope: (id: string) => boolean,
): Map<string, number> {
  return new Map(
    [...lanes].map(([id, lane]) => [
      id,
      !inScope(id) ? lane : lane === r ? r + 1 : lane === r + 1 ? r : lane,
    ]),
  );
}

/** The layout with its empty rows deleted, or null when there are none. */
function compacted(lanes: ReadonlyMap<string, number>): Map<string, number> | null {
  const used = [...new Set(lanes.values())].sort((a, b) => a - b);
  if (used.every((lane, i) => lane === i)) return null;
  const to = new Map(used.map((lane, i) => [lane, i]));
  return new Map([...lanes].map(([id, lane]) => [id, to.get(lane)!]));
}

/**
 * The layout with each swimlane's empty rows deleted (a swimlane's rows start at 0 and stay at least
 * one), or null when there are none. Only drawn bars count: an undrawn activity's lane is not a row.
 */
function compactedInSwimlanes(
  lanes: ReadonlyMap<string, number>,
  barOf: ReadonlyMap<string, Bar>,
  stack: readonly string[],
  keyOf: (id: string) => string,
): Map<string, number> | null {
  const members = new Map<string, string[]>(stack.map((key) => [key, []]));
  for (const id of lanes.keys()) if (barOf.has(id)) members.get(keyOf(id))!.push(id);
  const out = new Map(lanes);
  let changed = false;
  for (const ids of members.values()) {
    const used = [...new Set(ids.map((id) => lanes.get(id)!))].sort((a, b) => a - b);
    if (used.every((lane, i) => lane === i)) continue;
    changed = true;
    const to = new Map(used.map((lane, i) => [lane, i]));
    for (const id of ids) out.set(id, to.get(lanes.get(id)!)!);
  }
  return changed ? out : null;
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
