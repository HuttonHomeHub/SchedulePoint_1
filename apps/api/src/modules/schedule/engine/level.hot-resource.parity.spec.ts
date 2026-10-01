import { createHash } from 'node:crypto';

import { scaleSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { specToEngineInput } from '../../../../test/pairwise/spec-to-engine';

import { computeSchedule, levelSchedule, type EngineAssignment } from './index';

/**
 * **M2.5 differential: the contended-resource speed-up changed no output.**
 *
 * Logic-aware levelling M2.5 made the earliest-feasible search incremental ({@link ResourceProfile}),
 * made the calendar's instant conversions arithmetic, and deferred an overlay's display dates to the
 * merge. None of that may move a date. `level-profile.spec.ts` and the calendar fast-path spec hold the
 * two halves to their originals; this holds the whole pass, on the shape that motivated the change.
 *
 * The hashes are the SHA-256 of `JSON.stringify` of the full `levelSchedule` output (every field of
 * every result, and the summary), produced by the engine AS IT STOOD BEFORE M2.5 (commit 0b584a9) on
 * the catalogue's 2,000-activity scale plan: one resource carrying 1,910 of the activities at
 * capacities 8 and 3 (the hot-resource worst case), and the seeded scale plan's own assignments at
 * capacities 8 and 2 — each with Pass C off (no edges given) and on. A hash that stops matching means
 * levelling's OUTPUT moved. If `scaleSpec` itself is changed on purpose, regenerate them from a tree
 * that still has the old engine, never from the one under test.
 */
const FROZEN: Record<string, string> = {
  'hot8 off': '75a75d4a4c03675d83af8dd1b4094c3a077b731660708af9a4dddc4fc71740dd',
  'hot8 on': '41db6a8623b26bdfe4e5c673227e1fe6149de11a2083190c264d405b44f8de13',
  'hot3 off': '3c6b23a624130d389f8832fbef951a8b932f9912bd600ca413411eec235c91a4',
  'hot3 on': '4467a141f9ea891347f5782c74dae498e8b981198e9fcb5716ee4021412fb8b4',
  'scale8 off': '2c52de827ae4693c6144d87672cb89094bc8be38415b13201d2edd97b2f56e1c',
  'scale8 on': 'b39743e18e545b3e8ef1d666edaf4d171840fea7ae202de6c132feca49526e1e',
  'scale2 off': 'e4f28240db69bca68cb1f891f55d85cc15235bb0b5ee1195145d01a6aebf0b41',
  'scale2 on': '66d75aa6e6155a1037b9f8e75a84d6ceffadce8e8f827d52581f971a1e592327',
};

describe('levelSchedule — hot-resource and scale-plan output is byte-identical to before M2.5', () => {
  const spec = scaleSpec({ activities: 2000 });
  const { activities, edges, options } = specToEngineInput(spec);
  const levelOptions = {
    levelWithinFloatOnly: false,
    dataDate: options.dataDate,
    planCalendar: options.calendar,
    anchor: 'PLACED' as const,
  };
  const network = computeSchedule(activities, edges, options);

  const hotAssignments: EngineAssignment[] = activities
    .filter(
      (a) => a.durationMinutes > 0 && a.type !== 'WBS_SUMMARY' && a.type !== 'LEVEL_OF_EFFORT',
    )
    .map((a) => ({ activityId: a.id, resourceId: 'HOT', unitsPerHour: 1 }));
  const seededAssignments: EngineAssignment[] = spec.assignments.map((a) => ({
    activityId: a.activityKey,
    resourceId: a.resourceKey,
    unitsPerHour: a.unitsPerHour ?? 0,
  }));

  const shapes: Array<[string, EngineAssignment[], Array<{ id: string; capacity: number }>]> = [
    ['hot8', hotAssignments, [{ id: 'HOT', capacity: 8 }]],
    ['hot3', hotAssignments, [{ id: 'HOT', capacity: 3 }]],
    ['scale8', seededAssignments, spec.resources.map((r) => ({ id: r.key, capacity: 8 }))],
    ['scale2', seededAssignments, spec.resources.map((r) => ({ id: r.key, capacity: 2 }))],
  ];

  for (const [name, assignments, resources] of shapes) {
    for (const passC of [false, true]) {
      const key = `${name} ${passC ? 'on' : 'off'}`;
      it(
        key,
        () => {
          const output = levelSchedule(
            activities,
            network,
            passC ? edges : [],
            assignments,
            resources,
            levelOptions,
          );
          expect(createHash('sha256').update(JSON.stringify(output)).digest('hex')).toBe(
            FROZEN[key],
          );
        },
        30_000,
      );
    }
  }
});
