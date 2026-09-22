/**
 * **A small, realistic construction plan — decision 8's fixture.**
 *
 * The product owner's words were _"the logic is still difficult to read. **even for a simple plan**
 * the logic is mapping across other bars"_, and asked for one to be built: _"Build a small activity
 * plan but ensure it has sufficient logic links to make it realistic."_
 *
 * **It is a CONSTRUCTION, not the product owner's plan.** Nobody has seen their file. It is a
 * single-storey domestic extension written to be plausible to a planner — a main sequence with two
 * trades running in parallel and rejoining — because that shape is what produces both same-lane runs
 * and cross-lane links, and those are the two mechanisms this epic is about.
 *
 * ## Its value is LOGIC DENSITY, not activity count (FC-L12)
 *
 * A sparse fixture would pass every condition in this epic while exhibiting nothing, and would then
 * be quoted as evidence that small plans are fine. So the floor is **≥ 1.3 links per activity**,
 * derived from Unit 300's own measured 188/144 rather than chosen; this plan carries 29 links over
 * 17 activities, **1.71**.
 *
 * The five properties `measure-small-plan.mjs` asserts are the fixture's own test, and they are
 * asserted **after `packLanes` has run** rather than as authored — which is the only way they mean
 * anything, because every one of them is a property of the layout and not of the network.
 *
 * ## Durations and dates are computed the same way Unit 300's are
 *
 * A topological ASAP pass over the four PDM kinds in whole days, so the shape of the output matches
 * `unit300Asap`'s exactly and every harness in this directory consumes it unchanged.
 */
import { packLanes, type PackItem } from '@repo/layout';

interface SmallActivity {
  key: string;
  label: string;
  type: string;
  durationDays: number;
}

interface SmallDependency {
  predecessorKey: string;
  successorKey: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

/**
 * Seventeen activities: a single-storey extension, ground-up, **with its procurement**.
 *
 * The first draft had thirteen and the build sequence only. Measured, `packLanes` put it in **two
 * rows** — so `crossedLanes` was empty for every link, `routeOrthogonal` never reached its
 * candidate list or its gutter route, and the fixture could not exhibit two of the five things it
 * exists to exhibit. Long-lead procurement is what a real programme has running alongside the
 * build, and it is also exactly what forces extra rows and long cross-lane links, so it is the
 * realistic fix and the useful one at the same time.
 */
const ACTIVITIES: SmallActivity[] = [
  { key: 'A100', label: 'Site setup and hoarding', type: 'TASK', durationDays: 3 },
  { key: 'A105', label: 'Windows and doors — procure', type: 'TASK', durationDays: 25 },
  { key: 'A108', label: 'M&E plant — procure', type: 'TASK', durationDays: 20 },
  { key: 'A110', label: 'Excavate to formation', type: 'TASK', durationDays: 4 },
  { key: 'A120', label: 'Foundations and footings', type: 'TASK', durationDays: 6 },
  { key: 'A130', label: 'Below-ground drainage', type: 'TASK', durationDays: 4 },
  { key: 'A140', label: 'Ground-bearing slab', type: 'TASK', durationDays: 3 },
  { key: 'A150', label: 'Blockwork to wall plate', type: 'TASK', durationDays: 10 },
  { key: 'A155', label: 'Erect scaffold', type: 'TASK', durationDays: 2 },
  { key: 'A160', label: 'Roof structure', type: 'TASK', durationDays: 5 },
  { key: 'A170', label: 'Roof covering', type: 'TASK', durationDays: 4 },
  { key: 'A180', label: 'Windows and external doors', type: 'TASK', durationDays: 3 },
  { key: 'A190', label: 'First-fix M&E', type: 'TASK', durationDays: 6 },
  { key: 'A200', label: 'Plasterboard and skim', type: 'TASK', durationDays: 5 },
  { key: 'A210', label: 'Second-fix M&E', type: 'TASK', durationDays: 5 },
  { key: 'A220', label: 'Decorate and handover', type: 'TASK', durationDays: 6 },
  { key: 'A230', label: 'Externals — drive and paths', type: 'TASK', durationDays: 8 },
];

/**
 * Twenty-nine relationships — **1.71 per activity**, against Unit 300's 1.31.
 *
 * The density is deliberate and it is not padding: a real programme carries the obvious chain PLUS
 * the constraints a planner adds afterwards — a trade that cannot start until the building is
 * weather-tight, a long-lead item that governs a later activity directly, externals that must be
 * done before handover. Those extra links are exactly the ones that span several lanes, and they
 * are the population the complaint is about.
 */
const DEPENDENCIES: SmallDependency[] = [
  { predecessorKey: 'A100', successorKey: 'A110', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A100', successorKey: 'A105', type: 'SS', lagDays: 0 },
  { predecessorKey: 'A100', successorKey: 'A108', type: 'SS', lagDays: 2 },
  { predecessorKey: 'A110', successorKey: 'A120', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A110', successorKey: 'A130', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A120', successorKey: 'A140', type: 'FS', lagDays: 1 }, // curing
  { predecessorKey: 'A130', successorKey: 'A140', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A140', successorKey: 'A155', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A155', successorKey: 'A150', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A140', successorKey: 'A150', type: 'FS', lagDays: 0 }, // A -> C over A155
  { predecessorKey: 'A120', successorKey: 'A150', type: 'FS', lagDays: 0 }, // A -> C, two along
  { predecessorKey: 'A150', successorKey: 'A160', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A155', successorKey: 'A160', type: 'FS', lagDays: 0 }, // scaffold for roof
  { predecessorKey: 'A160', successorKey: 'A170', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A105', successorKey: 'A180', type: 'FS', lagDays: 0 }, // long lead governs
  { predecessorKey: 'A170', successorKey: 'A180', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A150', successorKey: 'A180', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A108', successorKey: 'A190', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A170', successorKey: 'A190', type: 'FS', lagDays: 0 }, // weather-tight
  { predecessorKey: 'A160', successorKey: 'A190', type: 'SS', lagDays: 4 },
  { predecessorKey: 'A140', successorKey: 'A190', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A180', successorKey: 'A200', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A190', successorKey: 'A200', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A200', successorKey: 'A210', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A190', successorKey: 'A210', type: 'FF', lagDays: 0 },
  { predecessorKey: 'A210', successorKey: 'A220', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A200', successorKey: 'A220', type: 'FS', lagDays: 0 }, // A -> C over A210
  { predecessorKey: 'A170', successorKey: 'A230', type: 'SS', lagDays: 2 },
  { predecessorKey: 'A230', successorKey: 'A220', type: 'FS', lagDays: 0 },
];

/**
 * A deliberately SPARSE variant: the same seventeen activities, **the build chain only**.
 *
 * FC-L12's control. The five properties are run against this and must FAIL — a fixture that cannot
 * be made to fail its own properties is describing them rather than asserting them.
 *
 * **Written out in full rather than filtered from the list above, because the first version was a
 * filter and the filter was a no-op** (its second clause compared `indexOf(x)` with `indexOf(x)`).
 * It produced all 29 links, the control passed every property, and the harness refused to accept
 * the fixture — which is the control working, on itself, before it had checked anything else.
 */
const SPARSE: SmallDependency[] = [
  { predecessorKey: 'A100', successorKey: 'A110', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A100', successorKey: 'A105', type: 'SS', lagDays: 0 },
  { predecessorKey: 'A100', successorKey: 'A108', type: 'SS', lagDays: 2 },
  { predecessorKey: 'A110', successorKey: 'A120', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A110', successorKey: 'A130', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A120', successorKey: 'A140', type: 'FS', lagDays: 1 },
  { predecessorKey: 'A140', successorKey: 'A155', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A155', successorKey: 'A150', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A150', successorKey: 'A160', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A160', successorKey: 'A170', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A170', successorKey: 'A180', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A170', successorKey: 'A230', type: 'SS', lagDays: 2 },
  { predecessorKey: 'A180', successorKey: 'A200', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A200', successorKey: 'A210', type: 'FS', lagDays: 0 },
  { predecessorKey: 'A210', successorKey: 'A220', type: 'FS', lagDays: 0 },
];

export interface SmallPlan {
  activities: SmallActivity[];
  dependencies: SmallDependency[];
  start: Map<string, number>;
  finish: Map<string, number>;
}

export interface SmallLayout {
  name: string;
  laneOf: Map<string, number>;
  lanes: number;
}

/** Topological ASAP over the four PDM kinds, in whole days — `unit300Asap`'s pass, same rules. */
function asapOf(activities: SmallActivity[], dependencies: SmallDependency[]): SmallPlan {
  const predsOf = new Map<string, SmallDependency[]>();
  const succsOf = new Map<string, string[]>();
  const indeg = new Map(activities.map((a) => [a.key, 0]));
  for (const d of dependencies) {
    predsOf.set(d.successorKey, [...(predsOf.get(d.successorKey) ?? []), d]);
    succsOf.set(d.predecessorKey, [...(succsOf.get(d.predecessorKey) ?? []), d.successorKey]);
    indeg.set(d.successorKey, (indeg.get(d.successorKey) ?? 0) + 1);
  }
  const byKey = new Map(activities.map((a) => [a.key, a]));
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  const queue = activities.filter((a) => (indeg.get(a.key) ?? 0) === 0).map((a) => a.key);
  let resolved = 0;
  while (queue.length > 0) {
    const key = queue.shift()!;
    const dur = byKey.get(key)!.durationDays;
    let s = 0;
    for (const p of predsOf.get(key) ?? []) {
      const ps = start.get(p.predecessorKey) ?? 0;
      const pf = finish.get(p.predecessorKey) ?? 0;
      const bound =
        p.type === 'FS'
          ? pf + 1 + p.lagDays
          : p.type === 'SS'
            ? ps + p.lagDays
            : p.type === 'FF'
              ? pf + p.lagDays - Math.max(0, dur - 1)
              : ps + p.lagDays - Math.max(0, dur - 1);
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
      `the small fixture's graph is not acyclic — ${String(resolved)} of ` +
        `${String(activities.length)} resolved. That is a fixture fault, not a finding.`,
    );
  }
  return { activities, dependencies, start, finish };
}

/** The fixture in the shape every harness in this directory already consumes. */
export function smallPlanLayouts(options: { sparse?: boolean } = {}): {
  asap: SmallPlan;
  shipped: SmallLayout;
  sourceOrder: SmallLayout;
} {
  const dependencies = options.sparse === true ? SPARSE : DEPENDENCIES;
  const asap = asapOf(ACTIVITIES, dependencies);

  const sourceLane = new Map(ACTIVITIES.map((a, i) => [a.key, i]));
  const items: PackItem[] = ACTIVITIES.map((a) => ({
    id: a.key,
    startDay: asap.start.get(a.key) ?? 0,
    endDay: asap.finish.get(a.key) ?? 0,
    laneIndex: sourceLane.get(a.key) ?? 0,
  }));
  const predecessorsOf = new Map<string, string[]>();
  for (const d of dependencies) {
    predecessorsOf.set(d.successorKey, [
      ...(predecessorsOf.get(d.successorKey) ?? []),
      d.predecessorKey,
    ]);
  }
  const shippedLane = new Map(sourceLane);
  for (const c of packLanes(items, predecessorsOf)) shippedLane.set(c.id, c.laneIndex);

  return {
    asap,
    shipped: {
      name: 'small (packed + hint)',
      laneOf: shippedLane,
      lanes: Math.max(...shippedLane.values()) + 1,
    },
    sourceOrder: {
      name: 'small (source order)',
      laneOf: sourceLane,
      lanes: ACTIVITIES.length,
    },
  };
}
