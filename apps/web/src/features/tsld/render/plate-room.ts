import { freePlatePosition, lagPlateCandidates } from './link-marks';
import {
  activityRect,
  barGlyphKind,
  NODE_REACH_PX,
  type Point,
  type Rect,
  type RectCache,
  type RenderActivity,
  type Viewport,
} from './render-model';

/** Height (px) of the relationship-slack chip — the lag/cursor chip treatment, one size smaller. */
export const SLACK_CHIP_H = 13;

/**
 * A text row's box is its line height, leading included; a plate on a lane's centre line grazes the
 * rows either side by 1.5 px of leading and none of the ink, so only a real overlap counts.
 */
export const PLATE_GRAZE_PX = 2;

/**
 * Every visible activity's glyph box, as a plate must keep off it: a task bar widened by its two
 * nodes, other glyphs as drawn. One derivation for the painter, which places the plates, and the
 * router, which scores whether a line leaves room for one (links-and-labels M2, spec D-5).
 */
export function plateGlyphBoxes(
  activities: readonly RenderActivity[],
  visibleIds: ReadonlySet<string>,
  view: Viewport,
  dataDate: string,
  rectCache: RectCache,
): Rect[] {
  const boxes: Rect[] = [];
  for (const a of activities) {
    if (!visibleIds.has(a.id)) continue;
    const r = activityRect(a, view, dataDate, rectCache);
    if (!r) continue;
    const reach = barGlyphKind(a.type) === 'bar' ? NODE_REACH_PX : 0;
    boxes.push({ x: r.x - reach, y: r.y - reach, w: r.w + 2 * reach, h: r.h + 2 * reach });
  }
  return boxes;
}

/** Whether a line leaves room for its lag plate, against the row text and the glyphs. */
export interface PlateRoom {
  hasRoom(line: readonly Point[], plateW: number): boolean;
}

/** The height of one bucket of {@link plateRoom}'s index: a plate spans at most two. */
const BUCKET_PX = 16;

/**
 * **The plate sub-term's question** (links-and-labels M2, spec D-5): does `freePlatePosition` — the
 * painter's own function — find a free position on this line, against the row text's LINE boxes and
 * the glyph boxes? It ignores other plates, which depend on routes still being chosen, so it can
 * report room a plate placed earlier then takes, and never the reverse (spec §4.3, "honest limits").
 *
 * The boxes are bucketed by y, so each candidate position is tested only against the rows it can
 * meet. Asked only for a lagged link at the detail tier, where plates are drawn.
 */
export function plateRoom(text: readonly Rect[], glyphs: readonly Rect[]): PlateRoom {
  const bucketsOf = (boxes: readonly Rect[]): Map<number, Rect[]> => {
    const out = new Map<number, Rect[]>();
    for (const box of boxes) {
      const lo = Math.floor(box.y / BUCKET_PX);
      const hi = Math.floor((box.y + box.h) / BUCKET_PX);
      for (let k = lo; k <= hi; k += 1) {
        const list = out.get(k);
        if (list) list.push(box);
        else out.set(k, [box]);
      }
    }
    return out;
  };
  const textBuckets = bucketsOf(text);
  const glyphBuckets = bucketsOf(glyphs);
  const near = (buckets: Map<number, Rect[]>, y0: number, y1: number): Rect[] => {
    const lo = Math.floor(y0 / BUCKET_PX);
    const hi = Math.floor(y1 / BUCKET_PX);
    if (lo === hi) return buckets.get(lo) ?? [];
    const out: Rect[] = [];
    for (let k = lo; k <= hi; k += 1) out.push(...(buckets.get(k) ?? []));
    return out;
  };
  return {
    hasRoom(line, plateW) {
      for (const at of lagPlateCandidates(line, plateW, SLACK_CHIP_H)) {
        const y0 = at.y - SLACK_CHIP_H / 2;
        const y1 = at.y + SLACK_CHIP_H / 2;
        const free = freePlatePosition(
          [at],
          plateW,
          SLACK_CHIP_H,
          near(textBuckets, y0, y1),
          near(glyphBuckets, y0, y1),
          PLATE_GRAZE_PX,
        );
        if (free) return true;
      }
      return false;
    },
  };
}
