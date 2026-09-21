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

import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';

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

function measure(
  fixture: string,
  items: PackItem[],
  links: { from: string; to: string }[],
): FixtureResult {
  const predecessorsOf = new Map<string, string[]>();
  for (const l of links) {
    const existing = predecessorsOf.get(l.to);
    if (existing) existing.push(l.from);
    else predecessorsOf.set(l.to, [l.from]);
  }
  const arrived = new Map(items.map((i) => [i.id, i.laneIndex]));
  return {
    fixture,
    activities: items.length,
    links: links.length,
    asArrived: statsFor(arrived, links),
    packedNoHint: statsFor(applied(items, packLanes(items)), links),
    packedWithHint: statsFor(applied(items, packLanes(items, predecessorsOf)), links),
  };
}

/**
 * The Unit 300 programme, laid out as-early-as-possible from its own durations and relationships.
 *
 * Lanes on arrival are **source order**, which is what an import assigns before ADR-0069's phase 3
 * repacks it — so `asArrived` for this fixture is the state a planner met before that decision, and
 * the packed rows are the state they meet now.
 */
function unit300(path: string): FixtureResult[] {
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
  return [
    measure(
      'Unit 300 (ASAP layout, all bars)',
      build(() => true),
      links,
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
  return measure(`scale-${String(count)} (${scene.summary})`, items, links);
}

export function probe(xerPath: string): FixtureResult[] {
  return [...unit300(xerPath), scale(500), scale(2000)];
}
