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
/*
 * **All eight were regenerated on purpose by #539 M2 (ADR-0207 D1)**, which stops snapping a zero-span
 * activity onto its own calendar. Each shape was diffed against the engine at the parent commit before
 * its hash was replaced. What differs is only in-memory instants on this plan's 14 milestones (11 start,
 * 3 finish): `passOnStartInstant` and `passOnFinishInstant` with Pass C off, and with it on also
 * `leveledStartInstant`. No date, offset, float, flag or summary moved in any of the eight.
 */
const FROZEN: Record<string, string> = {
  'hot8 off': 'a15a69a97fd54fbbb79f49c34334dd55ad161df35b368a11b965954fb02f6ce8',
  'hot8 on': '0b89496ba1c2804e6bacaa35310e97902520c01469c8677118296fc50e559dca',
  'hot3 off': '67f60b10cad8bbc908a2fb9b4c6202985a87d8718e2cf05896ce0cf8af01359c',
  'hot3 on': '75c4a28913a13071750d3619e173c9b8c2239c664dbdb3d059eed5abb01ef31d',
  'scale8 off': '10207b579bea982dbc764c4bce5b569ee1461198e149fb795853fd9e82624bce',
  'scale8 on': '23e06585377864d6dfd4a7d042e8b2cfc6b0ffdc4d05dd1b4bc9501f28ed81bf',
  'scale2 off': '20b3859106e43e11328b35efcac8783d3cd8822f392ca2cbd20b5937b1427d7d',
  'scale2 on': '510bdfe57978fd1c9b5579fe25f1ed016c94c73f9315dfbc69e34e94a7a5692a',
};

/**
 * `derivedDurationMinutes` (ADR-0197) is an output the engine gained after these hashes were taken, on
 * the summary and level-of-effort rows only. It is dropped before hashing rather than the hashes being
 * regenerated: the claim under test is that LEVELLING moved no date, and a stripped match against the
 * ORIGINAL hashes proves that, which a regenerated set taken from the tree under test could not.
 */
const withoutDerivedDuration = (key: string, value: unknown): unknown =>
  key === 'derivedDurationMinutes' ? undefined : value;

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
          expect(
            createHash('sha256')
              .update(JSON.stringify(output, withoutDerivedDuration))
              .digest('hex'),
          ).toBe(FROZEN[key]);
        },
        30_000,
      );
    }
  }
});
