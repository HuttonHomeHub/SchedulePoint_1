import {
  type FilterAttr,
  isFilterActive,
  type MatchableActivity,
  matchesActivityFilter,
} from './lenses';
import { compareByTimeThenLane, type OrderableActivity } from './ordering';

/**
 * The pure match model behind "search takes you there" (`docs/specs/canvas-search-navigation/`,
 * behind `VITE_CANVAS_SEARCH_NAV`).
 *
 * Built beside `conflicts.ts` and to the same shape — an ordered list plus a cursor step — because
 * the two are the same interaction with different predicates, and a planner cycling matches should
 * meet the same behaviour they already know from Next conflict. Both walk the plan through
 * {@link compareByTimeThenLane}, so the two cycles cannot order a programme differently.
 *
 * **There is exactly one matching predicate in this feature, and it is not here.**
 * `matchesActivityFilter` in `lenses.ts` already decides what the search dims; this module imports
 * it rather than re-deriving it. A second predicate would be the ADR-0065 `routeOrthogonal` failure
 * in miniature: the two would agree on ordinary queries and drift on the edges, and the only way to
 * see it would be to notice that Enter had skipped a bar the canvas had left un-dimmed. The
 * structural test in `search-matches.structural.test.ts` pins that this file defines no predicate of
 * its own.
 *
 * No React, DOM, canvas or fetch import — pure, and exhaustively unit-tested.
 */

/** One search hit: enough to select it, centre it, and say its name aloud. */
export interface MatchHit {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly earlyStart: string | null;
}

/** The row shape {@link orderedMatches} reads — the matcher's fields plus the walk's. */
export type SearchableActivity = MatchableActivity & OrderableActivity;

/**
 * The plan's matching activities in the shared reading order.
 *
 * Returns an empty list when the filter is inactive (empty query, no attributes) — a search that
 * asks nothing matches nothing to *cycle*, which is deliberately not the same as the lens rule that
 * an inactive filter dims nothing. The caller uses that to keep the n-of-m readout hidden until the
 * planner has actually asked for something.
 */
export function orderedMatches(
  activities: readonly SearchableActivity[],
  query: string,
  attrs: ReadonlySet<FilterAttr>,
): MatchHit[] {
  if (!isFilterActive(query, attrs)) return [];
  const hits = activities.filter((a) => matchesActivityFilter(a, query, attrs));
  return [...hits]
    .sort(compareByTimeThenLane)
    .map(({ id, name, code, earlyStart }) => ({ id, name, code, earlyStart }));
}

/**
 * The index of the hit `delta` steps from the cursor, wrapping in both directions.
 *
 * `cursorId` is the last-visited match. When it is null (never cycled) or no longer in the list (the
 * planner edited the query, or a recalculation moved the activity out of the match set), the walk
 * **resumes at 0** rather than guessing a nearby position — the same rule `nextConflictIndex` uses,
 * and for the same reason: a cursor into a list that has changed underneath it is not a position,
 * and pretending otherwise sends the planner somewhere neither of them chose.
 *
 * Returns `-1` for an empty list; the caller guards it.
 */
export function stepMatchIndex(
  cursorId: string | null,
  hits: readonly MatchHit[],
  delta: number,
): number {
  if (hits.length === 0) return -1;
  const at = cursorId === null ? -1 : hits.findIndex((h) => h.id === cursorId);
  if (at === -1) return 0;
  // `%` keeps a negative sign in JS, so the `+ length` before the second modulo is what makes a
  // backwards step from index 0 land on the last hit rather than on -1.
  return (((at + delta) % hits.length) + hits.length) % hits.length;
}
