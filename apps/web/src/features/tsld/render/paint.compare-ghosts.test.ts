import { beforeAll, describe, expect, it } from 'vitest';

import { paintScene, type CompareGhost, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

/**
 * **The ADR-0127 compare-overlay budget gate**, and one correctness claim no other suite can make.
 *
 * Counting stubs, not milliseconds — the ADR-0054 dates-gate method: a CI runner's absolute timings
 * are noise, so the assertion is about the SHAPE of the per-frame cost. Three claims:
 *
 * 1. **Absent ⇒ every counter identical.** The parity contract, structurally: the layer is skipped
 *    and the paint is byte-for-byte today's.
 * 2. **Cost tracks the ghosts, not the plan.** 2,000 activities with three ghosts costs three
 *    outlines, and nothing else multiplies — which would catch a ghost drawn inside the bar loop.
 * 3. **REMOVED work is drawn even though it is in no lane the cull knows about.** This is the one
 *    that is not about cost at all. Removed activities are not in `scene.activities`, so they are
 *    never in `visibleIds`; the milestone's own plan said to cull this layer by `visibleIds` first
 *    "as the ghost layer already does", and following that would have silently dropped exactly the
 *    rows the overlay exists to show — on every plan where nothing had been deleted, invisibly.
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
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

function ghost(o: Partial<CompareGhost> & { activityId: string }): CompareGhost {
  return {
    name: o.activityId,
    fromStart: '2026-01-01',
    fromFinish: '2026-01-05',
    laneIndex: 0,
    isMilestone: false,
    removed: false,
    ...o,
  };
}

function paint(compareGhosts?: readonly CompareGhost[]) {
  const ctx = countingCtx();
  const scene: TsldScene = {
    activities: ACTIVITIES,
    edges: [],
    dataDate: DATA_DATE,
    view: TOGGLES,
    ...(compareGhosts ? { compareGhosts } : {}),
  };
  paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
  return ctx.calls;
}

describe('the compare-overlay draw budget', () => {
  // **The label-width measurer is memoised across calls**, so the FIRST paint in a process counts
  // 120 `measureText` calls and every later one counts none. A parity assertion that does not know
  // that compares a cold run against a warm one and reports a difference the painter did not make.
  // Warming once here is what makes every comparison below a like-for-like one; it was found by
  // this suite's own first run, not by reading.
  beforeAll(() => {
    paint(undefined);
  });

  it('is byte-for-byte today’s paint when the overlay is off', () => {
    expect(paint(undefined)).toEqual(paint([]));
  });

  it('costs one outline per ghost, and multiplies nothing else', () => {
    const base = paint(undefined);
    const three = paint([
      ghost({ activityId: 'a0' }),
      ghost({ activityId: 'a1', laneIndex: 1 }),
      ghost({ activityId: 'a2', laneIndex: 2 }),
    ]);
    expect(three.strokeRect - base.strokeRect).toBe(3);
    // The layers that walk the plan are untouched — a ghost drawn inside the bar loop would show
    // here as thousands of extra calls rather than three.
    expect(three.fillText).toBe(base.fillText);
    expect(three.measureText).toBe(base.measureText);
    expect(three.fillRect).toBe(base.fillRect);
  });

  it('DRAWS removed work, which is in no visible-id set at all', () => {
    // `visibleIds` is derived from `scene.activities` (`paint-frame.ts`), and removed work is by
    // definition not there. Verified red against a `visibleIds.has(...)` cull: this goes to +0.
    const base = paint(undefined);
    const removed = paint([ghost({ activityId: 'not-in-the-plan-at-all', removed: true })]);
    expect(removed.strokeRect - base.strokeRect).toBe(1);
    // …and it is struck through — a SHAPE cue, so criticality is not carried by colour alone.
    expect(removed.stroke).toBeGreaterThan(base.stroke);
  });

  it('draws a milestone ghost as a diamond rather than a rectangle', () => {
    const base = paint(undefined);
    const m = paint([ghost({ activityId: 'a0', isMilestone: true })]);
    expect(m.strokeRect).toBe(base.strokeRect);
    expect(m.stroke).toBeGreaterThan(base.stroke);
  });
});
