import type { Point, Rect, RenderActivity } from './geometry';
import { rectsIntersect } from './geometry';

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

/**
 * Where a link's GAP label may be centred (NetPoint grammar M3-T3), in order of preference: on each
 * stretch of the route's horizontal segments that lies inside the waiting interval `[x0, x1]` and is
 * at least `minPx` long, longest first, the midpoint first and then the quarter and eighth points of
 * the room left once the label is inside the stretch. Empty when no stretch is long enough, and the
 * label is withheld.
 *
 * The first candidate is the midpoint of the longest stretch, which is where the label always went.
 * The rest exist because two waiting links can share one run (a gutter), and then both labels want
 * the same midpoint: before, the second was withheld and nothing on screen said a second
 * relationship waited there (links-and-labels M4 review, the UX finding on Unit 300). The rule is
 * the lag plate's (`lagPlateCandidates`), less its vertical runs.
 *
 * Only horizontal segments are candidates, because the waiting interval is a span of time and only a
 * horizontal run of a time-scaled diagram measures time. Only the link's own segments, so the label
 * can only ever sit on the line it labels.
 */
export function gapLabelCandidates(
  line: readonly Point[],
  x0: number,
  x1: number,
  minPx: number,
): Point[] {
  const runs: { lo: number; len: number; y: number }[] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (a.y !== b.y) continue;
    const lo = Math.max(Math.min(a.x, b.x), x0);
    const len = Math.min(Math.max(a.x, b.x), x1) - lo;
    if (len >= minPx) runs.push({ lo, len, y: a.y });
  }
  // Stable: equal stretches keep line order, so the first candidate is the one gapLabelAt chose.
  runs.sort((p, q) => q.len - p.len);
  const out: Point[] = [];
  for (const { lo, len, y } of runs) {
    // The label stays inside the stretch: its centre ranges over the room less half a label each end.
    const room = len - minPx;
    for (const t of GAP_LABEL_STOPS) out.push({ x: lo + minPx / 2 + room * t, y });
  }
  return out;
}

const GAP_LABEL_STOPS = [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875] as const;

/** The first of `gapLabelCandidates`: where the label goes when nothing is in the way. */
export function gapLabelAt(
  line: readonly Point[],
  x0: number,
  x1: number,
  minPx: number,
): Point | null {
  return gapLabelCandidates(line, x0, x1, minPx)[0] ?? null;
}

/** A lag as a planner writes it: `+2d`, `−1d` (a true minus sign, not a hyphen). */
export function formatLag(lagDays: number): string {
  return lagDays < 0 ? `−${-lagDays}d` : `+${lagDays}d`;
}

/**
 * Where a link's lag plate may be centred, in order of preference: the midpoint of each horizontal
 * segment long enough to hold the plate, longest first, then each such vertical one, and on each
 * segment the midpoint first, then its quarter and eighth points. The first is where the plate goes when nothing
 * is in the way; the rest are where it moves to when a name or date is (node-to-node links M3).
 *
 * Only the link's own segments are candidates, so the plate can only ever sit on the line it
 * labels, never on a bar.
 */
export function lagPlateCandidates(
  line: readonly Point[],
  plateW: number,
  plateH: number,
): Point[] {
  const runs: { horizontal: boolean; len: number; a: Point; b: Point }[] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (a.y === b.y) {
      const len = Math.abs(b.x - a.x);
      if (len >= plateW + 4) runs.push({ horizontal: true, len, a, b });
    } else if (a.x === b.x) {
      const len = Math.abs(b.y - a.y);
      if (len >= plateH + 4) runs.push({ horizontal: false, len, a, b });
    }
  }
  // Stable: equal runs keep line order, so the first candidate is the one lagPlateAt always chose.
  runs.sort((p, q) => Number(q.horizontal) - Number(p.horizontal) || q.len - p.len);
  const out: Point[] = [];
  for (const { a, b } of runs) {
    for (const t of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875])
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/**
 * The first of `candidates` whose plate box is free: its box, inset by `grazePx`, meets no text box,
 * and its full box meets no glyph box. Null when every position is taken, and the plate is withheld.
 * The inset exists because a text row's box is its line height, leading included, and a plate on a
 * lane's centre line grazes the rows either side by 1.5 px of leading and none of the ink.
 */
export function freePlatePosition(
  candidates: readonly Point[],
  plateW: number,
  plateH: number,
  text: readonly Rect[],
  glyphs: readonly Rect[],
  grazePx: number,
): Point | null {
  for (const at of candidates) {
    const box = { x: at.x - plateW / 2, y: at.y - plateH / 2, w: plateW, h: plateH };
    const inner = {
      x: box.x + grazePx,
      y: box.y + grazePx,
      w: box.w - 2 * grazePx,
      h: box.h - 2 * grazePx,
    };
    if (text.some((r) => rectsIntersect(r, inner)) || glyphs.some((r) => rectsIntersect(r, box))) {
      continue;
    }
    return at;
  }
  return null;
}

/** Where a link's lag plate is centred when nothing is in the way: the first candidate. */
export function lagPlateAt(line: readonly Point[], plateW: number, plateH: number): Point | null {
  return lagPlateCandidates(line, plateW, plateH)[0] ?? null;
}
