/**
 * **M0-T3 — the link-travel distribution on a genuinely PACKED plan.** (FC-3's baseline)
 *
 * `docs/specs/diagram-legibility/m0-conditions.md`. Re-derives, against the shipped tree, the three
 * statistics `packages/layout/src/pack-lanes.ts:45-48` quotes forward — mean |Δlane| per link, the
 * count of links spanning more than five lanes, and the lane count — with and without the
 * `predecessorsOf` hint.
 *
 * ## Why this exists rather than quoting the docblock
 *
 * Those figures (2.34 → 1.83, 15 → 8, 13 lanes) were measured once, on 2026-07-31, on an import.
 * Quoting a number forward instead of re-deriving it is ADR-0076 Class 1, and this epic's own spec
 * did it twice before the fixture was opened.
 *
 * ## The fixture correction this harness is built on
 *
 * The spec, the plan and the M0 conditions all state that the "Unit 300" file is **not in this
 * repository**. **It is.** `packages/engine-conformance/fixtures/p6_torture_test_v1.xer` carries
 * `%R SP_PLAN  Unit 300 Amine Regeneration Package - Construction & Commissioning`, and
 * `packages/engine-conformance/fixtures/TEST_MATRIX.md:4` names it `TT-300 — Unit 300 Amine
 * Regeneration Package`. Its row counts are 18 PROJWBS / 126 TASK / 188 TASKPRED, which is the
 * "18-node / 126-activity" programme of `docs/DECISIONS.md:3111` and the "126-activity / 188-link"
 * one of the packer's docblock, on three independent counts.
 *
 * The likely origin of the error is `docs/TECH_DEBT.md` #77 (ledgered 2026-08-01, "the demo Unit 300
 * file was a lossy rendering of the fixture") — a separate demo file that no longer exists, confused
 * with the fixture it was rendered from.
 *
 * So FC-3's comparison is **direct rather than a proxy**. What CQ-4 says is still true and is
 * narrower than the documents claimed: nobody has established that the 2026-09-21 screenshot is a
 * picture of *this* plan, and the product owner cannot supply the one they were looking at.
 *
 * ## What the layout is, and what it is NOT
 *
 * `ImportGraph` carries **no dates** — only `durationMinutes`, constraints and progress — because an
 * imported activity has none until the recalculation (ADR-0069). Rather than import the CPM engine
 * into a measurement harness, this derives an **as-early-as-possible layout** from the file's own
 * durations and relationships.
 *
 * **That is a layout, not a CPM result**, exactly as `scale-scene.ts` documents about itself. It
 * ignores calendars, constraints, progress and levelling. It is the right instrument anyway, because
 * every statistic here is a function of the **topology and the relative ordering**, which the layout
 * reproduces exactly — not of the true dates, which only move bars along one axis the packer already
 * treats as given. Reading a schedule out of this would be reading a fiction.
 */
import { readFileSync } from 'node:fs';

import { importXer } from '@repo/interchange';
import { packLanes, type PackItem } from '@repo/layout';
import type { ActivitySummary, DependencySummary } from '@repo/types';

import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import { computeLaneArrangement } from '../src/features/tsld/model/arrange-lanes';
import { addCalendarDays } from '../src/features/tsld/render/working-time';

export interface Stats {
  lanes: number;
  meanDelta: number;
  overFive: number;
  links: number;
}

export interface FixtureResult {
  fixture: string;
  activities: number;
  links: number;
  /** The lanes the plan arrives in — source order for an import, the band deal for a scale scene. */
  asArrived: Stats;
  packedNoHint: Stats;
  packedWithHint: Stats;
  /** Lever 1: the shipped packing, lanes re-indexed. Same lane COUNT, by construction. */
  reordered: Stats;
  /**
   * Lever 2a: pack only what the scene paints when the WBS band is on, i.e. drop the summaries the
   * band draws. `null` where the fixture has no band-drawn summaries to drop.
   */
  sceneOnly: Stats | null;
  /** Lever 2a + lever 1. */
  sceneOnlyReordered: Stats | null;
  /**
   * Lever 2b: pack the scene's activities into lanes `0..N-1`, then append the band summaries into
   * fresh lanes above. Band-on the planner sees a compact N; band-off the layout is still valid.
   */
  sceneFirst: Stats | null;
  /**
   * **How many of the shipped packing's lanes hold NOTHING but band-drawn summaries.**
   *
   * This is what decides whether lever 2 is "wasted capacity" or a visible defect. A lane's index
   * fixes its y, so a lane whose every occupant has been lifted into the band renders as an EMPTY
   * ROW in the diagram — vertical space spent on nothing, scattered through the plan.
   */
  bandOnlyLanes: number | null;
  /**
   * **The number that decides whether #364 costs anything visible.**
   *
   * `TsldPanel.tsx:1120` hands the canvas `wbsBand.sceneActivities`, so `worldExtent`
   * (`geometry.ts:658-674`) sees only the bars the scene paints, and it reports their **max lane**
   * rather than a count. If the band-only lanes all sat at the END of the packing, the drawn extent
   * would already be compact and those empty lanes would cost nothing at all. Scattered through it,
   * they inflate the extent by every index they occupy below the highest drawn bar.
   *
   * `shippedDrawnMaxLane` is the max lane among NON-band-drawn activities in today's packing;
   * `leverDrawnMaxLane` is the same after lever 2. The difference is the real saving, and it is
   * what separates a defect from a tidy-up.
   */
  shippedDrawnMaxLane: number | null;
  leverDrawnMaxLane: number | null;
}

function statsFor(
  laneOf: ReadonlyMap<string, number>,
  links: readonly { from: string; to: string }[],
): Stats {
  let sum = 0;
  let overFive = 0;
  let counted = 0;
  let maxLane = -1;
  for (const lane of laneOf.values()) maxLane = Math.max(maxLane, lane);
  for (const link of links) {
    const a = laneOf.get(link.from);
    const b = laneOf.get(link.to);
    if (a === undefined || b === undefined) continue;
    const d = Math.abs(a - b);
    sum += d;
    if (d > 5) overFive += 1;
    counted += 1;
  }
  return {
    lanes: maxLane + 1,
    meanDelta: counted === 0 ? 0 : sum / counted,
    overFive,
    links: counted,
  };
}

function applied(
  items: readonly PackItem[],
  changes: readonly { id: string; laneIndex: number }[],
) {
  const laneOf = new Map(items.map((i) => [i.id, i.laneIndex]));
  for (const c of changes) laneOf.set(c.id, c.laneIndex);
  return laneOf;
}

/**
 * **Lever 1 — reorder the lanes after packing, at zero lane cost.**
 *
 * `packLanes` decides how MANY lanes there are and WHICH activities share one. It does not decide
 * which **index** each lane gets, and permuting indices changes every link's travel while leaving
 * the packing valid and the count untouched — lanes are independent time-partitions, so relabelling
 * them cannot create an overlap.
 *
 * The `predecessorsOf` hint structurally cannot reach this. It is greedy: items are placed in start
 * order and each choice is final, so an early placement it would want back is unrecoverable. A
 * global reordering afterwards undoes exactly that.
 *
 * The objective is `sum over links of |index(pred lane) - index(succ lane)|`, which is a **minimum
 * linear arrangement** over a graph whose nodes are lanes and whose edge weights are link counts.
 * That is NP-hard in general; here N is 12-41, so a barycentre pass plus an exhaustive
 * pairwise-swap local search is cheap and good. **It is NOT proven optimal**, so every gain it
 * reports is a LOWER bound on what is available.
 *
 * Deterministic by construction — fixed start order, fixed tie-breaks, no randomness. ADR-0065's
 * argument about a route that varies between frames applies with more force to a lane that varies
 * between presses of the same button.
 */
function reorderLanes(
  laneOf: ReadonlyMap<string, number>,
  links: readonly { from: string; to: string }[],
): Map<string, number> {
  const lanes = [...new Set(laneOf.values())].sort((a, b) => a - b);
  const n = lanes.length;
  const indexOfLane = new Map(lanes.map((l, i) => [l, i]));
  // w[i][j] — how many links run between lane i and lane j.
  const w: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (const link of links) {
    const a = laneOf.get(link.from);
    const b = laneOf.get(link.to);
    if (a === undefined || b === undefined || a === b) continue;
    const i = indexOfLane.get(a)!;
    const j = indexOfLane.get(b)!;
    w[i]![j]! += 1;
    w[j]![i]! += 1;
  }

  // `order[p]` is the lane-node sitting at position p. Start from today's order.
  let order = Array.from({ length: n }, (_, i) => i);
  const cost = (o: readonly number[]): number => {
    const pos = new Map(o.map((node, p) => [node, p]));
    let total = 0;
    for (let i = 0; i < n; i += 1)
      for (let j = i + 1; j < n; j += 1) total += w[i]![j]! * Math.abs(pos.get(i)! - pos.get(j)!);
    return total;
  };

  // Barycentre sweeps: move each node toward the weighted mean position of its neighbours. Ties
  // break on the node's current position, then its id, so the pass is a total order.
  for (let sweep = 0; sweep < 8; sweep += 1) {
    const pos = new Map(order.map((node, p) => [node, p]));
    const bary = order.map((node) => {
      let sum = 0;
      let weight = 0;
      for (let k = 0; k < n; k += 1) {
        if (w[node]![k]! === 0) continue;
        sum += w[node]![k]! * pos.get(k)!;
        weight += w[node]![k]!;
      }
      return { node, key: weight === 0 ? pos.get(node)! : sum / weight, at: pos.get(node)! };
    });
    bary.sort((a, b) => a.key - b.key || a.at - b.at || a.node - b.node);
    const next = bary.map((b) => b.node);
    if (cost(next) < cost(order)) order = next;
    else break;
  }

  // Exhaustive pairwise-swap local search until no swap improves. n <= 41, so a sweep is <= 820
  // evaluations — trivial, and it is what turns a plausible heuristic into a defensible bound.
  for (let guard = 0; guard < 200; guard += 1) {
    let improved = false;
    let best = cost(order);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const candidate = [...order];
        [candidate[i], candidate[j]] = [candidate[j]!, candidate[i]!];
        const c = cost(candidate);
        if (c < best) {
          best = c;
          order = candidate;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const positionOfNode = new Map(order.map((node, p) => [node, p]));
  const out = new Map<string, number>();
  for (const [id, lane] of laneOf) out.set(id, positionOfNode.get(indexOfLane.get(lane)!)!);
  return out;
}

function predecessorMap(links: readonly { from: string; to: string }[]): Map<string, string[]> {
  const predecessorsOf = new Map<string, string[]>();
  for (const l of links) {
    const existing = predecessorsOf.get(l.to);
    if (existing) existing.push(l.from);
    else predecessorsOf.set(l.to, [l.from]);
  }
  return predecessorsOf;
}

/** The shipped packing: `packLanes` with the hint, over the items given. */
function packed(items: readonly PackItem[], links: readonly { from: string; to: string }[]) {
  return applied(items, packLanes([...items], predecessorMap(links)));
}

/**
 * **The probe's 2b above is a MODEL of the shipped rule; this asserts it is the same rule.**
 *
 * ADR-0124's finding was a measurement taken with a *copy* of an instrument, which measures the
 * copy — and `sceneFirst` was written before `computeLaneArrangement` existed, so leaving the two
 * unconnected would mean the numbers in `cheap-levers.md` describe a packing nothing ships. The
 * pack items carry day offsets and the shipped rule takes activities with ISO dates, so the items
 * are mapped back onto an arbitrary epoch — the arithmetic is offset-invariant.
 *
 * It THROWS rather than reporting, because a disagreement means every figure printed below it is
 * about something other than the product.
 */
function assertShippedRuleAgrees(
  items: readonly PackItem[],
  links: readonly { from: string; to: string }[],
  bandDrawn: ReadonlySet<string>,
  expected: ReadonlyMap<string, number>,
): void {
  const EPOCH = '2026-01-01';
  const activities = items.map(
    (i) =>
      ({
        id: i.id,
        laneIndex: i.laneIndex,
        type: bandDrawn.has(i.id) ? 'WBS_SUMMARY' : 'TASK',
        earlyStart: addCalendarDays(EPOCH, i.startDay),
        earlyFinish: addCalendarDays(EPOCH, i.endDay),
      }) as unknown as ActivitySummary,
  );
  const dependencies = links.map(
    (l) =>
      ({
        id: `${l.from}->${l.to}`,
        predecessor: { id: l.from },
        successor: { id: l.to },
      }) as unknown as DependencySummary,
  );
  const shipped = applied(
    items,
    computeLaneArrangement({
      activities,
      sceneActivities: activities.filter((a) => !bandDrawn.has(a.id)),
      dependencies,
      dataDate: EPOCH,
    }),
  );

  for (const [id, lane] of expected) {
    const got = shipped.get(id);
    if (got !== lane) {
      throw new Error(
        `The shipped rule disagrees with this probe's model of lever 2b: "${id}" lands in lane ` +
          `${String(got)}, the model says ${String(lane)}. Every figure below would be fiction.`,
      );
    }
  }
  if (shipped.size !== expected.size) {
    throw new Error(
      `The shipped rule placed ${String(shipped.size)} activities, the model ${String(expected.size)}.`,
    );
  }
}

function measure(
  fixture: string,
  items: PackItem[],
  links: { from: string; to: string }[],
  /** Ids the WBS band draws, which therefore leave the scene (`wbs-band-source.ts:78`). */
  bandDrawn: ReadonlySet<string> = new Set(),
): FixtureResult {
  const arrived = new Map(items.map((i) => [i.id, i.laneIndex]));
  const withHint = packed(items, links);

  let sceneOnly: Stats | null = null;
  let sceneOnlyReordered: Stats | null = null;
  let sceneFirst: Stats | null = null;
  let bandOnlyLanes: number | null = null;
  let shippedDrawnMaxLane: number | null = null;
  let leverDrawnMaxLane: number | null = null;
  if (bandDrawn.size > 0) {
    const sceneItems = items.filter((i) => !bandDrawn.has(i.id));
    const sceneLanes = packed(sceneItems, links);
    sceneOnly = statsFor(sceneLanes, links);
    sceneOnlyReordered = statsFor(reorderLanes(sceneLanes, links), links);

    // Lever 2b: the band's summaries are packed into fresh lanes ABOVE the scene's, so a planner
    // who turns the band off still meets a layout with no same-lane time overlap. Without this the
    // dropped summaries keep whatever stale lane they had, which `lane-overlap.ts` exists to detect.
    const base = Math.max(-1, ...sceneLanes.values()) + 1;
    const bandItems = items.filter((i) => bandDrawn.has(i.id));
    const bandLanes = packed(bandItems, links);
    const combined = new Map(sceneLanes);
    for (const [id, lane] of bandLanes) combined.set(id, base + lane);
    sceneFirst = statsFor(combined, links);
    assertShippedRuleAgrees(items, links, bandDrawn, combined);

    // A lane whose every occupant is band-drawn paints nothing when the band is on.
    const occupants = new Map<number, string[]>();
    for (const [id, lane] of withHint) {
      const list = occupants.get(lane) ?? [];
      list.push(id);
      occupants.set(lane, list);
    }
    bandOnlyLanes = [...occupants.values()].filter((ids) =>
      ids.every((id) => bandDrawn.has(id)),
    ).length;

    shippedDrawnMaxLane = Math.max(
      -1,
      ...[...withHint.entries()].filter(([id]) => !bandDrawn.has(id)).map(([, lane]) => lane),
    );
    leverDrawnMaxLane = Math.max(-1, ...sceneLanes.values());
  }

  return {
    fixture,
    activities: items.length,
    links: links.length,
    asArrived: statsFor(arrived, links),
    packedNoHint: statsFor(applied(items, packLanes(items)), links),
    packedWithHint: statsFor(withHint, links),
    reordered: statsFor(reorderLanes(withHint, links), links),
    sceneOnly,
    sceneOnlyReordered,
    sceneFirst,
    bandOnlyLanes,
    shippedDrawnMaxLane,
    leverDrawnMaxLane,
  };
}

/**
 * The Unit 300 programme, laid out as-early-as-possible from its own durations and relationships.
 *
 * Lanes on arrival are **source order**, which is what an import assigns before ADR-0069's phase 3
 * repacks it — so `asArrived` for this fixture is the state a planner met before that decision, and
 * the packed rows are the state they meet now.
 */
/**
 * The Unit 300 programme, imported and laid out as-early-as-possible — the **ingredients**, before
 * any lane assignment.
 *
 * Extracted at Part C M-C0 so a second harness can reach the same programme without a second copy
 * of this pipeline. `crossing-probe.ts` needs these to build `RenderActivity`s for the real
 * painter; two XER-to-ASAP implementations would drift, and the drift would be **invisible** —
 * each would look right alone, and only somebody comparing two harnesses' numbers on one fixture
 * would ever see it (ADR-0065's `routeOrthogonal` argument).
 *
 * **The extraction was verified behaviour-preserving**: `measure-lane-travel.mjs`'s whole output is
 * byte-identical across it, which is the before/after oracle ADR-0078 used for the canvas
 * decomposition.
 *
 * **These are NOT the CPM engine's dates** and must not be quoted as such — whole days at the
 * file's own eight-hour `day_hr_cnt`, with this function's own PDM arithmetic. That is sound for
 * comparing two LAYOUTS of one programme, where both sides carry identical dates and only the lane
 * assignment differs. It is not sound for anything else.
 */
export function unit300Asap(path: string) {
  const result = importXer({ content: readFileSync(path), filename: 'p6_torture_test_v1.xer' });
  if (!result.ok)
    throw new Error(`Unit 300 import failed: ${result.error.code} ${result.error.message}`);
  const { activities, dependencies } = result.graph;

  const HOURS_PER_DAY = 8; // the file's own `day_hr_cnt`
  const days = (minutes: number): number => Math.max(0, Math.round(minutes / (HOURS_PER_DAY * 60)));

  const predsOf = new Map<string, { from: string; type: string; lagDays: number }[]>();
  for (const d of dependencies) {
    const list = predsOf.get(d.successorKey) ?? [];
    list.push({
      from: d.predecessorKey,
      type: d.type,
      lagDays: Math.round((d.lagMinutes ?? 0) / (HOURS_PER_DAY * 60)),
    });
    predsOf.set(d.successorKey, list);
  }

  // Topological ASAP pass. Kahn's algorithm over the relationship graph; the import is validated
  // acyclic (ADR-0021), so a node left unresolved would be a fixture fault and throws rather than
  // silently landing at day zero.
  const indeg = new Map(activities.map((a) => [a.key, 0]));
  for (const d of dependencies) indeg.set(d.successorKey, (indeg.get(d.successorKey) ?? 0) + 1);
  const queue = activities.filter((a) => (indeg.get(a.key) ?? 0) === 0).map((a) => a.key);
  const succsOf = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = succsOf.get(d.predecessorKey) ?? [];
    list.push(d.successorKey);
    succsOf.set(d.predecessorKey, list);
  }
  const byKey = new Map(activities.map((a) => [a.key, a]));
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  let resolved = 0;
  while (queue.length > 0) {
    const key = queue.shift()!;
    const activity = byKey.get(key)!;
    const dur = days(activity.durationMinutes);
    let s = 0;
    for (const p of predsOf.get(key) ?? []) {
      const ps = start.get(p.from) ?? 0;
      const pf = finish.get(p.from) ?? 0;
      // The four PDM kinds, in whole days. Lag is applied to the driving endpoint.
      const bound =
        p.type === 'FS'
          ? pf + 1 + p.lagDays
          : p.type === 'SS'
            ? ps + p.lagDays
            : p.type === 'FF'
              ? pf + p.lagDays - Math.max(0, dur - 1)
              : ps + p.lagDays - Math.max(0, dur - 1); // SF
      s = Math.max(s, bound);
    }
    start.set(key, Math.max(0, s));
    finish.set(key, Math.max(0, s) + Math.max(0, dur - 1));
    resolved += 1;
    for (const succ of succsOf.get(key) ?? []) {
      const left = (indeg.get(succ) ?? 0) - 1;
      indeg.set(succ, left);
      if (left === 0) queue.push(succ);
    }
  }
  if (resolved !== activities.length) {
    throw new Error(
      `ASAP layout resolved ${String(resolved)} of ${String(activities.length)} activities — ` +
        `the relationship graph is not acyclic, which contradicts ADR-0021. Refusing to judge.`,
    );
  }

  return { activities, dependencies, start, finish };
}

function unit300(path: string): FixtureResult[] {
  const { activities, dependencies, start, finish } = unit300Asap(path);

  // Source order is the lane an import assigns before ADR-0069 phase 3.
  const build = (keep: (t: string) => boolean): PackItem[] =>
    activities
      .filter((a) => keep(a.type))
      .map((a, i) => ({
        id: a.key,
        startDay: start.get(a.key)!,
        endDay: finish.get(a.key)!,
        laneIndex: i,
      }));
  const links = dependencies.map((d) => ({ from: d.predecessorKey, to: d.successorKey }));

  /**
   * The summaries the ADR-0063 band actually DRAWS, and therefore lifts out of the scene
   * (`wbs-band-source.ts:78`). **Not every summary** — the band caps its stacked depth at
   * `WBS_BAND_MAX_DEPTH = 2` (`render/wbs-band.ts:20,31-33`), and that file records a shipped
   * defect from lifting them all out unconditionally: a depth-3 summary vanished from both
   * surfaces at once, invisible and unselectable.
   *
   * Depth here is the activity's depth in the `parentKey` tree, which **approximates** the band's
   * own group depth rather than reproducing it — `wbsBandGroups` is a feature-tier derivation this
   * pure harness does not import. Measured on this fixture all 18 summaries sit at depth 0-2, so
   * the approximation and the real rule agree here; on an unusual tree they could differ by a level.
   */
  const parentOf = new Map(activities.map((a) => [a.key, a.parentKey]));
  const depthOf = (key: string): number => {
    let d = 0;
    let at = parentOf.get(key) ?? null;
    while (at !== null && d < 50) {
      d += 1;
      at = parentOf.get(at) ?? null;
    }
    return d;
  };
  const bandDrawn = new Set(
    activities.filter((a) => a.type === 'WBS_SUMMARY' && depthOf(a.key) <= 2).map((a) => a.key),
  );

  return [
    measure(
      'Unit 300 (ASAP layout, all bars)',
      build(() => true),
      links,
      bandDrawn,
    ),
    // **The 18 WBS summaries, isolated.** A summary spans its whole subtree, so it holds a lane for
    // most of the programme and can only push the lane count up. Whether the 2026-07-31 measurement
    // included them is not recorded anywhere, and it is the leading candidate for the one statistic
    // that does not reproduce.
    measure(
      'Unit 300 (ASAP layout, WBS summaries excluded)',
      build((t) => t !== 'WBS_SUMMARY'),
      links,
    ),
  ];
}

function scale(count: number): FixtureResult {
  const scene = scaleScene(count);
  const dayOf = (iso: string): number =>
    Math.round((Date.parse(iso) - Date.parse('2026-01-01')) / 86_400_000);
  const items: PackItem[] = scene.activities
    .filter((a) => a.earlyStart !== null)
    .map((a) => ({
      id: a.id,
      startDay: dayOf(a.earlyStart!),
      endDay: dayOf(a.earlyFinish ?? a.earlyStart!),
      laneIndex: a.laneIndex,
    }));
  const known = new Set(items.map((i) => i.id));
  const links = scene.edges
    .filter((e) => known.has(e.predecessorId) && known.has(e.successorId))
    .map((e) => ({ from: e.predecessorId, to: e.successorId }));
  // The scale scene carries no parent tree, so the band's depth cap cannot be applied: EVERY
  // summary is treated as band-drawn. That is an UPPER bound on lever 2 for these fixtures, and
  // the Unit 300 rows are the ones to read for a realistic figure.
  const bandDrawn = new Set(
    scene.activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.id),
  );
  return measure(`scale-${String(count)} (${scene.summary})`, items, links, bandDrawn);
}

export function probe(xerPath: string): FixtureResult[] {
  return [...unit300(xerPath), scale(500), scale(2000)];
}
