import type { Ctx2D } from '../ctx-2d';
import { elbowRadius, type Point, type Rect } from '../render-model';

/**
 * Path tracings shared by two or more canvas layers (ADR-0078 S2).
 *
 * Moved out of `paint.ts` verbatim, comments included — ADR-0078 §3 forbids rewording during a
 * move, because these comments record which defect each guard exists for. `paint.ts` re-exports
 * nothing here: it imports them, which is what makes this a leaf module rather than a second
 * source of truth. The `Ctx2D` import goes to `../ctx-2d` for the same ordering reason (§3a).
 *
 * The recurring shape is the optional-method guard — `roundRect` and `arcTo` are absent from
 * older browsers and from every minimal test context, so each tracing degrades to a square or a
 * hard corner rather than throwing. That is why `beginRoundedRect` returns a boolean instead of
 * drawing: the caller has to choose its own fallback.
 */

/**
 * Begin a rounded-rect path when the context supports `roundRect` (ADR-0052 M4). Returns whether
 * the path was begun — callers fall back to the square `fillRect`/`strokeRect` when not, so the
 * refresh degrades gracefully on contexts without it (older browsers / minimal test mocks).
 */
export function beginRoundedRect(ctx: Ctx2D, r: Rect, radius: number): boolean {
  if (typeof ctx.roundRect !== 'function') return false;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  return true;
}

export function drawPolyline(ctx: Ctx2D, points: Point[]): void {
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
}

/**
 * Trace a polyline with small rounded elbows (ADR-0052 M5): each interior corner arcs with the
 * pure {@link elbowRadius} (clamped to half its adjoining segments; 0 = a hard corner) via the
 * optional `arcTo` — degrading to the plain hard-cornered {@link drawPolyline} on contexts
 * without it (older browsers / minimal test mocks), like the M4 `roundRect` guard. Rect/line/arc
 * primitives only; called only on the refreshed (flag-on) path.
 */
export function drawRoundedPolyline(ctx: Ctx2D, points: Point[]): void {
  if (points.length < 3 || typeof ctx.arcTo !== 'function') {
    drawPolyline(ctx, points);
    return;
  }
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const radius = elbowRadius(points[i - 1]!, points[i]!, points[i + 1]!);
    if (radius > 0)
      ctx.arcTo(points[i]!.x, points[i]!.y, points[i + 1]!.x, points[i + 1]!.y, radius);
    else ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.lineTo(points[points.length - 1]!.x, points[points.length - 1]!.y);
}

/**
 * Begin the 4-vertex milestone diamond path centred on (`cx`, `cy`) — the ONE tracing shared by
 * the refreshed bar, the baseline ghost, and the legacy bar layer, so the three can never drift.
 * Left open by default (a `fill` closes it implicitly); `close` traces the final segment back to
 * the top vertex for stroke-only callers (the Ctx2D surface has no closePath).
 */
export function traceMilestoneDiamond(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  close = false,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  if (close) ctx.lineTo(cx, cy - r);
}
