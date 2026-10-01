import type { DependencyType } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { planLevellingApplication, type LevellingApplicationInput } from './apply-levelling';
import type { EngineActivity, EngineAssignment, EngineEdge, EngineResource } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * `followingLinks` is pruned against the solve the apply produces, not taken from levelling's
 * pre-filter overlay.
 *
 * The shape that needs it (a hand-placed bar dropped as earlier than its logic, with an unplaced
 * follower that levelling listed as moving behind it) is one the real levelling pass does not produce:
 * a dropped bar is one whose levelled start is earlier than its logic, so it passes nothing on and its
 * follower is never a knock-on (measured: a randomised search over 40 000 small plans found no plan
 * where the two disagree). The pruning is a guarantee about the function's contract that survives a
 * change to levelling, so it is held here by making the levelling pass name the follower, which is what
 * the old code trusted. Every other behaviour is the real engine.
 */
vi.mock('./level', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./level')>();
  return {
    ...actual,
    levelSchedule: (...args: Parameters<typeof actual.levelSchedule>) => {
      const leveled = actual.levelSchedule(...args);
      return {
        ...leveled,
        results: leveled.results.map((r) =>
          r.activityId === 'V'
            ? {
                ...r,
                levelingDelay: 1440,
                leveledStartInstant: r.passOnStartInstant ?? 0,
                leveledFollowsLinks: true,
              }
            : r,
        ),
      };
    },
  };
});

const DAY = 1440;
const CAL24 = allMinutesWorkCalendar;
const task = (
  id: string,
  durationMinutes: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes, type: 'TASK', ...overrides });
const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type: 'FS' satisfies DependencyType,
  lagMinutes: 0,
});
const on = (activityId: string, resourceId: string): EngineAssignment => ({
  activityId,
  resourceId,
  unitsPerHour: 1,
});
const CRANE: EngineResource = { id: 'CRANE', capacity: 1 };

/** P20 (S hand-placed on the 6th, dropped), T written behind S, and V, an unplaced follower of S. */
const input = (): LevellingApplicationInput => ({
  activities: [
    task('U', 5 * DAY),
    task('Z', 3 * DAY, { levelingPriority: 1 }),
    task('S', 2 * DAY, { levelingPriority: 2, visualStart: '2026-01-06' }),
    task('T', 2 * DAY, { levelingPriority: 3 }),
    task('V', DAY),
  ],
  edges: [fs('U', 'S'), fs('S', 'V')],
  assignments: [on('Z', 'CRANE'), on('S', 'CRANE'), on('T', 'CRANE')],
  resources: [CRANE],
  options: { dataDate: '2026-01-05', planCalendar: CAL24, levelWithinFloatOnly: false },
});

describe('planLevellingApplication: a follower whose source was dropped', () => {
  it('names no follower: V is drawn on the same day before and after the apply', () => {
    const plan = planLevellingApplication(input());
    expect(plan.rows).toEqual([{ activityId: 'T', visualStart: '2026-01-10' }]);
    expect(plan.conflictingPlaced).toEqual(['S']);
    const day = (r: typeof plan.before) =>
      r.find((x) => x.activityId === 'V')!.visualEffectiveStart;
    expect(day(plan.after)).toBe(day(plan.before));
    expect(plan.followingLinks).toEqual([]);
  });
});
