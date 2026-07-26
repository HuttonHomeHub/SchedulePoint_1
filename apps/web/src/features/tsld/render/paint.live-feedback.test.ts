import { describe, expect, it, vi } from 'vitest';

import { paintInteractionLayer, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Rect, Viewport } from './render-model';

/**
 * Canvas **live feedback** painter tests (ADR-0054 §1, `VITE_CANVAS_LIVE_FEEDBACK`) — the ghost
 * carrying the dragged bar's own detail, and the source bar receding while it does.
 *
 * The parity assertions matter as much as the feature ones: with `ghost`/`gestureSourceId` absent
 * (the flag-off path never writes either) every draw call must be exactly what ADR-0052 produced,
 * which is the epic's rollback contract.
 */
const PALETTE: TsldPalette = {
  gridLine: '#111',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  conflict: '#fa0',
  laneOverlap: '#fa0',
  labelInside: '#fff',
  labelInsideCritical: '#fff',
  labelInsideNearCritical: '#000',
  labelBeside: '#eee',
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
};

const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';
const GHOST: Rect = { x: 100, y: 50, w: 160, h: 18 };

function mockCtx() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((s: string) => ({ width: s.length * 6 }) as TextMetrics),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
}

function task(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 't',
    type: 'TASK',
    laneIndex: 0,
    label: 'A100 Excavate · 4d',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

/** The alphas the bar layer set, in call order — `globalAlpha` is mutated, so record it live. */
function recordAlphas(ctx: ReturnType<typeof mockCtx>): number[] {
  const seen: number[] = [];
  let value = 1;
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => value,
    set: (next: number) => {
      value = next;
      seen.push(next);
    },
  });
  return seen;
}

describe('gesture source dimming (ADR-0054 §1)', () => {
  it('paints the dragged bar at a lower alpha than an undragged one', () => {
    const plain = mockCtx();
    const plainAlphas = recordAlphas(plain);
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(plain, scene, VIEW, SIZE, PALETTE, 1);

    const dragged = mockCtx();
    const draggedAlphas = recordAlphas(dragged);
    paintScene(dragged, { ...scene, gestureSourceId: 't' }, VIEW, SIZE, PALETTE, 1);

    const lowest = (xs: number[]): number => Math.min(...xs);
    expect(lowest(draggedAlphas)).toBeLessThan(lowest(plainAlphas));
  });

  it('leaves every other bar untouched — only the dragged id recedes', () => {
    const ctx = mockCtx();
    const alphas = recordAlphas(ctx);
    const scene: TsldScene = {
      activities: [task({ id: 'a' }), task({ id: 'b', laneIndex: 1 })],
      edges: [],
      dataDate: DATA_DATE,
      gestureSourceId: 'a',
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
    // Exactly one bar received the gesture-source alpha; the other stayed at full strength.
    const reduced = alphas.filter((a) => a < 1 && a !== 0.3);
    expect(reduced.length).toBeGreaterThan(0);
    expect(new Set(reduced).size).toBe(1);
  });

  it('is a no-op without a gestureSourceId — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    const base: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(withField, { ...base, gestureSourceId: null }, VIEW, SIZE, PALETTE, 1);
    paintScene(withoutField, base, VIEW, SIZE, PALETTE, 1);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.strokeRect.mock.calls).toEqual(withoutField.strokeRect.mock.calls);
  });
});

describe('ghost fidelity (ADR-0054 §1)', () => {
  it('draws the dragged bar’s label inside the ghost', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { live: GHOST, visualRefresh: true, ghost: { label: 'A100 Excavate · 4d' } },
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      'A100 Excavate · 4d',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('draws a progress band when the dragged bar has progress', () => {
    const bare = mockCtx();
    paintInteractionLayer(
      bare,
      { live: GHOST, visualRefresh: true, ghost: { label: 'x' } },
      SIZE,
      PALETTE,
    );
    const withProgress = mockCtx();
    paintInteractionLayer(
      withProgress,
      { live: GHOST, visualRefresh: true, ghost: { label: 'x', percentComplete: 50 } },
      SIZE,
      PALETTE,
    );
    expect(withProgress.fillRect.mock.calls.length).toBeGreaterThan(
      bare.fillRect.mock.calls.length,
    );
  });

  it('ghosts a milestone as a diamond path, never a rounded bar', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { live: GHOST, visualRefresh: true, ghost: { label: 'M1', milestone: true } },
      SIZE,
      PALETTE,
    );
    // The diamond is 4 lineTo segments from a moveTo; a bar ghost strokes rects instead.
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    // A milestone has no room for an inside label, so none is drawn.
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('is a no-op without ghost detail — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    paintInteractionLayer(
      withField,
      { live: GHOST, visualRefresh: true, ghost: null },
      SIZE,
      PALETTE,
    );
    paintInteractionLayer(withoutField, { live: GHOST, visualRefresh: true }, SIZE, PALETTE);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.strokeRect.mock.calls).toEqual(withoutField.strokeRect.mock.calls);
    expect(withField.fillText).not.toHaveBeenCalled();
  });

  it('applies the same detail to a resize ghost, so both gestures read alike', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      {
        resize: { rect: GHOST, label: '7d' },
        visualRefresh: true,
        ghost: { label: 'A100 Excavate · 4d' },
      },
      SIZE,
      PALETTE,
    );
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('A100 Excavate · 4d'); // the ghost's own identity
    expect(texts).toContain('7d'); // the ADR-0052 duration readout, unchanged
  });
});

describe('cursor date readout (ADR-0054 §2)', () => {
  it('draws a full-height guideline at the chosen day plus a chip stating its date', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { cursor: { x: 240, label: 'Fri 2 Jan' } }, SIZE, PALETTE);
    // The guideline spans the surface at the day boundary…
    expect(ctx.moveTo).toHaveBeenCalledWith(240.5, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(240.5, SIZE.height);
    // …and the chip states the date.
    expect(ctx.fillText).toHaveBeenCalledWith('Fri 2 Jan', expect.any(Number), expect.any(Number));
  });

  it('keeps the chip on-surface at either edge rather than letting it run off', () => {
    const left = mockCtx();
    paintInteractionLayer(left, { cursor: { x: 0, label: 'Thu 1 Jan' } }, SIZE, PALETTE);
    const right = mockCtx();
    paintInteractionLayer(right, { cursor: { x: SIZE.width, label: 'Thu 1 Jan' } }, SIZE, PALETTE);
    const chipX = (ctx: ReturnType<typeof mockCtx>): number => ctx.fillRect.mock.calls[0]![0]!;
    const chipW = (ctx: ReturnType<typeof mockCtx>): number => ctx.fillRect.mock.calls[0]![2]!;
    expect(chipX(left)).toBeGreaterThanOrEqual(0);
    expect(chipX(right) + chipW(right)).toBeLessThanOrEqual(SIZE.width);
  });

  it('is a no-op without a cursor — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    paintInteractionLayer(withField, { live: GHOST, cursor: null }, SIZE, PALETTE);
    paintInteractionLayer(withoutField, { live: GHOST }, SIZE, PALETTE);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.moveTo.mock.calls).toEqual(withoutField.moveTo.mock.calls);
    expect(withField.fillText).not.toHaveBeenCalled();
  });
});
