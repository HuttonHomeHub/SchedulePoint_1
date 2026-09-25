import { isLaneBoundary } from './link-candidates';
import {
  chooseRoutesByCrossing,
  glyphIndex,
  isLaneCentre,
  routeNodeToNode,
  type FrameLink,
  type GlyphIndex,
} from './link-score';
import type { TsldScene } from './paint';
import {
  activityRect,
  barGlyphKind,
  dependencyPolyline,
  dependencyPolylineTimeTrue,
  ELAPSED_DAY_WALK,
  lagAnchorPoints,
  lagRunSegment,
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
  /**
   * The frame's glyph index (every visible bar, widened by its nodes), or null when node-to-node
   * routing is off. The painter reads it only as that switch.
   */
  readonly glyphs: GlyphIndex | null;
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
   * **Where a link joins partway along a bar** (NetPoint grammar M3-T5, spec §4.2 G12): every
   * anchor strictly inside a bar's span, which is where no node glyph sits — an SS or FF link with
   * a lag, typically. Collected on the refreshed, time-true path only (null otherwise), for every
   * visible edge in the frame, whether or not the lag drag is armed; the painter decides whether to
   * draw them (the working tier and finer). Each point sits on the bar's centre-line.
   */
  readonly attachPoints: Point[] | null;
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
   * **The glyph index node-to-node routing scores against** (node-to-node links M2, spec §4.3):
   * every visible bar, widened by its two nodes. Built **once per frame, from the culled set** — a
   * route is drawn inside the viewport, so a bar outside it cannot be visibly crossed, and building
   * over the whole plan would make an O(N) pass out of a layer whose budget argument is that it is
   * O(visible). Rebuilt each frame because it is a function of the viewport.
   */
  const glyphs =
    refresh && scene.linkRouting === true
      ? glyphIndex(
          scene.activities.filter((a) => visibleIds.has(a.id)),
          view,
          scene.dataDate,
          rectCache,
        )
      : null;
  /** Each routed edge's scored shapes (best first by phase 1) and its two anchors: phase 2's input. */
  const candidatesByEdge = new Map<RenderEdge, FrameLink>();
  const lagRuns: LagRun[] | null = refresh && workingWalk ? [] : null;
  // Handles ride the SAME gate as the runs plus their own scene flag: they are only meaningful
  // where the anchors are time-true (the geometry `classifyHit` grabs), and only wanted where
  // the drag is actually armed. Flag-off ⇒ null ⇒ not one extra call in the paint log.
  const lagHandlePoints: Point[] | null = lagRuns && scene.lagHandles === true ? [] : null;
  const attachPoints: Point[] | null = lagRuns ? [] : null;
  /**
   * True only while the frame's own edges are being routed. `lineOf` is also called afterwards by
   * the revision overlay with synthetic edges for REMOVED links, and a dot for a link that no longer
   * exists would be a mark the live diagram does not have.
   */
  let collecting = false;
  /** An anchor on `a` strictly inside its bar's span: where a link joins partway along a bar. */
  const midBar = (a: RenderActivity, anchor: Point): boolean => {
    if (barGlyphKind(a.type) !== 'bar') return false;
    const r = activityRect(a, view, scene.dataDate, rectCache);
    if (r === null) return false;
    // Half a pixel in from each edge, so an anchor that lands on an edge (a node) is not dotted.
    const inside = { from: r.x + 0.5, to: r.x + r.w - 0.5 };
    return anchor.x > inside.from && anchor.x < inside.to;
  };
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
    // Read-only collection beside the handles: it changes no returned line (FC-G1).
    if (attachPoints && collecting) {
      if (midBar(pred, anchors.pred)) attachPoints.push({ x: anchors.pred.x, y: anchors.pred.y });
      if (midBar(succ, anchors.succ)) attachPoints.push({ x: anchors.succ.x, y: anchors.succ.y });
    }
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
    if (!glyphs) return routeOrthogonal(from, to, edge.type, view);
    const predRect = activityRect(pred, view, scene.dataDate, rectCache);
    const succRect = activityRect(succ, view, scene.dataDate, rectCache);
    // `lagAnchorPoints` returned anchors, so both rects exist; this is the type system's check.
    if (!predRect || !succRect) return routeOrthogonal(from, to, edge.type, view);
    /**
     * **Node to node** (node-to-node links M2, spec §4.2–§4.3): the link leaves its predecessor's
     * end and enters its successor's through a side each glyph allows, with any bend clear of the
     * node, choosing among at most eleven shapes the one through fewest foreign bars, then the
     * shortest. Phase 2 below may move it to reduce crossings.
     */
    const scored = routeNodeToNode(
      {
        from: pred,
        to: succ,
        fromAnchor: from,
        toAnchor: to,
        fromRect: predRect,
        toRect: succRect,
      },
      glyphs,
      view,
    );
    if (collecting) candidatesByEdge.set(edge, { candidates: scored, ends: [from, to] });
    // Not copied: a multi-link frame replaces it with a copy of phase 2's choice below, and a single
    // link is never packed, so nothing mutates the candidate's array.
    return scored[0]!.line;
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
  collecting = true;
  for (const edge of scene.edges) {
    if (!visibleIds.has(edge.predecessorId) && !visibleIds.has(edge.successorId)) continue;
    const pred = byId.get(edge.predecessorId);
    const succ = byId.get(edge.successorId);
    if (!pred || !succ) continue;
    const line = lineOf(edge, pred, succ);
    if (line) lines.set(edge, line);
  }
  collecting = false;
  if (glyphs && lines.size > 1) {
    /**
     * **Phase 2, then gutter channels** (node-to-node links M2, spec §4.4), and the order is the
     * decision. Phase 2 re-chooses each link's shape against a frozen snapshot of the phase-1
     * picks, for crossings and overlaps; packing gutter channels first would assign them to runs
     * phase 2 then replaces. Channels move y only, so they cannot undo a shape.
     */
    const edges = [...lines.keys()].filter((edge) => candidatesByEdge.has(edge));
    const links = edges.map((edge) => candidatesByEdge.get(edge)!);
    const chosen = chooseRoutesByCrossing(links, (y) => isLaneCentre(y, view));
    edges.forEach((edge, i) =>
      lines.set(
        edge,
        chosen[i]!.map((p) => ({ x: p.x, y: p.y })),
      ),
    );
    const corridors = [...lines.entries()].map(([edge, line]) => ({
      line,
      fromLane: byId.get(edge.predecessorId)?.laneIndex ?? 0,
      toLane: byId.get(edge.successorId)?.laneIndex ?? 0,
      key: edge.id ?? `${edge.predecessorId}>${edge.successorId}:${edge.type}`,
    }));
    packGutterChannels(corridors, rowSlots(0).clearHalfBandPx, (y) => isLaneBoundary(y, view));
  }
  const frame: RouteFrame = {
    workingWalk,
    refresh,
    glyphs,
    lineOf,
    lines,
    lagRuns,
    lagHandlePoints,
    attachPoints,
    get activeLagHandle() {
      return out.activeLagHandle;
    },
    set activeLagHandle(point: Point | null) {
      out.activeLagHandle = point;
    },
  };
  return frame;
}
