import { afterEach, describe, expect, it, vi } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';

/**
 * The per-frame rect-cache gate (docs/specs/canvas-paint-loop-fixes/plan.md, Finding B).
 *
 * These are SHAPE assertions, not millisecond budgets — a CI runner's absolute timings are noise
 * (the ADR-0054 counting-stub convention). What is pinned:
 *
 * 1. An activity's rect is computed once per frame no matter how many edges consume it. Before
 *    the cache, every incident edge re-derived both endpoint rects (each a `daysBetween` pair,
 *    each of those two `Date.parse` calls), so the parse count scaled with the activity×edge
 *    product; a hub bar paid it once per incident tie. Asserted as: adding edges to an otherwise
 *    identical scene adds ZERO `Date.parse` calls.
 * 2. The cache lives for exactly one `paintScene` call. It is keyed by activity id and valid only
 *    for that call's `(view, dataDate)`, so hoisting it to module scope (the tempting "make it a
 *    WeakMap like `edgeFanOuts`" move) would serve stale geometry mid-pan. Asserted through the
 *    public return value: the same activities array culls differently under a moved viewport.
 */

const PALETTE = {
  background: '#fff',
  bar: '#888',
  barCritical: '#c00',
  barText: '#fff',
  edge: '#666',
  edgeCritical: '#c00',
  grid: '#eee',
  gridMonth: '#ddd',
  gridYear: '#ccc',
  monthBand: '#f5f5f5',
  label: '#333',
  nonWorking: '#f0f0f0',
  today: '#c00',
  selection: '#06c',
  conflict: '#c60',
  dimmed: '#999',
} as unknown as TsldPalette;

const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';

function task(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 't',
    name: 'Task',
    type: 'TASK',
    laneIndex: 0,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    isCritical: false,
    ...overrides,
  } as RenderActivity;
}

/** The minimal 2D-context stand-in the painter accepts; every method is an inert spy. */
function stubCtx(): Parameters<typeof paintScene>[0] {
  const gradient = { addColorStop: vi.fn() };
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'canvas') return { width: SIZE.width, height: SIZE.height };
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createPattern') return () => gradient;
        if (prop === 'getLineDash') return () => [];
        return vi.fn();
      },
      set: () => true,
    },
  ) as Parameters<typeof paintScene>[0];
}

const isWorkingDay = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
const quiet = {
  dayGrid: false,
  monthGrid: false,
  yearGrid: false,
  today: false,
  nonWorking: false,
  labels: false,
  lateOverlay: false,
} as const;

/** A hub: `p` feeds every successor, so p's rect is an endpoint of every edge. All zero-lag —
 * `lagAnchorPoints` walks its own `daysBetween` pair for a non-zero lag regardless of the rect
 * cache, which is real per-edge work this gate deliberately does not count. */
function hubScene(edgeCount: number): TsldScene {
  const successors = Array.from({ length: 8 }, (_, i) => task({ id: `s${i}`, laneIndex: i + 1 }));
  const edges: RenderEdge[] = Array.from({ length: edgeCount }, (_, i) => ({
    id: `e${i}`,
    predecessorId: 'p',
    successorId: `s${i % successors.length}`,
    type: 'FS',
    isDriving: false,
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
  }));
  return {
    activities: [task({ id: 'p', laneIndex: 0 }), ...successors],
    edges,
    dataDate: DATA_DATE,
    view: quiet,
    isWorkingDay,
    timeTrueLinks: true,
    visualRefresh: true,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('paintScene — per-frame rect cache (call-count gate)', () => {
  it('date parsing does not scale with edge count — a rect is computed once per frame', () => {
    // Two scenes, identical activities, 4 vs 24 edges into the same hub. The painter's date
    // parsing must cost the same for both: every extra edge reads the cached endpoint rects.
    const spy = vi.spyOn(Date, 'parse');

    paintScene(stubCtx(), hubScene(4), VIEW, SIZE, PALETTE);
    const sparse = spy.mock.calls.length;

    spy.mockClear();
    paintScene(stubCtx(), hubScene(24), VIEW, SIZE, PALETTE);
    const dense = spy.mock.calls.length;

    expect(sparse).toBeGreaterThan(0); // the spy is actually observing the paint
    expect(dense).toBe(sparse);
  });

  it('the cache is per-call: the same activities array culls afresh under a moved viewport', () => {
    // The regression this pins is hoisting the rect cache to module/array-identity scope. A rect
    // depends on the viewport; a cross-frame cache would keep serving the old geometry, so a pan
    // to empty ground would still "see" the bars. Observed via the public return value.
    const scene = hubScene(4);
    const visible = paintScene(stubCtx(), scene, VIEW, SIZE, PALETTE);
    expect(visible.length).toBeGreaterThan(0);

    const farAway: Viewport = { ...VIEW, originX: VIEW.originX - 1_000_000 };
    const afterPan = paintScene(stubCtx(), scene, farAway, SIZE, PALETTE);
    expect(afterPan).toEqual([]);
  });
});
