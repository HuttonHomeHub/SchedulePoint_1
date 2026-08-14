/**
 * The pure, renderer-agnostic **conflict-ordering** behind the TSLD *Next conflict* command (spec
 * `docs/specs/canvas-nav/`, behind `VITE_CANVAS_NAV`). Like `lenses.ts` it has **no** canvas, DOM, React
 * or data-fetching dependency and does **no** schedule arithmetic — it only reads engine-owned flags the
 * client already has on `ActivitySummary`, so it is exhaustively unit-tested. `useTsldToolbarContext`
 * memoises the ordered list; the toolbar command advances a cursor, centres + selects each hit, and
 * announces the reason.
 */

import { compareByTimeThenLane } from './ordering';

/**
 * The four fields a conflict predicate actually reads.
 *
 * **Split out of {@link ConflictableActivity} (ADR-0094 M1-T2), and the split is load-bearing.**
 * `ConflictFlag.matches` used to take the full shape — including `id`, `earlyStart` and `laneIndex`,
 * which no predicate has ever read and which exist only for {@link orderedConflicts}' sort. Reusing
 * those predicates for the canvas **filter** (the epic's D2: one set, one meaning) would therefore
 * have forced `MatchableActivity` in `lenses.ts` to grow three ordering fields it has no use for —
 * bad coupling arriving through an over-broad signature rather than through a real dependency.
 */
export interface ConflictFlagFields {
  constraintViolated: boolean;
  visualConflict: boolean;
  levelingWindowExceeded: boolean;
}

/** The minimal activity shape the conflict machinery reads — a subset of `ActivitySummary`. The flag
 * fields plus the three {@link orderedConflicts} orders by. */
export interface ConflictableActivity extends ConflictFlagFields {
  id: string;
  name: string;
  earlyStart: string | null;
  laneIndex: number;
}

/**
 * The closed set of conflict keys.
 *
 * **A union rather than `string` (ADR-0094 M1-T1), so the remedy map can be total.** The component
 * layer picks each conflict's remedy from a `Record<ConflictKey, Remedy>`; with an open `string` key
 * that record could silently miss a flag or hold a stale one, which is precisely the
 * drift-by-omission this epic exists to remove. Closed, adding a flag is a **typecheck failure at
 * the map** rather than a conflict that lands on screen with no remedy behind it.
 */
export type ConflictKey = 'constraintViolated' | 'visualConflict' | 'levelingWindowExceeded';

/** One conflict flag: a stable key, a human reason label, and the predicate over an already-shipped
 * engine flag. Single source, so the set + copy can't drift across the app. */
export interface ConflictFlag {
  key: ConflictKey;
  label: string;
  matches: (activity: ConflictFlagFields) => boolean;
}

/**
 * The *Next conflict* flag set, in the order reasons are listed for a multi-flag activity.
 * **Near-critical is deliberately excluded** — it is a lens/insight, not a conflict.
 *
 * - `constraintViolated`     — a mandatory constraint broke logic (ADR-0035 §7)
 * - `visualConflict`         — a Visual-Planning placement conflicts with logic (ADR-0033)
 * - `levelingWindowExceeded` — resource levelling pushed it past its window (ADR-0041 §3)
 *
 * **It held five until ADR-0094, and both departures were the same argument.** A counted conflict is
 * something a planner can *act on*; a fact they cannot act on is noise that teaches them to stop
 * reading the number.
 *
 * - `externalDriven` left because an imported date driving an activity is **normal** on a programme
 *   with real interfaces. It is still reported, by `ScheduleSummaryStrip`'s `externalDrivenCount`.
 * - `negativeFloat` left for the same reason and one more: it propagates **backwards** along a
 *   chain, so one unmeetable deadline flags every predecessor feeding it — one root cause counted N
 *   times, on exactly the plans that most need review, and the only member with no remedy at all.
 *   Counting just the *root* was tried and withdrawn: {@link matchesActivityFilter} takes ONE
 *   activity, so a graph-dependent predicate cannot be expressed there, and the count and the filter
 *   would have disagreed — the very defect this epic exists to fix, recreated by its own fix. It is
 *   still fully visible: it drives `isCritical` (ADR-0035's TF ≤ 0 default) and `FLOAT_BUCKETS[0]`.
 *
 * **The accepted cost, stated rather than discovered:** an over-constrained plan can now show zero
 * conflicts. The Schedule summary strip carries that weight alone.
 */
export const CONFLICT_FLAGS: readonly ConflictFlag[] = [
  {
    key: 'constraintViolated',
    label: 'constraint conflict',
    matches: (a) => a.constraintViolated,
  },
  {
    key: 'visualConflict',
    label: 'visual placement conflict',
    matches: (a) => a.visualConflict,
  },
  {
    key: 'levelingWindowExceeded',
    label: 'levelling window exceeded',
    matches: (a) => a.levelingWindowExceeded,
  },
];

/**
 * A flagged activity to visit — its id, name, the human reason(s) it matched (for the announcement)
 * and the **keys** behind them.
 *
 * **`keys` is not a duplicate of `reasons` (ADR-0094 M1-T3).** `reasons` is display copy; `keys` is
 * what the remedy is chosen by. Carrying only the labels — which is what this type did until now —
 * would have left the selection bar picking a planner's remedy by matching a UI string, so a wording
 * tweak to a `label` would silently break it. Three independent reviewers reached that finding, which
 * is the strongest signal the review pass produced.
 *
 * Both are ordered by {@link CONFLICT_FLAGS}, and `keys[0]` is therefore the reason a multi-flag
 * activity leads with — the one the bar names and offers a remedy for.
 */
export interface ConflictHit {
  id: string;
  name: string;
  reasons: string[];
  keys: ConflictKey[];
}

/**
 * The plan's flagged activities in a stable left-to-right, top-to-bottom walk: matches-any of
 * {@link CONFLICT_FLAGS}, ordered by `earlyStart` → `laneIndex` → `id` (CQ-2). Each hit carries every
 * reason it matched, so a multi-flag activity reads them all. Pure; O(activities · flags).
 */
export function orderedConflicts(activities: readonly ConflictableActivity[]): ConflictHit[] {
  const hits: Array<ConflictHit & { earlyStart: string | null; laneIndex: number }> = [];
  for (const activity of activities) {
    // Matched ONCE and projected twice: the display copy and the keys the remedy is chosen by are
    // two views of the same match, so they cannot fall out of step (ADR-0094 M1-T3).
    const matched = CONFLICT_FLAGS.filter((flag) => flag.matches(activity));
    if (matched.length === 0) continue;
    hits.push({
      id: activity.id,
      name: activity.name,
      reasons: matched.map((flag) => flag.label),
      keys: matched.map((flag) => flag.key),
      earlyStart: activity.earlyStart,
      laneIndex: activity.laneIndex,
    });
  }
  hits.sort(compareByTimeThenLane);
  return hits.map(({ id, name, reasons, keys }) => ({ id, name, reasons, keys }));
}

/**
 * The index of the **next** conflict after the last-visited one (wrapping). `currentId` is the last
 * activity visited: the next is the one after it in {@link orderedConflicts} order. When `currentId` is
 * null (never visited) or no longer flagged (its flag was cleared by a recalc), resume from the start.
 * A single conflict re-selects itself each press. Returns `-1` for an empty list (the caller guards it).
 */
export function nextConflictIndex(currentId: string | null, hits: readonly ConflictHit[]): number {
  if (hits.length === 0) return -1;
  const current = currentId === null ? -1 : hits.findIndex((hit) => hit.id === currentId);
  return (current + 1) % hits.length;
}
