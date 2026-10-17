/**
 * **The one shape both per-lane indexes share** (TECH_DEBT #395 item 6): bucket entries by lane,
 * sort each bucket by its left edge, keep the widest extent, and binary-search to the first entry
 * that can still reach a given x.
 *
 * The glyph index (`link-score.ts`) and the text index (`text-index.ts`) each copied this and said
 * so in a docblock. Internal to the render layer: each index keeps its own public shape (`spans` and
 * `maxLen`, `boxes` and `maxW`), and passes `make` to build it, so no caller sees this module.
 */

/** Bucket `entries` by lane, sort each bucket with `order`, and build one lane with `make`. */
export function indexByLane<T, L>(
  entries: Iterable<readonly [lane: number, item: T]>,
  order: (p: T, q: T) => number,
  extent: (item: T) => number,
  make: (sorted: T[], widest: number) => L,
): Map<number, L> {
  const byLane = new Map<number, T[]>();
  for (const [lane, item] of entries) {
    const list = byLane.get(lane);
    if (list) list.push(item);
    else byLane.set(lane, [item]);
  }
  const index = new Map<number, L>();
  for (const [lane, items] of byLane) {
    items.sort(order);
    let widest = 0;
    for (const item of items) widest = Math.max(widest, extent(item));
    index.set(lane, make(items, widest));
  }
  return index;
}

/**
 * The index of the first of `sorted` whose left edge is at least `x - widest`. Every earlier entry
 * ends before `x`, so a scan from here counts exactly what a scan from zero counts.
 */
export function firstReaching<T>(
  sorted: readonly T[],
  widest: number,
  x: number,
  left: (item: T) => number,
): number {
  const target = x - widest;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (left(sorted[mid]!) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
