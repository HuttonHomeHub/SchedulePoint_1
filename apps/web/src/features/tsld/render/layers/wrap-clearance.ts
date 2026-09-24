import type { Point } from '../geometry';

/**
 * **Where a wrapped name's first line may go** (NetPoint grammar M4-T2, spec §4.2 G7 and §4.13 A4).
 * The first line sits in the pad above the name row, and it is drawn only where its box meets no
 * routed link segment. The segments are bucketed by lane once per frame, lazily, on the first name
 * that would truncate, so a frame whose names all fit builds nothing and tests nothing (FC-G7's
 * wrap-candidate bound). Extracted from `paint.ts` at the M6 gate pass so that bound can be counted:
 * it was stated in a comment and asserted nowhere.
 *
 * The lane above is tested as well as the name's own, because the box is inflated by `padY` (half a
 * gap-label chip), and a gap label or lag plate on a gutter leg reaches that far either side of it.
 */
export interface WrapClearance {
  /** True where a first line of width `w`, centred at (`cx`, `y`) with line height `lineH`, meets no routed segment. */
  clear(lane: number, cx: number, w: number, y: number, lineH: number): boolean;
  /** How many times the segment index was built (at most once) and how many segments were tested. */
  readonly stats: { builds: number; tests: number };
}

export function createWrapClearance(
  lines: () => Iterable<readonly Point[]>,
  laneOfY: (y: number) => number,
  padY: number,
): WrapClearance {
  const stats = { builds: 0, tests: 0 };
  let byLane: Map<number, [Point, Point][]> | null = null;
  const near = (lane: number): readonly [Point, Point][] => {
    if (byLane === null) {
      stats.builds += 1;
      byLane = new Map();
      for (const line of lines()) {
        for (let k = 1; k < line.length; k += 1) {
          const a = line[k - 1]!;
          const b = line[k]!;
          for (let l = laneOfY(Math.min(a.y, b.y)); l <= laneOfY(Math.max(a.y, b.y)); l += 1) {
            const bucket = byLane.get(l);
            if (bucket) bucket.push([a, b]);
            else byLane.set(l, [[a, b]]);
          }
        }
      }
    }
    return byLane.get(lane) ?? [];
  };
  return {
    stats,
    clear(lane, cx, w, y, lineH) {
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      const y0 = y - lineH / 2 - padY;
      const y1 = y + lineH / 2 + padY;
      for (const l of [lane - 1, lane]) {
        for (const [a, b] of near(l)) {
          stats.tests += 1;
          if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) continue;
          if (Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) continue;
          return false;
        }
      }
      return true;
    },
  };
}
