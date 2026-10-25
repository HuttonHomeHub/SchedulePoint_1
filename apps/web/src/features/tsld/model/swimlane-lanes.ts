import type { LayoutPartition } from '../render/layout-partition';
import {
  NO_SWIMLANE_LABEL,
  type SwimlaneExtent,
  type SwimlaneInput,
  type SwimlaneProjection,
} from '../render/project-swimlanes';

import type { SwimlaneLaneFacts } from './reposition-announcement';

/**
 * **The inverse of the projection: from where a bar is DRAWN to what gets WRITTEN** (swimlanes epic
 * M2-T4; `docs/specs/swimlanes/ui-architecture.md` C6).
 *
 * The canvas speaks display lanes — the stack of swimlanes, top to bottom — and a display lane is
 * derived and never stored. A move arrives in display lanes, and this turns it into the rows the
 * positions endpoint takes: a lane *inside* a swimlane, plus the swimlane when the move changed it.
 * It lives here, on the write side, and not beside `projectSwimlanes`, because a helper that turned
 * a display lane into a lane would invite one to be written as if it were the other.
 *
 * **Nothing here produces a `laneIndex`** (SC-1). The swimlane-free layout is left exactly as the
 * planner arranged it, which is what makes turning swimlanes off lossless.
 *
 * Every function is pure and answers with the whole of what the host must write — the subject's
 * lane and the swimlane's **unplaced members at their displayed lanes** (feature-spec §4.4,
 * "Materialise on write"), so a write into a swimlane never lets a later recalculation re-place a
 * bar the planner did not touch.
 */

/** An inclusive whole-day span, in the axis days the projection measured. */
export interface DaySpan {
  readonly startDay: number;
  readonly endDay: number;
}

/** One row of a swimlane lane write: the activity's lane inside its (possibly new) swimlane. */
export interface SwimlaneLanePlacement {
  readonly id: string;
  /** 0-based, inside the swimlane. */
  readonly lane: number;
  /**
   * The swimlane to file the activity in, or `null` for "No swimlane". Present **only** when the
   * move changes it: the endpoint refuses a swimlane while the plan's swimlanes come from its WBS,
   * and a lane written inside the swimlane an activity is already in is not a membership change.
   */
  readonly swimlaneId?: string | null;
  /**
   * Where the bar was before this move — the swimlane it was drawn in (`null`: "No swimlane") and
   * its lane inside it — which is what an undo puts back. Absent on a placement that is only
   * {@link materialised}.
   */
  readonly from?: { readonly swimlaneId: string | null; readonly lane: number };
  /**
   * True for an unplaced member written at the lane it is already drawn in. It is part of the same
   * batch and no part of the planner's edit, so the undo step leaves it alone.
   */
  readonly materialised?: true;
}

export type SwimlaneMove =
  /** A write to make. `requested` is the in-swimlane lane that was aimed at. */
  | {
      kind: 'write';
      placements: readonly SwimlaneLanePlacement[];
      landed: SwimlaneLaneFacts;
      requested: number;
      /** The in-swimlane lane the first bar was in, so "went on past an occupied lane" can be told. */
      original: number;
    }
  /** The bar could not move: there is no free lane in that direction. Nothing is written. */
  | { kind: 'stay'; landed: SwimlaneLaneFacts }
  /** Refused, with the sentence that says why. Nothing is written. */
  | { kind: 'refuse'; reason: string };

export interface SwimlaneEditContext {
  readonly scene: SwimlaneProjection;
  readonly input: SwimlaneInput;
  /** The drawn span of every drawn activity in the scene. */
  readonly spans: ReadonlyMap<string, DaySpan>;
  /** The lane stored for an activity against a swimlane (`null`: "No swimlane"), if it has one. */
  readonly remembered: (activityId: string, swimlaneId: string | null) => number | undefined;
  /** Every scene activity's lane in the swimlane-free layout; only {@link createInSwimlane} reads it. */
  readonly stored: ReadonlyMap<string, number>;
}

export const NOT_DRAWN_REASON = 'That activity isn’t drawn yet, so there is nowhere to move it.';

/**
 * The same refusal for a selection: singular for one, and for several it counts how many are not
 * drawn, so "that activity" is never said of two.
 */
export function notDrawnReason(missing: number, total: number): string {
  if (total === 1) return NOT_DRAWN_REASON;
  return missing === total
    ? 'Those activities aren’t drawn yet, so there is nowhere to move them.'
    : `${String(missing)} of the ${String(total)} activities ${missing === 1 ? 'isn’t' : 'aren’t'} drawn yet, so there is nowhere to move them.`;
}

/**
 * Every refusal here is a plain statement of the rule, with no "sorry" and no "couldn’t": the single
 * bar and the selection read in one voice, and the sentence says what is true rather than what was
 * attempted.
 */
/** A move that names a bar the plan no longer has: refused whole, never written smaller. */
export const ROWS_GONE_REASON =
  'Some of these activities are no longer in the plan, so the move wasn’t applied. Refresh to see the latest.';
export const NO_FREE_LANE_PLURAL =
  'None of the selected activities has a free lane that way in its swimlane, so none moved.';

export const topLaneOf = (swimlane: string): string => `Already in the top lane of ${swimlane}.`;

/** The count of rows that cannot go up, in the plural form `topLanePluralReason` uses off-swimlane. */
export function topLanePluralInSwimlanes(count: number, total: number): string {
  if (count >= total)
    return 'The selected activities are already in the top lane of their swimlanes, so none moved.';
  return `${String(count)} of the selected activities ${
    count === 1 ? 'is' : 'are'
  } already in the top lane of ${count === 1 ? 'its' : 'their'} swimlane, so none moved: moving the rest would change the selection’s shape.`;
}

interface Member {
  id: string;
  /** Index into `scene.extents`. */
  extent: number;
  /** 0-based, inside the extent. */
  lane: number;
  span: DaySpan;
}

const label = (extent: SwimlaneExtent): string => extent.name ?? NO_SWIMLANE_LABEL;
const overlaps = (a: DaySpan, b: DaySpan): boolean =>
  !(a.endDay < b.startDay || b.endDay < a.startDay);

function extentIndexAt(scene: SwimlaneProjection, displayLane: number): number {
  return scene.extents.findIndex(
    (e) => displayLane >= e.firstLane && displayLane < e.firstLane + e.laneCount,
  );
}

/** Every drawn member, placed in its extent. */
function membersOf(ctx: SwimlaneEditContext): Map<string, Member> {
  const out = new Map<string, Member>();
  for (const [id, display] of ctx.scene.displayLanes) {
    const span = ctx.spans.get(id);
    const extent = extentIndexAt(ctx.scene, display);
    if (span === undefined || extent < 0) continue;
    out.set(id, { id, extent, lane: display - ctx.scene.extents[extent]!.firstLane, span });
  }
  return out;
}

/** Occupancy of the lanes of each extent by the members that are NOT moving. */
class Occupancy {
  private readonly lanes = new Map<string, DaySpan[]>();

  constructor(members: Iterable<Member>, moving: ReadonlySet<string>) {
    for (const m of members) if (!moving.has(m.id)) this.add(m.extent, m.lane, m.span);
  }

  add(extent: number, lane: number, span: DaySpan): void {
    const key = `${String(extent)}:${String(lane)}`;
    const held = this.lanes.get(key);
    if (held) held.push(span);
    else this.lanes.set(key, [span]);
  }

  free(extent: number, lane: number, span: DaySpan): boolean {
    return !(this.lanes.get(`${String(extent)}:${String(lane)}`) ?? []).some((s) =>
      overlaps(s, span),
    );
  }

  /** The free lane nearest `target`, the lower one on a tie (ADR-0153 D3). Below is always free. */
  nearest(extent: number, target: number, span: DaySpan): number {
    for (let distance = 0; ; distance += 1) {
      const below = target - distance;
      if (below >= 0 && this.free(extent, below, span)) return below;
      if (distance > 0 && this.free(extent, target + distance, span)) return target + distance;
    }
  }

  /**
   * The first free lane from `target` in the direction of travel (`resolveLaneDrop`'s rule: the lane
   * a bar came from is always free to it, so "nearest" would put a keyboard user straight back where
   * they started). Going up can run out of lanes, which answers `null`.
   */
  inDirection(extent: number, target: number, step: 1 | -1, span: DaySpan): number | null {
    for (let lane = target; lane >= 0; lane += step) if (this.free(extent, lane, span)) return lane;
    return null;
  }
}

/**
 * The unplaced members of the swimlanes a write touches, at the lanes they are drawn in — the same
 * batch as the subject's, so the first write into a swimlane places everything in it. A member whose
 * kept swimlane was deleted is drawn under "No swimlane" and is written there, with no swimlane named,
 * so its kept id is left for a restore.
 */
function materialise(
  ctx: SwimlaneEditContext,
  members: ReadonlyMap<string, Member>,
  extents: ReadonlySet<number>,
  written: ReadonlySet<string>,
): SwimlaneLanePlacement[] {
  const out: SwimlaneLanePlacement[] = [];
  for (const id of ctx.scene.derivedIds) {
    const m = members.get(id);
    if (m === undefined || written.has(id) || !extents.has(m.extent)) continue;
    out.push({ id, lane: m.lane, materialised: true });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function landedOf(
  ctx: SwimlaneEditContext,
  extent: number,
  lane: number,
  changedSwimlane: boolean,
  how: SwimlaneLaneFacts['how'],
): SwimlaneLaneFacts {
  const e = ctx.scene.extents[extent]!;
  return {
    swimlane: label(e),
    lane,
    count: Math.max(e.laneCount, lane + 1),
    changedSwimlane,
    displayLane: e.firstLane + lane,
    how,
  };
}

/**
 * The display lanes a bar may be dragged over — what `laneRange` hands the gesture machine so the
 * ghost stops at an edge instead of crossing it and being refused after (C6).
 *
 * Hand-made swimlanes put no edge in the way: a bar may cross into any swimlane, "No swimlane"
 * included, and the bottom is open because the last swimlane can take another lane. **A WBS source
 * narrows it to the bar's own swimlane** (SQ-5): filing is the WBS's, changed through Breakdown, and a
 * vertical drag that re-filed would write a parent — and move summary dates — as a side effect. The
 * bottom edge is the swimlane's last lane; growing it is the keyboard's (`Alt+↓`). `null` for a bar
 * that is not drawn.
 */
export function laneRangeOf(
  ctx: SwimlaneEditContext,
  activityId: string,
): { min: number; max: number } | null {
  const display = ctx.scene.displayLanes.get(activityId);
  if (display === undefined) return null;
  if (ctx.input.source !== 'WBS') return { min: 0, max: Number.POSITIVE_INFINITY };
  const home = ctx.scene.extents[extentIndexAt(ctx.scene, display)];
  if (home === undefined) return null;
  return { min: home.firstLane, max: home.firstLane + home.laneCount - 1 };
}

/**
 * Said, once, when a drag in a WBS swimlane is held at the swimlane's edge: the ghost stopping with no
 * reason is indistinguishable from a bar that will not move. "Breakdown" is the editor's section name
 * (its field is "Parent WBS summary"), and Alt+Down is the keyboard's way to add a lane.
 */
export const WBS_EDGE_NOTE =
  'This swimlane follows the WBS, so the bar stays in it. Change its Breakdown to move it to another swimlane. Press Alt+Down to add a lane in the swimlane.';

/** What a drop that would carry a bar into another WBS swimlane says: the WBS owns filing. */
export const WBS_FILING_REASON =
  'Swimlanes follow the WBS in this plan. Change the activity’s Breakdown to move it to another swimlane.';

/**
 * The top of the swimlane a bar is in, as a display lane, and the name to say it by — what the
 * keyboard nudges stop at. `null` for a bar that is not drawn.
 */
export function swimlaneTopOf(
  ctx: SwimlaneEditContext,
  activityId: string,
): { min: number; swimlane: string } | null {
  const display = ctx.scene.displayLanes.get(activityId);
  const home =
    display === undefined ? undefined : ctx.scene.extents[extentIndexAt(ctx.scene, display)];
  return home === undefined ? null : { min: home.firstLane, swimlane: label(home) };
}

/**
 * A bar dropped at `displayLane` by a pointer. Within its own swimlane it takes the dropped lane or
 * the next free one in the direction of travel; in another swimlane (or "No swimlane") it takes its
 * **remembered** lane there when that is free and otherwise the nearest free lane to it (US-3).
 */
export function dropInSwimlane(
  ctx: SwimlaneEditContext,
  activityId: string,
  displayLane: number,
): SwimlaneMove {
  const members = membersOf(ctx);
  const subject = members.get(activityId);
  if (subject === undefined) return { kind: 'refuse', reason: NOT_DRAWN_REASON };
  const { extents } = ctx.scene;
  const at = extentIndexAt(ctx.scene, Math.max(0, displayLane));
  // Below the last extent is that extent growing, by one lane at most.
  const target = at < 0 ? extents.length - 1 : at;
  const home = extents[subject.extent]!;
  const to = extents[target]!;

  const occupancy = new Occupancy(members.values(), new Set([activityId]));
  const dropped = Math.min(Math.max(0, displayLane) - to.firstLane, to.laneCount);
  const changedSwimlane = target !== subject.extent;
  // The gesture is clamped by `laneRange`, so this is the backstop for a caller that is not: the
  // server refuses a swimlane on a WBS plan, and the bar must not be shown crossing first.
  if (changedSwimlane && ctx.input.source === 'WBS') {
    return { kind: 'refuse', reason: WBS_FILING_REASON };
  }
  let lane: number;
  let how: SwimlaneLaneFacts['how'];
  if (!changedSwimlane) {
    const step = dropped >= subject.lane ? 1 : -1;
    const found = occupancy.inDirection(target, dropped, step, subject.span);
    if (found === null || found === subject.lane) {
      return { kind: 'stay', landed: landedOf(ctx, target, subject.lane, false, 'stays') };
    }
    lane = found;
    how = found === dropped ? 'asked' : 'next-free';
  } else {
    const remembered = ctx.remembered(activityId, to.id);
    lane = occupancy.nearest(target, remembered ?? dropped, subject.span);
    how =
      remembered !== undefined && lane === remembered
        ? 'remembered'
        : lane === dropped
          ? 'asked'
          : 'next-free';
  }

  return {
    kind: 'write',
    placements: [
      {
        id: activityId,
        lane,
        from: { swimlaneId: home.id, lane: subject.lane },
        ...(changedSwimlane ? { swimlaneId: to.id } : {}),
      },
      ...materialise(ctx, members, new Set([subject.extent, target]), new Set([activityId])),
    ],
    landed: landedOf(ctx, target, lane, changedSwimlane, how),
    requested: dropped,
    original: subject.lane,
  };
}

/**
 * A keyboard move to `aimed`, a lane **inside the bar's own swimlane** (it may be one past the last
 * lane: that is the swimlane growing). The top is a boundary and says so; the bottom is not.
 * An occupied lane goes on to the next free one in the direction of travel (`step`).
 */
export function moveWithinSwimlane(
  ctx: SwimlaneEditContext,
  activityId: string,
  aimed: number,
  step: 1 | -1,
): SwimlaneMove {
  const members = membersOf(ctx);
  const subject = members.get(activityId);
  if (subject === undefined) return { kind: 'refuse', reason: NOT_DRAWN_REASON };
  const home = ctx.scene.extents[subject.extent]!;
  if (aimed < 0) return { kind: 'refuse', reason: topLaneOf(label(home)) };
  // A held key aims further each press, but the swimlane grows by one lane at a time: one past the
  // last lane is the most a single move may ask for.
  const target = Math.min(aimed, home.laneCount);

  const occupancy = new Occupancy(members.values(), new Set([activityId]));
  const lane = occupancy.inDirection(subject.extent, target, step, subject.span);
  if (lane === null || lane === subject.lane) {
    return { kind: 'stay', landed: landedOf(ctx, subject.extent, subject.lane, false, 'stays') };
  }
  return {
    kind: 'write',
    placements: [
      { id: activityId, lane, from: { swimlaneId: home.id, lane: subject.lane } },
      ...materialise(ctx, members, new Set([subject.extent]), new Set([activityId])),
    ],
    landed: landedOf(ctx, subject.extent, lane, false, lane === target ? 'asked' : 'next-free'),
    requested: target,
    original: subject.lane,
  };
}

/**
 * `Alt+↑/↓`: one lane within the bar's own swimlane. Pressing down on the last lane adds a lane to
 * the swimlane (feature-spec, "Lane moves inside a swimlane").
 */
export function nudgeInSwimlane(
  ctx: SwimlaneEditContext,
  activityId: string,
  direction: 1 | -1,
): SwimlaneMove {
  const lane = ctx.scene.displayLanes.get(activityId);
  const extent = lane === undefined ? -1 : extentIndexAt(ctx.scene, lane);
  if (lane === undefined || extent < 0) return { kind: 'refuse', reason: NOT_DRAWN_REASON };
  return moveWithinSwimlane(
    ctx,
    activityId,
    lane - ctx.scene.extents[extent]!.firstLane + direction,
    direction,
  );
}

/**
 * The same move as {@link moveWithinSwimlane}, for a keyboard nudge that tracks its target as a
 * display lane (the nudge hook accumulates an absolute lane across a held key). A display lane past
 * the bottom of the bar's own swimlane is that swimlane growing, not the next swimlane's first lane.
 */
export function keyboardMoveInSwimlane(
  ctx: SwimlaneEditContext,
  activityId: string,
  displayTarget: number,
): SwimlaneMove {
  const lane = ctx.scene.displayLanes.get(activityId);
  const extent = lane === undefined ? -1 : extentIndexAt(ctx.scene, lane);
  if (lane === undefined || extent < 0) return { kind: 'refuse', reason: NOT_DRAWN_REASON };
  const first = ctx.scene.extents[extent]!.firstLane;
  return moveWithinSwimlane(ctx, activityId, displayTarget - first, displayTarget >= lane ? 1 : -1);
}

/**
 * A plural vertical move: every selected bar moves `laneDelta` lanes **inside its own swimlane**, so
 * the selection never changes swimlane (and the "would change the selection's shape" refusal keeps
 * its meaning). A bar whose target is taken by one that is not moving goes on to the next free lane
 * in the direction of travel, or stays; bars that move together do not block each other, since each
 * leaves the lane it was in.
 */
export function moveManyInSwimlanes(
  ctx: SwimlaneEditContext,
  ids: readonly string[],
  laneDelta: number,
): SwimlaneMove {
  const members = membersOf(ctx);
  const rows: Member[] = [];
  for (const id of ids) {
    const m = members.get(id);
    if (m !== undefined) rows.push(m);
  }
  if (rows.length < ids.length) {
    return { kind: 'refuse', reason: notDrawnReason(ids.length - rows.length, ids.length) };
  }
  const blocked = rows.filter((m) => m.lane + laneDelta < 0).length;
  if (blocked > 0)
    return { kind: 'refuse', reason: topLanePluralInSwimlanes(blocked, rows.length) };

  const occupancy = new Occupancy(members.values(), new Set(ids));
  const placements: SwimlaneLanePlacement[] = [];
  const touched = new Set<number>();
  // Taken in drawn order, so the result does not depend on the order the selection was made in.
  for (const m of [...rows].sort(
    (a, b) => a.extent - b.extent || a.lane - b.lane || (a.id < b.id ? -1 : 1),
  )) {
    // In the direction of travel, like a single bar: the lane it came from is always free to it, so
    // "nearest" would answer with where it started and the press would do nothing.
    const aimed = Math.min(m.lane + laneDelta, ctx.scene.extents[m.extent]!.laneCount);
    const lane = occupancy.inDirection(m.extent, aimed, laneDelta > 0 ? 1 : -1, m.span) ?? m.lane;
    occupancy.add(m.extent, lane, m.span);
    if (lane !== m.lane) {
      placements.push({
        id: m.id,
        lane,
        from: { swimlaneId: ctx.scene.extents[m.extent]!.id, lane: m.lane },
      });
      touched.add(m.extent);
    }
  }
  if (placements.length === 0) {
    const first = rows[0]!;
    return { kind: 'stay', landed: landedOf(ctx, first.extent, first.lane, false, 'stays') };
  }
  const first = rows[0]!;
  return {
    kind: 'write',
    placements: [...placements, ...materialise(ctx, members, touched, new Set(ids))],
    landed: landedOf(ctx, first.extent, first.lane + laneDelta, false, 'asked'),
    requested: first.lane + laneDelta,
    original: first.lane,
  };
}

/** Where a new activity drawn at `displayLane` goes. */
export interface SwimlaneCreate {
  /** The swimlane to file it in, or `null` for "No swimlane" (nothing to send). */
  swimlaneId: string | null;
  /** Its lane inside the swimlane. */
  lane: number;
  /** Its lane in the swimlane-free layout: the first free one at its span. */
  laneIndex: number;
  /** The swimlane's unplaced members, to be written beside it. */
  materialised: readonly SwimlaneLanePlacement[];
  landed: SwimlaneLaneFacts;
}

/**
 * Create on the canvas in a swimlane: the new activity joins the swimlane drawn under the click,
 * at the nearest free lane there, and takes the first free lane of the swimlane-free layout
 * (feature-spec, "Create on the canvas"). A click below the last swimlane files it in the last.
 */
export function createInSwimlane(
  ctx: SwimlaneEditContext,
  displayLane: number,
  span: DaySpan,
): SwimlaneCreate | null {
  const { extents } = ctx.scene;
  if (extents.length === 0) return null;
  const members = membersOf(ctx);
  const at = extentIndexAt(ctx.scene, Math.max(0, displayLane));
  const target = at < 0 ? extents.length - 1 : at;
  const extent = extents[target]!;
  const occupancy = new Occupancy(members.values(), new Set());
  const lane = occupancy.nearest(target, Math.max(0, displayLane) - extent.firstLane, span);

  const flat = new Occupancy(
    [...members.values()].map((m) => ({ ...m, extent: 0, lane: ctx.stored.get(m.id) ?? 0 })),
    new Set(),
  );
  return {
    swimlaneId: extent.id,
    lane,
    laneIndex: flat.nearest(0, 0, span),
    materialised: materialise(ctx, members, new Set([target]), new Set()),
    landed: landedOf(ctx, target, lane, true, 'asked'),
  };
}

/** The partition key of "No swimlane", which has no id. */
export const NO_SWIMLANE_KEY = '\u0000none';

const keyOfExtent = (extent: SwimlaneExtent): string => extent.id ?? NO_SWIMLANE_KEY;

/**
 * What Tidy and Re-layout search (swimlanes M2-T6, feature-spec §4.5): every drawn bar's lane
 * **inside its swimlane**, and the partition that keeps each bar there. The search scores on display
 * lanes by stacking the swimlanes in `order`, so a swimlane with nothing drawn in it keeps its row.
 */
export interface SwimlaneArrangeScene {
  /** Drawn activity id → its lane inside its swimlane. */
  readonly lanes: ReadonlyMap<string, number>;
  readonly partition: LayoutPartition;
}

export function arrangeSceneOf(ctx: SwimlaneEditContext): SwimlaneArrangeScene {
  const lanes = new Map<string, number>();
  const swimlaneOf = new Map<string, string>();
  for (const m of membersOf(ctx).values()) {
    lanes.set(m.id, m.lane);
    swimlaneOf.set(m.id, keyOfExtent(ctx.scene.extents[m.extent]!));
  }
  return { lanes, partition: { swimlaneOf, order: ctx.scene.extents.map(keyOfExtent) } };
}

/**
 * The write for an arrangement: `lanes` is the search's answer (a lane inside each bar's swimlane),
 * and the placements are the bars whose lane changed plus the unplaced members of every swimlane that
 * changed (materialise on write, §4.4). **No placement names a swimlane or a `laneIndex`**: Arrange
 * never moves work between swimlanes, and the swimlane-free layout is not its to touch (SC-1).
 */
export function arrangeInSwimlanes(
  ctx: SwimlaneEditContext,
  lanes: ReadonlyMap<string, number>,
): SwimlaneLanePlacement[] {
  const members = membersOf(ctx);
  const moved: SwimlaneLanePlacement[] = [];
  const touched = new Set<number>();
  const written = new Set<string>();
  for (const [id, lane] of [...lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = members.get(id);
    if (m === undefined || m.lane === lane) continue;
    moved.push({ id, lane, from: { swimlaneId: ctx.scene.extents[m.extent]!.id, lane: m.lane } });
    touched.add(m.extent);
    written.add(id);
  }
  return moved.length === 0 ? [] : [...moved, ...materialise(ctx, members, touched, written)];
}

/**
 * The lanes to store for bars whose swimlane **changed under them** (a WBS parent write moved them
 * into another group): each at the lane it is drawn in inside its swimlane in `ctx`, which must be the
 * picture AFTER the change. The projection has already chosen that lane — the lane the bar remembers
 * for its new group when it is free at its span, otherwise the nearest free one (`deriveSwimlaneLanes`)
 * — so this stores the choice rather than making it twice. The unplaced members of every swimlane
 * touched are written beside them (materialise on write, §4.4).
 *
 * **Every row is `materialised`**: no row names a swimlane (the server derives the basis from the
 * membership the parent write just made) and none carries `from`, so no undo step is built from
 * them. Undoing the parent write puts the bar back in its old group, where its old lane row is still
 * stored against the old basis.
 */
export function settleInSwimlanes(
  ctx: SwimlaneEditContext,
  ids: readonly string[],
): SwimlaneLanePlacement[] {
  const members = membersOf(ctx);
  const settled: SwimlaneLanePlacement[] = [];
  const touched = new Set<number>();
  const written = new Set<string>();
  for (const id of [...ids].sort()) {
    const m = members.get(id);
    if (m === undefined) continue;
    settled.push({ id, lane: m.lane, materialised: true });
    touched.add(m.extent);
    written.add(id);
  }
  return settled.length === 0 ? [] : [...settled, ...materialise(ctx, members, touched, written)];
}

export const SWIMLANE_GONE_REASON =
  'That swimlane is no longer in the plan, so nothing was moved. Refresh to see the latest.';

/**
 * **Move to swimlane…** (US-3): file every bar of `ids` in `target` (`null`: "No swimlane"), keeping
 * its drawn dates. The bars are taken **left to right** and each goes to its remembered lane there when
 * that lane is free, otherwise the nearest free lane to it (to the top, for a bar with no memory), so a
 * batch stacks without overlapping and keeps its horizontal order. Bars already in the target stay
 * where they are and are written nothing; a bar placed earlier in the batch is an obstacle to the next,
 * the others are not (each is leaving its lane).
 *
 * The answer is the whole write, like every function here: the moved bars (each with where it came
 * from, for the one undo step) and the unplaced members of every swimlane it touches, at the lanes they
 * are drawn in. `stay` is "nothing to do": every bar is in the target already.
 */
export function assignToSwimlane(
  ctx: SwimlaneEditContext,
  ids: readonly string[],
  target: string | null,
): SwimlaneMove {
  const { extents } = ctx.scene;
  const members = membersOf(ctx);
  const rows: Member[] = [];
  for (const id of ids) {
    const m = members.get(id);
    if (m !== undefined) rows.push(m);
  }
  if (rows.length < ids.length) {
    return { kind: 'refuse', reason: notDrawnReason(ids.length - rows.length, ids.length) };
  }
  const found = extents.findIndex((e) => e.id === target);
  // A swimlane with no member still takes one lane, so every real target is an extent; one that is
  // not has been deleted since the list was read (its id may still be on members, kept for a restore).
  if (target !== null && found < 0) return { kind: 'refuse', reason: SWIMLANE_GONE_REASON };
  // "No swimlane" is drawn only when something is in it, so moving the first bar into none targets an
  // extent that does not exist yet; it sits below the last one.
  const extent = found < 0 ? extents.length : found;
  const to = extents[extent];
  const moving = rows
    .filter((m) => m.extent !== extent)
    .sort(
      (a, b) =>
        a.span.startDay - b.span.startDay ||
        a.span.endDay - b.span.endDay ||
        (a.id < b.id ? -1 : 1),
    );
  if (moving.length === 0) {
    const first = rows[0];
    return {
      kind: 'stay',
      landed: first
        ? landedOf(ctx, extent, first.lane, false, 'stays')
        : {
            swimlane: NO_SWIMLANE_LABEL,
            lane: 0,
            count: 1,
            changedSwimlane: false,
            displayLane: 0,
            how: 'stays',
          },
    };
  }

  const occupancy = new Occupancy(members.values(), new Set(moving.map((m) => m.id)));
  const placements: SwimlaneLanePlacement[] = [];
  let firstHow: SwimlaneLaneFacts['how'] = 'asked';
  let firstLane = 0;
  for (const m of moving) {
    const remembered = ctx.remembered(m.id, target);
    const lane = occupancy.nearest(extent, remembered ?? 0, m.span);
    occupancy.add(extent, lane, m.span);
    if (placements.length === 0) {
      firstLane = lane;
      firstHow = remembered !== undefined && lane === remembered ? 'remembered' : 'next-free';
    }
    placements.push({
      id: m.id,
      lane,
      swimlaneId: target,
      from: { swimlaneId: ctx.scene.extents[m.extent]!.id, lane: m.lane },
    });
  }
  const touched = new Set([extent, ...moving.map((m) => m.extent)]);
  const landedLane = Math.max(...placements.map((p) => p.lane)) + 1;
  const landed: SwimlaneLaneFacts =
    to !== undefined
      ? landedOf(ctx, extent, firstLane, true, firstHow)
      : {
          swimlane: NO_SWIMLANE_LABEL,
          lane: firstLane,
          count: landedLane,
          changedSwimlane: true,
          displayLane: ctx.scene.laneCount + firstLane,
          how: firstHow,
        };
  return {
    kind: 'write',
    placements: [...placements, ...materialise(ctx, members, touched, new Set(ids))],
    landed: to !== undefined ? { ...landed, count: Math.max(landed.count, landedLane) } : landed,
    requested: firstLane,
    original: moving[0]!.lane,
  };
}
