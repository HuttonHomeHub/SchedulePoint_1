import { vi } from 'vitest';

import type { Ctx2D } from '../ctx-2d';

/**
 * A recording context that reports the **vertical extent of every mark the painter puts down**
 * (logic-legibility M3-T1, FC-6).
 *
 * `recording-ctx.ts` answers *"did these two paints do the same thing?"* by comparing an ordered
 * log of calls and assignments. This answers a different question — *"how tall is what was
 * drawn, and where does it sit?"* — which the string log structurally cannot, because the ink a
 * `stroke()` lays down depends on the `lineWidth` assigned some lines earlier and on the path
 * built by the `moveTo`/`lineTo` pairs before it. So this one keeps the state the log merely
 * records, and emits one {@link InkExtent} per mark instead of one line per call.
 *
 * **`roundRect` and `arcTo` are present here and absent from `mockCtx`, deliberately.** Every
 * rounded bar, ring and elbow in the painter is guarded on those two being callable
 * (`beginRoundedRect`, `drawRoundedPolyline`), so a context without them measures the square
 * fallback — the branch that never ships. ADR-0103 records a whole suite that could only ever
 * reach the fallback and therefore could not see what the product did.
 *
 * **Text is the one approximation, and it is deliberately generous.** jsdom has no font metrics,
 * so a glyph box is derived from the `px` size in the assigned `font` and the assigned
 * `textBaseline`, with ascent and descent taken at the loose end of what a real face uses. A
 * box that is too tall makes this gate report a containment failure that a real browser might
 * not — loud, and cheap to tighten. A box that is too short is the failure ADR-0110 D5 is about.
 * The gate that consumes this compares two paints differing only by a whole-lane shift, so the
 * approximation cancels exactly in the differential; it survives only in the containment
 * judgement itself, which is why it errs the way it does.
 */
export interface InkExtent {
  /** Which primitive laid it down — `fillRect`, `stroke`, `fillText`, … Carried for diagnosis. */
  readonly op: string;
  /** Topmost inked y, stroke half-width already added. */
  readonly top: number;
  /** Bottommost inked y, stroke half-width already added. */
  readonly bottom: number;
}

/** Ascent as a multiple of the font's px size — the loose end of what a real face uses. */
const TEXT_ASCENT = 0.9;
/** Descent as a multiple of the font's px size. */
const TEXT_DESCENT = 0.3;

function fontPx(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : 11;
}

/** The glyph box for `fillText(_, _, y)` under the assigned baseline. Generous — see the docblock. */
function textBox(
  y: number,
  font: string,
  baseline: CanvasTextBaseline,
): { top: number; bottom: number } {
  const px = fontPx(font);
  const a = px * TEXT_ASCENT;
  const d = px * TEXT_DESCENT;
  switch (baseline) {
    case 'middle':
      return { top: y - (a + d) / 2, bottom: y + (a + d) / 2 };
    case 'top':
    case 'hanging':
      return { top: y, bottom: y + a + d };
    case 'bottom':
    case 'ideographic':
      return { top: y - a - d, bottom: y };
    default: // 'alphabetic'
      return { top: y - a, bottom: y + d };
  }
}

/**
 * A {@link Ctx2D} that records an {@link InkExtent} for every mark.
 *
 * `measureText` matches `mockCtx`'s deterministic ~6px-per-glyph so label placement and
 * truncation resolve the same way here as in every other painter suite — a machine's real font
 * metrics would make what gets drawn depend on what is installed.
 */
export function inkRecordingCtx(): { ctx: Ctx2D; ink: InkExtent[] } {
  const ink: InkExtent[] = [];
  let pathTop = Number.POSITIVE_INFINITY;
  let pathBottom = Number.NEGATIVE_INFINITY;

  const extend = (...ys: number[]): void => {
    for (const y of ys) {
      if (y < pathTop) pathTop = y;
      if (y > pathBottom) pathBottom = y;
    }
  };
  const emit = (op: string, top: number, bottom: number): void => {
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
    ink.push({ op, top, bottom });
  };
  const flushPath = (op: string, halfStroke: number): void => {
    if (!Number.isFinite(pathTop)) return;
    emit(op, pathTop - halfStroke, pathBottom + halfStroke);
  };

  const ctx = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn((s: string) => ({ width: s.length * 6 }) as TextMetrics),

    fillRect: vi.fn((_x: number, y: number, _w: number, h: number) => {
      emit('fillRect', Math.min(y, y + h), Math.max(y, y + h));
    }),
    strokeRect: vi.fn((_x: number, y: number, _w: number, h: number) => {
      const half = ctx.lineWidth / 2;
      emit('strokeRect', Math.min(y, y + h) - half, Math.max(y, y + h) + half);
    }),
    fillText: vi.fn((_t: string, _x: number, y: number) => {
      const box = textBox(y, ctx.font, ctx.textBaseline);
      emit('fillText', box.top, box.bottom);
    }),

    beginPath: vi.fn(() => {
      pathTop = Number.POSITIVE_INFINITY;
      pathBottom = Number.NEGATIVE_INFINITY;
    }),
    moveTo: vi.fn((_x: number, y: number) => extend(y)),
    lineTo: vi.fn((_x: number, y: number) => extend(y)),
    roundRect: vi.fn((_x: number, y: number, _w: number, h: number) => extend(y, y + h)),
    // An `arcTo` corner is bounded by the two points it joins, both of which the painter has
    // already passed through `moveTo`/`lineTo`; recording its control points is enough.
    arcTo: vi.fn((_x1: number, y1: number, _x2: number, y2: number) => extend(y1, y2)),

    fill: vi.fn(() => flushPath('fill', 0)),
    stroke: vi.fn(() => flushPath('stroke', ctx.lineWidth / 2)),

    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };

  return { ctx, ink };
}
