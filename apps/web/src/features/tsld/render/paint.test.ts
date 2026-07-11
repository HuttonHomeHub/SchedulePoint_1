import { describe, expect, it, vi } from 'vitest';

import { paintInteractionLayer, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

const PALETTE: TsldPalette = {
  gridLine: '#111',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
};
const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';

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
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
}

function task(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 't',
    type: 'TASK',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

describe('paintScene', () => {
  it('clears, applies the DPR transform, and draws a task bar with a fillRect', () => {
    const ctx = mockCtx();
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    const visible = paintScene(ctx, scene, VIEW, SIZE, PALETTE, 2);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(visible).toEqual(['t']);
  });

  it('draws a milestone as a filled diamond path, not a rect', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02' })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('strokes dependency edges when an endpoint is visible', () => {
    const ctx = mockCtx();
    const pred = task({
      id: 'p',
      earlyStart: '2026-01-02',
      earlyFinish: '2026-01-03',
      laneIndex: 0,
    });
    const succ = task({
      id: 's',
      earlyStart: '2026-01-08',
      earlyFinish: '2026-01-09',
      laneIndex: 1,
    });
    const scene: TsldScene = {
      activities: [pred, succ],
      edges: [{ predecessorId: 'p', successorId: 's' }],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The edge layer moves/lines to route the polyline and strokes it.
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('outlines a critical bar with a non-colour cue (solid dash pattern)', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ isCritical: true })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The bar is filled and then outlined, and the dash is reset afterwards.
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]); // solid for critical
  });

  it('outlines a near-critical bar with a dashed pattern', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ isNearCritical: true })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([3, 2]);
  });

  it('does not outline a non-critical bar', () => {
    const ctx = mockCtx();
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.setLineDash).not.toHaveBeenCalled();
  });

  it('draws a selection ring on the selected activity', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ id: 't' })],
      edges: [],
      dataDate: DATA_DATE,
      selectedId: 't',
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('culls off-screen activities (no fillRect, not in the visible set)', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ id: 'far', earlyStart: '2027-06-01', earlyFinish: '2027-06-02' })],
      edges: [],
      dataDate: DATA_DATE,
    };
    const visible = paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(visible).toEqual([]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe('paintInteractionLayer', () => {
  const GHOST = { x: 10, y: 10, w: 40, h: 18 };

  it('clears and draws a live ghost with a fill + solid outline', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { live: GHOST }, SIZE, PALETTE, 2);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('draws a pending ghost as a dashed outline with no fill', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { pending: GHOST }, SIZE, PALETTE);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws a link rubber-band line, and rings the drop target when present', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: GHOST } },
      SIZE,
      PALETTE,
    );
    // A dashed line from anchor to pointer…
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 5);
    expect(ctx.lineTo).toHaveBeenCalledWith(90, 60);
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 3]);
    expect(ctx.stroke).toHaveBeenCalled();
    // …and a highlight ring around the valid target.
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('draws the link line but no target ring when over empty space', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: null } },
      SIZE,
      PALETTE,
    );
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('clears to nothing when idle (empty overlay)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, {}, SIZE, PALETTE);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});
