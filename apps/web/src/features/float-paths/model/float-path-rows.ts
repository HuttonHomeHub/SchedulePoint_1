import { formatDurationText, formatWorkingMinutesNoDays } from '@/lib/duration-text';

/**
 * The pure view-model behind the Float paths panel (audit F4). **No React, no DOM, no fetch** — the
 * `features/tsld/render/lenses.ts` idiom, so every branch below is unit-testable without a browser
 * and the same derivation can feed the canvas, the Gantt and (later) a printed programme.
 */

/**
 * The de-emphasis marker, in words. Single-sourced because BOTH views render it — the canvas's
 * parallel listbox and the Gantt's name cell — and a marker that says one thing in one view and
 * something else in the other is a difference only a reader comparing the two would ever notice.
 */
export const OFF_FLOAT_PATH_LABEL = 'off the float path';

/**
 * What a **negative** relative float means, in plain language.
 *
 * The number is real and not an error: a branch can be MORE critical than a floating target — a
 * constraint-broken predecessor with lower total float. Shown bare, `−1d` reads as breakage, and
 * "−1d above the driving path" read aloud is worse than useless. So the sign gets a sentence.
 */
export const MORE_CRITICAL_NOTE = 'more critical than the target';

/** What the panel needs to know about one activity to draw a chain row. */
export interface FloatPathActivityInput {
  id: string;
  code: string | null;
  name: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  totalFloat: number | null;
  /** The activity's OWN calendar, or null when it inherits the plan's. */
  calendarId: string | null;
}

/** One activity inside a chain. */
export interface FloatPathActivityRow {
  id: string;
  code: string | null;
  /** The activity's name, or `null` when {@link FloatPathActivityRow.missing} is true. */
  name: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  totalFloat: number | null;
  /**
   * True when the client does not hold this activity — it is outside the loaded page, or was
   * deleted under the panel. The row is **kept and marked**, never dropped: a silently shorter
   * chain reads as a different analysis, and the count beside it would be a lie.
   */
  missing: boolean;
}

/** One ranked chain into the target. */
export interface FloatPathRow {
  index: number;
  /**
   * What the row is called. Path 0 is **"Driving"** — never "+0d", which reads as a measurement of
   * nothing rather than the name of the thing every other path is measured against.
   */
  label: string;
  relativeFloatMinutes: number;
  /**
   * The signed relative float as text (`+2d 4h`, `−1d`, `+4h`), or `null` for the driving path,
   * whose relative float is 0 by definition and carries no information.
   */
  relativeFloatText: string | null;
  /** The chain's activities, **target-first** — the API's order, preserved verbatim. */
  activities: FloatPathActivityRow[];
  /** Every member id, including ones the client does not hold. This is the emphasis set's source. */
  activityIds: string[];
  /** The chain's entry — the activity the path is entered at (`activities[0]`). */
  entryName: string | null;
  /** How many activities the chain holds. Counts missing members. */
  activityCount: number;
  /**
   * Set when the relative float is **negative** — this chain is more critical than the target.
   * A real engine output, not a fault, and it needs saying: a bare `−1d` reads as breakage.
   */
  moreCriticalNote: string | null;
}

export interface FloatPathsViewModel {
  targetActivityId: string;
  /** The target's name, or `null` when the client does not hold it. */
  targetName: string | null;
  rows: FloatPathRow[];
  /** True when the analysis returned more paths than were asked for (the API's `hasMorePaths`). */
  hasMorePaths: boolean;
  /**
   * **The CQ-3 disclosure.** Relative float is one activity's total float minus another's, and
   * total float is measured on each activity's **own** calendar (ADR-0037 §4). When the activities
   * in view do not all share the target's calendar, that subtraction mixes units — a working day on
   * an eight-hour calendar is not a working day on a 24-hour one. The figure is still rendered (on
   * the target's calendar, which is what the planner asked the question about) and the panel says
   * so. Suppressing it was the rejected alternative: a planner who can see the chains and not the
   * number would go back to P6 for it.
   */
  mixedCalendars: boolean;
}

/**
 * Render a signed relative float for **read-only display**.
 *
 * The minus is the typographic U+2212, matching `formatLag` — this is not a field a planner retypes.
 * Without a resolved `hoursPerDay` the text degrades to **hours and minutes**, which are the two
 * units that need no calendar factor. It never falls back to 24 or to 8: after ADR-0068 both are
 * silently wrong on the other kind of calendar, and this figure is the one the whole panel ranks on.
 */
export function formatRelativeFloat(minutes: number, hoursPerDay: number | undefined): string {
  if (minutes === 0) return '0d';
  const magnitude =
    hoursPerDay === undefined || hoursPerDay <= 0
      ? formatWorkingMinutesNoDays(Math.abs(minutes))
      : formatDurationText(Math.abs(minutes), hoursPerDay);
  return minutes < 0 ? `−${magnitude}` : `+${magnitude}`;
}

export interface BuildFloatPathRowsInput {
  paths: readonly { index: number; relativeFloatMinutes: number; activityIds: string[] }[];
  targetActivityId: string;
  hasMorePaths: boolean;
  activities: readonly FloatPathActivityInput[];
  /** The plan's calendar — what an activity with a null `calendarId` is measured on. */
  planCalendarId: string | null;
  /** The target's working-hours factor, or `undefined` when it cannot be resolved. */
  targetHoursPerDay: number | undefined;
}

/**
 * Build the panel's view-model from an API response and the activities the client already holds.
 *
 * Order is the contract: the API returns each chain **target-first** (entry … driving root) and
 * ranks the paths by non-decreasing relative float. Neither is re-sorted here. Re-sorting the chain
 * "helpfully" would make the picture disagree with the arrows on the canvas, and re-ranking would
 * discard the engine's answer to the question the panel exists to ask.
 */
export function buildFloatPathRows({
  paths,
  targetActivityId,
  hasMorePaths,
  activities,
  planCalendarId,
  targetHoursPerDay,
}: BuildFloatPathRowsInput): FloatPathsViewModel {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const calendarOf = (activity: FloatPathActivityInput): string | null =>
    activity.calendarId ?? planCalendarId;
  const targetActivity = byId.get(targetActivityId);
  const targetCalendarId = targetActivity === undefined ? null : calendarOf(targetActivity);

  let mixedCalendars = false;

  const rows = paths.map((path): FloatPathRow => {
    const activityRows = path.activityIds.map((id): FloatPathActivityRow => {
      const activity = byId.get(id);
      if (activity === undefined) {
        return {
          id,
          code: null,
          name: null,
          earlyStart: null,
          earlyFinish: null,
          totalFloat: null,
          missing: true,
        };
      }
      // Only activities we actually hold can be compared: an unknown member's calendar is unknown,
      // and inferring "mixed" from absence would fire the disclosure on every plan large enough to
      // page — which would train planners to ignore it.
      if (targetActivity !== undefined && calendarOf(activity) !== targetCalendarId) {
        mixedCalendars = true;
      }
      return {
        id,
        code: activity.code,
        name: activity.name,
        earlyStart: activity.earlyStart,
        earlyFinish: activity.earlyFinish,
        totalFloat: activity.totalFloat,
        missing: false,
      };
    });

    const driving = path.index === 0;
    const relativeFloatText = driving
      ? null
      : formatRelativeFloat(path.relativeFloatMinutes, targetHoursPerDay);

    return {
      index: path.index,
      label: driving ? 'Driving' : (relativeFloatText ?? ''),
      relativeFloatMinutes: path.relativeFloatMinutes,
      relativeFloatText,
      activities: activityRows,
      activityIds: [...path.activityIds],
      entryName: activityRows[0]?.name ?? null,
      activityCount: activityRows.length,
      moreCriticalNote: path.relativeFloatMinutes < 0 ? MORE_CRITICAL_NOTE : null,
    };
  });

  return {
    targetActivityId,
    targetName: targetActivity?.name ?? null,
    rows,
    hasMorePaths,
    mixedCalendars,
  };
}

/**
 * The ids to **emphasise** for a selected path — exactly that path's members, no more.
 *
 * Returns an empty set when nothing is selected, which is what makes "no selection ⇒ no emphasis"
 * a property of the data rather than a branch each view has to remember. Derived once by the
 * workspace and handed to both the canvas and the Gantt: two derivations of "which rows are on the
 * path" would differ eventually, and only in a screenshot or a printed programme (the ADR-0063
 * `wbs-band-source` rule).
 *
 * It reads the **API response's** paths rather than the built row model, deliberately. The rows are
 * joined against `activities`, which react-query hands back as a **fresh reference after every
 * recalculation** — so a set memoised on the rows would re-identify on each recalc cycle and churn
 * every downstream memo, including the canvas dim memo on a paint path already measured over budget
 * (`use-plan-workspace-model.ts` records the same trap costing a re-render of ~46 toolbar buttons).
 * A path's membership is complete on its own; it needs no join.
 */
export function floatPathEmphasisIds(
  paths: readonly { index: number; activityIds: string[] }[] | undefined,
  selectedPathIndex: number | null,
): ReadonlySet<string> {
  if (paths === undefined || selectedPathIndex === null) return EMPTY_EMPHASIS;
  const path = paths.find((candidate) => candidate.index === selectedPathIndex);
  if (path === undefined) return EMPTY_EMPHASIS;
  return new Set(path.activityIds);
}

/**
 * One shared empty set, so "nothing emphasised" is a **stable identity** across renders. A fresh
 * `new Set()` each time would invalidate every downstream memo — including the canvas's dim memo,
 * which sits on a paint path already measured over its budget (TECH_DEBT #75).
 */
const EMPTY_EMPHASIS: ReadonlySet<string> = new Set<string>();

/**
 * The announcement for a path selection, single-sourced so the panel, the canvas and the Gantt
 * cannot drift in what they say. Path 0 is announced as **the driving path**, not "path 0 of n" —
 * a zero-indexed ordinal read aloud sounds like a failure to load.
 */
export function floatPathAnnouncement(row: FloatPathRow, totalPaths: number): string {
  const activities = `${String(row.activityCount)} ${row.activityCount === 1 ? 'activity' : 'activities'}`;
  if (row.index === 0) return `Showing the driving path — ${activities}.`;
  const head = `Showing path ${String(row.index + 1)} of ${String(totalPaths)} — ${activities}`;
  // "−1d above the driving path" is nonsense read aloud. A negative relative float means the chain
  // is more critical than the target, and the sentence has to say that rather than negate a word.
  if (row.moreCriticalNote !== null) {
    return `${head}, ${row.relativeFloatText ?? ''} — ${row.moreCriticalNote}.`;
  }
  return `${head}, ${row.relativeFloatText ?? ''} above the driving path.`;
}
