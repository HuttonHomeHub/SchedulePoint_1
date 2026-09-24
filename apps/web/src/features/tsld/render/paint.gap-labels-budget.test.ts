import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';

/**
 * **FC-G7's gap-label budget, counted** (NetPoint grammar M6 gate pass). The spec commits to "gap
 * labels ≤ visible links", and until this file only their correctness was asserted (FC-G5's zero
 * collisions). Each label is placed only where it meets no text already drawn, so its cost is the
 * number of labels times the text boxes placed before it: both must be bounded by what is on
 * screen, never by the size of the plan.
 *
 * So the same plan is painted twice at the same viewport: once at 2,000 activities, and once grown
 * to four times that by adding work past the right edge of the screen. A layer whose work followed
 * the plan would draw or test more in the second frame; one bounded by the culled set draws the
 * same labels and the same text in both. A counting stub (the ADR-0054 convention): shapes of cost,
 * never a runner's milliseconds.
 */
const PALETTE = {
  canvasGround: '#111',
  gridLine: '#222',
  laneRule: '#333',
  edge: '#444',
  bar: '#555',
  nodeRim: '#555',
  nodeRimNear: '#999',
  nodeRimCritical: '#888',
  linkMinor: '#666',
  linkDriving: '#777',
  linkMark: '#3d2070',
  attachDot: '#3d2071',
  critical: '#888',
  nearCritical: '#999',
  selection: '#aaa',
  outline: '#bbb',
  labelBeside: '#ccc',
  labelInside: '#ddd',
} as unknown as TsldPalette;

const SIZE = { width: 1920, height: 1080 };
const LANES = 50;

function countingCtx() {
  const calls = { gapLabels: 0, text: 0 };
  const ctx = {
    calls,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    stroke: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {
      calls.text += 1;
      if (ctx.fillStyle === PALETTE.linkMark) calls.gapLabels += 1;
    },
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '' as string,
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
  return ctx;
}

const day = (d: number): string => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);

/** `count` five-day bars in columns of fifty lanes, each tied to two later bars; the later tie waits. */
function plan(count: number): { activities: RenderActivity[]; edges: RenderEdge[] } {
  const activities = Array.from({ length: count }, (_, i): RenderActivity => {
    const startDay = Math.floor(i / LANES) * 12;
    return {
      id: `a${i}`,
      type: 'TASK',
      laneIndex: i % LANES,
      label: `A${i}`,
      earlyStart: day(startDay),
      earlyFinish: day(startDay + 4),
      isCritical: false,
      isNearCritical: false,
    };
  });
  const edges: RenderEdge[] = [];
  for (let i = 0; i < count; i += 1) {
    for (const step of [LANES, LANES * 3 + 7]) {
      const j = i + step;
      if (j >= count) continue;
      edges.push({
        id: `e${i}-${j}`,
        predecessorId: `a${i}`,
        successorId: `a${j}`,
        type: 'FS',
        isDriving: step === LANES,
      });
    }
  }
  return { activities, edges };
}

function paint(count: number, only?: (e: RenderEdge) => boolean) {
  const ctx = countingCtx();
  const { activities, edges: all } = plan(count);
  const edges = only ? all.filter(only) : all;
  // 12 px a day over 1,920 px is 160 days, i.e. the first 14 columns of any plan below.
  const view: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: '2026-01-01',
    view: { ...DEFAULT_VIEW_TOGGLES, labels: true, linkSlack: true },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return { calls: ctx.calls, edges };
}

describe('gap labels — draw budget at 2,000 activities / 4,000 links (NetPoint grammar FC-G7)', () => {
  it('draws gap labels, so the budget below is about real work', () => {
    expect(paint(2000).calls.gapLabels).toBeGreaterThan(0);
  });

  it('draws no more gap labels than there are waiting links on screen', () => {
    const { calls, edges } = paint(2000);
    // A waiting link can be labelled only if one of its ends is on screen: columns 0..13.
    const onScreen = (id: string): boolean => Math.floor(Number(id.slice(1)) / LANES) <= 13;
    const waitingOnScreen = edges.filter(
      (e) => !e.isDriving && (onScreen(e.predecessorId) || onScreen(e.successorId)),
    ).length;
    // A ceiling, and a loose one: measured, 308 labels against 700 waiting links touching the
    // screen, because a link with one end off screen rarely has its gap in view. The limb below is
    // the one that discriminates.
    expect(calls.gapLabels).toBeLessThanOrEqual(waitingOnScreen);
  });

  it('labels only waiting links: a plan of driving links draws none', () => {
    // Checked red: labelling driving links too (dropping `!edge.isDriving`) still passes the
    // ceiling above, at 700, and fails here.
    expect(paint(2000, (e) => e.isDriving).calls.gapLabels).toBe(0);
  });

  it('draws and tests the same text however much of the plan lies off screen', () => {
    const small = paint(2000).calls;
    const large = paint(8000).calls;
    // Labels, and the text each is placed against, follow the viewport and not the plan: so the
    // placement scan (labels × text already placed) is the same in both frames. What this cannot
    // see is a label collected for an off-screen link, and it does not need to: such a gap has no
    // stretch on screen to sit on, so `gapLabelAt` returns before any text is scanned. Giving
    // every culled link a fake on-screen line was tried, and changed nothing counted here.
    expect(large.gapLabels).toBe(small.gapLabels);
    expect(large.text).toBe(small.text);
  });
});
