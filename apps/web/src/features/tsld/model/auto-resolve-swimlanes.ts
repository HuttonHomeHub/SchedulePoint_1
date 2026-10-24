import type { ActivitySummary } from '@repo/types';

import type { SwimlaneInput } from '../render/project-swimlanes';

import {
  laneSnapshotOf,
  resolveNewOverlaps,
  type LaneResolution,
  type LaneSnapshot,
} from './auto-resolve';
import { deriveDiagramSource } from './derive-diagram-source';

/**
 * **Auto-resolve on both layouts** (swimlanes M2-T5; feature-spec §4.5, ADR-0153).
 *
 * A plan with swimlanes has two pictures of the same bars: the swimlane-free one, in each
 * activity's stored `laneIndex`, and the swimlane one, in the lane each holds *inside its
 * swimlane*. The planner sees one and the other is still real — it is what turning swimlanes off
 * shows — so an edit that makes two bars overlap can do so in either, or both. The rule is
 * `resolveNewOverlaps`, unchanged, run once per picture; nothing here restates it.
 *
 * ## What the swimlane picture compares
 *
 * **The stored in-swimlane lane, not the drawn one.** The projection draws no two bars of a swimlane
 * on one lane: when two stored rows collide it re-places the loser (the one with the older row). That
 * is right for the screen and wrong for this rule — after an edit pushes a bar into its neighbour's
 * lane, the projection would silently move whichever bar has the older row, which may be the bar the
 * planner just edited. Comparing the *stored* rows keeps the collision visible, so the rule can pick
 * the bar that caused it and the write leaves the stored rows (and so the picture) the way ADR-0153
 * says. A member with no stored row is compared at the lane it is drawn in, which is where the
 * projection derived it.
 *
 * Each swimlane is its own set of lanes, so each is resolved on its own: a mover's "free lane" is a
 * lane of its own swimlane, which may grow (§4.5). Neither picture's resolution is ever written to
 * the other's field (SC-1) — the swimlane one yields in-swimlane lanes, the plain one `laneIndex`.
 */

/**
 * One origin for the projection's day arithmetic. Only differences between days are read, so the
 * data date is irrelevant to which bars overlap, and this keeps the snapshot independent of it.
 */
const ANY_ORIGIN = '1970-01-01';

/** Snapshots of the swimlane picture, keyed by swimlane id; `''` is "No swimlane". */
export type SwimlaneSnapshots = ReadonlyMap<string, LaneSnapshot>;

/** The swimlane key of "No swimlane" inside {@link SwimlaneSnapshots}. */
export const NO_SWIMLANE_KEY = '';

/** Both pictures at one moment. `swimlane` is `null` when the plan's swimlanes are not readable. */
export interface LayoutSnapshots {
  readonly plain: LaneSnapshot;
  readonly swimlane: SwimlaneSnapshots | null;
}

/** One bar the swimlane picture moved: its lane inside `swimlaneId` (`null`: "No swimlane"). */
export interface SwimlaneResolution extends LaneResolution {
  readonly swimlaneId: string | null;
}

export interface LayoutResolutions {
  readonly plain: readonly LaneResolution[];
  readonly swimlane: readonly SwimlaneResolution[];
}

export function layoutSnapshotsOf(
  activities: readonly ActivitySummary[],
  input: SwimlaneInput | null,
): LayoutSnapshots {
  const plain = laneSnapshotOf(activities);
  if (input === null) return { plain, swimlane: null };

  // The one derivation (SC-5), with the band off: summaries stay in the scene here, so each takes a
  // lane like any member rather than vanishing from the swimlane picture.
  const { swimlaneScene: projection } = deriveDiagramSource(activities, {
    wbsBand: { enabled: false, toggleOn: false },
    swimlanes: input,
    source: 'visual',
    dataDate: ANY_ORIGIN,
  });
  if (projection === null) return { plain, swimlane: null };
  const known = new Set(input.swimlanes.map((s) => s.id));
  const groups = new Map<
    string,
    Map<string, { laneIndex: number; start: string; finish: string }>
  >();
  for (const [id, state] of plain) {
    const owner = input.membership.get(id);
    const key = owner != null && known.has(owner) ? owner : NO_SWIMLANE_KEY;
    const stored = input.storedLanes.get(id)?.lane;
    const drawn = projection.displayLanes.get(id);
    const extent = projection.extents.find((e) => (e.id ?? NO_SWIMLANE_KEY) === key);
    const derived =
      drawn === undefined || extent === undefined ? undefined : drawn - extent.firstLane;
    const lane = stored !== undefined && Number.isInteger(stored) && stored >= 0 ? stored : derived;
    if (lane === undefined) continue; // not drawn in any swimlane, so it can overlap nothing there
    let group = groups.get(key);
    if (group === undefined) {
      group = new Map();
      groups.set(key, group);
    }
    group.set(id, { laneIndex: lane, start: state.start, finish: state.finish });
  }
  return { plain, swimlane: groups };
}

/**
 * The moves that clear the overlaps an edit created, on each picture. `s0` is the plan before the
 * command and `s1` once it settled. When either has no swimlane picture there is nothing to compare
 * the swimlane side against, so only the plain one resolves.
 */
export function resolveBothLayouts(
  s0: LayoutSnapshots,
  s1: LayoutSnapshots,
  subjects: ReadonlySet<string>,
): LayoutResolutions {
  const plain = resolveNewOverlaps(s0.plain, s1.plain, subjects);
  const swimlane: SwimlaneResolution[] = [];
  if (s0.swimlane !== null && s1.swimlane !== null) {
    const empty: LaneSnapshot = new Map();
    for (const [key, now] of s1.swimlane) {
      for (const move of resolveNewOverlaps(s0.swimlane.get(key) ?? empty, now, subjects)) {
        swimlane.push({ ...move, swimlaneId: key === NO_SWIMLANE_KEY ? null : key });
      }
    }
  }
  return { plain, swimlane };
}
