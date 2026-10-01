/**
 * **`docs/specs/logic-aware-levelling/` SC-5, the worst case: one hot resource across a long chain.**
 *
 *   pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-hot-resource.mts \
 *     --silent=false --disable-console-intercept
 *
 * The catalogue's scale plan (2,000 activities, chain-heavy) with EVERY working activity assigned to
 * one shared resource, so every follower of a delayed bar is also a resourced participant that Pass C
 * must release and re-place. Pure engine, no database: a recalculation is `computeSchedule` then
 * `levelSchedule`. "Off" is the same tree with the link walk given no edges (so it carries every other
 * M2 cost) and "on" is Pass C; the two are alternated in one loop so machine drift cancels. Read the
 * ratio, not the milliseconds.
 */
import { performance } from 'node:perf_hooks';

import { scaleSpec } from '@repo/seed';
import { it } from 'vitest';

import {
  computeSchedule,
  levelSchedule,
  type EngineAssignment,
  type EngineResource,
} from '../src/modules/schedule/engine/index.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

const RUNS = 30;
const pct = (s: number[], p: number) => {
  const a = [...s].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]!;
};

it('hot resource', () => {
  const spec = scaleSpec({ activities: 2000 });
  const { activities, edges, options } = specToEngineInput(spec);
  for (const capacity of [8, 2, 1]) {
    const assignments: EngineAssignment[] = activities
      .filter(
        (a) => a.durationMinutes > 0 && a.type !== 'WBS_SUMMARY' && a.type !== 'LEVEL_OF_EFFORT',
      )
      .map((a) => ({ activityId: a.id, resourceId: 'HOT', unitsPerHour: 1 }));
    const resources: EngineResource[] = [{ id: 'HOT', capacity }];
    const lo = {
      levelWithinFloatOnly: false,
      dataDate: options.dataDate,
      planCalendar: options.calendar,
      anchor: 'PLACED' as const,
    };
    const run = (withEdges: boolean) => {
      const out = computeSchedule(activities, edges, options);
      return levelSchedule(activities, out, withEdges ? edges : [], assignments, resources, lo);
    };
    const off: number[] = [];
    const on: number[] = [];
    run(false);
    run(true);
    for (let i = 0; i < RUNS; i += 1) {
      let t = performance.now();
      run(false);
      off.push(performance.now() - t);
      t = performance.now();
      run(true);
      on.push(performance.now() - t);
    }
    const a = run(false);
    const b = run(true);
    console.log(
      JSON.stringify({
        capacity,
        assigned: assignments.length,
        delayedOff: a.summary.leveledActivityCount,
        delayedOn: b.summary.leveledActivityCount,
        finishOff: a.summary.leveledProjectFinish,
        finishOn: b.summary.leveledProjectFinish,
        off: { p50: pct(off, 50), p95: pct(off, 95) },
        on: { p50: pct(on, 50), p95: pct(on, 95) },
        ratioP50: pct(on, 50) / pct(off, 50),
        ratioP95: pct(on, 95) / pct(off, 95),
      }),
    );
  }
});
