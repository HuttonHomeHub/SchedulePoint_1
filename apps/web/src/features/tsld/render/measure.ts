/**
 * A tiny width memo for canvas label text (ADR-0026 D1 — "cache measured metrics"). Keyed by the
 * string alone, which is correct **only while the font is constant** — the painter guarantees this
 * by setting the fixed `LABEL_FONT` before measuring, so a given string always has one width. This
 * keeps `measureText` — the dominant per-frame text cost — to at most once per unique label across
 * the whole session, well inside the draw budget. Kept out of the pure `render-model.ts` (it holds
 * mutable state); the painter owns one instance across frames.
 */
export interface MeasureCache {
  /**
   * Memoised width of `text`; measures on first sight only. Keyed by the text alone under the fixed
   * `LABEL_FONT`, and by (font, text) when `font` is given: NetPoint grammar M4 prints milestone
   * names bold (spec §4.13 A6), and a bold string keyed by its text alone would return the regular
   * width for the same string, or poison the regular entry with the bold one.
   */
  measure(text: string, measureText: (s: string) => number, font?: string): number;
  /** Number of distinct strings cached (bounded by the plan's label count). */
  readonly size: number;
  /**
   * Drop every entry. Exists for exactly one caller: the font-load bust in
   * `layers/text-measure.ts` (#173) — a width measured in the fallback face before the product's
   * own woff2 arrived is wrong for the rest of the session, and the memo cannot see fonts.
   */
  clear(): void;
}

export function createMeasureCache(): MeasureCache {
  const cache = new Map<string, number>();
  return {
    measure(text, measureText, font) {
      const key = font === undefined ? text : `${font}\u0000${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const width = measureText(text);
      cache.set(key, width);
      return width;
    },
    get size() {
      return cache.size;
    },
    clear() {
      cache.clear();
    },
  };
}
