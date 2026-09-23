import { describe, expect, it } from 'vitest';

import { CHEVRON_MAX_PER_LINK } from './link-marks';
import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';

/**
 * **The link language's draw budget** (NetPoint-layout M2, plan "new paint.link-marks-budget";
 * answers `docs/TECH_DEBT.md` #370 for this layer).
 *
 * A counting stub, so the assertions are about the SHAPE of the cost rather than a CI runner's
 * milliseconds (the ADR-0054 convention). What must hold at 2,000 activities and 4,000 links:
 *
 * 1. **Strokes and fills are per bucket, never per link.** Links are batched by ink and weight, so
 *    the number of `stroke()` and `fill()` calls is bounded by the number of buckets (four base,
 *    two highlight), each with at most one solid stroke, one dashed stroke and one fill.
 * 2. **Chevrons are capped per visible link**: at most `CHEVRON_MAX_PER_LINK` plus the terminal
 *    head, so the triangle count is bounded by the culled link set, whatever the zoom.
 */
const PALETTE = {
  canvasGround: '#111',
  gridLine: '#222',
  laneRule: '#333',
  edge: '#444',
  bar: '#555',
  linkMinor: '#666',
  linkDriving: '#777',
  critical: '#888',
  nearCritical: '#999',
  selection: '#aaa',
  outline: '#bbb',
  labelBeside: '#ccc',
  labelInside: '#ddd',
} as unknown as TsldPalette;

const SIZE = { width: 1920, height: 1080 };
const COUNT = 2000;
const LANES = 50;

function countingCtx() {
  const calls = { stroke: 0, fill: 0, fillTriangles: 0, measureText: 0 };
  let pendingMoves = 0;
  return {
    calls,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {
      pendingMoves = 0;
    },
    moveTo: () => {
      pendingMoves += 1;
    },
    lineTo: () => {},
    arc: () => {},
    stroke: () => {
      calls.stroke += 1;
      pendingMoves = 0;
    },
    fill: () => {
      calls.fill += 1;
      calls.fillTriangles += pendingMoves;
      pendingMoves = 0;
    },
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
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

/** 2,000 five-day bars over 50 lanes, each linked to two later bars — 4,000 links, half driving. */
function plan(): { activities: RenderActivity[]; edges: RenderEdge[] } {
  const activities = Array.from({ length: COUNT }, (_, i): RenderActivity => {
    const startDay = Math.floor(i / LANES) * 12;
    const day = (d: number): string =>
      new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    return {
      id: `a${i}`,
      type: 'TASK',
      laneIndex: i % LANES,
      label: `A${i}`,
      earlyStart: day(startDay),
      earlyFinish: day(startDay + 4),
      isCritical: i % 5 === 0,
      isNearCritical: i % 5 === 1,
    };
  });
  const edges: RenderEdge[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    for (const step of [LANES, LANES * 3 + 7]) {
      const j = i + step;
      if (j >= COUNT) continue;
      edges.push({
        id: `e${i}-${j}`,
        predecessorId: `a${i}`,
        successorId: `a${j}`,
        type: 'FS',
        isDriving: step === LANES,
        lagDays: i % 9 === 0 ? 2 : 0,
      });
    }
  }
  return { activities, edges };
}

function paint(pxPerDay: number, edges?: RenderEdge[]) {
  const ctx = countingCtx();
  const { activities, edges: all } = plan();
  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities,
    edges: edges ?? all,
    dataDate: '2026-01-01',
    view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: false, dayGrid: false, monthGrid: false },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return ctx.calls;
}

describe('the link language — draw budget at 2,000 activities / 4,000 links (NetPoint-layout M2)', () => {
  it('strokes and fills per bucket, never per link', () => {
    const none = paint(12, []);
    const all = paint(12);
    // Six buckets at most (four base, two highlight), each one solid stroke, one dashed stroke and
    // one fill. A per-link implementation would add thousands.
    expect(all.stroke - none.stroke).toBeLessThanOrEqual(6 * 2);
    expect(all.fill - none.fill).toBeLessThanOrEqual(6);
  });

  it('caps the triangles by the visible links, whatever the zoom', () => {
    for (const pxPerDay of [2, 12, 40]) {
      const none = paint(pxPerDay, []);
      const all = paint(pxPerDay);
      const triangles = all.fillTriangles - none.fillTriangles;
      expect(triangles).toBeGreaterThan(0);
      // Every link at most CHEVRON_MAX_PER_LINK chevrons and one head, and never more links than
      // the plan holds; at a working zoom the cull keeps it far below that.
      expect(triangles).toBeLessThanOrEqual(plan().edges.length * (CHEVRON_MAX_PER_LINK + 1));
    }
  });
});
