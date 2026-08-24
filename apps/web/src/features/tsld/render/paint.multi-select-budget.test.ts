import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The M2-T5 gate** (`docs/specs/canvas-multi-select/`). A plural selection adds a ring per
 * selected bar to the tightest loop in the app, and it does so on a painter already measured at
 * 4–6× its stated budget (ADR-0065, `docs/TECH_DEBT.md` #75) — so the cost is pinned rather than
 * assumed.
 *
 * Counting stubs, not milliseconds: the assertion is about the **shape** of the cost, because a CI
 * runner's absolute timings are noise (the ADR-0054 dates-gate precedent). The three claims are:
 *
 * 1. rings cost exactly `|selected ∩ visible|` — a selection off screen costs nothing, so the
 *    ring loop is bounded by the viewport and not by the size of the set;
 * 2. **no other layer multiplies** — with 2,000 activities all selected, bars, labels, gridlines
 *    and text are call-for-call what they were with nothing selected. This is the one that would
 *    catch a ring drawn inside the bar loop, or a `selectedIds.includes()` per bar (O(n²), which
 *    at 2,000 is four million comparisons and would never show up in a functional test);
 * 3. `selectedIds` absent ⇒ every counter identical — the flag-off parity claim, structurally.
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  todayInk: '#fff',
  dataDate: '#dd1',
  dataDateInk: '#dd2',
  conflict: '#fa0',
  laneOverlap: '#fa0',
  labelInside: '#fff',
  labelInsideCritical: '#fff',
  labelInsideNearCritical: '#000',
  labelBeside: '#eee',
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
  monthBand: '#f4f1ea',
};

const SIZE = { width: 1920, height: 1080 };
const DATA_DATE = '2026-01-01';
const COUNT = 2000;
const VIEW: Viewport = { pxPerDay: 40, originX: 0, originY: 0 };

function countingCtx() {
  const calls = { fillText: 0, measureText: 0, fillRect: 0, strokeRect: 0, stroke: 0 };
  return {
    calls,
    clearRect: () => {},
    fillRect: () => {
      calls.fillRect += 1;
    },
    strokeRect: () => {
      calls.strokeRect += 1;
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {
      calls.stroke += 1;
    },
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {
      calls.fillText += 1;
    },
    measureText: (s: string) => {
      calls.measureText += 1;
      return { width: s.length * 6 } as TextMetrics;
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
}

/** 2,000 activities across 50 lanes; the first 50 start on day 0, so lane 0..49 is on screen. */
function bigPlan(): RenderActivity[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const startDay = Math.floor(i / 50) * 20;
    const start = new Date(Date.UTC(2026, 0, 1 + startDay)).toISOString().slice(0, 10);
    const finish = new Date(Date.UTC(2026, 0, 1 + startDay + 4)).toISOString().slice(0, 10);
    return {
      id: `a${i}`,
      type: 'TASK' as const,
      laneIndex: i % 50,
      label: `A${i} Activity ${i} · 5d`,
      earlyStart: start,
      earlyFinish: finish,
      isCritical: i % 7 === 0,
      isNearCritical: false,
    };
  });
}

const ACTIVITIES = bigPlan();

const TOGGLES = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
} as const;

function paint(selectedIds?: readonly string[], selectedId?: string) {
  const ctx = countingCtx();
  const scene: TsldScene = {
    activities: ACTIVITIES,
    edges: [],
    dataDate: DATA_DATE,
    view: TOGGLES,
    ...(selectedIds ? { selectedIds } : {}),
    ...(selectedId ? { selectedId } : {}),
  };
  paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
  return ctx.calls;
}

/**
 * Which ids the painter can actually see at `VIEW`.
 *
 * Derived by measuring rather than reasoned about: the culling rule is the painter's, and a
 * hand-computed "the first 50 are on screen" would silently stop being true the day the fixture,
 * the lane height or the viewport changed — and the test would still pass, measuring nothing.
 */
function visibleCount(): number {
  const base = paint();
  let n = 0;
  for (const a of ACTIVITIES) {
    const one = paint([a.id]);
    if (one.strokeRect + one.stroke > base.strokeRect + base.stroke) n += 1;
  }
  return n;
}

// 30s, not the 5s default: each case paints a 2,000-activity scene through the real painter against
// a counting stub, which takes ~4s alone and more when the suite runs in parallel with the rest of
// the file set. It timed out in the full run and passed on its own — a flake, and a flake in a
// budget gate is how a budget gate gets deleted rather than fixed (ADR-0058).
describe('plural selection — draw-budget gate at 2,000 activities', { timeout: 30_000 }, () => {
  it('costs exactly one ring per VISIBLE selected bar, and nothing for the rest', () => {
    // Warm the label-measurement memo: it is module-level and shared across paints, so whichever
    // run goes first pays every `measureText` and a cold-vs-warm comparison would report a
    // difference that has nothing to do with selection.
    paint();
    const none = paint();
    const visible = visibleCount();
    expect(visible).toBeGreaterThan(0); // the fixture would otherwise measure nothing

    const all = paint(ACTIVITIES.map((a) => a.id));
    const rings = all.strokeRect + all.stroke - (none.strokeRect + none.stroke);
    expect(rings).toBe(visible);
  });

  it('does not multiply any other layer — bars, labels and grid are call-for-call unchanged', () => {
    paint();
    const none = paint();
    const all = paint(ACTIVITIES.map((a) => a.id));
    // The ring layer strokes; it must not fill, and it must not put one more glyph on screen.
    expect(all.fillRect).toBe(none.fillRect);
    expect(all.fillText).toBe(none.fillText);
    expect(all.measureText).toBe(none.measureText);
  });

  it('draws no secondary ring for the primary — one bar is ringed once, not twice', () => {
    paint();
    const primaryOnly = paint(undefined, 'a0');
    const both = paint(['a0'], 'a0');
    // `selectedIds` containing only the primary adds nothing: the loop skips `scene.selectedId`,
    // so the heavier 2px ring is not overdrawn by a 1px one at the same rectangle.
    expect(both.strokeRect + both.stroke).toBe(primaryOnly.strokeRect + primaryOnly.stroke);
  });

  it('costs exactly nothing when `selectedIds` is absent — the parity claim, structurally', () => {
    paint();
    const first = paint();
    const second = paint();
    expect(first).toEqual(second);
    // …and a scene that never heard of the field paints identically to one told about an empty
    // set, which is what "flag-off is byte-for-byte" has to mean at the painter.
    expect(paint([])).toEqual(first);
  });
});
