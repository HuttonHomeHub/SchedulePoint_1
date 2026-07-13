/**
 * A tiny width memo for canvas label text (ADR-0026 D1 — "cache measured metrics"). Keyed by the
 * string alone, which is correct **only while the font is constant** — the painter guarantees this
 * by setting the fixed `LABEL_FONT` before measuring, so a given string always has one width. This
 * keeps `measureText` — the dominant per-frame text cost — to at most once per unique label across
 * the whole session, well inside the draw budget. Kept out of the pure `render-model.ts` (it holds
 * mutable state); the painter owns one instance across frames.
 */
export interface MeasureCache {
  /** Memoised width of `text` under the caller's (fixed) font; measures on first sight only. */
  measure(text: string, measureText: (s: string) => number): number;
  /** Number of distinct strings cached (bounded by the plan's label count). */
  readonly size: number;
}

export function createMeasureCache(): MeasureCache {
  const cache = new Map<string, number>();
  return {
    measure(text, measureText) {
      const hit = cache.get(text);
      if (hit !== undefined) return hit;
      const width = measureText(text);
      cache.set(text, width);
      return width;
    },
    get size() {
      return cache.size;
    },
  };
}
