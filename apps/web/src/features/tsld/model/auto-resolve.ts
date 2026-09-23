import { rowOccupancy, type PackItem } from '@repo/layout';
import type { ActivitySummary } from '@repo/types';

import { laneOverlapPairs, type LaneSpan } from '../render/lane-overlap';

import { barDatesFor } from '@/lib/bar-dates';

/**
 * **An edit moves only the bar that caused it** (NetPoint-layout M3, spec §4.4, ADR-0153).
 *
 * The product owner's rule: no edit may leave two bars overlapping in a row, and resolving it must
 * move the one bar responsible and nothing else. A planner who stretches a bar into its neighbour
 * expects the stretched bar to step aside, not the neighbour; a recalculation that pushes an
 * un-edited successor into a third bar expects the pushed one to move, not the bar the planner just
 * placed.
 *
 * Pure: two snapshots and the command's subjects in, the lane changes out. `S0` is taken when the
 * planner issues the command and `S1` once its writes and the recalculation they trigger have
 * settled. Each maps an activity id to its lane and the inclusive `YYYY-MM-DD` span it is **drawn**
 * over (`barDatesFor(a, 'visual')`), which is what the planner sees overlap. An activity with no
 * drawn span is absent: it is not on the diagram and cannot overlap.
 *
 * ## The rule
 *
 * Only **new** pairs are resolved, `overlaps(S1) \ overlaps(S0)`: an overlap that existed before the
 * command is not this command's to fix, and silently moving it would shift a bar the planner did not
 * touch. For each new pair `(a, b)`, with `changed(x)` meaning `x`'s lane or span differs between
 * the snapshots or `x` did not exist in `S0`:
 *
 * 1. exactly one changed → **it** moves, because the other is where the planner left it;
 * 2. both changed, exactly one is a subject → the **non-subject** moves, because the planner just
 *    put the subject there and the engine pushed the other into it;
 * 3. otherwise → the one with the **later drawn start** moves, then the larger id.
 *
 * None of the three can ever choose a bar whose span and lane are both unchanged, which is "nothing
 * else shifts". Movers are placed in drawn-start order (then id), each by `nearestFreeRow` against
 * the rows the earlier movers chose, so a cascade cannot resolve two bars into one row. A mover
 * that fits where it is once earlier movers have left stays put and produces no change.
 */
export interface LaneState {
  readonly laneIndex: number;
  /** Inclusive drawn start, `YYYY-MM-DD`. */
  readonly start: string;
  /** Inclusive drawn finish, `YYYY-MM-DD`. */
  readonly finish: string;
}

export type LaneSnapshot = ReadonlyMap<string, LaneState>;

export interface LaneResolution {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Whole days since 1970-01-01 for a `YYYY-MM-DD` string, by the civil-calendar arithmetic rather
 * than `Date.parse` — the parse was a third of FC-N5b's budget at `scale-2000`. Any fixed origin
 * works, since only differences between days are compared; `auto-resolve.test.ts` pins it against
 * `Date.parse` across leap years and a century boundary.
 */
export function dayOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

const byStartThenId =
  (snapshot: LaneSnapshot) =>
  (a: string, b: string): number => {
    const sa = snapshot.get(a)!.start;
    const sb = snapshot.get(b)!.start;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

export function resolveNewOverlaps(
  s0: LaneSnapshot,
  s1: LaneSnapshot,
  subjects: ReadonlySet<string>,
): LaneResolution[] {
  const changed = new Set<string>();
  for (const [id, now] of s1) {
    const was = s0.get(id);
    if (
      was === undefined ||
      was.laneIndex !== now.laneIndex ||
      was.start !== now.start ||
      was.finish !== now.finish
    ) {
      changed.add(id);
    }
  }
  if (changed.size === 0) return [];

  // **Only a pair with a changed member can be new**: two unchanged bars have the same lane and span
  // in both snapshots, so if they overlap now they overlapped before. So the sweep runs over the rows
  // the changed bars sit in, not the plan — and a candidate pair is new unless the SAME sweep finds
  // it in S0. One predicate throughout (`laneOverlapPairs`), never a restatement of it.
  const lanes = new Set([...changed].map((id) => s1.get(id)!.laneIndex));
  const inLanes: LaneSpan[] = [];
  for (const [id, s] of s1) {
    if (lanes.has(s.laneIndex)) {
      inLanes.push({ id, laneIndex: s.laneIndex, start: s.start, finish: s.finish });
    }
  }
  const existed = (a: string, b: string): boolean => {
    const was = [a, b].map((id) => s0.get(id));
    if (was[0] === undefined || was[1] === undefined) return false;
    return (
      laneOverlapPairs([
        { id: a, ...was[0] },
        { id: b, ...was[1] },
      ]).length > 0
    );
  };
  const fresh = laneOverlapPairs(inLanes).filter(
    ([a, b]) => (changed.has(a) || changed.has(b)) && !existed(a, b),
  );
  if (fresh.length === 0) return [];

  const later = byStartThenId(s1);
  const movers = new Set<string>();
  for (const [a, b] of fresh) {
    const ca = changed.has(a);
    const cb = changed.has(b);
    if (ca !== cb) {
      movers.add(ca ? a : b); // rule 1
      continue;
    }
    const sa = subjects.has(a);
    const sb = subjects.has(b);
    if (sa !== sb) {
      movers.add(sa ? b : a); // rule 2 (both changed here — a pair with neither is never fresh)
      continue;
    }
    movers.add(later(a, b) > 0 ? a : b); // rule 3
  }

  // One row index for the whole cascade: each mover's new row is recorded so the next one sees it.
  // Re-indexing per mover was the first draft and cost 85 ms p95 for a 50-bar cascade at
  // `scale-2000` against FC-N5b's 2 ms.
  const items: PackItem[] = [...s1].map(([id, s]) => ({
    id,
    laneIndex: s.laneIndex,
    startDay: dayOf(s.start),
    endDay: dayOf(s.finish),
  }));
  const itemOf = new Map(items.map((item) => [item.id, item]));
  const occupancy = rowOccupancy(items);
  const resolutions: LaneResolution[] = [];
  for (const id of [...movers].sort(later)) {
    const item = itemOf.get(id)!;
    const from = item.laneIndex;
    const to = occupancy.nearestFree(item);
    if (to === from) continue;
    occupancy.move(id, to);
    item.laneIndex = to;
    resolutions.push({ id, from, to });
  }
  return resolutions;
}

/**
 * The snapshot the rule compares: every activity the diagram **draws**, keyed by id, with its lane
 * and the inclusive span it is drawn over on the `visual` basis.
 *
 * Always `visual`, never the Late overlay's basis, and that is what makes the spec's "suppressed
 * under the Late overlay" hold by construction rather than by a gate the workspace would have to
 * remember: a layout is only ever reasoned about on the dates the bars are placed at (spec §4.5
 * D-B). A milestone draws at a point, so a missing finish is its start; an activity with no drawn
 * start is not on the diagram and is absent, as it is from `laneOverlapIds`.
 */
export function laneSnapshotOf(
  activities: readonly Pick<
    ActivitySummary,
    | 'id'
    | 'laneIndex'
    | 'earlyStart'
    | 'earlyFinish'
    | 'visualEffectiveStart'
    | 'visualEffectiveFinish'
    | 'lateStart'
    | 'lateFinish'
  >[],
): LaneSnapshot {
  const snapshot = new Map<string, LaneState>();
  for (const a of activities) {
    const { start, finish } = barDatesFor(a, 'visual');
    if (start == null) continue; // undefined too: a partially-loaded row is undrawn, not a crash
    snapshot.set(a.id, { laneIndex: a.laneIndex, start, finish: finish ?? start });
  }
  return snapshot;
}

/**
 * Where a bar dropped onto `target` lands (spec §4.2, "a lane drop resolves before writing").
 *
 * The target itself when it is free. Otherwise the next free lane **further in the direction the
 * bar was travelling**, which is a deliberate departure from `nearestFreeRow`'s "nearest, ties to
 * the lower index", recorded in `docs/specs/netpoint-layout/m3-auto-resolve.md`. The nearest rule
 * is right for a bar the engine pushed, which has no direction; it is wrong for a bar the planner
 * moved, because the lane it came from is always free to it — so `Alt+↓` onto an occupied lane
 * would put the bar straight back where it started, and a keyboard user would press a key that
 * does nothing, every time, on exactly the plans where they are trying to make room.
 *
 * Moving up can run out of lanes. Then the bar stays where it was (`fromLane`), which the caller
 * reports rather than writes.
 */
export function resolveLaneDrop(snapshot: LaneSnapshot, id: string, target: number): number {
  const self = snapshot.get(id);
  if (self === undefined) return target; // undrawn: occupies no span, nothing to collide with
  const start = dayOf(self.start);
  const end = dayOf(self.finish);
  const free = (lane: number): boolean => {
    for (const [otherId, other] of snapshot) {
      if (otherId === id || other.laneIndex !== lane) continue;
      if (!(dayOf(other.finish) < start || end < dayOf(other.start))) return false;
    }
    return true;
  };
  if (free(target)) return target;
  const step = target >= self.laneIndex ? 1 : -1;
  for (let lane = target + step; lane >= 0; lane += step) {
    if (free(lane)) return lane;
  }
  return self.laneIndex;
}
