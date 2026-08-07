import { activityIndexFor } from './activity-index';
import type { Ctx2D } from './ctx-2d';
import {
  activityRect,
  cull,
  type RectCache,
  type RenderActivity,
  type Rect,
  type Size,
  type Viewport,
} from './render-model';
import { calendarBoundaries } from './time-scale';
import { DEFAULT_VIEW_TOGGLES, type TsldViewToggles } from './view-toggles';

/** The shape `calendarBoundaries` returns — named here because `time-scale.ts` returns it inline. */
type CalendarBoundaries = ReturnType<typeof calendarBoundaries>;

/** A visible bar paired with its screen rect — the shape both text passes below layer 3.5 need. */
export interface LaneRow {
  readonly activity: RenderActivity;
  readonly rect: Rect;
}

/**
 * The minimal scene shape `buildPaintFrame` reads.
 *
 * Structural rather than the full `TsldScene`, so this module does not have to import the 400-line
 * interface that `paint.ts` owns — which would be the ADR-0078 §3a cycle again, one level up.
 */
export interface PaintFrameScene {
  readonly activities: readonly RenderActivity[];
  readonly dataDate: string;
  readonly view?: PaintFrameToggles | undefined;
}

/** The toggle set, aliased so a layer painter's signature names the frame's own vocabulary. */
export type PaintFrameToggles = TsldViewToggles;

/**
 * The per-frame context every canvas layer painter takes (ADR-0078 §1).
 *
 * The constraint that makes this a **context and not a bag** is that it holds only what is derived
 * once per frame and shared by **two or more** layers. A value one layer needs stays that layer's
 * local; a value two layers derive separately is exactly the drift ADR-0065 warns about, one
 * picture in.
 *
 * `rects` and `laneRows` are **lazy on purpose**, and that is the load-bearing detail of this
 * module. Building `rects` eagerly would preserve every existing test — `activityRect` makes no
 * `ctx` calls, so the five counting-stub budget suites and the whole-scene golden log are all blind
 * to when it runs — which is precisely why the temptation has to be refused here rather than
 * discovered later. Today it is built after the edge layer, which independently re-derives the same
 * geometry through `laneIntervalIndex`; that duplication is `docs/TECH_DEBT.md` #76 and belongs to a
 * change with its own measurement, not to a refactor. The lazy getter keeps today's ordering exactly
 * and reduces #76 to a one-line move: call `rects()` before the edge layer and pass it in.
 */
export interface PaintFrame {
  readonly ctx: Ctx2D;
  readonly view: Viewport;
  readonly size: Size;
  /** `scene.view ?? DEFAULT_VIEW_TOGGLES`, resolved once. */
  readonly toggles: PaintFrameToggles;
  readonly byId: ReadonlyMap<string, RenderActivity>;
  /**
   * The culled set, **insertion-ordered** — bar z-order depends on this order, so a caller that
   * re-derives it from `scene.activities` gets a different picture, not merely a slower one.
   */
  readonly visibleIds: ReadonlySet<string>;
  /** The per-frame geometry cache `cull`, the lane index and the edge pass all populate. */
  readonly rectCache: RectCache;
  readonly firstDay: number;
  readonly lastDay: number;
  /**
   * ONE calendar walk per frame, shared by the month bands (layer -0.5) and the month/year
   * gridlines (layer 1). Two walks could disagree by a day; one cannot.
   */
  readonly bounds: CalendarBoundaries;
  /** Visible screen rects, insertion-following `visibleIds`. Lazy — see the interface docblock. */
  readonly rects: () => ReadonlyMap<string, Rect>;
  /** Lane-bucketed, x-sorted rows. Lazy — labels and dates share one build. */
  readonly laneRows: () => ReadonlyMap<number, LaneRow[]>;
}

/**
 * Derive the per-frame context from a paint call's arguments.
 *
 * Every line here is moved from `paintScene`'s prologue unchanged, comments included (ADR-0078 §3).
 * `paintScene` calls this and destructures, so the layers still read plain locals and the diff at
 * each call site is nil — which is what lets the 30 consuming files and their suites act as the
 * before/after oracle.
 */
export function buildPaintFrame(
  ctx: Ctx2D,
  scene: PaintFrameScene,
  view: Viewport,
  size: Size,
): PaintFrame {
  const byId = activityIndexFor(scene.activities);
  // Per-frame geometry cache (Finding B of docs/specs/canvas-paint-loop-fixes/plan.md).
  // Deliberately a fresh Map per paintScene call, NEVER hoisted to module/WeakMap scope like
  // `edgeFanOuts`: a rect depends on `view` and `scene.dataDate`, which change every frame on
  // the exact pan/zoom/drag path this cache exists for — an identity-keyed cross-frame cache
  // would serve stale geometry mid-pan. `view`/`dataDate` are fixed for one call's lifetime,
  // so id-keyed-per-call is exactly right.
  const rectCache: RectCache = new Map();
  const visibleIds = new Set(
    cull(scene.activities, view, size, scene.dataDate, undefined, rectCache),
  );
  const toggles = scene.view ?? DEFAULT_VIEW_TOGGLES;
  const firstDay = Math.floor((0 - view.originX) / view.pxPerDay);
  const lastDay = Math.ceil((size.width - view.originX) / view.pxPerDay);

  // ONE calendar walk per frame, shared by the month bands (layer -0.5) and the month/year
  // gridlines (layer 1). Two walks could disagree by a day; one cannot.
  const bounds = calendarBoundaries(firstDay, lastDay, scene.dataDate);

  let rectsCache: Map<string, Rect> | null = null;
  const rects = (): ReadonlyMap<string, Rect> => {
    if (rectsCache) return rectsCache;
    // Each visible activity's screen rect is read from the frame's rectCache (populated above by
    // cull, the lane index and the edge pass) and reused by the bar, label, and selection layers
    // below — each recompute re-parses the activity's ISO dates (two Date.parse calls), so the
    // shared cache keeps the per-frame draw within the ADR-0026 budget. Insertion follows
    // `visibleIds`, so bar draw order (z-order) is unchanged.
    const built = new Map<string, Rect>();
    for (const id of visibleIds) {
      const activity = byId.get(id);
      if (!activity) continue;
      const rect = activityRect(activity, view, scene.dataDate, rectCache);
      if (rect) built.set(id, rect);
    }
    rectsCache = built;
    return built;
  };

  // The visible bars bucketed by lane and x-sorted — the shape both text passes below need, since
  // each asks "what is my neighbour in this lane, and how much room does it leave?". Built ONCE and
  // lazily: with the labels and dates layers both on, this was the same O(v log v) bucket-and-sort
  // done twice per frame over the same data, which is the second-largest cost in the pass after
  // `measureText`. A paint with both layers off never calls it.
  let laneRowsCache: Map<number, LaneRow[]> | null = null;
  const laneRows = (): ReadonlyMap<number, LaneRow[]> => {
    if (laneRowsCache) return laneRowsCache;
    const lanes = new Map<number, LaneRow[]>();
    for (const [id, rect] of rects()) {
      const activity = byId.get(id)!;
      const row = lanes.get(activity.laneIndex);
      if (row) row.push({ activity, rect });
      else lanes.set(activity.laneIndex, [{ activity, rect }]);
    }
    for (const row of lanes.values()) row.sort((a, b) => a.rect.x - b.rect.x);
    laneRowsCache = lanes;
    return lanes;
  };

  return {
    ctx,
    view,
    size,
    toggles,
    byId,
    visibleIds,
    rectCache,
    firstDay,
    lastDay,
    bounds,
    rects,
    laneRows,
  };
}
