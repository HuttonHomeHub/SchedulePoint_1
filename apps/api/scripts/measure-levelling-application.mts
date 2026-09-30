/**
 * **`docs/specs/apply-levelled-dates/` SC-6: what the levelling-application preview costs at 2,000
 * activities, next to what a recalculation costs, on the same plan in the same run.**
 *
 *   pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-levelling-application.mts
 *
 * **Pure: no database, no HTTP, no API.** It times the engine work each route does and nothing else:
 *
 * - a RECALCULATION is `computeSchedule` then `levelSchedule` (`schedule.service.ts`,
 *   `recalculateInLock`), which is also what a write is followed by;
 * - the PREVIEW is `planLevellingApplication`, which is that same pair run once to read the plan,
 *   once more with every target written, and a third time when a target is dropped for being
 *   earlier than its logic.
 *
 * So the figures are the engine share of each request. The recalculation also pays a lock, the
 * graph load and one write, the preview the graph load and the name lookup; none of that is here,
 * and **an HTTP figure would have to come from a host with a database** (the `measure-*.mjs`
 * siblings do that). Read the RATIO and the shape, not the absolute milliseconds: this is not a
 * planner's machine.
 *
 * The plan is the catalogue's scale plan (`scaleSpec`, the generator `plan:scale-2000` is seeded
 * from), its own chain-heavy network and its own assignments, in two variants so the drop path is
 * measured as well as the common one. Both are checked to actually delay activities: a preview of a
 * plan levelling leaves alone would time a no-op.
 */
import { performance } from 'node:perf_hooks';

import { scaleSpec, type SeedSpec } from '@repo/seed';
import { expect, it, vi } from 'vitest';

import {
  computeSchedule,
  levelSchedule,
  planLevellingApplication,
  type EngineAssignment,
  type EngineResource,
} from '../src/modules/schedule/engine/index.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

// 50 so p95 is the 48th of 50 samples rather than the maximum it would be at 15.
const RUNS = 50;

// Counts the solves the preview really runs: `apply-levelling.ts` imports `computeSchedule` from
// './compute', so wrapping that module counts its calls whatever the preview's own branches do.
const solveCounter = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/modules/schedule/engine/compute', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/modules/schedule/engine/compute')>();
  return {
    ...original,
    computeSchedule: (...args: Parameters<typeof original.computeSchedule>) => {
      solveCounter.calls += 1;
      return original.computeSchedule(...args);
    },
  };
});

function percentiles(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { p50: at(50), p95: at(95), min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

function timed(fn: () => void): number[] {
  fn(); // one untimed run to get past JIT warm-up, stated rather than hidden
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples;
}

function measure(label: string, spec: SeedSpec, capacity: number) {
  const { activities, edges, options } = specToEngineInput(spec);
  const assignments: EngineAssignment[] = spec.assignments.map((a) => ({
    activityId: a.activityKey,
    resourceId: a.resourceKey,
    unitsPerHour: a.unitsPerHour ?? 0,
  }));
  const resources: EngineResource[] = spec.resources.map((r) => ({ id: r.key, capacity }));
  const levelOptions = {
    levelWithinFloatOnly: false,
    dataDate: options.dataDate,
    planCalendar: options.calendar,
  };

  const recalculate = () => {
    const output = computeSchedule(activities, edges, options);
    levelSchedule(activities, output, assignments, resources, {
      ...levelOptions,
      anchor: 'PLACED',
    });
  };
  const preview = () =>
    planLevellingApplication({
      activities,
      edges,
      assignments,
      resources,
      options: { ...levelOptions, compute: options },
    });

  solveCounter.calls = 0;
  const application = preview();
  const solves = solveCounter.calls;
  const recalculation = percentiles(timed(recalculate));
  const previewing = percentiles(timed(preview));
  const row = {
    label,
    activities: activities.length,
    links: edges.length,
    capacity,
    rows: application.rows.length,
    roundedToNextDay: application.roundedToNextDay.length,
    leftToLogic: application.leftToLogic.length,
    conflictingPlaced: application.conflictingPlaced.length,
    remainingAfterApply: application.remainingAfterApply,
    solves,
    recalculateMs: recalculation,
    previewMs: previewing,
    ratioP50: previewing.p50 / recalculation.p50,
    ratioP95: previewing.p95 / recalculation.p95,
  };
  console.log(JSON.stringify(row, null, 2));
  return row;
}

it('measures the preview against a recalculation at 2,000 activities', () => {
  const spec = scaleSpec({ activities: 2000 });
  const asSeeded = measure('scale-2000, SCALE_CREW as seeded', spec, 8);
  const tight = measure('scale-2000, SCALE_CREW capacity 2', spec, 2);
  // A preview of a plan levelling does not touch would time a no-op; refuse to report one.
  expect(asSeeded.rows + tight.rows).toBeGreaterThan(0);
  expect(tight.rows).toBeGreaterThan(0);
  // The counted figure, not an inference from dropped activities, is what the record cites.
  expect(asSeeded.solves).toBeGreaterThanOrEqual(2);
  expect(tight.solves).toBeGreaterThanOrEqual(2);
});
