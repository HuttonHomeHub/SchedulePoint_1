import type {
  SwimlaneExtent,
  SwimlaneInput,
  SwimlaneProjection,
} from '../render/project-swimlanes';

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
   * The swimlane to file the activity in. Present **only** when the move changes it: the endpoint
   * refuses a swimlane while the plan's swimlanes come from its WBS, and a lane written inside the
   * swimlane an activity is already in is not a membership change.
   */
  readonly swimlaneId?: string;
  /**
   * The lane the bar was drawn in before this move, inside the swimlane it was in — what an undo
   * puts back. Absent on a placement that is only {@link materialised}.
   */
  readonly from?: number;
  /**
   * True for an unplaced member written at the lane it is already drawn in. It is part of the same
   * batch and no part of the planner's edit, so the undo step leaves it alone.
   */
  readonly materialised?: true;
}

/** Where a bar lands, in the words the announcements use (C9). */
export interface LandedLane {
  /** The swimlane's name, or "No swimlane". */
  readonly swimlane: string;
  /** 0-based within the swimlane. */
  readonly lane: number;
  /** How many lanes the swimlane has once the move has landed. */
  readonly count: number;
  /** True when the move put the bar in a different swimlane. */
  readonly changedSwimlane: boolean;
  /** The display lane that is, in the stack as it stands before the write. */
  readonly displayLane: number;
}

export type SwimlaneMove =
  /** A write to make. `requested` is the in-swimlane lane that was aimed at. */
  | {
      kind: 'write';
      placements: readonly SwimlaneLanePlacement[];
      landed: LandedLane;
      requested: number;
      /** The in-swimlane lane the first bar was in, so "went on past an occupied lane" can be told. */
      original: number;
    }
  /** The bar could not move: there is no free lane in that direction. Nothing is written. */
  | { kind: 'stay'; landed: LandedLane }
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

export const NO_SWIMLANE_LABEL = 'No swimlane';
export const NOT_DRAWN_REASON = 'That activity isn’t drawn yet, so it has no lane to move in.';
export const NO_SWIMLANE_BOUNDARY_REASON =
  'A bar can’t be dragged into or out of No swimlane. Assign it to a swimlane first.';
export const DELETED_SWIMLANE_REASON =
  'This activity belongs to a swimlane that was deleted, so its lane can’t be changed until it is assigned to a swimlane.';

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

/** Can this activity's lane be written at all? See {@link DELETED_SWIMLANE_REASON}. */
function writableMembers(ctx: SwimlaneEditContext): (id: string) => boolean {
  const known = new Set(ctx.input.swimlanes.map((s) => s.id));
  return (id) => {
    const raw = ctx.input.membership.get(id);
    return raw == null || known.has(raw);
  };
}

/**
 * The unplaced members of the swimlanes a write touches, at the lanes they are drawn in — the same
 * batch as the subject's, so the first write into a swimlane places everything in it. A member that
 * names a deleted swimlane is left out: the endpoint resolves its basis from that id and refuses it.
 */
function materialise(
  ctx: SwimlaneEditContext,
  members: ReadonlyMap<string, Member>,
  extents: ReadonlySet<number>,
  written: ReadonlySet<string>,
): SwimlaneLanePlacement[] {
  const writable = writableMembers(ctx);
  const out: SwimlaneLanePlacement[] = [];
  for (const id of ctx.scene.derivedIds) {
    const m = members.get(id);
    if (m === undefined || written.has(id) || !extents.has(m.extent) || !writable(id)) continue;
    out.push({ id, lane: m.lane, materialised: true });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function landedOf(
  ctx: SwimlaneEditContext,
  extent: number,
  lane: number,
  changedSwimlane: boolean,
): LandedLane {
  const e = ctx.scene.extents[extent]!;
  return {
    swimlane: label(e),
    lane,
    count: Math.max(e.laneCount, lane + 1),
    changedSwimlane,
    displayLane: e.firstLane + lane,
  };
}

/**
 * The display lanes a bar may be dragged over — what `laneRange` hands the gesture machine so the
 * ghost stops at the edge instead of being refused after it has crossed (C6).
 *
 * A bar in a hand-made swimlane may cross into any other hand-made swimlane; one in "No swimlane"
 * stays there. The endpoint cannot yet take a membership of "none" in a lane write, so a drag into
 * or out of that region is withheld rather than offered and then refused. The bottom is open only
 * where the last extent can take another lane.
 */
export function laneRangeOf(
  ctx: SwimlaneEditContext,
  activityId: string,
): { min: number; max: number } | null {
  const display = ctx.scene.displayLanes.get(activityId);
  if (display === undefined) return null;
  const { extents } = ctx.scene;
  const home = extents[extentIndexAt(ctx.scene, display)];
  if (home === undefined) return null;
  const last = extents[extents.length - 1]!;
  if (home.id === null) return { min: home.firstLane, max: Number.POSITIVE_INFINITY };
  const handMade = extents.filter((e) => e.id !== null);
  const bottom = handMade[handMade.length - 1]!;
  return {
    min: handMade[0]!.firstLane,
    max: bottom === last ? Number.POSITIVE_INFINITY : bottom.firstLane + bottom.laneCount - 1,
  };
}

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
 * the next free one in the direction of travel; in another hand-made swimlane it takes its
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
  if (!writableMembers(ctx)(activityId)) return { kind: 'refuse', reason: DELETED_SWIMLANE_REASON };
  const { extents } = ctx.scene;
  const at = extentIndexAt(ctx.scene, Math.max(0, displayLane));
  // Below the last extent is that extent growing by a lane.
  const target = at < 0 ? extents.length - 1 : at;
  const home = extents[subject.extent]!;
  const to = extents[target]!;
  if (target !== subject.extent && (home.id === null || to.id === null)) {
    return { kind: 'refuse', reason: NO_SWIMLANE_BOUNDARY_REASON };
  }

  const occupancy = new Occupancy(members.values(), new Set([activityId]));
  const dropped = Math.max(0, displayLane) - to.firstLane;
  let lane: number;
  if (target === subject.extent) {
    const step = dropped >= subject.lane ? 1 : -1;
    const found = occupancy.inDirection(target, dropped, step, subject.span);
    if (found === null || found === subject.lane) {
      return { kind: 'stay', landed: landedOf(ctx, target, subject.lane, false) };
    }
    lane = found;
  } else {
    const aim = ctx.remembered(activityId, to.id) ?? dropped;
    lane = occupancy.nearest(target, aim, subject.span);
  }

  const changedSwimlane = target !== subject.extent;
  return {
    kind: 'write',
    placements: [
      {
        id: activityId,
        lane,
        from: subject.lane,
        ...(changedSwimlane && to.id !== null ? { swimlaneId: to.id } : {}),
      },
      ...materialise(ctx, members, new Set([subject.extent, target]), new Set([activityId])),
    ],
    landed: landedOf(ctx, target, lane, changedSwimlane),
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
  if (!writableMembers(ctx)(activityId)) return { kind: 'refuse', reason: DELETED_SWIMLANE_REASON };
  const home = ctx.scene.extents[subject.extent]!;
  if (aimed < 0) return { kind: 'refuse', reason: topLaneOf(label(home)) };

  const occupancy = new Occupancy(members.values(), new Set([activityId]));
  const lane = occupancy.inDirection(subject.extent, aimed, step, subject.span);
  if (lane === null || lane === subject.lane) {
    return { kind: 'stay', landed: landedOf(ctx, subject.extent, subject.lane, false) };
  }
  return {
    kind: 'write',
    placements: [
      { id: activityId, lane, from: subject.lane },
      ...materialise(ctx, members, new Set([subject.extent]), new Set([activityId])),
    ],
    landed: landedOf(ctx, subject.extent, lane, false),
    requested: aimed,
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
  const writable = writableMembers(ctx);
  const rows: Member[] = [];
  for (const id of ids) {
    const m = members.get(id);
    if (m === undefined) return { kind: 'refuse', reason: NOT_DRAWN_REASON };
    if (!writable(id)) return { kind: 'refuse', reason: DELETED_SWIMLANE_REASON };
    rows.push(m);
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
    const lane =
      occupancy.inDirection(m.extent, m.lane + laneDelta, laneDelta > 0 ? 1 : -1, m.span) ?? m.lane;
    occupancy.add(m.extent, lane, m.span);
    if (lane !== m.lane) {
      placements.push({ id: m.id, lane, from: m.lane });
      touched.add(m.extent);
    }
  }
  if (placements.length === 0) {
    const first = rows[0]!;
    return { kind: 'stay', landed: landedOf(ctx, first.extent, first.lane, false) };
  }
  const first = rows[0]!;
  return {
    kind: 'write',
    placements: [...placements, ...materialise(ctx, members, touched, new Set(ids))],
    landed: landedOf(ctx, first.extent, first.lane + laneDelta, false),
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
  landed: LandedLane;
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
    landed: landedOf(ctx, target, lane, true),
  };
}
