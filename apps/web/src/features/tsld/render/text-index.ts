import type { PlacedText, TextBox } from './row-text-layout';

/**
 * **Where the row's text is, for a line to avoid** (links-and-labels M1-T3, spec §4.3).
 *
 * The text layout's ink boxes grouped by lane, in the glyph index's shape (`link-score.ts`
 * `GlyphLane`): each lane's boxes sorted by left edge, with the widest box's width kept so a query
 * can binary-search to the first box that could still reach it (`link-score.ts` `textCrossings`). A box is not merged with its
 * neighbours, because a line meeting two names meets two texts. M1 builds it; M2's router reads it.
 */
export interface TextLane {
  /** Ink boxes, sorted by `x` then by width. */
  readonly boxes: readonly TextBox[];
  /** The widest box in the lane: the binary-search bound, as `GlyphLane.maxLen`. */
  readonly maxW: number;
}

export type TextIndex = ReadonlyMap<number, TextLane>;

export function textIndexOf(items: readonly PlacedText[]): TextIndex {
  const byLane = new Map<number, TextBox[]>();
  for (const item of items) {
    const list = byLane.get(item.lane) ?? [];
    list.push(item.ink);
    byLane.set(item.lane, list);
  }
  const index = new Map<number, TextLane>();
  for (const [lane, boxes] of byLane) {
    boxes.sort((p, q) => p.x - q.x || p.w - q.w);
    let maxW = 0;
    for (const b of boxes) if (b.w > maxW) maxW = b.w;
    index.set(lane, { boxes, maxW });
  }
  return index;
}

/**
 * The index of the first box in `lane` whose right edge could reach `x` or beyond: the first whose
 * left edge is at least `x - maxW`. Every earlier box ends before `x`, so a scan from here counts
 * exactly what a scan from zero counts.
 */
export function firstTextReaching(lane: TextLane, x: number): number {
  const target = x - lane.maxW;
  let lo = 0;
  let hi = lane.boxes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lane.boxes[mid]!.x < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
