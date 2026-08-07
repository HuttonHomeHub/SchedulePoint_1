/**
 * The minimal 2D-context surface every painter in `render/` draws through (ADR-0078 S2).
 *
 * Its own module rather than a type inside `paint.ts`, for the ordering reason ADR-0078 §3a
 * records: `layers/shapes.ts` needs it, `paint.ts` re-exports `shapes.ts`, and a module cannot be
 * lifted while it depends on something re-exported around it. Everything here is a type, so the
 * emitted bundle is unchanged; `paint.ts` still exports `Ctx2D`, which is why the two existing
 * consumers (`test-support/recording-ctx.ts`, `paint.routing-budget.test.ts`) are untouched.
 */
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
  | 'fillText'
  | 'measureText'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  /** Global opacity multiplier (0–1). Used to dim filter non-matches without a second fill colour. */
  globalAlpha: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  /** Optional (Baseline 2023; absent from older/test contexts): the refreshed bar shape rounds its
   * corners with it when present and falls back to square rects when not — guarded like the
   * text APIs (`paintResourceStrip`'s label), so a minimal test context never throws. */
  roundRect?: (x: number, y: number, w: number, h: number, radii: number) => void;
  /** Optional like `roundRect`: the refreshed link routing rounds its elbows with it when present
   * (ADR-0052 M5) and falls back to hard `lineTo` corners when not — an arc, not a shadow/blur,
   * so the draw budget holds; a minimal test context never throws. */
  arcTo?: (x1: number, y1: number, x2: number, y2: number, radius: number) => void;
  /** Optional like `roundRect`/`arcTo`: builds a repeating fill pattern from an offscreen tile —
   * used only for the non-working hatch (F7a, `VITE_CANVAS_TIME_AXIS`). Absent ⇒ the flat-fill
   * fallback, which is also the path every existing painter unit suite exercises (jsdom serves no
   * `canvas` package, so the offscreen tile itself never builds). */
  createPattern?: (image: CanvasImageSource, repetition: string | null) => CanvasPattern | null;
};
