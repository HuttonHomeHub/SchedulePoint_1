import { describe, expect, it } from 'vitest';

import type { RenderActivity } from './geometry';
import { buildMinimapBitmap, type MinimapPalette } from './minimap';

/**
 * **The minimap draw-budget gate** (M1-T3) — the counting-stub method of
 * `paint.wbs-band-budget.test.ts` / the ADR-0054 dates gate: the assertion is about the
 * **shape** of the cost, not a millisecond count, because a CI runner's absolute timings
 * are noise.
 *
 * The shape: one build is O(activities) fills with **zero text work** (no
 * `fillText`/`measureText` — nothing is legible at this scale, so measuring would be pure
 * waste), **zero per-bar strokes** (`strokeRect`), and `fillStyle` batched into exactly
 * **two bar passes** (non-critical, then critical) plus the ground and the data-date line —
 * never a per-bar style write, which is the classic way a canvas loop goes quadratic-ish
 * in state churn.
 *
 * **What this gate structurally cannot catch:** a per-FRAME rebuild regression. This test
 * calls the build once and counts; nothing here fails if the host wires the build into the
 * frame loop. That is M2's spy test (`a scene-change spy records zero builds on selection
 * change / rectangle movement`), and this docblock says so, so a green run here is not read
 * as covering it.
 */
const PALETTE: MinimapPalette = {
  ground: '#0f1218',
  bar: '#3b6fbf',
  critical: '#e05d44',
  dataDate: '#e6e8ee',
};
const BOX = { width: 200, height: 120 };
const DATA_DATE = '2026-01-01';

function countingCtx() {
  const calls = { fillRect: 0, fillText: 0, measureText: 0, strokeRect: 0, styleWrites: 0 };
  let fillStyle = '';
  const ctx = {
    setTransform: () => {},
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
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    fillText: () => {
      calls.fillText += 1;
    },
    measureText: () => {
      calls.measureText += 1;
      return { width: 0 } as TextMetrics;
    },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string | CanvasGradient | CanvasPattern) {
      calls.styleWrites += 1;
      fillStyle = typeof v === 'string' ? v : '[object]';
    },
  };
  return { calls, ctx };
}

function plan(count: number): RenderActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    type: 'TASK' as const,
    laneIndex: i % 200,
    label: `a${i}`,
    earlyStart: i === 0 ? '2026-01-01' : '2026-01-05',
    earlyFinish: '2026-03-01',
    isCritical: i % 3 === 0,
    isNearCritical: false,
  }));
}

describe('minimap draw budget', () => {
  it('2,000 activities: O(n) fills, zero text work, zero per-bar strokes', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, plan(2000), DATA_DATE, BOX, PALETTE);
    // ground + one fill per placed bar + the data-date line (first bar anchors day 0 in span)
    expect(calls.fillRect).toBe(1 + 2000 + 1);
    expect(calls.fillText).toBe(0);
    expect(calls.measureText).toBe(0);
    expect(calls.strokeRect).toBe(0);
  });

  it('fillStyle is batched: ground + two bar passes + data-date = 4 writes, regardless of n', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, plan(2000), DATA_DATE, BOX, PALETTE);
    expect(calls.styleWrites).toBe(4);
  });

  it('the empty plan costs one ground fill and nothing else', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, [], DATA_DATE, BOX, PALETTE);
    expect(calls.fillRect).toBe(1);
    expect(calls.styleWrites).toBe(1);
  });
});
