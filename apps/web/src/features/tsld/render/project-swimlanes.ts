import { deriveSwimlaneLanes, drawnSpanDays, type SwimlaneMember } from '@repo/layout';
import type { ActivitySummary } from '@repo/types';

import { daysBetween } from './render-model';

import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';

/**
 * **Display lanes: where each bar sits once the diagram is divided into swimlanes** (swimlanes
 * epic M0-T3; `docs/specs/swimlanes/ui-architecture.md` C6). Swimlanes stack top to bottom in
 * their stated order, each one's lanes contiguous, and an activity's *display lane* is its lane in
 * that stack. The host swaps it in for `laneIndex` before `toRenderActivities`, which is how the
 * canvas stays ignorant of swimlanes (ADR-0026 §8).
 *
 * It returns a **read model and nothing else**. A display lane is derived and never stored, so
 * there is deliberately no helper that turns one back into a (swimlane, lane) pair here — that
 * inverse is the write side's and lives with it (`model/swimlane-lanes.ts`, M2-T4). Offering it
 * here would invite a display lane to be written as if it were an in-swimlane lane.
 *
 * The input is neutral on purpose: the render layer imports no other feature, so the host maps the
 * swimlanes feature's rows onto {@link SwimlaneInput}.
 */
export interface SwimlaneInput {
  /** The plan's swimlanes in display order. A swimlane with no members still takes one lane. */
  swimlanes: readonly { id: string; name: string }[];
  /**
   * Activity id → the swimlane it belongs to under the current basis. An absent id, `null`, or an
   * id naming no swimlane in {@link swimlanes} puts the activity in "No swimlane".
   */
  membership: ReadonlyMap<string, string | null>;
  /**
   * Activity id → the lane stored against the current basis. An absent id means the activity has
   * never been placed against it (the absence of a row, ADR-0139).
   */
  storedLanes: ReadonlyMap<string, { lane: number; updatedAt: number }>;
}

/** One swimlane's place in the stack, for the gutter. */
export interface SwimlaneExtent {
  /** `null` for "No swimlane", whose label is the gutter's to word. */
  id: string | null;
  name: string | null;
  /** The display lane of its first lane. */
  firstLane: number;
  /** At least 1. */
  laneCount: number;
}

export interface SwimlaneProjection {
  /**
   * Activity id → display lane. An activity with no drawn start is absent: the canvas draws
   * nothing for it either, and it has no span to place.
   */
  displayLanes: ReadonlyMap<string, number>;
  /** Top to bottom; "No swimlane" is last and present only when something is in it. */
  extents: readonly SwimlaneExtent[];
  /** Total display lanes: the sum of the extents' `laneCount`. */
  laneCount: number;
  /**
   * The drawn members whose lane was **derived** rather than read from a stored row (feature-spec
   * §4.4). The write side files each at its displayed lane in the same batch as the first write
   * into their swimlane, so nothing on screen moves except the subject (materialise on write).
   */
  derivedIds: ReadonlySet<string>;
}

export function projectSwimlanes(
  activities: readonly ActivitySummary[],
  input: SwimlaneInput,
  options: {
    source: BarDateSource;
    dataDate: string;
    /**
     * Activities the pinned WBS band draws (`deriveWbsBandSource`). They are not in the scene, so
     * they take no lane — counted, they would hold open an empty row in whichever swimlane they
     * belong to.
     */
    bandLiftedIds?: ReadonlySet<string>;
  },
): SwimlaneProjection {
  const known = new Set(input.swimlanes.map((s) => s.id));
  const NONE = '';
  const members: SwimlaneMember[] = [];
  for (const a of activities) {
    if (options.bandLiftedIds?.has(a.id)) continue;
    const { start, finish } = barDatesFor(a, options.source);
    const span = drawnSpanDays({ type: a.type, start, finish }, (iso) =>
      daysBetween(options.dataDate, iso),
    );
    if (span === null) continue;
    const swimlane = input.membership.get(a.id);
    const stored = input.storedLanes.get(a.id);
    members.push({
      id: a.id,
      // '' cannot collide with a real id; it is the key of "No swimlane" inside this function only.
      swimlane: swimlane != null && known.has(swimlane) ? swimlane : NONE,
      startDay: span.startDay,
      endDay: span.endDay,
      laneIndex: a.laneIndex,
      ...(stored ? { stored } : {}),
    });
  }

  const placed = deriveSwimlaneLanes(members);
  const stack: { id: string | null; name: string | null; key: string }[] = [
    ...input.swimlanes.map((s) => ({ id: s.id, name: s.name, key: s.id })),
  ];
  if ((placed.get(NONE)?.laneCount ?? 0) > 0) stack.push({ id: null, name: null, key: NONE });

  const displayLanes = new Map<string, number>();
  const derivedIds = new Set<string>();
  const extents: SwimlaneExtent[] = [];
  let next = 0;
  for (const { id, name, key } of stack) {
    const placement = placed.get(key);
    const laneCount = Math.max(1, placement?.laneCount ?? 0);
    for (const [activityId, lane] of placement?.lanes ?? []) {
      displayLanes.set(activityId, next + lane);
    }
    for (const activityId of placement?.derived ?? []) derivedIds.add(activityId);
    extents.push({ id, name, firstLane: next, laneCount });
    next += laneCount;
  }
  return { displayLanes, extents, laneCount: next, derivedIds };
}
