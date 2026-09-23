import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The centre item's draw budget** (NetPoint-layout M1, plan M1 "C gets its own budget case").
 *
 * `paint.dates-budget.test.ts` is the precedent and its reasoning holds here: a counting stub, so
 * the assertion is about the **shape** of the cost rather than a CI runner's milliseconds. The
 * centre layer is measured as a difference — the same scene painted with and without
 * `durationDays` — because `Labels` also governs the name layer, and toggling it would budget two
 * layers at once and attribute both to this one.
 */
const PALETTE = {
  canvasGround: '#111',
  gridLine: '#111',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  labelInside: '#fff',
  labelBeside: '#eee',
} as unknown as TsldPalette;

const SIZE = { width: 1920, height: 1080 };
const COUNT = 2000;
/** The distinct centre strings the plan below can produce: `5d`, and `5d · Nd float left` for ten N. */
const VOCABULARY = 11;

function countingCtx() {
  const calls = { fillText: 0, measureText: 0 };
  return {
    calls,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    closePath: () => {},
    stroke: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
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

/** 2,000 five-day bars over 50 lanes with room between them, as the dates budget uses. */
function bigPlan(withDuration: boolean): RenderActivity[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const startDay = Math.floor(i / 50) * 20;
    const start = new Date(Date.UTC(2026, 0, 1 + startDay)).toISOString().slice(0, 10);
    const finish = new Date(Date.UTC(2026, 0, 1 + startDay + 4)).toISOString().slice(0, 10);
    return {
      id: `a${i}`,
      type: 'TASK' as const,
      laneIndex: i % 50,
      label: `A${i} Activity ${i}`,
      earlyStart: start,
      earlyFinish: finish,
      isCritical: i % 7 === 0,
      isNearCritical: false,
      remainingFloat: i % 10,
      ...(withDuration ? { durationDays: 5 } : {}),
    };
  });
}

function paint(withDuration: boolean, pxPerDay: number) {
  const ctx = countingCtx();
  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities: bigPlan(withDuration),
    edges: [],
    dataDate: '2026-01-01',
    view: {
      dayGrid: true,
      monthGrid: true,
      yearGrid: true,
      today: true,
      nonWorking: true,
      labels: true,
      lateOverlay: false,
      dates: false,
    },
  };
  paintScene(ctx as unknown as CanvasRenderingContext2D, scene, view, SIZE, PALETTE, 1);
  return ctx.calls;
}

describe('the centre item — draw budget at 2,000 activities (NetPoint-layout M1)', () => {
  it('adds at most one text draw per VISIBLE bar, never per activity', () => {
    const off = paint(false, 30);
    const on = paint(true, 30);
    const added = on.fillText - off.fillText;
    expect(added).toBeGreaterThan(0); // the layer actually draws
    // A 1,080 px frame at pitch 60 shows about seventeen lanes, so the culled majority is the point.
    expect(added).toBeLessThan(COUNT / 4);
  });

  it('measures each distinct string at most once, never once per bar', () => {
    const off = paint(false, 30);
    const on = paint(true, 30);
    expect(on.measureText - off.measureText).toBeLessThanOrEqual(2 * VOCABULARY);
  });
});
