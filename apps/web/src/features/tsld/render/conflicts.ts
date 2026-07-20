/**
 * The pure, renderer-agnostic **conflict-ordering** behind the TSLD *Next conflict* command (spec
 * `docs/specs/canvas-nav/`, behind `VITE_CANVAS_NAV`). Like `lenses.ts` it has **no** canvas, DOM, React
 * or data-fetching dependency and does **no** schedule arithmetic — it only reads engine-owned flags the
 * client already has on `ActivitySummary`, so it is exhaustively unit-tested. `useTsldToolbarContext`
 * memoises the ordered list; the toolbar command advances a cursor, centres + selects each hit, and
 * announces the reason.
 */

/** The minimal activity shape the conflict machinery reads — a subset of `ActivitySummary`. */
export interface ConflictableActivity {
  id: string;
  name: string;
  earlyStart: string | null;
  laneIndex: number;
  constraintViolated: boolean;
  visualConflict: boolean;
  externalDriven: boolean;
  levelingWindowExceeded: boolean;
  totalFloat: number | null;
}

/** One conflict flag in the v1 set (CQ-2): a stable key, a human reason label, and the predicate over an
 * already-shipped engine flag. Single source, so the set + copy can't drift across the app. */
export interface ConflictFlag {
  key: string;
  label: string;
  matches: (activity: ConflictableActivity) => boolean;
}

/**
 * The v1 *Next conflict* flag set (CQ-2), in the order reasons are listed for a multi-flag activity.
 * **Near-critical is deliberately excluded** — it is a lens/insight, not a conflict. Additive: a future
 * flag drops in here without touching the ordering / cursor logic.
 *
 * - `constraintViolated`     — a mandatory constraint broke logic (ADR-0035 §7)
 * - `visualConflict`         — a Visual-Planning placement conflicts with logic (ADR-0033)
 * - `externalDriven`         — an imported external date drives the activity (ADR-0043)
 * - `levelingWindowExceeded` — resource levelling pushed it past its window (ADR-0041 §3)
 * - `negativeFloat`          — negative total float (`totalFloat < 0`, an over-constrained activity)
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
    key: 'externalDriven',
    label: 'external date driver',
    matches: (a) => a.externalDriven,
  },
  {
    key: 'levelingWindowExceeded',
    label: 'levelling window exceeded',
    matches: (a) => a.levelingWindowExceeded,
  },
  {
    key: 'negativeFloat',
    label: 'negative total float',
    matches: (a) => a.totalFloat !== null && a.totalFloat < 0,
  },
];

/** A flagged activity to visit — its id, name, and the human reason(s) it matched (for the announcement). */
export interface ConflictHit {
  id: string;
  name: string;
  reasons: string[];
}

/** Order two nullable early-start ISO dates ascending, nulls last (`YYYY-MM-DD` sorts lexicographically). */
function compareEarlyStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * The plan's flagged activities in a stable left-to-right, top-to-bottom walk: matches-any of
 * {@link CONFLICT_FLAGS}, ordered by `earlyStart` → `laneIndex` → `id` (CQ-2). Each hit carries every
 * reason it matched, so a multi-flag activity reads them all. Pure; O(activities · flags).
 */
export function orderedConflicts(activities: readonly ConflictableActivity[]): ConflictHit[] {
  const hits: Array<ConflictHit & { earlyStart: string | null; laneIndex: number }> = [];
  for (const activity of activities) {
    const reasons = CONFLICT_FLAGS.filter((flag) => flag.matches(activity)).map(
      (flag) => flag.label,
    );
    if (reasons.length === 0) continue;
    hits.push({
      id: activity.id,
      name: activity.name,
      reasons,
      earlyStart: activity.earlyStart,
      laneIndex: activity.laneIndex,
    });
  }
  hits.sort(
    (x, y) =>
      compareEarlyStart(x.earlyStart, y.earlyStart) ||
      x.laneIndex - y.laneIndex ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  return hits.map(({ id, name, reasons }) => ({ id, name, reasons }));
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
