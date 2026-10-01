import { computeSchedule, type ComputeOptions } from './compute';
import { startDateInstant } from './instants';
import { levelSchedule } from './level';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineResource,
  EngineResult,
} from './types';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **Applying levelling is a placement the planner makes** (`docs/specs/apply-levelled-dates/`,
 * spec §4.6): the pure derivation of the `visualStart` rows that would put every levelled bar where
 * the resource actually frees up — what dragging each bar onto its ghost would write, done at once.
 *
 * It **writes nothing and holds no rule about links.** Levelling now pushes a follower no earlier than
 * its links allow (`docs/specs/logic-aware-levelling/`), but a ghost can still start before a link
 * allows (a rounded predecessor, a hand placement), so rather than re-implementing logic here the
 * function asks the engine. It solves a copy of the plan with every target written, and any target
 * Pass 2 reports `EARLIER_THAN_LOGIC` is left out of the rows. That is safe in one pass because a
 * conflicted placement passes on its logic-earliest (`compute.ts`, `prop`), exactly what leaving it
 * alone passes on, so no other activity's result depends on whether it was dropped.
 *
 * ## Who gets a row
 *
 * A bar levelling moved gets a row, **except an unplaced one that moved only because the work before it
 * moved** (`leveledFollowsLinks`): it follows its links, so a placement would pin it to a date and
 * detach it from them. It is reported in `followingLinks` instead. A **hand-placed** one has a
 * placement the knock-on has made too early, so it does get a row, with reason `LINKS` (CQ-1 (a)): the
 * same thing the apply already did for a hand-placed bar a resource delays.
 *
 * ## The target date
 *
 * A placement is a DATE, read by Pass 2 as the first working minute on or after that day's midnight,
 * so a levelled instant part-way through a day cannot be stated (A3). The target is the earliest
 * **working** date whose placement instant, on the activity's OWN calendar, is at or after the
 * levelled instant: the product owner's CQ-4 (a), "the next working day".
 *
 * **Working, not merely "smallest".** The smallest date whose placement is at or after the instant
 * can be a non-working day (a crane held through Friday gives Saturday), which Pass 2 would roll to
 * Monday; storing the Saturday would leave the stored value and the drawn one disagreeing, and would
 * rest the answer on Pass 2's roll-forward (`m0-measurement.md`, finding 2). The stored date is
 * therefore the day the bar is actually drawn on.
 *
 * It reads the levelled ABSOLUTE instant (`leveledStartInstant`), never the plan-frame
 * `leveledStartOffset`, and it derives the date on the activity's calendar: rounding on the plan's
 * calendar puts an activity whose day starts later than the plan's a day late (P6).
 */
export interface LevellingApplicationInput {
  activities: readonly EngineActivity[];
  edges: readonly EngineEdge[];
  assignments: readonly EngineAssignment[];
  resources: readonly EngineResource[];
  options: {
    dataDate: string;
    planCalendar: WorkingTimeCalendar;
    levelWithinFloatOnly: boolean;
    /**
     * The rest of the plan's network options (progress mode, criticality rule, …), so the preview
     * solves the plan the way a recalculation does. `dataDate` and `calendar` above always win.
     */
    compute?: Partial<ComputeOptions>;
  };
}

export interface LevellingApplicationItem {
  activityId: string;
  /** The stored placement before the apply; null when the bar was not hand-placed. */
  beforeVisualStart: string | null;
  /** Where the bar is drawn today (`YYYY-MM-DD`), hand-placed or not. */
  beforeDrawnStart: string;
  targetStart: string;
  wasPlaced: boolean;
  /** The levelled instant fell part-way through a day and the target is the next day start. */
  roundedToNextDay: boolean;
  /**
   * Why the bar moves: `RESOURCE` (a resource delays it, possibly as well as the work before it) or
   * `LINKS` (only the work before it moved, and its own placement is now too early).
   */
  reason: 'RESOURCE' | 'LINKS';
}

export interface LevellingApplication {
  /** One row per activity to move, earliest target first; `visualStart` is a `YYYY-MM-DD` date. */
  rows: { activityId: string; visualStart: string }[];
  items: LevellingApplicationItem[];
  /** Ids of the rows whose levelled instant fell part-way through a day (a subset of `rows`). */
  roundedToNextDay: string[];
  /** Candidates dropped because the engine said earlier than logic, that carried no placement. */
  leftToLogic: string[];
  /**
   * Unplaced activities that will move only because the bars before them move: they get no row, and
   * follow their links once the rows are written.
   */
  followingLinks: string[];
  /**
   * Hand-placed activities the apply leaves earlier than their logic allows: candidates dropped for
   * that reason, and any placed activity a kept move newly pushes past its own placement. The one
   * kind of conflict the apply is allowed to leave, and it names it (US-3).
   */
  conflictingPlaced: string[];
  /** Kept rows whose new position breaches a finish/start bound they did not breach before. */
  laterThanBoundIntroduced: number;
  /** `leveledActivityCount` of the plan once the rows are written. */
  remainingAfterApply: number;
  /** The plan as it stands, and as it will stand once the rows are written (solved, not predicted). */
  before: readonly EngineResult[];
  after: readonly EngineResult[];
}

const MINUTES_PER_DAY = 1440;

/** The calendar day (`YYYY-MM-DD`) an absolute instant falls on. */
const dateOf = (abs: number): string => absMinutesToInstant(abs).slice(0, 10);

/**
 * The earliest working date on `cal` whose placement instant is at or after `levelled`, and whether
 * that placement is later than `levelled` (the bar starts part of a day after the resource frees up).
 *
 * Terminates without a bound: every pass moves to a strictly later day, and the placement of a day
 * grows without limit, so some day is at or after `levelled`; a non-working day jumps straight to the
 * next working one, so a long shutdown costs one step, not one per day.
 */
function targetDateFor(
  cal: WorkingTimeCalendar,
  type: EngineActivity['type'],
  levelled: number,
): { date: string; rounded: boolean } {
  if (type === 'FINISH_MILESTONE') {
    // A finish milestone's date means the END of that day (#381), so the placement of day D is the
    // working minute after D's midnight-to-midnight span: always on a LATER day than D. The loop below
    // reads "the placement landed on another day" as a non-working day and chases it forever, so a
    // milestone is dated by walking back to the earliest day whose end is at or after the instant.
    const placementOf = (date: string): number => startDateInstant(cal, date, type);
    const shifted = (date: string, days: number): string =>
      dateOf(instantToAbsMinutes(date) + days * MINUTES_PER_DAY);
    let date = dateOf(levelled);
    while (placementOf(shifted(date, -1)) >= levelled) date = shifted(date, -1);
    for (;;) {
      const placed = placementOf(date);
      if (placed >= levelled) return { date, rounded: placed > levelled };
      date = shifted(date, 1);
    }
  }
  let midnight = instantToAbsMinutes(dateOf(levelled));
  for (;;) {
    const date = dateOf(midnight);
    const placed = startDateInstant(cal, date, type);
    const placedDate = dateOf(placed);
    if (placedDate !== date) {
      // A non-working day: Pass 2 would draw it at the next working minute, which is what to store.
      midnight = instantToAbsMinutes(placedDate);
      continue;
    }
    if (placed >= levelled) return { date, rounded: placed > levelled };
    midnight += MINUTES_PER_DAY;
  }
}

/** The plan as a recalculation leaves it: the network pass, then levelling from where bars are drawn. */
function solve(
  input: LevellingApplicationInput,
  activities: readonly EngineActivity[],
): { results: readonly EngineResult[]; leveledActivityCount: number } {
  const { dataDate, planCalendar, levelWithinFloatOnly, compute } = input.options;
  const output = computeSchedule(activities, input.edges, {
    ...compute,
    dataDate,
    calendar: planCalendar,
  });
  const leveled = levelSchedule(
    activities,
    output,
    input.edges,
    input.assignments,
    input.resources,
    {
      levelWithinFloatOnly,
      dataDate,
      planCalendar,
      anchor: 'PLACED',
    },
  );
  return {
    results: leveled.results,
    leveledActivityCount: leveled.summary.leveledActivityCount ?? 0,
  };
}

const earlierThanLogic = (results: readonly EngineResult[]): Set<string> =>
  new Set(
    results.filter((r) => r.visualConflictReason === 'EARLIER_THAN_LOGIC').map((r) => r.activityId),
  );

/** Derive the `visualStart` rows that apply the plan's levelled positions. See the file docblock. */
export function planLevellingApplication(input: LevellingApplicationInput): LevellingApplication {
  const before = solve(input, input.activities);
  const activityById = new Map(input.activities.map((a) => [a.id, a]));
  const beforeById = new Map(before.results.map((r) => [r.activityId, r]));

  // Step 1-3: every activity levelling delayed, with the date that clears the clash.
  interface Candidate {
    activity: EngineActivity;
    result: EngineResult;
    target: string;
    rounded: boolean;
    reason: 'RESOURCE' | 'LINKS';
  }
  const candidates: Candidate[] = [];
  const followingLinks: string[] = [];
  for (const result of before.results) {
    const activity = activityById.get(result.activityId);
    if (!activity || (result.levelingDelay ?? 0) <= 0 || result.leveledStartInstant == null) {
      continue;
    }
    // A knock-on only (`leveledFollowsLinks`): no resource keeps it from where its links put it, so an
    // unplaced bar follows them and a row would only pin it. A placed one needs the row (CQ-1 (a)).
    const knockOn = result.leveledFollowsLinks === true;
    if (knockOn && activity.visualStart == null) {
      followingLinks.push(result.activityId);
      continue;
    }
    const { date, rounded } = targetDateFor(
      activity.calendar ?? input.options.planCalendar,
      activity.type,
      result.leveledStartInstant,
    );
    candidates.push({
      activity,
      result,
      target: date,
      rounded,
      reason: knockOn ? 'LINKS' : 'RESOURCE',
    });
  }

  if (candidates.length === 0) {
    return {
      rows: [],
      items: [],
      roundedToNextDay: [],
      leftToLogic: [],
      followingLinks: followingLinks.sort(),
      conflictingPlaced: [],
      laterThanBoundIntroduced: 0,
      remainingAfterApply: before.leveledActivityCount,
      before: before.results,
      after: before.results,
    };
  }

  // Step 4: the engine is the oracle for logic. Write every target, solve, and drop any the engine
  // says is earlier than its links allow.
  const place = (chosen: readonly Candidate[]): EngineActivity[] => {
    const target = new Map(chosen.map((c) => [c.activity.id, c.target]));
    return input.activities.map((a) => {
      const visualStart = target.get(a.id);
      return visualStart === undefined ? a : { ...a, visualStart };
    });
  };
  const tentative = solve(input, place(candidates));
  const conflicted = earlierThanLogic(tentative.results);
  const kept = candidates.filter((c) => !conflicted.has(c.activity.id));
  const dropped = candidates.filter((c) => conflicted.has(c.activity.id));

  // Step 5: what is left once only the kept rows are written. Solved again only if step 4 removed any.
  const after = dropped.length === 0 ? tentative : solve(input, place(kept));

  // Step 6: consequences, read off the solve rather than predicted.
  const conflictedBefore = earlierThanLogic(before.results);
  const conflictedAfter = earlierThanLogic(after.results);
  const conflictingPlaced = new Set(
    dropped.filter((c) => c.activity.visualStart != null).map((c) => c.activity.id),
  );
  for (const id of conflictedAfter) {
    if (!conflictedBefore.has(id)) conflictingPlaced.add(id);
  }
  const afterById = new Map(after.results.map((r) => [r.activityId, r]));
  const laterThanBoundIntroduced = kept.filter(
    (c) =>
      afterById.get(c.activity.id)?.visualConflictReason === 'LATER_THAN_BOUND' &&
      beforeById.get(c.activity.id)?.visualConflictReason !== 'LATER_THAN_BOUND',
  ).length;

  // Step 7: the rows, earliest target first, then by id so the order never depends on the input's.
  const ordered = [...kept].sort(
    (a, b) =>
      (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) ||
      (a.activity.id < b.activity.id ? -1 : a.activity.id > b.activity.id ? 1 : 0),
  );
  return {
    rows: ordered.map((c) => ({ activityId: c.activity.id, visualStart: c.target })),
    items: ordered.map((c) => ({
      activityId: c.activity.id,
      beforeVisualStart: c.activity.visualStart ?? null,
      beforeDrawnStart: c.result.visualEffectiveStart,
      targetStart: c.target,
      wasPlaced: c.activity.visualStart != null,
      roundedToNextDay: c.rounded,
      reason: c.reason,
    })),
    roundedToNextDay: ordered.filter((c) => c.rounded).map((c) => c.activity.id),
    leftToLogic: dropped.filter((c) => c.activity.visualStart == null).map((c) => c.activity.id),
    followingLinks: followingLinks.sort(),
    conflictingPlaced: [...conflictingPlaced].sort(),
    laterThanBoundIntroduced,
    remainingAfterApply: after.leveledActivityCount,
    before: before.results,
    after: after.results,
  };
}
