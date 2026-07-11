import {
  activityRect,
  cull,
  daysBetween,
  dependencyPolyline,
  isMilestone,
  screenXOfDay,
  MILESTONE_RADIUS,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from './render-model';

/**
 * The palette the painter draws with — resolved from the app's semantic design tokens
 * (ADR-0006) so the canvas is theme-aware without hardcoding colour. All values are CSS
 * colour strings.
 */
export interface TsldPalette {
  gridLine: string;
  edge: string;
  bar: string;
  critical: string;
  nearCritical: string;
  /** Foreground-contrast stroke outlining critical/near-critical bars (non-colour cue). */
  outline: string;
  selection: string;
}

export interface TsldScene {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  /** The currently-selected activity id (drawn with a selection ring), if any. */
  selectedId?: string | null;
}

/** The minimal 2D-context surface the painter uses (kept small so it is easy to mock/test). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'setTransform'
  | 'setLineDash'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
};

function barColour(activity: RenderActivity, palette: TsldPalette): string {
  if (activity.isCritical) return palette.critical;
  if (activity.isNearCritical) return palette.nearCritical;
  return palette.bar;
}

/**
 * The dash pattern that encodes criticality without relying on colour (WCAG 1.4.1):
 * a solid outline for critical, a dashed outline for near-critical, and `null` (no
 * outline) otherwise. Paired with the fill colour and the panel's visible legend.
 */
function criticalDash(activity: RenderActivity): number[] | null {
  if (activity.isCritical) return [];
  if (activity.isNearCritical) return [3, 2];
  return null;
}

function drawPolyline(ctx: Ctx2D, points: Point[]): void {
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
}

/**
 * Paint one frame of the TSLD onto `ctx` from the pure render model (ADR-0026). The
 * order is grid → dependency edges → activity bars/milestones → selection ring, so
 * later layers sit on top. Only the culled (visible) activities are drawn, and edges
 * only when an endpoint is visible, so the cost is bounded by the viewport, not the
 * plan size. `dpr` scales the backing store; drawing is authored in CSS px.
 *
 * Returns the culled activity ids (the painter already computed them) so the caller can
 * reuse the set for hit-testing / the minimap without a second cull pass.
 */
export function paintScene(
  ctx: Ctx2D,
  scene: TsldScene,
  view: Viewport,
  size: Size,
  palette: TsldPalette,
  dpr = 1,
): string[] {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const visibleIds = new Set(cull(scene.activities, view, size, scene.dataDate));

  // Layer 1: weekly time-axis gridlines (cheap; the ruler labels are DOM chrome).
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const firstDay = Math.floor((0 - view.originX) / view.pxPerDay);
  const lastDay = Math.ceil((size.width - view.originX) / view.pxPerDay);
  for (let d = firstDay - (((firstDay % 7) + 7) % 7); d <= lastDay; d += 7) {
    const x = Math.round(screenXOfDay(d, view)) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.height);
  }
  ctx.stroke();

  // Layer 2: dependency edges (only when an endpoint is visible).
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const edge of scene.edges) {
    if (!visibleIds.has(edge.predecessorId) && !visibleIds.has(edge.successorId)) continue;
    const pred = byId.get(edge.predecessorId);
    const succ = byId.get(edge.successorId);
    if (!pred || !succ) continue;
    const line = dependencyPolyline(pred, succ, view, scene.dataDate);
    if (line) drawPolyline(ctx, line);
  }
  ctx.stroke();

  // Layer 3: activity bars + milestone diamonds. Critical/near-critical activities also
  // get a solid/dashed outline (a non-colour cue for criticality — WCAG 1.4.1).
  for (const id of visibleIds) {
    const activity = byId.get(id)!;
    const rect = activityRect(activity, view, scene.dataDate);
    if (!rect) continue;
    const dash = criticalDash(activity);
    ctx.fillStyle = barColour(activity, palette);
    if (isMilestone(activity.type)) {
      // A diamond centred in the bounding box.
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - MILESTONE_RADIUS);
      ctx.lineTo(cx + MILESTONE_RADIUS, cy);
      ctx.lineTo(cx, cy + MILESTONE_RADIUS);
      ctx.lineTo(cx - MILESTONE_RADIUS, cy);
      ctx.fill();
      if (dash) {
        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (dash) {
        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(dash);
        ctx.strokeRect(rect.x + 0.75, rect.y + 0.75, rect.w - 1.5, rect.h - 1.5);
        ctx.setLineDash([]);
      }
    }
  }

  // Layer 4: the selection ring on the selected activity (if visible).
  if (scene.selectedId && visibleIds.has(scene.selectedId)) {
    const selected = byId.get(scene.selectedId);
    const rect = selected && activityRect(selected, view, scene.dataDate);
    if (rect) {
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
    }
  }

  return [...visibleIds];
}

/**
 * Paint the interaction (top) canvas layer for an in-progress edit (ADR-0026 D1/D4, M2):
 * the **live** ghost (the bar being drawn/moved, solid fill + a selection outline) and/or a
 * **pending** ghost (a dropped edit awaiting the authoritative recalc, a dashed outline that
 * reads as "saving"). Both are plain screen rects the caller computed from the gesture; this
 * layer never touches the base layer, so a gesture repaints only this cheap surface. Passing
 * two `null`s clears it (gesture ended).
 */
export function paintInteractionLayer(
  ctx: Ctx2D,
  live: Rect | null,
  pending: Rect | null,
  size: Size,
  palette: TsldPalette,
  dpr = 1,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  if (pending) {
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(pending.x + 0.5, pending.y + 0.5, pending.w - 1, pending.h - 1);
    ctx.setLineDash([]);
  }

  if (live) {
    ctx.fillStyle = palette.bar;
    ctx.fillRect(live.x, live.y, live.w, live.h);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(live.x + 0.5, live.y + 0.5, live.w - 1, live.h - 1);
  }
}

/** The inclusive [minDay, maxDay] world-day extent of the computed activities (for the ruler/minimap). */
export function dayExtent(
  activities: readonly RenderActivity[],
  dataDate: string,
): { minDay: number; maxDay: number } | null {
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const a of activities) {
    if (a.earlyStart === null) continue;
    const start = daysBetween(dataDate, a.earlyStart);
    const finish = a.earlyFinish === null ? start : daysBetween(dataDate, a.earlyFinish);
    minDay = Math.min(minDay, start);
    maxDay = Math.max(maxDay, finish + 1);
  }
  return Number.isFinite(minDay) ? { minDay, maxDay } : null;
}
