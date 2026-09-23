import type { TsldScene } from './paint';
import {
  activityRect,
  BAR_HEIGHT,
  bundleCorridors,
  chooseCorridorsByCrossing,
  corridorGap,
  dependencyPolyline,
  dependencyPolylineTimeTrue,
  ELAPSED_DAY_WALK,
  lagAnchorPoints,
  lagRunSegment,
  LANE_HEIGHT,
  laneIntervalIndex,
  makeWorkingDayWalk,
  packGutterChannels,
  routeOrthogonal,
  rowSlots,
  type LagRun,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';

/**
 * **The frame's routed links, as values** (NetPoint-layout M4-T1, spec §4.5).
 *
 * This is layer 2's geometry moved verbatim out of `paintScene`: the per-edge `lineOf` mapping and
 * the three post-passes (corridor choice, bundling, gutter channels) that run over all the lines
 * together. It returns what the painter strokes instead of stroking it, so the layout optimiser can
 * score a candidate layout on **the router the painter uses**, not a proxy of it (ADR-0149's
 * lesson). The painter calls it and draws the result, so the two cannot drift.
 *
 * A move, not a change: the golden log and every routing suite pass unedited (ADR-0078).
 */
export type RouteFrameScene = Pick<
  TsldScene,
  | 'activities'
  | 'edges'
  | 'dataDate'
  | 'timeTrueLinks'
  | 'isWorkingDay'
  | 'visualRefresh'
  | 'linkRouting'
  | 'lagHandles'
  | 'activeLagId'
>;

export interface RouteFrame {
  /** The time-true day walk, or null on the legacy extreme-end routing. */
  readonly workingWalk: ReturnType<typeof makeWorkingDayWalk> | null;
  /** The refreshed link path (`scene.visualRefresh`). */
  readonly refresh: boolean;
  /** The frame's obstacle index, or null when routing is off. */
  readonly laneIndex: ReturnType<typeof laneIntervalIndex> | null;
  /**
   * The per-edge geometry seam. Exposed because the revision overlay routes removed links through
   * the SAME closure with a synthetic edge.
   */
  readonly lineOf: (edge: RenderEdge, pred: RenderActivity, succ: RenderActivity) => Point[] | null;
  /** Every visible edge's final line, in scene order. */
  readonly lines: Map<RenderEdge, Point[]>;
  /** Lag runs collected on the way past (refresh + time-true only), painted above the bars. */
  readonly lagRuns: LagRun[] | null;
  /** The draggable lag handles at rest. */
  readonly lagHandlePoints: Point[] | null;
  /**
   * The emphasised lag handle. A field on this object rather than a copy, because `lineOf` can
   * still be called after `routeFrame` returns and may set it.
   */
  activeLagHandle: Point | null;
}

export function routeFrame(
  scene: RouteFrameScene,
  view: Viewport,
  visibleIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, RenderActivity>,
  rectCache: RectCache,
): RouteFrame {
  // `lineOf` writes the active handle here, so a later call is seen by the painter too.
  const out: { activeLagHandle: Point | null } = { activeLagHandle: null };
  // Time-true anchoring (ADR-0052 M1): the working-day walk is built once per frame from the
  // same predicate the non-working wash reads (memoised + horizon-bounded, so the per-edge cost
  // stays O(visible edges)); a `TWENTY_FOUR_HOUR` lag swaps in the elapsed walk (ADR-0036 §6).
  // No calendar loaded ⇒ elapsed for every edge (display-only; the engine stays authoritative).
  // Flag off ⇒ `null` ⇒ the legacy extreme-end routing below ⇒ byte-for-byte parity.
  const workingWalk = scene.timeTrueLinks
    ? scene.isWorkingDay
      ? makeWorkingDayWalk(scene.isWorkingDay)
      : ELAPSED_DAY_WALK
    : null;
  // Link visual refresh (ADR-0052 M5) — the SAME `visualRefresh` scene field M4 reads (ONE env
  // flag, ONE flag-off parity gate): rounded elbows, the dashed lag-run depiction, and the
  // incident-link highlight for the selection (persistent, keyboard/AT-reachable) + idle hover
  // (transient). All inert when `visualRefresh` is off ⇒ byte-for-byte today's edge layer.
  //
  // **Fan-out is gone** (M3-T3, spec D10). It spread several link ends along a bar edge by
  // `FAN_OUT_STEP_PX`, which needs the bar's half-height to spread within; the row treatment's
  // bar is 5 px and the step alone exceeded 2.5. The reference solves the same crowding the
  // other way — every link converges on the **node glyph** at the bar's end — which needs no
  // vertical room on the bar at all, and takes a per-frame memoised pass off the draw path with
  // it (5–11 ms at 2,000 activities / 4,000 edges — but see `link-routing.ts`'s retirement
  // note: that is the cost the WeakMap memo had already taken off a PAN frame, so what goes
  // with the pass is a lookup per frame and the 5–11 ms once per edge-list change).
  const refresh = scene.visualRefresh === true;
  /**
   * Obstacle awareness for the corridor (ADR-0064 M2). Built **once per frame, from the culled
   * set** — a route is drawn inside the viewport, so a bar outside it cannot be visibly crossed,
   * and building over the whole plan would make an O(N) pass out of a layer whose whole budget
   * argument is that it is O(visible). Rebuilt each frame rather than memoised because it is a
   * function of the viewport, which is exactly what changes while panning.
   */
  const laneIndex =
    refresh && scene.linkRouting === true
      ? laneIntervalIndex(
          scene.activities.filter((a) => visibleIds.has(a.id)),
          view,
          scene.dataDate,
          rectCache,
        )
      : null;
  const lagRuns: LagRun[] | null = refresh && workingWalk ? [] : null;
  // Handles ride the SAME gate as the runs plus their own scene flag: they are only meaningful
  // where the anchors are time-true (the geometry `classifyHit` grabs), and only wanted where
  // the drag is actually armed. Flag-off ⇒ null ⇒ not one extra call in the paint log.
  const lagHandlePoints: Point[] | null = lagRuns && scene.lagHandles === true ? [] : null;
  // The one per-edge geometry seam: flag-off it is exactly the M1 branch (time-true or legacy);
  // refreshed it composes the SAME anchor mapping with the fan-out offsets + elbow shift, and
  // collects the edge's lag run while the anchors are at hand.
  const lineOf = (edge: RenderEdge, pred: RenderActivity, succ: RenderActivity): Point[] | null => {
    if (!workingWalk) {
      return dependencyPolyline(pred, succ, edge.type, view, scene.dataDate, rectCache);
    }
    const walk = edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : workingWalk;
    const lag = edge.lagDays ?? 0;
    if (!refresh) {
      return dependencyPolylineTimeTrue(
        pred,
        succ,
        edge.type,
        lag,
        view,
        scene.dataDate,
        walk,
        rectCache,
      );
    }
    const anchors = lagAnchorPoints(
      pred,
      succ,
      edge.type,
      lag,
      view,
      scene.dataDate,
      walk,
      rectCache,
    );
    if (!anchors) return null;
    if (lagRuns && lag !== 0) {
      // FS/FF walk the successor end, SS/SF the predecessor end — the SAME choice `classifyHit`
      // makes for the draggable anchor, so the handle can never land on the wrong end.
      //
      // The per-end vertical offset that used to ride here was fan-out's, and fan-out is retired
      // (M3-T3): every link now converges on the node glyph at its bar end, so there is no
      // spread for a run or a handle to stay with.
      const walkedSucc = edge.type === 'FS' || edge.type === 'FF';
      const run = lagRunSegment(pred, succ, edge.type, lag, view, scene.dataDate, walk, rectCache);
      if (run) lagRuns.push(run);
      if (lagHandlePoints) {
        // Collected off the ANCHOR, not the run: a clamped anchor (a lag past the bar's extent)
        // yields no run but is still grabbable, and that is exactly the case where an invisible
        // target would silently shadow the bar-end resize handle.
        const anchor = walkedSucc ? anchors.succ : anchors.pred;
        const point: Point = { x: anchor.x, y: anchor.y };
        if (edge.id !== undefined && edge.id === scene.activeLagId) out.activeLagHandle = point;
        else lagHandlePoints.push(point);
      }
    }
    const from = anchors.pred;
    const to = anchors.succ;
    if (!laneIndex) return routeOrthogonal(from, to, edge.type, view);
    /**
     * The two endpoint bars' own x-spans (logic-legibility M2-T2). A horizontal leg begins on its
     * anchor's edge, so the leg check has to exclude that bar by identity — and `laneIndex`
     * cannot supply it, because it merges spans that touch and `packLanes` puts activities end to
     * end. These rects are already cached for this frame, so it costs a lookup.
     */
    const predRect = activityRect(pred, view, scene.dataDate, rectCache);
    const succRect = activityRect(succ, view, scene.dataDate, rectCache);
    return routeOrthogonal(from, to, edge.type, view, 0, {
      index: laneIndex,
      fromLane: pred.laneIndex,
      toLane: succ.laneIndex,
      laneHeight: LANE_HEIGHT,
      barHeight: BAR_HEIGHT,
      ...(predRect ? { fromSpan: { x0: predRect.x, x1: predRect.x + predRect.w } } : {}),
      ...(succRect ? { toSpan: { x0: succRect.x, x1: succRect.x + succRect.w } } : {}),
    });
  };
  /**
   * Every visible edge's line, computed **once** for the frame (ADR-0065 M3). It was previously
   * computed inside the draw passes; it has to move out because bundling is a decision about all
   * the lines together, and it cannot be taken while one of them is half-drawn.
   *
   * The set is identical to what the passes drew before — same visibility and endpoint checks, in
   * scene order — so the lag runs and handles `lineOf` collects on the way past are collected
   * exactly once each, as they were.
   */
  const lines = new Map<RenderEdge, Point[]>();
  for (const edge of scene.edges) {
    if (!visibleIds.has(edge.predecessorId) && !visibleIds.has(edge.successorId)) continue;
    const pred = byId.get(edge.predecessorId);
    const succ = byId.get(edge.successorId);
    if (!pred || !succ) continue;
    const line = lineOf(edge, pred, succ);
    if (line) lines.set(edge, line);
  }
  if (laneIndex && lines.size > 1) {
    const corridors = [...lines.entries()].map(([edge, line]) => ({
      line,
      fromLane: byId.get(edge.predecessorId)?.laneIndex ?? 0,
      toLane: byId.get(edge.successorId)?.laneIndex ?? 0,
    }));
    /**
     * **Corridor choice BEFORE bundling** (diagram-legibility M-C3), and the order is a decision.
     *
     * `routeOrthogonal` picks a corridor for what it HITS; this moves it for what it CROSSES,
     * which is the thing the product owner reported and the thing
     * `docs/specs/diagram-legibility/part-c-m-c0.md` measured height cannot buy. Bundling then
     * merges whatever near-identical verticals remain — run the other way round it would merge a
     * comb first and then pull members out of the trunk it had just made, undoing its own work.
     */
    chooseCorridorsByCrossing(corridors, laneIndex, corridorGap(view));
    // Trunk/branch bundling (ADR-0065 M3): a hub's dozen near-identical verticals become one
    // trunk. Rides the SAME flag as the routing it bundles — a comb is only worth merging once
    // the corridors are chosen deliberately, and the free-check it does needs that index anyway.
    bundleCorridors(corridors, laneIndex);
    /**
     * **Gutter channels LAST** (logic-legibility M1-T3), and the ordering is the decision.
     *
     * A gutter run's x-extent is set by the two verticals either side of it, and
     * `bundleCorridors` moves verticals. Packing channels before it would assign them against x
     * values that then change — ADR-0090's recorded oscillation with a third subject — so this
     * runs after every x is final and moves y only.
     */
    packGutterChannels(corridors, rowSlots(0).clearHalfBandPx);
  }
  const frame: RouteFrame = {
    workingWalk,
    refresh,
    laneIndex,
    lineOf,
    lines,
    lagRuns,
    lagHandlePoints,
    get activeLagHandle() {
      return out.activeLagHandle;
    },
    set activeLagHandle(point: Point | null) {
      out.activeLagHandle = point;
    },
  };
  return frame;
}
