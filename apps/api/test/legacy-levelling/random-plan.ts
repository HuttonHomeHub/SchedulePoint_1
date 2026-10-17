import { createHash } from 'node:crypto';

import type { DependencyType } from '@repo/types';

import { computeSchedule } from '../../src/modules/schedule/engine/compute';
import type { levelSchedule } from '../../src/modules/schedule/engine/level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  LevelingOptions,
} from '../../src/modules/schedule/engine/types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from '../../src/modules/schedule/engine/working-time-calendar';

/**
 * Seeded random levelling plans, shared by the frozen-hash corpus and the legacy differential
 * (TECH_DEBT #84). Changing the generator changes every plan: the frozen hashes must then be
 * regenerated from the legacy engine in this directory, never from the engine under test.
 */

/** mulberry32 — a seeded generator, so a failing seed reproduces. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 1440;
const DATA_DATE = '2026-01-05';
const WEEKDAYS = buildWorkingTimeCalendar(fullDayWeek([1, 2, 3, 4, 5]), []);
const SHIFT = buildWorkingTimeCalendar(
  [0, 1, 2, 3, 4, 5, 6].map((day) =>
    day < 5
      ? [
          { startMinute: 8 * 60, endMinute: 12 * 60 },
          { startMinute: 13 * 60, endMinute: 17 * 60 },
        ]
      : [],
  ),
  [],
);
const CALENDARS: readonly WorkingTimeCalendar[] = [allMinutesWorkCalendar, WEEKDAYS, SHIFT];

const EDGE_TYPES: readonly DependencyType[] = ['FS', 'FS', 'FS', 'SS', 'FF', 'SF'];
/** Whole multiples of 2⁻¹⁶ except the last two, so some plans take the stepping path and some do not. */
const EXACT_UNITS = [1, 1, 1, 0.5, 2, 0.25, 1.5];
const MIXED_UNITS = [1, 1, 0.5, 2, 0.1, 0.3];

export interface RandomPlan {
  activities: EngineActivity[];
  edges: EngineEdge[];
  assignments: EngineAssignment[];
  resources: EngineResource[];
  options: LevelingOptions;
  passC: boolean;
}

export function randomPlan(seed: number): RandomPlan {
  const rand = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

  // Every fourth seed is the hot shape: one resource carrying most of a larger plan, which is what
  // fills enough blocks for the stepping to matter.
  const hot = seed % 4 === 0;
  const planCalendar = pick(CALENDARS);
  const n = hot ? int(150, 260) : int(4, 60);
  const activities: EngineActivity[] = [];
  for (let i = 0; i < n; i += 1) {
    const milestone = rand() < 0.04;
    const subDay = rand() < 0.3;
    const activity: EngineActivity = {
      id: `A${String(i).padStart(3, '0')}`,
      type: milestone ? 'START_MILESTONE' : 'TASK',
      durationMinutes: milestone ? 0 : subDay ? int(1, 16) * 60 : int(1, 9) * DAY,
    };
    if (rand() < 0.25) activity.calendar = pick(CALENDARS);
    if (rand() < 0.15) activity.levelingPriority = int(1, 5);
    activities.push(activity);
  }

  const edges: EngineEdge[] = [];
  const edgeCount = Math.floor(n * (rand() < 0.5 ? 0 : rand() * 1.2));
  for (let k = 0; k < edgeCount; k += 1) {
    const from = int(0, n - 2);
    const to = int(from + 1, n - 1);
    edges.push({
      id: `E${k}`,
      predecessorId: activities[from]!.id,
      successorId: activities[to]!.id,
      type: pick(EDGE_TYPES),
      lagMinutes: rand() < 0.7 ? 0 : int(0, 3) * DAY,
    });
  }

  const resourceCount = hot ? 1 : int(1, 3);
  const exact = rand() < 0.6;
  const units = exact ? EXACT_UNITS : MIXED_UNITS;
  const resources: EngineResource[] = [];
  for (let r = 0; r < resourceCount; r += 1) {
    const capacity = pick(hot ? [1, 2, 3] : [1, 1, 2, 3, 1.5, 0.5, 4]);
    resources.push({
      id: `R${r}`,
      capacity,
      ...(rand() < 0.15 ? { calendar: allMinutesWorkCalendar } : {}),
    });
  }

  const assignments: EngineAssignment[] = [];
  for (const activity of activities) {
    if (rand() < (hot ? 0.9 : 0.7)) {
      const touched = rand() < 0.2 && resourceCount > 1 ? 2 : 1;
      const first = int(0, resourceCount - 1);
      for (let t = 0; t < touched; t += 1) {
        const resource = resources[(first + t) % resourceCount]!;
        const unitsPerHour = pick(units);
        assignments.push({
          activityId: activity.id,
          resourceId: resource.id,
          unitsPerHour: rand() < 0.03 ? resource.capacity! + 1 : unitsPerHour,
          ...(rand() < 0.15 && activity.durationMinutes > 60 ? { lagMinutes: int(1, 4) * 60 } : {}),
        });
      }
    }
  }

  return {
    activities,
    edges,
    assignments,
    resources,
    options: {
      levelWithinFloatOnly: rand() < 0.2,
      dataDate: DATA_DATE,
      planCalendar,
      anchor: rand() < 0.8 ? 'PLACED' : 'NETWORK',
    },
    passC: rand() < 0.5,
  };
}

export function levelled(plan: RandomPlan, level: typeof levelSchedule): unknown {
  const network = computeSchedule(plan.activities, plan.edges, {
    dataDate: plan.options.dataDate,
    calendar: plan.options.planCalendar,
  });
  return level(
    plan.activities,
    network,
    plan.passC ? plan.edges : [],
    plan.assignments,
    plan.resources,
    plan.options,
  );
}

export const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
