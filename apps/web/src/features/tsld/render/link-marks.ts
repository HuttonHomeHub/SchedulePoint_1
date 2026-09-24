import type { DependencyType } from '@repo/types';

import type { Point, RenderActivity } from './geometry';

/**
 * **The link language** (NetPoint-layout M2, spec §4.7, ADR-0154).
 *
 * The pure half of the link layer: which ink a link takes, where its waiting time is, where the
 * direction chevrons go and where the lag plate sits. The painter only strokes what these return,
 * so every rule here can be asserted without a canvas.
 */

/** A driving link's criticality rung. */
export type LinkRung = 'critical' | 'near' | 'normal';

/**
 * The rung a **driving** link is drawn in. It is critical only when both ends are critical, and
 * near-critical when both are at least near-critical. A link between a critical and an ordinary
 * activity is not on the critical path, whatever its predecessor is, so it takes the ordinary ink.
 *
 * Criticality is never carried by this colour alone (WCAG 1.4.1): the endpoints' node shapes and
 * the Tier-2 logic summary say it too.
 */
export function linkRung(
  pred: Pick<RenderActivity, 'isCritical' | 'isNearCritical'>,
  succ: Pick<RenderActivity, 'isCritical' | 'isNearCritical'>,
): LinkRung {
  if (pred.isCritical && succ.isCritical) return 'critical';
  const atLeastNear = (a: typeof pred): boolean => a.isCritical || a.isNearCritical === true;
  return atLeastNear(pred) && atLeastNear(succ) ? 'near' : 'normal';
}

/**
 * The span of a relationship's **waiting time** on screen: from the earliest point the relationship
 * would allow to where the successor's constrained end is actually drawn. Its length in days is
 * `edgeGapDays` exactly (`geometry.ts`) for every type, which keeps the dash and the spoken slack one
 * number. Null when there is no waiting, including a lead that overlaps.
 *
 * It is read off the endpoints' already-computed rects rather than re-derived from their dates. The painter needs this per link per frame, and re-parsing four dates
 * per link is exactly what the frame's rect cache exists to prevent (`paint.rect-cache-budget`
 * pins that adding links adds no date parsing).
 *
 * For a bar the two agree to the pixel: a rect's edges ARE `screenXOfDay` of its start and its
 * finish's right edge. A milestone's diamond is a few pixels wider than its day, so there the
 * waiting run ends at the glyph the line actually meets, which is the honest place for it.
 */
export function waitingSpanX(args: {
  type: DependencyType;
  pred: { x: number; w: number };
  succ: { x: number; w: number };
  lagPx: number;
}): { x0: number; x1: number } | null {
  const { type, pred, succ, lagPx } = args;
  const x0 = (type === 'FS' || type === 'FF' ? pred.x + pred.w : pred.x) + lagPx;
  const x1 = type === 'FS' || type === 'SS' ? succ.x : succ.x + succ.w;
  return x1 > x0 ? { x0, x1 } : null;
}

/**
 * A polyline cut into the runs that lie inside `[x0, x1]` (waiting) and the runs that do not.
 *
 * A horizontal segment is clipped at the two boundaries. A vertical segment is waiting when its x
 * lies strictly inside the interval, and solid otherwise, so a corridor on a boundary stays solid.
 * Runs keep the line's direction and are returned in order along it. Consecutive runs share their
 * boundary point, which is what lets a recorder stitch them back into one link.
 */
export function splitRunsByX(
  line: readonly Point[],
  x0: number,
  x1: number,
): { solid: Point[][]; waiting: Point[][] } {
  const solid: Point[][] = [];
  const waiting: Point[][] = [];
  let run: Point[] = [];
  let runWaiting: boolean | null = null;
  const inside = (x: number): boolean => x > x0 && x < x1;
  const push = (p: Point, isWaiting: boolean): void => {
    if (runWaiting !== isWaiting) {
      if (run.length >= 2) (runWaiting ? waiting : solid).push(run);
      const last = run[run.length - 1];
      run = last ? [last] : [];
      runWaiting = isWaiting;
    }
    const tail = run[run.length - 1];
    if (!tail || tail.x !== p.x || tail.y !== p.y) run.push(p);
  };
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (run.length === 0) run = [{ x: a.x, y: a.y }];
    if (a.x === b.x) {
      push({ x: b.x, y: b.y }, inside(a.x));
      continue;
    }
    // A horizontal (or, defensively, any sloped) segment: cut at each boundary it crosses, in the
    // direction of travel, and classify each piece by its midpoint.
    const cuts = [x0, x1]
      .filter((c) => (c - a.x) * (c - b.x) < 0)
      .sort((p, q) => (b.x > a.x ? p - q : q - p));
    const t = (x: number): Point => {
      const k = (x - a.x) / (b.x - a.x);
      return { x, y: a.y + k * (b.y - a.y) };
    };
    let from = a;
    for (const c of [...cuts.map(t), { x: b.x, y: b.y }]) {
      push(c, inside((from.x + c.x) / 2));
      from = c;
    }
  }
  if (run.length >= 2 && runWaiting !== null) (runWaiting ? waiting : solid).push(run);
  return { solid, waiting };
}

/**
 * The distance between direction chevrons along a link, and the most one link may carry.
 *
 * **40 px, the reference's own rhythm** (NetPoint grammar M3, spec §4.2 G5: about every 41 px on the
 * product owner's picture, `reference-observations.md`). It was 56. A reader following a long link
 * should meet a mark before losing the direction, and the reference's spacing is the one the product
 * owner chose to copy.
 *
 * **The cap stays at six.** G5 raises it only if FC-G7's paint reading allows, and ADR-0154 D4 bounds
 * the layer by it (M0-T4 P3: at most six marks per visible link at the overview tier). At 40 px the
 * cap binds at 280 px of path rather than 392, so on a longer link the six marks are spread evenly
 * along it instead of bunching in its first stretch and leaving the rest bare (`chevronsAlong`).
 */
export const CHEVRON_SPACING_PX = 40;
export const CHEVRON_MAX_PER_LINK = 6;
/**
 * A chevron's length along the line and its half-width across it. Half the routed arrowhead's
 * size (`ARROWHEAD_ROUTED_PX` 8, half-width 3), so a chevron reads as "this way" and never as a
 * second terminal head.
 */
export const CHEVRON_LEN_PX = 4;
export const CHEVRON_HALF_W_PX = 2.5;

/**
 * The filled direction chevrons along a link: one every {@link CHEVRON_SPACING_PX} of path, at
 * most {@link CHEVRON_MAX_PER_LINK} (spread evenly along a link long enough for the cap to bind),
 * none within half a step of either end (the start sits on a node glyph and the end already has the
 * arrowhead).
 *
 * The cap is what bounds the layer at Fit on a plan of thousands of links: the cost is at most six
 * triangles per visible link, whatever the zoom.
 */
export function chevronsAlong(line: readonly Point[]): [Point, Point, Point][] {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  }
  const out: [Point, Point, Point][] = [];
  if (total < CHEVRON_SPACING_PX * 2) return out;
  // Where the cap would bind, widen the step so the capped marks span the whole link.
  const step = Math.max(CHEVRON_SPACING_PX, total / (CHEVRON_MAX_PER_LINK + 1));
  let next = step;
  let walked = 0;
  for (let i = 1; i < line.length && out.length < CHEVRON_MAX_PER_LINK; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    while (next <= walked + len && out.length < CHEVRON_MAX_PER_LINK) {
      if (next > total - step / 2) return out;
      const d = next - walked;
      // Keep a chevron clear of a corner so its barbs never straddle two segments.
      if (d >= CHEVRON_LEN_PX) {
        const tip = { x: a.x + ux * d, y: a.y + uy * d };
        const baseX = tip.x - ux * CHEVRON_LEN_PX;
        const baseY = tip.y - uy * CHEVRON_LEN_PX;
        out.push([
          tip,
          { x: baseX - uy * CHEVRON_HALF_W_PX, y: baseY + ux * CHEVRON_HALF_W_PX },
          { x: baseX + uy * CHEVRON_HALF_W_PX, y: baseY - ux * CHEVRON_HALF_W_PX },
        ]);
      }
      next += step;
    }
    walked += len;
  }
  return out;
}

/** A lag as a planner writes it: `+2d`, `−1d` (a true minus sign, not a hyphen). */
export function formatLag(lagDays: number): string {
  return lagDays < 0 ? `−${-lagDays}d` : `+${lagDays}d`;
}

/**
 * Where a link's lag plate is centred: the midpoint of its longest horizontal segment when that is
 * long enough to hold the plate, otherwise its longest vertical one, otherwise nowhere.
 *
 * Only the link's own segments are candidates, so the plate can only ever sit on the line it
 * labels, never on a bar.
 */
export function lagPlateAt(line: readonly Point[], plateW: number, plateH: number): Point | null {
  let bestH: { len: number; at: Point } | null = null;
  let bestV: { len: number; at: Point } | null = null;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (a.y === b.y) {
      const len = Math.abs(b.x - a.x);
      if (!bestH || len > bestH.len) bestH = { len, at };
    } else if (a.x === b.x) {
      const len = Math.abs(b.y - a.y);
      if (!bestV || len > bestV.len) bestV = { len, at };
    }
  }
  if (bestH && bestH.len >= plateW + 4) return bestH.at;
  if (bestV && bestV.len >= plateH + 4) return bestV.at;
  return null;
}
