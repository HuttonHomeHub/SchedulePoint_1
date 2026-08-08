import type { ActivitySummary, DependencySummary } from '@repo/types';

import { freeCopyName } from './clone-naming';
import {
  projectClone,
  type ClonePlacement,
  type CloneCreateBody,
  type CloneMode,
} from './clone-projection';

/**
 * **The plan for copying a set** (`docs/specs/activity-copy-paste/` §2, M0-T4).
 *
 * `clone-projection.ts` decides what ONE activity carries. This module decides what a *set* of them
 * carries: which of the plan's links come with it, how the parent tree is re-pointed, where the
 * copies land, in what order they must be created — and, before any of that, whether the copy can
 * happen at all.
 *
 * Three decisions are load-bearing here.
 *
 * **Refusals are data, not thrown errors.** {@link planClone} returns a discriminated union, so a
 * caller that forgets a case is a compile error rather than an unhandled rejection at the moment a
 * planner presses the button. Every refusal carries the numbers a message needs (the cap *and* the
 * actual size), because "too many activities" with no figure is a dead end.
 *
 * **The internal-edge rule is `both endpoints in the set`, in both directions.** An edge leaving
 * the set is not cloned. Cloning one would attach the copy to work it was not copied with — and,
 * for an incoming edge, would silently constrain the copy by a predecessor the planner did not
 * select. This is the one rule most likely to be "improved" later, so it has a test naming both
 * directions.
 *
 * **Creation is ordered parent-before-child.** `assertValidParent` (`activities.service.ts:301`)
 * rejects a `parentId` that does not resolve, so a wrong order does not produce a wrong tree — it
 * produces a 422 half way through a band, which the caller then has to roll back. The order is
 * derived by depth in the *cloned* tree, and it is deterministic (ties break on the source order)
 * because a copy that lands in a different arrangement each time reads as the product being
 * unreliable.
 *
 * The CPM engine is not imported here and no field this module computes is engine-owned.
 */

/** The ceiling `CreateActivityDto.laneIndex` enforces (`create-activity.dto.ts:295`). */
export const MAX_LANE_INDEX = 10_000;

/**
 * The largest set that may be copied in one action — **measured, not asserted** (M2-T4,
 * `scripts/measure-band-copy.mjs`).
 *
 * The provisional figure here was 200, chosen as "an order of magnitude below the
 * `UpdatePositionsDto` 2 000-row precedent" on the theory that the binding constraint was the
 * planner's patience. **It is not, and 200 would have guaranteed the failure the cap exists to
 * prevent.** Measured against a real API with the pen held, per-request cost is flat and wall clock
 * is linear — 969 ms for 15 activities + 21 links, 2 898 ms for 60 + 90 — so patience does not bind
 * anywhere near 200. What binds is the API's own rate limiter: 100 requests per 60 s **per route
 * handler** per IP (`RATE_LIMIT_LIMIT`, keyed by class + handler — see the measurement script's
 * docblock for the evidence). A copy issues `N + 1` writes on the activity-create handler and `M` on
 * the dependency-create handler, so a 200-activity copy 429s on its 100th create — and the web
 * client has **no back-off** (`lib/api/client.ts` throws on any non-2xx), so that is a **partial
 * paste**: half a band, mid-transaction-free, with links dangling.
 *
 * Hence 50, and the reasoning is per-handler request budget rather than activity count:
 *
 * - 51 creates leaves the create handler's window half free, so a planner may copy **twice** inside
 *   one minute — which is a thing planners do — without the second one failing.
 * - {@link MAX_CLONE_LINK_COUNT} bounds the other handler separately, because a dense band has more
 *   links than activities (the measured 60-activity band carries 90) and the link handler is
 *   therefore the one that overflows first. Capping activities alone would leave that unguarded.
 *
 * At 50 the measured wall clock is ≈1.5 s, comfortably inside the spec's 2 s gate.
 */
export const MAX_CLONE_SET_SIZE = 50;

/**
 * The largest number of internal links one copy may recreate.
 *
 * A second cap rather than a bigger first one, because the two counts hit **different** rate-limit
 * counters ({@link MAX_CLONE_SET_SIZE}) and a single number cannot bound both: a 50-activity band is
 * fine at 40 links and over the line at 140. Set below 100 for the same headroom reason.
 */
export const MAX_CLONE_LINK_COUNT = 90;

/** Why a copy cannot proceed. Each case carries what a sentence needs to name the problem. */
export type CloneRefusal =
  | { readonly kind: 'empty'; readonly reason: 'nothing-selected' }
  /** Every member was a summary whose subtree is empty, so there is nothing to copy. */
  | { readonly kind: 'empty'; readonly reason: 'no-copyable-members' }
  | { readonly kind: 'too-many'; readonly size: number; readonly cap: number }
  /** The set is small enough but carries more internal logic than one copy may recreate. */
  | { readonly kind: 'too-many-links'; readonly links: number; readonly cap: number }
  | {
      readonly kind: 'lane-ceiling';
      /** The highest lane a clone would need. */
      readonly required: number;
      readonly max: number;
    }
  | {
      readonly kind: 'archived-calendar';
      /** The activities bound to an archived calendar, so the message can name them. */
      readonly activityNames: readonly string[];
    };

/** One activity to create, with the identity needed to wire its children and links afterwards. */
export interface CloneCreate {
  /** The source activity's id — the key every remap below is expressed in. */
  readonly sourceId: string;
  /** The source's name, so a progress announcement can say what is being copied. */
  readonly sourceName: string;
  /**
   * The parent this clone needs, expressed as a **source** id, or null for the top level.
   *
   * Resolved to a real id by the caller as it creates rows, because the clone's parent id does not
   * exist until its parent has been created. Keeping it in source terms is what makes this module
   * pure — inventing placeholder ids here would mean two id spaces to keep in step.
   */
  readonly parentSourceId: string | null;
  /** Everything but `parentId`, which the caller substitutes from the id map. */
  readonly body: Omit<CloneCreateBody, 'parentId'>;
}

/** One dependency to recreate between two clones. */
export interface CloneLink {
  readonly predecessorSourceId: string;
  readonly successorSourceId: string;
  readonly type: DependencySummary['type'];
  /** Minutes, always — the exact value. Sending `lagDays` beside it is a 422 (mutually exclusive). */
  readonly lagMinutes: number;
  readonly lagCalendar: DependencySummary['lagCalendar'];
}

export interface ClonePlan {
  readonly ok: true;
  /** Parent-before-child, deterministic. */
  readonly creates: readonly CloneCreate[];
  readonly links: readonly CloneLink[];
}

export type ClonePlanResult = ClonePlan | { readonly ok: false; readonly refusal: CloneRefusal };

export interface PlanCloneInput {
  /** The activities to copy, in the order the caller chose to present them. */
  readonly set: readonly ActivitySummary[];
  /** Every dependency in the plan. Filtered here to the internal ones. */
  readonly dependencies: readonly DependencySummary[];
  /** Every live activity name in the plan, so each clone's name is free at composition time. */
  readonly usedNames: ReadonlySet<string>;
  /** Calendar ids that are archived. A copy is a NEW binding, so any of these is refused (§0.4). */
  readonly archivedCalendarIds: ReadonlySet<string>;
  /** Whole calendar days every clone's dates shift by. `0` duplicates in place. */
  readonly offsetDays: number;
  /** Lanes every clone shifts down by. The caller derives it (usually `maxLaneIndex + 1`). */
  readonly laneOffset: number;
  readonly mode: CloneMode;
  /**
   * The parent for members whose own parent is **outside** the set.
   *
   * `undefined` keeps the source's parent verbatim — a duplicate stays in its band. A value
   * re-homes the whole copy under one destination, which is what a paste into a band does.
   */
  readonly destinationParentId?: string | null;
}

/**
 * Plan the copy of a set, or say why it cannot happen.
 *
 * Pure: no ids are minted, no dates are read from the clock, and nothing is sorted by anything the
 * caller cannot reproduce.
 */
export function planClone(input: PlanCloneInput): ClonePlanResult {
  const { set, dependencies, usedNames, archivedCalendarIds, laneOffset } = input;

  if (set.length === 0)
    return { ok: false, refusal: { kind: 'empty', reason: 'nothing-selected' } };
  if (set.length > MAX_CLONE_SET_SIZE) {
    return { ok: false, refusal: { kind: 'too-many', size: set.length, cap: MAX_CLONE_SET_SIZE } };
  }

  // Checked before the lane arithmetic, because an archived calendar is a fact about the source
  // that no placement can fix, and naming it is more useful than naming a lane.
  const archived = set
    .filter((a) => a.calendarId !== null && archivedCalendarIds.has(a.calendarId))
    .map((a) => a.name);
  if (archived.length > 0) {
    return { ok: false, refusal: { kind: 'archived-calendar', activityNames: archived } };
  }

  const highestLane = Math.max(...set.map((a) => a.laneIndex)) + laneOffset;
  if (highestLane > MAX_LANE_INDEX) {
    return {
      ok: false,
      refusal: { kind: 'lane-ceiling', required: highestLane, max: MAX_LANE_INDEX },
    };
  }

  const inSet = new Set(set.map((a) => a.id));

  // Names are reserved as they are allocated. Without this the second copy of two identically-named
  // sources — which the plan's uniqueness constraint makes impossible, but two *bands* of the same
  // shape make routine — would be handed the same free name and the write would 409.
  const taken = new Set(usedNames);

  const creates: CloneCreate[] = orderParentBeforeChild(set, inSet).map((source) => {
    const name = freeCopyName(source.name, taken);
    taken.add(name);

    const parentSourceId =
      source.parentId !== null && inSet.has(source.parentId) ? source.parentId : null;

    const placement: ClonePlacement = {
      laneIndex: source.laneIndex + laneOffset,
      // Resolved by the caller from the id map when the parent is in the set; otherwise this is
      // the destination (a paste) or the source's own parent (a duplicate in place).
      parentId:
        parentSourceId !== null
          ? null
          : input.destinationParentId !== undefined
            ? input.destinationParentId
            : source.parentId,
      offsetDays: input.offsetDays,
      mode: input.mode,
      anchorDate: anchorOf(source, input.offsetDays),
    };

    const { parentId: _pinnedParent, ...body } = projectClone(source, { name, placement });
    return { sourceId: source.id, sourceName: source.name, parentSourceId, body };
  });

  if (creates.length === 0) {
    return { ok: false, refusal: { kind: 'empty', reason: 'no-copyable-members' } };
  }

  const links: CloneLink[] = dependencies
    // The internal-edge rule, in one predicate so neither direction can be relaxed on its own.
    .filter((d) => inSet.has(d.predecessor.id) && inSet.has(d.successor.id))
    .map((d) => ({
      predecessorSourceId: d.predecessor.id,
      successorSourceId: d.successor.id,
      type: d.type,
      lagMinutes: d.lagMinutes,
      lagCalendar: d.lagCalendar,
    }));

  // Checked LAST, because it is the only refusal whose input the function has to build first: the
  // internal-edge filter above is what decides how many links a copy actually recreates, and a
  // count taken from the selection's raw dependency list would refuse copies that carry far fewer.
  if (links.length > MAX_CLONE_LINK_COUNT) {
    return {
      ok: false,
      refusal: { kind: 'too-many-links', links: links.length, cap: MAX_CLONE_LINK_COUNT },
    };
  }

  return { ok: true, creates, links };
}

/**
 * The clone's anchor date, already offset — its early start, or its hand-placed `visualStart` when
 * it has one.
 *
 * Null when the source has never been scheduled: the copy is then placed by logic alone and nothing
 * is pinned, which is the honest outcome. Pinning a copy to a date the source does not itself hold
 * would give the clone a constraint the original never had.
 */
function anchorOf(source: ActivitySummary, offsetDays: number): string | null {
  const base = source.visualStart ?? source.earlyStart;
  if (base === null) return null;
  return shiftDay(base, offsetDays);
}

function shiftDay(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * Order the set so a clone is never created before the clone it names as its parent.
 *
 * Depth is measured **inside the set** — a member whose parent was not selected is a root here even
 * if it sits three bands deep in the plan. Ties keep the caller's order, so the same selection
 * always produces the same sequence.
 *
 * The parent tree is acyclic by construction (ADR-0038 enforces it server-side under a lock), so
 * this cannot loop; the visited guard exists only so a corrupt input degrades to "creates it at the
 * top" rather than hanging the tab.
 */
function orderParentBeforeChild(
  set: readonly ActivitySummary[],
  inSet: ReadonlySet<string>,
): readonly ActivitySummary[] {
  const byId = new Map(set.map((a) => [a.id, a]));

  const depthOf = (activity: ActivitySummary): number => {
    let depth = 0;
    const seen = new Set<string>([activity.id]);
    let current = activity;
    while (current.parentId !== null && inSet.has(current.parentId)) {
      const parent = byId.get(current.parentId);
      if (parent === undefined || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
      depth += 1;
    }
    return depth;
  };

  return set
    .map((activity, index) => ({ activity, index, depth: depthOf(activity) }))
    .sort((a, b) => (a.depth === b.depth ? a.index - b.index : a.depth - b.depth))
    .map((entry) => entry.activity);
}
