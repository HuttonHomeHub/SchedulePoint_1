/**
 * **`chain-3-placed` — the shape the product owner reported, as a harness fixture** (NetPoint-layout
 * M0-T2, spec §0.10).
 *
 * A → B → C, finish-to-start, one row. C is **hand-placed two days before B finishes**, so the canvas
 * draws C over B (ADR-0148: a bar is drawn where it was placed). None of the existing yardstick
 * plans can show the Arrange defect PR #663 fixed: `small-plan-fixture.ts` places nothing, and Unit
 * 300 and `scale-2000` are ASAP layouts in which every drawn span IS the early span.
 *
 * **This is a layout, not a schedule.** The harness has no effective-Visual pass, so the fixture
 * carries its DRAWN spans directly in `start`/`finish` — the maps every harness here reads as "where
 * the bar is painted" — and carries the early spans separately, only so the pre-fix layout can be
 * built from them. That is the `scale-scene.ts` honesty: say what the fixture is rather than let a
 * reader assume a scheduling pass ran.
 *
 * Two layouts, and the fixture refuses to exist unless they differ in the way the defect needs:
 *   - `prefix`   packed on the EARLY spans — what Arrange did before #663. C fits after B, so all
 *                three share lane 0 and C is drawn on top of B.
 *   - `shipped`  packed on the DRAWN spans — Arrange since #663. C is moved to its own row.
 */
import { packLanes, type PackItem } from '@repo/layout';

import type { SmallLayout, SmallPlan } from './small-plan-fixture';

const ACTIVITIES = [
  { key: 'A', label: 'A', type: 'TASK', durationDays: 5 },
  { key: 'B', label: 'B', type: 'TASK', durationDays: 5 },
  { key: 'C', label: 'C', type: 'TASK', durationDays: 4 },
];

const DEPENDENCIES = [
  { predecessorKey: 'A', successorKey: 'B', type: 'FS' as const, lagDays: 0 },
  { predecessorKey: 'B', successorKey: 'C', type: 'FS' as const, lagDays: 0 },
];

/** Inclusive day spans. Early: C follows B. Drawn: C placed two days before B's finish (day 9). */
const EARLY = { A: [0, 4], B: [5, 9], C: [10, 13] } as const;
const DRAWN = { A: [0, 4], B: [5, 9], C: [7, 10] } as const;

/** Same-row pairs whose inclusive drawn spans intersect — `packLanes`' own convention. */
export function drawnOverlaps(
  laneOf: ReadonlyMap<string, number>,
  start: ReadonlyMap<string, number>,
  finish: ReadonlyMap<string, number>,
): number {
  const keys = [...laneOf.keys()];
  let overlaps = 0;
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i]!;
      const b = keys[j]!;
      if (laneOf.get(a) !== laneOf.get(b)) continue;
      if (
        (start.get(a) ?? 0) <= (finish.get(b) ?? 0) &&
        (start.get(b) ?? 0) <= (finish.get(a) ?? 0)
      ) {
        overlaps += 1;
      }
    }
  }
  return overlaps;
}

function pack(spans: Record<string, readonly [number, number]>): Map<string, number> {
  const items: PackItem[] = ACTIVITIES.map((a) => ({
    id: a.key,
    startDay: spans[a.key]![0],
    endDay: spans[a.key]![1],
    laneIndex: 0,
  }));
  const predecessorsOf = new Map<string, string[]>();
  for (const d of DEPENDENCIES) {
    predecessorsOf.set(d.successorKey, [
      ...(predecessorsOf.get(d.successorKey) ?? []),
      d.predecessorKey,
    ]);
  }
  const laneOf = new Map(ACTIVITIES.map((a) => [a.key, 0]));
  for (const c of packLanes(items, predecessorsOf)) laneOf.set(c.id, c.laneIndex);
  return laneOf;
}

export function chainPlacedLayouts(): {
  asap: SmallPlan;
  prefix: SmallLayout;
  shipped: SmallLayout;
} {
  const start = new Map(ACTIVITIES.map((a) => [a.key, DRAWN[a.key as keyof typeof DRAWN][0]]));
  const finish = new Map(ACTIVITIES.map((a) => [a.key, DRAWN[a.key as keyof typeof DRAWN][1]]));
  const prefixLane = pack(EARLY);
  const shippedLane = pack(DRAWN);

  // The fixture's self-properties (FC-L12's pattern): a fixture that cannot exhibit the defect would
  // let every reading below pass for the wrong reason, so it throws instead of existing.
  const before = drawnOverlaps(prefixLane, start, finish);
  const after = drawnOverlaps(shippedLane, start, finish);
  if (before === 0 || after !== 0) {
    throw new Error(
      `chain-3-placed does not exhibit the defect: ${String(before)} drawn overlap(s) under the ` +
        `pre-fix pack (want ≥ 1) and ${String(after)} under the fixed pack (want 0). A fixture fault, ` +
        'not a finding.',
    );
  }

  const layout = (name: string, laneOf: Map<string, number>): SmallLayout => ({
    name,
    laneOf,
    lanes: Math.max(...laneOf.values()) + 1,
  });
  return {
    asap: { activities: ACTIVITIES, dependencies: DEPENDENCIES, start, finish },
    prefix: layout('chain-3-placed (pre-fix pack, early spans)', prefixLane),
    shipped: layout('chain-3-placed (packed on drawn spans)', shippedLane),
  };
}
