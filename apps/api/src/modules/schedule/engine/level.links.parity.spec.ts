import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import { forwardLowerBound } from './edge-bounds';
import { advanceWorking, rollForwardToWorking } from './instants';
import { levelSchedule } from './level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
} from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **`docs/specs/logic-aware-levelling/` M0: what `levelSchedule` does TODAY to a plan whose delayed
 * activities have followers, captured before `level.ts` is touched.**
 *
 * It is the sibling of {@link ./level.parity.spec.ts} and it is the opposite kind of file. That corpus
 * is the Gate B/C parity argument: none of its eight scenarios has a delayed activity with a
 * successor (spec §0 C10, measured in `m0-measurement.md`), so its snapshots must **never** move. These
 * snapshots are of shapes that DO have a follower of a delayed activity, so they record today's
 * answer, which is the defect, and **they are expected to move exactly once, in M2**, when Pass C
 * lands. That diff is the review artefact for the whole epic: every line of it should be a follower
 * moving later because a predecessor did, and nothing else.
 *
 * Three groups, in the order a reader should trust them:
 *
 * 1. **Snapshots** (the five propagation shapes) — what is current, not what is correct.
 * 2. **Gate D guards**, plain `it`, which hold today **and after M2**: a plan that has a conflicted or
 *    hand-placed bar but no predecessor that levelling moved must not change (spec §4.5, Gate D).
 * 3. **`it.fails`**, red today and flipped to `it` by M2, each paired with a plain-`it` precondition
 *    that asserts the fixture's numbers, so a case cannot be red for the wrong reason (ADR-0110, the
 *    `apply-levelling.spec.ts` pattern). `m0-measurement.md` records each one run green against a
 *    reference Pass C and the wrong implementations it was built to catch.
 */

const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  overrides: Partial<EngineActivity> = {},
): EngineActivity => ({ id, durationMinutes: durationDays * DAY, type: 'TASK', ...overrides });

const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagDays = 0,
): EngineEdge => ({
  id: `${predecessorId}-${successorId}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: lagDays * DAY,
});

const on = (activityId: string, resourceId: string): EngineAssignment => ({
  activityId,
  resourceId,
  unitsPerHour: 1,
});

const CRANE: EngineResource = { id: 'CRANE', capacity: 1 };
const PUMP: EngineResource = { id: 'PUMP', capacity: 1 };

interface Shape {
  activities: readonly EngineActivity[];
  edges: readonly EngineEdge[];
  assignments: readonly EngineAssignment[];
  resources: readonly EngineResource[];
  dataDate?: string;
  calendar?: WorkingTimeCalendar;
  levelWithinFloatOnly?: boolean;
}

function solve(shape: Shape) {
  const dataDate = shape.dataDate ?? '2026-01-01';
  const calendar = shape.calendar ?? allMinutesWorkCalendar;
  const output = computeSchedule(shape.activities, shape.edges, { dataDate, calendar });
  const leveled = levelSchedule(shape.activities, output, shape.assignments, shape.resources, {
    levelWithinFloatOnly: shape.levelWithinFloatOnly ?? false,
    dataDate,
    planCalendar: calendar,
    anchor: 'PLACED',
  });
  return {
    ...leveled,
    dataDate,
    calendar,
    byId: new Map<string, EngineResult>(leveled.results.map((r) => [r.activityId, r])),
  };
}

/**
 * The links whose successor starts before its predecessor's LEVELLED position allows (spec SC-1). A
 * position is the overlay where there is one and the drawn span where there is not, and the bound is
 * the one `forwardLowerBound` states, so this reads the rule and does not restate it. A level-of-effort
 * predecessor pushes nothing and a mandatory or started successor is never moved (spec D-2).
 */
function violatedLinks(shape: Shape, solved: ReturnType<typeof solve>): string[] {
  const activityById = new Map(shape.activities.map((a) => [a.id, a]));
  const dataDateAbs = instantToAbsMinutes(solved.dataDate);
  const at = (offset: number) => advanceWorking(solved.calendar, dataDateAbs, offset);
  const start = (r: EngineResult) =>
    rollForwardToWorking(solved.calendar, at(r.leveledStartOffset ?? r.placedStartOffset));
  const finish = (r: EngineResult) => at(r.leveledFinishOffset ?? r.placedFinishOffset);
  return shape.edges
    .filter((e) => {
      const pred = activityById.get(e.predecessorId)!;
      const succ = activityById.get(e.successorId)!;
      return pred.type !== 'LEVEL_OF_EFFORT' && succ.type !== 'LEVEL_OF_EFFORT';
    })
    .filter((e) => {
      const succ = activityById.get(e.successorId)!;
      const cal = succ.calendar ?? solved.calendar;
      const pred = solved.byId.get(e.predecessorId)!;
      const bound = forwardLowerBound(
        e,
        start(pred),
        finish(pred),
        cal,
        succ.durationMinutes,
        solved.calendar,
      );
      return rollForwardToWorking(cal, bound) > start(solved.byId.get(e.successorId)!);
    })
    .map((e) => e.id)
    .sort();
}

const startOf = (r: EngineResult | undefined) => r?.leveledStart ?? null;

// ── The five propagation shapes ───────────────────────────────────────────────────────────────────

/** Q and P want one crane, and P (priority 2) waits. `...` is what follows P. */
const SHAPES: Record<string, Shape> = {
  'an FS chain through activities that hold no resource': {
    activities: [
      task('Q', 3, { levelingPriority: 1 }),
      task('P', 3, { levelingPriority: 2 }),
      task('C', 2),
      task('D', 1),
    ],
    edges: [edge('P', 'C'), edge('C', 'D')],
    assignments: [on('Q', 'CRANE'), on('P', 'CRANE')],
    resources: [CRANE],
  },
  'SS and FF followers, each with a lag': {
    activities: [
      task('Q', 3, { levelingPriority: 1 }),
      task('P', 3, { levelingPriority: 2 }),
      task('S', 2),
      task('F', 2),
    ],
    edges: [edge('P', 'S', 'SS', 1), edge('P', 'F', 'FF', 1)],
    assignments: [on('Q', 'CRANE'), on('P', 'CRANE')],
    resources: [CRANE],
  },
  'a follower that needs a second resource of its own': {
    activities: [
      task('Q', 3, { levelingPriority: 1 }),
      task('P', 3, { levelingPriority: 2 }),
      task('R', 4, { levelingPriority: 1 }),
      task('S', 2, { levelingPriority: 2 }),
    ],
    edges: [edge('P', 'S')],
    assignments: [on('Q', 'CRANE'), on('P', 'CRANE'), on('R', 'PUMP'), on('S', 'PUMP')],
    resources: [CRANE, PUMP],
  },
  'a priority inversion: the follower is placed before the predecessor it follows': {
    // Priority order is X, S, P. S is placed first, behind X, at day 3; P is then pushed to day 5, which is
    // after S, although S must follow P.
    activities: [
      task('X', 3, { levelingPriority: 1 }),
      task('S', 2, { levelingPriority: 2 }),
      task('P', 2, { levelingPriority: 3 }),
    ],
    edges: [edge('P', 'S')],
    assignments: [on('X', 'CRANE'), on('S', 'CRANE'), on('P', 'CRANE')],
    resources: [CRANE],
  },
  'levelWithinFloatOnly with a chain behind the delayed activity': {
    // D runs ten days, so B and the chain behind it have float to absorb the wait for the crane.
    activities: [
      task('A', 2, { levelingPriority: 1 }),
      task('B', 2, { levelingPriority: 2 }),
      task('C', 1),
      task('E', 1),
      task('D', 10),
    ],
    edges: [edge('B', 'C'), edge('C', 'E')],
    assignments: [on('A', 'CRANE'), on('B', 'CRANE')],
    resources: [CRANE],
    levelWithinFloatOnly: true,
  },
};

describe('levelSchedule: followers of a delayed activity, as the engine answers today', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    it(name, () => {
      const { results, summary } = solve(shape);
      // The fields levelling OWNS, sorted by id, so a reordering of the results array is not mistaken
      // for a scheduling change; `leveledProjectFinish` is in because it is the figure #427 says is early.
      expect({
        leveledProjectFinish: summary.leveledProjectFinish ?? null,
        activities: [...results]
          .sort((a, b) => a.activityId.localeCompare(b.activityId))
          .map((r) => ({
            id: r.activityId,
            leveledStart: r.leveledStart ?? null,
            leveledFinish: r.leveledFinish ?? null,
            levelingDelay: r.levelingDelay ?? null,
            levelingWindowExceeded: r.levelingWindowExceeded ?? false,
            selfOverAllocated: r.selfOverAllocated ?? false,
          })),
      }).toMatchSnapshot();
    });
  }
});

// ── Gate D guards: hold today and after M2 ────────────────────────────────────────────────────────

describe('Gate D: an activity levelling did not move behind keeps the answer it has today', () => {
  it('a hand-placed predecessor that levelling leaves where it is does not push a follower already earlier than its links', () => {
    // P is drawn on 6 January, five days after its early start, on a crane nobody else wants. S has no
    // resource and is hand-placed on 3 January, before P finishes: a conflict the planner made. Nothing
    // here is delayed, so nothing is pushed, and S must not be "repaired" (spec D-3).
    const shape: Shape = {
      activities: [
        task('P', 2, { visualStart: '2026-01-06' }),
        task('S', 2, { visualStart: '2026-01-03' }),
      ],
      edges: [edge('P', 'S')],
      assignments: [on('P', 'CRANE')],
      resources: [CRANE],
    };
    const { byId } = solve(shape);
    expect(byId.get('P')!.leveledStart).toBe('2026-01-06');
    expect(byId.get('P')!.levelingDelay).toBe(0);
    expect(byId.get('S')!.visualConflict).toBe(true);
    expect(startOf(byId.get('S'))).toBeNull();
  });

  it('a hand-placed bar earlier than its links is not repaired when no predecessor moved', () => {
    const shape: Shape = {
      activities: [task('P', 2), task('S', 1, { visualStart: '2026-01-01' }), task('Z', 1)],
      edges: [edge('P', 'S')],
      assignments: [on('Z', 'CRANE')],
      resources: [CRANE],
    };
    const { byId } = solve(shape);
    expect(byId.get('S')!.visualConflict).toBe(true);
    expect(startOf(byId.get('S'))).toBeNull();
  });
});

// ── Red until M2 ──────────────────────────────────────────────────────────────────────────────────

describe('SC-1: no ghost starts earlier than its links allow', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`precondition: ${name} has a link its overlay breaks today`, () => {
      expect(violatedLinks(shape, solve(shape)).length).toBeGreaterThan(0);
    });

    it.fails(`holds for ${name}`, () => {
      expect(violatedLinks(shape, solve(shape))).toEqual([]);
    });
  }
});

/**
 * Spec §4.5's hand-computed chain golden, which `LEVELLING_GOLDEN_CASES` cannot hold (its one case has
 * no links): the M0 S2 fixture. `Q` and `P` share a crane for three days each, `C` follows `P`, the
 * calendar is 24/7 and the data date is Monday 5 January. `Q` takes the crane first (priority 1), so `P`
 * is levelled to 8-10 January, and `C` cannot start before `P` finishes, so it runs 11-12 January. The
 * levelled finish is therefore 12 January: today's figure is 10 January, two days early (#427).
 */
describe('the chain golden (spec §4.5)', () => {
  const golden: Shape = {
    activities: [
      task('Q', 3, { levelingPriority: 1 }),
      task('P', 3, { levelingPriority: 2 }),
      task('C', 2),
    ],
    edges: [edge('P', 'C')],
    assignments: [on('Q', 'CRANE'), on('P', 'CRANE')],
    resources: [CRANE],
    dataDate: '2026-01-05',
  };

  it('precondition: P is levelled to 8-10 January, C has no overlay, and the levelled finish is 10 January', () => {
    const { byId, summary } = solve(golden);
    expect([byId.get('P')!.leveledStart, byId.get('P')!.leveledFinish]).toEqual([
      '2026-01-08',
      '2026-01-10',
    ]);
    expect(startOf(byId.get('C'))).toBeNull();
    expect(byId.get('C')!.earlyFinish).toBe('2026-01-09');
    expect(summary.leveledProjectFinish).toBe('2026-01-10');
  });

  it.fails('levels C to 11-12 January and finishes the plan on 12 January', () => {
    const { byId, summary } = solve(golden);
    expect([byId.get('C')!.leveledStart, byId.get('C')!.leveledFinish]).toEqual([
      '2026-01-11',
      '2026-01-12',
    ]);
    expect(summary.leveledProjectFinish).toBe('2026-01-12');
  });
});

/**
 * An LOE predecessor pushes nothing (`compute.ts:325-326`, spec C9). `B` is level-of-effort between `A`
 * and `D`, with a negative lag behind it, and `C` shares the crane with `A` and is levelled to 3
 * January. `D` follows `C` (SS), so `D` must move to 3 January. An implementation that lets the LOE
 * count in the link floor masks `C`'s push behind the LOE's own bound, which is the same in the floor
 * with and without the push, and leaves `D` where it is. The plan levels within float only, because `C`
 * is then left at its within-float cap and overlaps `A`, which is what puts it on 3 January.
 */
describe('an LOE predecessor pushes nothing, but a real predecessor still does', () => {
  const shape: Shape = {
    activities: [
      task('A', 3, { levelingPriority: 1 }),
      { id: 'B', durationMinutes: 0, type: 'LEVEL_OF_EFFORT' },
      task('C', 1, { levelingPriority: 2 }),
      task('D', 1),
    ],
    edges: [edge('A', 'B', 'FS', 0.5), edge('B', 'D', 'FS', -1), edge('C', 'D', 'SS')],
    assignments: [on('A', 'CRANE'), on('C', 'CRANE')],
    resources: [CRANE],
    levelWithinFloatOnly: true,
  };

  it('precondition: C is levelled to 3 January and D, which follows it, starts on 1 January with no overlay', () => {
    const { byId } = solve(shape);
    expect(byId.get('C')!.leveledStart).toBe('2026-01-03');
    expect(byId.get('D')!.earlyStart).toBe('2026-01-01');
    expect(startOf(byId.get('D'))).toBeNull();
  });

  it.fails('levels D to 3 January, behind C', () => {
    expect(startOf(solve(shape).byId.get('D'))).toBe('2026-01-03');
  });
});

/**
 * The within-float cap clamps to the later of the drawn start and the link floor (spec D-8, C17).
 *
 * **On a single calendar the clamp can never fire**: a capped predecessor finishes by its late finish, so
 * its follower's floor is never after the follower's own late start (measured in `m0-measurement.md`,
 * M0-T3: 1,476 caps fired over 60,000 random plans on one 24/7 calendar and none was clamped). It fires
 * only where the plan's calendar and an activity's own disagree, which is this fixture: the plan works
 * Monday to Friday and both activities run seven days a week. `B` holds the crane, and `C` (priority 2,
 * finish-no-later-than 9 January) finishes with it (FF). `C`'s late finish is a plan-frame (Monday to
 * Friday) offset, so its within-float cap lands before `B`'s finish unless it is clamped to the floor.
 */
describe('the within-float cap never puts a follower before its link floor', () => {
  const weekdays = buildWorkingTimeCalendar(fullDayWeek([1, 2, 3, 4, 5]), []);
  const shape: Shape = {
    activities: [
      task('B', 2, { calendar: allMinutesWorkCalendar }),
      task('C', 3, {
        calendar: allMinutesWorkCalendar,
        levelingPriority: 2,
        constraintType: 'FNLT',
        constraintDate: '2026-01-09',
      }),
    ],
    edges: [edge('B', 'C', 'FF')],
    assignments: [on('B', 'CRANE'), on('C', 'CRANE')],
    resources: [CRANE],
    calendar: weekdays,
    levelWithinFloatOnly: true,
  };

  it('precondition: B is levelled to 4-5 January and C sits at 1-3 January, finishing before the activity it must finish with', () => {
    const { byId } = solve(shape);
    expect([byId.get('B')!.leveledStart, byId.get('B')!.leveledFinish]).toEqual([
      '2026-01-04',
      '2026-01-05',
    ]);
    expect([byId.get('C')!.leveledStart, byId.get('C')!.leveledFinish]).toEqual([
      '2026-01-01',
      '2026-01-03',
    ]);
  });

  it.fails('keeps C finishing no earlier than B', () => {
    const { byId } = solve(shape);
    expect(byId.get('C')!.leveledFinish! >= byId.get('B')!.leveledFinish!).toBe(true);
  });
});
