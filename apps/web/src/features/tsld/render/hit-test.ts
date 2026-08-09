import type { ActivityType } from '@repo/types';

import {
  activityRect,
  BAR_HEIGHT,
  isMilestone,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './geometry';
import { lagAnchorPoints } from './link-routing';
import { ELAPSED_DAY_WALK, type DayWalk } from './working-time';

/**
 * **Hit testing** (ADR-0078 S8) — which thing is under the pointer.
 *
 * `hitTest` answers "which bar", `classifyHit` answers the harder question the direct-manipulation
 * work needs (ADR-0052): bar body, start/finish resize handle, or lag anchor, with the edge-handle
 * and lag-anchor zones sized here.
 *
 * Imports the geometry core and link routing; **never the barrel** (`docs/TECH_DEBT.md` #106).
 *
 * `classifyHit` still iterates every activity per pointer-move — it memoises an id index and an
 * offset-edge index but does not cull to the viewport. That is `docs/TECH_DEBT.md` #51(b), and it is
 * a change to this 230-line module now rather than to a 1,727-line one, which was the point of
 * moving it before optimising it (ADR-0078 §3 forbids doing both in one step).
 */
/**
 * The id of the topmost activity under a screen point, or null. Iterates in reverse so
 * later-drawn (visually on top) activities win. Milestones use their bounding box.
 */
export function hitTest(
  activities: readonly RenderActivity[],
  point: Point,
  view: Viewport,
  dataDateIso: string,
): string | null {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i]!;
    const rect = activityRect(activity, view, dataDateIso);
    if (
      rect &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    ) {
      return activity.id;
    }
  }
  return null;
}

/**
 * Width of the grab-zone at each end of a bar, for dependency-draw (ADR-0026 D5). Kept small and
 * capped at half the bar (see {@link classifyHit}) so it never swallows the body's reposition
 * zone on short bars. It is intentionally below the ≥24px target-size guideline: the same
 * link-creation capability is available through the ≥36px buttons in the dependency dialog
 * (reachable via Enter on the diagram listbox), so this pointer grab-zone falls under WCAG 2.5.8's
 * **Equivalent** exception. The selected bar also shows a persistent edge mark (a non-hover cue).
 */
export const EDGE_HANDLE_PX = 8;

/** Where a screen point falls relative to the activities, for gesture routing. The `resize*`
 * kinds exist only when {@link classifyHit} is asked for resize handles (ADR-0052 M2);
 * `lagAnchor` only when it is given the drawn lag anchors (ADR-0052 M3). */
export type HitZoneKind =
  'empty' | 'body' | 'startHandle' | 'finishHandle' | 'resizeStart' | 'resizeFinish' | 'lagAnchor';

export interface HitZone {
  kind: HitZoneKind;
  /** The activity id for a non-empty zone (for `lagAnchor`, the bar the anchor sits on). */
  id?: string;
  /** The dependency a `lagAnchor` zone manipulates (ADR-0052 M3). */
  dependencyId?: string;
}

/**
 * True when a bar's duration is a user-entered number the finish edge can resize (ADR-0052 M2).
 * False for the duration-derived types — milestones (a zero-duration point), Level of Effort
 * (span derived from its SS/FF ties, ADR-0035 §21) and WBS summaries (rolled up from the branch,
 * ADR-0035 §24) — which therefore offer no resize handles. Mirrors `isDurationDerivedType` in
 * `features/activities` (kept in step by hand: the pure render model imports no other feature —
 * ADR-0026 D8).
 */
export function isResizeEligibleType(type: ActivityType): boolean {
  return !isMilestone(type) && type !== 'LEVEL_OF_EFFORT' && type !== 'WBS_SUMMARY';
}

/** Half-width (px) of the grab zone around a drawn lag anchor (ADR-0052 M3) — 12, so the target is
 * a full **24px** wide and meets WCAG 2.5.8 outright rather than leaning on the Equivalent
 * exception the bar-end zones ({@link EDGE_HANDLE_PX}) take. It is deliberately wider than those
 * zones because the anchor is a *point* target with no bar edge to aim at, and because the anchor
 * now paints a visible handle (`TsldScene.lagHandles`) the user aims for: an under-sized target
 * around a drawn dot is the defect this widens away. The vertical tolerance stays `BAR_HEIGHT / 2`
 * (the bar the anchor sits on), which also covers the M5 fan-out offset (±`FAN_OUT_MAX_PX`). */
export const LAG_ANCHOR_PX = 12;

/**
 * Id→activity index for {@link classifyHit}'s lag branch, memoised on the activities ARRAY
 * identity — the `edgeFanOutFor` pattern (paint.ts), duplicated here rather than shared because
 * paint.ts imports this module and the reverse import would be a cycle. `classifyHit` runs on
 * every pointer-move while the lag tool is armed, and its single production caller passes the
 * reference-stable `sceneRef.current.activities`, so per-call rebuilding was O(n) per mousemove.
 * A caller constructing fresh arrays per call degrades to always-recompute — a missed
 * optimisation, never a stale result. Exported for the memo-identity test only.
 */
const classifyActivityIndexes = new WeakMap<
  readonly RenderActivity[],
  ReadonlyMap<string, RenderActivity>
>();
export function classifyActivityIndexFor(
  activities: readonly RenderActivity[],
): ReadonlyMap<string, RenderActivity> {
  let index = classifyActivityIndexes.get(activities);
  if (!index) {
    index = new Map(activities.map((a) => [a.id, a]));
    classifyActivityIndexes.set(activities, index);
  }
  return index;
}

/**
 * The filtered + id-sorted offset-edge list {@link classifyHit}'s lag branch walks, memoised on
 * the edges ARRAY identity. The sort is what makes overlapping anchors resolve deterministically
 * (ADR-0065's fixed-order rule); memoising it changes nothing about the order — the same array
 * reference now returns the identical precomputed list instead of re-sorting per pointer-move
 * (O(E log E) each). Exported for the memo-identity test only.
 */
const offsetEdgesByArray = new WeakMap<readonly RenderEdge[], readonly RenderEdge[]>();
export function offsetEdgesFor(edges: readonly RenderEdge[]): readonly RenderEdge[] {
  let sorted = offsetEdgesByArray.get(edges);
  if (!sorted) {
    sorted = edges
      .filter((e) => e.id !== undefined && (e.lagDays ?? 0) !== 0)
      .sort((a, b) => (a.id! < b.id! ? -1 : 1));
    offsetEdgesByArray.set(edges, sorted);
  }
  return sorted;
}

/** Options for {@link classifyHit}'s zone vocabulary (ADR-0052 M2/M3). */
export interface ClassifyHitOptions {
  /**
   * When true (the direct-manipulation flag is on, in `select` mode with a resize handler wired),
   * the bar-end grab-zones classify as **resize** zones (`resizeStart`/`resizeFinish`) instead of
   * the link-draw `startHandle`/`finishHandle` — the ADR-0052 §1 edge-handle repurpose. A bar whose
   * duration isn't resizable ({@link isResizeEligibleType} false: milestone / LOE / WBS summary)
   * classifies entirely as `body`, so it never advertises a handle it can't honour. Absent/false ⇒
   * byte-for-byte today's zones (the flag-off parity gate).
   */
  resizeHandles?: boolean;
  /**
   * When present (the flag is on, in `select` mode with a lag handler wired — the same gate as
   * {@link ClassifyHitOptions.resizeHandles}), a grab zone surrounds each drawn **lag anchor**
   * (ADR-0052 M3) and classifies as `lagAnchor` carrying the edge's `dependencyId`. Only edges
   * whose anchor is actually *offset* (`lagDays !== 0`) offer a zone: a zero-lag anchor sits ON
   * the constrained edge, exactly where the resize handles live, and must not steal them — a
   * zero-lag tie's lag is set through the dependency dialog instead. `walk` is the plan
   * working-day {@link DayWalk}; a `TWENTY_FOUR_HOUR` edge branches to the elapsed walk here,
   * mirroring the painter, so the zone always sits where the anchor is drawn.
   */
  lagAnchors?: {
    edges: readonly RenderEdge[];
    walk: DayWalk;
  };
}

/**
 * Classify a screen point for gesture routing (ADR-0026 D5): the topmost activity (if
 * any) under it, and whether the point is on the bar **body** (→ reposition) or an end
 * **grab-zone** (→ dependency-draw, or — with `resizeHandles` on — duration resize,
 * ADR-0052 M2). Iterates topmost-first like {@link hitTest}; the end zones take precedence
 * over the body and are capped at half the bar so they never overlap. `empty` (no activity
 * under the point) routes to pan or create.
 */
export function classifyHit(
  activities: readonly RenderActivity[],
  point: Point,
  view: Viewport,
  dataDateIso: string,
  options?: ClassifyHitOptions,
): HitZone {
  // Lag-anchor zones first (ADR-0052 M3): an anchor is a small point target drawn ON a bar, so it
  // must win over the bar body (topmost/smallest target wins — the same rule that puts the end
  // zones above the body). Overlapping anchors on a crowded bar resolve by stable edge-id order,
  // so the winner never jitters between frames/refetches.
  if (options?.lagAnchors) {
    const { edges, walk } = options.lagAnchors;
    const byId = classifyActivityIndexFor(activities);
    const offsetEdges = offsetEdgesFor(edges);
    for (const edge of offsetEdges) {
      const pred = byId.get(edge.predecessorId);
      const succ = byId.get(edge.successorId);
      if (!pred || !succ) continue;
      const anchors = lagAnchorPoints(
        pred,
        succ,
        edge.type,
        edge.lagDays ?? 0,
        view,
        dataDateIso,
        edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : walk,
      );
      if (!anchors) continue;
      // The *offset* anchor is the draggable one: FS/FF walk the successor end, SS/SF the
      // predecessor end (see lagAnchorPoints) — the other end sits on a plain bar edge.
      const predFinish = edge.type === 'FS' || edge.type === 'FF';
      const anchor = predFinish ? anchors.succ : anchors.pred;
      const anchorBar = predFinish ? succ : pred;
      if (
        Math.abs(point.x - anchor.x) <= LAG_ANCHOR_PX &&
        Math.abs(point.y - anchor.y) <= BAR_HEIGHT / 2
      ) {
        return { kind: 'lagAnchor', id: anchorBar.id, dependencyId: edge.id! };
      }
    }
  }
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const activity = activities[i]!;
    const rect = activityRect(activity, view, dataDateIso);
    if (!rect) continue;
    if (
      point.x < rect.x ||
      point.x > rect.x + rect.w ||
      point.y < rect.y ||
      point.y > rect.y + rect.h
    ) {
      continue;
    }
    // Resize vocabulary (ADR-0052 M2): a duration-derived bar has no end zones at all — the whole
    // rect is body, so a press falls through to reposition/select rather than a dead handle.
    if (options?.resizeHandles && !isResizeEligibleType(activity.type)) {
      return { kind: 'body', id: activity.id };
    }
    const handleW = Math.min(EDGE_HANDLE_PX, rect.w / 2);
    if (point.x <= rect.x + handleW) {
      return { kind: options?.resizeHandles ? 'resizeStart' : 'startHandle', id: activity.id };
    }
    if (point.x >= rect.x + rect.w - handleW) {
      return { kind: options?.resizeHandles ? 'resizeFinish' : 'finishHandle', id: activity.id };
    }
    return { kind: 'body', id: activity.id };
  }
  return { kind: 'empty' };
}

/**
 * The screen point at a bar's start (left) or finish (right) edge, vertically centred — the
 * anchor a dependency rubber-band springs from (ADR-0026 D5). Pure over the same rect geometry
 * hit-testing uses, so the drawn line begins exactly where {@link classifyHit} reports the handle.
 */
export function edgeAnchor(rect: Rect, handle: 'startHandle' | 'finishHandle'): Point {
  return {
    x: handle === 'startHandle' ? rect.x : rect.x + rect.w,
    y: rect.y + rect.h / 2,
  };
}
